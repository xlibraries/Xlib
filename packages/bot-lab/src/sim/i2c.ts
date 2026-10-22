// I²C on the bench, at the level of transactions: a board's bus (the Pi's GPIO2/GPIO3, the Uno's A4/A5) reaches every
// powered device whose SDA and SCL are wired to it, by address. Bits on the wire aren't simulated (the bench runs at
// 4.8 kHz; I²C clocks at 100 kHz), so a transaction happens in one go: START, address, bytes, STOP. Devices follow
// their datasheets' register maps closely enough for the usual libraries and sketches to work unchanged.

export interface I2CDevice {
    readonly address: number;
    /** START + address: a transaction begins, in the given direction */
    begin(write: boolean): void;
    /** A byte from the controller; false would NACK it */
    write(byte: number): boolean;
    /** A byte for the controller */
    read(): number;
    /** STOP */
    end(): void;
}

/** A bus as a board sees it: the devices that answer, and whole transactions. */
export class I2CBus {
    constructor(private readonly devices: () => I2CDevice[]) {}

    find(address: number): I2CDevice | undefined {
        return this.devices().find(d => d.address === address);
    }

    /** Addresses that answer, ascending (i2cdetect) */
    scan(): number[] {
        return [...new Set(this.devices().map(d => d.address))].sort((a, b) => a - b);
    }

    /** Writes bytes; false when nothing answers at `address` (the controller sees a NACK). */
    write(address: number, bytes: number[]): boolean {
        const device = this.find(address);
        if (!device) return false;
        device.begin(true);
        for (const b of bytes) if (!device.write(b & 0xff)) break;
        device.end();
        return true;
    }

    /** Reads `count` bytes; null when nothing answers. */
    read(address: number, count: number): number[] | null {
        const device = this.find(address);
        if (!device) return null;
        device.begin(false);
        const out = Array.from({ length: count }, () => device.read() & 0xff);
        device.end();
        return out;
    }

    /** A register write followed by a read with a repeated start: what read_byte_data and friends do. */
    writeRead(address: number, bytes: number[], count: number): number[] | null {
        const device = this.find(address);
        if (!device) return null;
        device.begin(true);
        for (const b of bytes) device.write(b & 0xff);
        device.begin(false);
        const out = Array.from({ length: count }, () => device.read() & 0xff);
        device.end();
        return out;
    }
}

/** Devices with a register pointer: the first byte written selects a register; later bytes write it, reads read it. */
abstract class RegisterDevice implements I2CDevice {
    protected pointer = 0;
    private fresh = true;   // the next written byte is the pointer
    constructor(readonly address: number) {}
    begin(write: boolean) { if (write) this.fresh = true; }
    write(byte: number): boolean {
        if (this.fresh) { this.pointer = byte; this.fresh = false; this.select(byte); }
        else this.store(byte);
        return true;
    }
    end() { this.fresh = true; }
    abstract read(): number;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- subclasses use it
    protected select(_register: number) {}
    protected abstract store(byte: number): void;
}

/** 16-bit registers sent MSB first (TMP102, ADS1115): the byte position resets when the pointer is written. */
abstract class WordRegisterDevice extends RegisterDevice {
    private half = 0;          // which byte of the current register is next (reads)
    private incoming: number[] = [];
    begin(write: boolean) { super.begin(write); this.half = 0; this.incoming = []; }
    protected select() { this.half = 0; this.incoming = []; }
    read(): number {
        const word = this.readWord(this.pointer) & 0xffff;
        const byte = this.half === 0 ? word >> 8 : word & 0xff;
        this.half ^= 1;
        return byte;
    }
    protected store(byte: number) {
        this.incoming.push(byte);
        if (this.incoming.length === 2) { this.writeWord(this.pointer, (this.incoming[0] << 8) | this.incoming[1]); this.incoming = []; }
    }
    protected abstract readWord(register: number): number;
    protected abstract writeWord(register: number, value: number): void;
}

/** TMP102: a temperature sensor, 12 bits at 0.0625 °C. Registers: 0 temperature, 1 config, 2 T-low, 3 T-high. */
export class Tmp102 extends WordRegisterDevice {
    private config = 0x60a0;
    private tLow = 75 << 8 >> 4 << 4;
    private tHigh = 80 << 8 >> 4 << 4;
    constructor(address: number, private readonly celsius: () => number) { super(address); }
    protected readWord(register: number): number {
        switch (register & 3) {
            case 0: return (Math.round(Math.max(-55, Math.min(150, this.celsius())) / 0.0625) & 0xfff) << 4;
            case 1: return this.config;
            case 2: return this.tLow;
            default: return this.tHigh;
        }
    }
    protected writeWord(register: number, value: number) {
        if ((register & 3) === 1) this.config = value; else if ((register & 3) === 2) this.tLow = value; else if ((register & 3) === 3) this.tHigh = value;
    }
}

