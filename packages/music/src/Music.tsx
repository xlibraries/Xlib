// Playback: YouTube's embeddable player (privacy-enhanced nocookie host).
// Track lists + search: Invidious, an open-source YouTube front-end (no API key, no signup).
// One YouTube iframe floats over the layout and snaps to the visible slot (the mini player in the bar, or
// the big Now Playing view); moving it in the DOM would reload it.
import { useCallback, useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react';
import type { AppProps } from '@xlibraries/app-sdk';
import { Invidious } from './invidious';
import { findLyrics, type Lyrics } from './lyrics';
import { NowPlaying } from './NowPlaying';
import { PlayerBar } from './PlayerBar';
import { isFresh, loadSnapshot, readCache, writeCache, type Playlist } from './playlists';
import { Sidebar } from './Sidebar';
import { COLORS, STYLES } from './theme';
import { TrackList, type View } from './TrackList';
import { currentLyricIndex, toTrack, type Track } from './tracks';
import { loadYouTubeApi, videoTitles, type YTPlayer } from './youtube';

export interface MusicConfig {
    playlists: Playlist[];
    /** Snapshot built by `xlib-music-snapshot` (see the README). */
    snapshotUrl?: string;
    /** Invidious instances to try first. */
    instances?: string[];
}

interface State {
    view: View;
    tracks: Track[];
    loadingList: boolean;
    listError: string | null;
    queue: Track[];
    index: number;
    /** Playing a playlist straight from YouTube (track list unavailable). */
    direct: boolean;
    nowPlaying: Track | null;
    playing: boolean;
    time: number;
    duration: number;
    volume: number;
    search: string;
    showNowPlaying: boolean;
    lyrics: Lyrics | null;
    lyricsLoading: boolean;
}

type InvidiousVideo = { videoId: string; title: string; author?: string; lengthSeconds?: number; type?: string; liveNow?: boolean };

// Class-style state: merges partial updates and keeps a ref that's always current, for callbacks that
// outlive a render (player events, network responses)
function useMergedState<T>(initial: () => T) {
    const [state, setState] = useState(initial);
    const ref = useRef(state);
    const set = useCallback((patch: Partial<T> | ((s: T) => Partial<T>)) => {
        ref.current = { ...ref.current, ...(typeof patch === 'function' ? patch(ref.current) : patch) };
        setState(ref.current);
    }, []);
    return [state, set, ref] as const;
}

function MusicApp({ config }: { config: Required<MusicConfig> }) {
    const { playlists } = config;
    const [state, set, live] = useMergedState<State>(() => ({
        view: playlists[0], tracks: [], loadingList: true, listError: null, queue: [], index: -1, direct: false,
        nowPlaying: null, playing: false, time: 0, duration: 0, volume: 80, search: '', showNowPlaying: false,
        lyrics: null, lyricsLoading: false,
    }));

    const invidious = useRef(new Invidious({ instances: config.instances })).current;
    const player = useRef<YTPlayer | null>(null);
    const ready = useRef(false);
    const errorCount = useRef(0);
    const unmounted = useRef(false);
    const activeLine = useRef(-1);
    const root = useRef<HTMLDivElement>(null);
    const playerHost = useRef<HTMLDivElement>(null);
    const miniSlot = useRef<HTMLDivElement>(null);
    const bigSlot = useRef<HTMLDivElement>(null);
    const lyricsBox = useRef<HTMLDivElement>(null);

    // ---------- Track lists ----------

    const loadPlaylist = (playlist: Playlist) => {
        try { localStorage.setItem('music-playlist', playlist.id); } catch { /* storage blocked */ }
        const cached = readCache(playlist.id);
        set({ view: playlist, showNowPlaying: false, tracks: cached ? cached.tracks : [], loadingList: !cached, listError: null });

        const show = (tracks: Track[] | undefined | null) => {
            if (live.current.view === playlist && tracks?.length) set({ tracks, loadingList: false, listError: null });
        };
        if (!cached) {
            loadSnapshot(config.snapshotUrl).then((snapshot) => {
                if (!live.current.tracks.length) show(snapshot?.playlists[playlist.id]);
            });
        }
        if (isFresh(cached)) return;

        invidious.get<{ videos?: InvidiousVideo[] }>(`/playlists/${playlist.id}`)
            .then((data) => {
                const tracks = (data.videos || []).map(toTrack);
                if (!tracks.length) throw new Error('empty playlist');
                writeCache(playlist.id, tracks);
                show(tracks);
            })
            .catch(() => {
                if (live.current.view !== playlist || live.current.tracks.length) return;
                loadSnapshot(config.snapshotUrl).then(() => {
                    if (live.current.view !== playlist || live.current.tracks.length) return;
                    set({ loadingList: false, listError: "Couldn't load the track list. Press ▶ to play it straight from YouTube; the songs will appear once it starts." });
                });
            });
    };

    const showList = (view: View, request: Promise<Track[]>) => {
        set({ view, loadingList: true, listError: null, tracks: [] });
        request
            .then((tracks) => {
                if (live.current.view !== view) return;
                set({ tracks, loadingList: false, listError: tracks.length ? null : 'No songs found.' });
            })
            .catch(() => {
                if (live.current.view !== view) return;
                set({ loadingList: false, listError: 'Search is unavailable right now (the free Invidious servers are down). Try again later.' });
            });
    };

    const searchSongs = (e: FormEvent) => {
        e.preventDefault();
        const query = live.current.search.trim();
        if (!query) return;
        set({ showNowPlaying: false });
        const request = invidious.get<InvidiousVideo[]>(`/search?type=video&q=${encodeURIComponent(query)}`)
            .then((data) => data.filter((v) => v.type === 'video' && !v.liveNow).map(toTrack));
        showList({ id: 'search', title: `"${query}"`, search: true }, request);
    };

    // ---------- Playback ----------

    const playTrack = (index: number, queue = live.current.queue) => {
        if (!ready.current || !queue[index]) return;
        errorCount.current = 0;
        player.current!.loadVideoById(queue[index].id);
        set({ queue, index, direct: false, nowPlaying: queue[index], time: 0, duration: queue[index].duration });
    };

    // Fallback when Invidious is down: let YouTube handle the playlist queue itself
    const playDirect = (playlist: View) => {
        if (!ready.current) return;
        player.current!.loadPlaylist({ list: playlist.id, listType: 'playlist', index: 0 });
        set({ queue: [], index: -1, direct: true, nowPlaying: null });
    };

    const playView = () => {
        const s = live.current;
        if (s.tracks.length) playTrack(0, s.tracks);
        else if (!s.view.search) playDirect(s.view);
    };

    const togglePlay = () => {
        const s = live.current;
        if (!ready.current) return;
        if (!s.nowPlaying && !s.direct) return playView();
        if (s.playing) player.current!.pauseVideo(); else player.current!.playVideo();
    };

    const playFromList = (index: number) => {
        const s = live.current;
        if (s.nowPlaying && s.nowPlaying.id === s.tracks[index].id) return togglePlay();
        playTrack(index, s.tracks);
    };

    const next = () => {
        const s = live.current;
        if (!ready.current) return;
        if (s.direct) return player.current!.nextVideo();
        if (s.queue.length) playTrack((s.index + 1) % s.queue.length);
    };

    const prev = () => {
        const s = live.current;
        if (!ready.current) return;
        if (player.current!.getCurrentTime() > 3) return player.current!.seekTo(0, true);
        if (s.direct) return player.current!.previousVideo();
        if (s.queue.length) playTrack((s.index - 1 + s.queue.length) % s.queue.length);
    };

    const seekTo = (time: number) => {
        if (!ready.current || !live.current.nowPlaying) return;
        player.current!.seekTo(time, true);
        set({ time });
    };

    const setVolume = (volume: number) => {
        if (ready.current) player.current!.setVolume(volume);
        set({ volume });
    };

    // Invidious was down: take the song IDs from YouTube's own player, then fill in titles via oEmbed
    const adoptYouTubePlaylist = async (ids: string[], index: number, data: { video_id: string; title: string; author: string }, duration: number) => {
        const tracks: Track[] = ids.map((id) => id === data.video_id
            ? { id, title: data.title, author: data.author, duration }
            : { id, title: '', author: '', duration: 0 });
        set({ tracks, queue: tracks, index, direct: false, listError: null, playing: true, duration, nowPlaying: tracks[index] });
        const view = live.current.view;
        for await (const found of videoTitles(tracks.filter((t) => !t.title).map((t) => t.id))) {
            if (unmounted.current || live.current.view !== view) return;
            const fill = <T extends Track | null>(t: T): T => (t && found[t.id] ? { ...t, ...found[t.id] } : t);
            set((s) => ({ tracks: s.tracks.map(fill), queue: s.queue.map(fill), nowPlaying: fill(s.nowPlaying) }));
        }
    };

    const onStateChange = (e: { data: number }) => {
        const YT = window.YT!;
        const p = player.current!;
        const s = live.current;
        if (e.data === YT.PlayerState.PLAYING) {
            errorCount.current = 0;
            const data = p.getVideoData();
            const duration = p.getDuration();
            if (s.direct) {
                const ids = p.getPlaylist() || [];
                if (ids.length) return void adoptYouTubePlaylist(ids, p.getPlaylistIndex(), data, duration);
            }
            const update: Partial<State> = { playing: true, duration };
            const current = s.nowPlaying;
            if (current && current.id === data.video_id && !current.title) {
                update.nowPlaying = { ...current, title: data.title, author: data.author, duration };
            } else if (!current || current.id !== data.video_id) {
                // YouTube moved on by itself (e.g. playlist autoplay): keep our queue in sync
                const index = s.queue.findIndex((t) => t.id === data.video_id);
                if (index !== -1) update.index = index;
                update.nowPlaying = index !== -1 ? s.queue[index] : { id: data.video_id, title: data.title, author: data.author, duration };
            }
            set(update);
        } else if (e.data === YT.PlayerState.PAUSED) {
            set({ playing: false });
        } else if (e.data === YT.PlayerState.ENDED) {
            set({ playing: false });
            if (!s.direct) next();
        }
    };

    // Some videos can't be embedded (error 101/150): skip them, but stop if many fail in a row
    const onError = () => {
        errorCount.current += 1;
        if (errorCount.current > 5) {
            errorCount.current = 0;
            return set({ playing: false });
        }
        next();
    };

    // The player is created once; its events always reach the latest handlers
    const handlers = useRef({ onStateChange, onError });
    handlers.current = { onStateChange, onError };

    const positionPlayer = useCallback(() => {
        const slot = (live.current.showNowPlaying && bigSlot.current) || miniSlot.current;
        if (!slot || !root.current || !playerHost.current) return;
        const r = slot.getBoundingClientRect(), p = root.current.getBoundingClientRect();
        Object.assign(playerHost.current.style, { left: r.left - p.left + 'px', top: r.top - p.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    }, [live]);

    // ---------- Lifecycle ----------

    useEffect(() => {
        let saved: string | null = null;
        try { saved = localStorage.getItem('music-playlist'); } catch { /* storage blocked */ }
        loadPlaylist(playlists.find((p) => p.id === saved) || playlists[0]);

        loadYouTubeApi().then((YT) => {
            if (unmounted.current || !playerHost.current) return;
            // YT replaces its target node, so give it one React doesn't manage
            const target = document.createElement('div');
            playerHost.current.appendChild(target);
            player.current = new YT.Player(target, {
                host: 'https://www.youtube-nocookie.com',
                width: '100%',
                height: '100%',
                playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
                events: {
                    onReady: () => { ready.current = true; player.current!.setVolume(live.current.volume); },
                    onStateChange: (e: { data: number }) => handlers.current.onStateChange(e),
                    onError: () => handlers.current.onError(),
                },
            });
        });
        const ticker = setInterval(() => {
            if (ready.current && live.current.playing) set({ time: player.current!.getCurrentTime() });
        }, 250);
        const observer = typeof ResizeObserver !== 'undefined' && root.current ? new ResizeObserver(positionPlayer) : null;
        if (observer && root.current) observer.observe(root.current);
        positionPlayer();
        return () => {
            unmounted.current = true;
            clearInterval(ticker);
            observer?.disconnect();
            player.current?.destroy();
        };
        // mount only
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // New song: look up its lyrics
    const nowPlayingId = state.nowPlaying?.id;
    useEffect(() => {
        const track = live.current.nowPlaying;
        if (!track) return;
        set({ lyrics: null, lyricsLoading: true });
        findLyrics(track).then((lyrics) => {
            if (live.current.nowPlaying?.id !== track.id) return;
            activeLine.current = -1;
            set({ lyricsLoading: false, lyrics });
        });
    }, [nowPlayingId, live, set]);

    const currentLine = state.lyrics?.synced ? currentLyricIndex(state.lyrics.synced, state.time) : -1;

    // After every render: snap the player to its slot and keep the current lyric line centred
    useEffect(() => {
        positionPlayer();
        const box = lyricsBox.current;
        if (!state.showNowPlaying || !box || currentLine === activeLine.current) return;
        activeLine.current = currentLine;
        const el = box.querySelector<HTMLElement>(`[data-line="${currentLine}"]`);
        if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
    });

    const toggleNowPlaying = () => {
        activeLine.current = -1;
        set((s) => ({ showNowPlaying: !s.showNowPlaying }));
    };

    return (
        <div ref={root} className="relative h-full w-full flex flex-col text-white select-none" style={{ backgroundColor: COLORS.base }}>
            <style>{STYLES}</style>
            <div className="flex flex-grow overflow-hidden">
                {state.showNowPlaying
                    ? <NowPlaying nowPlaying={state.nowPlaying} lyrics={state.lyrics} lyricsLoading={state.lyricsLoading} activeLine={currentLine} bigSlot={bigSlot} lyricsBox={lyricsBox} onSeek={seekTo} />
                    : <>
                        <Sidebar playlists={playlists} activeId={state.view.id} onSelect={loadPlaylist} />
                        <TrackList
                            view={state.view} tracks={state.tracks} loadingList={state.loadingList} listError={state.listError}
                            direct={state.direct} nowPlaying={state.nowPlaying} playing={state.playing} search={state.search}
                            onSearchChange={(search) => set({ search })} onSearch={searchSongs} onPlayView={playView} onPlayIndex={playFromList}
                        />
                    </>}
            </div>
            <PlayerBar
                nowPlaying={state.nowPlaying} playing={state.playing} time={state.time} duration={state.duration} volume={state.volume}
                showNowPlaying={state.showNowPlaying} miniSlot={miniSlot}
                onPrev={prev} onToggle={togglePlay} onNext={next} onSeek={seekTo} onVolume={setVolume} onToggleNowPlaying={toggleNowPlaying}
            />
            <div ref={playerHost} className="absolute rounded overflow-hidden bg-black transition-all duration-300 ease-out" />
        </div>
    );
}

/** Builds the music app for a site's playlists. */
export function createMusic(options: MusicConfig): ComponentType<AppProps> {
    const config: Required<MusicConfig> = { snapshotUrl: './music/snapshot.json', instances: ['https://invidious.f5.si'], ...options };
    return function Music() {
        return <MusicApp config={config} />;
    };
}
