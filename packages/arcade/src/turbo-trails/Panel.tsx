// Turbo Trails' side panel: the era list with unlocks and best distances, the story card, the shop, and the
// era's music (your own recordings for the Chariots era), played by the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '../games';

interface GameInstance {
    _tt_state_json(): number;
    _tt_set_era(index: number): number;
    _tt_buy(era: number, kind: number): number;
    _free(ptr: number): void;
    UTF8ToString(ptr: number): string;
}

interface State {
    version: number;
    era: number;
    unlocked: number;
    coins: number;
    run: { state: number; distance: number; coins: number; flips: number };
    best: number[];
    upgrades: number[][];
    unlockDistance: number;
}

export const ERAS = [
    { name: 'Chariots', place: 'Indus Valley, India', year: '2000 BCE', story: 'The game begins where roads did. You are JyotiRath, a chariot of the Indus Valley, racing between planned cities with covered drains and great baths. Light, quick, and easy to tip: the first wheels taught the world to balance.', music: 'chariots-bg.mp3' },
    { name: 'Steam', place: 'Shropshire, England', year: '1769', story: 'To England, where coal and iron turned water into motion. Your steam carriage is heavy and slow to wake, but once the boiler is hot nothing on the road can push harder.' },
    { name: 'Carriages', place: 'Loire Valley, France', year: '1830', story: 'France, by carriage, along post roads lined with vineyards and chateaux. Tall and elegant, a carriage tips if you take a hill too fast.' },
    { name: 'Motorwagen', place: 'Baden, Germany', year: '1885', story: 'Germany, 1885. A single cylinder coughs to life under a bench seat: the first car. Thin wheels and little power, but Bertha Benz will prove it can cross the country.' },
    { name: 'Motorcycles', place: 'Great Plains, USA', year: '1903', story: 'America, 1903. Two wheels, a single cylinder and the open plains. Lean into the throttle, land on the back wheel, and the road is yours.' },
    { name: 'Grand Prix', place: 'Sarthe, France', year: '1911', story: 'Back to France for the birth of motorsport. Your racer is fast and low; bumps that a cart would shrug off will send you flying.' },
    { name: 'Off-road', place: 'Canyonlands, USA', year: '1935', story: 'The American West in a 4x4. Big tyres, both axles driven, and canyons that drop away under you.' },
    { name: 'Sports cars', place: 'Amalfi Coast, Italy', year: '1950', story: 'Italy, 1950, a roadster on the coast road. Quick, grippy, beautiful. The cliffs are close and the corners are closer.' },
    { name: 'Electric', place: 'California, USA', year: '1996', story: 'America, 1996. No engine noise, only the hum of a motor and full torque from a standstill. Your battery is your fuel.' },
    { name: 'Hover', place: 'Tokyo, Japan', year: '2025', story: 'Tokyo, 2025 and a little beyond. Your vehicle floats on a magnetic cushion, so the road hardly matters, until you leave it.' },
];

const UPGRADES = ['Engine', 'Suspension', 'Tyres', 'Chassis'];
const PRICES = [300, 400, 550, 750];

const MUSIC_KEY = 'arcade:turbo-trails:music';
const NAME_KEY = 'arcade:nickname';
const POSTED_KEY = (era: number) => `arcade:turbo-trails:posted:${era}`;
const ENDED = new Set([2, 3, 4]);   // RunState::OutOfFuel, Crashed, Finished

interface Entry { name: string; score: number }

