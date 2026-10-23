// A project: parts on the bench, wires between pins, the board's code. Saved on this device as JSON (and, later,
// behind a share link). Loading is forgiving: unknown parts and dangling wires are dropped, props are clamped.
import type { Track } from './track';
import { CATALOG, defaultProps, pinSpec } from './parts/catalog';

export interface PinRef { part: string; pin: string }

export interface PartInstance {
    id: string;
    kind: string;
    /** Position on the bench, grid units */
    x: number;
    y: number;
    props: Record<string, number | string | boolean>;
}

export interface Wire { a: PinRef; b: PinRef }

export type Board = 'uno' | 'pi' | 'pico';

export interface Code {
    board: Board;
    /** Arduino C++ for the Uno, Python for the Pi, MicroPython for the Pico */
    sketch: string;
    /** The compiled sketch, when it has been built (templates ship with theirs) */
    hex: string;
    /** `sketchHash` of the sketch the hex was built from (tells the editor the build is out of date) */
    builtFrom?: string;
}

/** Where a line sensor sits on the robot: x forward of the chassis centre, z to its right (metres) */
export interface SensorMount { part: string; x: number; z: number }

/** A desktop arm: which servo drives each joint, where its base stands */
export interface ArmSpec {
    base: string;
    shoulder: string;
    elbow: string;
    wrist: string;
    gripper: string;
    x: number;
    z: number;
    heading: number;
}

/** A conveyor belt driven by a motor; cubes appear at its near end every `spawn` seconds, up to `cubes` of them */
export interface ConveyorSpec { motor: string; x: number; z: number; heading: number; length: number; spawn: number; cubes: number }

/** A quadcopter: which brushless motor sits at each corner (X layout), its IMU and downward rangefinder, where it lands */
export interface QuadSpec { frontLeft: string; frontRight: string; backLeft: string; backRight: string; imu?: string; range?: string; x: number; z: number; heading: number }

/** A line sensor fixed above the floor (not on a robot): it sees cubes below it */
export interface SpotterMount { part: string; x: number; z: number; height: number }

/** The machines and their floor (projects without a world stay on the bench) */
export interface WorldSpec {
    arm?: ArmSpec;
    conveyor?: ConveyorSpec;
    /** Where cubes should end up */
    bin?: { x: number; z: number; size: number };
    spotters?: SpotterMount[];
    quad?: QuadSpec;
    /** Wind, m/s along x and z, with gusts up to `gust` m/s */
    wind?: { x: number; z: number; gust: number };
    robot?: {
        /** The motors that drive the left and right wheels (positive speed rolls forward) */
        left: string;
        right: string;
        sensors: SensorMount[];
        /** Where it starts: metres, and radians (0 faces +x) */
        x: number;
        z: number;
        heading: number;
    };
    track: Track;
    /** The best lap so far on this track, seconds */
    best?: number;
}

export interface Project {
    version: 1;
    name: string;
    parts: PartInstance[];
    wires: Wire[];
    code: Code;
    world?: WorldSpec;
}

/** Which board the code runs on, when a bench has more than one: the Uno, else the Pi, else the Pico. */
export function boardOf(project: Project): Board {
    const has = (kind: string) => project.parts.some(p => p.kind === kind);
    return has('uno') ? 'uno' : has('pi') ? 'pi' : has('pico') ? 'pico' : 'uno';
}

export const STORAGE_KEY = 'bot-lab:projects';

export function emptyProject(name = 'Untitled'): Project {
    return { version: 1, name, parts: [], wires: [], code: { board: 'uno', sketch: '', hex: '' } };
}

/** A fresh id for a part of `kind` that no part in the project has. */
export function nextId(project: Project, kind: string): string {
    for (let i = 1; ; i++) { const id = `${kind}${i}`; if (!project.parts.some(p => p.id === id)) return id; }
}

export function addPart(project: Project, kind: string, x: number, y: number): PartInstance {
    const part: PartInstance = { id: nextId(project, kind), kind, x, y, props: defaultProps(kind) };
    project.parts.push(part);
    return part;
}

export function removePart(project: Project, id: string) {
    project.parts = project.parts.filter(p => p.id !== id);
    project.wires = project.wires.filter(w => w.a.part !== id && w.b.part !== id);
}

export const samePin = (a: PinRef, b: PinRef) => a.part === b.part && a.pin === b.pin;

/** Adds a wire unless it already exists or joins a pin to itself; returns whether it was added. */
export function connect(project: Project, a: PinRef, b: PinRef): boolean {
    if (samePin(a, b)) return false;
    if (project.wires.some(w => (samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a)))) return false;
    project.wires.push({ a, b });
    return true;
}

