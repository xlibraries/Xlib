import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) }));
const frameCheck = (await import('../../pages/api/frame-check')).default;
const reader = (await import('../../pages/api/reader')).default;

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, url: string) {
    let status = 0; let body: Record<string, unknown> = {}; const headers: Record<string, string> = {};
    const res = {
        status(code: number) { status = code; return this; },
        json(data: Record<string, unknown>) { body = data; return this; },
        setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; return this; },
    } as unknown as NextApiResponse;
    return Promise.resolve(handler({ query: { url } } as unknown as NextApiRequest, res)).then(() => ({ status, body, headers }));
}

const html = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

const ARTICLE = `<html><head><title>Kedarnath Trek Guide</title></head><body><nav>menu</nav><article><h1>Kedarnath Trek Guide</h1>
<p>${'The trek to Kedarnath starts at Gaurikund and climbs about sixteen kilometres through the valley. '.repeat(8)}</p>
<p><a href="/next">Next page</a> <img src="/photo.jpg" alt="peak"> <a href="javascript:alert(1)">bad</a></p>
<script>window.evil = true</script><p onclick="steal()">Stay safe.</p></article></body></html>`;

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('/api/frame-check', () => {
    it('rejects private and non-web addresses with 400', async () => {
        expect((await call(frameCheck, 'http://127.0.0.1/')).status).toBe(400);
        expect((await call(frameCheck, 'file:///etc/passwd')).status).toBe(400);
        expect((await call(frameCheck, '')).status).toBe(400);
    });
    it('reports framable pages and caches the answer', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html('<p>hi</p>')));
        const { status, body, headers } = await call(frameCheck, 'https://example.com/');
        expect(status).toBe(200);
        expect(body).toMatchObject({ embeddable: true, finalUrl: 'https://example.com/' });
        expect(headers['cache-control']).toContain('s-maxage=86400');
    });
    it('reports pages that forbid framing', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html('', { 'x-frame-options': 'DENY' })));
        expect((await call(frameCheck, 'https://example.com/')).body).toMatchObject({ embeddable: false });
    });
    it('lets the browser try when the site is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
        expect((await call(frameCheck, 'https://example.com/')).body).toMatchObject({ embeddable: true, reason: expect.stringContaining('unchecked') });
    });
});

describe('/api/reader', () => {
    it('rejects private addresses with 400', async () => {
        expect((await call(reader, 'http://192.168.0.1/')).status).toBe(400);
    });
    it('extracts the article, absolutises links and strips scripts and handlers', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html(ARTICLE)));
        const { body } = await call(reader, 'https://trek.example/guide');
        expect(body.readable).toBe(true);
        expect(body.title).toBe('Kedarnath Trek Guide');
        const content = String(body.content);
        expect(content).toContain('Gaurikund');
        expect(content).toContain('href="https://trek.example/next"');
        expect(content).toContain('src="https://trek.example/photo.jpg"');
        expect(content).not.toMatch(/<script|onclick|javascript:|window\.evil/);
    });
    it('says unreadable for short pages, non-HTML and errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html('<p>tiny</p>')));
        expect((await call(reader, 'https://example.com/')).body).toMatchObject({ readable: false, reason: 'no article content' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } })));
        expect((await call(reader, 'https://example.com/')).body).toMatchObject({ readable: false, reason: 'not an html page' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 403, headers: { 'content-type': 'text/html' } })));
        expect((await call(reader, 'https://example.com/')).body).toMatchObject({ readable: false, reason: 'status 403' });
    });
    it('refuses pages over 3 MB', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html('<p>' + 'x'.repeat(3.2 * 1024 * 1024) + '</p>')));
        expect((await call(reader, 'https://example.com/')).body).toMatchObject({ readable: false, reason: 'page too large' });
    });
});
