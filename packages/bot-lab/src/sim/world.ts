// The bench's robot in the physics world (native/world, built to dist/world/headless.wasm). Every PHYSICS_TICKS bench
// steps, the motors that drive wheels hand their torque to the world, the world steps, and the wheels' speeds come
// back as the motors' shaft speeds (so back-EMF, current and torque stay consistent with the circuit). Each line
// sensor reads the track under where it's mounted.
import type { Bench } from './bench';
import type { WorldSpec } from './project';
import { reflectance } from './track';
import { LapTracker, type LapState } from './laps';

/** The headless module's exports (Emscripten) */
export interface WorldModule {
    _bl_reset(): void;
    _bl_robot(params: number): number;
    _bl_torque(left: number, right: number): void;
    _bl_step(dt: number, substeps: number): void;
    _bl_state(out: number): void;
    _bl_point(x: number, z: number, out: number): void;
    _malloc(bytes: number): number;
    _free(ptr: number): void;
    HEAPF32: Float32Array;
}

/** A small two-wheeled robot: chassis, TT-motor wheels (65 mm), a ball caster. Metres and kilograms. */
export const ROBOT = { length: 0.16, width: 0.10, height: 0.03, mass: 0.4, wheelRadius: 0.0325, wheelWidth: 0.026, wheelMass: 0.03, track: 0.14, axleX: 0.03, casterX: -0.06, casterRadius: 0.012 };
/** Bench steps per physics step: 2 × 1/4800 s, comfortably inside the wheels' time constants */
export const PHYSICS_TICKS = 2;

/** Poses for drawing: positions [x, y, z], rotations [x, y, z, w] */
export interface RobotPose {
    chassis: number[];
    left: number[];
    right: number[];
    caster: number[];
    /** Line sensors' spots on the floor, [x, z] */
    sensors: [number, number][];
    laps: LapState;
}

export class RobotWorld {
    private readonly scratch: number;
    private readonly state = new Float32Array(26);
    private ticks = 0;
    private sumLeft = 0;
    private sumRight = 0;
    private readonly left;
    private readonly right;
    readonly laps: LapTracker;

    constructor(private readonly m: WorldModule, private readonly bench: Bench, readonly spec: WorldSpec) {
        const motor = (id: string) => {
            const found = bench.motors.find(x => x.part === id);
            if (!found) throw new Error(`the robot's wheel motor ${id} isn't on the bench`);
            found.attached = true;
            return found;
        };
        this.laps = new LapTracker(spec.track);
        this.left = motor(spec.robot.left);
        this.right = motor(spec.robot.right);
        this.scratch = m._malloc(4 * 32);
        m._bl_reset();
        const r = spec.robot;
        this.write([ROBOT.length, ROBOT.width, ROBOT.height, ROBOT.mass, ROBOT.wheelRadius, ROBOT.wheelWidth, ROBOT.wheelMass, ROBOT.track, ROBOT.axleX, ROBOT.casterX, ROBOT.casterRadius, r.x, r.z, r.heading]);
        if (!m._bl_robot(this.scratch)) throw new Error('the world refused the robot’s dimensions');
        this.settle();
        this.read();
        this.sense();
        bench.afterTick = (dt) => this.tick(dt);
    }

    private write(values: number[]) { this.m.HEAPF32.set(values, this.scratch >> 2); }

    private read() {
        this.m._bl_state(this.scratch);
        this.state.set(this.m.HEAPF32.subarray(this.scratch >> 2, (this.scratch >> 2) + 26));
    }

    /** Lets the robot settle onto its wheels and caster before the bench starts. */
    private settle() { for (let i = 0; i < 120; i++) this.m._bl_step(1 / 240, 1); }

    private tick(dt: number) {
        this.sumLeft += this.left.torque;
        this.sumRight += this.right.torque;
        if (++this.ticks % PHYSICS_TICKS) return;
        this.m._bl_torque(this.sumLeft / PHYSICS_TICKS, this.sumRight / PHYSICS_TICKS);
        this.sumLeft = this.sumRight = 0;
        this.m._bl_step(dt * PHYSICS_TICKS, 1);
        this.read();
        this.left.omega = this.state[24];
        this.right.omega = this.state[25];
        this.sense();
        this.laps.update(this.state[0], this.state[2], this.bench.time);
    }

    /** Where a robot-frame point (x forward, z right) is over the floor */
    point(x: number, z: number): [number, number] {
        this.m._bl_point(x, z, this.scratch);
        const h = this.m.HEAPF32, i = this.scratch >> 2;
        return [h[i], h[i + 1]];
    }

    private sense() {
        for (const s of this.spec.robot.sensors) {
            const [x, z] = this.point(s.x, s.z);
            this.bench.setProp(s.part, 'reflect', reflectance(this.spec.track, x, z));
        }
    }

    /** The robot's poses for drawing */
    pose(): RobotPose {
        const s = Array.from(this.state);
        return { chassis: s.slice(0, 7), left: s.slice(7, 14), right: s.slice(14, 21), caster: s.slice(21, 24), sensors: this.spec.robot.sensors.map(m => this.point(m.x, m.z)), laps: { ...this.laps.state } };
    }

    /** Heading, radians (0 = facing +x), from the chassis's rotation */
    heading(): number { return headingOf(Array.from(this.state.subarray(3, 7))); }

    dispose() {
        this.bench.afterTick = undefined;
        this.m._free(this.scratch);
    }
}

/** A rotation's yaw about +y (the robot's heading; 0 faces +x), from a quaternion [x, y, z, w] */
export function headingOf([x, y, z, w]: number[]): number {
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

