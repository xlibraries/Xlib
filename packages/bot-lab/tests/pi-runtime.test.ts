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
