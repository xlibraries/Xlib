// The bench's machines in the physics world (native/world, built to dist/world/headless.wasm). Every PHYSICS_TICKS bench
// steps the world steps once, coupled to the circuit:
// - a robot: the wheel motors' torques in, the wheels' speeds back as the motors' shaft speeds (back-EMF and current
//   stay physical); its line sensors read the track under them;
// - an arm: each joint's servo hands over the angle its pulse asks for; the joint's actual angle (after gravity, load
//   and the servo's torque limit) comes back as the servo's angle;
// - a conveyor: its motor turns the drive roller, so the motor's speed is the belt's (cubes on it load it a little);
// - cubes appear at the belt's near end; fixed line sensors see cubes below them; the bin counts what lands in it.
import type { Bench } from './bench';
import type { WorldSpec } from './project';
import { reflectance, LINE_REFLECTANCE, FLOOR_REFLECTANCE } from './track';
import { LapTracker, type LapState } from './laps';

/** The headless module's exports (Emscripten) */
export interface WorldModule {
    _bl_reset(): void;
    _bl_robot(params: number): number;
    _bl_torque(left: number, right: number): void;
    _bl_step(dt: number, substeps: number): void;
    _bl_state(out: number): void;
    _bl_point(x: number, z: number, out: number): void;
    _bl_arm(params: number): number;
    _bl_arm_target(base: number, shoulder: number, elbow: number, wrist: number, grip: number): void;
    _bl_arm_state(out: number): void;
    _bl_conveyor(x: number, z: number, heading: number, length: number, width: number, height: number): number;
    _bl_belt(speed: number): void;
    _bl_cube(x: number, y: number, z: number, size: number, mass: number, r: number, g: number, b: number): number;
    _bl_cube_pos(i: number, out: number): void;
    _bl_bin(x: number, z: number, size: number, depth: number): void;
    _bl_sees_cube(x: number, height: number, z: number, range: number): number;
    _bl_body_count(): number;
    _bl_shapes(out: number): void;
    _bl_poses(out: number): void;
    _malloc(bytes: number): number;
    _free(ptr: number): void;
    HEAPF32: Float32Array;
}

/** A small two-wheeled robot: chassis, TT-motor wheels (65 mm), a ball caster. Metres and kilograms. */
export const ROBOT = { length: 0.16, width: 0.10, height: 0.03, mass: 0.4, wheelRadius: 0.0325, wheelWidth: 0.026, wheelMass: 0.03, track: 0.14, axleX: 0.03, casterX: -0.06, casterRadius: 0.012 };
/** A desktop arm: upper arm and forearm lengths (m) */
export const ARM = { upper: 0.12, fore: 0.12 };
/** The conveyor's cross-section and drive roller; the cubes it carries */
export const CONVEYOR = { width: 0.07, height: 0.05, roller: 0.015 };
export const CUBE = { size: 0.025, mass: 0.015 };
/** The gripper's force limit (N), whatever its servo (a little linkage turns torque into squeeze) */
const GRIP_FORCE = 4;
/** Bench steps per physics step: 2 × 1/4800 s, comfortably inside the wheels' and joints' time constants */
export const PHYSICS_TICKS = 2;

/** How a servo's angle (0–180°) maps onto its joint: radians from neutral, per joint. Neutral is 90°. */
export const ARM_JOINT_SIGN = { base: 1, shoulder: -1, elbow: -1, wrist: 1 } as const;
export const servoToJoint = (degrees: number, sign: number) => (degrees - 90) * Math.PI / 180 * sign;
export const jointToServo = (radians: number, sign: number) => 90 + radians * sign * 180 / Math.PI;

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

/** The pick-and-place score */
export interface PickState {
    /** Cubes the belt has brought */
    spawned: number;
    /** Cubes resting in the bin */
    delivered: number;
    /** Cubes on the floor, outside the bin */
    dropped: number;
    /** Seconds from the first cube to the last delivered one, once every cube has been dealt with */
    finished: number | null;
}

