import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();
vi.mock('node:dns/promises', () => ({ lookup: (...args: unknown[]) => lookup(...args) }));
const { assertPublicHttpUrl, safeFetch } = await import('../../lib/safe-fetch');

const resolvesTo = (address: string) => lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);

beforeEach(() => { lookup.mockReset(); resolvesTo('93.184.216.34'); });
afterEach(() => vi.unstubAllGlobals());

describe('assertPublicHttpUrl', () => {
    it('accepts public http(s) URLs', async () => {
        await expect(assertPublicHttpUrl('https://example.com/x')).resolves.toBeInstanceOf(URL);
    });
    it.each(['file:///etc/passwd', 'ftp://example.com/', 'javascript:alert(1)'])('rejects non-web scheme %s', async url => {
        await expect(assertPublicHttpUrl(url)).rejects.toThrow('only http(s)');
    });
    it.each(['http://localhost/', 'http://app.localhost/', 'http://printer.local/', 'http://db.internal/'])('rejects private host %s', async url => {
        await expect(assertPublicHttpUrl(url)).rejects.toThrow('private host');
    });
    it.each(['http://127.0.0.1/', 'http://10.1.2.3/', 'http://172.16.0.1/', 'http://192.168.1.1/', 'http://169.254.169.254/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[::ffff:a9fe:a9fe]/'])('rejects private IP %s', async url => {
        await expect(assertPublicHttpUrl(url)).rejects.toThrow('private address');
    });
    it('rejects names that resolve to private addresses (DNS rebinding)', async () => {
        resolvesTo('10.0.0.5');
        await expect(assertPublicHttpUrl('https://sneaky.example/')).rejects.toThrow('private address');
    });
    it('rejects URLs with credentials', async () => {
        await expect(assertPublicHttpUrl('https://user:pw@example.com/')).rejects.toThrow('credentials');
    });
});

describe('safeFetch', () => {
    it('follows redirects, re-checking every hop', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://www.example.com/final' } }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const { response, url } = await safeFetch(new URL('https://example.com/'), 1000);
        expect(response.status).toBe(200);
        expect(url.href).toBe('https://www.example.com/final');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(lookup).toHaveBeenCalledTimes(1);   // the redirect target was validated
    });
    it('refuses a redirect into a private network', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })));
        await expect(safeFetch(new URL('https://example.com/'), 1000)).rejects.toThrow('private address');
    });
    it('gives up after too many redirects', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://example.com/again' } }))));
        await expect(safeFetch(new URL('https://example.com/'), 1000)).rejects.toThrow('too many redirects');
    });
});
