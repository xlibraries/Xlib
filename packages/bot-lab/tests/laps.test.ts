import { describe, expect, it } from 'vitest';
import { LapTracker, LOST } from '../src/sim/laps';
import { ovalTrack, type Track } from '../src/sim/track';

/** Drives a point around the track's centre line at `speed` m/s, `laps` times, starting `before` metres behind the start. */
function drive(track: Track, tracker: LapTracker, laps: number, speed = 0.5, before = 0.1, dt = 0.01) {
    const pts = track.points, segs: [number, number, number, number, number][] = [];
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segs.push([a[0], a[1], b[0] - a[0], b[1] - a[1], len]);
        total += len;
    }
    const at = (d: number): [number, number] => {
        d = ((d % total) + total) % total;
        for (const [x, z, dx, dz, len] of segs) { if (d <= len) return [x + dx * d / len, z + dz * d / len]; d -= len; }
        return [pts[0][0], pts[0][1]];
    };
    let t = 0;
    for (let d = -before; d < laps * total + 0.05; d += speed * dt, t += dt) { const [x, z] = at(d); tracker.update(x, z, t); }
    return { total, t };
}

describe('laps', () => {
    it('the first crossing starts the clock; each later one, after the checkpoint, is a lap', () => {
        const track = ovalTrack();
        const tracker = new LapTracker(track);
        const { total } = drive(track, tracker, 3);
        expect(tracker.state.laps).toBe(3);
        expect(tracker.state.best).toBeCloseTo(total / 0.5, 0);
        expect(tracker.state.offTrack).toBe(false);
    });

    it('rocking back and forth over the start line earns nothing', () => {
        const tracker = new LapTracker(ovalTrack());
        const [x0, z0] = ovalTrack().points[0];
        for (let i = 0; i < 40; i++) tracker.update(x0 + (i % 2 ? 0.03 : -0.03), z0, i * 0.1);
        expect(tracker.state.laps).toBe(0);
        expect(tracker.state.current).not.toBeNull();
    });

    it('going off the track marks the lap (no best) and staying off ends the run', () => {
        const track = ovalTrack();
        const tracker = new LapTracker(track);
        drive(track, tracker, 1);
        expect(tracker.state.laps).toBe(1);
        tracker.update(0, 0, 100);
        expect(tracker.state.offTrack).toBe(true);
        tracker.update(0, 0, 100 + LOST);
        expect(tracker.state.lost).toBe(true);
    });

    it('an open track has a finish instead of laps', () => {
        const track: Track = { width: 0.019, points: [[0, 0], [1, 0], [1, 1]], closed: false };
        const tracker = new LapTracker(track);
        // from 0.1 m before the start, along (0,0)→(1,0)→(1,1) at 0.5 m/s
        for (let t = 0; t <= 4.5; t += 0.01) {
            const d = t * 0.5 - 0.1;
            tracker.update(d <= 1 ? d : 1, d <= 1 ? 0 : Math.min(1, d - 1), t);
        }
        expect(tracker.state.laps).toBe(0);
        expect(tracker.state.finished).toBeCloseTo((2 - 0.06) / 0.5, 1);   // it finishes within 6 cm of the end
    });
});
