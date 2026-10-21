// The Arcade app: a launcher of games, each opened in a GameView. The renderer can be left on Auto (WebGPU when
// available, else WebGL2) or forced; the choice is remembered on this device.
import { useState, type ComponentType } from 'react';
import type { AppProps } from '@xlibraries/app-sdk';
import { type BackendChoice } from './backend';
import { GAMES, type GameInfo } from './games';
import { GameView } from './GameView';

export interface ArcadeConfig {
    /** Where dist/ is served, e.g. "/arcade" */
    baseUrl: string;
    games?: GameInfo[];
    /** The site's leaderboard endpoint, if it has one */
    leaderboardUrl?: string;
}

const CHOICES: { id: BackendChoice; label: string }[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'webgpu', label: 'WebGPU' },
    { id: 'webgl2', label: 'WebGL2' },
];

function savedChoice(): BackendChoice {
    try {
        const v = localStorage.getItem('arcade-backend');
        return v === 'webgpu' || v === 'webgl2' ? v : 'auto';
    } catch {
        return 'auto';
    }
}

export function createArcade({ baseUrl, games = GAMES, leaderboardUrl }: ArcadeConfig): ComponentType<AppProps> {
    return function Arcade({ host }: AppProps) {
        const [playing, setPlaying] = useState<GameInfo | null>(null);
        const [choice, setChoice] = useState<BackendChoice>(savedChoice);

        const choose = (next: BackendChoice) => {
            setChoice(next);
            try { localStorage.setItem('arcade-backend', next); } catch { /* storage blocked */ }
        };

        if (playing) return <GameView game={playing} baseUrl={baseUrl} leaderboardUrl={leaderboardUrl} choice={choice} volume={host.volume} onBack={() => setPlaying(null)} />;

        return (
            <div className="h-full w-full overflow-y-auto p-4 text-white" style={{ background: 'radial-gradient(ellipse at top, #2b1f4f, #120d22 70%)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                        <div className="text-xl font-bold tracking-wide">Arcade</div>
                        <div className="text-xs text-gray-400">C++ and sokol, compiled to WebAssembly, drawn by your GPU</div>
                    </div>
                    <div className="flex rounded-full bg-white bg-opacity-10 p-0.5 text-xs" role="radiogroup" aria-label="Renderer">
                        {CHOICES.map(c => (
                            <button key={c.id} type="button" role="radio" aria-checked={choice === c.id} onClick={() => choose(c.id)}
                                className={'px-3 py-1 rounded-full ' + (choice === c.id ? 'bg-white text-black' : 'text-gray-300 hover:text-white')}>
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {games.map(game => (
                        <button key={game.id} type="button" onClick={() => setPlaying(game)} aria-label={`Play ${game.title}`}
                            className="text-left rounded-xl overflow-hidden bg-white bg-opacity-5 hover:bg-opacity-10 transform hover:-translate-y-0.5 transition">
                            <div className="h-24" style={{ background: game.art }} />
                            <div className="p-3">
                                <div className="font-bold">{game.title}</div>
                                <div className="text-xs text-gray-300 mt-1 leading-snug">{game.description}</div>
                                <div className="text-xs text-gray-500 mt-2">{game.controls}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    };
}
