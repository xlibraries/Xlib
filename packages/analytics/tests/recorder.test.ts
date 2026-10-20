import { describe, expect, it, vi } from 'vitest';
import { isBot, memoryStore, parseEvent, record, report, upstashStore } from '../src/server';

const NOW = new Date('2026-10-20T12:00:00Z');
const human = { ip: '1.2.3.4', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130', country: 'in', now: NOW };

describe('parseEvent', () => {
    it('accepts the three event types and trims long strings', () => {
        expect(parseEvent({ type: 'visit', path: '/', referrer: 'google.com', width: 1440 })).toEqual({ type: 'visit', path: '/', referrer: 'google.com', width: 1440 });
        expect(parseEvent({ type: 'view', path: '/terminal' })).toEqual({ type: 'view', path: '/terminal' });
        expect(parseEvent({ type: 'event', name: 'x'.repeat(500) })).toEqual({ type: 'event', name: 'x'.repeat(120) });
    });
    it('rejects anything else', () => {
        for (const bad of [null, 'visit', {}, { type: 'visit' }, { type: 'event', name: '' }, { type: 'nope', path: '/' }]) expect(parseEvent(bad)).toBeNull();
    });
});

describe('isBot', () => {
    it('spots crawlers, scripts and empty user agents', () => {
        expect(isBot('Googlebot/2.1')).toBe(true);
        expect(isBot('curl/8.4')).toBe(true);
        expect(isBot(undefined)).toBe(true);
        expect(isBot(human.userAgent)).toBe(false);
    });
});

describe('record + report', () => {
    it('counts visits, unique visitors, countries, referrers, devices, views and events per day', async () => {
        const store = memoryStore();
        await record(store, { type: 'visit', path: '/', referrer: 'linkedin.com', width: 390 }, human, 's');
        await record(store, { type: 'visit', path: '/', width: 1440 }, human, 's');   // same visitor again
        await record(store, { type: 'visit', path: '/' }, { ...human, ip: '5.6.7.8', country: 'US' }, 's');
        await record(store, { type: 'view', path: '/terminal' }, human, 's');
        await record(store, { type: 'event', name: 'Open App: music' }, human, 's');
        const r = await report(store, 7, NOW);
        expect(r.to).toBe('2026-10-20');
        expect(r.daily).toHaveLength(7);
        expect(r.totals).toEqual({ visits: 3, visitors: 2 });
        expect(r.countries).toEqual([['IN', 2], ['US', 1]]);
        expect(r.referrers).toEqual([['(direct)', 2], ['linkedin.com', 1]]);
        expect(r.devices).toEqual([['desktop', 1], ['phone', 1]]);
        expect(r.views).toEqual([['/terminal', 1]]);
        expect(r.events).toEqual([['Open App: music', 1]]);
    });

    it('treats the same visitor on another day as a new visitor (no cross-day tracking)', async () => {
        const store = memoryStore();
        await record(store, { type: 'visit', path: '/' }, human, 's');
        await record(store, { type: 'visit', path: '/' }, { ...human, now: new Date('2026-10-19T12:00:00Z') }, 's');
        expect((await report(store, 2, NOW)).daily.map(d => d.visitors)).toEqual([1, 1]);
    });
});

describe('upstashStore', () => {
    it('sends Redis commands to the REST API and parses replies', async () => {
        const calls: unknown[] = [];
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
            const command = JSON.parse(init.body as string);
            calls.push(command);
            const result = command[0] === 'HGETALL' ? ['visits', '3', 'country:IN', '2'] : command[0] === 'INCR' ? 4 : 1;
            return { ok: true, json: async () => ({ result }) } as Response;
        });
        const store = upstashStore({ url: 'https://r.example', token: 't', fetch: fetch as unknown as typeof globalThis.fetch });
        await store.hincrby('a:1', 'visits', 1);
        expect(await store.hgetall('a:1')).toEqual({ visits: 3, 'country:IN': 2 });
        expect(await store.incr('rl')).toBe(4);
        await store.set('settings', '{"a":1}');
        expect(calls).toContainEqual(['SET', 'settings', '{"a":1}']);
        expect(calls[0]).toEqual(['HINCRBY', 'a:1', 'visits', 1]);
        expect(fetch.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer t' });
    });

    it('throws Redis errors', async () => {
        const fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS' }) }) as Response);
        await expect(upstashStore({ url: 'u', token: 't', fetch: fetch as unknown as typeof globalThis.fetch }).incr('x')).rejects.toThrow('WRONGPASS');
    });
});

describe('memoryStore strings', () => {
    it('gets and sets', async () => {
        const store = memoryStore();
        expect(await store.get('k')).toBeNull();
        await store.set('k', 'v');
        expect(await store.get('k')).toBe('v');
    });
});
