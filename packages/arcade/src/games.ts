// The Arcade's games. Each is built for both backends into dist/<id>/{webgpu,webgl2}.{js,wasm}
// (scripts/build-native.mjs).

export interface GameInfo {
    id: string;
    title: string;
    description: string;
    controls: string;
    /** CSS background for its card */
    art: string;
}

export const GAMES: GameInfo[] = [
    {
        id: 'breakout',
        title: 'Neon Breakout',
        description: 'Glowing bricks, particles and synth sound effects across four levels. Catch power-ups for a wide paddle or extra balls.',
        controls: 'Mouse, touch or ←/→ to move · Space or click to launch',
        art: 'linear-gradient(135deg, #ff3d7f, #ff8a00 45%, #00b8a9)',
    },
    {
        id: 'hello',
        title: 'Hello Cube',
        description: 'A spinning, glowing cube: the smallest thing that proves the C++ → WebAssembly pipeline on your GPU.',
        controls: 'Space: reverse the spin',
        art: 'linear-gradient(135deg, #ff5a5f, #8b5cf6 55%, #0a9bff)',
    },
];