/** Everything a view draws: each body's look (7 floats: shape, size a b c, colour r g b) and pose (7 floats) */
export interface Bodies { shapes: number[]; poses: number[] }

export interface WorldState {
    robot?: RobotPose;
    pick?: PickState;
    bodies: Bodies;
}

export class MachineWorld {
    private readonly scratch: number;
    private readonly robotState = new Float32Array(26);
    private ticks = 0;
    private sumLeft = 0;
    private sumRight = 0;
    private readonly left?: Bench['motors'][number];
    private readonly right?: Bench['motors'][number];
    private readonly servos: Bench['servos'][number][] = [];
    private readonly belt?: Bench['motors'][number];
    readonly laps?: LapTracker;
    private cubesSpawned = 0;
    private lastSpawn = -Infinity;
    private firstCube: number | null = null;
    private finished: number | null = null;
    private shapes: number[] = [];

    constructor(private readonly m: WorldModule, private readonly bench: Bench, readonly spec: WorldSpec) {
        const motor = (id: string) => {
            const found = bench.motors.find(x => x.part === id);
            if (!found) throw new Error(`the motor ${id} isn't on the bench`);
            found.attached = true;
            return found;
        };
        const servo = (id: string) => {
            const found = bench.servos.find(x => x.part === id);
            if (!found) throw new Error(`the servo ${id} isn't on the bench`);
            found.attached = true;
            return found;
        };
        // every part first (a missing one is the project's mistake, reported before the world is touched)
        if (spec.robot) { this.left = motor(spec.robot.left); this.right = motor(spec.robot.right); }
        if (spec.arm) this.servos = [spec.arm.base, spec.arm.shoulder, spec.arm.elbow, spec.arm.wrist, spec.arm.gripper].map(servo);
        if (spec.conveyor) this.belt = motor(spec.conveyor.motor);
        this.scratch = m._malloc(4 * 32);
        m._bl_reset();
        if (spec.robot) {
            const r = spec.robot;
            this.laps = new LapTracker(spec.track);
            this.write([ROBOT.length, ROBOT.width, ROBOT.height, ROBOT.mass, ROBOT.wheelRadius, ROBOT.wheelWidth, ROBOT.wheelMass, ROBOT.track, ROBOT.axleX, ROBOT.casterX, ROBOT.casterRadius, r.x, r.z, r.heading]);
            if (!m._bl_robot(this.scratch)) throw new Error('the world refused the robot’s dimensions');
        }
        if (spec.arm) {
            const a = spec.arm;
            this.write([a.x, a.z, a.heading, ARM.upper, ARM.fore, ...this.servos.slice(0, 4).map(s => s.torque), GRIP_FORCE]);
            if (!m._bl_arm(this.scratch)) throw new Error('the world refused the arm');
        }
        if (spec.conveyor) {
            const c = spec.conveyor;
            if (!m._bl_conveyor(c.x, c.z, c.heading, c.length, CONVEYOR.width, CONVEYOR.height)) throw new Error('the world refused the conveyor');
        }
        if (spec.bin) m._bl_bin(spec.bin.x, spec.bin.z, spec.bin.size, 0.04);
        this.applyServos();
        this.settle();
        this.read();
        this.sense();
        bench.afterTick = (dt) => this.tick(dt);
    }

    private write(values: number[]) { this.m.HEAPF32.set(values, this.scratch >> 2); }
    private floats(count: number) { const i = this.scratch >> 2; return Array.from(this.m.HEAPF32.subarray(i, i + count)); }

    private read() {
        if (this.spec.robot) {
            this.m._bl_state(this.scratch);
            this.robotState.set(this.m.HEAPF32.subarray(this.scratch >> 2, (this.scratch >> 2) + 26));
        }
        if (this.spec.arm) {
            this.m._bl_arm_state(this.scratch);
            const [base, shoulder, elbow, wrist, grip] = this.floats(5);
            const signs = [ARM_JOINT_SIGN.base, ARM_JOINT_SIGN.shoulder, ARM_JOINT_SIGN.elbow, ARM_JOINT_SIGN.wrist];
            [base, shoulder, elbow, wrist].forEach((rad, i) => { this.servos[i].angle = jointToServo(rad, signs[i]); });
            this.servos[4].angle = Math.max(0, Math.min(180, grip * 180));
        }
    }

