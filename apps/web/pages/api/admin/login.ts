import type { NextApiRequest, NextApiResponse } from 'next';
import { LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS, adminConfig, attemptsKey, clientIp, createSession, passcodeMatches, sameOrigin, sessionCookie } from '../../../lib/admin-auth';
import { getStore } from '../../../lib/kv';

// POST { passcode } → sets the admin session cookie. At most 5 attempts per IP per 15 minutes.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const config = adminConfig();
    if (!config) return res.status(503).json({ error: "Admin isn't set up on this site yet." });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

    const store = getStore();
    if (store) {
        const key = attemptsKey(clientIp(req), config.secret);
        const attempts = await store.incr(key);
        if (attempts === 1) await store.expire(key, LOGIN_WINDOW_SECONDS);
        if (attempts > LOGIN_ATTEMPTS) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!passcode || !passcodeMatches(passcode, config.passcode)) return res.status(401).json({ error: "That passcode isn't right." });

    res.setHeader('Set-Cookie', sessionCookie(createSession(config.secret)));
    return res.status(200).json({ ok: true });
}
