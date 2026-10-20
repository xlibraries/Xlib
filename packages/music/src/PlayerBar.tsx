import type { Ref } from 'react';
import { COLORS, GRADIENT, sliderFill } from './theme';
import { formatTime, type Track } from './tracks';

export interface PlayerBarProps {
    nowPlaying: Track | null;
    playing: boolean;
    time: number;
    duration: number;
    volume: number;
    showNowPlaying: boolean;
    /** Where the floating YouTube player sits while the track list is shown (it must stay visible). */
    miniSlot: Ref<HTMLDivElement>;
    onPrev(): void;
    onToggle(): void;
    onNext(): void;
    onSeek(time: number): void;
    onVolume(volume: number): void;
    onToggleNowPlaying(): void;
}

export function PlayerBar({ nowPlaying, playing, time, duration, volume, showNowPlaying, miniSlot, onPrev, onToggle, onNext, onSeek, onVolume, onToggleNowPlaying }: PlayerBarProps) {
    return (
        <div className="w-full px-3 py-2 flex items-center border-t border-white border-opacity-5" style={{ backgroundColor: COLORS.bar }}>
            <div className="flex items-center w-1/3 min-w-0">
                <div ref={miniSlot} className={(showNowPlaying ? 'w-0 ' : 'w-24 md:w-28 mr-2 ') + 'h-14 md:h-16 flex-shrink-0'} />
                <div className="min-w-0">
                    <div className="text-sm truncate">{nowPlaying ? nowPlaying.title : 'Nothing playing'}</div>
                    <div className="text-xs text-gray-400 truncate">{nowPlaying ? nowPlaying.author : 'Pick a song to start'}</div>
                </div>
            </div>
            <div className="flex flex-col items-center flex-grow px-2">
                <div className="flex items-center">
                    <button type="button" onClick={onPrev} className="px-2 text-gray-300 hover:text-white" aria-label="Previous">⏮</button>
                    <button type="button" onClick={onToggle} className="mx-2 w-9 h-9 rounded-full flex justify-center items-center text-sm shadow transform hover:scale-105 transition-transform" style={{ backgroundImage: GRADIENT }} aria-label={playing ? 'Pause' : 'Play'}>
                        {playing ? '❚❚' : '▶'}
                    </button>
                    <button type="button" onClick={onNext} className="px-2 text-gray-300 hover:text-white" aria-label="Next">⏭</button>
                </div>
                <div className="flex items-center w-full text-xs text-gray-400 mt-1">
                    <span className="w-9 text-right">{formatTime(time)}</span>
                    <input type="range" min="0" max={duration || 0} step="1" value={time} onChange={(e) => onSeek(parseFloat(e.target.value))} className="flex-grow mx-2 xlib-music-slider" style={sliderFill(time, duration)} aria-label="Seek" />
                    <span className="w-9">{formatTime(duration)}</span>
                </div>
            </div>
            <div className="w-1/4 flex items-center justify-end">
                <button type="button" onClick={onToggleNowPlaying} className={(showNowPlaying ? '' : 'bg-white bg-opacity-10 hover:bg-opacity-20 ') + 'mr-3 px-3 py-1 rounded-full text-xs whitespace-nowrap'} style={showNowPlaying ? { backgroundImage: GRADIENT } : undefined}>
                    {showNowPlaying ? '☰ Songs' : '♪ Video & Lyrics'}
                </button>
                <span className="mr-2 text-sm hidden md:inline">🔊</span>
                <input type="range" min="0" max="100" step="1" value={volume} onChange={(e) => onVolume(parseInt(e.target.value, 10))} className="w-24 xlib-music-slider hidden md:block" style={sliderFill(volume, 100)} aria-label="Volume" />
            </div>
        </div>
    );
}
