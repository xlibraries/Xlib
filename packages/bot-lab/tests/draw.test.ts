import { describe, expect, it } from 'vitest';
import { footprints } from '../src/sim/draw';

describe('footprints from above', () => {
    it('a box turned a quarter about y covers its rotated rectangle; a sphere is a circle; higher things come last', () => {
        const s = Math.SQRT1_2;
        const shapes = [0, 0.2, 0.05, 0.1, 1, 0, 0, /* sphere */ 2, 0.03, 0, 0, 0, 1, 0];
        const poses = [1, 0.05, 2, 0, s, 0, s, /* sphere high up */ 0, 0.5, 0, 0, 0, 0, 1];
        const [box, ball] = footprints(shapes, poses);
        expect(box.kind).toBe('poly');
        const pts = (box as { points: [number, number][] }).points;
        const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 5);   // its 0.4 length now runs along z
        expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.4, 5);
        expect(box.colour).toBe('rgb(255,0,0)');
        expect(ball).toMatchObject({ kind: 'circle', x: 0, z: 0, r: 0.03 });
    });

    it('a cylinder lying along z (a wheel) shows its side: diameter by width', () => {
        const s = Math.SQRT1_2;
        const [wheel] = footprints([1, 0.0325, 0.013, 0, 0.1, 0.1, 0.1], [0, 0.0325, 0, s, 0, 0, s]);
        const pts = (wheel as { points: [number, number][] }).points;
        expect(Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]))).toBeCloseTo(0.065, 5);
        expect(Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]))).toBeCloseTo(0.026, 5);
    });
});
