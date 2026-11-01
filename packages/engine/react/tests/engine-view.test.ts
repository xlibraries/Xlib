import { describe, expect, it } from 'vitest';
import { applyVolume, screenPitch, tiltLean } from '../src/EngineView';

describe('screenPitch', () => {
    it('is 0 with the screen upright and grows as the top edge tilts away, in any orientation', () => {
        expect(screenPitch(90, 0, 'portrait-primary')).toBeCloseTo(0);
        expect(screenPitch(60, 0, 'portrait-primary')).toBeCloseTo(30);
        expect(screenPitch(0, -90, 'landscape-primary')).toBeCloseTo(0);     // upright, top edge to the left
        expect(screenPitch(0, -60, 'landscape-primary')).toBeCloseTo(30);
        expect(screenPitch(0, 60, 'landscape-secondary')).toBeCloseTo(30);
        expect(screenPitch(null, 10, 'landscape-primary')).toBeNull();
    });
    it('stays continuous where gamma alone flips sign (the phone held upright in landscape)', () => {
        // gamma jumps from -89 to +89 as the phone passes vertical; the pitch barely moves
        const a = screenPitch(0, -89, 'landscape-primary')!, b = screenPitch(180, 89, 'landscape-primary')!;
        expect(Math.abs(a - b)).toBeLessThan(3);
    });
});

describe('tiltLean', () => {
    it('leans by the pitch from where the phone was first held, clamped', () => {
        expect(tiltLean(null, null)).toBe(0);
        expect(tiltLean(30, 30)).toBe(0);
        expect(tiltLean(41, 30)).toBeCloseTo(0.5);
        expect(tiltLean(-60, 30)).toBe(-1);
    });
});

describe('applyVolume', () => {
    it('reaches a game whose sound is already playing', () => {
        const heard: number[] = [];
        const game = { xlSetVolume: (v: number) => { heard.push(v); } };
        applyVolume(game, 0.2);
        expect(heard).toEqual([0.2]);
    });
    it('is kept for a game that sets up its sound later (it starts at xlVolume)', () => {
        const game: { xlVolume?: number } = {};
        applyVolume(game, 0.2);
        expect(game.xlVolume).toBe(0.2);
    });
});
