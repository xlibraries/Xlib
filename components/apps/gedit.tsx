// @ts-nocheck
import React, { Component } from 'react';
import ReactGA from 'react-ga4';
import emailjs from '@emailjs/browser';

const CONTACT_EMAIL = 'aman9893089064@gmail.com';

export class Gedit extends Component {
    constructor() {
        super();
        this.state = {
            name: '',
            email: '',
            subject: '',
            message: '',
            sending: false,
            error: '',
            notice: '',
            emailjsReady: false,
        };
    }

    componentDidMount() {
        const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
        const serviceID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
        const templateID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;

        if (publicKey && serviceID && templateID) {
            this.setState({ emailjsReady: true });
            emailjs.init(publicKey);
            return;
        }

        this.setState({
            emailjsReady: false,
            notice: 'EmailJS is not configured yet. The form will open your email app instead.',
        });
    }

    handleChange = (field) => (e) => {
        this.setState({
            [field]: e.target.value,
            error: '',
        });
    }

    closeWindow = () => {
        document.getElementById('close-gedit')?.click();
    }

    buildMailtoLink = (name, email, subject, message) => {
        const finalSubject = subject || 'Portfolio inquiry';
        const finalBody = `From: ${name}\nEmail: ${email}\n\n${message}`;

        return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(finalSubject)}&body=${encodeURIComponent(finalBody)}`;
    }

    openMailClient = (name, email, subject, message, notice) => {
        window.location.href = this.buildMailtoLink(name, email, subject, message);
        this.setState({
            sending: false,
            error: '',
            notice,
        });
    }

    sendMessage = async () => {
        const name = this.state.name.trim();
        const email = this.state.email.trim();
        const subject = this.state.subject.trim();
        const message = this.state.message.trim();

        if (!name) {
            this.setState({ error: 'Please add your name so I know who the message is from.' });
            return;
        }

        if (!email) {
            this.setState({ error: 'Please add your email so I can reply.' });
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.setState({ error: 'Please enter a valid email address.' });
            return;
        }

        if (!message) {
            this.setState({ error: 'Please add a message before sending.' });
            return;
        }

        const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
        const serviceID = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
        const templateID = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
        const finalSubject = subject || 'Portfolio inquiry';

        ReactGA.event({
            category: "Send Message",
            action: this.state.emailjsReady ? "Submitted contact form" : "Opened email fallback"
        });

        if (!(publicKey && serviceID && templateID)) {
            this.openMailClient(
                name,
                email,
                finalSubject,
                message,
                'Opening your email app so you can send this directly.'
            );
            return;
        }

        this.setState({ sending: true, error: '', notice: '' });

        const templateParams = {
            from_name: name,
            from_email: email,
            subject: finalSubject,
            message,
            reply_to: email,
        };

        try {
            await emailjs.send(serviceID, templateID, templateParams, publicKey);
            this.setState({
                sending: false,
                name: '',
                email: '',
                subject: '',
                message: '',
                error: '',
                notice: 'Message sent successfully.',
            });

            setTimeout(() => {
                this.closeWindow();
            }, 1200);
        } catch (error) {
            console.error('Failed to send email:', error);
            this.setState({
                sending: false,
                error: 'Failed to send message. Please try again.',
            });
        }
    }

    renderStatusBar = () => {
        if (!(this.state.error || this.state.notice)) return null;

        const statusClass = this.state.error
            ? 'border-red-400 text-red-200 bg-red-900 bg-opacity-20'
            : 'border-emerald-400 text-emerald-200 bg-emerald-900 bg-opacity-20';

        return (
            <div className={`mx-2 mt-2 border rounded px-3 py-2 text-xs md:text-sm ${statusClass}`}>
                {this.state.error || this.state.notice}
            </div>
        );
    }

    render() {
        const sendButtonLabel = this.state.sending
            ? 'Sending...'
            : (this.state.emailjsReady ? 'Send' : 'Open Email App');

        return (
            <div className="w-full h-full relative flex flex-col bg-ub-cool-grey text-white select-none">
                <div className="flex items-center justify-between w-full bg-ub-gedit-light bg-opacity-60 border-b border-t border-blue-400 text-sm">
                    <span className="font-bold ml-2">Send a Message to Me</span>
                    <div className="flex">
                        <button
                            type="button"
                            onClick={this.sendMessage}
                            disabled={this.state.sending}
                            className="border border-black bg-black bg-opacity-50 px-3 py-0.5 my-1 mx-1 rounded hover:bg-opacity-80 disabled:opacity-50"
                        >
                            {sendButtonLabel}
                        </button>
                    </div>
                </div>

                {this.renderStatusBar()}

                <div className="relative flex-grow flex flex-col bg-ub-gedit-dark font-normal windowMainScreen mt-2">
                    <div className="absolute left-0 top-0 h-full px-2 bg-ub-gedit-darker"></div>

                    <div className="relative">
                        <input
                            id="sender-name"
                            value={this.state.name}
                            onChange={this.handleChange('name')}
                            className="w-full text-ubt-gedit-orange focus:bg-ub-gedit-light outline-none font-medium text-sm pl-6 py-0.5 bg-transparent"
                            placeholder="Your name"
                            spellCheck="false"
                            autoComplete="off"
                            type="text"
                        />
                        <span className="absolute left-1 top-1/2 transform -translate-y-1/2 font-bold text-sm text-ubt-gedit-blue">1</span>
                    </div>

                    <div className="relative">
                        <input
                            id="sender-email"
                            value={this.state.email}
                            onChange={this.handleChange('email')}
                            className="w-full my-1 text-ubt-gedit-orange focus:bg-ub-gedit-light outline-none text-sm font-normal pl-6 py-0.5 bg-transparent"
                            placeholder="Your email"
                            spellCheck="false"
                            autoComplete="off"
                            type="email"
                        />
                        <span className="absolute left-1 top-1/2 transform -translate-y-1/2 font-bold text-sm text-ubt-gedit-blue">2</span>
                    </div>

                    <div className="relative">
                        <input
                            id="sender-subject"
                            value={this.state.subject}
                            onChange={this.handleChange('subject')}
                            className="w-full my-1 text-ubt-gedit-blue focus:bg-ub-gedit-light gedit-subject outline-none text-sm font-normal pl-6 py-0.5 bg-transparent"
                            placeholder="Subject"
                            spellCheck="false"
                            autoComplete="off"
                            type="text"
                        />
                        <span className="absolute left-1 top-1/2 transform -translate-y-1/2 font-bold text-sm text-ubt-gedit-blue">3</span>
                    </div>

                    <div className="relative flex-grow">
                        <textarea
                            id="sender-message"
                            value={this.state.message}
                            onChange={this.handleChange('message')}
                            className="w-full gedit-message font-light text-sm resize-none h-full windowMainScreen outline-none tracking-wider pl-6 py-1 bg-transparent"
                            placeholder="Message"
                            spellCheck="false"
                            autoComplete="off"
                        />
                        <span className="absolute left-1 top-1 font-bold text-sm text-ubt-gedit-blue">4</span>
                    </div>
                </div>

                <div className="px-3 py-2 text-xs text-gray-300 border-t border-white border-opacity-10">
                    Messages go to <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>.
                </div>

                {
                    this.state.sending
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
}

export default Gedit;

export const displayGedit = () => {
    return <Gedit />;
}
