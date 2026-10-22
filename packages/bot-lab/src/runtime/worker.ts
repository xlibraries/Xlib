// The runtime worker: the bench, the emulated Uno and the Pi's Python run here, off the page's thread.
// The Uno runs in real time on a timer. A Pi script runs paced (time.sleep suspends Python through JSPI, so this
// worker keeps reading messages: button presses and Stop arrive mid-sleep); on browsers without JSPI it runs
// synchronously with busy-wait pacing, and the app restarts the worker to stop it.
import { Bench, TICK } from '../sim/bench';
import { parseProject, type Project } from '../sim/project';
import { PYODIDE_PATH, SNAPSHOT_HZ, type Command, type Snapshot, type WorkerToApp } from './protocol';
import { PiRuntime, canSuspend, type PyodideLike } from './pi';
import { PY_MORE, PY_PROMPT, SHELL_PROMPT, shell } from './terminal';

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
/** The Pi terminal: a shell, or the Python prompt (a session on a live bench) */
let python: { runtime: PiRuntime; more: boolean; queue: Promise<void> } | null = null;

const post = (message: WorkerToApp) => self.postMessage(message);

type PartState = Snapshot['states'][string];
function snapshot(extra: Partial<Snapshot> = {}): Snapshot {
    const states: Record<string, PartState> = {};
    const volts: Record<string, number> = {};
    if (bench && project) {
        for (const part of project.parts) states[part.id] = bench.state(part.id);
        for (const key of bench.nodeOf.keys()) { const [part, pin] = key.split('.'); volts[key] = bench.volts({ part, pin }); }
    }
    return { type: 'snapshot', time: bench?.time ?? 0, running, states, volts, serial: bench?.board?.serial.slice(-200) ?? [], console: piConsole.slice(-200), warnings: bench?.warnings ?? [], finished, responsive, prompt: prompt(), ...extra };
}

let lastSnapshot = 0;
function snapshotIfDue(force = false) {
    const now = performance.now();
    if (force || now - lastSnapshot >= 1000 / SNAPSHOT_HZ) { lastSnapshot = now; post(snapshot()); }
}

/** What the terminal shows before the cursor: nothing while a script runs. */
function prompt(): string | undefined {
    if (python) return python.more ? PY_MORE : PY_PROMPT;
    return running && script ? undefined : SHELL_PROMPT;
}

function stop() {
    running = false;
    script?.stop();
    python?.runtime.stop();
    python = null;
    if (timer) { clearInterval(timer); timer = null; }
    snapshotIfDue(true);
}

function print(text: string) {
    for (const line of text.split('\n')) if (line) { piConsole.push(line); if (piConsole.length > 500) piConsole.shift(); }
}

async function run() {
    if (!project) return;
    if (python) stop();
    if (running) return;
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

/** A line from the Pi's terminal. */
function terminal(line: string) {
    if (!project || project.code.board !== 'pi') return;
    if (line === '\u0003') {                                   // Ctrl+C
        if (running) { print('^C'); stop(); }
        return;
    }
    if (running && script) { print('(a script is running: Ctrl+C or \u25a0 Stop ends it)'); snapshotIfDue(true); return; }
    if (python) { pythonLine(python, line); return; }
    print(`${SHELL_PROMPT}${line}`);
    if (!bench) bench = new Bench(structuredClone(project));
    if (!running) bench.run(TICK * 2);                          // a solved net: the bus knows who's powered
    const b = bench;
    const result = shell(line, { script: project.code.sketch, scan: () => b.piBus?.scan() ?? [] });
    for (const out of result.output) piConsole.push(out);
    if (result.action === 'clear') piConsole.length = 0;
    snapshotIfDue(true);
    if (result.action === 'run') void run();
    else if (result.action === 'python') void startPython();
}

/** Opens the Python prompt on a fresh, running bench. */
async function startPython() {
    if (!project) return;
    post(snapshot({ loading: 'Python' }));
    let py: PyodideLike;
    try { py = await loadPython(); } catch (err) { post({ type: 'error', message: `Python failed to load: ${(err as Error).message}` }); return; }
    bench = new Bench(structuredClone(project));
    finished = false;
    running = true;
    const b = bench;
    const runtime = new PiRuntime(py, b, { onOutput: print, shouldStop: () => !running || bench !== b, onStep: () => snapshotIfDue() });
    runtime.install();
    runtime.startConsole();
    python = { runtime, more: false, queue: Promise.resolve() };
    startRealTime();
    snapshotIfDue(true);
}

/** Lines at the Python prompt run one after another; the bench keeps time between them. */
function pythonLine(session: NonNullable<typeof python>, line: string) {
    print(`${session.more ? PY_MORE : PY_PROMPT}${line}`);
    snapshotIfDue(true);
    session.queue = session.queue.then(async () => {
        if (python !== session) return;
        if (timer) { clearInterval(timer); timer = null; }        // the line's sleeps advance the bench now
        let result = { more: false, exited: true };
        try { result = await session.runtime.pushLine(line); } catch (err) { print(`runtime error: ${(err as Error).message}`); }
        if (python !== session) return;
        session.more = result.more;
        if (result.exited) { python = null; running = false; }
        else startRealTime();
        snapshotIfDue(true);
    });
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
        case 'terminal': terminal(m.line); break;
    }
};
