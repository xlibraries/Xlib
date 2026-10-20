import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '../../lib/security-headers';

const directive = (policy: string, name: string) =>
    policy.split('; ').find(d => d.startsWith(name + ' '))?.split(' ').slice(1) ?? [];

describe('contentSecurityPolicy', () => {
    const prod = contentSecurityPolicy();

    it('only runs scripts from this site and the known third parties', () => {
        expect(directive(prod, 'script-src')).toEqual(["'self'", 'https://www.youtube.com', 'https://s.ytimg.com']);
    });

    it('allows no inline scripts or eval in production', () => {
        expect(directive(prod, 'script-src').join(' ')).not.toMatch(/unsafe/);
    });

    it('no longer allows the old CDNs anywhere', () => {
        expect(prod).not.toMatch(/unpkg|jsdelivr|fonts\.googleapis|fonts\.gstatic/);
        expect(directive(prod, 'font-src')).toEqual(["'self'", 'data:']);
    });

    it('blocks plugins, base-tag hijacking and framing by other sites', () => {
        expect(directive(prod, 'object-src')).toEqual(["'none'"]);
        expect(directive(prod, 'base-uri')).toEqual(["'self'"]);
        expect(directive(prod, 'frame-ancestors')).toEqual(["'self'"]);
    });

    it('relaxes scripts and websockets only for the dev server', () => {
        const dev = contentSecurityPolicy({ dev: true });
        expect(directive(dev, 'script-src')).toEqual(expect.arrayContaining(["'unsafe-eval'", "'unsafe-inline'"]));
        expect(directive(dev, 'connect-src')).toContain('ws:');
        expect(directive(prod, 'connect-src')).not.toContain('ws:');
    });
});

describe('securityHeaders', () => {
    it('sends the policy plus the standard hardening headers', () => {
        const headers = Object.fromEntries(securityHeaders().map(h => [h.key, h.value]));
        expect(headers['Content-Security-Policy']).toBe(contentSecurityPolicy());
        expect(headers['X-Content-Type-Options']).toBe('nosniff');
        expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
        expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d+/);
        expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
        expect(headers['Permissions-Policy']).toContain('camera=()');
    });

    it('leaves nosniff out for the dev server only', () => {
        expect(securityHeaders({ dev: true }).map(h => h.key)).not.toContain('X-Content-Type-Options');
        expect(securityHeaders().map(h => h.key)).toContain('X-Content-Type-Options');
    });
});
