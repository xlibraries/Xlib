// URL handling for the Brave app (components/apps/brave.tsx): what an address-bar input turns into.

export type Entry =
    | { kind: 'newtab' }
    | { kind: 'checking'; url: string; display: string }
    | { kind: 'page'; url: string; display: string }
    | { kind: 'blocked'; url: string; display: string; note?: string }
    | { kind: 'reader'; url: string; display: string; article: Article }
    | { kind: 'github'; user: string; display: string };

export type Article = { title: string; byline: string | null; siteName: string; content: string };

export const looksLikeUrl = (text: string) => /^(https?:\/\/)?(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(text);
export const searchUrl = (query: string) => 'https://www.bing.com/search?q=' + encodeURIComponent(query);
export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// YouTube pages can't be framed, but its embed player can
export function youtubeEmbed(url: URL): string | null {
    const host = url.hostname.replace(/^(www\.|m\.)/, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (host === 'youtube.com' && url.pathname === '/watch') id = url.searchParams.get('v');
    else if (host === 'youtube.com' && /^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

// GitHub can't be framed: repos open in github1s (a framable VS Code-style viewer), profiles in a built-in page
export const GITHUB_RESERVED = new Set(['features', 'topics', 'orgs', 'settings', 'login', 'join', 'explore', 'marketplace', 'pricing', 'about',
    'sponsors', 'notifications', 'search', 'trending', 'collections', 'enterprise', 'team', 'new', 'organizations', 'apps', 'codespaces', 'readme']);
export function githubRoute(url: URL): Entry | null {
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length || GITHUB_RESERVED.has(parts[0].toLowerCase())) return null;
    if (parts.length === 1) return { kind: 'github', user: parts[0], display: url.href };
    const [owner, repo, section, ...rest] = parts;
    const deep = section === 'tree' || section === 'blob' ? '/' + [section, ...rest].join('/') : '';
    return { kind: 'page', url: `https://github1s.com/${owner}/${repo}${deep}`, display: url.href };
}

// Turn what the user typed into the entry to show (without the network check)
export function plan(input: string): Entry | { kind: 'check'; url: string; display: string } {
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
