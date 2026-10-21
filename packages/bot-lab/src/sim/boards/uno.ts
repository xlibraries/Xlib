// The Arduino Uno: an ATmega328P emulated by avr8js running a compiled sketch, seen from the bench as 20 pins
// (D0–D13, A0–A5). Each step the board runs its share of 16 MHz cycles; the bench reads what the pins did
// (mode, level, PWM duty over the step, the last pulse width) and feeds back what the circuit put on its inputs
// (digital levels, analog voltages). Serial output is collected as lines.
import { ADCMuxInputType, AVRADC, AVRIOPort, AVRTimer, AVRUSART, CPU, PinState, adcConfig, avrInstruction, portBConfig, portCConfig, portDConfig, timer0Config, timer1Config, timer2Config, usart0Config } from 'avr8js';
import { parseHex } from './hex';

export const UNO_CLOCK = 16_000_000;

export type PinMode = 'input' | 'input_pullup' | 'output';

/** What a pin did over the last step. */
export interface PinActivity {
    mode: PinMode;
    /** The level now (outputs: driven; inputs: what the board sees) */
    high: boolean;
    /** Fraction of the step the pin was driven high (outputs) */
    duty: number;
    /** Width of the last complete high pulse, µs (servo signals), 0 if none yet */
    pulseUs: number;
    /** Time between the last two rising edges, µs (PWM period), 0 if unknown */
    periodUs: number;
}

export const DIGITAL_PINS = 14, ANALOG_PINS = 6;
/** Pin index for the bench: 0–13 digital, 14–19 = A0–A5. */
export const PIN_COUNT = DIGITAL_PINS + ANALOG_PINS;
export const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);

interface PinMap { port: 'B' | 'C' | 'D'; bit: number }
const PINS: PinMap[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ port: 'D' as const, bit: i })),
    ...Array.from({ length: 6 }, (_, i) => ({ port: 'B' as const, bit: i })),
    ...Array.from({ length: 6 }, (_, i) => ({ port: 'C' as const, bit: i })),
];

export class Uno {
    readonly cpu: CPU;
    readonly timers: AVRTimer[];
    readonly ports: Record<'B' | 'C' | 'D', AVRIOPort>;
    readonly usart: AVRUSART;
    readonly adc: AVRADC;
    /** Lines the sketch printed (Serial), newest last; `onSerial` sees each as it completes. */
    readonly serial: string[] = [];
    onSerial?: (line: string) => void;
    private serialLine = '';
    private readonly state = Array.from({ length: PIN_COUNT }, () => ({ high: false, since: 0, highCycles: 0, rose: -1, lastRose: -1, pulseUs: 0, periodUs: 0 }));
    private stepStart = 0;

    constructor(hex: string) {
        const program = parseHex(hex);
        this.cpu = new CPU(new Uint16Array(program.buffer));
        this.timers = [new AVRTimer(this.cpu, timer0Config), new AVRTimer(this.cpu, timer1Config), new AVRTimer(this.cpu, timer2Config)];
        this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
        this.usart = new AVRUSART(this.cpu, usart0Config, UNO_CLOCK);
        this.adc = new AVRADC(this.cpu, adcConfig);
        this.usart.onByteTransmit = (byte) => {
            const ch = String.fromCharCode(byte);
            if (ch === '\n') { const line = this.serialLine.replace(/\r$/, ''); this.serial.push(line); if (this.serial.length > 500) this.serial.shift(); this.serialLine = ''; this.onSerial?.(line); }
            else this.serialLine += ch;
        };
        for (const name of ['B', 'C', 'D'] as const) {
            this.ports[name].addListener(() => {
                for (let pin = 0; pin < PIN_COUNT; pin++) if (PINS[pin].port === name) this.track(pin);
            });
        }
    }

    /** Runs `cycles` more CPU cycles (16 000 000 per simulated second). */
    run(cycles: number) {
        this.stepStart = this.cpu.cycles;
        for (const s of this.state) { s.highCycles = 0; s.since = this.cpu.cycles; }
        const until = this.cpu.cycles + cycles;
        while (this.cpu.cycles < until) {
            avrInstruction(this.cpu);
            this.cpu.tick();
        }
        for (let pin = 0; pin < PIN_COUNT; pin++) if (this.state[pin].high) this.state[pin].highCycles += this.cpu.cycles - this.state[pin].since;
    }

    /** Simulated time, seconds. */
    get time() { return this.cpu.cycles / UNO_CLOCK; }

    mode(pin: number): PinMode {
        const p = PINS[pin];
        const state = this.ports[p.port].pinState(p.bit);
        return state === PinState.Input ? 'input' : state === PinState.InputPullUp ? 'input_pullup' : 'output';
    }

    pin(pin: number): PinActivity {
        const s = this.state[pin];
        const stepCycles = Math.max(1, this.cpu.cycles - this.stepStart);
        return { mode: this.mode(pin), high: s.high, duty: Math.min(1, s.highCycles / stepCycles), pulseUs: s.pulseUs, periodUs: s.periodUs };
    }

    /** What the circuit holds an input pin at (ignored for outputs). */
    setDigital(pin: number, high: boolean) {
        const p = PINS[pin];
        this.ports[p.port].setPin(p.bit, high);
    }

    /** The voltage on an analog pin (A0–A5 = 0–5), 0..5 V. */
    setAnalog(channel: number, volts: number) {
        if (channel >= 0 && channel < ANALOG_PINS) this.adc.channelValues[channel] = Math.max(0, Math.min(5, volts));
    }

    /** Sends a line to the sketch's Serial. */
    write(text: string) {
        for (const ch of text + '\n') this.usart.writeByte(ch.charCodeAt(0));
    }

    private track(pin: number) {
        const p = PINS[pin];
        const high = this.ports[p.port].pinState(p.bit) === PinState.High;
        const s = this.state[pin];
        if (high === s.high) return;
        const now = this.cpu.cycles;
        if (s.high) s.highCycles += now - s.since;
        s.since = now;
        s.high = high;
        if (high) {
            if (s.rose >= 0) s.periodUs = (now - s.rose) / (UNO_CLOCK / 1e6);
            s.lastRose = s.rose;
            s.rose = now;
        } else if (s.rose >= 0) {
            s.pulseUs = (now - s.rose) / (UNO_CLOCK / 1e6);
        }
    }
}

/** The ADC reference the sketches see (AVCC); exported for the bench's analog model. */
export const ADC_REFERENCE_VOLTS = 5;
export { ADCMuxInputType };
