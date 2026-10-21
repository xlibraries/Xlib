import { describe, expect, it } from 'vitest';
import { Bench, ldrOhms, ledBrightness } from '../src/sim/bench';
import { addPart, boardOf, connect, disconnect, emptyProject, loadProjects, nets, parseProject, removePart, saveProjects } from '../src/sim/project';
import { TEMPLATES, template } from '../src/templates';
import { CATALOG, defaultProps } from '../src/sim/parts/catalog';

describe('projects', () => {
    it('adds parts with fresh ids and default props, wires them, and groups nets', () => {
        const p = emptyProject('t');
        const u = addPart(p, 'uno', 0, 0), r = addPart(p, 'resistor', 1, 1), r2 = addPart(p, 'resistor', 2, 2);
        expect([u.id, r.id, r2.id]).toEqual(['uno1', 'resistor1', 'resistor2']);
        expect(r.props).toEqual(defaultProps('resistor'));
        expect(connect(p, { part: 'uno1', pin: 'D13' }, { part: 'resistor1', pin: 'a' })).toBe(true);
        expect(connect(p, { part: 'resistor1', pin: 'a' }, { part: 'uno1', pin: 'D13' })).toBe(false);   // already there
        expect(connect(p, { part: 'resistor1', pin: 'a' }, { part: 'resistor1', pin: 'a' })).toBe(false);
        connect(p, { part: 'resistor1', pin: 'b' }, { part: 'resistor2', pin: 'a' });
        expect(nets(p)).toEqual([['resistor1.a', 'uno1.D13'], ['resistor1.b', 'resistor2.a']]);
        disconnect(p, { part: 'resistor2', pin: 'a' }, { part: 'resistor1', pin: 'b' });
        expect(nets(p)).toEqual([['resistor1.a', 'uno1.D13']]);
        removePart(p, 'resistor1');
        expect(p.wires).toEqual([]);
        expect(p.parts.map(x => x.id)).toEqual(['uno1', 'resistor2']);
    });

    it('parses untrusted JSON forgivingly: unknown parts, dangling wires and wild props are dropped or clamped', () => {
        const p = parseProject({
            name: 'x'.repeat(100),
            parts: [{ id: 'uno1', kind: 'uno', x: 1, y: 2 }, { id: 'r', kind: 'resistor', x: 'no', props: { ohms: 1e12, colour: 'red' } }, { id: 'bad', kind: 'flux-capacitor' }, { id: 'uno1', kind: 'uno' }, { id: 'l', kind: 'led', props: { colour: 'plaid' } }],
            wires: [{ a: { part: 'uno1', pin: 'D1' }, b: { part: 'r', pin: 'a' } }, { a: { part: 'uno1', pin: 'D99' }, b: { part: 'r', pin: 'b' } }, { a: { part: 'bad', pin: 'x' }, b: { part: 'r', pin: 'b' } }, 'nope'],
            code: { sketch: 'void loop(){}', hex: 'not hex' },
        });
        expect(p.name).toHaveLength(60);
        expect(p.parts.map(x => x.id)).toEqual(['uno1', 'r', 'l']);
        expect(p.parts[1].props.ohms).toBe(10_000_000);
        expect(p.parts[1].x).toBe(0);
        expect(p.parts[2].props.colour).toBe('red');
        expect(p.wires).toEqual([{ a: { part: 'uno1', pin: 'D1' }, b: { part: 'r', pin: 'a' } }]);
        expect(p.code).toEqual({ board: 'uno', sketch: 'void loop(){}', hex: '' });
        expect(parseProject(null).parts).toEqual([]);
        expect(parseProject('x').name).toBe('Untitled');
    });

    it('round-trips through storage', () => {
        const store = new Map<string, string>();
        const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
        const blink = template('blink')!.build();
        saveProjects([{ id: 'a', project: blink, updated: 5 }], storage);
        const back = loadProjects(storage);
        expect(back).toHaveLength(1);
        expect(back[0].project).toEqual(blink);
        expect(loadProjects({ getItem: () => '{broken' })).toEqual([]);
    });

    it('every template wires only pins that exist and parses back unchanged', () => {
        for (const t of TEMPLATES) {
            const p = t.build();
            expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
            for (const w of p.wires) for (const ref of [w.a, w.b]) {
                const part = p.parts.find(x => x.id === ref.part)!;
                expect(CATALOG[part.kind].pins.some(pin => pin.id === ref.pin), `${t.id}: ${ref.part}.${ref.pin}`).toBe(true);
            }
        }
    });
});

describe('the board that runs the code', () => {
    it('is the Pi only when the bench has a Pi and no Uno', () => {
        const p = emptyProject();
        expect(boardOf(p)).toBe('uno');
        addPart(p, 'pi', 0, 0);
        expect(boardOf(p)).toBe('pi');
        addPart(p, 'uno', 0, 0);
        expect(boardOf(p)).toBe('uno');
    });

    it('every Pi template runs Python on the Pi and every Uno template a sketch on the Uno', () => {
        for (const t of TEMPLATES) {
            const p = t.build();
            expect(p.code.board).toBe(boardOf(p));
            if (p.code.board === 'pi') expect(p.code.sketch).toMatch(/^from gpiozero import|^import RPi/m);
            else if (p.parts.some(x => x.kind === 'uno')) expect(p.code.hex).not.toBe('');
        }
    });
});

