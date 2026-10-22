import { beforeAll, describe, expect, it } from 'vitest';
import { Bench } from '../src/sim/bench';
import { addPart, connect, emptyProject, parseProject, type Project } from '../src/sim/project';
import { ROBOT, RobotWorld, type WorldModule } from '../src/sim/world';
import { template } from '../src/templates';
import { LapTracker } from '../src/sim/laps';
import { distanceToLine, reflectance, ovalTrack, type Track } from '../src/sim/track';

let createWorld: () => Promise<WorldModule>;
beforeAll(async () => { createWorld = (await import('../dist/world/headless.js' as string)).default; });

const straight: Track = { width: 0.019, points: [[-1, 0], [3, 0]], closed: false };

/** Two motors, each across its own battery (volts sets the speed and direction), on a robot over a straight line. */
function robotProject(leftVolts: number, rightVolts: number): Project {
    const p = emptyProject();
    const motors = [leftVolts, rightVolts].map((v, i) => {
        const b = addPart(p, 'battery', 0, i * 10), m = addPart(p, 'motor', 10, i * 10);
        b.props.volts = Math.max(1.5, Math.abs(v)); b.props.ohms = 0.05;
        connect(p, { part: b.id, pin: '+' }, { part: m.id, pin: v >= 0 ? '+' : '-' });
        connect(p, { part: b.id, pin: '-' }, { part: m.id, pin: v >= 0 ? '-' : '+' });
        return m.id;
    });
    const s1 = addPart(p, 'tcrt5000', 20, 0), s2 = addPart(p, 'tcrt5000', 20, 10), supply = addPart(p, 'battery', 30, 0);
    supply.props.volts = 5;
    for (const s of [s1, s2]) {
        connect(p, { part: supply.id, pin: '+' }, { part: s.id, pin: 'VCC' });
        connect(p, { part: supply.id, pin: '-' }, { part: s.id, pin: 'GND' });
    }
    p.world = { robot: { left: motors[0], right: motors[1], sensors: [{ part: s1.id, x: 0.08, z: 0 }, { part: s2.id, x: 0.08, z: 0.05 }], x: 0, z: 0, heading: 0 }, track: straight };
    return p;
}

async function run(project: Project, seconds: number) {
    const bench = new Bench(project);
    const world = new RobotWorld(await createWorld(), bench, project.world!);
    bench.run(seconds);
    return { bench, world };
}

describe('the track', () => {
    it('reads dark on the line and light off it, with a soft edge', () => {
        expect(distanceToLine(straight, 1, 0.1)).toBeCloseTo(0.1, 6);
        expect(reflectance(straight, 1, 0)).toBeCloseTo(0.05, 6);
        expect(reflectance(straight, 1, 0.05)).toBeCloseTo(0.9, 6);
        const edge = reflectance(straight, 1, 0.0095);
        expect(edge).toBeGreaterThan(0.05);
        expect(edge).toBeLessThan(0.9);
        const oval = ovalTrack();
        expect(oval.closed).toBe(true);
        expect(reflectance(oval, 0, 0.35)).toBeCloseTo(0.05, 6);   // on the top straight
        expect(reflectance(oval, 0, 0)).toBeCloseTo(0.9, 6);       // the middle is floor
    });

    it('a stored world keeps only parts of the right kinds and a sane track', () => {
        const p = robotProject(6, 6);
        const parsed = parseProject(JSON.parse(JSON.stringify(p)));
        expect(parsed.world).toEqual(p.world);
        const bad = JSON.parse(JSON.stringify(p));
        bad.world.robot.left = 'battery1';
        expect(parseProject(bad).world).toBeUndefined();
    });
});

describe('the robot in the world', () => {
    it('both motors forward: it drives straight at about wheel speed × radius, and the motors run near their rated speed', async () => {
        const { bench, world } = await run(robotProject(6, 6), 1.2);
        const [x, , z] = world.pose().chassis;
        const rpm = bench.state('motor1').rpm!;
        expect(rpm).toBeGreaterThan(170);
        expect(rpm).toBeLessThan(205);
        const v = rpm * 2 * Math.PI / 60 * ROBOT.wheelRadius;
        expect(x).toBeGreaterThan(v * 0.8);                   // most of 1.2 s at speed, after a short spin-up
        expect(Math.abs(z)).toBeLessThan(0.02);
        expect(Math.abs(world.heading())).toBeLessThan(0.05);
        const chassisHeight = world.pose().chassis[1];
        expect(chassisHeight).toBeGreaterThan(0.02);          // on its wheels, not through the floor
        expect(chassisHeight).toBeLessThan(0.08);
    }, 60_000);

    it('one motor reversed: it spins on the spot', async () => {
        const { world } = await run(robotProject(6, -6), 1.0);
        const [x, z] = world.point(ROBOT.axleX, 0);           // it turns about the middle of its axle
        expect(Math.hypot(x - ROBOT.axleX, z)).toBeLessThan(0.02);
        expect(Math.abs(world.heading())).toBeGreaterThan(1);
    }, 60_000);

    it('its line sensors read the track under them as it drives', async () => {
        const { bench } = await run(robotProject(3, 3), 0.5);
        expect(bench.state('tcrt50001').led).toBe(false);     // over the line: dark, its LED off
        expect(bench.state('tcrt50002').led).toBe(true);      // 5 cm to the side: floor
    }, 60_000);

    it('a robot needs its wheel motors on the bench', async () => {
        const p = robotProject(6, 6);
        p.world!.robot.left = 'motor9';
        expect(() => new RobotWorld({} as WorldModule, new Bench(p), p.world!)).toThrow(/motor9 isn't on the bench/);
    });
});

describe('the Robot template', () => {
    it('the Uno drives it forwards and turns it, through the TB6612, in the world', async () => {
        const project = template('robot_square')!.build();
        const bench = new Bench(project);
        const world = new RobotWorld(await createWorld(), bench, project.world!);
        const start = world.point(0, 0);
        bench.run(1.1);                                               // the sketch turns at 1.2 s
        const afterForward = world.point(0, 0);
        expect(afterForward[0] - start[0]).toBeGreaterThan(0.3);     // forwards along +x
        expect(Math.abs(world.heading())).toBeLessThan(0.05);
        bench.run(0.5);
        expect(Math.abs(world.heading())).toBeGreaterThan(0.6);       // then it turned
        expect(bench.board!.serial.slice(0, 2)).toEqual(['forward', 'turn']);
    }, 60_000);
});

describe('the line follower', () => {
    it('steers round the oval on its two sensors and completes a timed lap without leaving the track', async () => {
        const project = template('line_follower')!.build();
        const bench = new Bench(project);
        const world = new RobotWorld(await createWorld(), bench, project.world!);
        const laps = new LapTracker(project.world!.track);
        let wasOff = false;
        for (let t = 0; t < 14 && laps.state.laps < 1; t += 0.05) {
            bench.run(0.05);
            const [x, , z] = world.pose().chassis;
            laps.update(x, z, bench.time);
            wasOff ||= laps.state.offTrack;
        }
        expect(laps.state.laps).toBe(1);
        expect(laps.state.best).toBeGreaterThan(6);
        expect(laps.state.best).toBeLessThan(13);
        expect(wasOff).toBe(false);
        expect(world.pose().left[1]).toBeGreaterThan(0.0315);   // on its wheels' rims (within a millimetre), not sunk into the floor
    }, 120_000);
});

