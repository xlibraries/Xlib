import type { NextApiRequest, NextApiResponse } from 'next';
import { clientIp, sameOrigin } from '../../../lib/admin-auth';
import { build, compilerConfig } from '../../../lib/bot-lab-compile';
import { getStore } from '../../../lib/kv';

// POST { sketch } → { ok, hex, size, warnings } or { ok: false, errors }; see lib/bot-lab-compile.ts
// up to 60 s: a sleeping compiler takes about a minute to wake
export const config = { api: { bodyParser: { sizeLimit: '80kb' } }, maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    const { status, body } = await build({ body: req.body, ip: clientIp(req), config: compilerConfig(), store: getStore() });
    return res.status(status).json(body);
}
