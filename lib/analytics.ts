import ReactGA from 'react-ga4';

// Google Analytics 4, through one place. Vercel Analytics (automatic page views) is mounted in pages/_app.tsx.
// Calls are no-ops until initAnalytics() runs with a measurement ID (NEXT_PUBLIC_TRACKING_ID).

type EventParams = { category: string; action: string; label?: string; value?: number };

export function initAnalytics(trackingId: string | undefined) {
    if (trackingId && !ReactGA.isInitialized) ReactGA.initialize(trackingId);
}

export function trackPageview(page: string, title?: string) {
    if (ReactGA.isInitialized) ReactGA.send({ hitType: 'pageview', page, ...(title ? { title } : {}) });
}

export function trackEvent(params: EventParams) {
    if (ReactGA.isInitialized) ReactGA.event(params);
}
