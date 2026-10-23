// The Bot Lab app: a project list (templates and your saved projects), then the bench: parts and wires on the
// left, Parts / Code / Monitor on the right, Run and Stop on top. The simulation runs in a worker
// (runtime/client.ts → runtime/worker.ts with sim/bench.ts); this file draws its snapshots and forwards clicks.
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { AppProps } from '@xlibraries/app-sdk';
import { EngineView, type EngineInstance } from '@xlibraries/engine';
import { TICK, type PartState } from './sim/bench';
import { CATALOG, GROUPS, LED_MODELS, type PartSpec } from './sim/parts/catalog';
import { addPart, boardOf, connect, dropFromWorld, disconnect, emptyProject, loadProjects, nets, removePart, samePin, saveProjects, type Board, type PartInstance, type PinRef, type Project, type Saved } from './sim/project';
import { RuntimeClient } from './runtime/client';
import type { Snapshot } from './runtime/protocol';
import { TEMPLATES } from './templates';
import { ROBOT, headingOf, type WorldState } from './sim/world';
import { footprints } from './sim/draw';
import { figureEightTrack, ovalTrack } from './sim/track';
import type { WorldSpec } from './sim/project';
import { buildIsStale, sketchHash, UNO_FLASH, type CompileMessage, type Compiler } from './compile';
import { plotLines, type Plot } from './plot';
import { HOVER_HOLD, HOVER_HEIGHT } from './sim/hover';

const GRID = 16;   // px per grid unit on the bench

export interface BotLabOptions {
    /** Builds Arduino sketches (the site's compile endpoint). Without it, the Uno runs only the templates' builds. */
    compile?: Compiler;
    /** Whether `compile` can work here (asked when the editor opens); Build is hidden when it says no. */
    compilerAvailable?: () => Promise<boolean>;
}

