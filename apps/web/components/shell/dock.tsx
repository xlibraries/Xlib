import { useState } from 'react';
import type { WindowsState } from '../../lib/window-manager';
import DockApp from './dock-app';

export interface DockProps {
    apps: { id: string; title: string; icon: string }[];
    windows: WindowsState;
    openApp: (id: string) => void;
    onOverlap: (id: string | null, hide: boolean) => void;
    showAllApps: () => void;
}

export default function Dock({ apps, windows, openApp, onOverlap, showAllApps }: DockProps) {
    return (
        <>
            <div className={(windows.hideDock ? " -translate-x-full " : "") + " absolute transform duration-300 select-none z-40 left-0 top-0 h-full pt-7 w-auto flex flex-col justify-start items-center border-black border-opacity-60 bg-black bg-opacity-50"}>
                {apps.filter(app => windows.favourite[app.id]).map(app => (
                    <DockApp
                        key={app.id}
                        id={app.id}
                        title={app.title}
                        icon={app.icon}
                        isOpen={windows.closed[app.id] === false}
                        isFocused={!!windows.focused[app.id]}
                        isMinimized={!!windows.minimized[app.id]}
                        openApp={openApp}
                    />
                ))}
                <AllApps showApps={showAllApps} />
            </div>
            {/* Hovering the left edge shows a hidden dock; it hides again 2 s after leaving */}
            <div onMouseEnter={() => onOverlap(null, false)} onMouseLeave={() => setTimeout(() => onOverlap(null, true), 2000)} className="w-1 h-full absolute top-0 left-0 bg-transparent z-50"></div>
        </>
    );
}

export function AllApps({ showApps }: { showApps: () => void }) {
    const [title, setTitle] = useState(false);

    return (
        <div
            className="w-10 h-10 rounded m-1 hover:bg-white hover:bg-opacity-10 flex items-center justify-center"
            style={{ marginTop: 'auto' }}
            onMouseEnter={() => setTitle(true)}
            onMouseLeave={() => setTitle(false)}
            onClick={showApps}
        >
            <div className="relative">
                <img width="28px" height="28px" className="w-7" src="./themes/Yaru/system/view-app-grid-symbolic.svg" alt="Ubuntu view app" />
                <div
                    className={
                        (title ? " visible " : " invisible ") +
                        " w-max py-0.5 px-1.5 absolute top-1 left-full ml-5 text-ubt-grey text-opacity-90 text-sm bg-ub-grey bg-opacity-70 border-gray-400 border border-opacity-40 rounded-md"
                    }
                >
                    Show Applications
                </div>
            </div>
        </div>
    );
}
