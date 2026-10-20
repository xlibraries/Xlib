import type { NextApiRequest, NextApiResponse } from 'next';
import { isAdmin } from '../../../lib/admin-auth';
import settings from '../../../content/photo-drop.json';

// GET → Photo Drop's status from its Apps Script (Google access, expiry, recent uploads). Admin only; the key
// that authorizes this to the script (PHOTO_DROP_ADMIN_KEY) stays on the server.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (!isAdmin(req)) return res.status(401).json({ error: 'Log in at /xlib' });
    const adminKey = process.env.PHOTO_DROP_ADMIN_KEY;
    if (!adminKey) return res.status(503).json({ error: 'PHOTO_DROP_ADMIN_KEY is not set on the server.' });
    try {
        // Apps Script answers with a redirect to the result; fetch follows it as a GET, as browsers do
        const upstream = await fetch(settings.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: JSON.stringify({ action: 'admin', adminKey }),
            signal: AbortSignal.timeout(20_000),
        });
        const data = await upstream.json();
        if (data.error) return res.status(502).json({ error: `Photo Drop: ${data.error}` });
        return res.status(200).json(data);
    } catch (err) {
        return res.status(502).json({ error: `Couldn't reach Photo Drop (${(err as Error).message})` });
    }
}
