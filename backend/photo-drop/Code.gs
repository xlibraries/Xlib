/**
 * Photo Drop — receives photos/videos from the website's hidden uploader and saves them
 * to the owner's Google Photos, in an album this script creates.
 *
 * Runs as a Google Apps Script web app ("Execute as: Me"), so uploads use the owner's
 * account and storage. Setup steps: see README.md next to this file.
 *
 * Files arrive in base64 chunks and are forwarded to the Photos Library API's resumable
 * upload, so large videos work despite Apps Script's request size limits.
 */

const PHOTOS_API = 'https://photoslibrary.googleapis.com/v1';
const SESSION_TTL = 6 * 60 * 60; // seconds (CacheService maximum)

// Script properties (Project Settings → Script properties). Only PASSCODE is required.
const DEFAULTS = {
  ALBUM_TITLE: 'Website Uploads',
  MAX_FILE_MB: '4096',
};

function doGet() {
  return reply({ ok: true, service: 'photo-drop' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ error: 'Bad request', fatal: true });
  }

  try {
    if (!checkPasscode(req.passcode)) return reply({ error: 'Wrong passcode', code: 'passcode', fatal: true });

    switch (req.action) {
      case 'check':
        return reply({ ok: true, maxFileMb: Number(prop('MAX_FILE_MB')) });
      case 'start':
        return reply(startUpload(req));
      case 'chunk':
        return reply(uploadChunk(req));
      case 'status':
        return reply(uploadStatus(req));
      default:
        return reply({ error: 'Unknown action', fatal: true });
    }
  } catch (err) {
    return reply({ error: String(err.message || err), fatal: !!err.fatal });
  }
}

/** Run once from the editor: grants permissions and creates the album. */
function setup() {
  if (!prop('PASSCODE')) throw new Error('Add a PASSCODE script property first (Project Settings → Script properties).');
  Logger.log('Album ready: ' + prop('ALBUM_TITLE') + ' (' + getAlbumId() + ')');
}

// ---------- Upload flow ----------

function startUpload(req) {
  const mimeType = String(req.mimeType || '');
  const size = Number(req.size);
  if (!/^(image|video)\//.test(mimeType)) throw fatal('Only photos and videos can be uploaded.');
  if (!(size > 0)) throw fatal('The file is empty.');
  if (size > Number(prop('MAX_FILE_MB')) * 1024 * 1024) throw fatal('File is too large (max ' + prop('MAX_FILE_MB') + ' MB).');

  const res = UrlFetchApp.fetch(PHOTOS_API + '/uploads', {
    method: 'post',
    payload: '',
    headers: authHeaders({
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Content-Type': mimeType,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Raw-Size': String(size),
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Google Photos refused the upload (' + res.getResponseCode() + ').');

  const headers = res.getAllHeaders();
  const url = header(headers, 'X-Goog-Upload-URL');
  if (!url) throw new Error('Google Photos did not return an upload URL.');

  // The upload URL stays on the server; the browser only gets an opaque id.
  const uploadId = Utilities.getUuid();
  saveSession(uploadId, { url: url, fileName: cleanText(req.fileName, 200) || 'upload', size: size });
  return { uploadId: uploadId, granularity: Number(header(headers, 'X-Goog-Upload-Chunk-Granularity')) || 262144 };
}

function uploadChunk(req) {
  const session = getSession(req.uploadId);
  const bytes = req.data ? Utilities.base64Decode(req.data) : [];

  const res = UrlFetchApp.fetch(session.url, {
    method: 'post',
    contentType: 'application/octet-stream',
    payload: bytes,
    headers: authHeaders({
      'X-Goog-Upload-Command': req.final ? 'upload, finalize' : 'upload',
      'X-Goog-Upload-Offset': String(Number(req.offset) || 0),
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Chunk upload failed (' + res.getResponseCode() + ').');
  if (!req.final) return { ok: true };

  const uploadToken = res.getContentText();
  createMediaItem(uploadToken, session.fileName, req.uploader);
  CacheService.getScriptCache().remove('upload:' + req.uploadId);
  return { ok: true, done: true };
}

/** How many bytes Google has received — lets the browser resume after a dropped connection. */
function uploadStatus(req) {
  const session = getSession(req.uploadId);
  const res = UrlFetchApp.fetch(session.url, {
    method: 'post',
    payload: '',
    headers: authHeaders({ 'X-Goog-Upload-Command': 'query' }),
    muteHttpExceptions: true,
  });
  const headers = res.getAllHeaders();
  return {
    received: Number(header(headers, 'X-Goog-Upload-Size-Received')) || 0,
    state: header(headers, 'X-Goog-Upload-Status') || 'unknown',
  };
}

function createMediaItem(uploadToken, fileName, uploader) {
  const name = cleanText(uploader, 100);
  const result = api('post', '/mediaItems:batchCreate', {
    albumId: getAlbumId(),
    newMediaItems: [{
      description: 'Uploaded' + (name ? ' by ' + name : '') + ' via website',
      simpleMediaItem: { uploadToken: uploadToken, fileName: fileName },
    }],
  });
  const item = result.newMediaItemResults && result.newMediaItemResults[0];
  const status = item && item.status;
  if (!item || (status && status.code)) {
    throw new Error('Google Photos could not save the file' + (status && status.message ? ': ' + status.message : '.'));
  }
}

// ---------- Helpers ----------

function getAlbumId() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('ALBUM_ID');
  if (id) return id;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    id = props.getProperty('ALBUM_ID');
    if (!id) {
      id = api('post', '/albums', { album: { title: prop('ALBUM_TITLE') } }).id;
      props.setProperty('ALBUM_ID', id);
    }
    return id;
  } finally {
    lock.releaseLock();
  }
}

function api(method, path, body) {
  const res = UrlFetchApp.fetch(PHOTOS_API + path, {
    method: method,
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: authHeaders({}),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 300) {
    throw new Error('Google Photos API error (' + res.getResponseCode() + ')' + (data.error && data.error.message ? ': ' + data.error.message : ''));
  }
  return data;
}

function checkPasscode(passcode) {
  const expected = prop('PASSCODE');
  if (!expected) throw new Error('Uploader is not configured (missing PASSCODE).');
  if (String(passcode || '') === expected) return true;
  Utilities.sleep(1500); // slow down guessing
  return false;
}

function saveSession(id, session) {
  CacheService.getScriptCache().put('upload:' + id, JSON.stringify(session), SESSION_TTL);
}

function getSession(id) {
  const raw = id && CacheService.getScriptCache().get('upload:' + id);
  if (!raw) throw fatal('This upload expired. Please try the file again.');
  return JSON.parse(raw);
}

function authHeaders(extra) {
  extra.Authorization = 'Bearer ' + ScriptApp.getOAuthToken();
  return extra;
}

function header(headers, name) {
  const key = Object.keys(headers).find(function (k) { return k.toLowerCase() === name.toLowerCase(); });
  const value = key ? headers[key] : null;
  return Array.isArray(value) ? value[0] : value;
}

function prop(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || DEFAULTS[name] || '';
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function fatal(message) {
  const err = new Error(message);
  err.fatal = true;
  return err;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
