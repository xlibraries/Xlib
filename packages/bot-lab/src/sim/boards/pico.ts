// The Raspberry Pi Pico: an RP2040 emulated by rp2040js (MIT) running the official MicroPython firmware, its REPL on
// USB serial. The bench steps it with the rest of the circuit: the chip's own clock advances to the bench's time
// (skipping ahead while the core sleeps, which MicroPython does in time.sleep), pin edges are timestamped on that
// clock for PWM duty and pulse widths, and the circuit's voltages come back as input levels and ADC readings.
// Scripts run through MicroPython's raw REPL, the way mpremote and Thonny do it.
import { ConsoleLogger, GPIOPinState, I2CMode, LogLevel, RP2040, USBCDC } from 'rp2040js';
import type { I2CBus, I2CDevice } from '../i2c';
import type { PinActivity, PinMode } from './uno';
import { inRomFloat, runRomFloat } from './pico-rom-float';

export const PICO_CLOCK = 125_000_000;
const NANOS_PER_CYCLE = 1e9 / PICO_CLOCK;
/** The header's GPIOs (GP23–GP25 and GP29 are on the board: GP25 is the LED) */
export const PICO_GPIO = [...Array.from({ length: 23 }, (_, i) => i), 26, 27, 28];
export const PICO_LED = 25;
export const PICO_LOGIC_VOLTS = 3.3;
export const PICO_PIN_OUT_OHMS = 60;
export const PICO_PIN_MAX_AMPS = 0.012;
export const PICO_PULL_OHMS = 50_000;

/** rp2040js's default clock (SimulationClock, not exported by the package): simulated time we advance ourselves */
interface SimClock { readonly nanos: number; readonly nanosToNextAlarm: number; tick(deltaNanos: number): void }

interface PinTrack { rose: number; pulseUs: number; periodUs: number; highNanos: number; lastEdge: number; high: boolean; falls: number; fell: number }

/** One SDA/SCL pair's bit-level I²C state (see bitBangI2C) */
interface SoftI2C {
    sda: boolean;
    scl: boolean;
    /** the device is holding SDA low (an ACK, or a 0 bit it sends) */
    held: boolean;
    bit: number;
    byte: number;
    phase: 'idle' | 'addr' | 'write' | 'read' | 'ack-out' | 'ack-in';
    next: 'write' | 'read' | 'idle';
    device?: I2CDevice;
    out: number;
}

/** Firmware images, as bytes */
export interface PicoFirmware { bootrom: Uint8Array; uf2: Uint8Array }

/** Writes a UF2 image's blocks into the chip's flash. */
export function loadUf2(flash: Uint8Array, uf2: Uint8Array) {
    const view = new DataView(uf2.buffer, uf2.byteOffset, uf2.byteLength);
    let blocks = 0;
    for (let off = 0; off + 512 <= uf2.length; off += 512) {
        if (view.getUint32(off, true) !== 0x0a324655 || view.getUint32(off + 4, true) !== 0x9e5d5157) continue;
        const addr = view.getUint32(off + 12, true), size = view.getUint32(off + 16, true);
        if (addr < 0x10000000 || addr + size > 0x10000000 + flash.length) continue;
        flash.set(uf2.subarray(off + 32, off + 32 + size), addr - 0x10000000);
        blocks++;
    }
    if (!blocks) throw new Error('that UF2 image has no blocks for the RP2040’s flash');
}

export class Pico {
    readonly mcu = new RP2040();
    readonly clock = this.mcu.clock as unknown as SimClock;
    private readonly cdc: USBCDC;
    /** USB serial is up (MicroPython has booted far enough to talk) */
    connected = false;
    /** Text from the REPL, newest last (lines; the unfinished one is `partial`) */
    readonly console: string[] = [];
    partial = '';
    private readonly tracks = new Map<number, PinTrack>();
    private windowStart = 0;
    private windowNanos = 0;
    private raw: { stage: 'enter' | 'ok' | 'out' | 'err'; code: string; resolve(ok: boolean): void } | null = null;
    private rawBuffer = '';
    /** Any pin changed state (the bit-banged I²C responder listens) */
    private onPinChange?: (index: number) => void;
    /** Called with each new console line */
    onLine?: (line: string) => void;

