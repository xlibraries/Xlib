import { describe, expect, it } from 'vitest';
import { Capacitor, CurrentSource, Diode, GROUND, Inductor, Netlist, Resistor, Switch, VoltageSource, solveLinear } from '../src/sim/circuit/mna';

describe('solveLinear', () => {
    it('solves a small system with pivoting', () => {
        expect(solveLinear([[0, 1], [2, 0]], [3, 4])).toEqual([2, 3]);
        const x = solveLinear([[4, 1, 2], [1, 3, 0], [2, 0, 5]], [11, 7, 17]);
        expect(x[0]).toBeCloseTo(28 / 43, 6);
        expect(x[1]).toBeCloseTo((7 - 28 / 43) / 3, 6);
        expect(x[2]).toBeCloseTo((17 - 56 / 43) / 5, 6);
    });
});

describe('DC', () => {
    it('a voltage divider halves the supply, and the source current is V/R', () => {
        const net = new Netlist();
        const top = net.node(), mid = net.node();
        const src = net.add(new VoltageSource(top, GROUND, 5));
        net.add(new Resistor(top, mid, 1000));
        net.add(new Resistor(mid, GROUND, 1000));
        const s = net.dc();
        expect(s.v[top]).toBeCloseTo(5);
        expect(s.v[mid]).toBeCloseTo(2.5);
        expect(s.current(src)).toBeCloseTo(-0.0025, 6);   // flows out of the + terminal: a → b inside the source is negative
        expect(s.converged).toBe(true);
    });

    it('a current source into a resistor gives V = I R, and a floating node reads 0', () => {
        const net = new Netlist();
        const a = net.node(), floating = net.node();
        net.add(new CurrentSource(GROUND, a, 0.002));
        net.add(new Resistor(a, GROUND, 470));
        const s = net.dc();
        expect(s.v[a]).toBeCloseTo(0.94);
        expect(s.v[floating]).toBeCloseTo(0);
    });

    it('a switch opens and closes a path', () => {
        const net = new Netlist();
        const top = net.node(), out = net.node();
        net.add(new VoltageSource(top, GROUND, 5));
        const sw = net.add(new Switch(top, out, false));
        net.add(new Resistor(out, GROUND, 1000));
        expect(net.dc().v[out]).toBeCloseTo(0, 3);
        sw.closed = true;
        expect(net.dc().v[out]).toBeCloseTo(5, 3);
    });

    it('two sources fighting through pin resistances draw a large current (the rule the bench warns about)', () => {
        const net = new Netlist();
        const a = net.node(), b = net.node();
        const high = net.add(new VoltageSource(a, GROUND, 5));
        net.add(new VoltageSource(b, GROUND, 0));
        net.add(new Resistor(a, b, 80));   // two 40 Ω output stages
        expect(Math.abs(net.dc().current(high))).toBeCloseTo(0.0625, 4);   // 62 mA: over an AVR pin's 40 mA
    });
});

describe('diodes', () => {
    it('a diode in series with a resistor drops about 0.6–0.7 V at a few mA', () => {
        const net = new Netlist();
        const top = net.node(), anode = net.node();
        net.add(new VoltageSource(top, GROUND, 5));
        net.add(new Resistor(top, anode, 470));
        const d = net.add(new Diode(anode, GROUND));
        const s = net.dc();
        expect(s.converged).toBe(true);
        expect(s.v[anode]).toBeGreaterThan(0.6);
        expect(s.v[anode]).toBeLessThan(0.75);
        expect(d.current(s.v)).toBeCloseTo((5 - s.v[anode]) / 470, 6);
    });

    it('reverse biased, it blocks', () => {
        const net = new Netlist();
        const top = net.node(), mid = net.node();
        net.add(new VoltageSource(top, GROUND, 5));
        net.add(new Resistor(top, mid, 470));
        net.add(new Diode(GROUND, mid));
        const s = net.dc();
        expect(s.v[mid]).toBeCloseTo(5, 2);
    });

    it('an LED straight across 5 V (no resistor) draws a current no LED survives', () => {
        const net = new Netlist();
        const top = net.node();
        const src = net.add(new VoltageSource(top, GROUND, 5));
        net.add(new Resistor(top, GROUND, 1e9));
        const led = net.add(new Diode(top, GROUND, 1e-18, 2.5));   // a red LED: Vf ~ 1.8 V at 20 mA
        const s = net.dc();
        expect(s.converged).toBe(true);
        expect(led.current(s.v)).toBeGreaterThan(0.1);             // amps: ten times a red LED's rating
        expect(Math.abs(s.current(src))).toBeGreaterThan(0.1);
        // with a 220 Ω resistor it's a sane 15 mA or so
        const ok = new Netlist();
        const t = ok.node(), a = ok.node();
        ok.add(new VoltageSource(t, GROUND, 5));
        ok.add(new Resistor(t, a, 220));
        const red = ok.add(new Diode(a, GROUND, 1e-18, 2.5));
        const i = red.current(ok.dc().v);
        expect(i).toBeGreaterThan(0.01);
        expect(i).toBeLessThan(0.02);
    });
});

describe('transient', () => {
    it('an RC charges along 1 - e^(-t/τ)', () => {
        const net = new Netlist();
        const top = net.node(), out = net.node();
        net.add(new VoltageSource(top, GROUND, 5));
        net.add(new Resistor(top, out, 1000));
        const c = net.add(new Capacitor(out, GROUND, 1e-6));   // τ = 1 ms
        const dt = 5e-6;
        expect(net.dc().v[out]).toBeCloseTo(5, 6);    // the operating point: a capacitor is open at DC (and now charged)
        c.vPrev = 0;                                   // start the transient from an empty capacitor instead
        let s = net.step(dt);
        let t = dt;
        while (t < 1e-3 - dt / 2) { s = net.step(dt, s); t += dt; }
        expect(s.v[out]).toBeCloseTo(5 * (1 - Math.exp(-1)), 1);   // 3.16 V after one τ
        while (t < 5e-3) { s = net.step(dt, s); t += dt; }
        expect(s.v[out]).toBeGreaterThan(4.95);
    });

    it('an RL current rises along 1 - e^(-t/τ)', () => {
        const net = new Netlist();
        const top = net.node(), mid = net.node();
        net.add(new VoltageSource(top, GROUND, 5));
        net.add(new Resistor(top, mid, 10));
        const l = net.add(new Inductor(mid, GROUND, 0.01));   // τ = L/R = 1 ms
        const dt = 5e-6;
        let s = net.step(dt);
        let t = dt;
        while (t < 1e-3 - dt / 2) { s = net.step(dt, s); t += dt; }
        expect(s.current(l)).toBeCloseTo(0.5 * (1 - Math.exp(-1)), 2);
    });

    it('a capacitor discharges through a resistor when the source is switched off', () => {
        const net = new Netlist();
        const top = net.node(), out = net.node();
        const src = net.add(new VoltageSource(top, GROUND, 5));
        const sw = net.add(new Switch(top, out, true));
        net.add(new Resistor(out, GROUND, 1000));
        const c = net.add(new Capacitor(out, GROUND, 1e-6));
        let s = net.dc();
        for (let i = 0; i < 2000; i++) s = net.step(5e-6, s);
        expect(s.v[out]).toBeCloseTo(5, 1);
        sw.closed = false;
        src.volts = 0;
        for (let i = 0; i < 200; i++) s = net.step(5e-6, s);   // 1 ms = one τ
        expect(s.v[out]).toBeCloseTo(5 * Math.exp(-1), 1);
        expect(c.vPrev).toBeCloseTo(s.v[out]);
    });
});
