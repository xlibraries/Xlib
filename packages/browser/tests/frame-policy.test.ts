import { describe, expect, it } from 'vitest';
import { framePolicy } from '../src/server/frame-policy';

const headers = (h: Record<string, string>) => new Headers(h);
const ORIGIN = 'https://xlibraries.com';

describe('framePolicy', () => {
    it('allows pages without framing headers', () => expect(framePolicy(headers({}), ORIGIN)).toEqual({ embeddable: true }));
    it.each(['DENY', 'SAMEORIGIN', 'ALLOW-FROM https://x.com'])('blocks X-Frame-Options %s', v => {
        expect(framePolicy(headers({ 'x-frame-options': v }), ORIGIN).embeddable).toBe(false);
    });
    it('blocks frame-ancestors none/self', () => {
        expect(framePolicy(headers({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }), ORIGIN).embeddable).toBe(false);
        expect(framePolicy(headers({ 'content-security-policy': "frame-ancestors 'self'" }), ORIGIN).embeddable).toBe(false);
    });
    it('allows frame-ancestors that include us, a wildcard or *', () => {
        expect(framePolicy(headers({ 'content-security-policy': 'frame-ancestors https://xlibraries.com' }), ORIGIN).embeddable).toBe(true);
        expect(framePolicy(headers({ 'content-security-policy': 'frame-ancestors *.xlibraries.com' }), 'https://www.xlibraries.com').embeddable).toBe(true);
        expect(framePolicy(headers({ 'content-security-policy': 'frame-ancestors *' }), ORIGIN).embeddable).toBe(true);
    });
    it('lets frame-ancestors override X-Frame-Options', () => {
        expect(framePolicy(headers({ 'x-frame-options': 'DENY', 'content-security-policy': 'frame-ancestors *' }), ORIGIN).embeddable).toBe(true);
    });
});
