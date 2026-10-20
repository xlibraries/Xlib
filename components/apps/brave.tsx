import React, { useCallback, useEffect, useRef, useState } from 'react';

// A tabbed browser inside the desktop. Pages render in iframes, so sites that forbid framing can't load
// directly. Fallbacks, in order: YouTube videos -> embed player, GitHub repos -> github1s viewer,
// GitHub profiles -> built-in profile page, anything else -> reader view (/api/reader), and only if that
// fails a friendly page with an "open in a new tab" button. /api/frame-check decides what's framable.

type Entry =
    | { kind: 'newtab' }
    | { kind: 'checking'; url: string; display: string }
    | { kind: 'page'; url: string; display: string }
    | { kind: 'blocked'; url: string; display: string; note?: string }
    | { kind: 'reader'; url: string; display: string; article: Article }
    | { kind: 'github'; user: string; display: string };

type Article = { title: string; byline: string | null; siteName: string; content: string };

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

// GitHub can't be framed: repos open in github1s (a framable VS Code-style viewer), profiles in a built-in page
const GITHUB_RESERVED = new Set(['features', 'topics', 'orgs', 'settings', 'login', 'join', 'explore', 'marketplace', 'pricing', 'about',
    'sponsors', 'notifications', 'search', 'trending', 'collections', 'enterprise', 'team', 'new', 'organizations', 'apps', 'codespaces', 'readme']);
function githubRoute(url: URL): Entry | null {
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length || GITHUB_RESERVED.has(parts[0].toLowerCase())) return null;
    if (parts.length === 1) return { kind: 'github', user: parts[0], display: url.href };
    const [owner, repo, section, ...rest] = parts;
    const deep = section === 'tree' || section === 'blob' ? '/' + [section, ...rest].join('/') : '';
    return { kind: 'page', url: `https://github1s.com/${owner}/${repo}${deep}`, display: url.href };
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
    if (host === 'github.com') {
        const github = githubRoute(url);
        if (github) return github;
    }
    // Known to allow framing: skip the check
    if (host === 'github1s.com' || host === 'bing.com' || host.endsWith('wikipedia.org') || host === 'xlibraries.com' || host === 'youtube-nocookie.com') {
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

async function fetchReader(url: string): Promise<Article | null> {
    try {
        const res = await fetch('/api/reader?url=' + encodeURIComponent(url));
        const data = await res.json();
        return data.readable ? { title: data.title, byline: data.byline, siteName: data.siteName, content: data.content } : null;
    } catch {
        return null;
    }
}

// Framable -> page; otherwise reader view if the page has article content; otherwise the friendly blocked page
async function resolveUrl(url: string, display: string): Promise<Entry> {
    const { embeddable, finalUrl } = await checkFraming(url);
    if (embeddable) return { kind: 'page', url: finalUrl, display: finalUrl };
    const article = await fetchReader(finalUrl);
    return article ? { kind: 'reader', url: finalUrl, display, article } : { kind: 'blocked', url: finalUrl, display: finalUrl };
}

let nextTabId = 1;
const newTab = (entry: Entry = { kind: 'newtab' }): Tab => ({ id: nextTabId++, history: [entry], index: 0, reloadKey: 0 });

function restoreTabs(): { tabs: Tab[]; active: number } {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && Array.isArray(saved.entries) && saved.entries.length) {
            const tabs = saved.entries.map((e: Entry) => newTab(e));
            return { tabs, active: tabs[Math.min(saved.active || 0, tabs.length - 1)].id };
        }
    } catch { /* fall through */ }
    const tab = newTab();
    return { tabs: [tab], active: tab.id };
}

const titleOf = (entry: Entry) =>
    entry.kind === 'newtab' ? 'New Tab' :
        entry.kind === 'checking' ? 'Loading…' :
            entry.kind === 'reader' ? entry.article.title :
                entry.kind === 'github' ? `${entry.user} · GitHub` :
                    hostOf(entry.display);
