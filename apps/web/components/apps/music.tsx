// @ts-nocheck
import React, { Component } from 'react';
import PLAYLISTS from '../../data/music-playlists.json';
import { formatTime, toTrack, lyricQueries, pickLyrics, parseLrc, currentLyricIndex } from '../../lib/music';
import type { AppProps } from '@xlibraries/app-sdk';

// Playback: YouTube's embeddable player (privacy-enhanced nocookie host).
// Track lists + search: Invidious, an open-source YouTube front-end (no API key, no signup).

// Public Invidious instances come and go; more are discovered at runtime.
const DEFAULT_INSTANCES = ["https://invidious.f5.si"];
const REQUEST_TIMEOUT = 10000;

// Theme — matches the app icon
const ACCENT = "#F7752B";
const ACCENT_DEEP = "#9B1D5A";
const GRADIENT = `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`;
const COLORS = { base: "#1d1a21", panel: "#16131a", bar: "#110e14" };
const sliderFill = (value, max) => {
    const pct = max ? Math.min(100, (value / max) * 100) : 0;
    return { backgroundImage: `linear-gradient(to right, ${ACCENT} 0%, ${ACCENT_DEEP} ${pct}%, rgba(175, 175, 175, 0.3) ${pct}%)` };
}

// ---------- Playlist cache ----------
// Lists show instantly from (1) this browser's cache or (2) the snapshot shipped with the site
// (scripts/update-music-snapshot.mjs), then refresh from Invidious in the background.
const CACHE_TTL = 6 * 60 * 60 * 1000;

let snapshotPromise = null;
const loadSnapshot = () => {
    if (!snapshotPromise) {
        snapshotPromise = fetch("./music/snapshot.json")
            .then(res => res.ok ? res.json() : null)
            .catch(() => null);
    }
    return snapshotPromise;
}

const readCache = (id) => {
    try { return JSON.parse(localStorage.getItem("music-cache-" + id)); } catch (e) { return null; }
}

const writeCache = (id, tracks) => {
    try { localStorage.setItem("music-cache-" + id, JSON.stringify({ t: Date.now(), tracks })); } catch (e) { }
}


const thumb = (videoId) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
const hideBrokenImage = (e) => { e.target.style.visibility = "hidden"; };



let ytApiPromise = null;
const loadYouTubeApi = () => {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (!ytApiPromise) {
        ytApiPromise = new Promise(resolve => {
            const previous = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (previous) previous();
                resolve(window.YT);
            };
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            document.body.appendChild(script);
        });
    }
    return ytApiPromise;
}

export class Music extends Component<AppProps> {
    constructor() {
        super();
        this.player = null;
        this.ready = false;
        this.ticker = null;
        this.instances = [...DEFAULT_INSTANCES];
        this.discovered = false;
        this.errorCount = 0;
        this.state = {
            view: PLAYLISTS[0],
            tracks: [],
            loadingList: true,
            listError: null,
            queue: [],
            index: -1,
            direct: false, // playing a playlist straight from YouTube (track list unavailable)
            nowPlaying: null,
            playing: false,
            time: 0,
            duration: 0,
            volume: 80,
            search: "",
            showNowPlaying: false,
            lyrics: null,
            lyricsLoading: false,
        }
        this.activeLine = -1;
    }

    componentDidMount() {
        let saved = null;
        try { saved = localStorage.getItem("music-playlist"); } catch (e) { }
        this.loadPlaylist(PLAYLISTS.find(p => p.id === saved) || PLAYLISTS[0]);

        loadYouTubeApi().then(YT => {
            if (!this.playerHost) return;
            // YT replaces its target node, so give it one React doesn't manage
            const target = document.createElement("div");
            this.playerHost.appendChild(target);
            this.player = new YT.Player(target, {
                host: "https://www.youtube-nocookie.com",
                width: "100%",
                height: "100%",
                playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
                events: {
                    onReady: () => {
                        this.ready = true;
                        this.player.setVolume(this.state.volume);
                    },
                    onStateChange: this.handleStateChange,
                    onError: this.handleError,
                },
            });
        });
        this.ticker = setInterval(this.tick, 250);
        if (window.ResizeObserver && this.root) {
            this.resizeObserver = new ResizeObserver(this.positionPlayer);
            this.resizeObserver.observe(this.root);
        }
        this.positionPlayer();
    }

    componentDidUpdate(prevProps, prevState) {
        const now = this.state.nowPlaying, prev = prevState.nowPlaying;
        if (now && (!prev || prev.id !== now.id)) this.fetchLyrics(now);
        this.positionPlayer();
        this.scrollLyrics();
    }

