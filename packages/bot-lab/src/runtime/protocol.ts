// Messages between the app and the runtime worker that runs the bench. Commands go in; snapshots of what the bench
// is doing come back about 30 times a second.
import type { PartState, Warning } from '../sim/bench';
import type { Project } from '../sim/project';

export type Command =
    | { type: 'init'; origin: string }
    | { type: 'load'; project: Project }
    | { type: 'run' }
    | { type: 'stop' }
    | { type: 'setProp'; id: string; key: string; value: number | string | boolean }
    | { type: 'serial'; text: string }
    /** A line typed in the Pi's terminal ("\u0003" is Ctrl+C) */
    | { type: 'terminal'; line: string };

export interface Snapshot {
    type: 'snapshot';
    /** Simulated seconds since Run */
    time: number;
    running: boolean;
    states: Record<string, PartState>;
    /** Volts by "part.pin" for every wired pin */
    volts: Record<string, number>;
    serial: string[];
    /** The Pi's Python output (print and errors) */
    console: string[];
    warnings: Warning[];
    /** Set once a Pi script has ended on its own (not by Stop) */
    finished?: boolean;
    /** The runtime is loading something big (Pyodide) */
    loading?: string;
    /** False while a Python script runs synchronously (no JSPI in this browser): the worker can't read messages
     *  then, so inputs wait and Stop restarts the worker */
    responsive?: boolean;
    /** The Pi terminal's prompt, or absent while a script runs (the terminal only takes Ctrl+C then) */
    prompt?: string;
}

export type WorkerToApp = Snapshot | { type: 'error'; message: string };

export const PYODIDE_PATH = '/vendor/pyodide';
/** The Pico's boot ROM (float library removed) and MicroPython image, copied from packages/bot-lab/firmware */
export const PICO_PATH = '/vendor/pico';
export const PICO_FILES = { bootrom: 'rp2040-bootrom-b1-nofp.bin', uf2: 'micropython-rpi-pico-v1.29.0.uf2' };
export const SNAPSHOT_HZ = 30;