const displayOf = (entry: Entry) => entry.kind === 'newtab' ? '' : entry.display;
// What "open in a new tab" opens: the original address, not our stand-in (embed, github1s, reader, profile)
const realUrlOf = (entry: Entry) => entry.kind === 'newtab' ? null : entry.display;

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
            const saved = tabs.map(t => {
                const e = t.history[t.index];
                return e.kind === 'reader' ? { kind: 'checking', url: e.display, display: e.display } : e;
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: saved, active: tabs.findIndex(t => t.id === active) }));
        } catch { /* storage unavailable */ }
    }, [tabs, active]);

    const updateTab = useCallback((id: number, fn: (t: Tab) => Tab) => {
        setState(s => ({ ...s, tabs: s.tabs.map(t => t.id === id ? fn(t) : t) }));
    }, []);

    // Resolve a "checking" entry in place (if it's still in the tab's history)
    const settle = useCallback((id: number, checking: Extract<Entry, { kind: 'checking' }>) => {
        resolveUrl(checking.url, checking.display).then(resolved => {
            updateTab(id, t => ({ ...t, history: t.history.map(e => e === checking ? resolved : e) }));
        });
    }, [updateTab]);

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
        settle(id, checking);
    }, [active, updateTab, settle]);


    // Tabs restored with an unresolved page (e.g. a reader view) get resolved once after opening
    const restored = useRef(false);
    useEffect(() => {
        if (restored.current) return;
        restored.current = true;
        tabs.forEach(t => { const e = t.history[t.index]; if (e.kind === 'checking') settle(t.id, e); });
    }, [tabs, settle]);

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
                            {e.kind === 'reader' && <ReaderPage entry={e} onNavigate={navigate} />}
                            {e.kind === 'github' && <GitHubProfile key={e.user} user={e.user} display={e.display} onNavigate={navigate} />}
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

function ReaderPage({ entry, onNavigate }: { entry: Extract<Entry, { kind: 'reader' }>; onNavigate: (input: string) => void }) {
    const { article } = entry;
    // Links inside the article navigate this tab instead of leaving the desktop
    const onClick = (e: React.MouseEvent) => {
        const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
        if (link && link.href) { e.preventDefault(); onNavigate(link.href); }
    };
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen" style={{ background: '#fbf8f3', color: '#1f2328' }}>
            <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 text-xs" style={{ background: '#efe6d8', color: '#5a4a32' }}>
                <span>📖 Reader view · {hostOf(entry.display)} doesn&apos;t allow being shown inside other websites, so here&apos;s its text.</span>
                <a href={entry.display} target="_blank" rel="noopener noreferrer" className="ml-auto whitespace-nowrap font-bold underline">Open original ↗</a>
            </div>
            <article className="max-w-2xl mx-auto px-5 py-8">
                <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8a7a62' }}>{article.siteName}</div>
                <h1 className="text-3xl font-bold leading-tight mb-2" style={{ fontFamily: 'Georgia, serif' }}>{article.title}</h1>
                {article.byline && <div className="text-sm mb-6" style={{ color: '#6b6b6b' }}>{article.byline}</div>}
                <div className="side-quests-reader" onClick={onClick} dangerouslySetInnerHTML={{ __html: article.content }} />
            </article>
            <style>{`
                .side-quests-reader { font-family: Georgia, serif; font-size: 17px; line-height: 1.7; }
                .side-quests-reader p, .side-quests-reader ul, .side-quests-reader ol, .side-quests-reader pre, .side-quests-reader blockquote, .side-quests-reader figure, .side-quests-reader table { margin: 0 0 1em; }
                .side-quests-reader h1, .side-quests-reader h2, .side-quests-reader h3 { font-weight: 700; line-height: 1.3; margin: 1.4em 0 .5em; }
                .side-quests-reader h2 { font-size: 1.4em; } .side-quests-reader h3 { font-size: 1.2em; }
                .side-quests-reader ul { list-style: disc; padding-left: 1.4em; } .side-quests-reader ol { list-style: decimal; padding-left: 1.4em; }
                .side-quests-reader a { color: #0b62c4; text-decoration: underline; }
                .side-quests-reader img { max-width: 100%; height: auto; border-radius: 6px; margin: .5em 0; }
                .side-quests-reader blockquote { border-left: 3px solid #d8c9b1; padding-left: 1em; color: #555; }
                .side-quests-reader pre { background: #f0ebe2; padding: .8em; border-radius: 6px; overflow-x: auto; font-size: .85em; }
                .side-quests-reader table { border-collapse: collapse; font-size: .9em; } .side-quests-reader td, .side-quests-reader th { border: 1px solid #e2d8c8; padding: .3em .5em; }
            `}</style>
        </div>
    );
}

