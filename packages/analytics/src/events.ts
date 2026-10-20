// What the browser sends to the tracking endpoint.

export type TrackEvent =
    /** A page load: counts a visit, a (estimated) unique visitor, country, referrer and device. */
    | { type: 'visit'; path: string; referrer?: string; width?: number }
    /** A screen inside the site, e.g. "/terminal" or "/about/Experience". */
    | { type: 'view'; path: string }
    /** Something the visitor did, e.g. "Open App: music". */
    | { type: 'event'; name: string };

const MAX = 120;
const clean = (s: unknown) => (typeof s === 'string' ? s.slice(0, MAX) : undefined);

/** Validates an untrusted request body; returns null for anything malformed. */
export function parseEvent(body: unknown): TrackEvent | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    if (b.type === 'visit' && typeof b.path === 'string') {
        return { type: 'visit', path: clean(b.path)!, referrer: clean(b.referrer), width: typeof b.width === 'number' && b.width > 0 ? Math.round(b.width) : undefined };
    }
    if (b.type === 'view' && typeof b.path === 'string') return { type: 'view', path: clean(b.path)! };
    if (b.type === 'event' && typeof b.name === 'string' && b.name) return { type: 'event', name: clean(b.name)! };
    return null;
}
