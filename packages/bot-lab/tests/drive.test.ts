import { describe, expect, it } from 'vitest';
import { Bench, motorModel } from '../src/sim/bench';
import { addPart, connect, emptyProject, type Project } from '../src/sim/project';
import { template } from '../src/templates';

/** A motor straight across a battery */
function motorOnBattery(volts = 6): Project {
    const p = emptyProject();
    const b = addPart(p, 'battery', 0, 0), m = addPart(p, 'motor', 10, 0);
    b.props.volts = volts; b.props.ohms = 0.05;
    connect(p, { part: b.id, pin: '+' }, { part: m.id, pin: '+' });
    connect(p, { part: b.id, pin: '-' }, { part: m.id, pin: '-' });
    return p;
}

describe('the DC motor', () => {
    it('its model gives the rated no-load speed and stall current', () => {
        const m = motorModel(6, 200, 1);
        expect(m.ohms).toBe(6);
        expect(m.stallTorque).toBeCloseTo(m.ke * 1, 6);
    });

    it('spins up to about its rated speed, idling at a fraction of stall current; loaded, it stalls and draws stall current', () => {
        const bench = new Bench(motorOnBattery());
        bench.run(0.5);
        expect(bench.state('motor1').rpm).toBeGreaterThan(190);
        expect(bench.state('motor1').rpm).toBeLessThan(205);
        expect(bench.state('motor1').amps).toBeCloseTo(0.15, 1);
        bench.setProp('motor1', 'load', 1);
        bench.run(0.5);
        expect(Math.abs(bench.state('motor1').rpm!)).toBeLessThan(1);
        expect(bench.state('motor1').amps).toBeCloseTo(1, 1);
        bench.run(2.1);
        expect(bench.warnings.some(w => /stalled/.test(w.text))).toBe(true);
    });

    it('half the voltage, about half the speed; reversed, it turns the other way', () => {
        const half = new Bench(motorOnBattery(3));
        half.run(0.5);
        expect(half.state('motor1').rpm).toBeGreaterThan(90);
        expect(half.state('motor1').rpm).toBeLessThan(105);
        const p = motorOnBattery();
        p.wires = [{ a: { part: 'battery1', pin: '+' }, b: { part: 'motor1', pin: '-' } }, { a: { part: 'battery1', pin: '-' }, b: { part: 'motor1', pin: '+' } }];
        const reversed = new Bench(p);
        reversed.run(0.5);
        expect(reversed.state('motor1').rpm).toBeLessThan(-190);
    });
});

/** A TB6612 with buttons from its VCC to STBY, AIN1, AIN2 and PWMA, channel A to a motor, a 6 V battery on VM (the
 *  batteries' minus terminals are the ground) */
function driverBench(): Bench {
    const p = emptyProject();
    const logic = addPart(p, 'battery', 0, 0), motorBattery = addPart(p, 'battery', 0, 10), d = addPart(p, 'tb6612', 10, 0), m = addPart(p, 'motor', 20, 0);
    logic.props.volts = 5; logic.props.ohms = 0.01; motorBattery.props.volts = 6; motorBattery.props.ohms = 0.05;
    connect(p, { part: logic.id, pin: '+' }, { part: d.id, pin: 'VCC' });
    connect(p, { part: logic.id, pin: '-' }, { part: d.id, pin: 'GND' });
    connect(p, { part: motorBattery.id, pin: '+' }, { part: d.id, pin: 'VM' });
    connect(p, { part: motorBattery.id, pin: '-' }, { part: d.id, pin: 'GND' });
    for (const pin of ['STBY', 'AIN1', 'AIN2', 'PWMA']) {
        const b = addPart(p, 'button', 0, 20);
        b.id = `btn_${pin}`;
        connect(p, { part: d.id, pin: 'VCC' }, { part: b.id, pin: 'a' });
        connect(p, { part: b.id, pin: 'b' }, { part: d.id, pin });
    }
    connect(p, { part: d.id, pin: 'AO1' }, { part: m.id, pin: '+' });
    connect(p, { part: d.id, pin: 'AO2' }, { part: m.id, pin: '-' });
    return new Bench(p);
}

