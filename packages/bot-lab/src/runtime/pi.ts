// The Raspberry Pi's Python runtime: CPython (Pyodide) with Bot Lab's gpiozero / RPi.GPIO / time over the bench.
// Works wherever Pyodide loads: in the runtime worker on the site, and in Node for the tests.
//
// Two ways to run a script:
// - `execPaced` (needs JSPI, WebAssembly stack switching): time.sleep() advances the bench and then really waits
//   until the wall clock catches up, suspending Python on a promise. The worker's event loop runs meanwhile, so
//   button presses and Stop arrive mid-sleep and the simulation runs in real time without burning CPU.
// - `exec`: the script runs synchronously and its sleeps fast-forward the bench (the tests use it; so does the
//   worker on browsers without JSPI, adding busy-wait pacing in `onStep`). Stop is only seen through `shouldStop`.
import type { Bench } from '../sim/bench';
import { PI_GPIO } from '../sim/boards/pi';
import { PYTHON_FILES } from './python-generated';

/** The slice of Pyodide's API the runtime uses (so tests can also pass a fake). */
export interface PyodideLike {
    registerJsModule(name: string, module: object): void;
    runPython(code: string): unknown;
    runPythonAsync(code: string): Promise<unknown>;
    setStdout(options: { batched: (text: string) => void }): void;
    setStderr(options: { batched: (text: string) => void }): void;
    FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
}

export interface PiRuntimeOptions {
    /** A line the script printed (stdout and stderr) */
    onOutput(line: string): void;
    /** Asked before every slice of simulated time; true ends the script */
    shouldStop?(): boolean;
    /** After every slice (the worker posts snapshots here, tests poke the bench) */
    onStep?(bench: Bench): void;
}

export const STOP_MARKER = '__botlab_stopped__';
const SLICE = 0.02;          // seconds of bench per slice
const MAX_LAG = 0.25;        // a paced run that falls this far behind the clock (a slow device) stops trying to catch up

/** True when this JavaScript engine can suspend WebAssembly on a promise (JSPI), which `execPaced` needs. */
export function canSuspend(): boolean {
    const wasm = (globalThis as { WebAssembly?: { Suspending?: unknown; promising?: unknown } }).WebAssembly;
    return typeof wasm?.Suspending === 'function' && typeof wasm?.promising === 'function';
}

/** One bridge per Pyodide instance: Python's `import _bench` binds the module once, so it dispatches to whichever
 *  runtime is current rather than to the first one that installed it. */
const bridges = new WeakMap<PyodideLike, { current: PiRuntime | null }>();

export class PiRuntime {
    readonly pi;
    private stopped = false;
    private paced = false;
    private clock = { sim: 0, wall: 0 };

    constructor(private readonly py: PyodideLike, readonly bench: Bench, private readonly options: PiRuntimeOptions, private readonly now: () => number = () => performance.now() / 1000) {
        if (!bench.pi) throw new Error('the project has no Raspberry Pi');
        this.pi = bench.pi;
    }

    /** Makes this runtime the one Python talks to; installs the bridge and the libraries the first time. */
    install() {
        let bridge = bridges.get(this.py);
        if (!bridge) {
            const b: { current: PiRuntime | null } = { current: null };
            bridge = b;
            bridges.set(this.py, b);
            const live = () => { if (!b.current) throw new Error('no Pi runtime is current'); return b.current; };
            this.py.registerJsModule('_bench', {
                has_pin: (bcm: number) => PI_GPIO.includes(bcm),
                pins: () => PI_GPIO.slice(),
                mode: (bcm: number, mode: string, pull: string) => live().pi.setMode(bcm, mode === 'output' ? 'output' : 'input', pull === 'up' ? 'up' : pull === 'down' ? 'down' : 'none'),
                write: (bcm: number, high: boolean) => live().pi.write(bcm, high),
                read: (bcm: number) => live().pi.read(bcm),
                pwm: (bcm: number, hz: number, duty: number) => live().pi.pwm(bcm, hz, duty),
                pulse: (bcm: number, widthUs: number, frameUs: number) => live().pi.pulse(bcm, widthUs, frameUs),
                time: () => live().bench.time,
                paced: () => live().paced,
                run: (seconds: number) => live().run(seconds),
                run_paced: (seconds: number) => live().runPaced(seconds),
            });
            this.py.FS.mkdirTree('/lib/botlab/RPi');
            for (const [path, source] of Object.entries(PYTHON_FILES)) this.py.FS.writeFile(`/lib/botlab/${path}`, source);
            this.py.FS.mkdirTree('/home/pi');
            this.py.runPython(`import sys\nif '/lib/botlab' not in sys.path: sys.path.insert(0, '/lib/botlab')\nimport _bench_time`);
        }
        bridge.current = this;
        this.py.setStdout({ batched: (text) => this.options.onOutput(text) });
        this.py.setStderr({ batched: (text) => this.options.onOutput(text) });
    }

