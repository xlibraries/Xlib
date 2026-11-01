/**
 * @file The browser adapter's page side: choosing the graphics backend and reading the gamepad. Its native side,
 * xl_web.cpp, implements xl.h (from @xlibraries/engine-core) and is linked into every module that uses this package.
 */
export { pickBackend, webgpuAvailable, webgl2Available, BACKEND_LABEL, type Backend, type BackendChoice } from './backend';
export { BUTTONS, deadzone, NO_PAD, readPad, samePad, type PadState } from './gamepad';
