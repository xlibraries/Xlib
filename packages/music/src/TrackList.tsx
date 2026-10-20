import type { FormEvent, SyntheticEvent } from 'react';
import { ACCENT, GRADIENT } from './theme';
import { formatTime, type Track } from './tracks';
import { thumb } from './youtube';

export interface View { id: string; title: string; search?: boolean }

const hideBrokenImage = (e: SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.visibility = 'hidden'; };

export interface TrackListProps {
    view: View;
    tracks: Track[];
    loadingList: boolean;
    listError: string | null;
    direct: boolean;
    nowPlaying: Track | null;
    playing: boolean;
    search: string;
    onSearchChange(value: string): void;
    onSearch(e: FormEvent): void;
    onPlayView(): void;
    onPlayIndex(index: number): void;
}

export function TrackList({ view, tracks, loadingList, listError, direct, nowPlaying, playing, search, onSearchChange, onSearch, onPlayView, onPlayIndex }: TrackListProps) {
    return (
        <div className="flex-grow overflow-y-auto xlib-music-scroll">
            <div style={{ backgroundImage: 'linear-gradient(180deg, rgba(155, 29, 90, 0.6) 0%, rgba(247, 117, 43, 0.12) 70%, rgba(0, 0, 0, 0) 100%)' }}>
                <form onSubmit={onSearch} className="p-3 pb-0 flex">
                    <input
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search any song or artist…"
                        className="flex-grow outline-none bg-black bg-opacity-30 border border-white border-opacity-10 focus:border-opacity-30 rounded-full px-4 py-1.5 text-sm text-gray-200 focus:text-white placeholder-gray-400"
                        spellCheck={false}
                    />
                </form>
                <div className="flex items-end p-4 pb-5">
                    {tracks[0] && <img src={thumb(tracks[0].id)} alt="" onError={hideBrokenImage} className="w-24 h-16 md:w-36 md:h-20 rounded shadow-lg object-cover bg-black" />}
                    <div className={(tracks[0] ? 'ml-4 ' : '') + 'min-w-0'}>
                        <div className="text-xs uppercase tracking-wider text-gray-200">{view.search ? 'Search results' : 'Playlist'}</div>
                        <div className="text-xl md:text-3xl font-bold truncate">{view.title}</div>
                        <div className="text-xs text-gray-300 mt-1">{tracks.length ? `${tracks.length} songs · ` : ''}YouTube</div>
                    </div>
                    {(tracks.length > 0 || (!view.search && !loadingList)) &&
                        <button type="button" onClick={onPlayView} className="ml-auto w-12 h-12 flex-shrink-0 rounded-full flex justify-center items-center text-lg shadow-lg transform hover:scale-105 transition-transform" style={{ backgroundImage: GRADIENT }} aria-label="Play all">▶</button>}
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
                const active = nowPlaying?.id === t.id;
                return (
                    <div
                        key={t.id + i}
                        onDoubleClick={() => onPlayIndex(i)}
                        className={(active ? 'bg-white bg-opacity-5 ' : '') + 'group flex items-center mx-2 px-2 py-1.5 text-sm rounded-md hover:bg-white hover:bg-opacity-5 cursor-default'}
                        style={active ? { color: ACCENT } : undefined}
                    >
                        <button type="button" onClick={() => onPlayIndex(i)} className="w-6 text-right text-gray-400 mr-3 flex-shrink-0">
                            <span className="group-hover:hidden">{active && playing ? '♫' : i + 1}</span>
                            <span className="hidden group-hover:inline text-white">{active && playing ? '❚❚' : '▶'}</span>
                        </button>
                        <img src={thumb(t.id)} alt="" loading="lazy" onError={hideBrokenImage} className="w-14 h-8 rounded mr-3 flex-shrink-0 object-cover bg-black" />
                        <div className="min-w-0 flex-grow">
                            <div className="truncate">{t.title || <span className="text-gray-500">Loading…</span>}</div>
                            {t.author && <div className="truncate text-xs text-gray-400">{t.author}</div>}
                        </div>
                        <div className="ml-3 text-xs text-gray-400 flex-shrink-0">{t.duration ? formatTime(t.duration) : ''}</div>
                    </div>
                );
            })}
        </div>
    );
}