export function disconnect(project: Project, a: PinRef, b: PinRef) {
    project.wires = project.wires.filter(w => !((samePin(w.a, a) && samePin(w.b, b)) || (samePin(w.a, b) && samePin(w.b, a))));
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A project from untrusted JSON (storage, a share link, an import): never throws, drops what it can't use. */
export function parseProject(input: unknown): Project {
    const project = emptyProject();
    if (!isRecord(input)) return project;
    if (typeof input.name === 'string') project.name = input.name.slice(0, 60) || 'Untitled';
    const ids = new Set<string>();
    if (Array.isArray(input.parts)) for (const raw of input.parts) {
        if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.kind !== 'string' || !CATALOG[raw.kind] || ids.has(raw.id)) continue;
        const props = defaultProps(raw.kind);
        if (isRecord(raw.props)) for (const [key, spec] of Object.entries(CATALOG[raw.kind].props)) {
            const v = raw.props[key];
            if (typeof spec.default === 'number' && typeof v === 'number' && Number.isFinite(v)) props[key] = Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, v));
            else if (typeof spec.default === 'boolean' && typeof v === 'boolean') props[key] = v;
            else if (typeof spec.default === 'string' && typeof v === 'string' && (!spec.options || spec.options.includes(v))) props[key] = v;
        }
        ids.add(raw.id);
        project.parts.push({ id: raw.id, kind: raw.kind, x: num(raw.x), y: num(raw.y), props });
    }
    const kindOf = (id: string) => project.parts.find(p => p.id === id)?.kind ?? '';
    const validPin = (ref: unknown): ref is PinRef => isRecord(ref) && typeof ref.part === 'string' && typeof ref.pin === 'string' && !!pinSpec(kindOf(ref.part), ref.pin);
    if (Array.isArray(input.wires)) for (const raw of input.wires) {
        if (isRecord(raw) && validPin(raw.a) && validPin(raw.b)) connect(project, { part: raw.a.part, pin: raw.a.pin }, { part: raw.b.part, pin: raw.b.pin });
    }
    if (isRecord(input.code)) {
        if (input.code.board === 'pi' || input.code.board === 'pico') project.code.board = input.code.board;
        if (typeof input.code.sketch === 'string') project.code.sketch = input.code.sketch.slice(0, 65536);
        if (typeof input.code.hex === 'string' && /^(:[0-9A-Fa-f]*\s*)*$/.test(input.code.hex)) project.code.hex = input.code.hex.slice(0, 200_000);
        if (typeof input.code.builtFrom === 'string' && /^[0-9a-f]{8}$/.test(input.code.builtFrom)) project.code.builtFrom = input.code.builtFrom;
    }
    if (isRecord(input.world)) project.world = parseWorld(input.world, project) ?? undefined;
    return project;
}

const finite = (v: unknown, fallback = 0, limit = 50) => typeof v === 'number' && Number.isFinite(v) ? Math.max(-limit, Math.min(limit, v)) : fallback;

/** A world from storage: motors, servos and sensors must be parts of that kind; the track keeps at most 2000 points. */
function parseWorld(w: Record<string, unknown>, project: Project): WorldSpec | null {
    const robot = isRecord(w.robot) ? w.robot : null, track = isRecord(w.track) ? w.track : null;
    if (!track) return null;
    const isKind = (id: unknown, kind: string) => typeof id === 'string' && project.parts.some(p => p.id === id && p.kind === kind);
    const out: WorldSpec = { track: { width: 0.019, points: [], closed: false } };
    if (isRecord(w.arm)) {
        const a = w.arm, joints = ['base', 'shoulder', 'elbow', 'wrist', 'gripper'] as const;
        if (joints.every(j => isKind(a[j], 'servo'))) out.arm = { base: a.base as string, shoulder: a.shoulder as string, elbow: a.elbow as string, wrist: a.wrist as string, gripper: a.gripper as string, x: finite(a.x, 0, 10), z: finite(a.z, 0, 10), heading: finite(a.heading, 0, 7) };
    }
    if (isRecord(w.conveyor) && isKind(w.conveyor.motor, 'motor')) {
        const c = w.conveyor;
        out.conveyor = { motor: c.motor as string, x: finite(c.x, 0, 10), z: finite(c.z, 0, 10), heading: finite(c.heading, 0, 7), length: Math.max(0.1, Math.min(2, finite(c.length, 0.4))), spawn: Math.max(0.5, Math.min(60, finite(c.spawn, 4, 60))), cubes: Math.max(0, Math.min(30, Math.round(finite(c.cubes, 5, 30)))) };
    }
    if (isRecord(w.bin)) out.bin = { x: finite(w.bin.x, 0, 10), z: finite(w.bin.z, 0, 10), size: Math.max(0.04, Math.min(0.5, finite(w.bin.size, 0.1))) };
    const spotters = (Array.isArray(w.spotters) ? w.spotters : []).filter(isRecord).filter(m => isKind(m.part, 'tcrt5000'))
        .map(m => ({ part: m.part as string, x: finite(m.x, 0, 10), z: finite(m.z, 0, 10), height: Math.max(0.01, Math.min(0.5, finite(m.height, 0.1))) })).slice(0, 8);
    if (spotters.length) out.spotters = spotters;
    if (isRecord(w.quad)) {
        const q = w.quad, corners = ['frontLeft', 'frontRight', 'backLeft', 'backRight'] as const;
        if (corners.every(c => isKind(q[c], 'quadmotor'))) out.quad = {
            frontLeft: q.frontLeft as string, frontRight: q.frontRight as string, backLeft: q.backLeft as string, backRight: q.backRight as string,
            ...(isKind(q.imu, 'mpu6050') ? { imu: q.imu as string } : {}), ...(isKind(q.range, 'hcsr04') ? { range: q.range as string } : {}),
            x: finite(q.x, 0, 10), z: finite(q.z, 0, 10), heading: finite(q.heading, 0, 7),
        };
    }
    if (isRecord(w.wind)) out.wind = { x: finite(w.wind.x, 0, 15), z: finite(w.wind.z, 0, 15), gust: Math.max(0, finite(w.wind.gust, 0, 15)) };
    if (robot && !(isKind(robot.left, 'motor') && isKind(robot.right, 'motor'))) return null;
    const sensors = (Array.isArray(robot?.sensors) ? robot.sensors : []).filter(isRecord).filter(m => isKind(m.part, 'tcrt5000'))
        .map(m => ({ part: m.part as string, x: finite(m.x, 0, 0.5), z: finite(m.z, 0, 0.5) })).slice(0, 16);
    const points = (Array.isArray(track.points) ? track.points : []).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n)))
        .map(([x, z]) => [finite(x, 0, 10), finite(z, 0, 10)] as [number, number]).slice(0, 2000);
    if (robot) out.robot = { left: robot.left as string, right: robot.right as string, sensors, x: finite(robot.x, 0, 10), z: finite(robot.z, 0, 10), heading: finite(robot.heading, 0, 7) };
    out.track = { width: Math.max(0.005, Math.min(0.1, finite(track.width, 0.019))), points, closed: track.closed === true };
    if (typeof w.best === 'number' && Number.isFinite(w.best) && w.best > 0) out.best = w.best;
    if (!out.robot && !out.arm && !out.conveyor && !out.quad) return null;
    return out;
}

