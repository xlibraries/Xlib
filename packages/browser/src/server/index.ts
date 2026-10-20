// Server side of the browser app, independent of any framework: each function takes the raw `url` query
// value and returns the status, JSON body and cache header to send. Wire them to two GET endpoints (see
// the README for a Next.js example). Every fetch goes through safeFetch: public http(s) only, private
// addresses refused, redirects re-checked, time and size limits.
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { framePolicy } from './frame-policy';
import { assertPublicHttpUrl, safeFetch } from './safe-fetch';

export { assertPublicHttpUrl, safeFetch } from './safe-fetch';
export { framePolicy, type FramePolicy } from './frame-policy';

export interface EndpointResult {
    status: number;
    body: Record<string, unknown>;
    cacheControl?: string;
}

const FRAME_TIMEOUT_MS = 6000;
const READER_TIMEOUT_MS = 8000;
const MAX_BYTES = 3 * 1024 * 1024;
const MIN_TEXT_LENGTH = 200;

/** Can this URL be shown in a frame on `embedderOrigin`? Only reads response headers. */
export async function checkFrame(rawUrl: string, { embedderOrigin }: { embedderOrigin: string }): Promise<EndpointResult> {
    let url: URL;
    try {
        url = await assertPublicHttpUrl(rawUrl);
    } catch (err) {
        return { status: 400, body: { error: (err as Error).message || 'invalid url' } };
    }
    try {
        const { response, url: finalUrl } = await safeFetch(url, FRAME_TIMEOUT_MS);
        response.body?.cancel().catch(() => { });   // headers are all we need
        return {
            status: 200,
            body: { ...framePolicy(response.headers, embedderOrigin), finalUrl: finalUrl.href },
            cacheControl: 'public, s-maxage=86400, stale-while-revalidate=604800',
        };
    } catch (err) {
        // Unreachable or timed out: let the browser try and show its own error
        return { status: 200, body: { embeddable: true, reason: 'unchecked: ' + ((err as Error).message || 'error'), finalUrl: url.href } };
    }
}

async function readBody(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { reader.cancel().catch(() => { }); throw new Error('page too large'); }
        chunks.push(value);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

const absolute = (value: string, base: URL) => { try { const u = new URL(value, base); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };

/**
 * Reader view: fetch the page and return just its main content (Mozilla Readability), sanitized so no
 * third-party script or style can run on the embedding site.
 */
export async function readArticle(rawUrl: string): Promise<EndpointResult> {
    let url: URL;
    try {
        url = await assertPublicHttpUrl(rawUrl);
    } catch (err) {
        return { status: 400, body: { error: (err as Error).message || 'invalid url' } };
    }

    try {
        const { response, url: finalUrl } = await safeFetch(url, READER_TIMEOUT_MS);
        const type = response.headers.get('content-type') || '';
        if (!response.ok || !type.includes('html')) {
            response.body?.cancel().catch(() => { });
            return { status: 200, body: { readable: false, reason: response.ok ? 'not an html page' : `status ${response.status}` } };
        }
        const html = await readBody(response);
        const { document } = parseHTML(html);
        const article = new Readability(document as unknown as Document).parse();
        if (!article || (article.textContent || '').trim().length < MIN_TEXT_LENGTH) {
            return { status: 200, body: { readable: false, reason: 'no article content' } };
        }

        const content = sanitizeHtml(article.content || '', {
            allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
                'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'hr', 'table', 'thead',
                'tbody', 'tr', 'th', 'td', 'span', 'div', 'section', 'article', 'picture', 'source', 'small', 'mark'],
            allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'], source: ['srcset', 'type'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'] },
            allowedSchemes: ['http', 'https'],
            transformTags: {
                a: (tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, href: absolute(attribs.href || '', finalUrl) } }),
                img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, src: absolute(attribs.src || '', finalUrl), loading: 'lazy' } }),
                source: (tag, attribs) => ({ tagName: 'source', attribs: { ...attribs, srcset: (attribs.srcset || '').split(',').map(s => { const [u, d] = s.trim().split(/\s+/); return [absolute(u || '', finalUrl), d].filter(Boolean).join(' '); }).join(', ') } }),
            },
        });

        return {
            status: 200,
            body: {
                readable: true,
                url: finalUrl.href,
                title: article.title || finalUrl.hostname,
                byline: article.byline || null,
                siteName: article.siteName || finalUrl.hostname.replace(/^www\./, ''),
                content,
            },
            cacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400',
        };
    } catch (err) {
        return { status: 200, body: { readable: false, reason: (err as Error).message || 'fetch failed' } };
    }
}
