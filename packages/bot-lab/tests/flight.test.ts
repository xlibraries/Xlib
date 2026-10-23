import { describe, expect, it } from 'vitest';
import { Bench, QUAD_MOTOR, escThrottle } from '../src/sim/bench';
import { addPart, connect, emptyProject } from '../src/sim/project';

/** A Pi (it can set any pulse width) with a brushless motor on GPIO18 from an 11.1 V pack, and an HC-SR04 on GPIO17/27 */
function rig() {
    const p = emptyProject();
    addPart(p, 'pi', 0, 0);
    const m = addPart(p, 'quadmotor', 20, 0), b = addPart(p, 'battery', 20, 10), r = addPart(p, 'hcsr04', 30, 0);
    b.props.volts = 11.1; b.props.ohms = 0.05;
    connect(p, { part: 'pi1', pin: 'GPIO18' }, { part: m.id, pin: 'sig' });
    connect(p, { part: b.id, pin: '+' }, { part: m.id, pin: 'v' });
    connect(p, { part: b.id, pin: '-' }, { part: m.id, pin: 'gnd' });
    connect(p, { part: b.id, pin: '-' }, { part: 'pi1', pin: 'GND' });
    connect(p, { part: 'pi1', pin: '5V' }, { part: r.id, pin: 'VCC' });
    connect(p, { part: 'pi1', pin: 'GND2' }, { part: r.id, pin: 'GND' });
    connect(p, { part: 'pi1', pin: 'GPIO17' }, { part: r.id, pin: 'TRIG' });
    connect(p, { part: 'pi1', pin: 'GPIO27' }, { part: r.id, pin: 'ECHO' });
    const bench = new Bench(p);
    bench.pi!.setMode(18, 'output');
    bench.pi!.setMode(17, 'output');
    bench.pi!.setMode(27, 'input');
    return bench;
}

describe('the brushless motor and its ESC', () => {
    it('maps pulses to throttle: 1000 µs off, 2000 µs full, nonsense is no signal', () => {
        expect(escThrottle(1000)).toBe(0);
        expect(escThrottle(2000)).toBe(1);
        expect(escThrottle(1500)).toBeCloseTo(0.5, 1);
        expect(escThrottle(0)).toBeNull();
        expect(escThrottle(5000)).toBeNull();
    });

    it('ignores throttle until armed by a low pulse, then spins up; thrust goes with speed squared; the pack sags; a lost signal disarms', () => {
        const bench = rig();
        bench.pi!.pulse(18, 1500, 20_000);
        bench.run(1.2);
        expect(bench.state('quadmotor1').armed).toBe(false);
        expect(bench.state('quadmotor1').thrust).toBe(0);
        expect(bench.warnings.some(w => /isn.t armed/.test(w.text))).toBe(true);
        bench.pi!.pulse(18, 1000, 20_000);
        bench.run(0.5);
        expect(bench.state('quadmotor1').armed).toBe(true);
        bench.pi!.pulse(18, 1950, 20_000);
        bench.run(0.3);
        const full = bench.state('quadmotor1');
        expect(full.thrust).toBeGreaterThan(QUAD_MOTOR.maxThrust * 0.85);
        expect(full.amps).toBeGreaterThan(10);
        expect(bench.volts({ part: 'battery1', pin: '+' })).toBeLessThan(11.1 - 0.5);   // 0.05 Ω × the current
        bench.pi!.pulse(18, 1500, 20_000);
        bench.run(0.3);
        const half = bench.state('quadmotor1').thrust!;
        expect(half / full.thrust!).toBeGreaterThan(0.2);
        expect(half / full.thrust!).toBeLessThan(0.35);
        bench.pi!.write(18, false);                         // the signal stops
        bench.run(0.8);
        expect(bench.state('quadmotor1').armed).toBe(false);
        expect(bench.state('quadmotor1').thrust).toBeLessThan(0.05);
    });
});

describe('the HC-SR04', () => {
    it('answers a trigger pulse with an echo 58 µs long per centimetre', () => {
        const bench = rig();
        bench.run(0.01);
        const measure = () => {
            bench.pi!.write(17, true);
            bench.run(0.0004);
            bench.pi!.write(17, false);
            let high = 0;
            for (let i = 0; i < 4800 * 0.04; i++) { bench.tick(); if (bench.volts({ part: 'hcsr041', pin: 'ECHO' }) > 2.5) high++; }
            return high / 4800;
        };
        expect(measure()).toBeCloseTo(100 * 58e-6, 3);
        bench.setProp('hcsr041', 'distance', 30);
        expect(measure()).toBeCloseTo(30 * 58e-6, 3);
    });
});

import { beforeAll } from 'vitest';
import { MachineWorld, type WorldModule } from '../src/sim/world';
import type { Project } from '../src/sim/project';

let createWorld: () => Promise<WorldModule>;
beforeAll(async () => { createWorld = (await import('../dist/world/headless.js' as string)).default; });

