import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseHex } from '../src/sim/boards/hex';
import { UNO_CLOCK, Uno } from '../src/sim/boards/uno';
import { TEMPLATE_CODE } from '../src/templates/generated';
import { generate } from '../scripts/sync-templates.mjs';

const hex = (name: string) => readFileSync(new URL(`../templates/${name}/${name}.hex`, import.meta.url), 'utf8');
const STEP = UNO_CLOCK / 4800;   // the bench's electrical tick

/** Runs the board for `seconds`, calling `each` after every tick. */
function run(board: Uno, seconds: number, each?: () => void) {
    for (let i = 0; i < seconds * 4800; i++) { board.run(STEP); each?.(); }
}

describe('Intel HEX', () => {
    it('loads data records and refuses damaged ones', () => {
        const flash = parseHex(':03000000010203F7\n:00000001FF\n', 16);
        expect(Array.from(flash.subarray(0, 4))).toEqual([1, 2, 3, 0]);
        expect(() => parseHex(':03000000010203F8\n')).toThrow(/checksum/);
        expect(() => parseHex('hello')).toThrow(/Intel HEX/);
        expect(() => parseHex(':00000001FF\n')).toThrow(/empty/);
        expect(() => parseHex(':03001000010203E7\n', 16)).toThrow(/fit/);
    });
});

describe('the templates', () => {
    it('are bundled from templates/ (run `pnpm sync:templates` after changing a sketch or hex)', () => {
        expect(Object.keys(TEMPLATE_CODE).sort()).toEqual(['blink', 'button', 'hello_serial', 'lcd_hello', 'line_follower', 'motor_driver', 'oled_graphics', 'pick_and_place', 'quad_hover', 'robot_square', 'servo_sweep', 'sevenseg_counter', 'temperature']);
        for (const [name, code] of Object.entries(TEMPLATE_CODE)) {
            expect(code.hex.startsWith(':'), `${name} has a compiled hex`).toBe(true);
            expect(code.sketch).toContain('void loop()');
        }
        expect(generate()).toBe(readFileSync(new URL('../src/templates/generated.ts', import.meta.url), 'utf8'));
    });
});

describe('Uno', () => {
    it('runs Blink: pin 13 is an output toggling every half second', () => {
        const board = new Uno(hex('blink'));
        const edges: number[] = [];
        let last = false;
        run(board, 2.2, () => { const high = board.pin(13).high; if (high !== last) { edges.push(board.time); last = high; } });
        expect(board.pin(13).mode).toBe('output');
        expect(edges.length).toBeGreaterThanOrEqual(4);
        for (let i = 1; i < edges.length; i++) expect(edges[i] - edges[i - 1]).toBeCloseTo(0.5, 2);
        expect(board.pin(12).mode).toBe('input');   // untouched pins stay inputs
    });

    it('runs Button: a pulled-up input, the LED follows the button, Serial reports presses', () => {
        const board = new Uno(hex('button'));
        board.setDigital(2, true);           // nothing pulls the pin down: the pull-up holds it high
        run(board, 0.2);
        expect(board.pin(2).mode).toBe('input_pullup');
        expect(board.pin(13).high).toBe(false);
        expect(board.serial).toContain('press the button');
        board.setDigital(2, false);          // pressed: the circuit pulls the pin to ground
        run(board, 0.1);
        expect(board.pin(13).high).toBe(true);
        expect(board.serial.at(-1)).toBe('pressed');
        board.setDigital(2, true);
        run(board, 0.1);
        expect(board.pin(13).high).toBe(false);
        expect(board.serial.at(-1)).toBe('released');
    });

    it('runs Servo sweep: pin 9 carries 50 Hz pulses between 0.5 and 2.5 ms that sweep', () => {
        const board = new Uno(hex('servo_sweep'));
        run(board, 0.3);
        const early = board.pin(9);
        expect(early.mode).toBe('output');
        expect(early.periodUs).toBeCloseTo(20000, -2);
        expect(early.pulseUs).toBeGreaterThan(400);
        expect(early.pulseUs).toBeLessThan(2600);
        run(board, 1.0);
        const later = board.pin(9);
        expect(later.pulseUs).toBeGreaterThan(early.pulseUs + 300);   // sweeping up
    });

    it('runs Hello: prints a line a second with millis and the A0 reading, which follows the voltage we set', () => {
        const board = new Uno(hex('hello_serial'));
        board.setAnalog(0, 2.5);
        run(board, 2.1);
        expect(board.serial.length).toBeGreaterThanOrEqual(2);
        expect(board.serial[0]).toMatch(/^hello from the bench, t=\d+ ms, A0=\d+$/);
        const reading = Number(board.serial[1].match(/A0=(\d+)/)![1]);
        expect(reading).toBeGreaterThan(500);   // 2.5 V of 5 V ≈ 512
        expect(reading).toBeLessThan(525);
        const t = board.serial.map(l => Number(l.match(/t=(\d+)/)![1]));
        expect(t[1] - t[0]).toBeCloseTo(1000, -1);
    });

    it('measures PWM duty over a step', () => {
        const board = new Uno(hex('blink'));
        run(board, 1.0);
        let on = 0, total = 0;
        for (let i = 0; i < 4800; i++) { board.run(STEP); on += board.pin(13).duty; total++; }
        expect(on / total).toBeCloseTo(0.5, 1);
    });

    it('is deterministic', () => {
        const a = new Uno(hex('hello_serial')), b = new Uno(hex('hello_serial'));
        run(a, 1.5); run(b, 1.5);
        expect(a.serial).toEqual(b.serial);
        expect(a.cpu.cycles).toBe(b.cpu.cycles);
    });
});