type GitHubUser = { login: string; name: string | null; avatar_url: string; bio: string | null; location: string | null; blog: string | null; followers: number; following: number; public_repos: number; html_url: string };
type GitHubRepo = { name: string; description: string | null; language: string | null; stargazers_count: number; forks_count: number; fork: boolean; pushed_at: string; html_url: string };

function GitHubProfile({ user, display, onNavigate }: { user: string; display: string; onNavigate: (input: string) => void }) {
    const [profile, setProfile] = useState<GitHubUser | null>(null);
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showForks, setShowForks] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const get = (path: string) => fetch('https://api.github.com' + path, { headers: { accept: 'application/vnd.github+json' } }).then(r => {
            if (r.status === 404) throw new Error('No GitHub user called ' + user + '.');
            if (r.status === 403) throw new Error('GitHub\'s hourly limit for this network was reached. Try again later.');
            if (!r.ok) throw new Error('GitHub returned ' + r.status + '.');
            return r.json();
        });
        Promise.all([get('/users/' + user), get('/users/' + user + '/repos?per_page=100&sort=pushed')])
            .then(([u, r]) => { if (!cancelled) { setProfile(u); setRepos(r); } })
            .catch(err => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [user]);

    if (error) return <BlockedPage entry={{ kind: 'blocked', url: display, display, note: error }} />;
    if (!profile) return <div className="w-full h-full flex items-center justify-center text-gray-500" style={{ background: '#0d1117' }}>Loading {user}…</div>;

    const shown = repos.filter(r => showForks || !r.fork);
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen" style={{ background: '#0d1117', color: '#e6edf3' }}>
            <div className="max-w-4xl mx-auto px-5 py-6 flex flex-col md:flex-row gap-6">
                <div className="md:w-64 flex-shrink-0">
                    <img src={profile.avatar_url} alt="" className="w-40 h-40 md:w-56 md:h-56 rounded-full border" style={{ borderColor: '#30363d' }} />
                    <div className="text-2xl font-bold mt-3">{profile.name || profile.login}</div>
                    <div className="text-lg" style={{ color: '#8b949e' }}>{profile.login}</div>
                    {profile.bio && <div className="mt-3 text-sm">{profile.bio}</div>}
                    <div className="mt-3 text-sm" style={{ color: '#8b949e' }}>
                        <b style={{ color: '#e6edf3' }}>{profile.followers}</b> followers · <b style={{ color: '#e6edf3' }}>{profile.following}</b> following
                    </div>
                    {profile.location && <div className="mt-2 text-sm">📍 {profile.location}</div>}
                    {profile.blog && <button type="button" onClick={() => onNavigate(profile.blog!)} className="mt-1 text-sm underline text-left" style={{ color: '#58a6ff' }}>🔗 {profile.blog.replace(/^https?:\/\//, '')}</button>}
                    <a href={profile.html_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs px-3 py-1.5 rounded-md border" style={{ borderColor: '#30363d', color: '#c9d1d9' }}>Open on github.com ↗</a>
                </div>
                <div className="flex-grow min-w-0">
                    <div className="flex items-center justify-between mb-3">
                        <div className="font-bold">Repositories <span className="ml-1 px-2 rounded-full text-xs" style={{ background: '#30363d' }}>{profile.public_repos}</span></div>
                        <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: '#8b949e' }}>
                            <input type="checkbox" checked={showForks} onChange={e => setShowForks(e.target.checked)} /> Show forks
                        </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {shown.map(r => (
                            <button key={r.name} type="button" onClick={() => onNavigate(r.html_url)} className="text-left rounded-md border p-3 hover:border-gray-500" style={{ borderColor: '#30363d' }}>
                                <div className="font-bold truncate" style={{ color: '#58a6ff' }}>{r.name}{r.fork && <span className="ml-2 text-xs font-normal" style={{ color: '#8b949e' }}>fork</span>}</div>
                                <div className="text-xs mt-1 h-8 overflow-hidden" style={{ color: '#8b949e' }}>{r.description || 'No description'}</div>
                                <div className="text-xs mt-2 flex gap-3" style={{ color: '#8b949e' }}>
                                    {r.language && <span>● {r.language}</span>}
                                    {r.stargazers_count > 0 && <span>★ {r.stargazers_count}</span>}
                                    <span>Updated {new Date(r.pushed_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
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
