// The app's handle on the runtime worker: commands go in by postMessage, snapshots come back to listeners.
// When a Python script runs synchronously (a browser without JSPI) the worker can't read messages, so Stop
// replaces the worker with a fresh one holding the same project.
import type { Project } from '../sim/project';
import type { Command, Snapshot, WorkerToApp } from './protocol';

export type WorkerFactory = () => Worker;

const defaultWorker: WorkerFactory = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'bot-lab-runtime' });

export class RuntimeClient {
    private worker: Worker | null = null;
    private project: Project | null = null;
    private last: Snapshot | null = null;
    private readonly listeners = new Set<(s: Snapshot) => void>();
    private readonly errors = new Set<(message: string) => void>();

    constructor(private readonly createWorker: WorkerFactory = defaultWorker, private readonly origin = globalThis.location?.origin ?? '') {}

    start() {
        if (this.worker) return;
        const worker = this.createWorker();
        worker.onmessage = (e: MessageEvent<WorkerToApp>) => {
            if (e.data.type === 'snapshot') { this.last = e.data; for (const l of this.listeners) l(e.data); }
            else if (e.data.type === 'error') for (const l of this.errors) l(e.data.message);
        };
        worker.onerror = (e) => { for (const l of this.errors) l(e.message || 'the runtime worker failed'); };
        worker.postMessage({ type: 'init', origin: this.origin } satisfies Command);
        if (this.project) worker.postMessage({ type: 'load', project: this.project } satisfies Command);
        this.worker = worker;
    }

    send(command: Command) {
        if (command.type === 'load') this.project = command.project;
        if (command.type === 'stop' && this.last?.running && this.last.responsive === false) { this.restart(); return; }
        this.worker?.postMessage(command);
    }

    /** A busy synchronous script can't hear Stop: end the worker and start a fresh one with the same project. */
    private restart() {
        this.worker?.terminate();
        this.worker = null;
        const stopped: Snapshot = { ...(this.last as Snapshot), running: false, responsive: true };
        this.last = stopped;
        for (const l of this.listeners) l(stopped);
        this.start();
    }

    onSnapshot(listener: (s: Snapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    onError(listener: (message: string) => void): () => void { this.errors.add(listener); return () => this.errors.delete(listener); }

    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.listeners.clear();
        this.errors.clear();
    }
}
