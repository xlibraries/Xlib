import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

// Runs backend/photo-drop/Code.gs (Google Apps Script) in a sandbox with fake Google services,
// including a fake Google Photos resumable-upload server.

type Ctx = Record<string, any>;
const CODE = readFileSync('backend/Code.gs', 'utf8');

function makeBackend(props: Record<string, string> = { PASSCODE: 'letmein' }) {
    const store = { props: { ...props } as Record<string, string>, cache: new Map<string, string>() };
    const photos = { tokenRevoked: false, sessions: new Map<string, { received: number; bytes: number[]; final: boolean; size: number }>(), albums: [] as string[], items: [] as any[], forwarded: [] as number[], origins: [] as (string | undefined)[], refuseOrigin: false };
    const clock = { now: 1_000_000, onSleep: null as null | (() => void) };
    let uuid = 0;

    const response = (code: number, body = '', headers: Record<string, string> = {}) => ({
        getResponseCode: () => code, getContentText: () => body, getAllHeaders: () => headers,
    });

    const UrlFetchApp = {
        fetch(url: string, opts: any) {
            const cmd = opts.headers?.['X-Goog-Upload-Command'];
            if (url.endsWith('/uploads') && cmd === 'start') {
                if (photos.tokenRevoked) return response(401, 'Request had invalid authentication credentials.');
                photos.origins.push(opts.headers.Origin);
                if (opts.headers.Origin && photos.refuseOrigin) throw new Error('Attribute provided with invalid value: Header:Origin');
                const id = 'sess' + photos.sessions.size;
                photos.sessions.set(id, { received: 0, bytes: [], final: false, size: Number(opts.headers['X-Goog-Upload-Raw-Size']) });
                return response(200, '', { 'X-Goog-Upload-URL': 'https://photos.example/upload/' + id, 'x-goog-upload-chunk-granularity': '262144' });
            }
            if (url.startsWith('https://photos.example/upload/')) {
                const s = photos.sessions.get(url.split('/').pop()!)!;
                if (cmd === 'query') return response(200, '', { 'X-Goog-Upload-Size-Received': String(s.received), 'X-Goog-Upload-Status': s.final ? 'final' : 'active' });
                const offset = Number(opts.headers['X-Goog-Upload-Offset']);
                if (offset !== s.received) return response(400, 'bad offset');   // Google requires in-order bytes
                const bytes = Array.from(opts.payload as ArrayLike<number>);
                for (const byte of bytes) s.bytes.push(byte);   // (no spread: chunks are 256 KB)
                s.received += bytes.length; photos.forwarded.push(offset);
                if (cmd === 'upload, finalize') { s.final = true; return response(200, 'upload-token-' + url.split('/').pop()); }
                return response(200);
            }
            if (url.endsWith('/albums')) { const id = 'album' + photos.albums.length; photos.albums.push(id); return response(200, JSON.stringify({ id })); }
            if (url.endsWith('/mediaItems:batchCreate')) {
                const body = JSON.parse(opts.payload); photos.items.push(body);
                return response(200, JSON.stringify({ newMediaItemResults: [{ status: { message: 'Success' } }] }));
            }
            throw new Error('unexpected fetch ' + url);
        },
    };

    const ctx: Ctx = {
        console,
        Date: { now: () => clock.now },
        PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store.props[k] ?? null, setProperty: (k: string, v: string) => { store.props[k] = v; } }) },
        CacheService: { getScriptCache: () => ({ get: (k: string) => store.cache.get(k) ?? null, put: (k: string, v: string) => { store.cache.set(k, v); }, remove: (k: string) => { store.cache.delete(k); } }) },
        LockService: { getScriptLock: () => ({ waitLock: () => { }, releaseLock: () => { } }) },
        Utilities: {
            getUuid: () => 'uuid-' + (++uuid),
            DigestAlgorithm: { SHA_256: 'sha256' },
            Charset: { UTF_8: 'utf8' },
            // Apps Script returns signed bytes (-128..127)
            computeDigest: (_alg: string, text: string) => Array.from(createHash('sha256').update(text).digest()).map((b) => (b > 127 ? b - 256 : b)),
            base64Decode: (s: string) => Array.from(Buffer.from(s, 'base64')),
            sleep: (ms: number) => { clock.now += ms; const hook = clock.onSleep; clock.onSleep = null; hook?.(); },
        },
        UrlFetchApp,
        ScriptApp: { getOAuthToken: () => 'oauth-token' },
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
        Logger: { log: () => { } },
    };
    vm.createContext(ctx);
    vm.runInContext(CODE, ctx);

    const post = (body: Record<string, unknown>) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
    return { ctx, post, store, photos, clock };
}

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
const CHUNK = 262144;
const fileBytes = (n: number) => Array.from({ length: n }, (_, i) => i % 251);

