// Hosts one engine module (a C++/sokol program built by scripts/build.mjs): picks the backend, loads its
// WebAssembly build, and connects it to the window (keyboard focus, pause while hidden, gamepad, the desktop's
// volume, a phone's tilt, fullscreen). Closing the view shuts the module down and releases its GPU resources.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BACKEND_LABEL, pickBackend, type Backend, type BackendChoice } from './backend';
import { NO_PAD, readPad, samePad } from './gamepad';

/** The exports every module has (from xl.h); apps add their own. */
export interface EngineInstance {
    _xl_set_focused(focused: number): void;
    _xl_set_paused(paused: number): void;
    _xl_quit(): void;
    _xl_set_gamepad(connected: number, lx: number, ly: number, rx: number, ry: number, buttons: number): void;
    /** Set by xl_audio.h once the game has sound: the master volume, 0..1 */
    xlSetVolume?(volume: number): void;
    /** The master volume xl_audio.h starts its sound at (if the page set it before the game had sound) */
    xlVolume?: number;
    /** The phone's tilt as a lean, -1..1 (games that steer by gyro read xl::tilt()) */
    _xl_set_tilt?(lean: number): void;
}

/**
 * Gives a running module the desktop's volume. Its sound may not be set up yet (xl_audio.h does that when the game
 * starts its audio, which can be after the page has the module): xlVolume is what it starts at then, and
 * xlSetVolume changes it once it's playing.
 */
export function applyVolume(instance: Pick<EngineInstance, 'xlSetVolume' | 'xlVolume'>, volume: number) {
    instance.xlVolume = volume;
    instance.xlSetVolume?.(volume);
}

const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * How far the screen's top edge is tilted away from the player, in degrees, from a deviceorientation reading.
 * Works from the "up" vector in the device's frame (the third row of the W3C rotation matrix), which stays
 * continuous however the phone is held; the raw beta/gamma angles flip sign near upright.
 */
export function screenPitch(beta: number | null, gamma: number | null, orientation: string): number | null {
    if (beta === null || gamma === null) return null;
    const b = beta * Math.PI / 180, g = gamma * Math.PI / 180;
    const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(g);
    // which device axis points up the screen in this orientation
    const up = orientation.startsWith('landscape') ? (orientation === 'landscape-secondary' ? -ux : ux) : (orientation === 'portrait-secondary' ? -uy : uy);
    return Math.atan2(uz, up) * 180 / Math.PI;
}

/** The lean a tilt asks for: degrees from where the phone was first held, full lean at 22°. */
export function tiltLean(pitch: number | null, baseline: number | null): number {
    if (pitch === null || baseline === null) return 0;
    return Math.max(-1, Math.min(1, (pitch - baseline) / 22));
}

type CreateModule = (options: Record<string, unknown>) => Promise<EngineInstance>;

type Status = { kind: 'loading' } | { kind: 'running'; backend: Backend } | { kind: 'error'; message: string };

export interface EngineViewProps {
    /** The module's name: dist/<id>/ holds its builds */
    id: string;
    title: string;
    /** Where dist/ is served, e.g. "/arcade" */
    baseUrl: string;
    choice: BackendChoice;
    /** The desktop's master volume, 0..1 */
    volume?: number;
    onBack: () => void;
    backLabel?: string;
    /** Something beside the canvas once the module runs (an app's panel), given the running instance */
    renderPanel?: (instance: EngineInstance, backend: Backend) => ReactNode;
    /** A view inside an app rather than a game page: no back button, no fullscreen or sideways lock on phones, no tilt */
    embedded?: boolean;
    /** Called with the running instance once it has started (to feed it data through its exports) */
    onReady?: (instance: EngineInstance) => void;
}

