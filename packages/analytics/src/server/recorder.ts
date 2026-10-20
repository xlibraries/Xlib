// Turns tracking events into daily counters, and daily counters into a report.
//
// Per UTC day, one hash `a:<day>` holds counters (visits, views, events, countries, referrers, devices) and one
// HyperLogLog `u:<day>` estimates unique visitors from a hash of IP + user agent + day + secret. No IP, user
// agent or cookie is stored, and the hash changes every day, so visitors can't be followed across days.
import { createHash } from 'node:crypto';
import type { TrackEvent } from '../events';
import type { Store } from './store';

const KEEP_SECONDS = 400 * 24 * 3600;
export const dayOf = (date: Date) => date.toISOString().slice(0, 10);

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|axios|node-fetch|go-http-client/i;
export const isBot = (userAgent: string | undefined) => !userAgent || BOTS.test(userAgent);

export interface RequestInfo {
    ip?: string;
    userAgent?: string;
    /** Two-letter country code, e.g. from Vercel's x-vercel-ip-country header. */
    country?: string;
    now?: Date;
}

export async function record(store: Store, event: TrackEvent, info: RequestInfo, secret: string): Promise<void> {
    const day = dayOf(info.now ?? new Date());
    const key = `a:${day}`;
    const bump = (field: string) => store.hincrby(key, field, 1);
    const jobs: Promise<void>[] = [];
    if (event.type === 'visit') {
        jobs.push(bump('visits'), bump(`path:${event.path}`));
        if (info.country) jobs.push(bump(`country:${info.country.toUpperCase()}`));
        jobs.push(bump(`ref:${event.referrer || '(direct)'}`));
        if (event.width) jobs.push(bump(`device:${event.width < 640 ? 'phone' : event.width < 1024 ? 'tablet' : 'desktop'}`));
        const visitor = createHash('sha256').update(`${info.ip}|${info.userAgent}|${day}|${secret}`).digest('base64url').slice(0, 22);
        jobs.push(store.pfadd(`u:${day}`, visitor), store.expire(`u:${day}`, KEEP_SECONDS));
    } else if (event.type === 'view') {
        jobs.push(bump(`view:${event.path}`));
    } else {
        jobs.push(bump(`event:${event.name}`));
    }
    jobs.push(store.expire(key, KEEP_SECONDS));
    await Promise.all(jobs);
}

export interface Report {
    from: string;
    to: string;
    totals: { visits: number; visitors: number };
    daily: { day: string; visits: number; visitors: number }[];
    views: [string, number][];
    events: [string, number][];
    countries: [string, number][];
    referrers: [string, number][];
    devices: [string, number][];
    paths: [string, number][];
}

const top = (counts: Map<string, number>, limit = 15): [string, number][] =>
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);

/** The last `days` days, oldest first. Visitors are summed per day (a returning visitor counts once per day). */
export async function report(store: Store, days: number, now = new Date()): Promise<Report> {
    const dayList = Array.from({ length: days }, (_, i) => dayOf(new Date(now.getTime() - (days - 1 - i) * 86400000)));
    const groups: Record<string, Map<string, number>> = { view: new Map(), event: new Map(), country: new Map(), ref: new Map(), device: new Map(), path: new Map() };
    const daily = await Promise.all(dayList.map(async (day) => {
        const [counts, visitors] = await Promise.all([store.hgetall(`a:${day}`), store.pfcount(`u:${day}`)]);
        for (const [field, n] of Object.entries(counts)) {
            const i = field.indexOf(':');
            const group = groups[field.slice(0, i)];
            if (i > 0 && group) group.set(field.slice(i + 1), (group.get(field.slice(i + 1)) ?? 0) + n);
        }
        return { day, visits: counts.visits ?? 0, visitors };
    }));
    return {
        from: dayList[0],
        to: dayList[dayList.length - 1],
        totals: { visits: daily.reduce((n, d) => n + d.visits, 0), visitors: daily.reduce((n, d) => n + d.visitors, 0) },
        daily,
        views: top(groups.view),
        events: top(groups.event),
        countries: top(groups.country),
        referrers: top(groups.ref),
        devices: top(groups.device),
        paths: top(groups.path),
    };
}
