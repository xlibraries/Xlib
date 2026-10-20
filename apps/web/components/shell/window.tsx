import { useCallback, useEffect, useRef, useState, type ComponentType, type DragEvent } from 'react';
import Draggable from 'react-draggable';
import type { AppProps, Host } from '@xlibraries/app-sdk';

export interface WindowProps {
    id: string;
    title: string;
    screen: ComponentType<AppProps>;
    /** What the desktop offers the app; the window adds close(). */
    host: Omit<Host, 'close'>;
    isFocused: boolean;
    minimized: boolean;
    onFocus: (id: string) => void;
    onMinimize: (id: string) => void;
    onClose: (id: string) => void;
    onOverlap: (id: string, hide: boolean) => void;
}

const START = { x: 60, y: 10 };

// Window size in % of the screen: wider than tall on desktops, the reverse on phones
const defaultSize = () => (window.innerWidth < 640 ? { width: 85, height: 60 } : { width: 60, height: 85 });

export default function Window({ id, title, screen, host, isFocused, minimized, onFocus, onMinimize, onClose, onOverlap }: WindowProps) {
    // Direct ref for react-draggable, so it doesn't fall back to the deprecated findDOMNode
    const node = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 60, height: 85 });
    const [cursor, setCursor] = useState("cursor-default");
    const [closing, setClosing] = useState(false);
    const [maximized, setMaximized] = useState(false);
    const [viewport, setViewport] = useState({ width: 1000, height: 800 });

    // Mount: size for the screen
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- window size is only known in the browser
        setSize(defaultSize());
        const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [id]);

    // How far the window can be dragged: the screen minus its own size (and the top bar)
    const bounds = {
        left: 0,
        top: 0,
        right: viewport.width - viewport.width * (size.width / 100),
        bottom: viewport.height - viewport.height * (size.height / 100) - 28,
    };

    // Remember where the window is, for restoring after minimize/maximize
    const savePosition = () => {
        const el = node.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--window-transform-x', rect.x.toFixed(1) + "px");
        el.style.setProperty('--window-transform-y', (rect.y - 32).toFixed(1) + "px");
    };

    const checkOverlap = useCallback(() => {
        const rect = node.current?.getBoundingClientRect();
        if (rect) onOverlap(id, rect.x < 50);   // over the dock?
    }, [id, onOverlap]);

    // Coming back from the dock: fly back to where it was
    const wasMinimized = useRef(minimized);
    useEffect(() => {
        const el = node.current;
        if (wasMinimized.current && !minimized && el) {
            el.style.transform = `translate(${el.style.getPropertyValue("--window-transform-x")},${el.style.getPropertyValue("--window-transform-y")}) scale(1)`;
        }
        wasMinimized.current = minimized;
    }, [minimized]);

    const restore = () => {
        const el = node.current;
        if (!el) return;
        setSize(defaultSize());
        el.style.transform = `translate(${el.style.getPropertyValue("--window-transform-x")},${el.style.getPropertyValue("--window-transform-y")})`;
        setTimeout(() => {
            setMaximized(false);
            checkOverlap();
        }, 300);
    };

    const maximize = () => {
        if (maximized) return restore();
        onFocus(id);
        savePosition();
        if (node.current) node.current.style.transform = `translate(-1pt,-2pt)`;
        setMaximized(true);
        setSize({ width: 100.2, height: 96.3 });
        onOverlap(id, true);
    };

    const minimize = () => {
        savePosition();
        // shrink into this app's dock icon
        const dockIcon = document.getElementById("sidebar-" + id)?.getBoundingClientRect();
        if (node.current && dockIcon) {
            node.current.style.transform = `translate(${maximized ? -510 : -310}px,${(dockIcon.y - 240).toFixed(1)}px) scale(0.2)`;
        }
        onMinimize(id);
    };

    const close = useCallback(() => {
        savePosition();
        setClosing(true);
        onOverlap(id, false);
        setTimeout(() => onClose(id), 300);   // let the closing animation play, then the desktop unmounts it
    }, [id, onClose, onOverlap]);

    const onDragStart = () => {
        onFocus(id);
        if (maximized) restore();
        setCursor("cursor-move");
    };

    return (
        <Draggable
            nodeRef={node as React.RefObject<HTMLElement>}
            axis="both"
            handle=".bg-ub-window-title"
            grid={[1, 1]}
            scale={1}
            onStart={onDragStart}
            onStop={() => setCursor("cursor-default")}
            onDrag={checkOverlap}
            allowAnyClick={false}
            defaultPosition={START}
            bounds={bounds}
        >
            <div
                ref={node}
                style={{ width: `${size.width}%`, height: `${size.height}%` }}
                className={cursor + " " + (closing ? " closed-window " : "") + (maximized ? " duration-300 rounded-none" : " rounded-lg rounded-b-none") + (minimized ? " opacity-0 invisible duration-200 " : "") + (isFocused ? " z-30 " : " z-20 notFocused") + " opened-window overflow-hidden min-w-1/4 min-h-1/4 main-window absolute window-shadow border-black border-opacity-40 border border-t-0 flex flex-col"}
                id={id}
            >
                <ResizeBorder className="window-y-border" onResize={() => setSize(s => ({ ...s, width: s.width + 0.1 }))} />
                <ResizeBorder className="window-x-border" onResize={() => setSize(s => ({ ...s, height: s.height + 0.1 }))} />
                <WindowTopBar title={title} />
                <WindowEditButtons minimize={minimize} maximize={maximize} isMaximised={maximized} close={close} id={id} />
                <WindowMainScreen App={screen} host={{ ...host, close }} />
            </div>
        </Draggable>
    );
}

