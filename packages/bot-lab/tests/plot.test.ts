import { describe, expect, it } from 'vitest';
import { parsePlotLine, plotLines } from '../src/plot';

describe('the Serial Plotter', () => {
    it('reads name:value pairs and bare numbers, and skips messages', () => {
        expect(parsePlotLine('roll:0.5,pitch:-1.2,height:50')).toEqual([['roll', 0.5], ['pitch', -1.2], ['height', 50]]);
        expect(parsePlotLine('12 34\t5.5')).toEqual([['1', 12], ['2', 34], ['3', 5.5]]);
        expect(parsePlotLine('a:1 b:2e3')).toEqual([['a', 1], ['b', 2000]]);
        expect(parsePlotLine('Hello, world')).toBeNull();
        expect(parsePlotLine('cube 2 in the bin')).toBeNull();
        expect(parsePlotLine('')).toBeNull();
        expect(parsePlotLine('state:ready,height:3')).toEqual([['height', 3]]);
    });

    it('lines become series over the last lines, with gaps where a value is missing', () => {
        const plot = plotLines(['booting', 'a:1,b:10', 'a:2', 'a:3,b:30,c:-5'], 3);
        expect(plot.names).toEqual(['a', 'b', 'c']);
        expect(plot.length).toBe(3);
        expect(plot.series[0]).toEqual([1, 2, 3]);
        expect(plot.series[1][1]).toBeNaN();
        expect(plot.min).toBe(-5);
        expect(plot.max).toBe(30);
        expect(plotLines(['a:4', 'a:4'])).toMatchObject({ min: 3, max: 5 });
        expect(plotLines(['nothing here']).length).toBe(0);
    });
});
