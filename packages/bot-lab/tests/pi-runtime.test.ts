import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { Bench } from '../src/sim/bench';
import { addPart, connect, emptyProject, type Project } from '../src/sim/project';
import { PiRuntime, canSuspend } from '../src/runtime/pi';
import { generate } from '../scripts/sync-python.mjs';
import { template } from '../src/templates';
import type { LcdScreen } from '../src/sim/displays';

// Real CPython, loaded once: a few seconds
let py: PyodideInterface;
beforeAll(async () => {
    const indexURL = dirname(createRequire(import.meta.url).resolve('pyodide'));
    py = await loadPyodide({ indexURL });
}, 60_000);

/** A Pi with an LED (through a resistor) on GPIO17, a button on GPIO4 and a servo on GPIO18. */
function piProject(): Project {
    const p = emptyProject('pi');
    p.code = { board: 'pi', sketch: '', hex: '' };
    addPart(p, 'pi', 0, 0);
    const r = addPart(p, 'resistor', 1, 1), led = addPart(p, 'led', 2, 2), b = addPart(p, 'button', 3, 3), s = addPart(p, 'servo', 4, 4);
    connect(p, { part: 'pi1', pin: 'GPIO17' }, { part: r.id, pin: 'a' });
    connect(p, { part: r.id, pin: 'b' }, { part: led.id, pin: 'a' });
    connect(p, { part: led.id, pin: 'k' }, { part: 'pi1', pin: 'GND' });
    connect(p, { part: 'pi1', pin: 'GPIO4' }, { part: b.id, pin: 'a' });
    connect(p, { part: b.id, pin: 'b' }, { part: 'pi1', pin: 'GND2' });
    connect(p, { part: 'pi1', pin: 'GPIO18' }, { part: s.id, pin: 'sig' });
    connect(p, { part: 'pi1', pin: '5V' }, { part: s.id, pin: 'v' });
    connect(p, { part: 'pi1', pin: 'GND' }, { part: s.id, pin: 'gnd' });
    return p;
}

function runtime(options: { onStep?: (b: Bench) => void; shouldStop?: () => boolean } = {}) {
    const bench = new Bench(piProject());
    const output: string[] = [];
    const rt = new PiRuntime(py, bench, { onOutput: (l) => output.push(...l.split('\n').filter(Boolean)), ...options });
    rt.install();
    return { bench, output, rt };
}

describe('the Python libraries', () => {
    it('are bundled from python/ (run `pnpm sync:python` after editing them)', () => {
        expect(generate()).toBe(readFileSync(new URL('../src/runtime/python-generated.ts', import.meta.url), 'utf8'));
    });
});