    /** Lets everything settle onto the floor (and the arm reach its servos' angles) before the bench starts. */
    private settle() { for (let i = 0; i < 240; i++) this.m._bl_step(1 / 480, 1); }

    /** Where each joint's servo is heading this step: towards its pulse's angle at no more than its rated speed (a servo
     *  slews; told to jump, it still takes ~0.1 s per 60°, and a blocked joint can't store up a violent snap). */
    private commanded: number[] = [];

    private applyServos(step = 0) {
        if (!this.spec.arm) return;
        if (!this.commanded.length) this.commanded = this.servos.map(s => s.target);
        this.servos.forEach((s, i) => {
            const max = step > 0 ? s.speed * step : Infinity;
            this.commanded[i] += Math.max(-max, Math.min(max, s.target - this.commanded[i]));
        });
        const [b, s, e, w, g] = this.commanded;
        this.m._bl_arm_target(servoToJoint(b, ARM_JOINT_SIGN.base), servoToJoint(s, ARM_JOINT_SIGN.shoulder), servoToJoint(e, ARM_JOINT_SIGN.elbow), servoToJoint(w, ARM_JOINT_SIGN.wrist), g / 180);
    }

    private tick(dt: number) {
        if (this.left && this.right) { this.sumLeft += this.left.torque; this.sumRight += this.right.torque; }
        if (++this.ticks % PHYSICS_TICKS) return;
        const step = dt * PHYSICS_TICKS;
        if (this.left && this.right) {
            this.m._bl_torque(this.sumLeft / PHYSICS_TICKS, this.sumRight / PHYSICS_TICKS);
            this.sumLeft = this.sumRight = 0;
        }
        this.applyServos(step);
        if (this.belt) this.m._bl_belt(this.belt.omega * CONVEYOR.roller);
        this.spawn();
        this.m._bl_step(step, 1);
        this.read();
        if (this.left && this.right) {
            this.left.omega = this.robotState[24];
            this.right.omega = this.robotState[25];
        }
        if (this.belt) {
            // the belt's motor turns freely but for the roller's friction and what rides on it
            const rate = this.belt.torque / (this.belt.model.inertia + 2e-5);
            this.belt.omega += rate * step;
        }
        this.sense();
        this.laps?.update(this.robotState[0], this.robotState[2], this.bench.time);
        this.score();
    }

    /** A new cube at the belt's near end every `spawn` seconds while the belt runs, when the spot is clear. */
    private spawn() {
        const c = this.spec.conveyor;
        if (!c || this.cubesSpawned >= c.cubes || this.bench.time - this.lastSpawn < c.spawn) return;
        if (Math.abs(this.belt?.omega ?? 0) < 1) return;
        const back = c.length / 2 - CUBE.size * 1.2;
        const x = c.x - Math.cos(c.heading) * back, z = c.z + Math.sin(c.heading) * back;
        if (this.m._bl_sees_cube(x, CONVEYOR.height + 0.06, z, 0.07)) return;
        const hue = [[0.9, 0.25, 0.2], [0.2, 0.7, 0.3], [0.95, 0.75, 0.15], [0.3, 0.5, 0.95]][this.cubesSpawned % 4];
        this.m._bl_cube(x, CONVEYOR.height + CUBE.size / 2 + 0.002, z, CUBE.size, CUBE.mass, hue[0], hue[1], hue[2]);
        this.cubesSpawned++;
        this.lastSpawn = this.bench.time;
        this.firstCube ??= this.bench.time;
    }