    componentWillUnmount() {
        this.unmounted = true;
        clearInterval(this.ticker);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.player && this.player.destroy) this.player.destroy();
    }

    // ---------- Invidious ----------

    discoverInstances = () => {
        if (this.discovered) return Promise.resolve();
        this.discovered = true;
        return fetch("https://api.invidious.io/instances.json?sort_by=health")
            .then(res => res.json())
            .then(list => {
                list.forEach(([, info]) => {
                    if (info.type === "https" && info.api && info.cors && !this.instances.includes(info.uri)) {
                        this.instances.push(info.uri);
                    }
                });
            })
            .catch(() => { });
    }

    // Try each known instance until one answers; the working one moves to the front.
    invidious = (path, i = 0) => {
        if (i >= this.instances.length) {
            return this.discoverInstances().then(() => {
                if (i >= this.instances.length) throw new Error("No Invidious instance available");
                return this.invidious(path, i);
            });
        }
        const base = this.instances[i];
        const controller = window.AbortController ? new AbortController() : null;
        const timer = controller && setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        return fetch(base + "/api/v1" + path, controller ? { signal: controller.signal } : undefined)
            .finally(() => clearTimeout(timer))
            .then(res => {
                if (!res.ok) throw new Error(res.status);
                return res.json();
            })
            .then(data => {
                if (i > 0) this.instances = [base, ...this.instances.filter(x => x !== base)];
                return data;
            })
            .catch(() => this.invidious(path, i + 1));
    }

    loadPlaylist = (playlist) => {
        try { localStorage.setItem("music-playlist", playlist.id); } catch (e) { }
        const cached = readCache(playlist.id);
        this.setState({ view: playlist, showNowPlaying: false, tracks: cached ? cached.tracks : [], loadingList: !cached, listError: null });

        const show = (tracks) => {
            if (this.state.view === playlist && tracks && tracks.length) this.setState({ tracks, loadingList: false, listError: null });
        };
        if (!cached) {
            loadSnapshot().then(snapshot => {
                if (!this.state.tracks.length) show(snapshot && snapshot.playlists[playlist.id]);
            });
        }
        if (cached && Date.now() - cached.t < CACHE_TTL) return;

        this.invidious(`/playlists/${playlist.id}`)
            .then(data => {
                const tracks = (data.videos || []).map(toTrack);
                if (!tracks.length) throw new Error("empty playlist");
                writeCache(playlist.id, tracks);
                show(tracks);
            })
            .catch(() => {
                if (this.state.view !== playlist || this.state.tracks.length) return;
                loadSnapshot().then(() => {
                    if (this.state.view !== playlist || this.state.tracks.length) return;
                    this.setState({ loadingList: false, listError: "Couldn't load the track list. Press ▶ to play it straight from YouTube; the songs will appear once it starts." });
                });
            });
    }

    searchSongs = (e) => {
        e.preventDefault();
        const query = this.state.search.trim();
        if (!query) return;
        this.setState({ showNowPlaying: false });
        const request = this.invidious(`/search?type=video&q=${encodeURIComponent(query)}`)
            .then(data => data.filter(v => v.type === "video" && !v.liveNow).map(toTrack));
        this.showList({ id: "search", title: `"${query}"`, search: true }, request);
    }

    showList = (view, request) => {
        this.setState({ view, loadingList: true, listError: null, tracks: [] });
        request
            .then(tracks => {
                if (this.state.view !== view) return;
                this.setState({ tracks, loadingList: false, listError: tracks.length ? null : "No songs found." });
            })
            .catch(() => {
                if (this.state.view !== view) return;
                this.setState({ loadingList: false, listError: "Search is unavailable right now (the free Invidious servers are down). Try again later." });
            });
    }

    // ---------- Playback ----------

    playTrack = (index, queue = this.state.queue) => {
        if (!this.ready || !queue[index]) return;
        this.errorCount = 0;
        this.player.loadVideoById(queue[index].id);
        this.setState({ queue, index, direct: false, nowPlaying: queue[index], time: 0, duration: queue[index].duration });
    }

    // Fallback when Invidious is down: let YouTube handle the playlist queue itself.
    playDirect = (playlist) => {
        if (!this.ready) return;
        this.player.loadPlaylist({ list: playlist.id, listType: "playlist", index: 0 });
        this.setState({ queue: [], index: -1, direct: true, nowPlaying: null });
    }

    playFromList = (index) => {
        const current = this.state.nowPlaying;
        if (current && current.id === this.state.tracks[index].id) return this.togglePlay();
        this.playTrack(index, this.state.tracks);
    }

    playView = () => {
        if (this.state.tracks.length) this.playTrack(0, this.state.tracks);
        else if (!this.state.view.search) this.playDirect(this.state.view);
    }

    togglePlay = () => {
        if (!this.ready) return;
        if (!this.state.nowPlaying && !this.state.direct) return this.playView();
        this.state.playing ? this.player.pauseVideo() : this.player.playVideo();
    }

    next = () => {
        if (!this.ready) return;
        if (this.state.direct) return this.player.nextVideo();
        const { queue, index } = this.state;
        if (queue.length) this.playTrack((index + 1) % queue.length);
    }

    prev = () => {
        if (!this.ready) return;
        if (this.player.getCurrentTime() > 3) return this.player.seekTo(0, true);
        if (this.state.direct) return this.player.previousVideo();
        const { queue, index } = this.state;
        if (queue.length) this.playTrack((index - 1 + queue.length) % queue.length);
    }

    handleStateChange = (e) => {
        const YT = window.YT;
        if (e.data === YT.PlayerState.PLAYING) {
            this.errorCount = 0;
            const data = this.player.getVideoData();
            const duration = this.player.getDuration();
            if (this.state.direct) {
                const ids = this.player.getPlaylist() || [];
                if (ids.length) return this.adoptYouTubePlaylist(ids, this.player.getPlaylistIndex(), data, duration);
            }
            const update = { playing: true, duration };
            const current = this.state.nowPlaying;
            if (current && current.id === data.video_id && !current.title) {
                update.nowPlaying = { ...current, title: data.title, author: data.author, duration };
            } else if (!current || current.id !== data.video_id) {
                // YouTube moved on by itself (e.g. playlist autoplay) — keep our queue in sync
                const index = this.state.queue.findIndex(t => t.id === data.video_id);
                if (index !== -1) update.index = index;
                update.nowPlaying = index !== -1 ? this.state.queue[index] : { id: data.video_id, title: data.title, author: data.author, duration };
            }
            this.setState(update);
        } else if (e.data === YT.PlayerState.PAUSED) {
            this.setState({ playing: false });
        } else if (e.data === YT.PlayerState.ENDED) {
            this.setState({ playing: false });
            if (!this.state.direct) this.next();
        }
    }

    // Invidious was down: take the song IDs from YouTube's own player, then fill in titles via oEmbed.
    adoptYouTubePlaylist = (ids, index, data, duration) => {
        const tracks = ids.map(id => ({
            id,
            title: id === data.video_id ? data.title : "",
            author: id === data.video_id ? data.author : "",
            duration: id === data.video_id ? duration : 0,
        }));
        this.setState({ tracks, queue: tracks, index, direct: false, listError: null, playing: true, duration, nowPlaying: tracks[index] });
        this.fillTitles(tracks, this.state.view);
    }

    fillTitles = async (tracks, view) => {
        const ids = tracks.filter(t => !t.title).map(t => t.id);
        for (let i = 0; i < ids.length; i += 8) {
            const batch = await Promise.all(ids.slice(i, i + 8).map(id =>
                fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`)
                    .then(res => res.ok ? res.json() : null)
                    .catch(() => null)
                    .then(info => [id, info])
            ));
            if (this.unmounted || this.state.view !== view) return;
            const found = Object.fromEntries(batch.filter(([, info]) => info));
            const fill = t => t && found[t.id] ? { ...t, title: found[t.id].title, author: found[t.id].author_name } : t;
            this.setState({ tracks: this.state.tracks.map(fill), queue: this.state.queue.map(fill), nowPlaying: fill(this.state.nowPlaying) });
        }
    }

    // Some videos can't be embedded (error 101/150) — skip them, but stop if many fail in a row.
    handleError = () => {
        this.errorCount += 1;
        if (this.errorCount > 5) {
            this.errorCount = 0;
            return this.setState({ playing: false });
        }
        this.next();
    }

    tick = () => {
        if (this.ready && this.state.playing && this.player.getCurrentTime) {
            this.setState({ time: this.player.getCurrentTime() });
        }
    }

    seek = (e) => this.seekTo(parseFloat(e.target.value));

    seekTo = (time) => {
        if (!this.ready || !this.state.nowPlaying) return;
        this.player.seekTo(time, true);
        this.setState({ time });
    }

    fetchLyrics = (track) => {
        this.setState({ lyrics: null, lyricsLoading: true });
        const queries = lyricQueries(track.title);
        const attempt = (i) => {
            if (i >= queries.length) return Promise.resolve(null);
            return fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(queries[i])}`)
                .then(res => res.json())
                .then(results => pickLyrics(results, track.duration) || attempt(i + 1));
        };
        attempt(0).catch(() => null).then(found => {
            if (!this.state.nowPlaying || this.state.nowPlaying.id !== track.id) return;
            this.activeLine = -1;
            this.setState({
                lyricsLoading: false,
                lyrics: found && {
                    synced: found.syncedLyrics ? parseLrc(found.syncedLyrics) : null,
                    plain: found.plainLyrics,
                    name: `${found.trackName} · ${found.artistName}`,
                },
            });
        });
    }

    currentLine = () => {
        const { lyrics, time } = this.state;
        return lyrics && lyrics.synced ? currentLyricIndex(lyrics.synced, time) : -1;
    }

    // Keep the current lyric line centred
    scrollLyrics = () => {
        if (!this.state.showNowPlaying || !this.lyricsBox) return;
        const active = this.currentLine();
        if (active === this.activeLine) return;
        this.activeLine = active;
        const el = this.lyricsBox.querySelector(`[data-line="${active}"]`);
        if (el) this.lyricsBox.scrollTo({ top: el.offsetTop - this.lyricsBox.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
    }

    // One YouTube iframe floats over the layout and snaps to the visible slot
    // (mini player in the bar, or the big Now Playing view) — moving it in the DOM would reload it.
    positionPlayer = () => {
        const slot = (this.state.showNowPlaying && this.bigSlot) || this.miniSlot;
        if (!slot || !this.root || !this.playerHost) return;
        const r = slot.getBoundingClientRect(), p = this.root.getBoundingClientRect();
        Object.assign(this.playerHost.style, {
            left: (r.left - p.left) + "px",
            top: (r.top - p.top) + "px",
            width: r.width + "px",
            height: r.height + "px",
        });
    }

    toggleNowPlaying = () => {
        this.activeLine = -1;
        this.setState({ showNowPlaying: !this.state.showNowPlaying });
    }

    handleVolume = (e) => {
        const volume = parseInt(e.target.value, 10);
        if (this.ready) this.player.setVolume(volume);
        this.setState({ volume });
    }

    // ---------- UI ----------

    renderSidebar = () => (
        <div className="w-1/4 min-w-max overflow-y-auto windowMainScreen hidden sm:block" style={{ backgroundColor: COLORS.panel }}>
            <div className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-gray-500">Playlists</div>
            {PLAYLISTS.map(p => {
                const active = p.id === this.state.view.id;
                return (
                    <div
                        key={p.id}
                        onClick={() => this.loadPlaylist(p)}
                        className={(active ? "text-white " : "text-gray-400 hover:text-white ") + "mx-2 my-0.5 px-3 py-1.5 text-sm rounded-md cursor-default border-l-2 transition-colors"}
                        style={active ? { borderColor: ACCENT, backgroundColor: "rgba(247, 117, 43, 0.12)" } : { borderColor: "transparent" }}
                    >
                        {p.title}
                    </div>
                );
            })}
        </div>
    )

    renderTrackList = () => {
        const { tracks, loadingList, listError, view, playing, nowPlaying, direct } = this.state;

        return (
            <div className="flex-grow overflow-y-auto windowMainScreen">
                <div style={{ backgroundImage: `linear-gradient(180deg, rgba(155, 29, 90, 0.6) 0%, rgba(247, 117, 43, 0.12) 70%, rgba(0, 0, 0, 0) 100%)` }}>
                <form onSubmit={this.searchSongs} className="p-3 pb-0 flex">
                    <input
                        value={this.state.search}
                        onChange={e => this.setState({ search: e.target.value })}
                        placeholder="Search any song or artist…"
                        className="flex-grow outline-none bg-black bg-opacity-30 border border-white border-opacity-10 focus:border-opacity-30 rounded-full px-4 py-1.5 text-sm text-gray-200 focus:text-white placeholder-gray-400"
                        spellCheck={false}
                    />
                </form>
                <div className="flex items-end p-4 pb-5">
                    {tracks[0] && <img src={thumb(tracks[0].id)} alt="" onError={hideBrokenImage} className="w-24 h-16 md:w-36 md:h-20 rounded shadow-lg object-cover bg-black" />}
                    <div className={(tracks[0] ? "ml-4 " : "") + "min-w-0"}>
                        <div className="text-xs uppercase tracking-wider text-gray-200">{view.search ? "Search results" : "Playlist"}</div>
                        <div className="text-xl md:text-3xl font-bold truncate">{view.title}</div>
                        <div className="text-xs text-gray-300 mt-1">{tracks.length ? `${tracks.length} songs · ` : ""}YouTube</div>
                    </div>
                    {(tracks.length > 0 || (!view.search && !loadingList)) &&
                        <button type="button" onClick={this.playView} className="ml-auto w-12 h-12 flex-shrink-0 rounded-full flex justify-center items-center text-lg shadow-lg transform hover:scale-105 transition-transform" style={{ backgroundImage: GRADIENT }} aria-label="Play all">▶</button>}
                </div>
                </div>
                {loadingList && !tracks.length && [...Array(8)].map((_, i) => (
                    <div key={i} className="flex items-center px-4 py-2 animate-pulse">
                        <div className="w-6 mr-3" />
                        <div className="w-14 h-8 rounded mr-3 bg-white bg-opacity-10" />
                        <div className="flex-grow">
                            <div className="h-3 rounded bg-white bg-opacity-10 w-2/3" />
                            <div className="h-2 rounded bg-white bg-opacity-5 w-1/3 mt-2" />
                        </div>
                    </div>
                ))}
                {listError && <div className="px-4 pb-4 text-sm text-gray-300">{listError}</div>}
                {direct && !tracks.length && <div className="px-4 pb-4 text-sm text-gray-400">Playing directly from YouTube. Use ⏮ ⏭ to move through the playlist.</div>}
                {tracks.map((t, i) => {
                    const active = nowPlaying && nowPlaying.id === t.id;
                    return (
                        <div
                            key={t.id + i}
                            onDoubleClick={() => this.playFromList(i)}
                            className={(active ? "bg-white bg-opacity-5 " : "") + "group flex items-center mx-2 px-2 py-1.5 text-sm rounded-md hover:bg-white hover:bg-opacity-5 cursor-default"}
                            style={active ? { color: ACCENT } : undefined}
                        >
                            <button type="button" onClick={() => this.playFromList(i)} className="w-6 text-right text-gray-400 mr-3 flex-shrink-0">
                                <span className="group-hover:hidden">{active && playing ? "♫" : i + 1}</span>
                                <span className="hidden group-hover:inline text-white">{active && playing ? "❚❚" : "▶"}</span>
                            </button>
                            <img src={thumb(t.id)} alt="" loading="lazy" onError={hideBrokenImage} className="w-14 h-8 rounded mr-3 flex-shrink-0 object-cover bg-black" />
                            <div className="min-w-0 flex-grow">
                                <div className="truncate">{t.title || <span className="text-gray-500">Loading…</span>}</div>
                                {t.author && <div className="truncate text-xs text-gray-400">{t.author}</div>}
                            </div>
                            <div className="ml-3 text-xs text-gray-400 flex-shrink-0">{t.duration ? formatTime(t.duration) : ""}</div>
                        </div>
                    );
                })}
            </div>
        );
    }

    renderPlayerBar = () => {
        const { playing, time, duration, volume, nowPlaying } = this.state;

        return (
            <div className="w-full px-3 py-2 flex items-center border-t border-white border-opacity-5" style={{ backgroundColor: COLORS.bar }}>
                <div className="flex items-center w-1/3 min-w-0">
                    {/* Mini player slot: the floating YouTube player sits here (it must stay visible) */}
                    <div ref={el => this.miniSlot = el} className={(this.state.showNowPlaying ? "w-0 " : "w-24 md:w-28 mr-2 ") + "h-14 md:h-16 flex-shrink-0"} />
                    <div className="min-w-0">
                        <div className="text-sm truncate">{nowPlaying ? nowPlaying.title : "Nothing playing"}</div>
                        <div className="text-xs text-gray-400 truncate">{nowPlaying ? nowPlaying.author : "Pick a song to start"}</div>
                    </div>
                </div>
                <div className="flex flex-col items-center flex-grow px-2">
                    <div className="flex items-center">
                        <button type="button" onClick={this.prev} className="px-2 text-gray-300 hover:text-white" aria-label="Previous">⏮</button>
                        <button type="button" onClick={this.togglePlay} className="mx-2 w-9 h-9 rounded-full flex justify-center items-center text-sm shadow transform hover:scale-105 transition-transform" style={{ backgroundImage: GRADIENT }} aria-label={playing ? "Pause" : "Play"}>
                            {playing ? "❚❚" : "▶"}
                        </button>
                        <button type="button" onClick={this.next} className="px-2 text-gray-300 hover:text-white" aria-label="Next">⏭</button>
                    </div>
                    <div className="flex items-center w-full text-xs text-gray-400 mt-1">
                        <span className="w-9 text-right">{formatTime(time)}</span>
                        <input type="range" min="0" max={duration || 0} step="1" value={time} onChange={this.seek} className="flex-grow mx-2 ubuntu-slider" style={sliderFill(time, duration)} aria-label="Seek" />
                        <span className="w-9">{formatTime(duration)}</span>
                    </div>
                </div>
                <div className="w-1/4 flex items-center justify-end">
                    <button type="button" onClick={this.toggleNowPlaying} className={(this.state.showNowPlaying ? "" : "bg-white bg-opacity-10 hover:bg-opacity-20 ") + "mr-3 px-3 py-1 rounded-full text-xs whitespace-nowrap"} style={this.state.showNowPlaying ? { backgroundImage: GRADIENT } : undefined}>
                        {this.state.showNowPlaying ? "☰ Songs" : "♪ Video & Lyrics"}
                    </button>
                    <span className="mr-2 text-sm hidden md:inline">🔊</span>
                    <input type="range" min="0" max="100" step="1" value={volume} onChange={this.handleVolume} className="w-24 ubuntu-slider hidden md:block" style={sliderFill(volume, 100)} aria-label="Volume" />
                </div>
            </div>
        );
    }

    renderLyrics = () => {
        const { lyrics, lyricsLoading, nowPlaying } = this.state;
        if (!nowPlaying) return <div className="text-gray-400">Play a song to see its lyrics here.</div>;
        if (lyricsLoading) return <div className="text-gray-400">Looking for lyrics…</div>;
        if (!lyrics) return <div className="text-gray-400">No lyrics found for this song.</div>;

        const active = this.currentLine();
        return (
            <>
                {lyrics.synced
                    ? lyrics.synced.map((l, i) => (
                        <div
                            key={i}
                            data-line={i}
                            onClick={() => this.seekTo(l.t)}
                            className={(i === active ? "text-white text-lg md:text-xl font-bold " : i < active ? "text-gray-500 " : "text-gray-400 ") + "py-1 cursor-pointer hover:text-gray-200 transition-all duration-200"}
                        >
                            {l.text || "♪"}
                        </div>
                    ))
                    : <div className="whitespace-pre-line text-gray-300 leading-relaxed">{lyrics.plain}</div>}
                <div className="mt-6 text-xs text-gray-500">{lyrics.name} · lyrics from LRCLIB</div>
            </>
        );
    }

    renderNowPlaying = () => {
        const { nowPlaying } = this.state;
        return (
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden" style={{ backgroundImage: `radial-gradient(ellipse at 20% 0%, rgba(155, 29, 90, 0.45), rgba(0, 0, 0, 0) 60%), radial-gradient(ellipse at 100% 100%, rgba(247, 117, 43, 0.18), rgba(0, 0, 0, 0) 55%)` }}>
                <div className="md:w-3/5 p-4 flex-shrink-0">
                    <div ref={el => this.bigSlot = el} className="w-full aspect-video rounded-lg shadow-2xl" />
                    <div className="mt-3 text-base md:text-lg font-bold truncate">{nowPlaying ? nowPlaying.title : "Nothing playing"}</div>
                    <div className="text-sm text-gray-400 truncate">{nowPlaying && nowPlaying.author}</div>
                </div>
                <div ref={el => this.lyricsBox = el} className="relative flex-grow overflow-y-auto windowMainScreen px-4 pb-4 md:py-8 md:pr-6">
                    {this.renderLyrics()}
                </div>
            </div>
        );
    }

    render() {
        return (
            <div ref={el => this.root = el} className="relative h-full w-full flex flex-col text-white select-none" style={{ backgroundColor: COLORS.base }}>
                <div className="flex flex-grow overflow-hidden">
                    {this.state.showNowPlaying
                        ? this.renderNowPlaying()
                        : <>{this.renderSidebar()}{this.renderTrackList()}</>}
                </div>
                {this.renderPlayerBar()}
                <div ref={el => this.playerHost = el} className="absolute rounded overflow-hidden bg-black transition-all duration-300 ease-out" />
            </div>
        )
    }
}

export default Music

export const displayMusic = () => {
    return <Music> </Music>;
}