describe('gpiozero on the bench', () => {
    it('LED on/off/blink drive the pin, and time.sleep advances the simulation', () => {
        const { bench, output, rt } = runtime();
        const lit: number[] = [];
        const ok = rt.exec(`
from gpiozero import LED
from time import sleep, time
led = LED(17)
t0 = time()
led.on()
sleep(0.1)
print("after on", led.value, led.is_active)
led.off()
sleep(0.1)
print("after off", led.value)
led.blink(on_time=0.05, off_time=0.05, n=3, background=False)
print("blinked", round(time() - t0, 2))
`);
        expect(ok).toBe(true);
        expect(output).toContain('after on 1 True');
        expect(output).toContain('after off 0');
        expect(output.at(-1)).toMatch(/^blinked 0\.5/);
        expect(bench.time).toBeCloseTo(0.5, 1);
        expect(bench.state('led1').brightness).toBe(0);
        expect(lit.length).toBe(0);
    });

    it('background blink and when_pressed run while the script sleeps; the button is read through the pull-up', () => {
        let pressedAt = -1;
        const { bench, output, rt } = runtime({
            onStep: (b) => { if (b.time >= 0.3 && pressedAt < 0) { b.setProp('button1', 'pressed', true); pressedAt = b.time; } if (pressedAt > 0 && b.time > pressedAt + 0.1) b.setProp('button1', 'pressed', false); },
        });
        const ok = rt.exec(`
from gpiozero import LED, Button
from time import sleep
led = LED(17)
button = Button(4)
events = []
button.when_pressed = lambda: events.append("pressed")
button.when_released = lambda: events.append("released")
led.blink(on_time=0.1, off_time=0.1)
print("pressed at start:", button.is_pressed)
sleep(0.25)
print("on at 0.25:", led.value)
sleep(0.1)
print("pressed at 0.35:", button.is_pressed)
button.wait_for_release(timeout=1)
print(events)
`);
        expect(ok).toBe(true);
        expect(output).toContain('pressed at start: False');
        expect(output).toContain('on at 0.25: 1');          // the blink toggles at 0.1, 0.2, 0.3: on during 0.2–0.3
        expect(output).toContain('pressed at 0.35: True');
        expect(output.at(-1)).toBe("['pressed', 'released']");
        expect(bench.time).toBeGreaterThan(0.4);
    });

    it('a Servo and an AngularServo set the pulse width, and the bench servo follows', () => {
        const { bench, output, rt } = runtime();
        rt.exec(`
from gpiozero import AngularServo
from time import sleep
servo = AngularServo(18, min_angle=0, max_angle=180, min_pulse_width=0.5/1000, max_pulse_width=2.5/1000)
servo.angle = 180
sleep(0.5)
print("value", servo.value, "angle", servo.angle)
servo.angle = 0
sleep(0.5)
print("done")
`);
        expect(output).toContain('value 1.0 angle 180.0');
        expect(bench.pi!.activity(18).periodUs).toBeCloseTo(20_000, -2);
        expect(bench.pi!.activity(18).pulseUs).toBeCloseTo(500, -1);
        expect(bench.state('servo1').angle).toBeLessThan(10);
    });

    it('PWMLED dims the LED by duty', () => {
        const { bench, rt } = runtime();
        const samples: number[] = [];
        rt.exec(`
from gpiozero import PWMLED
from time import sleep
led = PWMLED(17)
led.value = 0.3
sleep(0.3)
`);
        for (let i = 0; i < 480; i++) { bench.tick(); samples.push(bench.state('led1').brightness ?? 0); }
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length, peak = Math.max(...samples);
        expect(peak).toBeGreaterThan(0.2);
        expect(avg / peak).toBeCloseTo(0.3, 1);
    });

    it('RPi.GPIO works too, and errors come back as output', () => {
        const { bench, output, rt } = runtime();
        const ok = rt.exec(`
import RPi.GPIO as GPIO
from time import sleep
GPIO.setmode(GPIO.BCM)
GPIO.setup(17, GPIO.OUT)
GPIO.setup(4, GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.output(17, GPIO.HIGH)
sleep(0.05)
print("in", GPIO.input(4))
pwm = GPIO.PWM(17, 200)
pwm.start(50)
sleep(0.05)
GPIO.cleanup()
print("cleaned", GPIO.input(4))
GPIO.output(99, 1)
`);
        expect(ok).toBe(false);
        expect(output).toContain('in 1');
        expect(output.some(l => l.includes('GPIO99 is not on the header'))).toBe(true);
        expect(bench.pi!.mode(17)).toBe('input');   // cleanup released it
    });

    it('stops mid-sleep when the host says so', () => {
        let steps = 0;
        const { bench, output, rt } = runtime({ shouldStop: () => ++steps > 5 });
        const ok = rt.exec(`
from gpiozero import LED, pause
LED(17).on()
print("before")
pause()
print("never")
`);
        expect(ok).toBe(false);
        expect(output).toEqual(['before']);
        expect(bench.time).toBeLessThan(0.2);
    });
});

describe('the Pi templates', () => {
    it('Button: signal.pause() keeps the script alive, and when_pressed = led.on lights the LED while held', () => {
        const project = template('pi_button')!.build();
        const bench = new Bench(project);
        const output: string[] = [];
        let litWhileHeld = false;
        const rt = new PiRuntime(py, bench, {
            onOutput: (l) => output.push(...l.split('\n').filter(Boolean)),
            shouldStop: () => bench.time > 0.8,
            onStep: (b) => {
                b.setProp('button1', 'pressed', b.time > 0.3 && b.time < 0.5);
                if (b.time > 0.4 && b.time < 0.5 && (b.state('led1').brightness ?? 0) > 0.5) litWhileHeld = true;
            },
        });
        rt.install();
        expect(rt.exec(project.code.sketch)).toBe(false);   // ended by Stop, not by itself
        expect(output).toEqual(['press the button']);
        expect(litWhileHeld).toBe(true);
        expect(bench.state('led1').brightness).toBe(0);    // released again
    });
});

