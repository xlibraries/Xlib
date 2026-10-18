import type { NextApiRequest, NextApiResponse } from 'next';
import { framePolicy } from '../../lib/frame-policy';
import { assertPublicHttpUrl, safeFetch } from '../../lib/safe-fetch';

// Used by the Brave app: can this URL be shown inside the browser window, or does the site forbid framing?
// Only reads response headers.

const TIMEOUT_MS = 6000;
const EMBEDDER_ORIGIN = 'https://xlibraries.com';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    let url: URL;
    try {
        url = await assertPublicHttpUrl(raw);
    } catch (err) {
        return res.status(400).json({ error: (err as Error).message || 'invalid url' });
    }
    try {
        const { response, url: finalUrl } = await safeFetch(url, TIMEOUT_MS);
        response.body?.cancel().catch(() => { });   // headers are all we need
        res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        return res.status(200).json({ ...framePolicy(response.headers, EMBEDDER_ORIGIN), finalUrl: finalUrl.href });
    } catch (err) {
        // Unreachable or timed out: let the browser try and show its own error
        return res.status(200).json({ embeddable: true, reason: 'unchecked: ' + ((err as Error).message || 'error'), finalUrl: url.href });
    }
}
