// The runtime worker: the bench, the emulated Uno and the Pi's Python run here, off the page's thread.
// The Uno runs in real time on a timer. A Pi script runs paced (time.sleep suspends Python through JSPI, so this
// worker keeps reading messages: button presses and Stop arrive mid-sleep); on browsers without JSPI it runs
// synchronously with busy-wait pacing, and the app restarts the worker to stop it.
import { Bench, TICK } from '../sim/bench';
import { parseProject, type Project } from '../sim/project';
import { PYODIDE_PATH, SNAPSHOT_HZ, type Command, type Snapshot, type WorkerToApp } from './protocol';
import { PiRuntime, canSuspend, type PyodideLike } from './pi';

let origin = '';
let bench: Bench | null = null;
let project: Project | null = null;
let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastReal = 0;
let pyodide: Promise<PyodideLike> | null = null;
let script: PiRuntime | null = null;
let finished = false;
let responsive = true;
const piConsole: string[] = [];

const post = (message: WorkerToApp) => self.postMessage(message);

type PartState = Snapshot['states'][string];
function snapshot(extra: Partial<Snapshot> = {}): Snapshot {
    const states: Record<string, PartState> = {};
    const volts: Record<string, number> = {};
    if (bench && project) {
        for (const part of project.parts) states[part.id] = bench.state(part.id);
        for (const key of bench.nodeOf.keys()) { const [part, pin] = key.split('.'); volts[key] = bench.volts({ part, pin }); }
    }
    return { type: 'snapshot', time: bench?.time ?? 0, running, states, volts, serial: bench?.board?.serial.slice(-200) ?? [], console: piConsole.slice(-200), warnings: bench?.warnings ?? [], finished, responsive, ...extra };
}

let lastSnapshot = 0;
function snapshotIfDue(force = false) {
    const now = performance.now();
    if (force || now - lastSnapshot >= 1000 / SNAPSHOT_HZ) { lastSnapshot = now; post(snapshot()); }
}

function stop() {
    running = false;
    script?.stop();
    if (timer) { clearInterval(timer); timer = null; }
    snapshotIfDue(true);
}

function print(text: string) {
    for (const line of text.split('\n')) if (line) { piConsole.push(line); if (piConsole.length > 500) piConsole.shift(); }
}

async function run() {
    if (!project || running) return;
    bench = new Bench(structuredClone(project));
    piConsole.length = 0;
    finished = false;
    running = true;
    if (project.code.board === 'pi' && bench.pi) { await runPython(bench); return; }
    startRealTime();
}

/** The Pi: Python runs the show, and its sleeps advance the bench. */
async function runPython(b: Bench) {
    post(snapshot({ loading: 'Python' }));
    let py: PyodideLike;
    try {
        py = await loadPython();
    } catch (err) {
        post({ type: 'error', message: `Python failed to load: ${(err as Error).message}` });
        running = false;
        snapshotIfDue(true);
        return;
    }
    if (!running || bench !== b) return;   // stopped (or reloaded) while loading
    const paced = canSuspend();
    let wall = performance.now(), sim = b.time;
    const runtime = new PiRuntime(py, b, {
        onOutput: print,
        shouldStop: () => !running,
        onStep: (bench) => {
            if (!paced) {
                // no JSPI: keep to real time by spinning (this thread can't sleep without shared memory)
                const lead = (bench.time - sim) * 1000 - (performance.now() - wall);
                if (lead < -250) { wall = performance.now(); sim = bench.time; }
                else while ((bench.time - sim) * 1000 > performance.now() - wall) { /* wait */ }
            }
            snapshotIfDue();
        },
    });
    script = runtime;
    responsive = paced;
    try {
        runtime.install();
        finished = paced ? await runtime.execPaced(project!.code.sketch) : runtime.exec(project!.code.sketch);
    } catch (err) {
        print(`runtime error: ${(err as Error).message}`);
    }
    responsive = true;
    if (script === runtime) script = null;
    // the script ended on its own: keep the bench alive so what it left stays visible
    if (running && bench === b) { startRealTime(); snapshotIfDue(true); }
    else snapshotIfDue(true);
}

/** Real time: the bench advances with the clock, at most 50 ms per slice (a stalled tab mustn't fast-forward). */
function startRealTime() {
    lastReal = performance.now();
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        if (!bench || !running) return;
        const now = performance.now();
        bench.run(Math.min(0.05, (now - lastReal) / 1000));
        lastReal = now;
        snapshotIfDue();
    }, 1000 * TICK * 40);   // ~8 ms
}

async function loadPython(): Promise<PyodideLike> {
    if (!pyodide) {
        pyodide = (async () => {
            const url = `${origin}${PYODIDE_PATH}`;
            const mod = (await import(/* webpackIgnore: true */ `${url}/pyodide.mjs`)) as { loadPyodide(options: { indexURL: string }): Promise<PyodideLike> };
            return mod.loadPyodide({ indexURL: `${url}/` });
        })();
        pyodide.catch(() => { pyodide = null; });
    }
    return pyodide;
}

self.onmessage = (e: MessageEvent<Command>) => {
    const m = e.data;
    switch (m.type) {
        case 'init': origin = m.origin; break;
        case 'load': stop(); project = parseProject(m.project); bench = new Bench(structuredClone(project)); snapshotIfDue(true); break;
        case 'run': void run(); break;
        case 'stop': stop(); break;
        case 'setProp': if (bench) { bench.setProp(m.id, m.key, m.value); if (!running) { bench.run(TICK * 4); snapshotIfDue(true); } } break;
        case 'serial': bench?.board?.write(m.text); break;
    }
};