    /** `romFloat`: stand in for the boot ROM's float library (off only to compare against a full ROM in development) */
    constructor(firmware: PicoFirmware, private readonly romFloat = true) {
        this.mcu.logger = new ConsoleLogger(LogLevel.Error);
        const rom = new Uint8Array(16384);
        rom.set(firmware.bootrom.subarray(0, 16384));
        this.mcu.loadBootrom(new Uint32Array(rom.buffer));
        loadUf2(this.mcu.flash, firmware.uf2);
        this.cdc = new USBCDC(this.mcu.usbCtrl);
        this.cdc.onDeviceConnected = () => { this.connected = true; };
        this.cdc.onSerialData = (bytes) => this.receive(bytes);
        for (const index of [...PICO_GPIO, PICO_LED]) {
            const track: PinTrack = { rose: -1, pulseUs: 0, periodUs: 0, highNanos: 0, lastEdge: 0, high: false, falls: 0, fell: 0 };
            this.tracks.set(index, track);
            const gpio = this.mcu.gpio[index];
            gpio.addListener((state) => {
                this.edge(track, state === GPIOPinState.High);
                // an output's pad reads back what it drives (rp2040js reads only what's fed in)
                if (state === GPIOPinState.High || state === GPIOPinState.Low) gpio.setInputValue(state === GPIOPinState.High);
                this.onPinChange?.(index);
            });
        }
        this.mcu.core.PC = 0x10000000;
    }

    get time() { return this.clock.nanos / 1e9; }

    private edge(t: PinTrack, high: boolean) {
        if (high === t.high) return;
        const now = this.clock.nanos;
        if (t.high) t.highNanos += now - Math.max(t.lastEdge, this.windowStart);
        if (high) { if (t.rose >= 0) t.periodUs = (now - t.rose) / 1000; t.rose = now; }
        else { if (t.rose >= 0) t.pulseUs = (now - t.rose) / 1000; t.falls++; t.fell = now; }
        t.high = high;
        t.lastEdge = now;
    }

    /** Runs the chip until its clock reaches `seconds` more; pin duty is measured over this window. */
    run(seconds: number) {
        const { clock, mcu } = this, core = mcu.core;
        const start = clock.nanos, end = start + seconds * 1e9;
        for (const t of this.tracks.values()) t.highNanos = 0;
        this.windowStart = start;
        while (clock.nanos < end) {
            if (this.outgoing && !this.cdc.txFIFO.full) this.pump();
            if (core.waiting) clock.tick(Math.max(1, Math.min(clock.nanosToNextAlarm, end - clock.nanos)));
            else if (this.romFloat && inRomFloat(core.PC)) clock.tick(runRomFloat(core) * NANOS_PER_CYCLE);
            else clock.tick(core.executeInstruction() * NANOS_PER_CYCLE);
        }
        for (const t of this.tracks.values()) if (t.high) t.highNanos += clock.nanos - Math.max(t.lastEdge, start);
        this.windowNanos = clock.nanos - start;
    }

    /** What a pin is doing (the bench's driver reads this every step). */
    pin(index: number): PinActivity {
        const state = this.mcu.gpio[index].value, t = this.tracks.get(index)!;
        const mode: PinMode = state === GPIOPinState.High || state === GPIOPinState.Low ? 'output' : state === GPIOPinState.InputPullUp ? 'input_pullup' : 'input';
        const high = state === GPIOPinState.High;
        return { mode, high, duty: this.windowNanos > 0 ? Math.min(1, t.highNanos / this.windowNanos) : high ? 1 : 0, pulseUs: t.pulseUs, periodUs: t.periodUs, falls: t.falls, fellAgo: (this.clock.nanos - t.fell) / 1e9 };
    }

    /** The pull a pin's input has (the bench adds the resistor) */
    pull(index: number): 'up' | 'down' | 'none' {
        const state = this.mcu.gpio[index].value;
        return state === GPIOPinState.InputPullUp ? 'up' : state === GPIOPinState.InputPullDown ? 'down' : 'none';
    }

    setInput(index: number, high: boolean) { this.mcu.gpio[index].setInputValue(high); }

    /** GP26–GP28 are ADC0–ADC2: the voltage there, 0–3.3 V, as the 12-bit reading */
    setAdc(channel: number, volts: number) {
        this.mcu.adc.channelValues[channel] = Math.max(0, Math.min(4095, Math.round(volts / PICO_LOGIC_VOLTS * 4095)));
    }