describe('the Pi LCD template', () => {
    it('smbus2 drives the LCD backpack four bits at a time', () => {
        const project = template('pi_lcd')!.build();
        const bench = new Bench(project);
        const output: string[] = [];
        const rt = new PiRuntime(py, bench, { onOutput: (l) => output.push(...l.split('\n').filter(Boolean)), shouldStop: () => bench.time > 1.2 });
        rt.install();
        rt.exec(project.code.sketch);
        expect(output).toEqual([]);
        const s = bench.state('lcd1').screen as LcdScreen;
        expect(s.on && s.backlight).toBe(true);
        const row = (r: number) => s.cells.slice(r * 16, r * 16 + 16).map(c => String.fromCharCode(c)).join('');
        expect(row(0)).toBe('Hello from a Pi ');
        expect(row(1)).toMatch(/^up 1\.0 s +$/);
    });
});

describe('paced (real-time) runs', () => {
    it('this Node can suspend WebAssembly (JSPI), which paced runs need', () => {
        expect(canSuspend()).toBe(true);
    });

    it('sleep follows the wall clock, and a button pressed mid-sleep reaches the script', async () => {
        const { bench, output, rt } = runtime();
        const t0 = performance.now();
        setTimeout(() => bench.setProp('button1', 'pressed', true), 150);   // arrives while Python is suspended
        const ok = await rt.execPaced(`
from gpiozero import Button
from time import sleep
button = Button(4)
print("start", button.is_pressed)
button.wait_for_press(timeout=2)
print("pressed", button.is_pressed)
sleep(0.1)
`);
        const wall = (performance.now() - t0) / 1000;
        expect(ok).toBe(true);
        expect(output).toEqual(['start False', 'pressed True']);
        expect(wall).toBeGreaterThan(0.2);                  // ~0.15 s to the press + 0.1 s of sleep, not instant
        expect(wall).toBeLessThan(1.5);
        expect(bench.time).toBeCloseTo(wall, 0);            // the simulation kept to the clock
    });

    it('stop() ends a script suspended in pause()', async () => {
        const { bench, output, rt } = runtime();
        setTimeout(() => rt.stop(), 200);
        const ok = await rt.execPaced(`
from gpiozero import LED, pause
LED(17).blink(on_time=0.05, off_time=0.05)
print("blinking")
pause()
print("never")
`);
        expect(ok).toBe(false);
        expect(output).toEqual(['blinking']);
        expect(bench.time).toBeGreaterThan(0.1);
        expect(bench.time).toBeLessThan(0.6);
    });

    it('a fast-forwarded run and a paced run can share one Python', async () => {
        const a = runtime();
        expect(a.rt.exec('from time import sleep\nsleep(1)\nprint("fast")')).toBe(true);
        const b = runtime();
        expect(await b.rt.execPaced('from time import sleep\nsleep(0.05)\nprint("paced")')).toBe(true);
        expect(a.output).toEqual(['fast']);
        expect(b.output).toEqual(['paced']);
        expect(a.bench.time).toBeCloseTo(1, 1);
    });
});

/** A Pi with a TMP102, an ADS1115 reading a knob on A0, and an MPU-6050 at 0x68 on its I²C pins. */
function i2cProject(): Project {
    const p = piProject();
    const t = addPart(p, 'tmp102', 30, 2), a = addPart(p, 'ads1115', 30, 10), m = addPart(p, 'mpu6050', 30, 20), k = addPart(p, 'potentiometer', 40, 10);
    for (const dev of [t.id, a.id, m.id]) {
        connect(p, { part: 'pi1', pin: 'GPIO2' }, { part: dev, pin: 'SDA' });
        connect(p, { part: 'pi1', pin: 'GPIO3' }, { part: dev, pin: 'SCL' });
        connect(p, { part: 'pi1', pin: '3V3' }, { part: dev, pin: dev === a.id ? 'VDD' : 'VCC' });
        connect(p, { part: 'pi1', pin: 'GND' }, { part: dev, pin: 'GND' });
    }
    a.props.address = '0x49';   // the TMP102 has 0x48
    connect(p, { part: 'pi1', pin: '3V3' }, { part: k.id, pin: 'a' });
    connect(p, { part: 'pi1', pin: 'GND' }, { part: k.id, pin: 'b' });
    connect(p, { part: k.id, pin: 'w' }, { part: a.id, pin: 'A0' });
    return p;
}