/** The ADS1115's full-scale range by its PGA setting, volts */
export const ADS1115_RANGES = [6.144, 4.096, 2.048, 1.024, 0.512, 0.256, 0.256, 0.256];

/** ADS1115: a 16-bit, 4-channel ADC. Registers: 0 conversion, 1 config, 2/3 thresholds. Conversions are instant. */
export class Ads1115 extends WordRegisterDevice {
    private config = 0x8583;
    private conversion = 0;
    private loThresh = 0x8000;
    private hiThresh = 0x7fff;
    /** `volts(ch)`: the voltage at AIN0..AIN3 against the chip's GND */
    constructor(address: number, private readonly volts: (channel: number) => number) { super(address); }

    /** The value the chip would convert now for the current config (mux, gain). */
    sample(): number {
        const mux = (this.config >> 12) & 7, range = ADS1115_RANGES[(this.config >> 9) & 7];
        const [p, n] = [[0, 1], [0, 3], [1, 3], [2, 3], [0, -1], [1, -1], [2, -1], [3, -1]][mux];
        const v = this.volts(p) - (n < 0 ? 0 : this.volts(n));
        return Math.max(-32768, Math.min(32767, Math.round(v / range * 32768)));
    }

    protected readWord(register: number): number {
        switch (register & 3) {
            case 0: if (((this.config >> 8) & 1) === 0) this.conversion = this.sample(); return this.conversion & 0xffff;   // continuous mode tracks the input
            case 1: return this.config | 0x8000;    // OS reads 1: not converting (conversions are instant here)
            case 2: return this.loThresh;
            default: return this.hiThresh;
        }
    }
    protected writeWord(register: number, value: number) {
        switch (register & 3) {
            case 1:
                this.config = value & 0x7fff;
                if (value & 0x8000 || ((value >> 8) & 1) === 0) this.conversion = this.sample();   // OS=1 starts a single conversion
                break;
            case 2: this.loThresh = value; break;
            case 3: this.hiThresh = value; break;
        }
    }
}

export interface Motion {
    /** Tilt, degrees: nose up is positive pitch, right side down is positive roll */
    pitch: number;
    roll: number;
    /** Turning rates, degrees per second, about the chip's X, Y, Z axes */
    gx: number;
    gy: number;
    gz: number;
    celsius: number;
}

/** MPU-6050: a 3-axis accelerometer and gyroscope. Wakes asleep (PWR_MGMT_1 = 0x40), as the real one does. */
export class Mpu6050 extends RegisterDevice {
    private readonly regs = new Uint8Array(128);
    constructor(address: number, private readonly motion: () => Motion) {
        super(address);
        this.regs[0x6b] = 0x40;     // PWR_MGMT_1: sleeping
        this.regs[0x75] = 0x68;     // WHO_AM_I
    }
    private get asleep() { return (this.regs[0x6b] & 0x40) !== 0; }

    /** Latches the sensor registers (0x3B..0x48) from the current motion, as one consistent sample. */
    private latch() {
        if (this.asleep) return;
        const m = this.motion(), rad = Math.PI / 180;
        const g = [-Math.sin(m.pitch * rad), Math.sin(m.roll * rad) * Math.cos(m.pitch * rad), Math.cos(m.roll * rad) * Math.cos(m.pitch * rad)];
        const aScale = 16384 / (1 << ((this.regs[0x1c] >> 3) & 3));
        const gScale = 131 / (1 << ((this.regs[0x1b] >> 3) & 3));
        const words = [...g.map(a => a * aScale), (m.celsius - 36.53) * 340, m.gx * gScale, m.gy * gScale, m.gz * gScale];
        words.forEach((w, i) => {
            const v = Math.max(-32768, Math.min(32767, Math.round(w))) & 0xffff;
            this.regs[0x3b + i * 2] = v >> 8;
            this.regs[0x3c + i * 2] = v & 0xff;
        });
    }
    protected select(register: number) { if (register >= 0x3b && register <= 0x48) this.latch(); }
    read(): number {
        const v = this.regs[this.pointer & 0x7f];
        this.pointer = (this.pointer + 1) & 0x7f;
        return v;
    }
    protected store(byte: number) {
        const r = this.pointer & 0x7f;
        if (r === 0x6b && byte & 0x80) { this.regs.fill(0); this.regs[0x6b] = 0x40; this.regs[0x75] = 0x68; }   // DEVICE_RESET
        else if (r !== 0x75) this.regs[r] = byte;
        this.pointer = (this.pointer + 1) & 0x7f;
    }
}