    /**
     * Connects the chip's two I²C controllers to the bench: `busFor(sda, scl)` is the bus on those pins. Which pins a
     * controller uses is whatever the firmware selected (I2C0's SDA can be GP0, GP4, GP8…), read at each START.
     */
    attachI2C(busFor: (sda: number, scl: number) => I2CBus | null) {
        const FUNCTION_I2C = 3;
        const pins = [
            { sda: [0, 4, 8, 12, 16, 20], scl: [1, 5, 9, 13, 17, 21] },
            { sda: [2, 6, 10, 14, 18, 26], scl: [3, 7, 11, 15, 19, 27] },
        ];
        this.mcu.i2c.forEach((i2c, k) => {
            let device: I2CDevice | undefined;
            const bus = () => {
                const sda = pins[k].sda.find(n => this.mcu.gpio[n].functionSelect === FUNCTION_I2C);
                const scl = pins[k].scl.find(n => this.mcu.gpio[n].functionSelect === FUNCTION_I2C);
                return sda === undefined || scl === undefined ? null : busFor(sda, scl);
            };
            i2c.onStart = () => i2c.completeStart();
            i2c.onConnect = (address, mode) => { device = bus()?.find(address); device?.begin(mode === I2CMode.Write); i2c.completeConnect(!!device); };
            i2c.onWriteByte = (value) => i2c.completeWrite(device ? device.write(value) : false);
            i2c.onReadByte = () => i2c.completeRead(device ? device.read() : 0xff);
            i2c.onStop = () => { device?.end(); device = undefined; i2c.completeStop(); };
        });
        this.bitBangI2C(pins.flatMap(p => p.sda.map((sda, i) => [sda, p.scl[i]] as const)), busFor);
    }

    /**
     * MicroPython probes addresses (i2c.scan(), zero-length writes) by bit-banging the pins in software, because the
     * RP2040's controller can't send an address with no data. This answers at the bit level on any SDA/SCL pair: a
     * START, the address clocked in on SCL's rising edges, an ACK (SDA held low) from a device that's there, data
     * bytes either way, a STOP. Lines idle high (the sensor boards' pull-ups) unless the chip or the device pulls low.
     */
    private bitBangI2C(pairs: (readonly [number, number])[], busFor: (sda: number, scl: number) => I2CBus | null) {
        const watched = new Map<number, { sda: number; scl: number; s: SoftI2C }>();
        for (const [sda, scl] of pairs) {
            const entry = { sda, scl, s: { sda: true, scl: true, held: false, bit: 0, byte: 0, phase: 'idle', next: 'idle', out: 0 } as SoftI2C };
            watched.set(sda, entry);
            watched.set(scl, entry);
        }
        const driven = (pin: number) => this.mcu.gpio[pin].value === GPIOPinState.Low;
        this.onPinChange = (index) => {
            const w = watched.get(index);
            if (!w || this.mcu.gpio[w.sda].functionSelect !== 5 || this.mcu.gpio[w.scl].functionSelect !== 5) return;   // SIO (software) only
            const st = w.s;
            const scl = !driven(w.scl), sda = !driven(w.sda) && !st.held;
            const sclRose = scl && !st.scl, sclFell = !scl && st.scl;
            if (st.scl && scl && sda !== st.sda) {
                if (!sda) { st.device?.end(); st.phase = 'addr'; st.bit = 0; st.byte = 0; st.device = undefined; }      // START
                else { st.device?.end(); st.device = undefined; st.phase = 'idle'; st.held = false; }                 // STOP
            } else if (sclRose && (st.phase === 'addr' || st.phase === 'write')) {
                st.byte = (st.byte << 1) | (sda ? 1 : 0);
                if (++st.bit === 8) {
                    if (st.phase === 'addr') {
                        st.device = busFor(w.sda, w.scl)?.find(st.byte >> 1);
                        const read = (st.byte & 1) === 1;
                        st.device?.begin(!read);
                        st.next = st.device ? (read ? 'read' : 'write') : 'idle';
                    } else { st.device?.write(st.byte); st.next = 'write'; }
                    st.phase = 'ack-out';
                }
            } else if (sclFell && st.phase === 'ack-out') {
                if (st.bit === 8) { st.held = st.next !== 'idle'; st.bit = 9; }         // drive the ACK for the 9th clock
                else {                                                                // the 9th clock is over
                    st.held = false; st.bit = 0; st.byte = 0;
                    st.phase = st.next === 'read' ? 'read' : st.next === 'write' ? 'write' : 'idle';
                    if (st.phase === 'read') { st.out = st.device!.read(); st.held = (st.out & 0x80) === 0; st.bit = 1; }
                }
            } else if (sclFell && st.phase === 'read') {
                if (st.bit < 8) { st.held = ((st.out >> (7 - st.bit)) & 1) === 0; st.bit++; }
                else { st.held = false; st.phase = 'ack-in'; }
            } else if (sclRose && st.phase === 'ack-in') {
                st.phase = sda ? 'idle' : 'read';                                    // NACK ends the read
                if (st.phase === 'read') { st.out = st.device!.read(); st.bit = 0; }
            } else if (sclFell && st.phase === 'read' && st.bit === 0) {
                st.held = (st.out & 0x80) === 0; st.bit = 1;
            }
            st.scl = scl;
            st.sda = !driven(w.sda) && !st.held;
            this.mcu.gpio[w.sda].setInputValue(st.sda);
            this.mcu.gpio[w.scl].setInputValue(scl);
        };
    }

