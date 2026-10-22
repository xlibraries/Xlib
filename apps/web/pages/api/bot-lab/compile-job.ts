import type { NextApiRequest, NextApiResponse } from 'next';
import { claimJob, compilerConfig, finishJob } from '../../../lib/bot-lab-compile';
import { getStore } from '../../../lib/kv';

// For the bot-lab-compile workflow only (BOT_LAB_JOB_SECRET): GET ?id=… → the sketch; POST ?id=… → the result.
export const config = { api: { bodyParser: { sizeLimit: '400kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const auth = req.headers.authorization;
    const { status, body } = req.method === 'GET' ? await claimJob(compilerConfig(), getStore(), auth, id)
        : req.method === 'POST' ? await finishJob(compilerConfig(), getStore(), auth, id, req.body)
            : { status: 405, body: { error: 'GET or POST' } };
    return res.status(status).json(body);
}
