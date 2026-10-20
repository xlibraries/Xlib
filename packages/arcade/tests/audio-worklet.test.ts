import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The worklet runs in a browser's audio thread. Here we stand in for that thread: register the processor class
// the file defines, then feed it chunks and pull render quanta out of it.
type Processor = {
    port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage(m: unknown): void };
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};
let Ctor: new (options: { outputChannelCount?: number[] }) => Processor;
const reports: unknown[] = [];

beforeAll(() => {
    const g = globalThis as Record<string, unknown>;
    g.sampleRate = 48000;
    g.AudioWorkletProcessor = class { port = { onmessage: null, postMessage: (m: unknown) => reports.push(m) }; };
    g.registerProcessor = (name: string, cls: typeof Ctor) => { expect(name).toBe('xl-audio'); Ctor = cls; };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(readFileSync(new URL('../native/runtime/xl-audio-worklet.js', import.meta.url), 'utf8'))();
});

const quantum = (channels: number) => [Array.from({ length: channels }, () => new Float32Array(128))];

describe('xl-audio worklet', () => {
    it('plays queued chunks in order across render quanta and pads underruns with silence', () => {
        const p = new Ctor({ outputChannelCount: [1] });
        p.port.onmessage!({ data: Float32Array.from({ length: 100 }, (_, i) => i + 1) });
        p.port.onmessage!({ data: Float32Array.from({ length: 50 }, (_, i) => 101 + i) });
        const out = quantum(1);
        expect(p.process([], out)).toBe(true);
        expect(out[0][0][0]).toBe(1);
        expect(out[0][0][99]).toBe(100);
        expect(out[0][0][127]).toBe(128);    // continues into the second chunk
        expect(p.process([], out)).toBe(true);
        expect(Array.from(out[0][0].slice(0, 23))).toEqual(Array.from({ length: 22 }, (_, i) => 129 + i).concat(0));
        expect(out[0][0][127]).toBe(0);      // queue empty: silence, no stale samples
    });

    it('de-interleaves stereo and upmixes mono to every output channel', () => {
        const stereo = new Ctor({ outputChannelCount: [2] });
        stereo.port.onmessage!({ data: Float32Array.from([1, -1, 2, -2]) });
        const out = quantum(2);
        stereo.process([], out);
        expect(Array.from(out[0][0].slice(0, 3))).toEqual([1, 2, 0]);
        expect(Array.from(out[0][1].slice(0, 3))).toEqual([-1, -2, 0]);

        const mono = new Ctor({});
        mono.port.onmessage!({ data: Float32Array.from([0.5]) });
        const both = quantum(2);
        mono.process([], both);
        expect(both[0][0][0]).toBe(0.5);
        expect(both[0][1][0]).toBe(0.5);
    });

    it('reports the frames played about once a second, and ignores other messages', () => {
        reports.length = 0;
        const p = new Ctor({ outputChannelCount: [1] });
        p.port.onmessage!({ data: 'not audio' });
        for (let i = 0; i < 48000 / 128; i++) p.process([], quantum(1));
        expect(reports).toEqual([{ played: 48000 }]);
        p.process([], quantum(1));
        expect(reports).toHaveLength(1);
    });
});
