import type { NextApiRequest, NextApiResponse } from 'next';
import { clearedCookie, sameOrigin } from '../../../lib/admin-auth';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    res.setHeader('Set-Cookie', clearedCookie);
    return res.status(200).json({ ok: true });
}
