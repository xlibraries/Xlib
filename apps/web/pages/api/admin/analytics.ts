import type { NextApiRequest, NextApiResponse } from 'next';
import { report } from '@xlibraries/analytics/server';
import { isAdmin } from '../../../lib/admin-auth';
import { getStore } from '../../../lib/kv';

// GET ?days=7|30|90 → the analytics report (admin only).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (!isAdmin(req)) return res.status(401).json({ error: 'Log in at /xlib' });
    const store = getStore();
    if (!store) return res.status(503).json({ error: 'No analytics store configured (Upstash Redis).' });
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 366);
    return res.status(200).json(await report(store, days));
}
