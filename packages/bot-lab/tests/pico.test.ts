import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Pico, type PicoFirmware } from '../src/sim/boards/pico';
import { ROM_FLOAT_END, ROM_FLOAT_ENTRIES, ROM_FLOAT_START } from '../src/sim/boards/pico-rom-float';
import { Bench } from '../src/sim/bench';
import { template } from '../src/templates';
import { addPart, connect } from '../src/sim/project';

let firmware: PicoFirmware;
beforeAll(() => {
    firmware = {
        bootrom: new Uint8Array(readFileSync(new URL('../firmware/rp2040-bootrom-b1-nofp.bin', import.meta.url))),
        uf2: new Uint8Array(readFileSync(new URL('../firmware/micropython-rpi-pico-v1.29.0.uf2', import.meta.url))),
    };
});

/** A booted Pico at its REPL */
function boot(): Pico {
    const pico = new Pico(firmware);
    for (let i = 0; i < 400 && !pico.connected; i++) pico.run(0.005);
    pico.run(0.1);
    return pico;
}

/** Runs a script, stepping the chip until it ends (or `seconds` of simulated time pass). */
async function exec(pico: Pico, code: string, seconds = 3, each?: (p: Pico) => void): Promise<boolean | null> {
    let result: boolean | null = null;
    void pico.exec(code).then(ok => { result = ok; });
    for (let t = 0; t < seconds && result === null; t += 0.005) { pico.run(0.005); each?.(pico); await Promise.resolve(); }
    return result;
}

describe('the boot ROM ships without its float library', () => {
    it('those bytes are zero, and every routine has a stand-in inside the range', () => {
        expect(firmware.bootrom.subarray(ROM_FLOAT_START, ROM_FLOAT_END).every(b => b === 0)).toBe(true);
        expect(firmware.bootrom.subarray(0, 0x100).some(b => b !== 0)).toBe(true);
        expect(ROM_FLOAT_ENTRIES.length).toBe(60);
        expect(ROM_FLOAT_ENTRIES.every(a => a >= ROM_FLOAT_START && a < ROM_FLOAT_END)).toBe(true);
    });
});

describe('MicroPython on the Pico', () => {
    it('boots to the REPL over USB serial and does float maths as the real chip does', async () => {
        const pico = boot();
        expect(pico.connected).toBe(true);
        const ok = await exec(pico, `
import math
print([1.5 * 2.25, 10 / 3, math.sqrt(2), math.sin(1.0), math.cos(2.5), math.exp(1.3), math.log(7.0), math.atan2(1.0, -2.0), int(-7.9), round(2.675, 2), 1.0 < float('nan')])
print('%.3f %e' % (math.pi, 12345.678))
`);
        expect(ok).toBe(true);
        // these are what the real ROM's routines print (compared on a full ROM during development)
        expect(pico.console).toContain('[3.375, 3.3333332, 1.4142135, 0.841471, -0.8011436, 3.6692964, 1.9459102, 2.6779452, -7, 2.68, False]');
        expect(pico.console).toContain('3.142 1.234568e+04');
    }, 120_000);

    it('drives the onboard LED and a PWM pin, reads the ADC and a pulled-up input', async () => {
        const pico = boot();
        const ok = await exec(pico, `
from machine import Pin, PWM, ADC
import time
led = Pin("LED", Pin.OUT)
led.on()
pwm = PWM(Pin(15))
pwm.freq(1000)
pwm.duty_u16(16384)
button = Pin(14, Pin.IN, Pin.PULL_UP)
print("button", button.value())
print("adc", ADC(26).read_u16() >> 4)
time.sleep(0.05)
`, 3, p => { p.setInput(14, false); p.setAdc(0, 1.65); });
        expect(ok).toBe(true);
        expect(pico.console).toContain('button 0');
        expect(pico.console.find(l => l.startsWith('adc'))).toMatch(/adc 20(47|48)/);   // 1.65 V of 3.3 V, 12 bits
        expect(pico.pin(25)).toMatchObject({ mode: 'output', high: true });
        expect(pico.pull(14)).toBe('up');
        pico.run(0.01);
        const pwm = pico.pin(15);
        expect(pwm.periodUs).toBeCloseTo(1000, -1);
        expect(pwm.duty).toBeCloseTo(0.25, 1);
    }, 120_000);

    it('Ctrl+C interrupts a running loop with KeyboardInterrupt; errors come back as tracebacks', async () => {
        const pico = boot();
        let stopped: boolean | null = null;
        void pico.exec('import time\nwhile True:\n    time.sleep(0.01)\n').then(ok => { stopped = ok; });
        for (let i = 0; i < 40; i++) { pico.run(0.005); await Promise.resolve(); }
        expect(stopped).toBeNull();
        pico.interrupt();
        for (let i = 0; i < 200 && stopped === null; i++) { pico.run(0.005); await Promise.resolve(); }
        expect(stopped).toBe(false);
        expect(pico.console.some(l => l.includes('KeyboardInterrupt'))).toBe(true);
        expect(await exec(pico, 'print(1/0)')).toBe(false);
        expect(pico.console.some(l => l.includes('ZeroDivisionError'))).toBe(true);
    }, 120_000);
});