export function createBotLab(options: BotLabOptions = {}): ComponentType<AppProps> {
    return function BotLab({ host }: AppProps) {
        const [projects, setProjects] = useState<Saved[]>([]);
        const [current, setCurrent] = useState<Saved | null>(null);
        useEffect(() => { setProjects(loadProjects()); }, []);   // storage is only readable after mount

        const persist = useCallback((list: Saved[]) => { setProjects(list); saveProjects(list); }, []);
        const open = (saved: Saved) => { setCurrent(saved); host.track({ category: 'Bot Lab', action: 'Open project', label: saved.project.name }); };
        const create = (project: Project) => {
            const saved: Saved = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, project, updated: Date.now() };
            persist([saved, ...projects]);
            open(saved);
        };
        const update = (project: Project) => {
            if (!current) return;
            const next = { ...current, project, updated: Date.now() };
            setCurrent(next);
            persist(projects.map(s => (s.id === next.id ? next : s)));
        };
        const remove = (id: string) => persist(projects.filter(s => s.id !== id));

        if (current) return <Workbench key={current.id} saved={current} compile={options.compile} compilerAvailable={options.compilerAvailable} onChange={update} onBack={() => setCurrent(null)} />;
        return (
            <div className="h-full w-full overflow-y-auto p-4 text-white" style={{ background: 'radial-gradient(ellipse at top, #0f2a22, #0a1410 70%)' }}>
                <div className="text-xl font-bold tracking-wide">Bot Lab</div>
                <div className="text-xs text-gray-400 mb-4">Real parts on a bench, a circuit solver underneath, real Arduino and Raspberry Pi code.</div>
                <div className="text-sm font-semibold text-emerald-200 mb-2">Templates</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    {TEMPLATES.map(t => (
                        <button key={t.id} type="button" onClick={() => create(t.build())} className="text-left rounded-xl p-3 bg-white bg-opacity-5 hover:bg-opacity-10 border border-white border-opacity-10">
                            <div className="font-semibold">{t.title}</div>
                            <div className="text-xs text-gray-300 mt-1">{t.blurb}</div>
                        </button>
                    ))}
                    <button type="button" onClick={() => create(emptyProject('Untitled'))} className="text-left rounded-xl p-3 bg-white bg-opacity-5 hover:bg-opacity-10 border border-dashed border-white border-opacity-20">
                        <div className="font-semibold">Empty bench</div>
                        <div className="text-xs text-gray-300 mt-1">Start from nothing: add parts, wire them, write a sketch or a Python script.</div>
                    </button>
                </div>
                {projects.length > 0 && <div className="text-sm font-semibold text-emerald-200 mb-2">Your projects</div>}
                <ul className="space-y-1">
                    {projects.map(s => (
                        <li key={s.id} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-white bg-opacity-5">
                            <button type="button" onClick={() => open(s)} className="flex-grow text-left">
                                <span className="font-medium">{s.project.name}</span>
                                <span className="text-xs text-gray-400 ml-2">{s.project.parts.length} parts · {new Date(s.updated).toLocaleString()}</span>
                            </button>
                            <button type="button" onClick={() => remove(s.id)} className="text-xs text-gray-400 hover:text-red-300" aria-label={`Delete ${s.project.name}`}>delete</button>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };
}

type Tab = 'parts' | 'code' | 'monitor';

const EMPTY: Snapshot = { type: 'snapshot', time: 0, running: false, states: {}, volts: {}, serial: [], console: [], warnings: [] };

function Workbench({ saved, compile, compilerAvailable, onChange, onBack }: { saved: Saved; compile?: Compiler; compilerAvailable?: () => Promise<boolean>; onChange: (p: Project) => void; onBack: () => void }) {
    const [project, setProject] = useState<Project>(saved.project);
    const [snap, setSnap] = useState<Snapshot>(EMPTY);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('parts');
    const [view, setView] = useState<'bench' | 'world'>(saved.project.world ? 'world' : 'bench');
    const [selected, setSelected] = useState<string | null>(null);
    const [pending, setPending] = useState<PinRef | null>(null);
    const client = useRef<RuntimeClient | null>(null);
    const running = snap.running;

    // the runtime worker lives for the whole visit to this project; the current project is loaded into it on change
    useEffect(() => {
        const c = new RuntimeClient();
        client.current = c;
        c.start();
        const offSnap = c.onSnapshot(setSnap);
        const offErr = c.onError(setError);
        return () => { offSnap(); offErr(); c.dispose(); client.current = null; };
    }, []);
    useEffect(() => { if (!running) client.current?.send({ type: 'load', project }); }, [project, running]);

    // every change is saved at once (projects are small); drags save on release
    const change = useCallback((next: Project, save = true) => {
        next.code.board = boardOf(next);
        setProject(next);
        if (save) onChange(next);
    }, [onChange]);

    const live = (id: string): PartState => snap.states[id] ?? {};
    const spec = (p: PartInstance) => CATALOG[p.kind];
    const pinXY = (p: PartInstance, pin: string) => {
        const s = spec(p), ps = s.pins.find(x => x.id === pin)!;
        return { x: (p.x + ps.x * s.width) * GRID, y: (p.y + ps.y * s.height) * GRID };
    };
    const byId = (id: string) => project.parts.find(p => p.id === id);

    const clickPin = (ref: PinRef) => {
        if (!pending) { setPending(ref); return; }
        const next = structuredClone(project);
        if (!samePin(pending, ref)) connect(next, pending, ref);
        setPending(null);
        change(next);
    };
    const setProp = (id: string, key: string, value: number | string | boolean) => {
        const next = structuredClone(project);
        const part = next.parts.find(p => p.id === id)!;
        part.props[key] = value;
        setProject(next);
        onChange(next);
        client.current?.send({ type: 'setProp', id, key, value });   // reaches a running bench without reloading it
    };
    const add = (kind: string) => {
        const next = structuredClone(project);
        const s = CATALOG[kind];
        const part = addPart(next, kind, 2 + (next.parts.length * 3) % 30, 2 + Math.floor(next.parts.length / 10) * (s.height + 2));
        change(next);
        setSelected(part.id);
    };
    const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
    const onPartPointerDown = (e: ReactPointerEvent<SVGGElement>, p: PartInstance) => {
        if ((e.target as Element).closest('[data-pin]')) return;
        setSelected(p.id);
        const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
        drag.current = { id: p.id, dx: (e.clientX - svg.left) / GRID - p.x, dy: (e.clientY - svg.top) / GRID - p.y };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const onPartPointerMove = (e: ReactPointerEvent<SVGGElement>) => {
        if (!drag.current) return;
        const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
        const x = Math.round((e.clientX - svg.left) / GRID - drag.current.dx), y = Math.round((e.clientY - svg.top) / GRID - drag.current.dy);
        const part = byId(drag.current.id);
        if (!part || (part.x === x && part.y === y)) return;
        const next = structuredClone(project);
        const moved = next.parts.find(p => p.id === drag.current!.id)!;
        moved.x = Math.max(0, x); moved.y = Math.max(0, y);
        change(next, false);
    };
    const onPartPointerUp = () => { if (drag.current) onChange(project); drag.current = null; };

    // a lap better than the project's best is kept with the project
    const lapBest = snap.world?.robot?.laps.best ?? null;
    useEffect(() => {
        if (lapBest === null || !project.world || (project.world.best !== undefined && project.world.best <= lapBest)) return;
        change({ ...project, world: { ...project.world, best: lapBest } });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new best lap triggers this
    }, [lapBest]);

    const netList = useMemo(() => nets(project), [project]);
    const board = boardOf(project);

    return (
        <div className="h-full w-full flex flex-col text-white" style={{ background: '#0b1511' }} data-testid="bot-lab">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white border-opacity-10 text-sm">
                <button type="button" onClick={onBack} className="px-2 py-0.5 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20">← Projects</button>
                <input value={project.name} onChange={e => change({ ...project, name: e.target.value.slice(0, 60) })} aria-label="Project name" className="bg-transparent font-semibold outline-none flex-grow min-w-0" />
                {snap.loading && <span className="text-xs text-emerald-200">loading {snap.loading}…</span>}
                {!running
                    ? <button type="button" onClick={() => client.current?.send({ type: 'run' })} disabled={project.parts.length === 0} className="px-3 py-0.5 rounded-full bg-emerald-500 text-black font-semibold disabled:opacity-40">▶ Run</button>
                    : <button type="button" onClick={() => client.current?.send({ type: 'stop' })} className="px-3 py-0.5 rounded-full bg-red-500 text-black font-semibold">■ Stop</button>}
            </div>
            <div className="flex-grow min-h-0 flex flex-col md:flex-row relative">
                {project.world && (
                    <div className="absolute z-10 mt-2 ml-2 flex text-xs rounded-full overflow-hidden border border-white border-opacity-20" role="tablist" aria-label="View">
                        {(['bench', 'world'] as const).map(v => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={'px-3 py-1 capitalize ' + (view === v ? 'bg-emerald-500 text-black font-semibold' : 'bg-black bg-opacity-40 text-gray-300')}>{v}</button>)}
                    </div>
                )}
                {project.world && view === 'world' && <WorldView spec={project.world} state={snap.world} states={snap.states} editable={!running} onChange={world => change({ ...project, world })} />}
                <div className={'flex-grow min-h-0 overflow-auto relative' + (project.world && view === 'world' ? ' hidden' : '')} style={{ background: 'repeating-linear-gradient(0deg, #0f1d17 0 1px, transparent 1px 16px), repeating-linear-gradient(90deg, #0f1d17 0 1px, transparent 1px 16px)' }} data-testid="bench" data-running={running ? 'true' : 'false'} data-time={snap.time.toFixed(2)}>
                    <svg width={Math.max(800, ...project.parts.map(p => (p.x + spec(p).width + 4) * GRID))} height={Math.max(500, ...project.parts.map(p => (p.y + spec(p).height + 4) * GRID))} className="block select-none" style={{ touchAction: 'none' }}>
                        {project.wires.map((w, i) => {
                            const a = byId(w.a.part), b = byId(w.b.part);
                            if (!a || !b) return null;
                            const pa = pinXY(a, w.a.pin), pb = pinXY(b, w.b.pin);
                            const net = netList.findIndex(n => n.includes(`${w.a.part}.${w.a.pin}`));
                            const volts = snap.volts[`${w.a.part}.${w.a.pin}`];
                            return (
                                <g key={i} onClick={() => { const next = structuredClone(project); disconnect(next, w.a, w.b); change(next); }} className="cursor-pointer" data-wire={`${w.a.part}.${w.a.pin}-${w.b.part}.${w.b.pin}`}>
                                    <path d={`M${pa.x},${pa.y} C${pa.x + 40},${pa.y} ${pb.x - 40},${pb.y} ${pb.x},${pb.y}`} fill="none" stroke="#000" strokeWidth={5} strokeOpacity={0.5} />
                                    <path d={`M${pa.x},${pa.y} C${pa.x + 40},${pa.y} ${pb.x - 40},${pb.y} ${pb.x},${pb.y}`} fill="none" stroke={wireColour(net, running && volts !== undefined ? volts : null)} strokeWidth={3} />
                                </g>
                            );
                        })}
                        {project.parts.map(p => (
                            <PartSymbol key={p.id} part={p} spec={spec(p)} state={live(p.id)} selected={selected === p.id} pending={pending} running={running}
                                onPointerDown={e => onPartPointerDown(e, p)} onPointerMove={onPartPointerMove} onPointerUp={onPartPointerUp}
                                onPin={pin => clickPin({ part: p.id, pin })} onPress={pressed => setProp(p.id, 'pressed', pressed)} />
                        ))}
                    </svg>
                    {pending && <div className="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-emerald-600 text-black">Wiring from {pending.part}.{pending.pin}: click another pin, or <button type="button" className="underline" onClick={() => setPending(null)}>cancel</button></div>}
                    {(snap.warnings.length > 0 || error) && (
                        <div className="absolute bottom-2 left-2 right-2 space-y-1" role="alert">
                            {error && <div className="text-xs px-2 py-1 rounded bg-red-700 text-white">{error}</div>}
                            {snap.warnings.slice(-3).map((w, i) => <div key={i} className={'text-xs px-2 py-1 rounded ' + (w.smoke ? 'bg-red-600 text-white' : 'bg-yellow-500 text-black')}>{w.smoke ? '💨 ' : '⚠ '}{w.text}</div>)}
                        </div>
                    )}
                </div>
                <div className="md:w-80 lg:w-96 flex-shrink-0 border-t md:border-t-0 md:border-l border-white border-opacity-10 flex flex-col min-h-0 h-1/2 md:h-full">
                    <div className="flex text-xs" role="tablist">
                        {(['parts', 'code', 'monitor'] as Tab[]).map(t => (
                            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={'flex-1 py-2 capitalize ' + (tab === t ? 'bg-white bg-opacity-10 font-semibold' : 'text-gray-400 hover:text-white')}>{t}</button>
                        ))}
                    </div>
                    <div className="flex-grow min-h-0 overflow-y-auto p-3 text-sm">
                        {tab === 'parts' && <PartsTab project={project} selected={selected} onAdd={add} onProp={setProp} onWorld={world => { change({ ...project, world }); if (world) setView('world'); }} onRemove={id => { const next = structuredClone(project); removePart(next, id); next.world = dropFromWorld(next.world, id); change(next); setSelected(null); }} />}
                        {tab === 'code' && <CodeTab project={project} board={board} running={running} snap={snap} compile={compile} compilerAvailable={compilerAvailable} onChange={code => change({ ...project, code: { ...project.code, ...code } })} />}
                        {tab === 'monitor' && <MonitorTab snap={snap} board={board} project={project} nets={netList} onSerial={text => client.current?.send({ type: 'serial', text })} onTerminal={line => client.current?.send({ type: 'terminal', line })} />}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** The world from above (x right, z down), in metres: every body (from the world itself, built on load), the track and,
 *  for a robot, its sensor spots. Stopped, a robot's world is an editor: track presets, drawing the line point by point,
 *  its width, open or closed, and the robot's start (drag it; turn it with the slider). */
function WorldView({ spec, state, states, editable, onChange }: { spec: WorldSpec; state?: WorldState; states: Record<string, PartState>; editable: boolean; onChange: (spec: WorldSpec) => void }) {
    const [drawing, setDrawing] = useState(false);
    const [mode, setMode] = useState<'top' | '3d'>('top');
    const svg = useRef<SVGSVGElement>(null);
    const dragging = useRef(false);
    const robotSpec = spec.robot;
    const pose = state?.robot;
    const shapes = useMemo(() => state ? footprints(state.bodies.shapes, state.bodies.poses) : [], [state]);
    const anchors: [number, number][] = [...spec.track.points, ...(robotSpec ? [[robotSpec.x, robotSpec.z] as [number, number]] : []),
        ...(spec.arm ? [[spec.arm.x, spec.arm.z] as [number, number]] : []), ...(spec.conveyor ? [[spec.conveyor.x, spec.conveyor.z] as [number, number]] : []), ...(spec.bin ? [[spec.bin.x, spec.bin.z] as [number, number]] : []),
        ...(robotSpec ? [[-0.5, -0.4], [0.5, 0.4]] as [number, number][] : [[-0.25, -0.25], [0.25, 0.25]] as [number, number][])];
    const pad = robotSpec ? 0.25 : 0.12;
    const minX = Math.min(...anchors.map(p => p[0])) - pad, minZ = Math.min(...anchors.map(p => p[1])) - pad;
    const w = Math.max(...anchors.map(p => p[0])) + pad - minX, h = Math.max(...anchors.map(p => p[1])) + pad - minZ;
    const x = pose ? pose.chassis[0] : robotSpec?.x ?? 0, z = pose ? pose.chassis[2] : robotSpec?.z ?? 0;
    const heading = pose ? headingOf(pose.chassis.slice(3, 7)) : robotSpec?.heading ?? 0;
    const path = spec.track.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + (spec.track.closed && spec.track.points.length > 2 ? ' Z' : '');
    const R = ROBOT;
    const laps = pose?.laps, pick = state?.pick, hover = state?.hover;
    const floorAt = (e: { clientX: number; clientY: number }): [number, number] | null => {
        const ctm = svg.current?.getScreenCTM();
        if (!ctm) return null;
        const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        return [Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000];
    };
    const track = (t: Partial<WorldSpec['track']>) => onChange({ ...spec, track: { ...spec.track, ...t }, best: undefined });
    const robot = (r: Partial<NonNullable<WorldSpec['robot']>>) => { if (robotSpec) onChange({ ...spec, robot: { ...robotSpec, ...r } }); };
    const start = spec.track.points[0], next = spec.track.points[1];
    const startLine = robotSpec && start && next ? (() => { const dx = next[0] - start[0], dz = next[1] - start[1], l = Math.hypot(dx, dz) || 1; return { x1: start[0] - dz / l * 0.15, y1: start[1] + dx / l * 0.15, x2: start[0] + dz / l * 0.15, y2: start[1] - dx / l * 0.15 }; })() : null;
    const time = (t: number | null | undefined) => t == null ? '\u2014' : `${t.toFixed(2)} s`;
    const editingRobot = editable && !!robotSpec;
    return (
        <div className="flex-grow min-h-0 relative flex flex-col" style={{ background: '#151d19' }} data-testid="world">
            <div className="absolute z-10 bottom-2 right-2 flex text-xs rounded-full overflow-hidden border border-white border-opacity-20" role="tablist" aria-label="Camera">
                {(['top', '3d'] as const).map(m => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setDrawing(false); }} className={'px-3 py-1 ' + (mode === m ? 'bg-emerald-500 text-black font-semibold' : 'bg-black bg-opacity-40 text-gray-300')}>{m === 'top' ? 'Top' : '3D'}</button>)}
            </div>
            {mode === '3d' && <World3D spec={spec} state={state} states={states} />}
            {mode === 'top' && editingRobot && (
                <div className="flex flex-wrap items-center gap-1 px-2 pt-10 pb-1 text-xs text-gray-200" aria-label="Track editor">
                    <button type="button" onClick={() => { setDrawing(false); track(ovalTrack()); }} className="px-2 py-0.5 rounded bg-white bg-opacity-10 hover:bg-opacity-20">Oval</button>
                    <button type="button" onClick={() => { setDrawing(false); track(figureEightTrack()); }} className="px-2 py-0.5 rounded bg-white bg-opacity-10 hover:bg-opacity-20">Figure 8</button>
                    <button type="button" aria-pressed={drawing} onClick={() => { if (!drawing) track({ points: [] }); setDrawing(!drawing); }} className={'px-2 py-0.5 rounded ' + (drawing ? 'bg-emerald-500 text-black' : 'bg-white bg-opacity-10 hover:bg-opacity-20')}>{drawing ? 'Done drawing' : 'Draw'}</button>
                    {drawing && <button type="button" onClick={() => track({ points: spec.track.points.slice(0, -1) })} className="px-2 py-0.5 rounded bg-white bg-opacity-10">Undo point</button>}
                    <label className="flex items-center gap-1 ml-1"><input type="checkbox" checked={spec.track.closed} onChange={e => track({ closed: e.target.checked })} />loop</label>
                    <label className="flex items-center gap-1 ml-1">line
                        <select value={String(Math.round(spec.track.width * 1000))} onChange={e => track({ width: Number(e.target.value) / 1000 })} className="bg-black bg-opacity-40 rounded px-1">
                            {[12, 19, 25, 38].map(mm => <option key={mm} value={mm}>{mm} mm</option>)}
                        </select>
                    </label>
                    <label className="flex items-center gap-1 ml-1">heading
                        <input type="range" min={-180} max={180} step={5} value={Math.round((robotSpec?.heading ?? 0) * 180 / Math.PI)} onChange={e => robot({ heading: Number(e.target.value) * Math.PI / 180 })} aria-label="Start heading" />
                    </label>
                    <span className="text-gray-400 ml-1">{drawing ? 'Click to add points along the line.' : 'Drag the robot to its start.'}</span>
                </div>
            )}
            <svg ref={svg} viewBox={`${minX} ${minZ} ${w} ${h}`} className={'w-full flex-grow min-h-0 block ' + (drawing ? 'cursor-crosshair' : '') + (mode === '3d' ? ' hidden' : '')} preserveAspectRatio="xMidYMid meet"
                onClick={e => { if (!drawing) return; const at = floorAt(e); if (at) track({ points: [...spec.track.points, at] }); }}
                onPointerMove={e => { if (!dragging.current) return; const at = floorAt(e); if (at) robot({ x: at[0], z: at[1] }); }}
                onPointerUp={() => { dragging.current = false; }}>
                <rect x={minX} y={minZ} width={w} height={h} fill="#e8e3d6" />
                {spec.track.points.length > 0 && <path d={path} fill="none" stroke="#141414" strokeWidth={spec.track.width} strokeLinejoin="round" strokeLinecap="round" data-track={spec.track.points.length} />}
                {robotSpec && spec.track.points.length === 0 && <g data-track="0" />}
                {drawing && spec.track.points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.008} fill="#2f7cff" />)}
                {startLine && <line {...startLine} stroke="#ff3b30" strokeWidth={0.006} strokeDasharray="0.012 0.008" />}
                <g data-bodies={shapes.length}>
                    {shapes.map((f, i) => f.kind === 'circle'
                        ? <circle key={i} cx={f.x} cy={f.z} r={f.r} fill={f.colour} stroke="#0b1511" strokeWidth={0.001} />
                        : <polygon key={i} points={f.points.map(p => p.join(',')).join(' ')} fill={f.colour} stroke="#0b1511" strokeWidth={0.001} />)}
                </g>
                {robotSpec && (
                    <g transform={`translate(${x},${z}) rotate(${-heading * 180 / Math.PI})`} data-robot data-x={x.toFixed(3)} data-z={z.toFixed(3)} data-heading={heading.toFixed(3)}
                        className={editingRobot && !drawing ? 'cursor-move' : ''} onPointerDown={e => { if (!editingRobot || drawing) return; e.stopPropagation(); dragging.current = true; (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId); }}>
                        {/* drawn from the world's bodies once it's built; until then (and as the drag handle) the outline */}
                        <rect x={-R.length / 2} y={-R.width / 2} width={R.length} height={R.width} rx={0.01} fill={state ? 'transparent' : '#2b6e59'} stroke={state ? 'none' : '#0b1511'} strokeWidth={0.003} />
                        <path d={`M${R.length / 2 - 0.03},-0.025 L${R.length / 2 - 0.005},0 L${R.length / 2 - 0.03},0.025`} fill="none" stroke="#9ff5d1" strokeWidth={0.006} />
                        {robotSpec.sensors.map(m => <circle key={m.part} cx={m.x} cy={m.z} r={0.007} fill={states[m.part]?.led ? '#ff3b30' : '#4a4a4a'} stroke="#fff" strokeWidth={0.002} data-sensor={m.part} />)}
                    </g>
                )}
                {(spec.spotters ?? []).map(m => <circle key={m.part} cx={m.x} cy={m.z} r={0.008} fill={states[m.part]?.led ? '#ff3b30' : '#4a4a4a'} stroke="#fff" strokeWidth={0.002} data-spotter={m.part} />)}
            </svg>
            <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 text-xs" data-testid="laps">
                {robotSpec && (laps && laps.current !== null || laps?.laps ? (
                    <>
                        {spec.track.closed
                            ? <span className="bg-black bg-opacity-70 text-white rounded px-2 py-0.5" data-laps={laps.laps}>Lap {laps.laps + (laps.current === null ? 0 : 1)} · {time(laps.current)}</span>
                            : <span className="bg-black bg-opacity-70 text-white rounded px-2 py-0.5">{laps.finished !== null ? `Finished in ${time(laps.finished)}` : time(laps.current)}</span>}
                        {laps.last !== null && <span className="bg-black bg-opacity-70 text-white rounded px-2 py-0.5">last {time(laps.last)}</span>}
                        {laps.offTrack && !laps.lost && <span className="bg-yellow-500 text-black rounded px-2 py-0.5">off the track</span>}
                        {laps.lost && <span className="bg-red-600 text-white rounded px-2 py-0.5">lost the line</span>}
                    </>
                ) : <span className="bg-white bg-opacity-70 text-gray-800 rounded px-2 py-0.5">Run to drive the robot.</span>)}
                {pick && (
                    <span className="bg-black bg-opacity-70 text-white rounded px-2 py-0.5" data-testid="pick" data-delivered={pick.delivered} data-dropped={pick.dropped}>
                        cubes {pick.delivered} in the bin · {pick.dropped} dropped · {pick.spawned} of {spec.conveyor?.cubes}{pick.finished !== null ? ` · done in ${time(pick.finished)}` : ''}
                    </span>
                )}
                {spec.quad && (!hover || hover.phase === 'ready') && <span className="bg-white bg-opacity-70 text-gray-800 rounded px-2 py-0.5">Run to fly: hold {HOVER_HEIGHT * 100} cm, level, for {HOVER_HOLD} s, then land softly.</span>}
                {hover && (
                    <>
                        <span className="bg-black bg-opacity-70 text-white rounded px-2 py-0.5 font-mono" data-testid="hover" data-phase={hover.phase} data-best={hover.best.toFixed(1)} data-passed={hover.passed}>
                            {Math.round(hover.altitude * 100)} cm · {hover.tilt.toFixed(1)}° · held {Math.min(hover.held, HOVER_HOLD).toFixed(1)} / {HOVER_HOLD} s{hover.best >= HOVER_HOLD ? ' ✓' : ''}
                        </span>
                        {hover.phase === 'crashed' && <span className="bg-red-600 text-white rounded px-2 py-0.5">crashed: {hover.crash}</span>}
                        {hover.phase === 'landed' && <span className={(hover.passed ? 'bg-emerald-500 text-black' : 'bg-yellow-500 text-black') + ' rounded px-2 py-0.5'}>{hover.passed ? `hover done · landed at ${hover.touchdown!.toFixed(2)} m/s` : hover.best >= HOVER_HOLD ? `landed too hard (${hover.touchdown!.toFixed(2)} m/s)` : `landed · best hold ${hover.best.toFixed(1)} s`}</span>}
                    </>
                )}
                {spec.best !== undefined && <span className="bg-emerald-500 text-black rounded px-2 py-0.5" data-best={spec.best.toFixed(2)}>best {time(spec.best)}</span>}
            </div>
        </div>
    );
}

/** The 3D view module's exports (native/view) */
interface ViewModule extends EngineInstance {
    _malloc(bytes: number): number;
    _free(ptr: number): void;
    _bl_view_track(points: number, n: number, width: number, closed: number): void;
    _bl_view_bodies(shapes: number, n: number): void;
    _bl_view_poses(poses: number, n: number): void;
    _bl_view_sensors(spots: number, n: number): void;
    _bl_view_focus(x: number, y: number, z: number): void;
    HEAPF32: Float32Array;
}

/** Copies floats into the module's memory for one call. A view that has failed (its module aborted) is left alone:
 *  the error stays in the view, never the app. */
function withFloats(m: ViewModule, values: number[], call: (ptr: number) => void) {
    try {
        const ptr = m._malloc(Math.max(4, values.length * 4));
        m.HEAPF32.set(values, ptr >> 2);
        try { call(ptr); } finally { m._free(ptr); }
    } catch (err) {
        console.warn('[Bot Lab view]', (err as Error).message);
    }
}

/** The world in 3D (native/view, on the engine): it draws the bodies the snapshots carry; drag to orbit, scroll to zoom. */
function World3D({ spec, state, states }: { spec: WorldSpec; state?: WorldState; states: Record<string, PartState> }) {
    const [view, setView] = useState<ViewModule | null>(null);
    useEffect(() => {
        if (!view) return;
        withFloats(view, spec.track.points.flat(), p => view._bl_view_track(p, spec.track.points.length, spec.track.width, spec.track.closed ? 1 : 0));
    }, [view, spec.track]);
    const shapes = state?.bodies.shapes;
    useEffect(() => { if (view && shapes) withFloats(view, shapes, p => view._bl_view_bodies(p, shapes.length / 7)); }, [view, shapes]);
    useEffect(() => {
        if (!view || !state) return;
        withFloats(view, state.bodies.poses, p => view._bl_view_poses(p, state.bodies.poses.length / 7));
        const spots = (state.robot?.sensors ?? []).flatMap(([x, z], i) => [x, z, states[spec.robot?.sensors[i]?.part ?? '']?.led ? 1 : 0]);
        withFloats(view, spots, p => view._bl_view_sensors(p, spots.length / 3));
        // the camera follows the robot or the quad (up as well), or looks at the arm's work
        const focus = state.robot ? [state.robot.chassis[0], 0, state.robot.chassis[2]] : state.quad ? state.quad.position : spec.arm ? [spec.arm.x + 0.1, 0, spec.arm.z] : spec.conveyor ? [spec.conveyor.x, 0, spec.conveyor.z] : [0, 0, 0];
        withFloats(view, [], () => view._bl_view_focus(focus[0], focus[1], focus[2]));
    }, [view, state, states, spec.robot, spec.arm, spec.conveyor]);
    return (
        <div className="flex-grow min-h-0" data-testid="world-3d">
            <EngineView id="view" title="Bot Lab world" baseUrl="/vendor/bot-lab" choice="auto" embedded onBack={() => {}} onReady={instance => setView(instance as ViewModule)} />
        </div>
    );
}

/** The robot's set-up: which motors drive the wheels, where the line sensors sit. */
function RobotPanel({ project, onChange }: { project: Project; onChange: (world: WorldSpec | undefined) => void }) {
    const motors = project.parts.filter(p => p.kind === 'motor'), sensors = project.parts.filter(p => p.kind === 'tcrt5000');
    const world = project.world;
    if (world && !world.robot) return null;                       // an arm or a conveyor: set up by its template
    if (!world) {
        if (motors.length < 2) return null;
        return (
            <div className="rounded-lg bg-white bg-opacity-5 p-3 text-xs">
                <div className="font-semibold text-sm mb-1">Robot</div>
                <div className="text-gray-300 mb-2">Two motors on the bench: put them on a robot\u2019s wheels and drive it in the World.</div>
                <button type="button" onClick={() => onChange({ robot: { left: motors[0].id, right: motors[1].id, sensors: sensors.map((s, i) => ({ part: s.id, x: 0.075, z: sensors.length > 1 ? -0.02 + 0.04 * i / (sensors.length - 1) : 0 })), x: 0.25, z: -0.35, heading: 0 }, track: ovalTrack() })}
                    className="px-3 py-1 rounded-full bg-emerald-500 text-black font-semibold">Put a robot in the World</button>
            </div>
        );
    }
    const spec = world.robot!;
    const robot = (r: Partial<NonNullable<WorldSpec['robot']>>) => onChange({ ...world, robot: { ...spec, ...r } });
    const mount = (id: string) => spec.sensors.find(m => m.part === id);
    const setMount = (id: string, m: { x: number; z: number } | null) => robot({ sensors: [...spec.sensors.filter(s => s.part !== id), ...(m ? [{ part: id, ...m }] : [])] });
    return (
        <div className="rounded-lg bg-white bg-opacity-5 p-3 text-xs space-y-2" data-testid="robot-panel">
            <div className="flex items-center justify-between"><span className="font-semibold text-sm">Robot</span><button type="button" onClick={() => onChange(undefined)} className="text-gray-400 hover:text-red-300">remove from the World</button></div>
            {(['left', 'right'] as const).map(side => (
                <label key={side} className="flex items-center justify-between gap-2">{side === 'left' ? 'Left wheel' : 'Right wheel'}
                    <select value={spec[side]} onChange={e => robot({ [side]: e.target.value })} className="bg-black bg-opacity-40 rounded px-1 py-0.5" aria-label={`${side} wheel motor`}>
                        {motors.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                </label>
            ))}
            {sensors.map(s => {
                const m = mount(s.id);
                return (
                    <div key={s.id} className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-1"><input type="checkbox" checked={!!m} onChange={e => setMount(s.id, e.target.checked ? { x: 0.075, z: 0 } : null)} />{s.id} on the robot</label>
                        {m && (['x', 'z'] as const).map(axis => (
                            <label key={axis} className="flex items-center gap-1">{axis === 'x' ? 'ahead' : 'right'}
                                <input type="number" step={1} min={-150} max={150} value={Math.round(m[axis] * 1000)} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setMount(s.id, { ...m, [axis]: Math.max(-0.15, Math.min(0.15, v / 1000)) }); }}
                                    className="w-14 bg-black bg-opacity-40 rounded px-1 py-0.5 text-right" aria-label={`${s.id} ${axis === 'x' ? 'ahead' : 'right'} (mm)`} />mm
                            </label>
                        ))}
                    </div>
                );
            })}
            <div className="text-gray-400">Positive motor speed rolls a wheel forwards: if the robot backs up or spins, swap a motor\u2019s wires or the wheels.</div>
        </div>
    );
}

function wireColour(net: number, volts: number | null) {
    if (volts !== null) { const t = Math.max(0, Math.min(1, volts / 5)); return `hsl(${200 - 160 * t} 90% ${45 + 20 * t}%)`; }
    const hues = [150, 40, 200, 300, 90, 0];
    return `hsl(${hues[net % hues.length] ?? 150} 60% 55%)`;
}

function PartSymbol({ part, spec, state, selected, pending, running, onPointerDown, onPointerMove, onPointerUp, onPin, onPress }: {
    part: PartInstance; spec: PartSpec; state: PartState; selected: boolean; pending: PinRef | null; running: boolean;
    onPointerDown: (e: ReactPointerEvent<SVGGElement>) => void; onPointerMove: (e: ReactPointerEvent<SVGGElement>) => void; onPointerUp: () => void;
    onPin: (pin: string) => void; onPress: (pressed: boolean) => void;
}) {
    const w = spec.width * GRID, h = spec.height * GRID, x = part.x * GRID, y = part.y * GRID;
    const led = part.kind === 'led' ? LED_MODELS[String(part.props.colour)] ?? LED_MODELS.red : null;
    const brightness = state.brightness ?? 0;
    const isBoard = part.kind === 'uno' || part.kind === 'pi' || part.kind === 'pico';
    return (
        <g transform={`translate(${x},${y})`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="cursor-move"
            data-part={part.id} data-kind={part.kind} data-brightness={state.brightness?.toFixed(2)} data-angle={state.angle?.toFixed(0)} data-dead={state.dead ? 'true' : undefined}>
            <rect width={w} height={h} rx={8} fill={part.kind === 'uno' ? '#1f6f8b' : part.kind === 'pi' ? '#8b2f5a' : part.kind === 'pico' ? '#1f6b45' : '#1a2b24'} stroke={selected ? '#9ff5d1' : '#2f4a3e'} strokeWidth={selected ? 2 : 1} />
            <text x={w / 2} y={isBoard ? 18 : h / 2 + 4} textAnchor="middle" fill="#e6f7ef" fontSize={isBoard ? 13 : 11} fontWeight={600}>{spec.title}</text>
            {part.kind === 'resistor' && <text x={w / 2} y={h - 4} textAnchor="middle" fill="#9ff5d1" fontSize={10}>{ohms(Number(part.props.ohms))}</text>}
            {part.kind === 'capacitor' && <text x={w / 2} y={h - 4} textAnchor="middle" fill="#9ff5d1" fontSize={10}>{farads(Number(part.props.farads))}</text>}
            {part.kind === 'battery' && <text x={w / 2} y={h - 6} textAnchor="middle" fill="#9ff5d1" fontSize={10}>{part.props.volts} V</text>}
            {led && (
                <g>
                    <circle cx={w / 2} cy={h / 2 - 6} r={14} fill={led.rgb} opacity={0.15 + 0.85 * brightness} />
                    {brightness > 0.05 && <circle cx={w / 2} cy={h / 2 - 6} r={24} fill={led.rgb} opacity={0.35 * brightness} />}
                    {state.dead && <text x={w / 2} y={h / 2 - 2} textAnchor="middle" fontSize={14}>💨</text>}
                </g>
            )}
            {part.kind === 'button' && (
                <rect x={w / 2 - 12} y={h / 2 - 8} width={24} height={16} rx={4} fill={part.props.pressed ? '#9ff5d1' : '#3ddc97'} className="cursor-pointer"
                    onPointerDown={e => { e.stopPropagation(); onPress(true); }} onPointerUp={e => { e.stopPropagation(); onPress(false); }} onPointerLeave={() => { if (part.props.pressed) onPress(false); }} data-button="true" />
            )}
            {part.kind === 'servo' && (
                <g transform={`translate(${w * 0.65},${h * 0.5}) rotate(${-(state.angle ?? 90) + 90})`}>
                    <circle r={10} fill="#3ddc97" />
                    <rect x={-3} y={-28} width={6} height={28} rx={3} fill="#e6f7ef" />
                </g>
            )}
            {part.kind === 'potentiometer' && (
                <g transform={`translate(${w / 2},${h * 0.55}) rotate(${-135 + 270 * Number(part.props.position)})`}>
                    <circle r={12} fill="#3ddc97" /><rect x={-2} y={-12} width={4} height={8} fill="#0b1511" />
                </g>
            )}
            {part.kind === 'pico' && (
                <g data-led={state.led ? 'on' : 'off'}>
                    <rect x={w / 2 - 10} y={26} width={20} height={8} rx={2} fill="#0b1511" />
                    <circle cx={w / 2 - 4} cy={30} r={3} fill="#34c759" opacity={state.led ? 1 : 0.15} />
                    {state.led && <circle cx={w / 2 - 4} cy={30} r={7} fill="#34c759" opacity={0.35} />}
                    <text x={w / 2 + 3} y={33} fill="#9db5aa" fontSize={7}>LED</text>
                </g>
            )}
            {part.kind === 'motor' && (
                <g data-rpm={state.rpm?.toFixed(0)}>
                    <g transform={`translate(${w * 0.62},${h * 0.5}) rotate(${state.turned ?? 0})`}>
                        <circle r={13} fill="#ffd60a" opacity={0.85} />
                        <rect x={-2} y={-13} width={4} height={26} rx={2} fill="#0b1511" />
                        <rect x={-13} y={-2} width={26} height={4} rx={2} fill="#0b1511" opacity={0.6} />
                    </g>
                    <text x={w * 0.62} y={h - 4} textAnchor="middle" fill="#9ff5d1" fontSize={9}>{running ? `${Math.round(state.rpm ?? 0)} rpm` : ''}</text>
                </g>
            )}
            {part.kind === 'tcrt5000' && (
                <g>
                    <circle cx={w * 0.35} cy={h * 0.62} r={4} fill="#ff3b30" opacity={state.led ? 1 : 0.15} data-led={state.led ? 'on' : 'off'} />
                    <rect x={w * 0.55} y={h * 0.5} width={w * 0.25} height={h * 0.25} rx={2} fill={`hsl(0 0% ${Math.round(Number(part.props.reflect) * 85 + 10)}%)`} stroke="#2f4a3e" />
                </g>
            )}
            {part.kind === 'tmp102' && <text x={w / 2} y={h / 2 + 16} textAnchor="middle" fill="#ffd60a" fontSize={11} data-readout="temperature">{Number(part.props.temperature).toFixed(1)} °C</text>}
            {part.kind === 'mpu6050' && (
                <g transform={`translate(${w / 2},${h / 2 + 14}) rotate(${Number(part.props.roll)})`}>
                    <rect x={-14} y={-3} width={28} height={6} rx={2} fill="#3ddc97" opacity={0.4 + 0.6 * Math.cos(Number(part.props.pitch) * Math.PI / 180)} />
                </g>
            )}
            {part.kind === 'ads1115' && <text x={w / 2} y={h / 2 + 16} textAnchor="middle" fill="#9ff5d1" fontSize={10}>{String(part.props.address)}</text>}
            {part.kind === 'ldr' && <circle cx={w / 2} cy={h / 2 - 8} r={6} fill="#ffd60a" opacity={0.2 + 0.8 * Number(part.props.light)} />}
            {spec.pins.map(pin => {
                const px = pin.x * w, py = pin.y * h;
                const isPending = pending?.part === part.id && pending.pin === pin.id;
                return (
                    <g key={pin.id} data-pin={pin.id} onClick={e => { e.stopPropagation(); onPin(pin.id); }} className="cursor-crosshair">
                        <circle cx={px} cy={py} r={5} fill={isPending ? '#9ff5d1' : pin.kind === 'ground' ? '#444' : pin.kind === 'power' ? '#ff6b6b' : '#cfd8d3'} stroke="#0b1511" />
                        {spec.width > 3 && <text x={px + (pin.x < 0.5 ? 8 : pin.x > 0.5 ? -8 : 0)} y={py + (pin.y === 0 ? 12 : pin.y === 1 ? -6 : 3)} textAnchor={pin.x < 0.5 ? 'start' : pin.x > 0.5 ? 'end' : 'middle'} fill="#9db5aa" fontSize={9}>{pin.label}</text>}
                    </g>
                );
            })}
            {running && state.amps !== undefined && part.kind !== 'led' && <text x={w / 2} y={-4} textAnchor="middle" fill="#9ff5d1" fontSize={9}>{(state.amps * 1000).toFixed(1)} mA</text>}
        </g>
    );
}

const ohms = (v: number) => v >= 1e6 ? `${v / 1e6} MΩ` : v >= 1000 ? `${v / 1000} kΩ` : `${v} Ω`;
const farads = (v: number) => v >= 1e-3 ? `${(v * 1e3).toPrecision(3)} mF` : v >= 1e-6 ? `${(v * 1e6).toPrecision(3)} µF` : v >= 1e-9 ? `${(v * 1e9).toPrecision(3)} nF` : `${(v * 1e12).toPrecision(3)} pF`;

function PartsTab({ project, selected, onAdd, onProp, onRemove, onWorld }: { project: Project; selected: string | null; onAdd: (kind: string) => void; onProp: (id: string, key: string, value: number | string | boolean) => void; onRemove: (id: string) => void; onWorld: (world: WorldSpec | undefined) => void }) {
    const part = project.parts.find(p => p.id === selected);
    return (
        <div className="space-y-4">
            <RobotPanel project={project} onChange={onWorld} />
            {part && (
                <div className="rounded-lg bg-white bg-opacity-5 p-3">
                    <div className="flex items-center justify-between">
                        <div className="font-semibold">{CATALOG[part.kind].title} <span className="text-gray-400 font-normal">· {part.id}</span></div>
                        <button type="button" onClick={() => onRemove(part.id)} className="text-xs text-gray-400 hover:text-red-300">remove</button>
                    </div>
                    <div className="text-xs text-gray-300 mt-1 mb-2">{CATALOG[part.kind].description}</div>
                    {Object.entries(CATALOG[part.kind].props).map(([key, p]) => (
                        <label key={key} className="flex items-center justify-between gap-2 text-xs py-1">
                            <span>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>
                            {typeof p.default === 'boolean'
                                ? <input type="checkbox" checked={part.props[key] === true} onChange={e => onProp(part.id, key, e.target.checked)} />
                                : p.options
                                    ? <select value={String(part.props[key])} onChange={e => onProp(part.id, key, e.target.value)} className="bg-black bg-opacity-40 rounded px-1 py-0.5">{p.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
                                    : p.min !== undefined && p.max !== undefined && p.max <= 1
                                        ? <input type="range" min={p.min} max={p.max} step={0.01} value={Number(part.props[key])} onChange={e => onProp(part.id, key, Number(e.target.value))} />
                                        : <input type="number" step="any" min={p.min} max={p.max} value={Number(part.props[key])} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onProp(part.id, key, Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, v))); }} className="w-28 bg-black bg-opacity-40 rounded px-1 py-0.5 text-right" />}
                        </label>
                    ))}
                </div>
            )}
            {GROUPS.map(g => {
                const kinds = Object.values(CATALOG).filter(s => s.group === g.id);
                if (!kinds.length) return null;
                return (
                    <div key={g.id}>
                        <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">{g.title}</div>
                        <div className="flex flex-wrap gap-1">
                            {kinds.map(s => <button key={s.kind} type="button" onClick={() => onAdd(s.kind)} className="text-xs px-2 py-1 rounded bg-white bg-opacity-10 hover:bg-opacity-20" title={s.description}>+ {s.title}</button>)}
                        </div>
                    </div>
                );
            })}
            <div className="text-xs text-gray-400">Click a pin, then another, to wire them. Click a wire to remove it. Drag parts to move them.</div>
        </div>
    );
}