    /** Robot sensors read the track; fixed sensors see cubes below them. */
    private sense() {
        for (const s of this.spec.robot?.sensors ?? []) {
            const [x, z] = this.point(s.x, s.z);
            this.bench.setProp(s.part, 'reflect', reflectance(this.spec.track, x, z));
        }
        for (const s of this.spec.spotters ?? []) {
            const sees = this.m._bl_sees_cube(s.x, s.height, s.z, s.height + 0.01) === 1;
            this.bench.setProp(s.part, 'reflect', sees ? FLOOR_REFLECTANCE : LINE_REFLECTANCE);   // a light cube on a dark belt
        }
    }

    private cubePositions(): [number, number, number][] {
        return Array.from({ length: this.cubesSpawned }, (_, i) => { this.m._bl_cube_pos(i, this.scratch); return this.floats(3) as [number, number, number]; });
    }

    private score() {
        const c = this.spec.conveyor, p = this.pick();
        if (!c || !p || this.finished !== null || this.firstCube === null) return;
        if (p.spawned >= c.cubes && p.delivered + p.dropped >= c.cubes && p.delivered > 0) this.finished = this.bench.time - this.firstCube;
    }

    /** The pick-and-place score so far */
    pick(): PickState | undefined {
        const c = this.spec.conveyor, bin = this.spec.bin;
        if (!c || !bin) return undefined;
        const cubes = this.cubePositions();
        // inside the walls, and either down in the bin or let go of (a cube still in a closed gripper over the bin
        // isn't delivered yet; a pile in the bin counts)
        const open = !this.spec.arm || this.servos[4].target < 90;
        const inBin = (p: [number, number, number]) => Math.abs(p[0] - bin.x) < bin.size / 2 && Math.abs(p[2] - bin.z) < bin.size / 2 && (p[1] < 0.04 + CUBE.size / 2 || (open && p[1] < 0.04 + CUBE.size * 3));
        return { spawned: this.cubesSpawned, delivered: cubes.filter(inBin).length, dropped: cubes.filter(p => !inBin(p) && p[1] < CUBE.size).length, finished: this.finished };
    }

    /** Where a robot-frame point (x forward, z right) is over the floor */
    point(x: number, z: number): [number, number] {
        this.m._bl_point(x, z, this.scratch);
        const h = this.m.HEAPF32, i = this.scratch >> 2;
        return [h[i], h[i + 1]];
    }

    /** Every body's look and pose, for the views */
    bodies(): Bodies {
        const n = this.m._bl_body_count();
        const ptr = this.m._malloc(Math.max(4, n * 7 * 4));
        try {
            if (this.shapes.length !== n * 7) { this.m._bl_shapes(ptr); this.shapes = Array.from(this.m.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + n * 7)); }
            this.m._bl_poses(ptr);
            return { shapes: this.shapes, poses: Array.from(this.m.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + n * 7)) };
        } finally { this.m._free(ptr); }
    }

    /** The robot's poses for drawing */
    pose(): RobotPose {
        const s = Array.from(this.robotState);
        return { chassis: s.slice(0, 7), left: s.slice(7, 14), right: s.slice(14, 21), caster: s.slice(21, 24), sensors: (this.spec.robot?.sensors ?? []).map(m => this.point(m.x, m.z)), laps: { ...(this.laps?.state ?? { laps: 0, current: null, last: null, best: null, finished: null, offTrack: false, lost: false }) } };
    }

    /** Everything a snapshot carries */
    state(): WorldState {
        return { robot: this.spec.robot ? this.pose() : undefined, pick: this.pick(), bodies: this.bodies() };
    }

    /** Heading, radians (0 = facing +x), from the chassis's rotation */
    heading(): number { return headingOf(Array.from(this.robotState.subarray(3, 7))); }

    dispose() {
        this.bench.afterTick = undefined;
        this.m._free(this.scratch);
    }
}

/** The robot's world (the same class: a world with a robot in it) */
export { MachineWorld as RobotWorld };

/** A rotation's yaw about +y (the robot's heading; 0 faces +x), from a quaternion [x, y, z, w] */
export function headingOf([x, y, z, w]: number[]): number {
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}