    /** Runs a script synchronously, sleeps fast-forwarding the bench. Returns true if it ended on its own. */
    exec(script: string): boolean {
        this.prepare(script, false);
        this.py.runPython(WRAPPER);
        return this.finish();
    }

    /** Runs a script in real time: sleeps wait for the clock (needs `canSuspend()`). Returns true if it ended on its own. */
    async execPaced(script: string): Promise<boolean> {
        if (!canSuspend()) throw new Error('this JavaScript engine cannot suspend WebAssembly (JSPI); use exec()');
        this.prepare(script, true);
        this.clock = { sim: this.bench.time, wall: this.now() };
        await this.py.runPythonAsync(WRAPPER);
        return this.finish();
    }

    private prepare(script: string, paced: boolean) {
        if (bridges.get(this.py)?.current !== this) this.install();
        this.stopped = false;
        this.paced = paced;
        this.py.FS.writeFile('/home/pi/main.py', script);
    }

    private finish(): boolean {
        return (this.py.runPython('__botlab_ok') as boolean) && !this.stopped;
    }

    /** Ends a paced script at its next sleep slice (or as soon as its current wait ends). */
    stop() { this.stopped = true; }

    private checkStop() {
        if (this.stopped || this.options.shouldStop?.()) { this.stopped = true; throw new Error(STOP_MARKER); }
    }

    /** Advances the bench by `seconds` in slices; stops the script when the host asks. */
    private run(seconds: number) {
        let left = Math.max(0, seconds);
        do {
            this.checkStop();
            const slice = Math.min(SLICE, left);
            this.bench.run(slice);
            left -= slice;
            this.options.onStep?.(this.bench);
        } while (left > 1e-9);
    }

    /** As `run`, then waits until the wall clock has caught up with the bench: Python is suspended meanwhile. */
    private async runPaced(seconds: number) {
        let left = Math.max(0, seconds);
        do {
            this.checkStop();
            const slice = Math.min(SLICE, left);
            this.bench.run(slice);
            left -= slice;
            this.options.onStep?.(this.bench);
            const lead = (this.bench.time - this.clock.sim) - (this.now() - this.clock.wall);
            if (lead > 0.002) await new Promise(resolve => setTimeout(resolve, lead * 1000));
            else if (lead < -MAX_LAG) this.clock = { sim: this.bench.time, wall: this.now() };   // never fast-forward to catch up
        } while (left > 1e-9);
        this.checkStop();   // a Stop that arrived during the last wait
    }
}

// Runs /home/pi/main.py as __main__; a Stop ends it quietly, any other error prints its traceback
const WRAPPER = `
import sys, traceback, gpiozero
gpiozero._scheduler.jobs.clear()   # an earlier run's blinks and button watchers end with it
__botlab_ok = True
try:
    __botlab_code = compile(open('/home/pi/main.py').read(), 'main.py', 'exec')
    exec(__botlab_code, {'__name__': '__main__', '__file__': '/home/pi/main.py'})
except BaseException as __e:
    if '${STOP_MARKER}' in str(__e):
        __botlab_ok = False
    else:
        traceback.print_exc()
        __botlab_ok = False
`;
