import type { NextApiRequest, NextApiResponse } from 'next';
import { isBot, parseEvent, record } from '@xlibraries/analytics/server';
import { adminConfig, clientIp, isAdmin } from '../../lib/admin-auth';
import { getStore } from '../../lib/kv';

// Receives the site's analytics beacons. Always answers 204, so tracking can never break the page; bots and
// the logged-in admin aren't counted.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).end();
    const store = getStore();
    const userAgent = req.headers['user-agent'];
    const event = parseEvent(typeof req.body === 'string' ? safeJson(req.body) : req.body);
    if (store && event && !isBot(userAgent) && !isAdmin(req)) {
        const country = req.headers['x-vercel-ip-country'];
        await record(store, event, {
            ip: clientIp(req),
            userAgent,
            country: typeof country === 'string' ? country : undefined,
        }, adminConfig()?.secret ?? 'xlib-analytics').catch(() => { });
    }
    return res.status(204).end();
}

function safeJson(text: string): unknown {
    try { return JSON.parse(text); } catch { return null; }
}
