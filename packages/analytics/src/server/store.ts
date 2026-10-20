// The few Redis operations analytics (and the admin login's rate limit and site settings) need, so the recorder works with
// Upstash in production and an in-memory store in tests and local development.

export interface Store {
    hincrby(key: string, field: string, by: number): Promise<void>;
    hgetall(key: string): Promise<Record<string, number>>;
    pfadd(key: string, member: string): Promise<void>;
    pfcount(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}

/** Upstash Redis over its REST API (no SDK): https://upstash.com/docs/redis/features/restapi */
export function upstashStore({ url, token, fetch: fetchImpl = (input, init) => fetch(input, init) }: { url: string; token: string; fetch?: typeof fetch }): Store {
    const call = async (...command: (string | number)[]) => {
        const res = await fetchImpl(url, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify(command),
        });
        const data = await res.json() as { result?: unknown; error?: string };
        if (!res.ok || data.error) throw new Error(data.error || `Redis ${res.status}`);
        return data.result;
    };
    return {
        async hincrby(key, field, by) { await call('HINCRBY', key, field, by); },
        async hgetall(key) {
            const flat = (await call('HGETALL', key)) as string[] | null;
            const out: Record<string, number> = {};
            for (let i = 0; flat && i < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]);
            return out;
        },
        async pfadd(key, member) { await call('PFADD', key, member); },
        async pfcount(key) { return Number(await call('PFCOUNT', key)); },
        async incr(key) { return Number(await call('INCR', key)); },
        async expire(key, seconds) { await call('EXPIRE', key, seconds); },
        async get(key) { const v = await call('GET', key); return v == null ? null : String(v); },
        async set(key, value) { await call('SET', key, value); },
    };
}

/** In-memory store (exact counts instead of HyperLogLog estimates). Expiry is ignored. */
export function memoryStore(): Store {
    const hashes = new Map<string, Record<string, number>>();
    const sets = new Map<string, Set<string>>();
    const counters = new Map<string, number>();
    const strings = new Map<string, string>();
    return {
        async hincrby(key, field, by) {
            const h = hashes.get(key) ?? {};
            h[field] = (h[field] ?? 0) + by;
            hashes.set(key, h);
        },
        async hgetall(key) { return { ...(hashes.get(key) ?? {}) }; },
        async pfadd(key, member) { sets.set(key, (sets.get(key) ?? new Set()).add(member)); },
        async pfcount(key) { return sets.get(key)?.size ?? 0; },
        async incr(key) {
            const n = (counters.get(key) ?? 0) + 1;
            counters.set(key, n);
            return n;
        },
        async expire() { /* no-op */ },
        async get(key) { return strings.get(key) ?? null; },
        async set(key, value) { strings.set(key, value); },
    };
}
