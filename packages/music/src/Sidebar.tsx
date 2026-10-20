import { ACCENT, COLORS } from './theme';
import type { Playlist } from './playlists';

export function Sidebar({ playlists, activeId, onSelect }: { playlists: Playlist[]; activeId: string; onSelect(p: Playlist): void }) {
    return (
        <div className="w-1/4 min-w-max overflow-y-auto xlib-music-scroll hidden sm:block" style={{ backgroundColor: COLORS.panel }}>
            <div className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-gray-500">Playlists</div>
            {playlists.map((p) => {
                const active = p.id === activeId;
                return (
                    <div
                        key={p.id}
                        onClick={() => onSelect(p)}
                        className={(active ? 'text-white ' : 'text-gray-400 hover:text-white ') + 'mx-2 my-0.5 px-3 py-1.5 text-sm rounded-md cursor-default border-l-2 transition-colors'}
                        style={active ? { borderColor: ACCENT, backgroundColor: 'rgba(247, 117, 43, 0.12)' } : { borderColor: 'transparent' }}
                    >
                        {p.title}
                    </div>
                );
            })}
        </div>
    );
}