type Build = { state: 'idle' } | { state: 'building'; status?: string } | { state: 'built'; size: number; warnings: CompileMessage[] } | { state: 'failed'; errors: CompileMessage[]; log?: string } | { state: 'unavailable'; message: string };

function CodeTab({ project, board, running, snap, compile: compileProp, compilerAvailable, onChange }: { project: Project; board: Board; running: boolean; snap: Snapshot; compile?: Compiler; compilerAvailable?: () => Promise<boolean>; onChange: (code: Partial<Project['code']>) => void }) {
    const [build, setBuild] = useState<Build>({ state: 'idle' });
    // Build shows only where the site can compile (no promise: assume it can)
    const [available, setAvailable] = useState<boolean | null>(compileProp && compilerAvailable ? null : !!compileProp);
    useEffect(() => {
        let live = true;
        if (compileProp && compilerAvailable) compilerAvailable().then(ok => { if (live) setAvailable(ok); }, () => { if (live) setAvailable(false); });
        return () => { live = false; };
    }, [compileProp, compilerAvailable]);
    const compile = available ? compileProp : undefined;
    const editor = useRef<HTMLTextAreaElement>(null);
    const hasBoard = project.parts.some(p => p.kind === 'uno' || p.kind === 'pi' || p.kind === 'pico');
    const stale = buildIsStale(project.code);
    const note = !hasBoard ? 'Add an Arduino Uno, a Raspberry Pi or a Pico to run code.'
        : board === 'pico' ? (snap.finished ? 'The script ended; the REPL is in the terminal.' : 'MicroPython on the Pico (the official firmware). Run powers the board and runs this; the terminal is its REPL (Ctrl+C interrupts).')
        : board === 'pi' ? (snap.finished ? 'The script ended. Run starts it again.' : 'Python on the Raspberry Pi: gpiozero, RPi.GPIO and time work as on the real board. Run starts the script; Stop ends it.')
            : !compile && available === null ? 'Checking whether this site can build sketches\u2026'
            : !compile ? (project.code.hex ? 'The Uno runs this sketch\u2019s last build. Building edited sketches needs the compile service, which isn\u2019t set up here.' : 'No build yet, and the compile service isn\u2019t set up here: start from a template to run one of its sketches.')
                : !project.code.hex ? 'Build the sketch to run it on the Uno.'
                    : stale ? 'The sketch changed since its last build: Run uses the old build until you build again.'
                        : 'The Uno runs this build. Edit the sketch, then Build.';

    const runBuild = async () => {
        if (!compile) return;
        const sketch = project.code.sketch;
        setBuild({ state: 'building' });
        try {
            const r = await compile(sketch, { onStatus: status => setBuild({ state: 'building', status }) });
            if ('errors' in r) setBuild({ state: 'failed', errors: r.errors, log: r.log });
            else {
                onChange({ hex: r.hex, builtFrom: sketchHash(sketch) });
                setBuild({ state: 'built', size: r.size, warnings: r.warnings });
            }
        } catch (err) {
            setBuild({ state: 'unavailable', message: (err as Error).message || 'the compile service could not be reached' });
        }
    };

    /** Puts the cursor on a message's line (and column) in the editor. */
    const goTo = (m: CompileMessage) => {
        const el = editor.current;
        if (!el || m.line < 1) return;
        const lines = project.code.sketch.split('\n');
        const start = lines.slice(0, m.line - 1).reduce((n, l) => n + l.length + 1, 0);
        const lineLength = lines[m.line - 1]?.length ?? 0;
        el.focus();
        el.setSelectionRange(start + Math.max(0, Math.min(lineLength, m.column - 1)), start + lineLength);
        el.scrollTop = Math.max(0, (m.line - 4) * 16);   // text-xs lines are 16 px
    };

    const message = (m: CompileMessage, i: number) => (
        <li key={i}>
            <button type="button" onClick={() => goTo(m)} className={'text-left w-full font-mono hover:underline ' + (m.severity === 'error' ? 'text-red-300' : 'text-yellow-200')} data-line={m.line}>
                {m.line > 0 ? `line ${m.line}: ` : ''}{m.message}
            </button>
        </li>
    );

    return (
        <div className="h-full flex flex-col gap-2">
            <div className="text-xs text-gray-300" data-testid="code-note">{note}</div>
            {board === 'uno' && hasBoard && compile && (
                <div className="flex items-center gap-2 text-xs">
                    <button type="button" onClick={runBuild} disabled={running || build.state === 'building' || !project.code.sketch.trim()} className="px-3 py-1 rounded-full bg-emerald-500 text-black font-semibold disabled:opacity-40">
                        {build.state === 'building' ? 'Building\u2026' : 'Build'}
                    </button>
                    {running && <span className="text-gray-400">Stop the bench to build.</span>}
                    {build.state === 'building' && build.status && <span className="text-gray-300" data-testid="build-progress">{build.status}</span>}
                    {build.state === 'built' && <span className="text-emerald-200" role="status">Built: {build.size} of {UNO_FLASH} bytes ({Math.round(build.size / UNO_FLASH * 100)}%){build.warnings.length ? `, ${build.warnings.length} warning${build.warnings.length > 1 ? 's' : ''}` : ''}. Press Run.</span>}
                    {build.state === 'failed' && <span className="text-red-300" role="status">{build.errors.length} error{build.errors.length > 1 ? 's' : ''}</span>}
                    {build.state === 'unavailable' && <span className="text-yellow-200" role="status">Couldn\u2019t build: {build.message}</span>}
                </div>
            )}
            <textarea ref={editor} value={project.code.sketch} onChange={e => onChange({ sketch: e.target.value })} spellCheck={false} readOnly={running} aria-label={board === 'pi' ? 'Python script' : board === 'pico' ? 'MicroPython script' : 'Sketch'} className="flex-grow min-h-[16rem] font-mono text-xs leading-4 bg-black bg-opacity-40 rounded p-2 outline-none" />
            {build.state === 'failed' && <ul className="text-xs space-y-1 max-h-40 overflow-y-auto" data-testid="build-errors">{build.errors.map(message)}</ul>}
            {build.state === 'built' && build.warnings.length > 0 && <ul className="text-xs space-y-1 max-h-32 overflow-y-auto" data-testid="build-warnings">{build.warnings.map(message)}</ul>}
        </div>
    );
}

