import { describe, expect, it } from 'vitest';
import { RuntimeClient } from '../src/runtime/client';
import type { Command, Snapshot } from '../src/runtime/protocol';
import { emptyProject } from '../src/sim/project';

/** A stand-in for the runtime worker that records commands and lets the test answer. */
class FakeWorker {
    sent: Command[] = [];
    terminated = false;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    postMessage(c: Command) { this.sent.push(c); }
    terminate() { this.terminated = true; }
    reply(s: Partial<Snapshot>) {
        this.onmessage?.({ data: { type: 'snapshot', time: 0, running: false, states: {}, volts: {}, serial: [], console: [], warnings: [], ...s } } as MessageEvent);
    }
}

function client() {
    const workers: FakeWorker[] = [];
    const c = new RuntimeClient('/native/bot-lab@1.0.0', () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; }, 'https://example.test');
    const snaps: Snapshot[] = [];
    c.onSnapshot(s => snaps.push(s));
    c.start();
    return { c, workers, snaps };
}

describe('the runtime client', () => {
    it('starts the worker with the origin and forwards commands', () => {
        const { c, workers } = client();
        c.send({ type: 'load', project: emptyProject('a') });
        c.send({ type: 'run' });
        expect(workers[0].sent.map(m => m.type)).toEqual(['init', 'load', 'run']);
        expect(workers[0].sent[0]).toEqual({ type: 'init', origin: 'https://example.test', native: '/native/bot-lab@1.0.0' });
    });

    it('Stop goes to a responsive worker as a message', () => {
        const { c, workers } = client();
        workers[0].reply({ running: true, responsive: true });
        c.send({ type: 'stop' });
        expect(workers).toHaveLength(1);
        expect(workers[0].sent.at(-1)).toEqual({ type: 'stop' });
    });

    it('Stop replaces a worker busy in a synchronous script, reloading the same project', () => {
        const { c, workers, snaps } = client();
        const project = emptyProject('mine');
        c.send({ type: 'load', project });
        workers[0].reply({ running: true, responsive: false, time: 3 });
        c.send({ type: 'stop' });
        expect(workers[0].terminated).toBe(true);
        expect(workers).toHaveLength(2);
        expect(workers[1].sent).toEqual([{ type: 'init', origin: 'https://example.test', native: '/native/bot-lab@1.0.0' }, { type: 'load', project }]);
        expect(snaps.at(-1)).toMatchObject({ running: false, time: 3 });
    });

    it('reports worker errors', () => {
        const { c, workers } = client();
        const errors: string[] = [];
        c.onError(m => errors.push(m));
        workers[0].onmessage?.({ data: { type: 'error', message: 'Python failed to load' } } as MessageEvent);
        expect(errors).toEqual(['Python failed to load']);
    });
});

describe('ending the runtime', () => {
    it('stops the worker and forgets every listener when disposed', () => {
        const { c, workers, snaps } = client();
        const errors: string[] = [];
        c.onError(m => errors.push(m));
        c.dispose();
        expect(workers[0].terminated).toBe(true);
        workers[0].reply({ time: 1 });
        workers[0].onmessage?.({ data: { type: 'error', message: 'late' } } as MessageEvent);
        expect(snaps).toEqual([]);
        expect(errors).toEqual([]);
        c.send({ type: 'run' });   // no worker any more: nothing to send to
        expect(workers[0].sent.map(m => m.type)).toEqual(['init']);
    });

    it('reports errors from the worker and from its messages, until unsubscribed', () => {
        const { c, workers } = client();
        const errors: string[] = [];
        const off = c.onError(m => errors.push(m));
        workers[0].onmessage?.({ data: { type: 'error', message: 'bad sketch' } } as MessageEvent);
        workers[0].onerror?.({ message: '' } as ErrorEvent);
        expect(errors).toEqual(['bad sketch', 'the runtime worker failed']);
        off();
        workers[0].onerror?.({ message: 'again' } as ErrorEvent);
        expect(errors).toHaveLength(2);
    });
});
