import type { NextApiRequest, NextApiResponse } from 'next';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { assertPublicHttpUrl, safeFetch } from '../../lib/safe-fetch';

// Reader view for the Brave app: for sites that refuse to be framed, fetch the page and return just its
// main content (Mozilla Readability), sanitized so no third-party script or style ever runs on this site.

const TIMEOUT_MS = 8000;
const MAX_BYTES = 3 * 1024 * 1024;
const MIN_TEXT_LENGTH = 200;

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const raw = typeof req.query.url === 'string' ? req.query.url : '';
    let url: URL;
    try {
        url = await assertPublicHttpUrl(raw);
    } catch (err) {
        return res.status(400).json({ error: (err as Error).message || 'invalid url' });
    }

    try {
        const { response, url: finalUrl } = await safeFetch(url, TIMEOUT_MS);
        const type = response.headers.get('content-type') || '';
        if (!response.ok || !type.includes('html')) {
            response.body?.cancel().catch(() => { });
            return res.status(200).json({ readable: false, reason: response.ok ? 'not an html page' : `status ${response.status}` });
        }
        const html = await readBody(response);
        const { document } = parseHTML(html);
        const article = new Readability(document as unknown as Document).parse();
        if (!article || (article.textContent || '').trim().length < MIN_TEXT_LENGTH) {
            return res.status(200).json({ readable: false, reason: 'no article content' });
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

        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return res.status(200).json({
            readable: true,
            url: finalUrl.href,
            title: article.title || finalUrl.hostname,
            byline: article.byline || null,
            siteName: article.siteName || finalUrl.hostname.replace(/^www\./, ''),
            content,
        });
    } catch (err) {
        return res.status(200).json({ readable: false, reason: (err as Error).message || 'fetch failed' });
    }
}
