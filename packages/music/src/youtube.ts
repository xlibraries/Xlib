// YouTube's embeddable player (IFrame API) and oEmbed lookups.

export interface YTPlayer {
    loadVideoById(id: string): void;
    loadPlaylist(options: { list: string; listType: 'playlist'; index: number }): void;
    playVideo(): void;
    pauseVideo(): void;
    nextVideo(): void;
    previousVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoData(): { video_id: string; title: string; author: string };
    getPlaylist(): string[] | null;
    getPlaylistIndex(): number;
    destroy(): void;
}

export interface YTNamespace {
    Player: new (el: HTMLElement, options: Record<string, unknown>) => YTPlayer;
    PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

declare global {
    interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<YTNamespace> | null = null;
export function loadYouTubeApi(): Promise<YTNamespace> {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!apiPromise) {
        apiPromise = new Promise((resolve) => {
            const previous = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                previous?.();
                resolve(window.YT!);
            };
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            document.body.appendChild(script);
        });
    }
    return apiPromise;
}

export const thumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

/** Title and channel for each video id, 8 at a time; yields each batch as it arrives. */
export async function* videoTitles(ids: string[], fetchImpl: typeof fetch = (input, init) => fetch(input, init)) {
    for (let i = 0; i < ids.length; i += 8) {
        const batch = await Promise.all(ids.slice(i, i + 8).map((id) =>
            fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`)
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null)
                .then((info: { title: string; author_name: string } | null) => [id, info] as const)));
        const found: Record<string, { title: string; author: string }> = {};
        for (const [id, info] of batch) if (info) found[id] = { title: info.title, author: info.author_name };
        yield found;
    }
}
