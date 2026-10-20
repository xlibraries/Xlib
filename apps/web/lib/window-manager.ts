// Window state for the desktop, as a pure reducer: which windows are open, focused and minimized, what the
// dock shows, and when the dock hides because a window covers it. The desktop component dispatches; the
// window, dock and app grid render from the state.

export interface AppEntry {
    id: string;
    disabled?: boolean;
    favourite?: boolean;
}

export interface WindowsState {
    closed: Record<string, boolean>;
    focused: Record<string, boolean>;
    minimized: Record<string, boolean>;
    /** Shown in the dock: apps marked favourite, plus any app while it's open. */
    favourite: Record<string, boolean>;
    /** Windows dragged or maximized over the dock. */
    overlapped: Record<string, boolean>;
    disabled: Record<string, boolean>;
    initialFavourite: Record<string, boolean>;
    /** Open windows, in the order they were opened. */
    stack: string[];
    hideDock: boolean;
    allApps: boolean;
}

export type WindowAction =
    | { type: 'sync'; apps: AppEntry[] }
    | { type: 'open'; id: string }
    | { type: 'focus'; id: string }
    | { type: 'minimize'; id: string }
    | { type: 'close'; id: string }
    | { type: 'overlap'; id: string | null; hide: boolean }
    | { type: 'toggleAllApps' };

export const emptyWindows: WindowsState = {
    closed: {}, focused: {}, minimized: {}, favourite: {}, overlapped: {}, disabled: {}, initialFavourite: {},
    stack: [], hideDock: false, allApps: false,
};

const focusOnly = (state: WindowsState, id: string | null): Record<string, boolean> =>
    Object.fromEntries(Object.keys(state.focused).map((key) => [key, key === id]));

// After a window goes away: focus the earliest-opened window that isn't minimized, if any
function focusRemaining(state: WindowsState): WindowsState {
    const next = state.stack.find((id) => !state.closed[id] && !state.minimized[id]);
    return next ? { ...state, focused: focusOnly(state, next) } : state;
}

export function windowReducer(state: WindowsState, action: WindowAction): WindowsState {
    switch (action.type) {
        // Initial app list, or the list changed (e.g. a new desktop folder): keep what's known, add the rest
        case 'sync': {
            const pick = <T,>(map: Record<string, T>, id: string, fallback: T) => (id in map ? map[id] : fallback);
            const next: WindowsState = { ...state, closed: {}, focused: {}, minimized: {}, favourite: {}, overlapped: {}, disabled: {}, initialFavourite: {} };
            for (const app of action.apps) {
                next.closed[app.id] = pick(state.closed, app.id, true);
                next.focused[app.id] = pick(state.focused, app.id, false);
                next.minimized[app.id] = pick(state.minimized, app.id, false);
                next.overlapped[app.id] = pick(state.overlapped, app.id, false);
                next.favourite[app.id] = pick(state.favourite, app.id, !!app.favourite);
                next.disabled[app.id] = !!app.disabled;
                next.initialFavourite[app.id] = !!app.favourite;
            }
            next.stack = state.stack.filter((id) => id in next.closed);
            return next;
        }
        case 'open': {
            const { id } = action;
            if (state.disabled[id]) return state;
            if (state.minimized[id]) return { ...state, minimized: { ...state.minimized, [id]: false }, focused: focusOnly(state, id) };
            if (state.stack.includes(id)) return { ...state, focused: focusOnly(state, id) };
            return {
                ...state,
                closed: { ...state.closed, [id]: false },
                favourite: { ...state.favourite, [id]: true },
                allApps: false,
                stack: [...state.stack, id],
                focused: focusOnly(state, id),
            };
        }
        case 'focus':
            return { ...state, focused: focusOnly(state, action.id) };
        case 'minimize': {
            const minimized = { ...state, minimized: { ...state.minimized, [action.id]: true }, focused: { ...state.focused, [action.id]: false }, hideDock: false };
            return focusRemaining(minimized);
        }
        case 'close': {
            const { id } = action;
            const closed: WindowsState = {
                ...state,
                stack: state.stack.filter((x) => x !== id),
                closed: { ...state.closed, [id]: true },
                focused: { ...state.focused, [id]: false },
                minimized: { ...state.minimized, [id]: false },
                overlapped: { ...state.overlapped, [id]: false },
                favourite: { ...state.favourite, [id]: state.initialFavourite[id] ? state.favourite[id] : false },
                hideDock: false,
            };
            return focusRemaining(closed);
        }
        // A window moved over (hide: true) or away from (hide: false) the dock; id null = the dock's own hover strip
        case 'overlap': {
            const { id, hide } = action;
            if (hide === state.hideDock) return state;
            const anyOverlapped = (except?: string) => Object.entries(state.overlapped).some(([key, v]) => v && key !== except);
            if (id === null) {
                if (!hide) return { ...state, hideDock: false };
                return anyOverlapped() ? { ...state, hideDock: true } : state;
            }
            if (!hide && anyOverlapped(id)) return state;   // another window still covers the dock
            return { ...state, hideDock: hide, overlapped: { ...state.overlapped, [id]: hide } };
        }
        case 'toggleAllApps':
            return { ...state, allApps: !state.allApps };
    }
}

/** Updates the "frequently used" list (most opened first) after opening `id`. */
export function recordOpen(frequent: { id: string; frequency: number }[], id: string) {
    const found = frequent.some((app) => app.id === id);
    const next = found ? frequent.map((app) => (app.id === id ? { ...app, frequency: app.frequency + 1 } : app)) : [...frequent, { id, frequency: 1 }];
    return next.sort((a, b) => b.frequency - a.frequency);
}

/** A desktop folder's id from its name ("My Stuff" → "new-folder-my-stuff"). */
export const folderId = (name: string) => `new-folder-${name.trim().replace(/\s+/g, '-').toLowerCase()}`;
