import type { NextApiRequest, NextApiResponse } from 'next';
import { clientIp, sameOrigin } from '../../../lib/admin-auth';
import { availability, compilerConfig, jobStatus, startBuild } from '../../../lib/bot-lab-compile';
import { getStore } from '../../../lib/kv';

// POST { sketch } → a build (200) or { job } (202); GET ?job=… → the job's state; GET → { available }.
// See lib/bot-lab-compile.ts.
export const config = { api: { bodyParser: { sizeLimit: '80kb' } }, maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    const store = getStore();
    if (req.method === 'GET') {
        const { status, body } = typeof req.query.job === 'string' ? await jobStatus(store, req.query.job) : availability(compilerConfig(), store);
        return res.status(status).json(body);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    const { status, body } = await startBuild({ body: req.body, ip: clientIp(req), config: compilerConfig(), store });
    return res.status(status).json(body);
}
