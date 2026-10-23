// Drawing the world from above: each body's footprint on the floor (its shape's corners, rotated, projected onto x/z,
// wrapped in a convex hull), ordered bottom to top. Pure: the World view's top camera uses it.

export type Footprint = { kind: 'poly'; points: [number, number][]; colour: string; top: number } | { kind: 'circle'; x: number; z: number; r: number; colour: string; top: number };

const rotate = ([qx, qy, qz, qw]: number[], [x, y, z]: number[]): [number, number, number] => {
    // v' = q v q*, expanded
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
};

function hull(points: [number, number][]): [number, number][] {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [], upper: [number, number][] = [];
    for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
    for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const css = (r: number, g: number, b: number) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

/** Footprints of every body (shapes and poses: 7 floats each, as native/world reports them), lowest first */
export function footprints(shapes: number[], poses: number[]): Footprint[] {
    const out: Footprint[] = [];
    for (let i = 0; i * 7 < Math.min(shapes.length, poses.length); i++) {
        const [shape, a, b, c, r, g, bl] = shapes.slice(i * 7, i * 7 + 7);
        const [x, y, z, ...q] = poses.slice(i * 7, i * 7 + 7);
        const colour = css(r, g, bl);
        if (shape === 2) { out.push({ kind: 'circle', x, z, r: a, colour, top: y + a }); continue; }
        // a box's half extents, or a cylinder as the box around it (radius, half height, radius)
        const [hx, hy, hz] = shape === 1 ? [a, b, a] : [a, b, c];
        const corners: [number, number][] = [];
        let top = -Infinity;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const [px, py, pz] = rotate(q, [sx * hx, sy * hy, sz * hz]);
            corners.push([x + px, z + pz]);
            top = Math.max(top, y + py);
        }
        out.push({ kind: 'poly', points: hull(corners), colour, top });
    }
    return out.sort((p, q) => p.top - q.top);
}