describe('the TB6612', () => {
    const press = (b: Bench, pins: string[]) => { for (const pin of ['STBY', 'AIN1', 'AIN2', 'PWMA']) b.setProp(`btn_${pin}`, 'pressed', pins.includes(pin)); };

    it('follows its truth table: forward, reverse, nothing without STBY, coast and short brake', () => {
        const b = driverBench();
        press(b, ['STBY', 'AIN1', 'PWMA']);
        b.run(0.5);
        expect(b.state('motor1').rpm).toBeGreaterThan(180);
        press(b, ['STBY', 'AIN2', 'PWMA']);
        b.run(0.8);
        expect(b.state('motor1').rpm).toBeLessThan(-180);
        press(b, ['AIN1', 'PWMA']);                // STBY low: outputs off, the motor coasts down
        b.run(0.05);
        const coasting = Math.abs(b.state('motor1').rpm!);
        expect(Math.abs(b.state('motor1').amps!)).toBeLessThan(0.01);
        // short brake stops it much faster than coasting
        press(b, ['STBY', 'AIN1', 'PWMA']);
        b.run(0.5);
        press(b, ['STBY', 'AIN1', 'AIN2']);
        b.run(0.05);
        const braking = Math.abs(b.state('motor1').rpm!);
        expect(braking).toBeLessThan(coasting / 2);
    });
});

describe('the TCRT5000 line sensor', () => {
    function sensor(): Bench {
        const p = emptyProject();
        addPart(p, 'uno', 0, 0);
        const s = addPart(p, 'tcrt5000', 20, 0);
        connect(p, { part: 'uno1', pin: '5V' }, { part: s.id, pin: 'VCC' });
        connect(p, { part: 'uno1', pin: 'GND' }, { part: s.id, pin: 'GND' });
        connect(p, { part: 'uno1', pin: 'A0' }, { part: s.id, pin: 'AO' });
        connect(p, { part: 'uno1', pin: 'D2' }, { part: s.id, pin: 'DO' });
        return new Bench(p);
    }

    it('over white: AO low, DO low, its LED lit; over a black line: AO high, DO high', () => {
        const b = sensor();
        b.run(0.01);
        expect(b.volts({ part: 'tcrt50001', pin: 'AO' })).toBeLessThan(0.6);
        expect(b.volts({ part: 'tcrt50001', pin: 'DO' })).toBeLessThan(0.5);
        expect(b.state('tcrt50001').led).toBe(true);
        b.setProp('tcrt50001', 'reflect', 0);
        b.run(0.01);
        expect(b.volts({ part: 'tcrt50001', pin: 'AO' })).toBeGreaterThan(4.4);
        expect(b.volts({ part: 'tcrt50001', pin: 'DO' })).toBeGreaterThan(4.5);
        expect(b.state('tcrt50001').led).toBe(false);
        // grey sits either side of the threshold the knob sets
        b.setProp('tcrt50001', 'reflect', 0.5);
        b.setProp('tcrt50001', 'threshold', 0.7);
        b.run(0.01);
        expect(b.volts({ part: 'tcrt50001', pin: 'DO' })).toBeLessThan(0.5);
        b.setProp('tcrt50001', 'threshold', 0.3);
        b.run(0.01);
        expect(b.volts({ part: 'tcrt50001', pin: 'DO' })).toBeGreaterThan(4.5);
    });
});

describe('the motor templates', () => {
    it('Motor and driver (Uno): PWM ramps the motor up forwards, then backwards', () => {
        const bench = new Bench(template('motor_driver')!.build());
        const speeds: number[] = [];
        for (let i = 0; i < 12; i++) { bench.run(0.5); speeds.push(Math.round(bench.state('motor1').rpm!)); }
        expect(bench.board!.serial.slice(0, 6)).toEqual(['speed 0', 'speed 51', 'speed 102', 'speed 153', 'speed 204', 'speed 255']);
        // forward speeds climb with the duty cycle, then the reverse ramp spins it the other way
        expect(speeds[1]).toBeGreaterThan(20);
        expect(speeds[5]).toBeGreaterThan(speeds[3]);
        expect(speeds[5]).toBeGreaterThan(150);
        expect(Math.min(...speeds.slice(6))).toBeLessThan(-150);
        expect(bench.warnings.filter(w => !/stalled/.test(w.text))).toEqual([]);
    });
});