export function EngineView({ id, title, baseUrl, choice, volume = 1, onBack, backLabel = '← Back', renderPanel, embedded = false, onReady }: EngineViewProps) {
    const canvasId = 'arcade-' + useId().replace(/[^a-zA-Z0-9]/g, '');
    const canvas = useRef<HTMLCanvasElement>(null);
    const frame = useRef<HTMLDivElement>(null);
    const instance = useRef<EngineInstance | null>(null);
    const [status, setStatus] = useState<Status>({ kind: 'loading' });
    const [running, setRunning] = useState<EngineInstance | null>(null);
    const [fps, setFps] = useState(0);
    const [padConnected, setPadConnected] = useState(false);
    const [portrait, setPortrait] = useState(false);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

    // Load the game; shut it down when the view closes
    useEffect(() => {
        let disposed = false;
        (async () => {
            const backend = await pickBackend(choice);
            if (!backend) throw new Error(choice === 'auto' ? 'This browser supports neither WebGPU nor WebGL2.' : `This browser doesn't support ${BACKEND_LABEL[choice]}.`);
            const base = `${baseUrl}/${id}`;
            const module = (await import(/* webpackIgnore: true */ `${base}/${backend}.js`)) as { default: CreateModule };
            const created = await module.default({
                arguments: [`--canvas=#${canvasId}`, `--game=${id}`],
                canvas: canvas.current,
                locateFile: (path: string) => `${base}/${path}`,
                print: (text: string) => console.log(`[${id}]`, text),
                printErr: (text: string) => console.warn(`[${id}]`, text),
                onStats: ({ frames, fps: rate }: { frames: number; fps: number }) => {
                    if (disposed) return;
                    setFps(Math.round(rate));
                    const el = frame.current;
                    if (el) el.dataset.frames = String(Number(el.dataset.frames || 0) + frames);
                },
            });
            if (disposed) return created._xl_quit();
            instance.current = created;
            // reachable from devtools and tests as document.querySelector('[data-game]').xlGame
            if (frame.current) Object.defineProperty(frame.current, 'xlGame', { value: created, configurable: true });
            setRunning(created);
            setStatus({ kind: 'running', backend });
            onReadyRef.current?.(created);
        })().catch((err: Error) => { if (!disposed) setStatus({ kind: 'error', message: err.message }); });
        return () => {
            disposed = true;
            instance.current?._xl_quit();
            instance.current = null;
        };
    }, [id, baseUrl, choice, canvasId]);

    // The desktop's volume slider reaches the game's audio (and again once it has loaded)
    useEffect(() => { if (running) applyVolume(running, volume); }, [running, volume]);

    // Phones: play full-screen and sideways (the lock only works in fullscreen, and only on some browsers), and
    // say so while the phone is upright
    useEffect(() => {
        if (embedded || !coarsePointer()) return;
        const el = frame.current;
        const orientation = screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> };
        el?.requestFullscreen?.().then(() => orientation.lock?.('landscape')).catch(() => { /* needs a gesture or unsupported */ });
        const media = matchMedia('(orientation: portrait)');
        const update = () => setPortrait(media.matches);
        update();
        media.addEventListener('change', update);
        return () => { media.removeEventListener('change', update); if (el && document.fullscreenElement === el) document.exitFullscreen?.().catch(() => { }); };
    }, [embedded]);

    // Phones: tilt to lean. iOS asks permission, which must come from a tap (pointerup, not pointerdown); the
    // first reading after that is "level"
    useEffect(() => {
        if (embedded || !coarsePointer() || typeof DeviceOrientationEvent === 'undefined') return;
        let baseline: number | null = null, listening = false;
        const onOrientation = (e: DeviceOrientationEvent) => {
            const pitch = screenPitch(e.beta, e.gamma, screen.orientation?.type ?? 'landscape-primary');
            if (pitch === null) return;
            if (baseline === null) baseline = pitch;
            instance.current?._xl_set_tilt?.(tiltLean(pitch, baseline));
        };
        const start = async () => {
            if (listening) return;
            listening = true;
            const Ctor = DeviceOrientationEvent as unknown as { requestPermission?(): Promise<string> };
            try { if (Ctor.requestPermission && await Ctor.requestPermission() !== 'granted') return; } catch { return; }
            window.addEventListener('deviceorientation', onOrientation);
        };
        const el = frame.current;
        el?.addEventListener('pointerup', start);
        const recalibrate = () => { baseline = null; };
        screen.orientation?.addEventListener('change', recalibrate);
        return () => { el?.removeEventListener('pointerup', start); screen.orientation?.removeEventListener('change', recalibrate); window.removeEventListener('deviceorientation', onOrientation); };
    }, [embedded]);

    // Pause while the window is minimized or the tab is hidden
    useEffect(() => {
        let last = -1;
        const check = () => {
            const el = canvas.current;
            const visible = !document.hidden && !!el && (el.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? true);
            const paused = visible ? 0 : 1;
            if (paused !== last && instance.current) {
                instance.current._xl_set_paused(paused);
                last = paused;
            }
        };
        const timer = setInterval(check, 400);
        document.addEventListener('visibilitychange', check);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
    }, []);

    // Gamepad: sokol doesn't read it on the web, so pass the first pad's state on every animation frame
    useEffect(() => {
        let raf = 0, last = NO_PAD;
        const poll = () => {
            raf = requestAnimationFrame(poll);
            const game = instance.current;
            if (!game || typeof navigator.getGamepads !== 'function') return;
            const pad = readPad(navigator.getGamepads());
            if (samePad(pad, last)) return;
            if (pad.connected !== last.connected) setPadConnected(pad.connected);
            last = pad;
            game._xl_set_gamepad(pad.connected ? 1 : 0, pad.lx, pad.ly, pad.rx, pad.ry, pad.buttons);
        };
        raf = requestAnimationFrame(poll);
        return () => cancelAnimationFrame(raf);
    }, []);

    const setFocused = (focused: boolean) => instance.current?._xl_set_focused(focused ? 1 : 0);

    const view = (
        <div ref={frame} className="relative h-full w-full bg-black" data-game={id} data-backend={status.kind === 'running' ? status.backend : ''} data-frames="0">
            <canvas
                ref={canvas}
                id={canvasId}
                tabIndex={0}
                aria-label={title}
                // sokol prevents the default mouse action, which would stop the canvas taking focus: do it here
                onPointerDownCapture={() => canvas.current?.focus()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className="block h-full w-full outline-none"
                style={{ touchAction: 'none' }}
            />
            <div className="absolute top-2 right-2 flex items-center gap-1.5 text-xs">
                {status.kind === 'running' && <span className="px-2 py-0.5 rounded-full bg-black bg-opacity-60 text-white">{padConnected ? '🎮 · ' : ''}{BACKEND_LABEL[status.backend]} · {fps} fps</span>}
                <button type="button" onClick={() => frame.current?.requestFullscreen?.()} className="px-2 py-0.5 rounded-full bg-black bg-opacity-60 text-white hover:bg-opacity-80" aria-label="Fullscreen">⛶</button>
                {!embedded && <button type="button" onClick={onBack} className="px-2 py-0.5 rounded-full bg-black bg-opacity-60 text-white hover:bg-opacity-80">{backLabel}</button>}
            </div>
            {status.kind === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">Loading {title}…</div>}
            {portrait && !embedded && status.kind === 'running' && (
                <div data-testid="rotate-hint" className="absolute inset-x-0 bottom-10 flex justify-center pointer-events-none">
                    <div className="px-4 py-2 rounded-full bg-black bg-opacity-70 text-white text-sm">🔄 Turn your phone sideways to play</div>
                </div>
            )}
            {status.kind === 'error' && (
                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-200">
                    <div>Couldn&apos;t start {title}: {status.message}</div>
                    <button type="button" onClick={onBack} className="px-3 py-1 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20">{backLabel.replace(/^← /, '') || 'Back'}</button>
                </div>
            )}
        </div>
    );

    if (!renderPanel) return view;
    return (
        <div className="h-full w-full flex flex-col md:flex-row">
            <div className="flex-grow min-h-0 md:min-w-0 h-1/2 md:h-full">{view}</div>
            <div className="h-1/2 md:h-full md:w-2/5 md:max-w-md border-t md:border-t-0 md:border-l border-black">
                {running && status.kind === 'running' ? renderPanel(running, status.backend) : <div className="h-full" style={{ background: '#16121f' }} />}
            </div>
        </div>
    );
}