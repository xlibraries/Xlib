import React, { useState, type ChangeEvent } from 'react';
import emailjs from '@emailjs/browser';
import type { AppProps } from '@xlibraries/app-sdk';
import { contactError, mailtoLink, subjectOf, type ContactMessage } from '../../lib/contact';

const CONTACT_EMAIL = 'aman9893089064@gmail.com';

const EMAILJS = {
    publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
    serviceID: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
    templateID: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
};
const emailjsReady = !!(EMAILJS.publicKey && EMAILJS.serviceID && EMAILJS.templateID);
if (emailjsReady && typeof window !== 'undefined') emailjs.init(EMAILJS.publicKey!);

const EMPTY: ContactMessage = { name: '', email: '', subject: '', message: '' };

export default function Gedit({ host }: AppProps) {
    const [form, setForm] = useState<ContactMessage>(EMPTY);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState(emailjsReady ? '' : 'EmailJS is not configured yet. The form will open your email app instead.');

    const change = (field: keyof ContactMessage) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [field]: e.target.value });
        setError('');
    };

    const sendMessage = async () => {
        const problem = contactError(form);
        if (problem) return setError(problem);

        host.track({ category: 'Send Message', action: emailjsReady ? 'Submitted contact form' : 'Opened email fallback' });

        if (!emailjsReady) {
            window.location.href = mailtoLink(CONTACT_EMAIL, form);
            setError('');
            setNotice('Opening your email app so you can send this directly.');
            return;
        }

        setSending(true);
        setError('');
        setNotice('');
        try {
            await emailjs.send(EMAILJS.serviceID!, EMAILJS.templateID!, {
                from_name: form.name.trim(),
                from_email: form.email.trim(),
                subject: subjectOf(form.subject),
                message: form.message.trim(),
                reply_to: form.email.trim(),
            }, EMAILJS.publicKey);
            setSending(false);
            setForm(EMPTY);
            setNotice('Message sent successfully.');
            setTimeout(() => host.close(), 1200);
        } catch (err) {
            console.error('Failed to send email:', err);
            setSending(false);
            setError('Failed to send message. Please try again.');
        }
    };

    const status = (error || notice) ? (
        <div className={`mx-2 mt-2 border rounded px-3 py-2 text-xs md:text-sm ${error
            ? 'border-red-400 text-red-200 bg-red-900 bg-opacity-20'
            : 'border-emerald-400 text-emerald-200 bg-emerald-900 bg-opacity-20'}`}>
            {error || notice}
        </div>
    ) : null;

    const sendButtonLabel = sending ? 'Sending...' : (emailjsReady ? 'Send' : 'Open Email App');

    return (
            <div className="w-full h-full relative flex flex-col bg-ub-cool-grey text-white select-none">
                <div className="flex items-center justify-between w-full bg-ub-gedit-light bg-opacity-60 border-b border-t border-blue-400 text-sm">
                    <span className="font-bold ml-2">Send a Message to Me</span>
                    <div className="flex">
                        <button
                            type="button"
                            onClick={sendMessage}
                            disabled={sending}
                            className="border border-black bg-black bg-opacity-50 px-3 py-0.5 my-1 mx-1 rounded hover:bg-opacity-80 disabled:opacity-50"
                        >
                            {sendButtonLabel}
                        </button>
                    </div>
                </div>

                {status}

                <div className="relative flex-grow flex flex-col bg-ub-gedit-dark font-normal windowMainScreen mt-2">
                    <div className="absolute left-0 top-0 h-full px-2 bg-ub-gedit-darker"></div>

                    <div className="relative">
                        <input
                            id="sender-name"
                            value={form.name}
                            onChange={change('name')}
                            className="w-full text-ubt-gedit-orange focus:bg-ub-gedit-light outline-none font-medium text-sm pl-6 py-0.5 bg-transparent"
                            placeholder="Your name"
                            spellCheck={false}
                            autoComplete="off"
                            type="text"
                        />
                        <span className="absolute left-1 top-1/2 transform -translate-y-1/2 font-bold text-sm text-ubt-gedit-blue">1</span>
                    </div>

                    <div className="relative">
                        <input
                            id="sender-email"
                            value={form.email}
                            onChange={change('email')}
                            className="w-full my-1 text-ubt-gedit-orange focus:bg-ub-gedit-light outline-none text-sm font-normal pl-6 py-0.5 bg-transparent"
                            placeholder="Your email"
                            spellCheck={false}
                            autoComplete="off"
                            type="email"
                        />
                        <span className="absolute left-1 top-1/2 transform -translate-y-1/2 font-bold text-sm text-ubt-gedit-blue">2</span>
                    </div>

                    <div className="relative">
                        <input
                            id="sender-subject"
                            value={form.subject}
                            onChange={change('subject')}
                            className="w-full my-1 text-ubt-gedit-blue focus:bg-ub-gedit-light gedit-subject outline-none text-sm font-normal pl-6 py-0.5 bg-transparent"
                            placeholder="Subject"
                            spellCheck={false}
                            autoComplete="off"
                            type="text"
                        />
                        <span className="absolute left-1 top-1/2 transform -translate-y-1/2 font-bold text-sm text-ubt-gedit-blue">3</span>
                    </div>

                    <div className="relative flex-grow">
                        <textarea
                            id="sender-message"
                            value={form.message}
                            onChange={change('message')}
                            className="w-full gedit-message font-light text-sm resize-none h-full windowMainScreen outline-none tracking-wider pl-6 py-1 bg-transparent"
                            placeholder="Message"
                            spellCheck={false}
                            autoComplete="off"
                        />
                        <span className="absolute left-1 top-1 font-bold text-sm text-ubt-gedit-blue">4</span>
                    </div>
                </div>

                <div className="px-3 py-2 text-xs text-gray-300 border-t border-white border-opacity-10">
                    Messages go to <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
                </div>

                {
                    sending
                        ? (
                            <div className="flex justify-center items-center animate-pulse h-full w-full bg-gray-400 bg-opacity-30 absolute top-0 left-0">
                                <img className={"w-8 absolute animate-spin"} src="./themes/Yaru/status/process-working-symbolic.svg" alt="Ubuntu Process Symbol" />
                            </div>
                        )
                        : null
                }
            </div>
);
}
