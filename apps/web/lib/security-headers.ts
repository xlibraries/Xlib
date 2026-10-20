// Security headers for every response (applied in next.config.ts).
//
// Scripts are locked to our own origin plus the YouTube player API (Music). Analytics are our own
// (@xlibraries/analytics → /api/track), so no analytics scripts load from elsewhere. Libraries that
// used to come from CDNs (Leaflet, pdf.js, the India boundary data, the Ubuntu font) are served from this
// site, see scripts/vendor.mjs and pages/_app.tsx. There are no inline scripts: the static pages in public/
// load theirs from files.
//
// Some sources stay open to any https origin on purpose:
// - connect-src: Music finds Invidious instances at runtime, Photo Drop uploads to the URL Google hands out
// - img-src / media-src: thumbnails, map tiles, favicons and reader-view images from arbitrary sites
// - frame-src: the Brave app shows arbitrary websites in a frame

const SCRIPT_HOSTS = [
    'https://www.youtube.com',
    'https://s.ytimg.com',
];

export function contentSecurityPolicy({ dev = false } = {}): string {
    const directives: Record<string, string[]> = {
        'default-src': ["'self'"],
        // Next's dev server needs eval (fast refresh) and inline scripts; production needs neither
        'script-src': ["'self'", ...SCRIPT_HOSTS, ...(dev ? ["'unsafe-eval'", "'unsafe-inline'"] : [])],
        // React style={…} props and styled-jsx are inline styles
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'https:', ...(dev ? ['ws:'] : [])],
        'media-src': ["'self'", 'blob:', 'https:'],
        'frame-src': ["'self'", 'https:'],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'self'"],
    };
    return Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

export function securityHeaders({ dev = false } = {}): { key: string; value: string }[] {
    return [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy({ dev }) },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        // Not in dev: Next's dev server serves _clientMiddlewareManifest.js as JSON, which nosniff refuses to run
        ...(dev ? [] : [{ key: 'X-Content-Type-Options', value: 'nosniff' }]),
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
        // Lets window.open() tabs (new-tab links, search engines) keep working while cutting the opener link
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    ];
}
