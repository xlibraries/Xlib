import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampLevel, levelToVolume, readSoundLevel, subscribeSoundLevel, writeSoundLevel } from '../../lib/sound-level';

// A browser's worth of globals: a window that dispatches events and a localStorage
const store = new Map<string, string>();
const target = new EventTarget();

beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', Object.assign(target, {
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
    }));
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('CustomEvent', class extends Event { detail: unknown; constructor(type: string, init?: { detail?: unknown }) { super(type); this.detail = init?.detail; } });
});
afterEach(() => vi.unstubAllGlobals());

describe('sound level', () => {
    it('defaults to 75, reads what is stored, and clamps', () => {
        expect(readSoundLevel()).toBe(75);
        store.set('sound-level', '20');
        expect(readSoundLevel()).toBe(20);
        store.set('sound-level', 'garbage');
        expect(readSoundLevel()).toBe(75);
        expect(clampLevel(140)).toBe(100);
        expect(clampLevel(-3)).toBe(0);
        expect(levelToVolume(30)).toBeCloseTo(0.3);
    });

    it('tells subscribers about writes until they unsubscribe', () => {
        const seen: number[] = [];
        const stop = subscribeSoundLevel(level => seen.push(level));
        writeSoundLevel(40);
        writeSoundLevel(250);
        expect(store.get('sound-level')).toBe('100');
        stop();
        writeSoundLevel(10);
        expect(seen).toEqual([40, 100]);
    });
});
