import { beforeEach, describe, expect, it, vi } from 'vitest';

const ga = vi.hoisted(() => ({ isInitialized: false, initialize: vi.fn(), send: vi.fn(), event: vi.fn() }));
vi.mock('react-ga4', () => ({ default: ga }));
const { initAnalytics, trackEvent, trackPageview } = await import('../../lib/analytics');

beforeEach(() => { ga.isInitialized = false; ga.initialize.mockReset().mockImplementation(() => { ga.isInitialized = true; }); ga.send.mockReset(); ga.event.mockReset(); });

describe('analytics', () => {
    it('does nothing without a measurement ID', () => {
        initAnalytics(undefined);
        trackPageview('/music');
        trackEvent({ category: 'x', action: 'y' });
        expect(ga.initialize).not.toHaveBeenCalled();
        expect(ga.send).not.toHaveBeenCalled();
        expect(ga.event).not.toHaveBeenCalled();
    });
    it('initialises once and sends page views and events', () => {
        initAnalytics('G-TEST');
        initAnalytics('G-TEST');
        expect(ga.initialize).toHaveBeenCalledTimes(1);
        trackPageview('/music');
        trackPageview('/lock-screen', 'Lock Screen');
        expect(ga.send).toHaveBeenNthCalledWith(1, { hitType: 'pageview', page: '/music' });
        expect(ga.send).toHaveBeenNthCalledWith(2, { hitType: 'pageview', page: '/lock-screen', title: 'Lock Screen' });
        trackEvent({ category: 'Open App', action: 'Opened Music' });
        expect(ga.event).toHaveBeenCalledWith({ category: 'Open App', action: 'Opened Music' });
    });
});
