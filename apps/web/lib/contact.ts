// The Contact Me form's rules: what makes a message sendable, and the mailto: fallback when EmailJS isn't set up.

export interface ContactMessage { name: string; email: string; subject: string; message: string }

/** The first problem with the message, or null if it can be sent. Fields are trimmed first. */
export function contactError({ name, email, message }: ContactMessage): string | null {
    if (!name.trim()) return 'Please add your name so I know who the message is from.';
    if (!email.trim()) return 'Please add your email so I can reply.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email address.';
    if (!message.trim()) return 'Please add a message before sending.';
    return null;
}

export const subjectOf = (subject: string) => subject.trim() || 'Portfolio inquiry';

export function mailtoLink(to: string, { name, email, subject, message }: ContactMessage): string {
    const body = `From: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`;
    return `mailto:${to}?subject=${encodeURIComponent(subjectOf(subject))}&body=${encodeURIComponent(body)}`;
}
