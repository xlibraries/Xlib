// The hover challenge: take off, hold HOVER_HEIGHT within HOVER_BAND and level within HOVER_TILT for HOVER_HOLD
// seconds straight, then land softly. Flipping past CRASH_TILT or meeting the ground faster than CRASH_SPEED is a
// crash, and ends the run. Heights are the frame's clearance above where it sat at the start.

export const HOVER_HEIGHT = 0.5;      // metres
export const HOVER_BAND = 0.1;        // ± metres
export const HOVER_TILT = 5;          // degrees
export const HOVER_HOLD = 10;         // seconds
export const TAKE_OFF = 0.05;         // metres: above this it's flying
export const TOUCH_DOWN = 0.02;       // metres: below this (coming down) it has landed
export const SOFT_LANDING = 0.5;      // m/s
export const CRASH_SPEED = 1.5;       // m/s
export const CRASH_TILT = 60;         // degrees

export interface HoverState {
    /** Height above the start, metres, and tilt from level, degrees */
    altitude: number;
    tilt: number;
    phase: 'ready' | 'flying' | 'landed' | 'crashed';
    /** Seconds in the band so far this stretch, and the longest stretch */
    held: number;
    best: number;
    /** The last touchdown's speed, m/s (null before one) */
    touchdown: number | null;
    /** Why it crashed */
    crash: string | null;
    /** Held long enough and landed softly */
    passed: boolean;
}

export class HoverJudge {
    private s: HoverState = { altitude: 0, tilt: 0, phase: 'ready', held: 0, best: 0, touchdown: null, crash: null, passed: false };
    private last: number | null = null;

    /** One step: the frame's altitude, tilt (degrees), vertical speed (m/s, up +) at `time` seconds. */
    update(altitude: number, tilt: number, climb: number, time: number) {
        const s = this.s, dt = this.last === null ? 0 : time - this.last;
        this.last = time;
        s.altitude = altitude;
        s.tilt = tilt;
        if (s.phase === 'crashed') return;
        if (tilt > CRASH_TILT) { this.crash(`flipped over (${Math.round(tilt)}°)`); return; }
        if (s.phase !== 'flying') {
            if (altitude > TAKE_OFF) s.phase = 'flying';
            return;
        }
        if (Math.abs(altitude - HOVER_HEIGHT) <= HOVER_BAND && tilt <= HOVER_TILT) {
            s.held += dt;
            s.best = Math.max(s.best, s.held);
        } else s.held = 0;
        if (altitude < TOUCH_DOWN && climb <= 0) {
            const speed = -climb;
            s.touchdown = speed;
            if (speed > CRASH_SPEED) { this.crash(`hit the ground at ${speed.toFixed(1)} m/s`); return; }
            s.phase = 'landed';
            s.held = 0;
            s.passed ||= s.best >= HOVER_HOLD && speed <= SOFT_LANDING;
        }
    }

    private crash(why: string) {
        this.s.phase = 'crashed';
        this.s.crash = why;
        this.s.held = 0;
    }

    get state(): HoverState { return { ...this.s }; }
}
