import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Server-side fetches of user-supplied URLs (frame check, reader view). Only public http(s) addresses are
// allowed, every redirect hop is re-checked, and requests time out, so these endpoints can't be used to
// reach private networks or cloud metadata services.

const MAX_REDIRECTS = 4;
export const USER_AGENT = 'Mozilla/5.0 (compatible; XlibBrowser/1.0; +https://xlibraries.com)';

function isPrivateAddress(address: string): boolean {
    if (isIP(address) === 6) {
        const a = address.toLowerCase();
        if (a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80')) return true;
        const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        return mapped ? isPrivateAddress(mapped[1]) : false;
    }
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('only http(s) URLs');
    if (url.username || url.password) throw new Error('credentials not allowed');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('private host');
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map(r => r.address);
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('private address');
    return url;
}

// GET a public URL, following (and re-validating) redirects. Returns the final response and URL.
export async function safeFetch(start: URL, timeoutMs: number, accept = 'text/html'): Promise<{ response: Response; url: URL }> {
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, {
            redirect: 'manual',
            signal: controller.signal,
            headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en' },
        }).finally(() => clearTimeout(timer));
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) {
            response.body?.cancel().catch(() => { });
            url = await assertPublicHttpUrl(new URL(location, url).href);
            continue;
        }
        return { response, url };
    }
    throw new Error('too many redirects');
}
