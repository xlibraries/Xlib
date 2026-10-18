import React, { useCallback, useEffect, useRef, useState } from 'react';

// A tabbed browser inside the desktop. Pages render in iframes, so sites that forbid framing
// (YouTube, GitHub, Google...) can't load here: /api/frame-check asks first, and those get a friendly
// page with an "open in a new tab" button instead of the browser's grey error.

type Entry =
    | { kind: 'newtab' }
    | { kind: 'checking'; url: string; display: string }
    | { kind: 'page'; url: string; display: string }
    | { kind: 'blocked'; url: string; display: string; note?: string };

type Tab = { id: number; history: Entry[]; index: number; reloadKey: number };

const NEWTAB_URL = './brave/newtab.html';
const STORAGE_KEY = 'brave-tabs';

const BOOKMARKS: { label: string; icon: string; input: string }[] = [
    { label: 'xlibraries.com', icon: '🖥️', input: 'https://xlibraries.com/' },
    { label: 'Wikipedia', icon: '📚', input: 'https://en.wikipedia.org/wiki/Main_Page' },
    { label: 'Debugging Love', icon: '🎵', input: 'https://www.youtube.com/watch?v=aaHlegqIIik' },
    { label: 'GitHub', icon: '🐙', input: 'https://github.com/xlibraries' },
    { label: 'Bing', icon: '🔎', input: 'https://www.bing.com/' },
];

const looksLikeUrl = (text: string) => /^(https?:\/\/)?(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(text);
const searchUrl = (query: string) => 'https://www.bing.com/search?q=' + encodeURIComponent(query);
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// YouTube pages can't be framed, but its embed player can
function youtubeEmbed(url: URL): string | null {
    const host = url.hostname.replace(/^(www\.|m\.)/, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (host === 'youtube.com' && url.pathname === '/watch') id = url.searchParams.get('v');
    else if (host === 'youtube.com' && /^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

// Turn what the user typed into the entry to show (without the network check)
function plan(input: string): Entry | { kind: 'check'; url: string; display: string } {
    const text = input.trim();
    if (!text || text === 'about:newtab' || text === 'newtab') return { kind: 'newtab' };
    if (!looksLikeUrl(text)) {
        const url = searchUrl(text);
        return { kind: 'page', url, display: text };
    }
    let url: URL;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); } catch { return { kind: 'page', url: searchUrl(text), display: text }; }

    const embed = youtubeEmbed(url);
    if (embed) return { kind: 'page', url: embed, display: url.href };
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
        return { kind: 'blocked', url: url.href, display: url.href, note: 'YouTube only allows individual videos to be embedded. Open a video link (youtube.com/watch?v=…) to watch it here.' };
    }
    if (host === 'google.com' || host.endsWith('.google.com')) {
        return { kind: 'blocked', url: url.href, display: url.href, note: 'Google blocks searches made from inside other websites with a captcha. Type your search in the address bar to use Bing here instead.' };
    }
    // Known to allow framing: skip the check
    if (host === 'bing.com' || host.endsWith('wikipedia.org') || host === 'xlibraries.com' || host === 'youtube-nocookie.com') {
        return { kind: 'page', url: url.href, display: url.href };
    }
    return { kind: 'check', url: url.href, display: url.href };
}

async function checkFraming(url: string): Promise<{ embeddable: boolean; finalUrl: string }> {
    try {
        const res = await fetch('/api/frame-check?url=' + encodeURIComponent(url));
        if (!res.ok) return { embeddable: true, finalUrl: url };
        const data = await res.json();
        return { embeddable: data.embeddable !== false, finalUrl: data.finalUrl || url };
    } catch {
        return { embeddable: true, finalUrl: url };   // checker unavailable: let the iframe try
    }
}

let nextTabId = 1;
const newTab = (entry: Entry = { kind: 'newtab' }): Tab => ({ id: nextTabId++, history: [entry], index: 0, reloadKey: 0 });

function restoreTabs(): { tabs: Tab[]; active: number } {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && Array.isArray(saved.entries) && saved.entries.length) {
            const tabs = saved.entries.map((e: Entry) => newTab(e.kind === 'checking' ? { kind: 'page', url: e.url, display: e.display } : e));
            return { tabs, active: tabs[Math.min(saved.active || 0, tabs.length - 1)].id };
        }
    } catch { /* fall through */ }
    const tab = newTab();
    return { tabs: [tab], active: tab.id };
}

const titleOf = (entry: Entry) => entry.kind === 'newtab' ? 'New Tab' : entry.kind === 'checking' ? 'Loading…' : hostOf(entry.display);
const displayOf = (entry: Entry) => entry.kind === 'newtab' ? '' : entry.display;
const realUrlOf = (entry: Entry) => entry.kind === 'newtab' ? null : entry.url.startsWith('https://www.youtube-nocookie.com/embed/') ? entry.display : entry.url;

