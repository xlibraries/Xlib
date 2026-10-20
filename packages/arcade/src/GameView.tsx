// Hosts one game: picks the backend, loads its WebAssembly build, and connects it to the window (keyboard focus,
// pause while hidden, fullscreen). Closing the view shuts the game down and releases its GPU resources.
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { BACKEND_LABEL, pickBackend, type Backend, type BackendChoice } from './backend';
import type { GameInfo } from './games';
import { NO_PAD, readPad, samePad } from './gamepad';

interface GameInstance {
    _xl_set_focused(focused: number): void;
    _xl_set_paused(paused: number): void;
    _xl_quit(): void;
    _xl_set_gamepad(connected: number, lx: number, ly: number, rx: number, ry: number, buttons: number): void;
}

type CreateGame = (options: Record<string, unknown>) => Promise<GameInstance>;

type Status = { kind: 'loading' } | { kind: 'running'; backend: Backend } | { kind: 'error'; message: string };

export interface GameViewProps {
    game: GameInfo;
    baseUrl: string;
    choice: BackendChoice;
    onBack: () => void;
}

export function GameView({ game, baseUrl, choice, onBack }: GameViewProps) {
    const canvasId = 'arcade-' + useId().replace(/[^a-zA-Z0-9]/g, '');
    const canvas = useRef<HTMLCanvasElement>(null);
    const frame = useRef<HTMLDivElement>(null);
    const instance = useRef<GameInstance | null>(null);
    const [status, setStatus] = useState<Status>({ kind: 'loading' });
    const [running, setRunning] = useState<GameInstance | null>(null);
    const [fps, setFps] = useState(0);
    const [padConnected, setPadConnected] = useState(false);

    // Load the game; shut it down when the view closes
    useEffect(() => {
        let disposed = false;
        (async () => {
            const backend = await pickBackend(choice);
            if (!backend) throw new Error(choice === 'auto' ? 'This browser supports neither WebGPU nor WebGL2.' : `This browser doesn't support ${BACKEND_LABEL[choice]}.`);
            const base = `${baseUrl}/${game.id}`;
            const module = (await import(/* webpackIgnore: true */ `${base}/${backend}.js`)) as { default: CreateGame };
            const created = await module.default({
                arguments: [`--canvas=#${canvasId}`, `--game=${game.id}`],
                canvas: canvas.current,
                locateFile: (path: string) => `${base}/${path}`,
                print: (text: string) => console.log(`[${game.id}]`, text),
                printErr: (text: string) => console.warn(`[${game.id}]`, text),
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
        })().catch((err: Error) => { if (!disposed) setStatus({ kind: 'error', message: err.message }); });
        return () => {
            disposed = true;
            instance.current?._xl_quit();
            instance.current = null;
        };
    }, [game.id, baseUrl, choice, canvasId]);

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

    const Panel = game.Panel;
    const view = (
        <div ref={frame} className="relative h-full w-full bg-black" data-game={game.id} data-backend={status.kind === 'running' ? status.backend : ''} data-frames="0">
            <canvas
                ref={canvas}
                id={canvasId}
                tabIndex={0}
                aria-label={game.title}
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
                <button type="button" onClick={onBack} className="px-2 py-0.5 rounded-full bg-black bg-opacity-60 text-white hover:bg-opacity-80">← Games</button>
            </div>
            {status.kind === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">Loading {game.title}…</div>}
            {status.kind === 'error' && (
                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-200">
                    <div>Couldn&apos;t start {game.title}: {status.message}</div>
                    <button type="button" onClick={onBack} className="px-3 py-1 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20">Back to games</button>
                </div>
            )}
        </div>
    );

    if (!Panel) return view;
    return (
        <div className="h-full w-full flex flex-col md:flex-row">
            <div className="flex-grow min-h-0 md:min-w-0 h-1/2 md:h-full">{view}</div>
            <div className="h-1/2 md:h-full md:w-2/5 md:max-w-md border-t md:border-t-0 md:border-l border-black">
                {running && status.kind === 'running'
                    ? <Suspense fallback={null}><Panel instance={running} backend={status.backend} /></Suspense>
                    : <div className="h-full" style={{ background: '#16121f' }} />}
            </div>
        </div>
    );
}