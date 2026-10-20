// Decides whether a page may be shown inside an <iframe> on this site, from its response headers.
// Sites opt out with X-Frame-Options (DENY / SAMEORIGIN) or a CSP frame-ancestors directive.

export type FramePolicy = { embeddable: boolean; reason?: string };

export function framePolicy(headers: { get(name: string): string | null }, embedderOrigin: string): FramePolicy {
    const xfo = (headers.get('x-frame-options') || '').trim().toLowerCase();
    const csp = headers.get('content-security-policy') || '';
    const ancestors = csp.split(';').map(d => d.trim()).find(d => d.toLowerCase().startsWith('frame-ancestors'));

    // CSP frame-ancestors takes precedence over X-Frame-Options when both are present
    if (ancestors) {
        const sources = ancestors.split(/\s+/).slice(1).map(s => s.toLowerCase());
        if (sources.includes("'none'")) return { embeddable: false, reason: 'frame-ancestors none' };
        const allowed = sources.some(s =>
            s === '*' ||
            s === embedderOrigin.toLowerCase() ||
            (s.startsWith('*.') && new URL(embedderOrigin).hostname.endsWith(s.slice(1))) ||
            s === 'https:'
        );
        return allowed ? { embeddable: true } : { embeddable: false, reason: `frame-ancestors ${sources.join(' ')}` };
    }
    if (xfo === 'deny' || xfo === 'sameorigin' || xfo.startsWith('allow-from')) {
        return { embeddable: false, reason: `x-frame-options ${xfo}` };
    }
    return { embeddable: true };
}
