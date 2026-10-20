// The only thing an app package may import from the desktop: what the desktop offers an app running in
// one of its windows. Types only, so apps stay independent of how the desktop is built.

export interface AnalyticsEvent {
    category: string;
    action: string;
    label?: string;
    value?: number;
}

export interface Host {
    /** Open (or focus) another app's window by its id, e.g. "music". */
    openApp(id: string): void;
    /** Create a folder on the desktop. */
    addFolder(name: string): void;
    /** The current wallpaper's name. */
    readonly wallpaper: string;
    setWallpaper(name: string): void;
    /** Record an analytics event. A no-op when analytics are off. */
    track(event: AnalyticsEvent): void;
}

/** Props every app receives from its window. */
export interface AppProps {
    host: Host;
}