// Window's title bar
export function WindowTopBar({ title }: { title: string }) {
    return (
        <div className=" relative bg-ub-window-title border-t-2 border-white border-opacity-5 py-1.5 px-3 text-white w-full select-none rounded-b-none">
            <div className="flex justify-center text-sm font-bold">{title}</div>
        </div>
    );
}

// Invisible drag handles on the window's edges; the drag ghost image is hidden
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
function ResizeBorder({ className, onResize }: { className: string; onResize: () => void }) {
    const ghost = useRef<HTMLImageElement | null>(null);
    const onDragStart = (e: DragEvent<HTMLDivElement>) => {
        if (!ghost.current) {
            ghost.current = new Image(0, 0);
            ghost.current.src = BLANK_GIF;
            ghost.current.style.opacity = "0";
        }
        e.dataTransfer.setDragImage(ghost.current, 0, 0);
    };
    return <div className={className + " border-transparent border-1 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"} onDragStart={onDragStart} onDrag={onResize} />;
}

// Window's minimize / maximize / close buttons
export function WindowEditButtons({ minimize, maximize, isMaximised, close, id }: { minimize: () => void; maximize: () => void; isMaximised: boolean; close: () => void; id: string }) {
    return (
        <div className="absolute select-none right-0 top-0 mt-1 mr-1 flex justify-center items-center">
            <span className="mx-1.5 bg-white bg-opacity-0 hover:bg-opacity-10 rounded-full flex justify-center mt-1 h-5 w-5 items-center" onClick={minimize}>
                <img src="./themes/Yaru/window/window-minimize-symbolic.svg" alt="ubuntu window minimize" className="h-5 w-5 inline" />
            </span>
            <span className="mx-2 bg-white bg-opacity-0 hover:bg-opacity-10 rounded-full flex justify-center mt-1 h-5 w-5 items-center" onClick={maximize}>
                <img
                    src={isMaximised ? "./themes/Yaru/window/window-restore-symbolic.svg" : "./themes/Yaru/window/window-maximize-symbolic.svg"}
                    alt={isMaximised ? "ubuntu window restore" : "ubuntu window maximize"}
                    className="h-5 w-5 inline"
                />
            </span>
            <button tabIndex={-1} id={`close-${id}`} className="mx-1.5 focus:outline-none cursor-default bg-ub-orange bg-opacity-90 hover:bg-opacity-100 rounded-full flex justify-center mt-1 h-5 w-5 items-center" onClick={close}>
                <img src="./themes/Yaru/window/window-close-symbolic.svg" alt="ubuntu window close" className="h-5 w-5 inline" />
            </button>
        </div>
    );
}

// The app itself; the background darkens a few seconds after opening
export function WindowMainScreen({ App, host }: { App: ComponentType<AppProps>; host: Host }) {
    const [dark, setDark] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setDark(true), 3000);
        return () => clearTimeout(timer);
    }, []);
    return (
        <div className={"w-full flex-grow z-20 max-h-full overflow-y-auto windowMainScreen" + (dark ? " bg-ub-drk-abrgn " : " bg-ub-cool-grey")}>
            <App host={host} />
        </div>
    );
}
