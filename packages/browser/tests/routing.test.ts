import { describe, expect, it } from 'vitest';
import { githubRoute, hostOf, looksLikeUrl, plan, searchUrl, youtubeEmbed } from '../src/routing';

describe('looksLikeUrl', () => {
    it.each(['xlibraries.com', 'https://github.com/x', 'en.wikipedia.org/wiki/Kedarnath', 'localhost:3000', 'a.b.co/path?q=1'])('treats %s as a URL', s => {
        expect(looksLikeUrl(s)).toBe(true);
    });
    it.each(['aman agrawal', 'kedarnath', 'what is 2+2', ''])('treats %s as a search', s => {
        expect(looksLikeUrl(s)).toBe(false);
    });
});

describe('helpers', () => {
    it('builds Bing search URLs', () => expect(searchUrl('a b&c')).toBe('https://www.bing.com/search?q=a%20b%26c'));
    it('strips www from hosts and tolerates junk', () => {
        expect(hostOf('https://www.example.com/x')).toBe('example.com');
        expect(hostOf('not a url')).toBe('not a url');
    });
});

describe('youtubeEmbed', () => {
    const embed = (u: string) => youtubeEmbed(new URL(u));
    it('rewrites watch, short and shorts links', () => {
        expect(embed('https://www.youtube.com/watch?v=aaHlegqIIik')).toBe('https://www.youtube-nocookie.com/embed/aaHlegqIIik?rel=0');
        expect(embed('https://youtu.be/aaHlegqIIik')).toBe('https://www.youtube-nocookie.com/embed/aaHlegqIIik?rel=0');
        expect(embed('https://m.youtube.com/shorts/abcdef123')).toBe('https://www.youtube-nocookie.com/embed/abcdef123?rel=0');
    });
    it('returns null for non-video pages and bad ids', () => {
        expect(embed('https://www.youtube.com/')).toBeNull();
        expect(embed('https://www.youtube.com/watch?v=<x>')).toBeNull();
        expect(embed('https://example.com/watch?v=aaHlegqIIik')).toBeNull();
    });
});

describe('githubRoute', () => {
    const route = (u: string) => githubRoute(new URL(u));
    it('sends profiles to the built-in page', () => {
        expect(route('https://github.com/xlibraries')).toEqual({ kind: 'github', user: 'xlibraries', display: 'https://github.com/xlibraries' });
    });
    it('sends repos (and file paths) to github1s', () => {
        expect(route('https://github.com/xlibraries/Xlib')).toMatchObject({ kind: 'page', url: 'https://github1s.com/xlibraries/Xlib' });
        expect(route('https://github.com/a/b/blob/main/README.md')).toMatchObject({ url: 'https://github1s.com/a/b/blob/main/README.md' });
        expect(route('https://github.com/a/b/issues/3')).toMatchObject({ url: 'https://github1s.com/a/b' });
    });
    it('leaves reserved paths and the homepage alone', () => {
        expect(route('https://github.com/')).toBeNull();
        expect(route('https://github.com/features')).toBeNull();
        expect(route('https://github.com/settings/profile')).toBeNull();
    });
});

describe('plan', () => {
    it('opens a new tab for empty input', () => expect(plan('  ')).toEqual({ kind: 'newtab' }));
    it('searches for plain words', () => expect(plan('kedarnath trek')).toEqual({ kind: 'page', url: searchUrl('kedarnath trek'), display: 'kedarnath trek' }));
    it('adds https:// and checks unknown sites', () => expect(plan('example.org/a')).toEqual({ kind: 'check', url: 'https://example.org/a', display: 'https://example.org/a' }));
    it('skips the check for sites known to allow framing', () => {
        expect(plan('en.wikipedia.org/wiki/X')).toMatchObject({ kind: 'page' });
    });
    it('trusts the hosts the site passes in', () => {
        expect(plan('xlibraries.com')).toMatchObject({ kind: 'check' });
        expect(plan('xlibraries.com', ['xlibraries.com'])).toMatchObject({ kind: 'page', url: 'https://xlibraries.com/' });
    });
    it('explains why YouTube home and Google can\'t load', () => {
        expect(plan('youtube.com')).toMatchObject({ kind: 'blocked', note: expect.stringContaining('video') });
        expect(plan('google.com/search?q=x')).toMatchObject({ kind: 'blocked', note: expect.stringContaining('captcha') });
    });
    it('routes YouTube videos and GitHub', () => {
        expect(plan('https://youtu.be/aaHlegqIIik')).toMatchObject({ kind: 'page', url: expect.stringContaining('youtube-nocookie.com/embed/') });
        expect(plan('github.com/xlibraries')).toMatchObject({ kind: 'github' });
    });
});
