import { describe, expect, it } from 'vitest';
import { emptyWindows, folderId, recordOpen, windowReducer, type WindowAction, type WindowsState } from '../../lib/window-manager';

const APPS = [
    { id: 'terminal', favourite: true },
    { id: 'music', favourite: true },
    { id: 'trash', favourite: false },
    { id: 'folder', favourite: false, disabled: true },
];
const run = (...actions: WindowAction[]) => actions.reduce(windowReducer, windowReducer(emptyWindows, { type: 'sync', apps: APPS }));
const openIds = (s: WindowsState) => Object.keys(s.closed).filter((id) => !s.closed[id]);
const focusedId = (s: WindowsState) => Object.keys(s.focused).find((id) => s.focused[id]) ?? null;

describe('windowReducer', () => {
    it('starts with every window closed and the favourites in the dock', () => {
        const s = run();
        expect(openIds(s)).toEqual([]);
        expect(s.favourite).toEqual({ terminal: true, music: true, trash: false, folder: false });
    });

    it('opens a window, focuses it and shows it in the dock', () => {
        const s = run({ type: 'open', id: 'trash' });
        expect(openIds(s)).toEqual(['trash']);
        expect(focusedId(s)).toBe('trash');
        expect(s.favourite.trash).toBe(true);
        expect(s.stack).toEqual(['trash']);
    });

    it('ignores disabled apps (desktop folders)', () => {
        expect(run({ type: 'open', id: 'folder' })).toEqual(run());
    });

    it('re-opening an open window just focuses it', () => {
        const s = run({ type: 'open', id: 'terminal' }, { type: 'open', id: 'music' }, { type: 'open', id: 'terminal' });
        expect(s.stack).toEqual(['terminal', 'music']);
        expect(focusedId(s)).toBe('terminal');
    });

    it('minimizing hands focus to the earliest open window and shows the dock', () => {
        const s = run({ type: 'open', id: 'terminal' }, { type: 'open', id: 'music' }, { type: 'overlap', id: 'music', hide: true }, { type: 'minimize', id: 'music' });
        expect(s.minimized.music).toBe(true);
        expect(focusedId(s)).toBe('terminal');
        expect(s.hideDock).toBe(false);
    });

    it('opening a minimized window restores and focuses it', () => {
        const s = run({ type: 'open', id: 'music' }, { type: 'minimize', id: 'music' }, { type: 'open', id: 'music' });
        expect(s.minimized.music).toBe(false);
        expect(focusedId(s)).toBe('music');
    });

    it('closing removes the window, drops non-favourites from the dock and refocuses', () => {
        const s = run({ type: 'open', id: 'terminal' }, { type: 'open', id: 'trash' }, { type: 'close', id: 'trash' });
        expect(openIds(s)).toEqual(['terminal']);
        expect(s.favourite.trash).toBe(false);
        expect(s.favourite.terminal).toBe(true);
        expect(focusedId(s)).toBe('terminal');
        expect(s.stack).toEqual(['terminal']);
    });

    it('hides the dock while a window covers it, until no window does', () => {
        let s = run({ type: 'open', id: 'terminal' }, { type: 'open', id: 'music' });
        s = windowReducer(s, { type: 'overlap', id: 'terminal', hide: true });
        expect(s.hideDock).toBe(true);
        s = windowReducer(s, { type: 'overlap', id: 'music', hide: true });
        s = windowReducer(s, { type: 'overlap', id: 'music', hide: false });
        expect(s.hideDock).toBe(true);   // terminal still covers it
        s = windowReducer(s, { type: 'overlap', id: null, hide: false });
        expect(s.hideDock).toBe(false);  // hovering the dock edge shows it
        s = windowReducer(s, { type: 'overlap', id: null, hide: true });
        expect(s.hideDock).toBe(true);   // and it hides again while something covers it
    });

    it("closing a window that covered the dock doesn't keep the dock hidden later", () => {
        const s = run({ type: 'open', id: 'terminal' }, { type: 'overlap', id: 'terminal', hide: true }, { type: 'close', id: 'terminal' }, { type: 'overlap', id: null, hide: true });
        expect(s.hideDock).toBe(false);
    });

    it('a new app list keeps open windows and dock state', () => {
        let s = run({ type: 'open', id: 'trash' });
        s = windowReducer(s, { type: 'sync', apps: [...APPS, { id: 'new-folder-x', disabled: true }] });
        expect(openIds(s)).toEqual(['trash']);
        expect(s.favourite.trash).toBe(true);
        expect(s.closed['new-folder-x']).toBe(true);
        expect(s.disabled['new-folder-x']).toBe(true);
    });

    it('toggles the app grid, and opening an app closes it', () => {
        let s = run({ type: 'toggleAllApps' });
        expect(s.allApps).toBe(true);
        s = windowReducer(s, { type: 'open', id: 'music' });
        expect(s.allApps).toBe(false);
    });
});

describe('recordOpen', () => {
    it('counts opens and keeps the most used first', () => {
        let list = recordOpen([], 'music');
        list = recordOpen(list, 'terminal');
        list = recordOpen(list, 'terminal');
        expect(list).toEqual([{ id: 'terminal', frequency: 2 }, { id: 'music', frequency: 1 }]);
    });
});

describe('folderId', () => {
    it('slugs the name', () => expect(folderId('  My Mix Tapes ')).toBe('new-folder-my-mix-tapes'));
});
