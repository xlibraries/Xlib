import { beforeAll, describe, expect, it } from 'vitest';
import { Bench } from '../src/sim/bench';
import { addPart, connect, emptyProject, type Project } from '../src/sim/project';
import { MachineWorld, CUBE, type WorldModule } from '../src/sim/world';
import { GRIP_ABOVE_SURFACE, reach } from '../src/sim/arm';

let createWorld: () => Promise<WorldModule>;
beforeAll(async () => { createWorld = (await import('../dist/world/headless.js' as string)).default; });

/** An arm of five servos (no board: the tests set the servos' targets), at the origin facing +x */
function armProject(model = 'SG90'): Project {
    const p = emptyProject();
    const ids = ['base', 'shoulder', 'elbow', 'wrist', 'gripper'].map(() => { const s = addPart(p, 'servo', 0, 0); s.props.model = model; return s.id; });
    p.world = { arm: { base: ids[0], shoulder: ids[1], elbow: ids[2], wrist: ids[3], gripper: ids[4], x: 0, z: 0, heading: 0 }, track: { width: 0.019, points: [], closed: false } };
    return p;
}

async function arm(project = armProject()) {
    const bench = new Bench(project);
    const world = new MachineWorld(await createWorld(), bench, project.world!);
    const set = (angles: Partial<Record<'base' | 'shoulder' | 'elbow' | 'wrist' | 'gripper', number>>) => {
        const order = ['base', 'shoulder', 'elbow', 'wrist', 'gripper'] as const;
        order.forEach((k, i) => { if (angles[k] !== undefined) bench.servos[i].target = angles[k]!; });
    };
    const angle = (i: number) => bench.servos[i].angle;
    return { bench, world, set, angle };
}

describe('the arm', () => {
    it('holds its neutral pose against gravity, and turns its joints to the angles the servos ask for', async () => {
        const { bench, set, angle } = await arm(armProject('MG996R'));
        bench.run(0.5);
        for (let i = 0; i < 4; i++) expect(Math.abs(angle(i) - 90), `joint ${i}`).toBeLessThan(4);
        set({ base: 130, shoulder: 110, elbow: 70, wrist: 100 });
        bench.run(1);
        expect(Math.abs(angle(0) - 130)).toBeLessThan(3);
        expect(Math.abs(angle(1) - 110)).toBeLessThan(3);
        expect(Math.abs(angle(2) - 70)).toBeLessThan(3);
        expect(Math.abs(angle(3) - 100)).toBeLessThan(3);
    }, 60_000);

    it('inverse kinematics: the angles it works out put the gripper over a point on the floor', () => {
        const a = reach({ x: 0, z: 0, heading: 0 }, 0.15, 0.0125, 0)!;
        expect(a.base).toBeCloseTo(90, 5);
        expect(reach({ x: 0, z: 0, heading: 0 }, 0.5, 0, 0)).toBeNull();     // too far
        const left = reach({ x: 0, z: 0, heading: 0 }, 0, 0.0125, -0.15)!;  // to its left (−z)
        expect(left.base).toBeCloseTo(180, 5);
    });

    it('picks up a cube: down over it, close the gripper, lift, and the cube comes too', async () => {
        const project = armProject();
        const { bench, world, set } = await arm(project);
        const m = (world as unknown as { m: WorldModule }).m;
        const cubeAt = [0.15, CUBE.size / 2, 0] as const;
        m._bl_cube(cubeAt[0], cubeAt[1] + 0.001, cubeAt[2], CUBE.size, CUBE.mass, 1, 0, 0);
        // the fingers' middle a little above the floor (they're taller than the cube), then 6 cm higher to approach
        const above = reach(project.world!.arm!, cubeAt[0], GRIP_ABOVE_SURFACE + 0.06, cubeAt[2])!, at = reach(project.world!.arm!, cubeAt[0], GRIP_ABOVE_SURFACE, cubeAt[2])!;
        set({ ...above, gripper: 0 });
        bench.run(1);
        set({ ...at, gripper: 0 });
        bench.run(1);
        set({ gripper: 180 });
        bench.run(0.6);
        set({ ...above });
        bench.run(1);
        const cube = (m._bl_cube_pos(0, (world as unknown as { scratch: number }).scratch), Array.from(m.HEAPF32.subarray((world as unknown as { scratch: number }).scratch >> 2, ((world as unknown as { scratch: number }).scratch >> 2) + 3)));
        expect(cube[1]).toBeGreaterThan(0.04);    // lifted off the floor
    }, 60_000);
});

