/**
 * Photo Drop — receives photos/videos from the website's hidden uploader and saves them
 * to the owner's Google Photos, in an album this script creates.
 *
 * Runs as a Google Apps Script web app ("Execute as: Me"), so uploads use the owner's
 * account and storage. Setup steps: see README.md next to this file.
 *
 * The script starts each upload with Google Photos and hands the browser that one file's upload
 * URL, so the bytes go straight from the browser to Google; 'finish' then adds the file to the album.
 * If the browser can't reach Google directly, it falls back to sending base64 chunks through this
 * script ('chunk'), which forwards them to the same resumable upload.
 *
 * Chunks may arrive out of order or twice (Chrome's Background Fetch sends up to two requests
 * at once and may retry), so each chunk waits for the previous one and duplicates are ignored.
 */

const PHOTOS_API = 'https://photoslibrary.googleapis.com/v1';
const SESSION_TTL = 6 * 60 * 60; // seconds (CacheService maximum)
const ORDER_WAIT_MS = 90 * 1000; // how long a chunk waits for the one before it (normally a few seconds)

// Script properties (Project Settings → Script properties). Only PASSCODE is required.
// MAX_FILE_MB is unset by default: no limit beyond Google Photos' own (20 GB videos, 200 MB photos).
const DEFAULTS = {
  ALBUM_TITLE: 'Website Uploads',
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
        return reply({ ok: true, maxFileMb: Number(prop('MAX_FILE_MB')) || 0 });
      case 'start':
        return reply(startUpload(req));
      case 'chunk':
        return reply(uploadChunk(req));
      case 'status':
        return reply(uploadStatus(req));
      case 'finish':
        return reply(finishUpload(req));
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
  const maxMb = Number(prop('MAX_FILE_MB')) || 0;
  if (maxMb && size > maxMb * 1024 * 1024) throw fatal('File is too large (max ' + maxMb + ' MB).');

  const headers = {
    'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Content-Type': mimeType,
    'X-Goog-Upload-Protocol': 'resumable',
    'X-Goog-Upload-Raw-Size': String(size),
  };
  // Google allows browser (CORS) requests to the upload URL from the origin that started it
  const origin = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(req.origin || '')) ? String(req.origin) : '';
  const start = function (extra) {
    return UrlFetchApp.fetch(PHOTOS_API + '/uploads', {
      method: 'post',
      payload: '',
      headers: authHeaders(Object.assign({}, headers, extra)),
      muteHttpExceptions: true,
    });
  };
  let res;
  try {
    res = start(origin ? { Origin: origin } : {});
  } catch (err) {
    if (!origin) throw err;
    res = start({}); // Origin header refused: the browser will use the relay instead
  }
  if (res.getResponseCode() !== 200) throw new Error('Google Photos refused the upload (' + res.getResponseCode() + ').');

  const resHeaders = res.getAllHeaders();
  const url = header(resHeaders, 'X-Goog-Upload-URL');
  if (!url) throw new Error('Google Photos did not return an upload URL.');

  // The upload URL only accepts bytes for this one file, so it's safe to give to a browser that
  // knows the passcode. Adding the file to the album still goes through 'finish'.
  const uploadId = Utilities.getUuid();
  saveSession(uploadId, { url: url, fileName: cleanText(req.fileName, 200) || 'upload', size: size });
  const result = { uploadId: uploadId, granularity: Number(header(resHeaders, 'X-Goog-Upload-Chunk-Granularity')) || 262144 };
  if (req.direct) result.uploadUrl = url;
  return result;
}

function uploadChunk(req) {
  const id = req.uploadId;
  const session = getSession(id);
  const offset = Number(req.offset) || 0;

  // Wait until every byte before this chunk has reached Google
  const deadline = Date.now() + ORDER_WAIT_MS;
  let received = getProgress(id).received;
  while (received < offset) {
    if (Date.now() > deadline) throw new Error('An earlier part of this file never arrived.');
    Utilities.sleep(500);
    received = getProgress(id).received;
  }
  // Already forwarded (a retry or duplicate request)
  if (received > offset || getProgress(id).done) return { ok: true, duplicate: true, done: getProgress(id).done };
  if (!claim(id, offset)) return { ok: true, duplicate: true, done: getProgress(id).done };

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
  if (res.getResponseCode() !== 200) {
    release(id, offset);
    throw new Error('Chunk upload failed (' + res.getResponseCode() + ').');
  }
  if (!req.final) {
    setProgress(id, { received: offset + bytes.length });
    return { ok: true };
  }

  const uploadToken = res.getContentText();
  createMediaItem(uploadToken, session.fileName, req.uploader);
  setProgress(id, { received: offset + bytes.length, done: true });
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
  const received = Number(header(headers, 'X-Goog-Upload-Size-Received')) || 0;
  const progress = getProgress(req.uploadId);
  if (!progress.done) setProgress(req.uploadId, { received: received });
  return { received: received, done: !!progress.done, state: header(headers, 'X-Goog-Upload-Status') || 'unknown' };
}

/** After the browser uploaded the bytes itself: add the file to the album, once. */
function finishUpload(req) {
  const id = req.uploadId;
  const uploadToken = String(req.uploadToken || '');
  if (!id || !uploadToken || uploadToken.length > 4096) throw fatal('Missing upload token.');
  if (getProgress(id).done) return { ok: true, done: true, duplicate: true };
  if (!claim(id, 'finish')) throw new Error('Still saving the file…'); // another request is finishing it

  // The session cache may have expired during a very long upload; the token alone is enough
  let fileName;
  try {
    fileName = getSession(id).fileName;
  } catch (err) {
    fileName = cleanText(req.fileName, 200) || 'upload';
  }
  try {
    createMediaItem(uploadToken, fileName, req.uploader);
  } catch (err) {
    release(id, 'finish');
    throw err;
  }
  setProgress(id, { received: getProgress(id).received, done: true });
  return { ok: true, done: true };
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

// Bytes forwarded to Google so far, shared between concurrent executions
function getProgress(id) {
  return JSON.parse(CacheService.getScriptCache().get('progress:' + id) || '{"received":0}');
}

function setProgress(id, progress) {
  CacheService.getScriptCache().put('progress:' + id, JSON.stringify(progress), SESSION_TTL);
}

// Only one execution may forward a given chunk, even if it was sent twice at the same time
function claim(id, offset) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cache = CacheService.getScriptCache();
    const key = 'claim:' + id + ':' + offset;
    if (cache.get(key)) return false;
    cache.put(key, '1', SESSION_TTL);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function release(id, offset) {
  CacheService.getScriptCache().remove('claim:' + id + ':' + offset);
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
