import type { NextApiRequest, NextApiResponse } from 'next';
import { isAdmin, sameOrigin } from '../../../lib/admin-auth';
import { HIDEABLE_APPS } from '../../../lib/app-ids';
import { getStore } from '../../../lib/kv';
import { readSettings, writeSettings } from '../../../lib/site-settings';

// GET → current settings; POST { hiddenApps, banner } → saves them (admin only)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (!isAdmin(req)) return res.status(401).json({ error: 'Log in at /xlib' });
    const store = getStore();
    if (!store) return res.status(503).json({ error: 'No settings store configured (Upstash Redis).' });
    if (req.method === 'GET') return res.status(200).json(await readSettings(store, HIDEABLE_APPS));
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    return res.status(200).json(await writeSettings(store, req.body, HIDEABLE_APPS));
}
