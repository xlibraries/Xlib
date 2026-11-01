// The Arcade's games. Each is built for both backends into dist/<id>/{webgpu,webgl2}.{js,wasm}
// (scripts/build-native.mjs).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Backend } from '@xlibraries/engine-react';

/** Props for a game's optional side panel (e.g. the Shader Playground's editor). */
export interface PanelProps {
    /** The running WebAssembly module (game-specific exports). */
    instance: object;
    backend: Backend;
    /** Where dist/ is served, for a game's own files (e.g. "/arcade"). */
    baseUrl: string;
    /** The site's leaderboard endpoint (GET ?game&board, POST { game, board, name, score }), if it has one. */
    leaderboardUrl?: string;
    /** The desktop's master volume, 0..1 (a panel's own music follows it). */
    volume?: number;
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
const TurboTrailsPanel = lazy(() => import('./turbo-trails/Panel').then(m => ({ default: m.TurboTrailsPanel })));

export const GAMES: GameInfo[] = [
    {
        id: 'jyotirath',
        title: 'JyotiRath',
        description: 'Chapter I: Mohenjo-Daro. Drive the golden chariot between the ruined districts, then cross each one turn by turn. How you get through decides the road ahead, and brings the city back to life.',
        controls: 'Drive: W A S D · In the city: W A S D or click a node, 1 2 tools · Space or click: next line · R start over · N new journey · scroll to zoom · gamepad: stick, RT/LT, d-pad, A, X/Y',
        art: 'linear-gradient(160deg, #f7d9a8 0%, #f2b84b 40%, #b8774d 41%, #6e4a3a 100%)',
    },
    {
        id: 'turbo-trails',
        title: 'Turbo Trails',
        description: 'Drive the history of transport: ten eras from an Indus Valley chariot to a Tokyo hover car. Hills, fuel, flips, coins and a shop.',
        controls: '→/D gas · ←/A brake · ↑/W ↓/S lean (wheelies, flips) · Space Turbo · R restart · phone: halves, both thumbs = Turbo, tilt to lean · gamepad: triggers, stick, A, Start',
        art: 'linear-gradient(180deg, #ffc46b 0%, #ff8a3d 45%, #b4652e 46%, #6b3a1c 100%)',
        Panel: TurboTrailsPanel,
    },
    {
        id: 'breakout',
        title: 'Neon Breakout',
        description: 'Glowing bricks, particles and synth sound effects across four levels. Catch power-ups for a wide paddle or extra balls.',
        controls: 'Mouse, touch, ←/→ or gamepad to move · Space, click or A to launch',
        art: 'linear-gradient(135deg, #ff3d7f, #ff8a00 45%, #00b8a9)',
    },
    {
        id: 'showcase',
        title: '3D Showcase',
        description: 'A procedurally generated low-poly island: a car loops its road through day and night, headlights on after dusk.',
        controls: 'Drag or sticks to orbit · scroll or triggers to zoom · C/Y follow car · N/X skip ahead',
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
        controls: 'Space or A: reverse the spin',
        art: 'linear-gradient(135deg, #ff5a5f, #8b5cf6 55%, #0a9bff)',
    },
];