export function Brave() {
    const [state, setState] = useState(restoreTabs);
    const [address, setAddress] = useState('');
    const [editing, setEditing] = useState(false);
    const addressRef = useRef<HTMLInputElement>(null);
    const justFocused = useRef(false);

    const { tabs, active } = state;
    const tab = tabs.find(t => t.id === active) || tabs[0];
    const entry = tab.history[tab.index];

    // Persist each tab's current page
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: tabs.map(t => t.history[t.index]), active: tabs.findIndex(t => t.id === active) }));
        } catch { /* storage unavailable */ }
    }, [tabs, active]);

    const updateTab = useCallback((id: number, fn: (t: Tab) => Tab) => {
        setState(s => ({ ...s, tabs: s.tabs.map(t => t.id === id ? fn(t) : t) }));
    }, []);

    const navigate = useCallback((input: string, tabId?: number) => {
        const id = tabId ?? active;
        const planned = plan(input);
        setEditing(false);
        if (planned.kind !== 'check') {
            updateTab(id, t => ({ ...t, history: [...t.history.slice(0, t.index + 1), planned], index: t.index + 1 }));
            return;
        }
        const checking: Entry = { kind: 'checking', url: planned.url, display: planned.display };
        updateTab(id, t => ({ ...t, history: [...t.history.slice(0, t.index + 1), checking], index: t.index + 1 }));
        checkFraming(planned.url).then(({ embeddable, finalUrl }) => {
            const resolved: Entry = embeddable
                ? { kind: 'page', url: finalUrl, display: finalUrl }
                : { kind: 'blocked', url: finalUrl, display: finalUrl };
            // replace the "checking" entry if it's still there
            updateTab(id, t => ({ ...t, history: t.history.map(e => e === checking ? resolved : e) }));
        });
    }, [active, updateTab]);

    // The start page (same origin) asks us to navigate instead of navigating itself
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.origin !== window.location.origin || !e.data || e.data.type !== 'brave:navigate') return;
            navigate(String(e.data.input || ''));
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [navigate]);

    const go = (delta: number) => updateTab(tab.id, t => ({ ...t, index: Math.max(0, Math.min(t.history.length - 1, t.index + delta)) }));
    const reload = () => updateTab(tab.id, t => ({ ...t, reloadKey: t.reloadKey + 1 }));
    const openTab = () => {
        const t = newTab();
        setState(s => ({ tabs: [...s.tabs, t], active: t.id }));
        setTimeout(() => addressRef.current?.focus(), 0);
    };
    const closeTab = (id: number) => setState(s => {
        if (s.tabs.length === 1) { const t = newTab(); return { tabs: [t], active: t.id }; }
        const i = s.tabs.findIndex(t => t.id === id);
        const tabs = s.tabs.filter(t => t.id !== id);
        return { tabs, active: s.active === id ? tabs[Math.max(0, i - 1)].id : s.active };
    });
    const openExternally = () => { const url = realUrlOf(entry); if (url) window.open(url, '_blank', 'noopener'); };

    const shown = editing ? address : displayOf(entry);
    const secure = entry.kind !== 'newtab' && displayOf(entry).startsWith('https://');

    return (
        <div className="h-full w-full flex flex-col text-sm text-gray-200" style={{ background: '#2b2b30' }}>
            {/* Tab strip */}
            <div className="flex items-end gap-1 px-2 pt-1.5 overflow-x-auto windowMainScreen" style={{ background: '#1d1d21' }}>
                {tabs.map(t => {
                    const e = t.history[t.index];
                    const host = e.kind === 'newtab' ? null : hostOf(e.display);
                    const isActive = t.id === tab.id;
                    return (
                        <div
                            key={t.id}
                            onClick={() => setState(s => ({ ...s, active: t.id }))}
                            className={(isActive ? 'text-white ' : 'text-gray-400 hover:bg-white hover:bg-opacity-5 ') + 'group flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-t-lg cursor-default min-w-0'}
                            style={{ width: 200, maxWidth: 200, flexShrink: 1, background: isActive ? '#2b2b30' : undefined }}
                            title={titleOf(e)}
                        >
                            {host
                                ? <img src={`https://icons.duckduckgo.com/ip3/${host}.ico`} alt="" className="w-4 h-4 flex-shrink-0" onError={ev => { (ev.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                                : <img src="./themes/Yaru/apps/brave.png" alt="" className="w-4 h-4 flex-shrink-0" />}
                            <span className="truncate flex-grow">{titleOf(e)}</span>
                            <button type="button" aria-label="Close tab" onClick={ev => { ev.stopPropagation(); closeTab(t.id); }} className="w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:bg-white hover:bg-opacity-10 hover:text-white">×</button>
                        </div>
                    );
                })}
                <button type="button" aria-label="New tab" onClick={openTab} className="mb-1 w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-lg text-gray-300 hover:bg-white hover:bg-opacity-10">+</button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-2 py-1.5">
                <ToolButton label="Back" onClick={() => go(-1)} disabled={tab.index === 0}>←</ToolButton>
                <ToolButton label="Forward" onClick={() => go(1)} disabled={tab.index >= tab.history.length - 1}>→</ToolButton>
                <ToolButton label="Reload" onClick={reload}>⟳</ToolButton>
                <ToolButton label="Home" onClick={() => navigate('about:newtab')}>⌂</ToolButton>
                <form className="flex-grow flex items-center rounded-full px-3 py-1 mx-1" style={{ background: '#1d1d21' }} onSubmit={e => { e.preventDefault(); navigate(address); addressRef.current?.blur(); }}>
                    <span className="mr-2 text-xs" aria-hidden="true">{entry.kind === 'newtab' ? '🔍' : secure ? '🔒' : 'ⓘ'}</span>
                    <input
                        ref={addressRef}
                        id="brave-url-bar"
                        value={shown}
                        onFocus={e => {
                            // select synchronously (a delayed select would swallow the first typed characters)
                            setAddress(displayOf(entry));
                            setEditing(true);
                            e.target.select();
                            justFocused.current = true;
                        }}
                        onMouseUp={e => { if (justFocused.current) { e.preventDefault(); justFocused.current = false; } }}
                        onBlur={() => setEditing(false)}
                        onChange={e => setAddress(e.target.value)}
                        placeholder="Search the web or type a URL"
                        className="flex-grow min-w-0 bg-transparent outline-none text-gray-100 placeholder-gray-500"
                        spellCheck={false}
                        autoComplete="off"
                    />
                </form>
                <ToolButton label="Open in a new browser tab" onClick={openExternally} disabled={entry.kind === 'newtab'}>↗</ToolButton>
            </div>

            {/* Bookmarks */}
            <div className="flex items-center gap-1 px-2 pb-1.5 overflow-x-auto windowMainScreen text-xs border-b border-black border-opacity-40">
                {BOOKMARKS.map(b => (
                    <button key={b.label} type="button" onClick={() => navigate(b.input)} className="flex items-center gap-1.5 px-2 py-1 rounded whitespace-nowrap text-gray-300 hover:bg-white hover:bg-opacity-10">
                        <span>{b.icon}</span>{b.label}
                    </button>
                ))}
            </div>

            {/* Pages: every tab keeps its frame alive; only the active one is visible */}
            <div className="flex-grow relative bg-white">
                {tabs.map(t => {
                    const e = t.history[t.index];
                    const visible = t.id === tab.id;
                    return (
                        <div key={t.id} className="absolute inset-0" style={{ display: visible ? 'block' : 'none' }}>
                            {e.kind === 'newtab' && <iframe key={'n' + t.reloadKey} src={NEWTAB_URL} title="New Tab" id={visible ? 'brave-screen' : undefined} className="w-full h-full border-0" />}
                            {e.kind === 'page' && <iframe key={e.url + t.reloadKey} src={e.url} title={titleOf(e)} id={visible ? 'brave-screen' : undefined} className="w-full h-full border-0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" />}
                            {e.kind === 'checking' && <div className="w-full h-full flex items-center justify-center text-gray-500" style={{ background: '#f6f6f8' }}>Loading {hostOf(e.display)}…</div>}
                            {e.kind === 'blocked' && <BlockedPage entry={e} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
            className={(disabled ? 'opacity-30 cursor-default ' : 'hover:bg-white hover:bg-opacity-10 ') + 'w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-base'}>
            {children}
        </button>
    );
}

function BlockedPage({ entry }: { entry: Extract<Entry, { kind: 'blocked' }> }) {
    const host = hostOf(entry.display);
    return (
        <div className="w-full h-full flex items-center justify-center p-6" style={{ background: 'linear-gradient(160deg, #1b1438, #3b1d4a)' }}>
            <div className="max-w-md text-center text-gray-100">
                <img src={`https://icons.duckduckgo.com/ip3/${host}.ico`} alt="" className="w-12 h-12 mx-auto mb-4 rounded-lg bg-white p-1.5" onError={ev => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="text-lg font-bold mb-2">{host} can&apos;t be shown inside this window</div>
                <p className="text-sm text-gray-300 leading-relaxed mb-5">
                    {entry.note || `${host} tells browsers not to display it inside other websites, so it only works in a real browser tab.`}
                </p>
                <a href={entry.display} target="_blank" rel="noopener noreferrer" className="inline-block px-5 py-2 rounded-full font-bold text-white" style={{ background: '#fb542b' }}>
                    Open {host} in a new tab ↗
                </a>
            </div>
        </div>
    );
}

export default Brave;

export const displayBrave = () => {
    return <Brave />;
};
