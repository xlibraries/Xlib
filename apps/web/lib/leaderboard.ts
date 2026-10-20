// Global leaderboards for Arcade games: a sorted set per game and board in Redis, one entry per nickname
// (its best score). Scores are sanity-checked, not proven: a game's best in the browser can be forged, so this is
// a friendly board, not a competition.
import type { Store } from '@xlibraries/analytics/server';

export interface Board { game: string; boards: number; maxScore: number }

/** Games that have a leaderboard, how many boards (eras, levels…) each has, and the highest sane score. */
export const BOARDS: Record<string, Board> = {
    'turbo-trails': { game: 'turbo-trails', boards: 10, maxScore: 2400 },
};

export const TOP = 20;
export const POSTS_PER_WINDOW = 20;
export const POST_WINDOW_SECONDS = 10 * 60;

export interface Entry { name: string; score: number }

/** A nickname fit for a public board: letters (with their marks), digits, spaces and . _ -, 2 to 16 characters. */
export function cleanName(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const name = input.replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    return name.length >= 2 ? name : null;
}

export function validScore(board: Board, input: unknown): number | null {
    const n = typeof input === 'number' ? input : Number.NaN;
    return Number.isInteger(n) && n > 0 && n <= board.maxScore ? n : null;
}

export function validBoard(input: unknown, board: Board): number | null {
    const n = typeof input === 'number' ? input : Number(input);
    return Number.isInteger(n) && n >= 0 && n < board.boards ? n : null;
}

const key = (game: string, board: number) => `lb:${game}:${board}`;

export async function readBoard(store: Store, game: string, board: number): Promise<Entry[]> {
    return (await store.ztop(key(game, board), TOP)).map(({ member, score }) => ({ name: member, score }));
}

/** Records a score if it beats the name's previous best; returns the updated board and the name's rank (1-based, or 0 if outside the top). */
export async function postScore(store: Store, game: string, board: number, name: string, score: number): Promise<{ entries: Entry[]; rank: number }> {
    await store.zadd(key(game, board), score, name, true);
    const entries = await readBoard(store, game, board);
    return { entries, rank: entries.findIndex((e) => e.name === name) + 1 };
}
