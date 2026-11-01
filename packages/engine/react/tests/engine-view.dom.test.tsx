// @vitest-environment jsdom
/**
 * @file EngineView as a component, in jsdom: a fake module stands in for a WebAssembly build (loadModule), and the
 * backend probes are given (support), so everything the view does to and for a module is checked without a GPU.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EngineView, type CreateModule, type EngineInstance, type EngineViewProps } from '../src/EngineView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A module that records what the view tells it. */
function fakeModule() {
    const calls: [string, ...unknown[]][] = [];
    let options: Record<string, unknown> = {};
    const instance: EngineInstance & { xlVolume?: number } = {
        _xl_set_focused: (f) => calls.push(['focused', f]),
        _xl_set_paused: (p) => calls.push(['paused', p]),
        _xl_quit: () => calls.push(['quit']),
        _xl_set_gamepad: (...a) => calls.push(['gamepad', ...a]),
        _xl_set_tilt: (l) => calls.push(['tilt', l]),
        xlSetVolume: (v) => calls.push(['volume', v]),
    };
    const create: CreateModule = async (o) => { options = o; return instance; };
    return { instance, calls, create, options: () => options };
}

const webgl2Only = { webgpu: async () => false, webgl2: () => true };
let root: Root, host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(() => f(0), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

/** Renders the view and lets the module load. */
async function show(props: Partial<EngineViewProps> = {}, module = fakeModule()) {
    const loadModule = vi.fn(async () => ({ default: module.create }));
    const all: EngineViewProps = { id: 'hello', title: 'Hello', baseUrl: '/native/arcade@1.0.0', choice: 'auto', onBack: vi.fn(), loadModule, support: webgl2Only, ...props };
    await act(async () => { root.render(<EngineView {...all} />); });
    await act(async () => { await Promise.resolve(); });
    return { ...module, loadModule, props: all, frame: host.querySelector('[data-game]') as HTMLDivElement, canvas: host.querySelector('canvas') as HTMLCanvasElement };
}

describe('EngineView', () => {
    it('loads the build for the backend it picks, on its own canvas, and says which backend runs', async () => {
        const onReady = vi.fn();
        const { loadModule, options, instance, frame, canvas } = await show({ onReady });
        expect(loadModule).toHaveBeenCalledWith('/native/arcade@1.0.0/hello/webgl2.js');
        const o = options();
        expect(o.arguments).toEqual([`--canvas=#${canvas.id}`, '--game=hello']);
        expect(o.canvas).toBe(canvas);
        expect((o.locateFile as (p: string) => string)('webgl2.wasm')).toBe('/native/arcade@1.0.0/hello/webgl2.wasm');
        expect(frame.dataset.backend).toBe('webgl2');
        expect(host.textContent).toContain('WebGL2 · 0 fps');
        expect(onReady).toHaveBeenCalledWith(instance);
        expect((frame as unknown as { xlGame: EngineInstance }).xlGame).toBe(instance);   // for devtools and tests
        expect(canvas.getAttribute('aria-label')).toBe('Hello');
    });

    it('prints what the module prints, tagged with its name', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { options } = await show();
        (options().print as (t: string) => void)('hi');
        (options().printErr as (t: string) => void)('oops');
        expect(log).toHaveBeenCalledWith('[hello]', 'hi');
        expect(warn).toHaveBeenCalledWith('[hello]', 'oops');
        log.mockRestore();
        warn.mockRestore();
    });

    it('shows the frame rate and counts frames as the module reports them', async () => {
        const { options, frame } = await show();
        await act(async () => { (options().onStats as (s: { frames: number; fps: number }) => void)({ frames: 30, fps: 59.6 }); });
        await act(async () => { (options().onStats as (s: { frames: number; fps: number }) => void)({ frames: 30, fps: 60 }); });
        expect(host.textContent).toContain('WebGL2 · 60 fps');
        expect(frame.dataset.frames).toBe('60');
    });

    it('says why it can\'t start, with a way back', async () => {
        const onBack = vi.fn();
        await show({ onBack, support: { webgpu: async () => false, webgl2: () => false } });
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('This browser supports neither WebGPU nor WebGL2.');
        act(() => (host.querySelector('[role="alert"] button') as HTMLButtonElement).click());
        expect(onBack).toHaveBeenCalled();
        await show({ choice: 'webgpu', support: { webgpu: async () => false, webgl2: () => true } });
        expect(host.querySelector('[role="alert"]')?.textContent).toContain("This browser doesn't support WebGPU.");
        const broken = fakeModule();
        broken.create = async () => { throw new Error('out of memory'); };
        await show({}, broken);
        expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't start Hello: out of memory");
    });

    it('shuts the module down when the view closes, even if it finishes loading afterwards', async () => {
        const { calls } = await show();
        act(() => root.unmount());
        expect(calls).toContainEqual(['quit']);
        root = createRoot(host);
        const late = fakeModule();
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const create = late.create;
        late.create = async (o) => { await gate; return create(o); };
        await act(async () => { root.render(<EngineView id="slow" title="Slow" baseUrl="/b" choice="auto" onBack={() => {}} loadModule={async () => ({ default: late.create })} support={webgl2Only} />); });
        act(() => root.unmount());
        await act(async () => { release(); await gate; await Promise.resolve(); });
        expect(late.calls).toEqual([['quit']]);   // quit as soon as it arrived, never started
        root = createRoot(host);
    });

    it('gives the module the desktop\'s volume, and follows it', async () => {
        const { calls, instance, props } = await show({ volume: 0.2 });
        expect(calls).toContainEqual(['volume', 0.2]);
        expect(instance.xlVolume).toBe(0.2);
        await act(async () => { root.render(<EngineView {...props} volume={0.7} />); });
        expect(calls.at(-1)).toEqual(['volume', 0.7]);
    });

    it('tells the module when its canvas has keyboard focus', async () => {
        const { calls, canvas } = await show();
        // jsdom has no PointerEvent; React goes by the event's type
        act(() => canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
        expect(document.activeElement).toBe(canvas);
        expect(calls).toContainEqual(['focused', 1]);
        act(() => canvas.blur());
        expect(calls.at(-1)).toEqual(['focused', 0]);
    });

    it('pauses the module while the page is hidden', async () => {
        vi.useFakeTimers();
        const { calls } = await show();
        await act(async () => { vi.advanceTimersByTime(450); });
        expect(calls).toContainEqual(['paused', 0]);
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(calls.at(-1)).toEqual(['paused', 1]);
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    });

    it('passes the first gamepad on each animation frame, and shows that one is connected', async () => {
        vi.useFakeTimers();
        const pad = { connected: true, axes: [1, 0, 0, 0], buttons: [{ pressed: true }] };
        vi.stubGlobal('navigator', { ...navigator, getGamepads: () => [pad] });
        const { calls } = await show();
        await act(async () => { vi.advanceTimersByTime(40); });
        expect(calls).toContainEqual(['gamepad', 1, 1, 0, 0, 0, 1]);
        expect(host.textContent).toContain('🎮');
        const sent = calls.filter((c) => c[0] === 'gamepad').length;
        await act(async () => { vi.advanceTimersByTime(40); });
        expect(calls.filter((c) => c[0] === 'gamepad').length).toBe(sent);   // unchanged: not sent again
    });

    it('shows an app\'s panel beside the canvas once the module runs, and the back and fullscreen buttons', async () => {
        const renderPanel = vi.fn((instance: EngineInstance, backend: string) => <div data-testid="panel">{backend}</div>);
        const requestFullscreen = vi.fn(async () => {});
        HTMLElement.prototype.requestFullscreen = requestFullscreen;
        const { instance, props } = await show({ renderPanel });
        expect(host.querySelector('[data-testid="panel"]')?.textContent).toBe('webgl2');
        expect(renderPanel).toHaveBeenLastCalledWith(instance, 'webgl2');
        act(() => (host.querySelector('button[aria-label="Fullscreen"]') as HTMLButtonElement).click());
        expect(requestFullscreen).toHaveBeenCalled();
        act(() => ([...host.querySelectorAll('button')].find((b) => b.textContent === '← Back') as HTMLButtonElement).click());
        expect(props.onBack).toHaveBeenCalled();
        await act(async () => { root.render(<EngineView {...props} embedded />); });
        expect([...host.querySelectorAll('button')].some((b) => b.textContent === '← Back')).toBe(false);   // inside an app
    });

    describe('on a phone', () => {
        let mediaListeners: Record<string, () => void>;
        beforeEach(() => {
            mediaListeners = {};
            vi.stubGlobal('matchMedia', (q: string) => ({
                matches: q === '(pointer: coarse)' || q === '(orientation: portrait)',
                addEventListener: (_: string, f: () => void) => { mediaListeners[q] = f; },
                removeEventListener: () => {},
            }));
            HTMLElement.prototype.requestFullscreen = vi.fn(async () => {});
        });

        it('goes full screen and asks to be turned sideways while upright', async () => {
            const lock = vi.fn(async () => {});
            Object.defineProperty(screen, 'orientation', { configurable: true, value: { type: 'portrait-primary', lock, addEventListener: () => {}, removeEventListener: () => {} } });
            await show();
            await act(async () => { await Promise.resolve(); });
            expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled();
            expect(lock).toHaveBeenCalledWith('landscape');
            expect(host.querySelector('[data-testid="rotate-hint"]')).not.toBeNull();
        });

        it('steers by tilt once the player taps (asking permission where the browser wants it)', async () => {
            const requestPermission = vi.fn(async () => 'granted');
            class Orientation extends Event { beta = 0; gamma = 0; static requestPermission = requestPermission; }
            vi.stubGlobal('DeviceOrientationEvent', Orientation);
            Object.defineProperty(screen, 'orientation', { configurable: true, value: { type: 'landscape-primary', addEventListener: () => {}, removeEventListener: () => {} } });
            const { calls, frame } = await show();
            await act(async () => { frame.dispatchEvent(new Event('pointerup')); await Promise.resolve(); await Promise.resolve(); });
            expect(requestPermission).toHaveBeenCalled();
            const reading = (gamma: number) => Object.assign(new Orientation('deviceorientation'), { beta: 0, gamma });
            act(() => { window.dispatchEvent(reading(-60)); });   // the first reading is level
            act(() => { window.dispatchEvent(reading(-49)); });
            const tilts = calls.filter((c) => c[0] === 'tilt').map((c) => c[1] as number);
            expect(tilts[0]).toBe(0);
            expect(Math.abs(tilts[1])).toBeGreaterThan(0.3);
        });

        it('stays out of the way when embedded in an app', async () => {
            vi.stubGlobal('DeviceOrientationEvent', class extends Event {});
            await show({ embedded: true });
            expect(HTMLElement.prototype.requestFullscreen).not.toHaveBeenCalled();
            expect(host.querySelector('[data-testid="rotate-hint"]')).toBeNull();
        });
    });
});
