// The Redis store behind analytics and admin (Upstash, set up through Vercel → Storage). Tests and e2e runs set
// XLIB_MEMORY_STORE=1 so they never touch the real database. Without either, there's no store and tracking
// quietly does nothing.
import { memoryStore, upstashStore, type Store } from '@xlibraries/analytics/server';

let memory: Store | null = null;

export function getStore(): Store | null {
    if (process.env.XLIB_MEMORY_STORE === '1') return (memory ??= memoryStore());
    const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
    return url && token ? upstashStore({ url, token }) : null;
}
