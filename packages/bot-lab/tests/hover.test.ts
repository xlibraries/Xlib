import { describe, expect, it } from 'vitest';
import { CRASH_SPEED, HOVER_HOLD, HoverJudge } from '../src/sim/hover';

/** Flies a judge through altitude and tilt at 100 Hz from `t`, returning the time reached */
function fly(judge: HoverJudge, t: number, seconds: number, altitude: (s: number) => number, tilt = 0) {
    const steps = Math.round(seconds * 100);
    for (let i = 1; i <= steps; i++) {
        const s = i / 100, climb = (altitude(s) - altitude(s - 0.01)) / 0.01;
        judge.update(Math.max(0, altitude(s)), tilt, climb, t + s);
    }
    return t + seconds;
}

describe('the hover challenge', () => {
    it('waits on the ground, counts time in the band, and passes on a soft landing after a long enough hold', () => {
        const judge = new HoverJudge();
        let t = fly(judge, 0, 1, () => 0);
        expect(judge.state.phase).toBe('ready');
        t = fly(judge, t, 2, s => 0.25 * s);                        // up to 50 cm
        expect(judge.state.phase).toBe('flying');
        t = fly(judge, t, HOVER_HOLD + 0.5, () => 0.5 + 0.05);
        expect(judge.state.best).toBeGreaterThan(HOVER_HOLD);
        expect(judge.state.passed).toBe(false);                     // not until it's down
        fly(judge, t, 2.5, s => 0.55 - 0.25 * s);                   // 0.25 m/s down
        const end = judge.state;
        expect(end.phase).toBe('landed');
        expect(end.touchdown).toBeCloseTo(0.25, 2);
        expect(end.passed).toBe(true);
    });

    it('restarts the count when it leaves the band or tilts too far; a short hold does not pass', () => {
        const judge = new HoverJudge();
        let t = fly(judge, 0, 2, s => 0.25 * s);
        t = fly(judge, t, 6, () => 0.5);
        expect(judge.state.held).toBeGreaterThan(5);
        t = fly(judge, t, 0.5, () => 0.5, 8);                       // tilted 8°
        expect(judge.state.held).toBe(0);
        t = fly(judge, t, 3, () => 0.5);
        t = fly(judge, t, 0.5, () => 0.65);                         // too high
        expect(judge.state.held).toBe(0);
        fly(judge, t, 3, s => 0.65 - 0.25 * s);
        expect(judge.state.phase).toBe('landed');
        expect(judge.state.best).toBeLessThan(HOVER_HOLD);
        expect(judge.state.passed).toBe(false);
    });

    it('calls a fast meeting with the ground, or flipping over, a crash, and stops judging', () => {
        const fall = new HoverJudge();
        let t = fly(fall, 0, 2, s => 0.25 * s);
        fly(fall, t, 1, s => 0.5 - 4.9 * s * s);                    // dropped
        expect(fall.state.phase).toBe('crashed');
        expect(fall.state.crash).toMatch(/hit the ground at \d/);
        expect(fall.state.touchdown!).toBeGreaterThan(CRASH_SPEED);
        const flip = new HoverJudge();
        t = fly(flip, 0, 2, s => 0.25 * s);
        fly(flip, t, 0.1, () => 0.5, 90);
        expect(flip.state.crash).toMatch(/flipped/);
        fly(flip, t + 0.1, 1, () => 0.5);
        expect(flip.state.phase).toBe('crashed');
    });
});