describe('the Pico on the bench', () => {
    /** Runs a template's script on a bench until `seconds` pass. */
    async function onBench(id: string, seconds: number, each?: (b: Bench) => void, edit?: (p: ReturnType<NonNullable<ReturnType<typeof template>>['build']>) => void) {
        const project = template(id)!.build();
        edit?.(project);
        const bench = new Bench(project, { pico: firmware });
        while (!bench.pico!.connected) bench.run(0.005);
        void bench.pico!.exec(project.code.sketch);
        for (let t = 0; t < seconds; t += 0.005) { bench.run(0.005); each?.(bench); await Promise.resolve(); }
        return bench;
    }

    it('Blink: the board LED and the LED on GP15 take turns', async () => {
        const seen = new Set<string>();
        const bench = await onBench('pico_blink', 1.6, b => seen.add(`${b.state('pico1').led ? 'B' : '-'}${(b.state('led1').brightness ?? 0) > 0.5 ? 'L' : '-'}`));
        expect(seen.has('B-')).toBe(true);
        expect(seen.has('-L')).toBe(true);
        expect(seen.has('BL')).toBe(false);
        expect(bench.warnings).toEqual([]);
    }, 120_000);

    it('Knob: the ADC reads the knob\u2019s real voltage and PWM dims the LED to match', async () => {
        const bench = await onBench('pico_knob', 0.6, undefined, p => { p.parts.find(x => x.id === 'potentiometer1')!.props.position = 0.75; });
        expect(bench.pico!.console.find(l => l.startsWith('knob:'))).toBe('knob: 2.47 V');
        let sum = 0;
        for (let i = 0; i < 480; i++) { bench.tick(); sum += bench.pico!.pin(15).duty; }
        expect(sum / 480).toBeCloseTo(0.75, 1);
    }, 120_000);

    it('I²C: machine.I2C finds a TMP102 on GP4/GP5 and reads it', async () => {
        const bench = await onBench('pico_blink', 0.4, undefined, p => {
            const t = addPart(p, 'tmp102', 30, 20);
            connect(p, { part: 'pico1', pin: 'GP4' }, { part: t.id, pin: 'SDA' });
            connect(p, { part: 'pico1', pin: 'GP5' }, { part: t.id, pin: 'SCL' });
            connect(p, { part: 'pico1', pin: '3V3' }, { part: t.id, pin: 'VCC' });
            connect(p, { part: 'pico1', pin: 'GND' }, { part: t.id, pin: 'GND' });
            p.code.sketch = 'from machine import I2C, Pin\ni2c = I2C(0, sda=Pin(4), scl=Pin(5))\nprint("scan", i2c.scan())\nd = i2c.readfrom_mem(0x48, 0, 2)\nprint("temp", ((d[0] << 8 | d[1]) >> 4) * 0.0625)\n';
        });
        expect(bench.pico!.console).toContain('scan [72]');
        expect(bench.pico!.console).toContain('temp 22.0');
    }, 120_000);
});


describe('the vendored firmware', () => {
    it('matches the checksums in firmware/README.md', async () => {
        const { createHash } = await import('node:crypto');
        const readme = readFileSync(new URL('../firmware/README.md', import.meta.url), 'utf8');
        for (const [file, bytes] of [['micropython-rpi-pico-v1.29.0.uf2', firmware.uf2], ['rp2040-bootrom-b1-nofp.bin', firmware.bootrom]] as const) {
            const hash = createHash('sha256').update(bytes).digest('hex');
            expect(readme, file).toContain(`\`${file}\``);
            expect(readme, file).toContain(hash);
        }
    });
});
