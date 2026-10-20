import { beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.fn();
const trackVisit = vi.fn();
vi.mock('@xlibraries/analytics', () => ({ track, trackVisit }));
const { trackEvent, trackPageview, trackSiteVisit } = await import('../../lib/analytics');

beforeEach(() => { track.mockClear(); trackVisit.mockClear(); });

describe('site analytics', () => {
    it('sends views, events and visits to the site tracker', () => {
        trackPageview('/about/Experience');
        trackEvent({ category: 'Open App', action: 'music' });
        trackSiteVisit();
        expect(track).toHaveBeenNthCalledWith(1, { type: 'view', path: '/about/Experience' });
        expect(track).toHaveBeenNthCalledWith(2, { type: 'event', name: 'Open App: music' });
        expect(trackVisit).toHaveBeenCalledOnce();
    });
});
