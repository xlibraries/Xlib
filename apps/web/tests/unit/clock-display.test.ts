import { describe, expect, it } from 'vitest';
import { formatClock } from '../../lib/clock';
import { screenBrightness } from '../../lib/display';

describe('formatClock', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 18, h, m);   // Sun 18 Oct 2026
    it('formats day and 12-hour time', () => expect(formatClock(at(17, 5))).toBe('Sun Oct 18 5:05 PM'));
    it('shows 12 for midnight and noon', () => {
        expect(formatClock(at(0, 15), { onlyTime: true })).toBe('12:15 AM');
        expect(formatClock(at(12, 0), { onlyTime: true })).toBe('12:00 PM');
    });
    it('supports 24-hour and date-only', () => {
        expect(formatClock(at(17, 5), { hour12: false, onlyTime: true })).toBe('17:05 PM');
        expect(formatClock(at(17, 5), { onlyDay: true })).toBe('Sun Oct 18');
    });
});

it('maps brightness 0-100 to a CSS filter from 0.25 to 1', () => {
    expect(screenBrightness(0)).toBe('brightness(0.25)');
    expect(screenBrightness(60)).toBe('brightness(0.7)');
    expect(screenBrightness(100)).toBe('brightness(1)');
});

import { DEFAULT_WALLPAPER, WALLPAPERS, wallpaperUrl } from '../../lib/wallpapers';

describe('wallpapers', () => {
    it('lists the eight wallpapers and falls back to the default', () => {
        expect(Object.keys(WALLPAPERS)).toHaveLength(8);
        expect(wallpaperUrl('wall-5')).toBe('./images/wallpapers/wall-5.webp');
        expect(wallpaperUrl('nope')).toBe(WALLPAPERS[DEFAULT_WALLPAPER]);
    });
});
