import { useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState, type MouseEvent as ReactMouseEvent, type Ref } from 'react';
import type { Host } from '@xlibraries/app-sdk';
import apps, { type AppConfig } from '../../apps.config';
import { trackEvent, trackPageview } from '../../lib/analytics';
import { emptyWindows, folderId, recordOpen, windowReducer } from '../../lib/window-manager';
import DefaultMenu from '../context-menus/default';
import DesktopMenu from '../context-menus/desktop-menu';
import BackgroundImage from '../util/background-image';
import AppGrid from './app-grid';
import DesktopIcon from './desktop-icon';
import Dock from './dock';
import Window from './window';

export interface DesktopHandle { openApp(id: string): void }

interface DesktopProps {
    wallpaper: string;
    setWallpaper: (name: string) => void;
    ref?: Ref<DesktopHandle>;
}

type Folder = { id: string; name: string };

// Folders made on the desktop (context menu or the terminal's mkdir) are icons only: they don't open
const folderApp = ({ id, name }: Folder): AppConfig => ({
    id, title: name, icon: './themes/Yaru/system/folder.png', disabled: true, favourite: false, desktop_shortcut: true, screen: () => null,
});

function loadFolders(): Folder[] {
    try {
        const saved: Folder[] = JSON.parse(localStorage.getItem('new_folders') || '[]');
        // Older versions saved ids that already started with "new-folder-" and added it again on load
        return saved.map(f => ({ id: folderId(f.name), name: f.name }));
    } catch {
        return [];
    }
}

function saveFrequent(id: string) {
    try {
        const frequent = JSON.parse(localStorage.getItem('frequentApps') || '[]');
        localStorage.setItem('frequentApps', JSON.stringify(recordOpen(frequent, id)));
    } catch { /* storage blocked */ }
}