    /** Bytes to the REPL (keys typed in the terminal, scripts). The USB serial FIFO holds 512 bytes and drops the rest,
     *  so longer text waits here and goes in as the chip drains it, the way a host's driver paces a real port. */
    write(text: string) { this.outgoing += text; this.pump(); }
    private outgoing = '';
    private pump() {
        let i = 0;
        while (i < this.outgoing.length && !this.cdc.txFIFO.full) this.cdc.sendSerialByte(this.outgoing.charCodeAt(i++) & 0xff);
        if (i) this.outgoing = this.outgoing.slice(i);
    }

    private receive(bytes: Uint8Array) {
        const text = String.fromCharCode(...bytes);
        if (this.raw) { this.rawBuffer += text; this.rawProgress(); return; }
        this.print(text);
    }

    private print(text: string) {
        for (const ch of text.replace(/\r/g, '')) {
            if (ch === '\n') { this.console.push(this.partial); this.onLine?.(this.partial); this.partial = ''; if (this.console.length > 500) this.console.shift(); }
            else this.partial += ch;
        }
    }

    /**
     * Runs a script through the raw REPL (Ctrl+A, the code, Ctrl+D): its output and any traceback go to the console,
     * then the friendly REPL comes back. Resolves when the script ends: true if it ended without an error.
     */
    exec(code: string): Promise<boolean> {
        if (this.raw) this.raw.resolve(false);
        return new Promise(resolve => {
            this.raw = { stage: 'enter', code, resolve };
            this.rawBuffer = '';
            this.write('\r\x03\x03\x01');       // stop whatever runs, enter the raw REPL
        });
    }

    /** Interrupts a running script (Ctrl+C: MicroPython raises KeyboardInterrupt) */
    interrupt() { this.write('\x03'); }

    private rawProgress() {
        const r = this.raw!;
        for (;;) {
            if (r.stage === 'enter') {
                const at = this.rawBuffer.indexOf('raw REPL; CTRL-B to exit\r\n>');
                if (at < 0) return;
                this.rawBuffer = this.rawBuffer.slice(at + 27);
                this.write(r.code.replace(/\r?\n/g, '\n') + '\x04');
                r.stage = 'ok';
            } else if (r.stage === 'ok') {
                if (this.rawBuffer.length < 2) return;
                if (!this.rawBuffer.startsWith('OK')) { this.finishRaw(false); return; }
                this.rawBuffer = this.rawBuffer.slice(2);
                r.stage = 'out';
            } else if (r.stage === 'out') {
                const end = this.rawBuffer.indexOf('\x04');
                if (end < 0) { this.print(this.rawBuffer); this.rawBuffer = ''; return; }
                this.print(this.rawBuffer.slice(0, end));
                this.rawBuffer = this.rawBuffer.slice(end + 1);
                r.stage = 'err';
            } else {
                const end = this.rawBuffer.indexOf('\x04');
                if (end < 0) return;
                const err = this.rawBuffer.slice(0, end);
                this.print(err);
                if (this.partial) this.print('\n');
                this.finishRaw(err.trim() === '');
                return;
            }
        }
    }

    private finishRaw(ok: boolean) {
        const r = this.raw!;
        this.raw = null;
        this.rawBuffer = '';
        this.write('\x02');                     // back to the friendly REPL (it prints its banner and >>>)
        r.resolve(ok);
    }
}
