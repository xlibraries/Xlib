// Browser side: fire-and-forget beacons to the tracking endpoint (no cookies, nothing stored on the device).
import type { TrackEvent } from './events';

let endpoint = '/api/track';
export function configureTracker(options: { endpoint?: string }) {
    if (options.endpoint) endpoint = options.endpoint;
}

export function track(event: TrackEvent) {
    if (typeof window === 'undefined') return;
    const body = JSON.stringify(event);
    try {
        if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) return;
    } catch { /* fall through */ }
    fetch(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => { });
}

/** Call once per page load. Only the referring site's host is sent, never the full URL. */
export function trackVisit() {
    if (typeof window === 'undefined') return;
    let referrer: string | undefined;
    try {
        const ref = document.referrer ? new URL(document.referrer) : null;
        if (ref && ref.host !== location.host) referrer = ref.host.replace(/^www\./, '');
    } catch { /* bad referrer */ }
    track({ type: 'visit', path: location.pathname, referrer, width: window.innerWidth });
}