/** A quad driven straight from a Pi's pulses (no flight controller): four ESCs, a 3S pack, an MPU-6050 and an HC-SR04 */
function quadProject(): Project {
    const p = emptyProject();
    addPart(p, 'pi', 0, 0);
    const pins = ['GPIO18', 'GPIO13', 'GPIO12', 'GPIO19'];
    const pack = addPart(p, 'battery', 20, 20);
    pack.props.volts = 11.1; pack.props.ohms = 0.02;
    const motors = pins.map((pin, i) => {
        const m = addPart(p, 'quadmotor', 20, i * 6);
        m.props.spin = i === 0 || i === 3 ? 'CW' : 'CCW';            // front-left and back-right CW, the others CCW
        connect(p, { part: 'pi1', pin }, { part: m.id, pin: 'sig' });
        connect(p, { part: pack.id, pin: '+' }, { part: m.id, pin: 'v' });
        connect(p, { part: pack.id, pin: '-' }, { part: m.id, pin: 'gnd' });
        return m.id;
    });
    connect(p, { part: pack.id, pin: '-' }, { part: 'pi1', pin: 'GND' });
    const imu = addPart(p, 'mpu6050', 30, 0), ranger = addPart(p, 'hcsr04', 30, 10);
    for (const [from, to] of [['GPIO2', 'SDA'], ['GPIO3', 'SCL'], ['3V3', 'VCC'], ['GND2', 'GND']]) connect(p, { part: 'pi1', pin: from }, { part: imu.id, pin: to });
    for (const [from, to] of [['5V', 'VCC'], ['GND2', 'GND'], ['GPIO17', 'TRIG'], ['GPIO27', 'ECHO']]) connect(p, { part: 'pi1', pin: from }, { part: ranger.id, pin: to });
    p.world = { quad: { frontLeft: motors[0], frontRight: motors[1], backLeft: motors[2], backRight: motors[3], imu: imu.id, range: ranger.id, x: 0, z: 0, heading: 0 }, track: { width: 0.019, points: [], closed: false } };
    return p;
}

describe('the quad', () => {
    async function flying() {
        const project = quadProject();
        const bench = new Bench(project);
        const world = new MachineWorld(await createWorld(), bench, project.world!);
        const pins = [18, 13, 12, 19];
        for (const pin of pins) bench.pi!.setMode(pin, 'output');
        const throttle = (...us: number[]) => pins.forEach((pin, i) => bench.pi!.pulse(pin, us[i] ?? us[0], 20_000));
        throttle(1000);
        bench.run(0.5);                                       // arm the ESCs
        return { bench, world, throttle };
    }

    it('sits on the ground armed; full-ish throttle climbs; the rangefinder sees the height', async () => {
        const { bench, world, throttle } = await flying();
        expect(world.quad()!.position[1]).toBeLessThan(0.05);
        expect(bench.state('hcsr041').armed).toBeUndefined();
        throttle(1700);
        bench.run(0.8);
        const q = world.quad()!;
        expect(q.position[1]).toBeGreaterThan(0.3);
        expect(q.velocity[1]).toBeGreaterThan(0.3);
        const part = bench.project.parts.find(p => p.id === 'hcsr041')!;
        expect(Number(part.props.distance)).toBeCloseTo(q.position[1] * 100, -1);
    }, 60_000);

    it('the IMU feels 1 g up on the ground, more while it accelerates upwards; a nose-up pitch reads on the gyro', async () => {
        const { bench, world, throttle } = await flying();
        const imu = () => bench.motion.get('mpu60501')!;
        expect(imu().accel![2]).toBeCloseTo(1, 1);
        throttle(1750);
        bench.run(0.15);
        expect(imu().accel![2]).toBeGreaterThan(1.3);                    // climbing hard
        throttle(1700, 1700, 1450, 1450);                                // front motors harder than the back: nose up
        bench.run(0.15);
        expect(imu().gy).toBeLessThan(-20);                              // nose up turns about the chip's −Y (its Y points left)
        expect(world.quad()!.position[1]).toBeGreaterThan(0.02);
    }, 60_000);
});

describe('the quadcopter hover template', () => {
    it('the Uno flight controller takes off, holds 50 cm level for over 10 s, and lands softly', async () => {
        const project = (await import('../src/templates')).template('quad_hover')!.build();
        const bench = new Bench(project);
        const world = new MachineWorld(await createWorld(), bench, project.world!);
        let highest = 0, steepest = 0;
        for (let t = 0; t < 21; t += 0.5) {
            bench.run(0.5);
            const h = world.state().hover!;
            if (t > 6 && t < 15) { highest = Math.max(highest, Math.abs(h.altitude - 0.5)); steepest = Math.max(steepest, h.tilt); }
        }
        const hover = world.state().hover!;
        expect(hover.phase).toBe('landed');
        expect(hover.best).toBeGreaterThan(10);
        expect(hover.touchdown!).toBeLessThan(0.5);
        expect(hover.passed).toBe(true);
        expect(highest).toBeLessThan(0.1);
        expect(steepest).toBeLessThan(5);
        expect(bench.board!.serial.some(l => /^roll:-?\d+\.\d,pitch:-?\d+\.\d,height:\d+,target:\d+$/.test(l))).toBe(true);
        expect(bench.state('quadmotor1').thrust).toBeLessThan(0.05);           // it stopped the motors once down
    }, 120_000);
});
