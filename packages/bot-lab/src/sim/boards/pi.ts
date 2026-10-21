// The Raspberry Pi as the bench sees it: 3.3 V GPIO on the 40-pin header, driven not by an emulated chip but by
// the Python runtime (gpiozero, RPi.GPIO) calling in. Pins have a mode, a level, optional pull-ups/downs and
// software PWM at any frequency (100 Hz LEDs, 50 Hz servos); the board keeps the simulated clock the Python
// side's time.sleep() advances.
import type { PinActivity, PinMode } from './uno';

/** The header pins Bot Lab wires (BCM numbers), in the order the catalog shows them. */
export const PI_GPIO = [2, 3, 4, 17, 27, 22, 10, 9, 11, 5, 6, 13, 19, 26, 14, 15, 18, 23, 24, 25, 8, 7, 12, 16, 20, 21];
export const PI_LOGIC_VOLTS = 3.3;
export const PI_PIN_OUT_OHMS = 50;
export const PI_PIN_MAX_AMPS = 0.016;
export const PI_PULL_OHMS = 50_000;

export type Pull = 'up' | 'down' | 'none';

interface SoftPin {
    mode: PinMode;
    pull: Pull;
    high: boolean;
    pwm: { hz: number; duty: number } | null;
    /** what the circuit holds an input at */
    input: boolean;
    rose: number;       // time of the last rising edge, s
    pulseUs: number;
    periodUs: number;
    highTime: number;   // within the current step
}

export class PiBoard {
    private readonly pins = new Map<number, SoftPin>();
    time = 0;
    /** Lines the script printed, newest last (the Python runtime appends). */
    readonly console: string[] = [];
    private stepStart = 0;
    private stepLength = 0;

    constructor() {
        for (const bcm of PI_GPIO) this.pins.set(bcm, { mode: 'input', pull: 'none', high: false, pwm: null, input: false, rose: -1, pulseUs: 0, periodUs: 0, highTime: 0 });
    }

    private pin(bcm: number): SoftPin {
        const p = this.pins.get(bcm);
        if (!p) throw new Error(`GPIO${bcm} is not on the header`);
        return p;
    }

    /** gpiozero / RPi.GPIO: configure a pin. */
    setMode(bcm: number, mode: PinMode, pull: Pull = 'none') {
        const p = this.pin(bcm);
        p.mode = mode === 'input_pullup' ? 'input' : mode;
        p.pull = mode === 'input_pullup' ? 'up' : pull;
        if (p.mode !== 'output') {
            p.pwm = null; p.high = false;
            if (p.pull !== 'none') p.input = p.pull === 'up';   // until the circuit says otherwise, the pull sets the level
        }
    }
    write(bcm: number, high: boolean) { const p = this.pin(bcm); p.pwm = null; this.level(p, high); }
    /** Software PWM: `duty` 0..1 at `hz`; duty 0 or 1 settles to a plain level. */
    pwm(bcm: number, hz: number, duty: number) {
        const p = this.pin(bcm);
        duty = Math.max(0, Math.min(1, duty));
        if (hz <= 0 || duty <= 0 || duty >= 1) { p.pwm = null; this.level(p, duty >= 1); return; }
        p.pwm = { hz, duty };
    }
    /** A servo pulse: `widthUs` every `frameUs` (50 Hz), or 0 to detach. */
    pulse(bcm: number, widthUs: number, frameUs = 20_000) { this.pwm(bcm, 1e6 / frameUs, widthUs / frameUs); }
    read(bcm: number): boolean {
        const p = this.pin(bcm);
        return p.mode === 'output' ? p.high : p.input;
    }
    mode(bcm: number): PinMode { const p = this.pin(bcm); return p.mode === 'input' && p.pull === 'up' ? 'input_pullup' : p.mode; }
    pull(bcm: number): Pull { return this.pin(bcm).pull; }

    /** Advances the clock by dt, toggling PWM pins as their phase says. */
    run(dt: number) {
        this.stepStart = this.time;
        this.stepLength = dt;
        for (const p of this.pins.values()) p.highTime = 0;
        const end = this.time + dt;
        // PWM edges inside the step, in time order (fine enough at the bench's 1/4800 s step)
        for (const p of this.pins.values()) {
            if (!p.pwm) { if (p.high) p.highTime = dt; continue; }
            const period = 1 / p.pwm.hz, on = period * p.pwm.duty;
            let t = this.time;
            for (let guard = 0; t < end && guard < 10_000; guard++) {
                const phase = ((t % period) + period) % period;
                const high = phase < on;
                // the next edge, never closer than a sliver (floating point can put us a hair before an edge)
                const next = Math.max(t + 1e-7, high ? t + (on - phase) : t + (period - phase));
                const until = Math.min(next, end);
                if (high !== p.high) this.edge(p, high, t);
                if (high) p.highTime += until - t;
                t = until;
            }
        }
        this.time = end;
    }

    /** What a pin did over the last step, in the bench's terms. */
    activity(bcm: number): PinActivity {
        const p = this.pin(bcm);
        return { mode: this.mode(bcm), high: p.mode === 'output' ? p.high : p.input, duty: this.stepLength > 0 ? Math.min(1, p.highTime / this.stepLength) : (p.high ? 1 : 0), pulseUs: p.pulseUs, periodUs: p.periodUs };
    }

    /** The circuit's level on an input pin. */
    setInput(bcm: number, high: boolean) { this.pin(bcm).input = high; }

    private level(p: SoftPin, high: boolean) { if (high !== p.high) this.edge(p, high, this.time); }
    private edge(p: SoftPin, high: boolean, at: number) {
        if (high) { if (p.rose >= 0) p.periodUs = (at - p.rose) * 1e6; p.rose = at; }
        else if (p.rose >= 0) p.pulseUs = (at - p.rose) * 1e6;
        p.high = high;
    }
}