const storage = {
    get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

export function TurboTrailsPanel({ instance, baseUrl, leaderboardUrl, volume = 1 }: PanelProps) {
    const game = instance as unknown as GameInstance;
    const [state, setState] = useState<State | null>(null);
    const [music, setMusic] = useState(() => { try { return localStorage.getItem(MUSIC_KEY) !== 'off'; } catch { return true; } });
    const audio = useRef<HTMLAudioElement | null>(null);
    const lastVersion = useRef(0);
    const [nickname, setNickname] = useState(() => storage.get(NAME_KEY) ?? '');
    const [board, setBoard] = useState<Entry[] | null>(null);
    const [boardNote, setBoardNote] = useState<string | null>(null);
    const posting = useRef(false);

    const read = useCallback(() => {
        const ptr = game._tt_state_json();
        const text = game.UTF8ToString(ptr);
        game._free(ptr);
        const next: State = JSON.parse(text);
        setState(prev => (prev && prev.version === next.version && prev.run.distance === next.run.distance && prev.run.coins === next.run.coins && prev.run.state === next.run.state) ? prev : next);
        lastVersion.current = next.version;
    }, [game]);

    useEffect(() => {
        read();
        const timer = setInterval(read, 500);
        return () => clearInterval(timer);
    }, [read]);

    // Music: an <audio> loop per era (only the Chariots era has a track so far), started on the first click; its
    // level follows the desktop's volume slider
    const volumeRef = useRef(volume);
    useEffect(() => { volumeRef.current = volume; if (audio.current) audio.current.volume = 0.5 * volume; }, [volume]);
    const era = state?.era ?? 0;
    const track = ERAS[era]?.music;
    useEffect(() => {
        audio.current?.pause();
        audio.current = null;
        if (!music || !track) return;
        const el = new Audio(`${baseUrl}/turbo-trails/${track}`);
        el.loop = true;
        el.volume = 0.5 * volumeRef.current;
        audio.current = el;
        const start = () => { el.play().catch(() => { }); };
        start();
        document.addEventListener('pointerdown', start, { once: true });
        return () => { document.removeEventListener('pointerdown', start); el.pause(); };
    }, [music, track, baseUrl]);

    // Leaderboard: read the era's board, and post a finished run's distance when it beats what this device posted
    const loadBoard = useCallback(async (eraIndex: number) => {
        if (!leaderboardUrl) return;
        try {
            const res = await fetch(`${leaderboardUrl}?game=turbo-trails&board=${eraIndex}`, { cache: 'no-store' });
            const data = await res.json();
            setBoard(res.ok ? data.entries : []);
        } catch {
            setBoard([]);
        }
    }, [leaderboardUrl]);

    useEffect(() => { loadBoard(era); }, [era, loadBoard]);

    useEffect(() => {
        if (!leaderboardUrl || !state || !ENDED.has(state.run.state) || posting.current) return;
        const distance = state.run.distance;
        const posted = Number(storage.get(POSTED_KEY(state.era)) || 0);
        if (distance <= posted || !nickname) return;
        posting.current = true;
        fetch(leaderboardUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: 'turbo-trails', board: state.era, name: nickname, score: distance }) })
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) { setBoardNote(data.error || "Couldn't post the score."); return; }
                storage.set(POSTED_KEY(state.era), String(distance));
                setBoard(data.entries);
                setBoardNote(data.rank ? `You're #${data.rank} with ${distance} m` : `${distance} m posted`);
            })
            .catch(() => setBoardNote("Couldn't reach the leaderboard."))
            .finally(() => { posting.current = false; });
    }, [state, nickname, leaderboardUrl]);

    const toggleMusic = () => {
        setMusic(m => { try { localStorage.setItem(MUSIC_KEY, m ? 'off' : 'on'); } catch { /* storage blocked */ } return !m; });
    };

    if (!state) return <div className="h-full" style={{ background: '#1a1322' }} />;
    const info = ERAS[state.era];
    const tiers = state.upgrades[state.era];

    return (
        <div className="h-full flex flex-col text-white text-xs overflow-y-auto" style={{ background: '#1a1322' }} data-coins={state.coins} data-era={state.era}>
            <div className="p-3 border-b border-white border-opacity-10">
                <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">{info.year} · {info.name}</div>
                    <button type="button" onClick={toggleMusic} aria-pressed={music} className="px-2 py-0.5 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20">{music ? '♪ on' : '♪ off'}</button>
                </div>
                <div className="text-gray-400">{info.place}</div>
                <p className="mt-2 leading-snug text-gray-200">{info.story}</p>
                <div className="mt-2 text-gray-400">Best <b className="text-white">{state.best[state.era]} m</b>{state.era + 1 < ERAS.length && state.unlocked <= state.era + 1 && <> · drive <b className="text-white">{state.unlockDistance} m</b> to unlock {ERAS[state.era + 1].name}</>}</div>
            </div>

            <div className="p-3 border-b border-white border-opacity-10">
                <div className="flex items-center justify-between mb-2">
                    <div className="uppercase tracking-wider text-gray-400">Shop</div>
                    <div className="text-yellow-300 font-bold" data-testid="coins">${state.coins}</div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    {UPGRADES.map((name, kind) => {
                        const tier = tiers[kind], price = tier >= 4 ? 0 : PRICES[tier];
                        const canBuy = price > 0 && state.coins >= price;
                        return (
                            <button key={name} type="button" disabled={!canBuy} onClick={() => { if (game._tt_buy(state.era, kind)) read(); }}
                                className="text-left rounded p-2 bg-white bg-opacity-5 hover:bg-opacity-10 disabled:opacity-50 disabled:hover:bg-opacity-5">
                                <div className="font-bold">{name}</div>
                                <div className="text-gray-400">{'●'.repeat(tier)}{'○'.repeat(4 - tier)} {price ? `$${price}` : 'max'}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {leaderboardUrl && (
                <div className="p-3 border-b border-white border-opacity-10" data-testid="leaderboard">
                    <div className="flex items-center justify-between mb-2">
                        <div className="uppercase tracking-wider text-gray-400">Leaderboard · {info.name}</div>
                        <input
                            value={nickname}
                            onChange={(e) => { const v = e.target.value.slice(0, 16); setNickname(v); storage.set(NAME_KEY, v); }}
                            placeholder="Nickname to post"
                            aria-label="Nickname"
                            className="w-32 px-2 py-0.5 rounded bg-black bg-opacity-40 border border-white border-opacity-20 outline-none focus:border-yellow-300"
                        />
                    </div>
                    {boardNote && <div role="status" className="text-yellow-300 mb-1">{boardNote}</div>}
                    {board === null ? <div className="text-gray-500">Loading…</div>
                        : board.length === 0 ? <div className="text-gray-500">No runs posted yet. {nickname ? 'Finish a run to post yours.' : 'Add a nickname to post yours.'}</div>
                        : board.slice(0, 10).map((e, i) => (
                            <div key={e.name} data-rank={i + 1} className={'flex justify-between py-0.5 ' + (e.name === nickname ? 'text-yellow-300 font-bold' : '')}>
                                <span><span className="inline-block w-5 text-gray-500">{i + 1}.</span>{e.name}</span>
                                <span>{e.score} m</span>
                            </div>
                        ))}
                </div>
            )}

            <div className="p-3">
                <div className="uppercase tracking-wider text-gray-400 mb-2">Eras</div>
                {ERAS.map((e, i) => {
                    const locked = i >= state.unlocked;
                    return (
                        <button key={e.name} type="button" disabled={locked} onClick={() => { if (game._tt_set_era(i)) read(); }}
                            className={'w-full flex items-center justify-between rounded px-2 py-1 mb-0.5 ' + (i === state.era ? 'bg-white bg-opacity-15' : 'hover:bg-white hover:bg-opacity-5') + (locked ? ' opacity-40' : '')}>
                            <span>{locked ? '🔒 ' : ''}{e.year} · {e.name}</span>
                            <span className="text-gray-400">{state.best[i] ? `${state.best[i]} m` : ''}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
