// The floor's track: a line of a given width along a centre line of points (metres, on the floor's x/z plane), dark on
// a light floor. A line sensor reads the floor's reflectance under it: dark on the line, light off it, with a few
// millimetres of soft edge (the sensor sees a small spot, not a point), so the analog output changes smoothly.

export interface Track {
    /** The line's width, metres (electrical tape is about 19 mm) */
    width: number;
    /** The centre line, [x, z] in metres */
    points: [number, number][];
    /** Whether the last point joins the first */
    closed: boolean;
}

export const LINE_REFLECTANCE = 0.05;
export const FLOOR_REFLECTANCE = 0.9;
const EDGE = 0.003;   // the sensor's spot: metres over which reflectance goes from line to floor

/** Distance from (x, z) to the track's centre line, metres. */
export function distanceToLine(track: Track, x: number, z: number): number {
    const pts = track.points, n = pts.length;
    if (n === 0) return Infinity;
    if (n === 1) return Math.hypot(x - pts[0][0], z - pts[0][1]);
    let best = Infinity;
    const segments = track.closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
        const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
        best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
    return best;
}

/** The floor's reflectance at (x, z): 0.05 on the line, 0.9 off it, blended across the line's edge. */
export function reflectance(track: Track, x: number, z: number): number {
    const d = distanceToLine(track, x, z) - track.width / 2;
    const t = Math.max(0, Math.min(1, (d + EDGE / 2) / EDGE));
    return LINE_REFLECTANCE + (FLOOR_REFLECTANCE - LINE_REFLECTANCE) * t;
}

/** A closed oval: two straights joined by half circles. */
export function ovalTrack(straight = 0.8, radius = 0.35, width = 0.019, segments = 24): Track {
    const points: [number, number][] = [];
    const half = straight / 2;
    for (let i = 0; i <= segments; i++) { const a = -Math.PI / 2 + Math.PI * i / segments; points.push([half + radius * Math.cos(a), radius * Math.sin(a)]); }
    for (let i = 0; i <= segments; i++) { const a = Math.PI / 2 + Math.PI * i / segments; points.push([-half + radius * Math.cos(a), radius * Math.sin(a)]); }
    return { width, points, closed: true };
}
