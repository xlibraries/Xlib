import { describe, expect, it } from 'vitest';
import { contactError, mailtoLink, subjectOf } from '../../lib/contact';

const ok = { name: 'Asha', email: 'asha@example.com', subject: '', message: 'Hi!' };

describe('contactError', () => {
    it('accepts a complete message', () => expect(contactError(ok)).toBeNull());
    it('asks for each missing field in order', () => {
        expect(contactError({ ...ok, name: '  ' })).toMatch(/your name/);
        expect(contactError({ ...ok, email: '' })).toMatch(/your email/);
        expect(contactError({ ...ok, email: 'not-an-email' })).toMatch(/valid email/);
        expect(contactError({ ...ok, message: ' ' })).toMatch(/a message/);
    });
});

describe('mailtoLink', () => {
    it('builds an encoded mailto with a default subject', () => {
        const link = mailtoLink('me@example.com', { ...ok, message: 'Hi & bye' });
        expect(link.startsWith('mailto:me@example.com?subject=Portfolio%20inquiry&body=')).toBe(true);
        expect(decodeURIComponent(link.split('body=')[1])).toBe('From: Asha\nEmail: asha@example.com\n\nHi & bye');
    });
    it('keeps a given subject', () => expect(subjectOf('  Hello ')).toBe('Hello'));
});
