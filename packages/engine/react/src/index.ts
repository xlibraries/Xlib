/**
 * @file EngineView: hosts a C++/sokol WebAssembly module (built by @xlibraries/toolchain) in a React component, on
 * WebGPU or WebGL2. The backend types come from @xlibraries/engine-web and are re-exported for EngineView's props.
 */
export { EngineView, applyVolume, screenPitch, tiltLean, type EngineViewProps, type EngineInstance } from './EngineView';
export type { Backend, BackendChoice } from '@xlibraries/engine-web';