const PLOT_COLOURS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#c084fc', '#f472b6'];

/** The Serial Plotter: each named value a line, newest on the right, over the last 200 lines */
function SerialPlot({ plot }: { plot: Plot }) {
    const W = 300, H = 140, n = Math.max(2, plot.length);
    const y = (v: number) => H - 6 - (v - plot.min) / (plot.max - plot.min) * (H - 12);
    const zero = plot.min < 0 && plot.max > 0 ? y(0) : null;
    return (
        <div className="bg-black bg-opacity-40 rounded p-2" data-testid="plot" data-series={plot.names.join(',')}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36 block" preserveAspectRatio="none">
                {zero !== null && <line x1={0} x2={W} y1={zero} y2={zero} stroke="#ffffff" strokeOpacity={0.15} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
                {plot.series.map((values, s) => {
                    // a missing value breaks the line
                    const d = values.map((v, i) => Number.isFinite(v) ? `${i && Number.isFinite(values[i - 1]) ? 'L' : 'M'}${(i / (n - 1) * W).toFixed(1)},${y(v).toFixed(1)}` : '').join('');
                    return <path key={plot.names[s]} d={d} fill="none" stroke={PLOT_COLOURS[s % PLOT_COLOURS.length]} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
                })}
            </svg>
            <div className="flex flex-wrap gap-x-3 text-[11px] font-mono mt-1">
                {plot.names.map((name, s) => {
                    const last = plot.series[s].filter(Number.isFinite).at(-1);
                    return <span key={name} style={{ color: PLOT_COLOURS[s % PLOT_COLOURS.length] }}>{name} {last === undefined ? '' : Number(last.toFixed(2))}</span>;
                })}
                <span className="text-gray-500 ml-auto">{Number(plot.min.toFixed(2))} … {Number(plot.max.toFixed(2))}</span>
            </div>
        </div>
    );
}

function MonitorTab({ snap, board, project, nets: netList, onSerial, onTerminal }: { snap: Snapshot; board: Board; project: Project; nets: string[][]; onSerial: (text: string) => void; onTerminal: (line: string) => void }) {
    const [input, setInput] = useState('');
    const history = useRef<string[]>([]);
    const back = useRef(0);
    const lines = board === 'pi' || board === 'pico' ? snap.console : snap.serial;
    const [view, setView] = useState<'text' | 'plot'>('text');
    const plot = useMemo(() => plotLines(lines), [lines]);
    const plottable = plot.length > 1;
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [lines.length]);
    const pi = (board === 'pi' && project.parts.some(p => p.kind === 'pi')) || (board === 'pico' && project.parts.some(p => p.kind === 'pico'));
    const submit = () => {
        if (pi) { onTerminal(input); if (input.trim()) history.current.push(input); back.current = 0; }
        else onSerial(input);
        setInput('');
    };
    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (!pi) return;
        if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); onTerminal('\u0003'); setInput(''); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const h = history.current;
            back.current = Math.max(0, Math.min(h.length, back.current + (e.key === 'ArrowUp' ? 1 : -1)));
            setInput(back.current ? h[h.length - back.current] : '');
        }
    };
    return (
        <div className="space-y-3">
            <div>
                <div className="flex items-center mb-1">
                    <div className="text-xs uppercase tracking-wide text-gray-400 flex-grow">{pi ? 'Terminal' : 'Serial monitor'}</div>
                    {(plottable || view === 'plot') && (
                        <div className="flex text-[11px] rounded-full overflow-hidden border border-white border-opacity-20" role="tablist" aria-label="Serial view">
                            {(['text', 'plot'] as const).map(v => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={'px-2 ' + (view === v ? 'bg-emerald-500 text-black font-semibold' : 'text-gray-300')}>{v === 'text' ? 'Text' : 'Plot'}</button>)}
                        </div>
                    )}
                </div>
                {view === 'plot' && <SerialPlot plot={plot} />}
                <div ref={scroller} data-testid="serial" className={'overflow-y-auto font-mono text-xs bg-black bg-opacity-40 rounded p-2 whitespace-pre-wrap ' + (view === 'plot' ? 'h-16 mt-1' : pi ? 'h-56' : 'h-40')}>{lines.length ? lines.join('\n') : pi ? (board === 'pico' ? '\u25b6 Run powers the Pico; its MicroPython REPL appears here.' : 'Type help, or python3 main.py to run the script.') : snap.running ? '' : 'Run the project to see what the code prints.'}</div>
                {(board === 'uno' || pi) && (
                    <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex gap-1 mt-1 items-center">
                        {pi && <span className="font-mono text-xs text-emerald-300 whitespace-pre" data-testid="prompt">{snap.prompt ?? ''}</span>}
                        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder={pi ? (snap.prompt ? '' : 'a script is running: Ctrl+C stops it') : 'send a line'} aria-label={pi ? 'Terminal' : 'Send to serial'} spellCheck={false} autoCapitalize="off" autoComplete="off"
                            className="flex-grow bg-black bg-opacity-40 rounded px-2 py-1 text-xs font-mono" disabled={!pi && !snap.running} />
                        <button type="submit" className="text-xs px-2 rounded bg-white bg-opacity-10" disabled={!pi && !snap.running}>{pi ? 'enter' : 'send'}</button>
                    </form>
                )}
            </div>
            <div>
                <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Multimeter · {snap.running ? `t = ${snap.time.toFixed(2)} s` : 'stopped'}</div>
                <table className="w-full text-xs font-mono">
                    <tbody>
                        {netList.map((net, i) => {
                            const volts = snap.volts[net[0]];
                            return <tr key={i} data-net={net.join(',')}><td className="text-gray-300 pr-2 truncate max-w-[12rem]">{net.join(' = ')}</td><td className="text-right text-emerald-200" data-volts={volts?.toFixed(3)}>{volts === undefined ? '—' : `${volts.toFixed(2)} V`}</td></tr>;
                        })}
                        {netList.length === 0 && <tr><td className="text-gray-500">No wires yet.</td></tr>}
                    </tbody>
                </table>
            </div>
            <div className="text-xs text-gray-400">{project.parts.length} parts · {project.wires.length} wires · tick {(TICK * 1e6).toFixed(0)} µs</div>
        </div>
    );
}