function i2cRuntime() {
    const bench = new Bench(i2cProject());
    const output: string[] = [];
    const rt = new PiRuntime(py, bench, { onOutput: (l) => output.push(...l.split('\n').filter(Boolean)) });
    rt.install();
    return { bench, output, rt };
}

describe('I²C on the Pi', () => {
    it('smbus2 reads the TMP102, the ADS1115 (a knob’s real voltage) and the MPU-6050', () => {
        const { bench, output, rt } = i2cRuntime();
        bench.setProp('tmp1021', 'temperature', 31.5);
        bench.setProp('mpu60501', 'pitch', 30);
        bench.setProp('potentiometer1', 'position', 0.25);   // the wiper sits a quarter of the way from 3.3 V: 2.47 V
        const ok = rt.exec(`
from smbus2 import SMBus, i2c_msg
import time
time.sleep(0.01)
with SMBus(1) as bus:
    hi, lo = bus.read_i2c_block_data(0x48, 0, 2)
    print("temp", ((hi << 8) | lo) >> 4) if False else print("temp", (((hi << 8) | lo) >> 4) * 0.0625)
    bus.write_i2c_block_data(0x49, 1, [0xC3, 0x83])   # AIN0, ±4.096 V, single shot
    time.sleep(0.01)
    hi, lo = bus.read_i2c_block_data(0x49, 0, 2)
    print("volts", round(((hi << 8) | lo) * 4.096 / 32768, 2))
    print("whoami", hex(bus.read_byte_data(0x68, 0x75)))
    bus.write_byte_data(0x68, 0x6B, 0)
    write, read = i2c_msg.write(0x68, [0x3B]), i2c_msg.read(0x68, 2)
    bus.i2c_rdwr(write, read)
    ax = int.from_bytes(bytes(read), "big", signed=True)
    print("ax", round(ax / 16384, 2))
    try:
        bus.read_byte_data(0x50, 0)
    except OSError as e:
        print("missing", e.errno)
`);
        expect(output.join('\n')).not.toMatch(/Traceback/);
        expect(ok).toBe(true);
        expect(output).toEqual(['temp 31.5', 'volts 2.47', 'whoami 0x68', 'ax -0.5', 'missing 121']);
    });

    it('a script can talk to a sensor before the bench has taken a step (it is powered from the start)', () => {
        const bench = new Bench(i2cProject());
        const output: string[] = [];
        const rt = new PiRuntime(py, bench, { onOutput: (l) => output.push(...l.split('\n').filter(Boolean)) });
        rt.install();
        expect(rt.exec('from smbus2 import SMBus\nprint(hex(SMBus(1).read_byte_data(0x68, 0x75)))')).toBe(true);
        expect(output).toEqual(['0x68']);
    });

    it('a sensor that isn’t powered doesn’t answer', () => {
        const p = i2cProject();
        p.wires = p.wires.filter(w => !(w.b.part === 'tmp1021' && w.b.pin === 'VCC'));
        const bench = new Bench(p);
        bench.run(0.01);
        expect(bench.piBus!.scan()).toEqual([0x49, 0x68]);
    });

    it('two sensors on one address warn, and only one answers', () => {
        const p = i2cProject();
        p.parts.find(x => x.id === 'ads11151')!.props.address = '0x48';
        const bench = new Bench(p);
        bench.run(0.01);
        expect(bench.piBus!.scan()).toEqual([0x48, 0x68]);
        expect(bench.warnings.some(w => /both answer at I²C address 0x48/.test(w.text))).toBe(true);
    });
});

