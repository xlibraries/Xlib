// Reads the first connected gamepad (W3C "standard" mapping) into the compact form the runtime takes:
// sticks with a dead zone, and a bitmask of pressed buttons. sokol_app doesn't read gamepads on the web.

export const BUTTONS = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export interface PadState { connected: boolean; lx: number; ly: number; rx: number; ry: number; buttons: number }

export const NO_PAD: PadState = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, buttons: 0 };

interface PadLike { connected: boolean; axes: readonly number[]; buttons: readonly { pressed: boolean; value?: number }[] }

/** Rescales so the stick reads 0 inside the dead zone and still reaches ±1 at the edge. */
export function deadzone(v: number, zone = 0.15): number {
    const a = Math.abs(v);
    if (!Number.isFinite(v) || a < zone) return 0;
    return Math.sign(v) * Math.min(1, (a - zone) / (1 - zone));
}

export function readPad(pads: readonly (PadLike | null)[] | null | undefined): PadState {
    const pad = pads?.find((p): p is PadLike => !!p && p.connected);
    if (!pad) return NO_PAD;
    let buttons = 0;
    pad.buttons.forEach((b, i) => { if (i < 32 && (b.pressed || (b.value ?? 0) > 0.5)) buttons |= 1 << i; });
    const axis = (i: number) => deadzone(pad.axes[i] ?? 0);
    return { connected: true, lx: axis(0), ly: axis(1), rx: axis(2), ry: axis(3), buttons: buttons >>> 0 };
}

export const samePad = (a: PadState, b: PadState) =>
    a.connected === b.connected && a.buttons === b.buttons && a.lx === b.lx && a.ly === b.ly && a.rx === b.rx && a.ry === b.ry;
