// The Arcade's games. Each is built for both backends into dist/<id>/{webgpu,webgl2}.{js,wasm}
// (scripts/build-native.mjs).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Backend } from './backend';

/** Props for a game's optional side panel (e.g. the Shader Playground's editor). */
export interface PanelProps {
    /** The running WebAssembly module (game-specific exports). */
    instance: object;
    backend: Backend;
}

export interface GameInfo {
    id: string;
    title: string;
    description: string;
    controls: string;
    /** CSS background for its card */
    art: string;
    /** Shown beside the canvas while the game runs */
    Panel?: ComponentType<PanelProps> | LazyExoticComponent<ComponentType<PanelProps>>;
}

const PlaygroundEditor = lazy(() => import('./playground/Editor').then(m => ({ default: m.PlaygroundEditor })));

export const GAMES: GameInfo[] = [
    {
        id: 'breakout',
        title: 'Neon Breakout',
        description: 'Glowing bricks, particles and synth sound effects across four levels. Catch power-ups for a wide paddle or extra balls.',
        controls: 'Mouse, touch or ←/→ to move · Space or click to launch',
        art: 'linear-gradient(135deg, #ff3d7f, #ff8a00 45%, #00b8a9)',
    },
    {
        id: 'showcase',
        title: '3D Showcase',
        description: 'A procedurally generated low-poly island: a car loops its road through day and night, headlights on after dusk.',
        controls: 'Drag to orbit · scroll to zoom · C follow car · N skip ahead',
        art: 'linear-gradient(180deg, #55c3ff 0%, #ffb36b 55%, #2f8f5b 56%, #1d5c3b 100%)',
    },
    {
        id: 'playground',
        title: 'Shader Playground',
        description: 'Full-window fragment shaders: start from plasma, a neon tunnel or raymarched spheres, then edit live.',
        controls: 'Edit on the right · GLSL on WebGL2, WGSL on WebGPU',
        art: 'conic-gradient(from 200deg, #0a9bff, #8b5cf6, #ff3d7f, #ffc93c, #0a9bff)',
        Panel: PlaygroundEditor,
    },
    {
        id: 'hello',
        title: 'Hello Cube',
        description: 'A spinning, glowing cube: the smallest thing that proves the C++ → WebAssembly pipeline on your GPU.',
        controls: 'Space: reverse the spin',
        art: 'linear-gradient(135deg, #ff5a5f, #8b5cf6 55%, #0a9bff)',
    },
];
