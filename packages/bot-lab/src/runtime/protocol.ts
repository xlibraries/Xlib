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
    | { type: 'serial'; text: string };

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
}

export type WorkerToApp = Snapshot | { type: 'error'; message: string };

export const PYODIDE_PATH = '/vendor/pyodide';
export const SNAPSHOT_HZ = 30;