export default function Desktop({ wallpaper, setWallpaper, ref }: DesktopProps) {
    const [folders, setFolders] = useState<Folder[]>([]);
    const allApps = useMemo(() => [...apps, ...folders.map(folderApp)], [folders]);
    const [windows, dispatch] = useReducer(windowReducer, emptyWindows);
    const [menus, setMenus] = useState({ desktop: false, default: false });
    const [naming, setNaming] = useState(false);
    const desktopMenu = useRef<HTMLDivElement>(null);
    const defaultMenu = useRef<HTMLDivElement>(null);
    // Latest state for callbacks that outlive a render (openApp is passed to every app)
    const live = useRef(windows);
    useEffect(() => { live.current = windows; }, [windows]);

    useEffect(() => {
        trackPageview("/desktop");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount (not during SSR)
        setFolders(loadFolders());
    }, []);

    useEffect(() => { dispatch({ type: 'sync', apps: allApps }); }, [allApps]);

    const openApp = useCallback((id: string) => {
        trackEvent({ category: `Open App`, action: `Opened ${id} window` });
        const s = live.current;
        if (s.disabled[id]) return;
        if (s.minimized[id] || s.stack.includes(id)) return dispatch({ type: 'open', id });
        saveFrequent(id);
        setTimeout(() => dispatch({ type: 'open', id }), 200);   // lets the dock icon's launch animation start
    }, []);

    useImperativeHandle(ref, () => ({ openApp }), [openApp]);

    const addFolder = useCallback((name: string) => {
        const title = name.trim();
        if (!title) return;
        const folder = { id: folderId(title), name: title };
        setFolders(prev => {
            const next = prev.some(f => f.id === folder.id) ? prev : [...prev, folder];
            try { localStorage.setItem('new_folders', JSON.stringify(next)); } catch { /* storage blocked */ }
            return next;
        });
        setNaming(false);
    }, []);

    const onFocus = useCallback((id: string) => dispatch({ type: 'focus', id }), []);
    const onMinimize = useCallback((id: string) => dispatch({ type: 'minimize', id }), []);
    const onClose = useCallback((id: string) => dispatch({ type: 'close', id }), []);
    const onOverlap = useCallback((id: string | null, hide: boolean) => dispatch({ type: 'overlap', id, hide }), []);

    // What every app gets from the desktop (packages/app-sdk's Host); the window adds close()
    const host: Omit<Host, 'close'> = useMemo(() => ({ openApp, addFolder, wallpaper, setWallpaper, track: trackEvent }), [openApp, addFolder, wallpaper, setWallpaper]);

    // Right-click: the desktop menu on empty desktop, the default menu elsewhere; any click hides them
    useEffect(() => {
        const hideAll = () => setMenus({ desktop: false, default: false });
        const onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            const which = (e.target as HTMLElement).dataset.context === "desktop-area" ? "desktop" : "default";
            trackEvent({ category: `Context Menu`, action: which === "desktop" ? `Opened Desktop Context Menu` : `Opened Default Context Menu` });
            const menu = (which === "desktop" ? desktopMenu : defaultMenu).current;
            if (menu) {
                // keep the menu on screen (it's display:none until shown, so measure its fixed width)
                const width = menu.offsetWidth || 208, height = menu.offsetHeight || 320;
                const x = e.pageX + width > window.innerWidth ? e.pageX - width : e.pageX;
                const y = e.pageY + height > window.innerHeight ? e.pageY - height : e.pageY;
                menu.style.left = x + "px";
                menu.style.top = y + "px";
            }
            setMenus({ desktop: which === "desktop", default: which === "default" });
        };
        document.addEventListener('contextmenu', onContextMenu);
        document.addEventListener('click', hideAll);
        return () => {
            document.removeEventListener('contextmenu', onContextMenu);
            document.removeEventListener('click', hideAll);
        };
    }, []);

    return (
        <div className=" h-full w-full flex flex-col items-end justify-start content-start flex-wrap-reverse pt-8 bg-transparent relative overflow-hidden overscroll-none window-parent">
            {/* Window area */}
            <div className="absolute h-full w-full bg-transparent" data-context="desktop-area">
                {allApps.filter(app => windows.closed[app.id] === false).map(app => (
                    <Window
                        key={app.id}
                        id={app.id}
                        title={app.title}
                        screen={app.screen}
                        host={host}
                        isFocused={!!windows.focused[app.id]}
                        minimized={!!windows.minimized[app.id]}
                        onFocus={onFocus}
                        onMinimize={onMinimize}
                        onClose={onClose}
                        onOverlap={onOverlap}
                    />
                ))}
            </div>

            <BackgroundImage img={wallpaper} />

            <Dock apps={allApps} windows={windows} openApp={openApp} onOverlap={onOverlap} showAllApps={() => dispatch({ type: 'toggleAllApps' })} />

            {allApps.filter(app => app.desktop_shortcut).map(app => (
                <DesktopIcon key={app.id} id={app.id} name={app.title} icon={app.icon} openApp={openApp} />
            ))}

            <DesktopMenu ref={desktopMenu} active={menus.desktop} openApp={openApp} addNewFolder={() => setNaming(true)} />
            <DefaultMenu ref={defaultMenu} active={menus.default} />

            {naming && <FolderNameDialog onCreate={addFolder} onCancel={() => setNaming(false)} />}

            {windows.allApps && <AppGrid apps={allApps} openApp={openApp} />}
        </div>
    );
}

function FolderNameDialog({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
    const [name, setName] = useState("");
    const stop = (e: ReactMouseEvent) => e.stopPropagation();
    return (
        <div onClick={stop} className="absolute rounded-md top-1/2 left-1/2 text-center text-white font-light text-sm bg-ub-cool-grey transform -translate-y-1/2 -translate-x-1/2 sm:w-96 w-3/4 z-50">
            <div className="w-full flex flex-col justify-around items-start pl-6 pb-8 pt-6">
                <span>New folder name</span>
                <input
                    className="outline-none mt-5 px-1 w-10/12  context-menu-bg border-2 border-yellow-700 rounded py-0.5"
                    id="folder-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onCreate(name); }}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                />
            </div>
            <div className="flex">
                <div onClick={() => onCreate(name)} className="w-1/2 px-4 py-2 border border-gray-900 border-opacity-50 border-r-0 hover:bg-ub-warm-grey hover:bg-opacity-10 hover:border-opacity-50">Create</div>
                <div onClick={onCancel} className="w-1/2 px-4 py-2 border border-gray-900 border-opacity-50 hover:bg-ub-warm-grey hover:bg-opacity-10 hover:border-opacity-50">Cancel</div>
            </div>
        </div>
    );
}
