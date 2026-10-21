import { describe, expect, it } from 'vitest';
import { PiBoard } from '../src/sim/boards/pi';
import { Bench } from '../src/sim/bench';
import { addPart, connect, emptyProject } from '../src/sim/project';

describe('PiBoard', () => {
    it('drives levels, pulls, and software PWM with the right duty and pulse width', () => {
        const pi = new PiBoard();
        expect(pi.mode(17)).toBe('input');
        pi.setMode(17, 'output');
        pi.write(17, true);
        pi.run(1 / 4800);
        expect(pi.activity(17)).toMatchObject({ mode: 'output', high: true, duty: 1 });
        pi.pwm(17, 100, 0.25);
        let on = 0, steps = 0;
        for (let i = 0; i < 4800; i++) { pi.run(1 / 4800); on += pi.activity(17).duty; steps++; }
        expect(on / steps).toBeCloseTo(0.25, 2);
        expect(pi.activity(17).periodUs).toBeCloseTo(10_000, -1);
        expect(pi.activity(17).pulseUs).toBeCloseTo(2_500, -1);
        pi.pulse(18, 1500);                      // a servo frame
        pi.setMode(18, 'output');
        for (let i = 0; i < 480; i++) pi.run(1 / 4800);
        expect(pi.activity(18).periodUs).toBeCloseTo(20_000, -1);
        expect(pi.activity(18).pulseUs).toBeCloseTo(1500, -1);
        pi.setMode(4, 'input', 'up');
        expect(pi.mode(4)).toBe('input_pullup');
        pi.setInput(4, false);
        expect(pi.read(4)).toBe(false);
        expect(() => pi.write(99, true)).toThrow(/header/);
        expect(pi.time).toBeCloseTo(1.1, 2);
    });
});

describe('a Pi on the bench', () => {
    it('lights an LED through a resistor at 3.3 V, reads a pulled-up button, and warns on an overloaded pin', () => {
        const p = emptyProject('pi');
        addPart(p, 'pi', 0, 0);
        const r = addPart(p, 'resistor', 1, 1), led = addPart(p, 'led', 2, 2), b = addPart(p, 'button', 3, 3), bare = addPart(p, 'led', 4, 4);
        connect(p, { part: 'pi1', pin: 'GPIO17' }, { part: r.id, pin: 'a' });
        connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
        connect(p, { part: led.id, pin: 'k' }, { part: 'pi1', pin: 'GND' });
        connect(p, { part: 'pi1', pin: 'GPIO4' }, { part: b.id, pin: 'a' });
        connect(p, { part: b.id, pin: 'b' }, { part: 'pi1', pin: 'GND2' });
        connect(p, { part: 'pi1', pin: 'GPIO18' }, { part: bare.id, pin: 'a' });
        connect(p, { part: bare.id, pin: 'k' }, { part: 'pi1', pin: 'GND' });
        const bench = new Bench(p);
        expect(bench.pi).not.toBeNull();
        expect(bench.board).toBeNull();
        const pi = bench.pi!;
        pi.setMode(17, 'output'); pi.write(17, true);
        pi.setMode(4, 'input', 'up');
        bench.run(0.05);
        expect(bench.volts({ part: 'pi1', pin: 'GPIO17' })).toBeGreaterThan(3.0);
        const amps = bench.state('led1').amps!;
        expect(amps).toBeGreaterThan(0.004);        // (3.3 - 1.8) V / 270 Ω ≈ 5.5 mA
        expect(amps).toBeLessThan(0.007);
        expect(bench.state('led1').brightness).toBeGreaterThan(0.5);
        const ledBrightnessAt3v3 = bench.state('led1').brightness!;
        expect(bench.volts({ part: 'pi1', pin: 'GPIO4' })).toBeGreaterThan(3.0);   // the pull-up
        expect(pi.read(4)).toBe(true);
        bench.setProp('button1', 'pressed', true);
        bench.run(0.05);
        expect(pi.read(4)).toBe(false);
        pi.pwm(17, 100, 0.5);
        let sum = 0;
        for (let i = 0; i < 480; i++) { bench.tick(); sum += bench.state('led1').brightness ?? 0; }
        expect(sum / 480 / ledBrightnessAt3v3).toBeCloseTo(0.5, 1);  // half the time lit
        pi.setMode(18, 'output'); pi.write(18, true);  // an LED with no resistor on a Pi pin
        bench.run(0.2);
        expect(bench.warnings.some(w => w.part === 'pi' && /GPIO18 is sourcing/.test(w.text))).toBe(true);
    });
});
