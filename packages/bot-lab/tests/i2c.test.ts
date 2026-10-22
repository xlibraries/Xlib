import { describe, expect, it } from 'vitest';
import { Ads1115, I2CBus, Mpu6050, Tmp102, type Motion } from '../src/sim/i2c';

const signed16 = ([hi, lo]: number[]) => { const v = (hi << 8) | lo; return v & 0x8000 ? v - 0x10000 : v; };

describe('the bus', () => {
    it('reaches devices by address and NACKs the rest; scan lists who answers', () => {
        const t = new Tmp102(0x48, () => 25);
        const bus = new I2CBus(() => [t, new Mpu6050(0x68, () => ({ pitch: 0, roll: 0, gx: 0, gy: 0, gz: 0, celsius: 25 }))]);
        expect(bus.scan()).toEqual([0x48, 0x68]);
        expect(bus.read(0x50, 1)).toBeNull();
        expect(bus.write(0x50, [0])).toBe(false);
        expect(bus.writeRead(0x48, [0], 2)).not.toBeNull();
    });
});

describe('TMP102', () => {
    it('reads the temperature in 12 bits at 0.0625 °C, negative temperatures in two’s complement', () => {
        let celsius = 25;
        const sensor = new Tmp102(0x48, () => celsius);
        const bus = new I2CBus(() => [sensor]);
        const read = () => { const [hi, lo] = bus.writeRead(0x48, [0], 2)!; let raw = ((hi << 8) | lo) >> 4; if (raw & 0x800) raw -= 0x1000; return raw * 0.0625; };
        expect(read()).toBe(25);
        celsius = 21.3;
        expect(read()).toBeCloseTo(21.3, 1);
        celsius = -10.25;
        expect(read()).toBe(-10.25);
    });

    it('keeps its config register, and a read without a new pointer reads the last register', () => {
        const t = new Tmp102(0x48, () => 30);
        const bus = new I2CBus(() => [t]);
        expect(bus.writeRead(0x48, [1], 2)).toEqual([0x60, 0xa0]);
        bus.write(0x48, [1, 0x61, 0xa0]);
        expect(bus.writeRead(0x48, [1], 2)).toEqual([0x61, 0xa0]);
        bus.write(0x48, [0]);
        expect(bus.read(0x48, 2)).toEqual([0x1e, 0x00]);   // 30 °C
    });
});

describe('ADS1115', () => {
    it('converts a single-ended channel at the chosen gain, the way Adafruit’s and ADS1x15 libraries ask', () => {
        const volts = [1.65, 3.3, 0, 0.5];
        const adc = new Ads1115(0x48, ch => volts[ch]);
        const bus = new I2CBus(() => [adc]);
        const convert = (mux: number, pga: number) => {
            const config = 0x8000 | (mux << 12) | (pga << 9) | 0x0100 | 0x0083;   // OS, mux, gain, single-shot, 128 SPS
            bus.write(0x48, [1, config >> 8, config & 0xff]);
            expect(bus.writeRead(0x48, [1], 2)![0] & 0x80).toBe(0x80);   // conversion ready
            return signed16(bus.writeRead(0x48, [0], 2)!);
        };
        expect(convert(4, 1)).toBe(Math.round(1.65 / 4.096 * 32768));   // AIN0, ±4.096 V
        expect(convert(5, 1)).toBe(Math.round(3.3 / 4.096 * 32768));
        expect(convert(5, 2)).toBe(32767);                              // ±2.048 V clips at 3.3 V
        expect(convert(7, 4)).toBe(32000);                              // 0.5 V of ±0.512 V
        expect(convert(0, 1)).toBe(Math.round((1.65 - 3.3) / 4.096 * 32768));   // AIN0 − AIN1: negative
    });

    it('in continuous mode, the conversion register follows the input', () => {
        let v = 1;
        const adc = new Ads1115(0x48, () => v);
        const bus = new I2CBus(() => [adc]);
        const config = (4 << 12) | (1 << 9) | 0x0083;   // AIN0, ±4.096 V, continuous
        bus.write(0x48, [1, config >> 8, config & 0xff]);
        const read = () => signed16(bus.writeRead(0x48, [0], 2)!);
        expect(read()).toBe(8000);
        v = 2;
        expect(read()).toBe(16000);
    });
});

describe('MPU-6050', () => {
    const level: Motion = { pitch: 0, roll: 0, gx: 0, gy: 0, gz: 0, celsius: 25 };

    it('says who it is, starts asleep, and reads 1 g on Z when level once woken', () => {
        let motion = level;
        const imu = new Mpu6050(0x68, () => motion);
        const bus = new I2CBus(() => [imu]);
        expect(bus.writeRead(0x68, [0x75], 1)).toEqual([0x68]);
        expect(bus.writeRead(0x68, [0x6b], 1)).toEqual([0x40]);
        expect(bus.writeRead(0x68, [0x3b], 6)).toEqual([0, 0, 0, 0, 0, 0]);   // asleep: no data
        bus.write(0x68, [0x6b, 0]);
        const sample = () => { const b = bus.writeRead(0x68, [0x3b], 14)!; return Array.from({ length: 7 }, (_, i) => signed16([b[i * 2], b[i * 2 + 1]])); };
        const [ax, ay, az, temp, gx, gy, gz] = sample();
        expect([ax, ay, az]).toEqual([0, 0, 16384]);
        expect(temp / 340 + 36.53).toBeCloseTo(25, 1);
        expect([gx, gy, gz]).toEqual([0, 0, 0]);
        motion = { ...level, pitch: 30, gz: 90 };
        const tilted = sample();
        expect(tilted[0] / 16384).toBeCloseTo(-0.5, 3);
        expect(tilted[2] / 16384).toBeCloseTo(Math.cos(Math.PI / 6), 3);
        expect(tilted[6]).toBe(90 * 131);
    });

    it('honours the accelerometer and gyro ranges, and resets', () => {
        const imu = new Mpu6050(0x68, () => ({ ...level, gx: 100 }));
        const bus = new I2CBus(() => [imu]);
        bus.write(0x68, [0x6b, 0]);
        bus.write(0x68, [0x1b, 1 << 3, 1 << 3]);      // GYRO_CONFIG ±500 °/s, ACCEL_CONFIG ±4 g (auto-increment)
        const b = bus.writeRead(0x68, [0x3b], 14)!;
        expect(signed16([b[4], b[5]])).toBe(8192);     // 1 g at ±4 g
        expect(signed16([b[8], b[9]])).toBe(Math.round(100 * 65.5));
        bus.write(0x68, [0x6b, 0x80]);                 // DEVICE_RESET
        expect(bus.writeRead(0x68, [0x6b], 1)).toEqual([0x40]);
        expect(bus.writeRead(0x68, [0x1b], 1)).toEqual([0]);
    });
});
