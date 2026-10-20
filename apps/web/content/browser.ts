// The Brave app on this site: its new-tab page, bookmarks and trusted hosts. The browser itself is the
// @xlibraries/browser package; its server endpoints are pages/api/frame-check.ts and reader.ts.
import type { BrowserConfig } from '@xlibraries/browser';

export const browser: BrowserConfig = {
    newTabUrl: './brave/newtab.html',
    trustedHosts: ['xlibraries.com'],
    bookmarks: [
        { label: 'xlibraries.com', icon: '🖥️', input: 'https://xlibraries.com/' },
        { label: 'Wikipedia', icon: '📚', input: 'https://en.wikipedia.org/wiki/Main_Page' },
        { label: 'Debugging Love', icon: '🎵', input: 'https://www.youtube.com/watch?v=aaHlegqIIik' },
        { label: 'GitHub', icon: '🐙', input: 'https://github.com/xlibraries' },
        { label: 'Bing', icon: '🔎', input: 'https://www.bing.com/' },
    ],
};
