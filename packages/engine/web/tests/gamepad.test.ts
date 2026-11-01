import { describe, expect, it } from 'vitest';
import { BUTTONS, deadzone, NO_PAD, readPad, samePad } from '../src/gamepad';

const pad = (axes: number[], pressed: number[] = [], connected = true) => ({
    connected, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

describe('deadzone', () => {
    it('ignores small drift and still reaches full tilt', () => {
        expect(deadzone(0.1)).toBe(0);
        expect(deadzone(-0.14)).toBe(0);
        expect(deadzone(1)).toBe(1);
        expect(deadzone(-1)).toBe(-1);
        expect(deadzone(0.575)).toBeCloseTo(0.5, 3);
        expect(deadzone(Number.NaN)).toBe(0);
    });
});

describe('readPad', () => {
    it('reads the first connected pad: sticks and a button bitmask', () => {
        const state = readPad([null, pad([0, 0, 0, 0], [], false), pad([0.9, -0.05, -1, 0.5], [BUTTONS.A, BUTTONS.RIGHT])]);
        expect(state.connected).toBe(true);
        expect(state.lx).toBeCloseTo((0.9 - 0.15) / 0.85, 5);
        expect(state.ly).toBe(0);
        expect(state.rx).toBe(-1);
        expect(state.buttons).toBe((1 << BUTTONS.A) | (1 << BUTTONS.RIGHT));
    });

    it('counts analogue triggers past halfway as pressed', () => {
        const p = pad([0, 0, 0, 0]);
        p.buttons[BUTTONS.RT] = { pressed: false, value: 0.8 };
        expect(readPad([p]).buttons).toBe(1 << BUTTONS.RT);
    });

    it('reports nothing without a pad', () => {
        expect(readPad([])).toEqual(NO_PAD);
        expect(readPad(null)).toEqual(NO_PAD);
        expect(samePad(readPad([pad([0, 0, 0, 0])]), NO_PAD)).toBe(false);
    });
});

describe('readPad edge cases', () => {
    it('reads missing axes as centred, button values without pressed, and ignores buttons past 31', () => {
        const p = { connected: true, axes: [0.5], buttons: [{ pressed: false }, { pressed: false, value: 0.2 }, ...Array.from({ length: 31 }, () => ({ pressed: true }))] };
        const state = readPad([p]);
        expect(state.ry).toBe(0);                              // no fourth axis
        expect(state.buttons & 0b11).toBe(0);                  // no value at all; a light touch
        expect(state.buttons >>> 0).toBe(0xFFFFFFFC);           // 2..31 pressed, nothing past 31, unsigned
    });

    it('compares every field', () => {
        const base = readPad([pad([0.5, 0.5, 0.5, 0.5], [BUTTONS.A])]);
        for (const key of ['lx', 'ly', 'rx', 'ry', 'buttons'] as const) expect(samePad(base, { ...base, [key]: 0 })).toBe(false);
        expect(samePad(base, { ...base })).toBe(true);
    });
});
