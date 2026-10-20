import type { NextApiRequest, NextApiResponse } from 'next';
import { adminConfig, attemptsKey, clientIp, sameOrigin } from '../../../lib/admin-auth';
import { getStore } from '../../../lib/kv';
import { BOARDS, POST_WINDOW_SECONDS, POSTS_PER_WINDOW, cleanName, postScore, readBoard, validBoard, validScore } from '../../../lib/leaderboard';

// GET ?game=turbo-trails&board=0 → the top entries; POST { game, board, name, score } → records a best (20 posts
// per IP per 10 minutes) and returns the updated board with the poster's rank.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    const store = getStore();
    if (!store) return res.status(503).json({ error: 'No leaderboard store configured.' });
    const source = req.method === 'POST' ? req.body ?? {} : req.query;
    const config = BOARDS[String(source.game)];
    if (!config) return res.status(400).json({ error: 'Unknown game' });
    const board = validBoard(source.board, config);
    if (board === null) return res.status(400).json({ error: 'Unknown board' });

    if (req.method === 'GET') return res.status(200).json({ entries: await readBoard(store, config.game, board) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

    const name = cleanName(req.body?.name);
    const score = validScore(config, req.body?.score);
    if (!name) return res.status(400).json({ error: 'Pick a nickname of 2 to 16 letters or digits.' });
    if (score === null) return res.status(400).json({ error: 'Invalid score' });

    const rl = attemptsKey(clientIp(req), adminConfig()?.secret ?? 'xlib-leaderboard').replace('rl:login:', 'rl:lb:');
    const posts = await store.incr(rl);
    if (posts === 1) await store.expire(rl, POST_WINDOW_SECONDS);
    if (posts > POSTS_PER_WINDOW) return res.status(429).json({ error: 'Too many scores posted. Try again later.' });

    return res.status(200).json(await postScore(store, config.game, board, name, score));
}
