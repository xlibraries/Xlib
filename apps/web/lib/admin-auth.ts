// Admin sessions for /xlib. The passcode (ADMIN_PASSCODE) and signing key (ADMIN_SESSION_SECRET) live only in
// environment variables. A session is `<payload>.<HMAC>` in an HttpOnly, SameSite=Strict cookie that expires
// after 7 days; nothing about it is stored server-side.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const SESSION_COOKIE = 'xlib_admin';
export const SESSION_SECONDS = 7 * 24 * 3600;
export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

export function adminConfig(env: NodeJS.ProcessEnv = process.env): { passcode: string; secret: string } | null {
    const passcode = env.ADMIN_PASSCODE, secret = env.ADMIN_SESSION_SECRET;
    return passcode && secret && secret.length >= 32 ? { passcode, secret } : null;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time comparison (hashing first makes the lengths equal). */
export const passcodeMatches = (given: string, expected: string) => timingSafeEqual(sha256(given), sha256(expected));

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function createSession(secret: string, now = Date.now()): string {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url');
    return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): boolean {
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expected = Buffer.from(sign(payload, secret));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    try {
        const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return typeof exp === 'number' && exp * 1000 > now;
    } catch {
        return false;
    }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
    for (const part of (header ?? '').split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return undefined;
}

export const sessionCookie = (token: string) =>
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
export const clearedCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAdmin(req: Pick<IncomingMessage, 'headers'>): boolean {
    const config = adminConfig();
    return !!config && verifySession(readCookie(req.headers.cookie, SESSION_COOKIE), config.secret);
}

/** State-changing admin requests must come from this site (other sites can't post as you). */
export function sameOrigin(req: Pick<IncomingMessage, 'headers'>): boolean {
    const origin = req.headers.origin;
    if (!origin) return false;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>): string {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    return first || (req.headers['x-real-ip'] as string | undefined) || req.socket?.remoteAddress || 'unknown';
}

/** Key for counting login attempts, without storing the IP itself. */
export const attemptsKey = (ip: string, secret: string) => `rl:login:${createHmac('sha256', secret).update(ip).digest('base64url').slice(0, 16)}`;
