import type { NextApiRequest, NextApiResponse } from 'next';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { framePolicy } from '../../lib/frame-policy';

// Used by the Brave app: can this URL be shown inside the browser window, or does the site forbid framing?
// Only reads response headers. Refuses private/internal addresses so it can't be used to probe networks.

const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 6000;
const EMBEDDER_ORIGIN = 'https://xlibraries.com';

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

async function assertPublicHttpUrl(raw: string): Promise<URL> {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('only http(s) URLs');
    if (url.username || url.password) throw new Error('credentials not allowed');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('private host');
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map(r => r.address);
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('private address');
    return url;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    let url: URL;
    try {
        url = await assertPublicHttpUrl(raw);
    } catch (err) {
        return res.status(400).json({ error: (err as Error).message || 'invalid url' });
    }

    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: { 'user-agent': 'Mozilla/5.0 (compatible; XlibBrowserCheck/1.0; +https://xlibraries.com)', accept: 'text/html' },
            }).finally(() => clearTimeout(timer));
            response.body?.cancel().catch(() => { });   // headers are all we need

            const location = response.headers.get('location');
            if (response.status >= 300 && response.status < 400 && location) {
                url = await assertPublicHttpUrl(new URL(location, url).href);   // re-check every hop
                continue;
            }
            const policy = framePolicy(response.headers, EMBEDDER_ORIGIN);
            res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
            return res.status(200).json({ ...policy, finalUrl: url.href });
        }
        return res.status(200).json({ embeddable: false, reason: 'too many redirects', finalUrl: url.href });
    } catch (err) {
        // Unreachable or timed out: let the browser try and show its own error
        return res.status(200).json({ embeddable: true, reason: 'unchecked: ' + ((err as Error).name || 'error'), finalUrl: url.href });
    }
}
