import { describe, expect, it } from 'vitest';
import { currentLyricIndex, formatTime, lyricQueries, parseLrc, pickLyrics, toTrack } from '../../lib/music';

describe('formatTime', () => {
    it.each([[0, '0:00'], [5, '0:05'], [65.9, '1:05'], [3600, '60:00'], [NaN, '0:00'], [null, '0:00']])('%s -> %s', (input, out) => {
        expect(formatTime(input as number)).toBe(out);
    });
});

it('maps Invidious videos to tracks', () => {
    expect(toTrack({ videoId: 'abc', title: 'T', lengthSeconds: 90 })).toEqual({ id: 'abc', title: 'T', author: '', duration: 90 });
});

describe('lyricQueries', () => {
    it('strips video noise and tries the title part too', () => {
        const q = lyricQueries('Shakira, Burna Boy - Dai Dai (Official Video)');
        expect(q[0]).toBe('Shakira, Burna Boy - Dai Dai');
        expect(q).toContain('Dai Dai');
    });
    it('drops everything after a pipe', () => {
        expect(lyricQueries('Kesariya - Brahmāstra | Ranbir Kapoor | Arijit Singh')[0]).toBe('Kesariya - Brahmāstra');
    });
});

describe('pickLyrics', () => {
    const synced = { duration: 240, syncedLyrics: '[00:01.00] hi', plainLyrics: 'hi' };
    const plainOnly = { duration: 241, plainLyrics: 'hi' };
    it('prefers synced lyrics of a matching length', () => expect(pickLyrics([plainOnly, synced], 240)).toBe(synced));
    it('rejects results more than 30 s off, instrumentals and empties', () => {
        expect(pickLyrics([{ duration: 300, syncedLyrics: 'x' }], 240)).toBeNull();
        expect(pickLyrics([{ duration: 240, instrumental: true, plainLyrics: 'x' }], 240)).toBeNull();
        expect(pickLyrics([{ duration: 240 }], 240)).toBeNull();
        expect(pickLyrics(null, 240)).toBeNull();
    });
});

describe('parseLrc / currentLyricIndex', () => {
    const lines = parseLrc('[00:01.50] one\n[ar: someone]\n[01:02] two\n[01:10.25]');
    it('parses timed lines and skips metadata', () => {
        expect(lines).toEqual([{ t: 1.5, text: 'one' }, { t: 62, text: 'two' }, { t: 70.25, text: '' }]);
    });
    it('finds the line playing now', () => {
        expect(currentLyricIndex(lines, 0)).toBe(-1);
        expect(currentLyricIndex(lines, 1.3)).toBe(0);
        expect(currentLyricIndex(lines, 65)).toBe(1);
    });
});
