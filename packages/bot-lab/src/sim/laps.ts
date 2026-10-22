// The line-follower challenge: laps on a closed track, a finish on an open one. The start line crosses the track at
// its first point, square to its direction; a lap counts when the robot crosses it forwards after passing the
// halfway checkpoint (so rocking back and forth over the line earns nothing). Wandering further than OFF_TRACK from the
// line marks the lap; staying off for LOST seconds ends the run.
import { distanceToLine, type Track } from './track';

export const START_HALF_WIDTH = 0.15;   // the start line reaches this far either side of the track, metres
export const CHECKPOINT_RADIUS = 0.15;
export const OFF_TRACK = 0.12;
export const LOST = 3;

export interface LapState {
    /** Completed laps (closed tracks) */
    laps: number;
    /** Seconds since the current lap (or the run, on an open track) started; null before the start line */
    current: number | null;
    last: number | null;
    best: number | null;
    /** Open tracks: the time to the end, once reached */
    finished: number | null;
    offTrack: boolean;
    /** Off the track for too long: the run is over */
    lost: boolean;
}

export class LapTracker {
    private prev: [number, number] | null = null;
    private started: number | null = null;
    private sawCheckpoint = false;
    private offSince: number | null = null;
    private markedOff = false;
    readonly state: LapState = { laps: 0, current: null, last: null, best: null, finished: null, offTrack: false, lost: false };
    private readonly origin: [number, number];
    private readonly dir: [number, number];
    private readonly checkpoint: [number, number];
    private readonly end: [number, number];

    constructor(private readonly track: Track) {
        const pts = track.points;
        const a = pts[0] ?? [0, 0], b = pts[1] ?? [a[0] + 1, a[1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        this.origin = a;
        this.dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        this.checkpoint = pts[Math.floor(pts.length / 2)] ?? a;
        this.end = pts[pts.length - 1] ?? a;
    }

    /** The robot is at (x, z) at time t (seconds). */
    update(x: number, z: number, t: number): LapState {
        const s = this.state;
        if (s.lost || (s.finished !== null)) return s;
        const off = distanceToLine(this.track, x, z) > OFF_TRACK;
        s.offTrack = off;
        if (off) { this.offSince ??= t; this.markedOff = true; if (t - this.offSince >= LOST) s.lost = true; }
        else this.offSince = null;
        if (Math.hypot(x - this.checkpoint[0], z - this.checkpoint[1]) < CHECKPOINT_RADIUS) this.sawCheckpoint = true;
        if (this.prev && this.crossedStart(this.prev, [x, z])) {
            if (this.started === null) { this.started = t; this.sawCheckpoint = false; this.markedOff = false; }
            else if (this.track.closed && this.sawCheckpoint) {
                const lap = t - this.started;
                s.laps++;
                s.last = lap;
                if (!this.markedOff && (s.best === null || lap < s.best)) s.best = lap;   // a lap with an excursion doesn't set a best
                this.started = t;
                this.sawCheckpoint = false;
                this.markedOff = false;
            }
        }
        if (!this.track.closed && this.started !== null && this.sawCheckpoint && Math.hypot(x - this.end[0], z - this.end[1]) < 0.06) s.finished = t - this.started;
        s.current = this.started === null ? null : t - this.started;
        this.prev = [x, z];
        return s;
    }

    /** Whether the step from p to q crosses the start line going forwards. */
    private crossedStart(p: [number, number], q: [number, number]): boolean {
        const [ox, oz] = this.origin, [dx, dz] = this.dir;
        const along = (v: [number, number]) => (v[0] - ox) * dx + (v[1] - oz) * dz;     // signed distance past the line
        const across = (v: [number, number]) => -(v[0] - ox) * dz + (v[1] - oz) * dx;  // distance along the line
        const a = along(p), b = along(q);
        if (!(a < 0 && b >= 0)) return false;
        const t = a / (a - b);
        const c = across(p) + (across(q) - across(p)) * t;
        return Math.abs(c) <= START_HALF_WIDTH;
    }
}
