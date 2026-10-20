import type { Ref } from 'react';
import type { Lyrics } from './lyrics';
import type { Track } from './tracks';

export interface NowPlayingProps {
    nowPlaying: Track | null;
    lyrics: Lyrics | null;
    lyricsLoading: boolean;
    activeLine: number;
    /** Where the floating YouTube player sits in this view. */
    bigSlot: Ref<HTMLDivElement>;
    lyricsBox: Ref<HTMLDivElement>;
    onSeek(time: number): void;
}

function LyricsView({ nowPlaying, lyrics, lyricsLoading, activeLine, onSeek }: Omit<NowPlayingProps, 'bigSlot' | 'lyricsBox'>) {
    if (!nowPlaying) return <div className="text-gray-400">Play a song to see its lyrics here.</div>;
    if (lyricsLoading) return <div className="text-gray-400">Looking for lyrics…</div>;
    if (!lyrics) return <div className="text-gray-400">No lyrics found for this song.</div>;
    return (
        <>
            {lyrics.synced
                ? lyrics.synced.map((l, i) => (
                    <div
                        key={i}
                        data-line={i}
                        onClick={() => onSeek(l.t)}
                        className={(i === activeLine ? 'text-white text-lg md:text-xl font-bold ' : i < activeLine ? 'text-gray-500 ' : 'text-gray-400 ') + 'py-1 cursor-pointer hover:text-gray-200 transition-all duration-200'}
                    >
                        {l.text || '♪'}
                    </div>
                ))
                : <div className="whitespace-pre-line text-gray-300 leading-relaxed">{lyrics.plain}</div>}
            <div className="mt-6 text-xs text-gray-500">{lyrics.name} · lyrics from LRCLIB</div>
        </>
    );
}

export function NowPlaying({ bigSlot, lyricsBox, ...props }: NowPlayingProps) {
    const { nowPlaying } = props;
    return (
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden" style={{ backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(155, 29, 90, 0.45), rgba(0, 0, 0, 0) 60%), radial-gradient(ellipse at 100% 100%, rgba(247, 117, 43, 0.18), rgba(0, 0, 0, 0) 55%)' }}>
            <div className="md:w-3/5 p-4 flex-shrink-0">
                <div ref={bigSlot} className="w-full aspect-video rounded-lg shadow-2xl" />
                <div className="mt-3 text-base md:text-lg font-bold truncate">{nowPlaying ? nowPlaying.title : 'Nothing playing'}</div>
                <div className="text-sm text-gray-400 truncate">{nowPlaying?.author}</div>
            </div>
            <div ref={lyricsBox} className="relative flex-grow overflow-y-auto xlib-music-scroll px-4 pb-4 md:py-8 md:pr-6">
                <LyricsView {...props} />
            </div>
        </div>
    );
}