describe('pigpio', () => {
    it('drives PWM, servo pulses and reads edges through callbacks; its I2C reads the sensors', () => {
        const project = i2cProject();
        const bench = new Bench(project);
        const output: string[] = [];
        let pressed = false;
        const rt = new PiRuntime(py, bench, {
            onOutput: (l) => output.push(...l.split('\n').filter(Boolean)),
            onStep: (b) => { const want = b.time > 0.1 && b.time < 0.2 || b.time > 0.3 && b.time < 0.4; if (want !== pressed) { pressed = want; b.setProp('button1', 'pressed', want); } },
        });
        rt.install();
        const ok = rt.exec(`
import pigpio, time
pi = pigpio.pi()
print("connected", pi.connected)
pi.set_PWM_frequency(17, 200)
pi.set_PWM_dutycycle(17, 64)
pi.set_servo_pulsewidth(18, 1500)
pi.set_mode(4, pigpio.INPUT)
pi.set_pull_up_down(4, pigpio.PUD_UP)
presses = []
cb = pi.callback(4, pigpio.FALLING_EDGE, lambda g, level, tick: presses.append(level))
time.sleep(0.5)
print("presses", len(presses), cb.tally())
cb.cancel()
h = pi.i2c_open(1, 0x48)
count, data = pi.i2c_read_i2c_block_data(h, 0, 2)
print("temp", ((data[0] << 8 | data[1]) >> 4) * 0.0625)
pi.i2c_close(h)
try:
    pi.set_servo_pulsewidth(18, 3000)
except pigpio.error as e:
    print("error", e)
pi.stop()
`);
        expect(ok).toBe(true);
        expect(output).toEqual(['connected True', 'presses 2 2', 'temp 22.0', 'error pulsewidth not 0 or 500-2500 (bad pulsewidth)']);
        expect(bench.pi!.activity(17).periodUs).toBeCloseTo(5000, -2);
        let high = 0;
        for (let i = 0; i < 960; i++) { bench.tick(); high += bench.pi!.activity(17).duty; }   // 0.2 s of a 200 Hz PWM
        expect(high / 960).toBeCloseTo(64 / 255, 2);
        expect(bench.pi!.activity(18).pulseUs).toBeCloseTo(1500, -1);
        expect(bench.state('servo1').angle).toBeGreaterThan(80);
    });
});

describe('the Python prompt', () => {
    it('keeps variables between lines, continues blocks, drives the bench in real time, prints errors, and exit() ends it', async () => {
        const { bench, output, rt } = runtime();
        rt.startConsole();
        expect(await rt.pushLine('from gpiozero import LED')).toEqual({ more: false, exited: false });
        expect(await rt.pushLine('led = LED(17)')).toEqual({ more: false, exited: false });
        expect(await rt.pushLine('for i in range(2):')).toEqual({ more: true, exited: false });
        expect(await rt.pushLine('    print("tick", i)')).toEqual({ more: true, exited: false });
        expect(await rt.pushLine('')).toEqual({ more: false, exited: false });
        await rt.pushLine('led.on()');
        const t0 = performance.now();
        await rt.pushLine('import time; time.sleep(0.2)');
        expect(performance.now() - t0).toBeGreaterThan(150);          // a real 0.2 s, not fast-forwarded
        bench.run(0.01);
        expect(bench.state('led1').brightness).toBeGreaterThan(0.5);
        await rt.pushLine('led.value');
        await rt.pushLine('1/0');
        expect(output).toContain('tick 0');
        expect(output).toContain('tick 1');
        expect(output).toContain('1');                                 // the value of led.value, as the prompt echoes it
        expect(output.some(l => l.includes('ZeroDivisionError'))).toBe(true);
        expect(await rt.pushLine('exit()')).toEqual({ more: false, exited: true });
    });

    it('Stop ends a line that sleeps', async () => {
        const { output, rt } = runtime();
        rt.startConsole();
        setTimeout(() => rt.stop(), 100);
        expect(await rt.pushLine('import time; time.sleep(5)')).toEqual({ more: false, exited: true });
        expect(output.some(l => l.includes('Traceback'))).toBe(false);
    });
});

describe('gpiozero Motor with an enable pin', () => {
    it('the Pi motor template drives a gear motor through the TB6612, both ways', () => {
        const project = template('pi_motor')!.build();
        const bench = new Bench(project);
        const rpm: number[] = [];
        let next = 0.9;
        const rt = new PiRuntime(py, bench, {
            onOutput: () => {},
            shouldStop: () => bench.time > 4.6,
            onStep: (b) => { if (b.time >= next) { rpm.push(b.state('motor1').rpm ?? 0); next += 1; } },
        });
        rt.install();
        rt.exec(project.code.sketch);
        // at 0.9 s: forward 0.25; 1.9 s: 0.5; 2.9 s: 1.0; 4.4 s: backward 0.5
        expect(rpm[0]).toBeGreaterThan(20);
        expect(rpm[1]).toBeGreaterThan(rpm[0]);
        expect(rpm[2]).toBeGreaterThan(150);
        expect(rpm[3]).toBeLessThan(-40);
    });
});

