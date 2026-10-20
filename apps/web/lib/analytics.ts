// The site's analytics, through one place: beacons to /api/track (no cookies), shown in the admin Analytics app.
import { track, trackVisit } from '@xlibraries/analytics';

type EventParams = { category: string; action: string; label?: string; value?: number };

/** Once per page load. */
export const trackSiteVisit = () => trackVisit();

/** A screen inside an app, e.g. "/about/Experience". */
export function trackPageview(path: string) {
    track({ type: 'view', path });
}

/** Something the visitor did, recorded as "Category: action". */
export function trackEvent({ category, action }: EventParams) {
    track({ type: 'event', name: `${category}: ${action}` });
}