function num(v: unknown): number { return typeof v === 'number' && Number.isFinite(v) ? Math.max(-1000, Math.min(1000, v)) : 0; }

/** The nets: groups of pins joined by wires, each a sorted list of "part.pin". */
export function nets(project: Project): string[][] {
    const parent = new Map<string, string>();
    const key = (r: PinRef) => `${r.part}.${r.pin}`;
    const find = (k: string): string => { const p = parent.get(k) ?? k; if (p === k) return k; const root = find(p); parent.set(k, root); return root; };
    const union = (a: string, b: string) => parent.set(find(a), find(b));
    for (const part of project.parts) for (const pin of CATALOG[part.kind].pins) parent.set(`${part.id}.${pin.id}`, `${part.id}.${pin.id}`);
    for (const w of project.wires) union(key(w.a), key(w.b));
    const groups = new Map<string, string[]>();
    for (const k of parent.keys()) { const root = find(k); if (!groups.has(root)) groups.set(root, []); groups.get(root)!.push(k); }
    return [...groups.values()].map(g => g.sort()).filter(g => g.length > 1).sort((a, b) => a[0].localeCompare(b[0]));
}

// ---- this device's projects ----

export interface Saved { id: string; project: Project; updated: number }

export function loadProjects(storage: Pick<Storage, 'getItem'> | null = globalStorage()): Saved[] {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) return [];
        return list.filter(isRecord).filter(s => typeof s.id === 'string').map(s => ({ id: s.id as string, project: parseProject(s.project), updated: typeof s.updated === 'number' ? s.updated : 0 }));
    } catch { return []; }
}

export function saveProjects(list: Saved[], storage: Pick<Storage, 'setItem'> | null = globalStorage()) {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

function globalStorage(): Storage | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The world without a part that's leaving the bench: a machine that needed it goes; sensors are unmounted. Undefined
 *  when no machine is left. */
export function dropFromWorld(world: WorldSpec | undefined, id: string): WorldSpec | undefined {
    if (!world) return world;
    const next: WorldSpec = structuredClone(world);
    if (next.robot && (next.robot.left === id || next.robot.right === id)) delete next.robot;
    if (next.robot) next.robot.sensors = next.robot.sensors.filter(m => m.part !== id);
    if (next.arm && [next.arm.base, next.arm.shoulder, next.arm.elbow, next.arm.wrist, next.arm.gripper].includes(id)) delete next.arm;
    if (next.conveyor?.motor === id) delete next.conveyor;
    if (next.spotters) next.spotters = next.spotters.filter(m => m.part !== id);
    if (next.quad && [next.quad.frontLeft, next.quad.frontRight, next.quad.backLeft, next.quad.backRight].includes(id)) delete next.quad;
    if (next.quad?.imu === id) delete next.quad.imu;
    if (next.quad?.range === id) delete next.quad.range;
    return next.robot || next.arm || next.conveyor || next.quad ? next : undefined;
}