describe('LED brightness', () => {
    it('follows the square root of current up to the rating, and is dark below zero', () => {
        expect(ledBrightness(0)).toBe(0);
        expect(ledBrightness(-0.001)).toBe(0);
        expect(ledBrightness(0.005)).toBeCloseTo(0.5, 5);
        expect(ledBrightness(0.02)).toBe(1);
        expect(ledBrightness(0.04)).toBe(1);
    });

    it('a Pi pin (3.3 V) through 220 Ω lights the LED visibly, though with less current than the Uno', () => {
        const b = new Bench(template('pi_blink')!.build());
        b.pi!.setMode(17, 'output', 'none');
        b.pi!.write(17, true);
        b.run(0.05);
        expect(b.state('led1').amps).toBeGreaterThan(0.004);
        expect(b.state('led1').amps).toBeLessThan(0.008);
        expect(b.state('led1').brightness).toBeGreaterThan(0.5);
    });
});

describe('the bench', () => {
    it('runs Blink: the LED lights and goes out with pin 13, drawing about 15 mA through 220 Ω', () => {
        const bench = new Bench(template('blink')!.build());
        const samples: number[] = [];
        let amps = 0;
        for (let i = 0; i < 12; i++) {   // 1.2 s: a little over one blink cycle
            bench.run(0.1);
            const s = bench.state('led1');
            samples.push(s.brightness ?? 0);
            amps = Math.max(amps, s.amps ?? 0);
        }
        expect(Math.max(...samples)).toBeGreaterThan(0.6);
        expect(Math.min(...samples)).toBe(0);
        const lit = samples.filter(b => b > 0.5).length;
        expect(lit).toBeGreaterThan(3);
        expect(lit).toBeLessThan(9);
        expect(amps).toBeGreaterThan(0.01);   // (5 - 1.8) V / (220 + 40) Ω ≈ 12 mA when lit
        expect(amps).toBeLessThan(0.02);
        expect(bench.warnings).toEqual([]);
    });

    it('runs Button: pressing it pulls D2 low, the LED follows, Serial reports it', () => {
        const bench = new Bench(template('button')!.build());
        bench.run(0.3);
        expect(bench.volts({ part: 'uno1', pin: 'D2' })).toBeGreaterThan(4.5);    // the pull-up
        expect(bench.state('led1').brightness).toBe(0);
        expect(bench.board!.serial).toContain('press the button');
        bench.setProp('button1', 'pressed', true);
        bench.run(0.2);
        expect(bench.volts({ part: 'uno1', pin: 'D2' })).toBeLessThan(0.1);
        expect(bench.state('led1').brightness).toBeGreaterThan(0.6);
        expect(bench.board!.serial.at(-1)).toBe('pressed');
        bench.setProp('button1', 'pressed', false);
        bench.run(0.2);
        expect(bench.state('led1').brightness).toBe(0);
        expect(bench.board!.serial.at(-1)).toBe('released');
    });

    it('runs Servo sweep: the servo follows the pulse on pin 9 across its range', () => {
        const bench = new Bench(template('servo_sweep')!.build());
        const angles: number[] = [];
        for (let i = 0; i < 30; i++) { bench.run(0.1); angles.push(bench.state('servo1').angle!); }
        expect(Math.min(...angles)).toBeLessThan(30);
        expect(Math.max(...angles)).toBeGreaterThan(150);
    });

    it('runs Hello: the knob sets A0, the sketch prints the reading', () => {
        const project = template('hello_serial')!.build();
        const bench = new Bench(project);
        bench.setProp('potentiometer1', 'position', 0.25);   // 1.25 V of 5
        bench.run(2.2);
        const readings = bench.board!.serial.map(l => Number(l.match(/A0=(\d+)/)?.[1]));
        expect(readings.length).toBeGreaterThanOrEqual(2);
        expect(readings.at(-1)).toBeGreaterThan(240);
        expect(readings.at(-1)).toBeLessThan(272);
        expect(bench.volts({ part: 'uno1', pin: 'A0' })).toBeCloseTo(1.25, 1);
    });

    it('runs the RC circuit with no board: the capacitor charges on the button with τ = 1 s', () => {
        const bench = new Bench(template('rc')!.build());
        expect(bench.board).toBeNull();
        bench.run(0.5);
        expect(bench.volts({ part: 'capacitor1', pin: 'a' })).toBeCloseTo(0, 1);
        bench.setProp('button1', 'pressed', true);
        bench.run(1.0);
        expect(bench.volts({ part: 'capacitor1', pin: 'a' })).toBeCloseTo(5 * (1 - Math.exp(-1)), 0);
        expect(bench.state('battery1').amps).toBeGreaterThan(0);
    });

    it('teaches: an LED straight on a pin burns out, and the pin is overloaded', () => {
        const p = emptyProject('oops');
        addPart(p, 'uno', 0, 0);
        const led = addPart(p, 'led', 1, 1);
        p.code = template('blink')!.build().code;
        connect(p, { part: 'uno1', pin: 'D13' }, { part: led.id, pin: 'a' });
        connect(p, { part: led.id, pin: 'k' }, { part: 'uno1', pin: 'GND' });
        const bench = new Bench(p);
        bench.run(1.2);
        expect(bench.warnings.some(w => w.smoke && w.part === 'led1')).toBe(true);
        expect(bench.warnings.some(w => w.part === 'uno' && /D13 is sourcing/.test(w.text))).toBe(true);
        expect(bench.state('led1').dead).toBe(true);
        expect(bench.state('led1').brightness).toBe(0);
    });

    it('light sensor resistance falls with light', () => {
        expect(ldrOhms(1)).toBeCloseTo(1000);
        expect(ldrOhms(0)).toBeCloseTo(100_000);
        expect(ldrOhms(0.5)).toBeCloseTo(10_000);
    });
});