let backend: ReturnType<typeof makeBackend>;
beforeEach(() => { backend = makeBackend(); });

describe('Photo Drop backend', () => {
    it('answers GET health checks', () => {
        expect(JSON.parse(backend.ctx.doGet().text)).toEqual({ ok: true, service: 'photo-drop' });
    });

    it('rejects a wrong passcode (after a delay) and bad JSON', () => {
        const before = backend.clock.now;
        expect(backend.post({ action: 'check', passcode: 'nope' })).toMatchObject({ code: 'passcode', fatal: true });
        expect(backend.clock.now - before).toBeGreaterThanOrEqual(1500);
        expect(JSON.parse(backend.ctx.doPost({ postData: { contents: '{bad' } }).text)).toMatchObject({ error: 'Bad request' });
    });

    it('refuses to run without a configured passcode', () => {
        const b = makeBackend({});
        expect(b.post({ action: 'check', passcode: '' }).error).toContain('missing PASSCODE');
    });

    it('reports the size limit on check', () => {
        expect(backend.post({ action: 'check', passcode: 'letmein' })).toEqual({ ok: true, maxFileMb: 0 });   // no limit by default
        expect(makeBackend({ PASSCODE: 'letmein', MAX_FILE_MB: '1024' }).post({ action: 'check', passcode: 'letmein' })).toEqual({ ok: true, maxFileMb: 1024 });
    });

    it('accepts only photos and videos within the size limit', () => {
        const start = (mimeType: string, size: number) => backend.post({ action: 'start', passcode: 'letmein', fileName: 'x', mimeType, size });
        expect(start('text/plain', 10)).toMatchObject({ fatal: true, error: expect.stringContaining('Only photos and videos') });
        expect(start('image/jpeg', 0)).toMatchObject({ fatal: true });
        expect(start('image/jpeg', 10)).toMatchObject({ uploadId: 'uuid-1', granularity: 262144 });
        expect(start('video/mp4', 15 * 1024 ** 3)).toMatchObject({ uploadId: 'uuid-2' });   // no cap by default
    });

    it('enforces MAX_FILE_MB when it is set', () => {
        const b = makeBackend({ PASSCODE: 'letmein', MAX_FILE_MB: '4096' });
        const start = (size: number) => b.post({ action: 'start', passcode: 'letmein', fileName: 'x', mimeType: 'video/mp4', size });
        expect(start(5000 * 1024 * 1024)).toMatchObject({ fatal: true, error: 'File is too large (max 4096 MB).' });
        expect(start(4096 * 1024 * 1024)).toMatchObject({ uploadId: 'uuid-1' });
    });

    it('uploads a file in chunks and saves it to an album created once', () => {
        const bytes = fileBytes(CHUNK * 2 + 1000);
        for (const name of ['a.jpg', 'b.jpg']) {
            const { uploadId } = backend.post({ action: 'start', passcode: 'letmein', fileName: name, mimeType: 'image/jpeg', size: bytes.length });
            const parts = [[0, CHUNK], [CHUNK, CHUNK * 2], [CHUNK * 2, bytes.length]];
            parts.forEach(([s, e], i) => {
                const res = backend.post({ action: 'chunk', passcode: 'letmein', uploadId, offset: s, data: b64(bytes.slice(s, e)), final: i === 2, uploader: 'Friend' });
                expect(res).toMatchObject(i === 2 ? { ok: true, done: true } : { ok: true });
            });
        }
        expect(backend.photos.albums).toEqual(['album0']);                     // created once, then reused
        expect(backend.store.props.ALBUM_ID).toBe('album0');
        expect(backend.photos.items).toHaveLength(2);
        expect(backend.photos.items[0]).toMatchObject({ albumId: 'album0', newMediaItems: [{ description: 'Uploaded by Friend via website', simpleMediaItem: { uploadToken: 'upload-token-sess0', fileName: 'a.jpg' } }] });
        expect(backend.photos.sessions.get('sess0')!.bytes).toEqual(bytes);   // bytes arrive intact and in order
    });

    it('holds an early chunk until the one before it arrives (Background Fetch sends two at once)', () => {
        const bytes = fileBytes(CHUNK * 2);
        const { uploadId } = backend.post({ action: 'start', passcode: 'letmein', fileName: 'v.mp4', mimeType: 'video/mp4', size: bytes.length });
        // while chunk 2 waits, chunk 1 lands (as it would in a parallel execution)
        backend.clock.onSleep = () => backend.post({ action: 'chunk', passcode: 'letmein', uploadId, offset: 0, data: b64(bytes.slice(0, CHUNK)), final: false });
        const res = backend.post({ action: 'chunk', passcode: 'letmein', uploadId, offset: CHUNK, data: b64(bytes.slice(CHUNK)), final: true });
        expect(res).toMatchObject({ ok: true, done: true });
        expect(backend.photos.forwarded).toEqual([0, CHUNK]);
    });

    it('gives up if the earlier chunk never arrives', () => {
        const { uploadId } = backend.post({ action: 'start', passcode: 'letmein', fileName: 'v.mp4', mimeType: 'video/mp4', size: CHUNK * 2 });
        const res = backend.post({ action: 'chunk', passcode: 'letmein', uploadId, offset: CHUNK, data: b64(fileBytes(CHUNK)), final: true });
        expect(res.error).toContain('never arrived');
    });

    it('ignores duplicate chunks instead of re-sending them', () => {
        const bytes = fileBytes(CHUNK * 2);
        const { uploadId } = backend.post({ action: 'start', passcode: 'letmein', fileName: 'v.mp4', mimeType: 'video/mp4', size: bytes.length });
        const first = { action: 'chunk', passcode: 'letmein', uploadId, offset: 0, data: b64(bytes.slice(0, CHUNK)), final: false };
        backend.post(first);
        expect(backend.post(first)).toMatchObject({ ok: true, duplicate: true });
        expect(backend.photos.forwarded).toEqual([0]);
    });

    it('gives the browser the upload URL for direct uploads, started for its origin', () => {
        const start = (extra: Record<string, unknown>) => backend.post({ action: 'start', passcode: 'letmein', fileName: 'v.mp4', mimeType: 'video/mp4', size: 10, ...extra });
        expect(start({})).not.toHaveProperty('uploadUrl');                     // relay-only clients never see it
        expect(start({ direct: true, origin: 'https://xlibraries.com' })).toMatchObject({ uploadUrl: 'https://photos.example/upload/sess1' });
        start({ direct: true, origin: 'javascript:alert(1)' });
        expect(backend.photos.origins).toEqual([undefined, 'https://xlibraries.com', undefined]);
    });

    it('still starts the upload if Apps Script refuses the Origin header', () => {
        backend.photos.refuseOrigin = true;
        expect(backend.post({ action: 'start', passcode: 'letmein', fileName: 'v.mp4', mimeType: 'video/mp4', size: 10, direct: true, origin: 'https://xlibraries.com' }))
            .toMatchObject({ uploadId: 'uuid-1', uploadUrl: 'https://photos.example/upload/sess0' });
    });

    it('adds a directly uploaded file to the album once', () => {
        const { uploadId } = backend.post({ action: 'start', passcode: 'letmein', fileName: 'clip.mov', mimeType: 'video/quicktime', size: 10, direct: true });
        const finish = { action: 'finish', passcode: 'letmein', uploadId, uploadToken: 'tok-1', uploader: 'Friend' };
        expect(backend.post(finish)).toEqual({ ok: true, done: true });
        expect(backend.post(finish)).toMatchObject({ ok: true, done: true, duplicate: true });
        expect(backend.photos.items).toHaveLength(1);
        expect(backend.photos.items[0].newMediaItems[0]).toMatchObject({ description: 'Uploaded by Friend via website', simpleMediaItem: { uploadToken: 'tok-1', fileName: 'clip.mov' } });
        expect(backend.post({ action: 'status', passcode: 'letmein', uploadId })).toMatchObject({ done: true });
    });

    it('finishes even after the session cache expired, and requires a token', () => {
        expect(backend.post({ action: 'finish', passcode: 'letmein', uploadId: 'gone', uploadToken: '' })).toMatchObject({ fatal: true });
        expect(backend.post({ action: 'finish', passcode: 'letmein', uploadId: 'gone', uploadToken: 'tok', fileName: 'late.mp4' })).toEqual({ ok: true, done: true });
        expect(backend.photos.items[0].newMediaItems[0].simpleMediaItem.fileName).toBe('late.mp4');
    });

    it('reports progress for resuming, and expires unknown uploads', () => {
        const bytes = fileBytes(CHUNK * 2);
        const { uploadId } = backend.post({ action: 'start', passcode: 'letmein', fileName: 'v.mp4', mimeType: 'video/mp4', size: bytes.length });
        backend.post({ action: 'chunk', passcode: 'letmein', uploadId, offset: 0, data: b64(bytes.slice(0, CHUNK)), final: false });
        expect(backend.post({ action: 'status', passcode: 'letmein', uploadId })).toMatchObject({ received: CHUNK, done: false, state: 'active' });
        expect(backend.post({ action: 'status', passcode: 'letmein', uploadId: 'nope' })).toMatchObject({ fatal: true, error: expect.stringContaining('expired') });
    });

    describe('admin status', () => {
        const KEY = 'admin-key-for-tests';
        const HASH = createHash('sha256').update(KEY).digest('hex');
        const admin = (b: ReturnType<typeof makeBackend>, adminKey = KEY) => b.post({ action: 'admin', adminKey });

        it('needs the admin key (not the passcode), and refuses when no key hash is deployed', () => {
            const b = makeBackend({ PASSCODE: 'letmein', ADMIN_KEY_HASH: HASH });
            expect(admin(b, 'wrong')).toEqual({ error: 'Forbidden', fatal: true });
            expect(b.post({ action: 'admin', passcode: 'letmein' })).toEqual({ error: 'Forbidden', fatal: true });
            expect(admin(makeBackend())).toEqual({ error: 'Forbidden', fatal: true });
        });

        it('takes the hash from config.gs (ADMIN_KEY_HASH constant) as well', () => {
            const b = makeBackend({ PASSCODE: 'letmein' });
            b.ctx.ADMIN_KEY_HASH = HASH;
            expect(admin(b)).toMatchObject({ access: { ok: true } });
        });

        it('counts down 7 days from the last setup() and lists recent uploads, newest first', () => {
            const b = makeBackend({ PASSCODE: 'letmein', ADMIN_KEY_HASH: HASH });
            expect(admin(b)).toMatchObject({ authorizedAt: null, expiresAt: null, uploads: [] });
            b.ctx.setup();
            const start = (name: string) => b.post({ action: 'start', passcode: 'letmein', fileName: name, mimeType: 'image/jpeg', size: 10 });
            const s1 = start('beach.jpg');
            b.post({ action: 'chunk', passcode: 'letmein', uploadId: s1.uploadId, offset: 0, final: true, data: b64(fileBytes(10)), uploader: 'Asha' });
            const s2 = start('hills.jpg');
            b.post({ action: 'chunk', passcode: 'letmein', uploadId: s2.uploadId, offset: 0, final: true, data: b64(fileBytes(10)) });
            const status = admin(b);
            expect(status.access).toEqual({ ok: true, error: null });
            expect(status.expiresAt - status.authorizedAt).toBe(7 * 24 * 3600 * 1000);
            expect(status.uploads.map((u: { name: string; by: string }) => [u.name, u.by])).toEqual([['hills.jpg', ''], ['beach.jpg', 'Asha']]);
        });

        it('reports when Google access has stopped working', () => {
            const b = makeBackend({ PASSCODE: 'letmein', ADMIN_KEY_HASH: HASH, ALBUM_ID: 'album0' });
            const sessionsBefore = b.photos.sessions.size;
            expect(admin(b).access).toEqual({ ok: true, error: null });
            expect(b.photos.items).toEqual([]);   // the check adds nothing to the library
            b.photos.tokenRevoked = true;
            expect(admin(b).access).toEqual({ ok: false, error: 'Google Photos answered 401.' });
            expect(b.photos.sessions.size).toBe(sessionsBefore + 1);
        });

        it('keeps only the last 50 uploads', () => {
            const b = makeBackend({ PASSCODE: 'letmein', ADMIN_KEY_HASH: HASH });
            for (let i = 0; i < 55; i++) b.ctx.logUpload('f' + i + '.jpg', '');
            const uploads = admin(b).uploads;
            expect(uploads).toHaveLength(50);
            expect(uploads[0].name).toBe('f54.jpg');
        });
    });
});

