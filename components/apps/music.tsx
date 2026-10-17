// @ts-nocheck
import React, { Component } from 'react';

// SomaFM: listener-supported internet radio — no signup, no ads.
const STATIONS = [
    { id: "groovesalad", title: "Groove Salad", genre: "Ambient / Downtempo" },
    { id: "lush", title: "Lush", genre: "Electronic / Vocal" },
    { id: "indiepop", title: "Indie Pop Rocks!", genre: "Indie / Alternative" },
    { id: "secretagent", title: "Secret Agent", genre: "Lounge" },
    { id: "deepspaceone", title: "Deep Space One", genre: "Ambient / Space" },
    { id: "beatblender", title: "Beat Blender", genre: "Deep House / Chill" },
    { id: "fluid", title: "Fluid", genre: "Instrumental Hip-Hop" },
    { id: "bossa", title: "Bossa Beyond", genre: "Bossa Nova / World" },
    { id: "seventies", title: "Left Coast 70s", genre: "70s Rock" },
    { id: "metal", title: "Metal Detector", genre: "Metal" },
];

const SERVERS = ["ice2", "ice6", "ice5"];

const streamUrl = (id, server = 0) => `https://${SERVERS[server]}.somafm.com/${id}-128-mp3`;
const logoUrl = (id) => `https://api.somafm.com/logos/256/${id}256.png`;

export class Music extends Component {
    constructor() {
        super();
        this.audio = null;
        this.pollTimer = null;
        this.state = {
            current: 0,
            playing: false,
            loading: false,
            server: 0,
            volume: 0.8,
            nowPlaying: null,
            error: null,
        }
    }

    componentDidMount() {
        try {
            let lastStation = parseInt(localStorage.getItem("music-station"), 10);
            if (!isNaN(lastStation) && STATIONS[lastStation]) this.setState({ current: lastStation });
        } catch (e) { }
        this.fetchNowPlaying();
        this.pollTimer = setInterval(this.fetchNowPlaying, 20000);
    }

    componentWillUnmount() {
        clearInterval(this.pollTimer);
        if (this.audio) {
            this.audio.pause();
            this.audio.src = "";
        }
    }

    fetchNowPlaying = () => {
        const id = STATIONS[this.state.current].id;
        fetch(`https://somafm.com/songs/${id}.json`)
            .then(res => res.json())
            .then(data => {
                if (STATIONS[this.state.current].id !== id) return;
                this.setState({ nowPlaying: data.songs && data.songs[0] ? data.songs[0] : null });
            })
            .catch(() => { });
    }

    play = () => {
        if (!this.audio) return;
        this.setState({ loading: true, error: null });
        this.audio.volume = this.state.volume;
        this.audio.play()
            .then(() => this.setState({ playing: true, loading: false }))
            .catch(() => this.setState({ playing: false, loading: false }));
    }

    pause = () => {
        if (!this.audio) return;
        this.audio.pause();
        this.setState({ playing: false });
    }

    togglePlay = () => {
        this.state.playing ? this.pause() : this.play();
    }

    selectStation = (index) => {
        try { localStorage.setItem("music-station", index); } catch (e) { }
        this.setState({ current: index, server: 0, nowPlaying: null, error: null }, () => {
            this.fetchNowPlaying();
            this.play();
        });
    }

    step = (delta) => {
        this.selectStation((this.state.current + delta + STATIONS.length) % STATIONS.length);
    }

    // Fall back to the next SomaFM relay if one is unavailable
    handleError = () => {
        if (!this.state.playing && !this.state.loading) return;
        if (this.state.server < SERVERS.length - 1) {
            this.setState({ server: this.state.server + 1 }, this.play);
        } else {
            this.setState({ playing: false, loading: false, error: "Station unavailable, try another one." });
        }
    }

    handleVolume = (e) => {
        const volume = parseFloat(e.target.value);
        if (this.audio) this.audio.volume = volume;
        this.setState({ volume });
    }

    render() {
        const station = STATIONS[this.state.current];
        const { playing, loading, nowPlaying, error } = this.state;

        return (
            <div className="h-full w-full flex flex-col bg-ub-cool-grey text-white select-none">
                <audio
                    ref={el => this.audio = el}
                    src={streamUrl(station.id, this.state.server)}
                    preload="none"
                    onError={this.handleError}
                    onWaiting={() => this.setState({ loading: true })}
                    onPlaying={() => this.setState({ loading: false, playing: true })}
                />
                <div className="flex flex-grow overflow-hidden">
                    <div className="w-2/5 md:w-1/3 border-r border-gray-900 overflow-y-auto windowMainScreen">
                        <div className="px-3 py-2 text-xs uppercase tracking-wider text-gray-400">Radio Stations</div>
                        {STATIONS.map((s, i) => (
                            <div
                                key={s.id}
                                onClick={() => this.selectStation(i)}
                                className={(i === this.state.current ? "bg-ub-orange bg-opacity-80 " : "hover:bg-gray-50 hover:bg-opacity-5 ") + "px-3 py-1.5 cursor-default flex items-center"}
                            >
                                <img src={logoUrl(s.id)} alt="" className="w-8 h-8 rounded mr-2 flex-shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-sm truncate">{s.title}</div>
                                    <div className="text-xs text-gray-300 truncate">{s.genre}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex-grow flex flex-col justify-center items-center p-4 text-center">
                        <img src={logoUrl(station.id)} alt={station.title} className={(playing ? "" : "opacity-70 ") + "w-32 h-32 md:w-44 md:h-44 rounded-lg shadow-lg"} />
                        <div className="mt-4 text-lg font-bold">{station.title}</div>
                        <div className="text-sm text-gray-400">{station.genre}</div>
                        <div className="mt-3 text-sm h-10">
                            {error
                                ? <span className="text-red-400">{error}</span>
                                : nowPlaying
                                    ? <><div className="truncate max-w-xs">{nowPlaying.title}</div><div className="text-gray-400 truncate max-w-xs">{nowPlaying.artist}</div></>
                                    : null}
                        </div>
                    </div>
                </div>
                <div className="w-full border-t border-gray-900 px-4 py-2 flex items-center">
                    <button type="button" onClick={() => this.step(-1)} className="px-2 text-xl hover:text-ub-orange" aria-label="Previous station">⏮</button>
                    <button type="button" onClick={this.togglePlay} className="mx-2 w-10 h-10 rounded-full bg-ub-orange flex justify-center items-center text-lg" aria-label={playing ? "Pause" : "Play"}>
                        {loading ? "…" : playing ? "❚❚" : "▶"}
                    </button>
                    <button type="button" onClick={() => this.step(1)} className="px-2 text-xl hover:text-ub-orange" aria-label="Next station">⏭</button>
                    <div className="ml-3 text-xs text-gray-400 hidden md:block">Live · SomaFM · Ad-free</div>
                    <div className="ml-auto flex items-center">
                        <span className="mr-2 text-sm">🔊</span>
                        <input type="range" min="0" max="1" step="0.01" value={this.state.volume} onChange={this.handleVolume} className="w-24 ubuntu-slider" aria-label="Volume" />
                    </div>
                </div>
            </div>
        )
    }
}

export default Music

export const displayMusic = () => {
    return <Music> </Music>;
}
