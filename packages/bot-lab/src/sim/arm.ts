// The desktop arm's geometry (native/world's bl_arm) and its inverse kinematics: which servo angles put the gripper,
// pointing straight down, at a point. The pick-and-place template's sketch uses angles worked out here.
import { ARM, ARM_JOINT_SIGN, jointToServo } from './world';
import type { ArmSpec } from './project';

/** The shoulder's height above the floor, and how far below the wrist the fingers grip (their middle), metres */
export const SHOULDER_HEIGHT = 0.07;
export const GRIP_BELOW_WRIST = 0.065;

/** The fingers are 4 cm tall: to grip a cube resting on a surface, their middle goes this far above that surface */
export const GRIP_ABOVE_SURFACE = 0.022;

export interface ServoAngles { base: number; shoulder: number; elbow: number; wrist: number }

/**
 * Servo angles (degrees, 0–180) that put the gripper's grip point at (x, y, z), pointing down, elbow up; null when the
 * point is out of reach (or a servo would need to go past its travel).
 */
export function reach(arm: Pick<ArmSpec, 'x' | 'z' | 'heading'>, x: number, y: number, z: number): ServoAngles | null {
    const dx = x - arm.x, dz = z - arm.z;
    // the base turns the arm's plane towards the point (yaw is counter-clockwise from above; 0 faces the heading)
    const base = Math.atan2(-dz, dx) - arm.heading;
    const d = Math.hypot(dx, dz);
    // the wrist sits above the grip point; solve the two links from the shoulder to it
    const wx = d, wy = y + GRIP_BELOW_WRIST - SHOULDER_HEIGHT;
    const l1 = ARM.upper, l2 = ARM.fore, r = Math.hypot(wx, wy);
    if (r > l1 + l2 - 1e-4 || r < Math.abs(l1 - l2) + 1e-4) return null;
    const between = Math.acos((l1 * l1 + r * r - l2 * l2) / (2 * l1 * r));
    const a1 = Math.atan2(wy, wx) + between;                       // the upper arm's angle from horizontal (elbow up)
    const e = Math.atan2(wy - l1 * Math.sin(a1), wx - l1 * Math.cos(a1));   // the forearm's
    // joints from neutral (upper arm up, forearm forward, gripper down)
    const q1 = a1 - Math.PI / 2, q2 = e - q1, q3 = -e;
    const angles = {
        base: jointToServo(wrap(base), ARM_JOINT_SIGN.base),
        shoulder: jointToServo(q1, ARM_JOINT_SIGN.shoulder),
        elbow: jointToServo(q2, ARM_JOINT_SIGN.elbow),
        wrist: jointToServo(q3, ARM_JOINT_SIGN.wrist),
    };
    return Object.values(angles).every(a => a >= 0 && a <= 180) ? angles : null;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