describe('the conveyor', () => {
    /** A conveyor along +x driven by a motor on a battery, a fixed line sensor over its far end */
    function conveyorProject(volts: number): Project {
        const p = emptyProject();
        const b = addPart(p, 'battery', 0, 0), m = addPart(p, 'motor', 0, 0), s = addPart(p, 'tcrt5000', 0, 0), supply = addPart(p, 'battery', 0, 0);
        b.props.volts = volts; b.props.ohms = 0.05; supply.props.volts = 5;
        connect(p, { part: b.id, pin: '+' }, { part: m.id, pin: '+' });
        connect(p, { part: b.id, pin: '-' }, { part: m.id, pin: '-' });
        connect(p, { part: supply.id, pin: '+' }, { part: s.id, pin: 'VCC' });
        connect(p, { part: supply.id, pin: '-' }, { part: s.id, pin: 'GND' });
        p.world = {
            conveyor: { motor: m.id, x: 0, z: 0, heading: 0, length: 0.4, spawn: 3, cubes: 2 },
            spotters: [{ part: s.id, x: 0.18, z: 0, height: 0.1 }],
            track: { width: 0.019, points: [], closed: false },
        };
        return p;
    }

    it('its motor runs the belt; cubes appear, ride to the end stop and wait there, where the fixed sensor sees them', async () => {
        const project = conveyorProject(3);
        const bench = new Bench(project);
        const world = new MachineWorld(await createWorld(), bench, project.world!);
        bench.run(0.3);
        expect(world.pick()).toBeUndefined();                   // no bin: no score
        expect(bench.state('tcrt50001').led).toBe(false);       // dark belt under it
        bench.run(2.7);
        const bodies = world.bodies();
        const cubes = bodies.shapes.length / 7 - 2;             // the conveyor, its end stop, then cubes
        expect(cubes).toBe(1);
        const cube = bodies.poses.slice(2 * 7, 2 * 7 + 3);
        expect(cube[0]).toBeGreaterThan(0.17);                  // at the far end
        expect(cube[1]).toBeGreaterThan(0.05);                  // on the belt
        expect(bench.state('tcrt50001').led).toBe(true);        // the sensor sees it (light cube)
        expect(bench.state('motor1').rpm).toBeGreaterThan(80);  // the motor turns the belt
    }, 60_000);

    it('a stopped belt brings no cubes', async () => {
        const project = conveyorProject(3);
        project.wires = [];                                     // the motor isn't powered
        const bench = new Bench(project);
        const world = new MachineWorld(await createWorld(), bench, project.world!);
        bench.run(4);
        expect(world.bodies().shapes.length / 7).toBe(2);
    }, 60_000);
});

describe('the pick-and-place template', () => {
    it('the Uno waits for a cube at the end of the belt, stops it, and the arm drops cubes in the bin', async () => {
        const project = (await import('../src/templates')).template('pick_and_place')!.build();
        const bench = new Bench(project);
        const world = new MachineWorld(await createWorld(), bench, project.world!);
        let held = false;
        for (let t = 0; t < 17 && world.pick()!.delivered < 2; t += 0.5) {
            bench.run(0.5);
            held ||= world.pick()!.delivered === 0 && bench.servos[4].target > 90;   // the gripper closed on the first one
        }
        bench.run(2);                                     // it reports each cube once it's home again
        const pick = world.pick()!;
        expect(held).toBe(true);
        expect(pick.delivered).toBe(2);
        expect(pick.dropped).toBe(0);
        expect(bench.board!.serial).toContain('cube 2 in the bin');
    }, 180_000);
});
