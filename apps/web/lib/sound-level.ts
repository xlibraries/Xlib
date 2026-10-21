// The desktop's master volume: the slider in the top bar's status card writes it, every app reads it through
// host.volume. Kept in localStorage ("sound-level", 0–100) and broadcast as a window event so open windows follow
// the slider live.

const KEY = 'sound-level';
const EVENT = 'xlib:sound-level';
const DEFAULT = 75;

/** The stored level, 0–100. */
export function readSoundLevel(): number {
    try {
        const v = Number(localStorage.getItem(KEY));
        return Number.isFinite(v) && localStorage.getItem(KEY) !== null ? clampLevel(v) : DEFAULT;
    } catch {
        return DEFAULT;
    }
}

export function clampLevel(level: number): number {
    return Math.max(0, Math.min(100, Math.round(level)));
}

/** Stores a new level and tells every listener. */
export function writeSoundLevel(level: number): void {
    const clamped = clampLevel(level);
    try { localStorage.setItem(KEY, String(clamped)); } catch { /* storage blocked */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: clamped }));
}

/** Calls back with the level whenever it changes (this tab's slider, or another tab's). Returns the unsubscribe. */
export function subscribeSoundLevel(listener: (level: number) => void): () => void {
    const onLocal = (e: Event) => listener(clampLevel(Number((e as CustomEvent).detail)));
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) listener(readSoundLevel()); };
    window.addEventListener(EVENT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, onLocal); window.removeEventListener('storage', onStorage); };
}

/** 0–100 → the 0..1 gain apps apply. */
export function levelToVolume(level: number): number {
    return clampLevel(level) / 100;
}
