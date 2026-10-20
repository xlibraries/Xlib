// Admin: live switches. Photo Drop open/closed (enforced by its Apps Script), which apps visitors see, and a
// banner message. Changes apply to visitors within about 15 seconds, without a deploy.
import { useCallback, useEffect, useState } from 'react';
import apps from '../../apps.config';
import { HIDEABLE_APPS } from '../../lib/app-ids';
import type { SiteSettings } from '../../lib/site-settings';

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function json<T>(res: Response): Promise<T> {
    if (res.status === 401) { window.location.reload(); throw new Error('Session expired'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as T;
}

export default function AdminSiteSettings() {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [banner, setBanner] = useState({ text: '', tone: 'info' as 'info' | 'warn' });
    const [dropOpen, setDropOpen] = useState<boolean | null>(null);
    const [dropError, setDropError] = useState<string | null>(null);
    const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const s = await json<SiteSettings>(await fetch('/api/admin/settings', { cache: 'no-store' }));
            setSettings(s);
            setBanner({ text: s.banner?.text ?? '', tone: s.banner?.tone ?? 'info' });
        } catch (e) {
            setMessage({ error: true, text: (e as Error).message });
        }
        try {
            setDropOpen((await json<{ open: boolean }>(await fetch('/api/admin/photo-drop', { cache: 'no-store' }))).open);
        } catch (e) {
            setDropError((e as Error).message);
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches once on open
    useEffect(() => { load(); }, [load]);

    const save = async (next: SiteSettings, done: string) => {
        setBusy(true);
        try {
            const saved = await json<SiteSettings>(await post('/api/admin/settings', next));
            setSettings(saved);
            setMessage({ error: false, text: done });
        } catch (e) {
            setMessage({ error: true, text: (e as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const toggleDrop = async () => {
        setBusy(true);
        try {
            setDropOpen((await json<{ open: boolean }>(await post('/api/admin/photo-drop', { open: !dropOpen }))).open);
            setMessage({ error: false, text: dropOpen ? 'Photo Drop closed.' : 'Photo Drop opened.' });
        } catch (e) {
            setMessage({ error: true, text: (e as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const hideable = apps.filter(app => HIDEABLE_APPS.includes(app.id));

    return (
        <div className="h-full w-full overflow-y-auto p-4 text-white text-sm" style={{ background: '#1f1f1f' }}>
            <div className="text-lg font-bold mb-1">Site Settings</div>
            <div className="text-xs text-gray-400 mb-4">Changes reach visitors within about 15 seconds. No deploy needed.</div>
            {message && <div role="status" className={`rounded border p-2 mb-3 ${message.error ? 'border-red-400 bg-red-900' : 'border-emerald-400 bg-emerald-900'} bg-opacity-30`}>{message.text}</div>}

            <section className="rounded-lg bg-white bg-opacity-5 p-3 mb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium">Photo Drop</div>
                        <div className="text-xs text-gray-400">{dropOpen === null ? (dropError ?? 'Checking…') : dropOpen ? 'Open: friends can upload.' : 'Closed: new uploads are refused.'}</div>
                    </div>
                    {dropOpen !== null && (
                        <button type="button" role="switch" aria-checked={dropOpen} aria-label="Photo Drop open" onClick={toggleDrop} disabled={busy}
                            className={`w-12 h-6 rounded-full relative transition-colors ${dropOpen ? 'bg-ub-orange' : 'bg-gray-600'} disabled:opacity-50`}>
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${dropOpen ? 'left-6' : 'left-0.5'}`} />
                        </button>
                    )}
                </div>
            </section>

            {settings && (
                <>
                    <section className="rounded-lg bg-white bg-opacity-5 p-3 mb-3">
                        <div className="font-medium mb-2">Apps visitors see</div>
                        <div className="grid grid-cols-2 gap-1">
                            {hideable.map(app => {
                                const visible = !settings.hiddenApps.includes(app.id);
                                return (
                                    <label key={app.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visible}
                                            disabled={busy}
                                            onChange={() => save({ ...settings, hiddenApps: visible ? [...settings.hiddenApps, app.id] : settings.hiddenApps.filter(id => id !== app.id) }, `${app.title} ${visible ? 'hidden' : 'shown'}.`)}
                                        />
                                        <img src={app.icon} alt="" className="w-4 h-4" />
                                        <span className={visible ? '' : 'text-gray-500 line-through'}>{app.title}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </section>

                    <section className="rounded-lg bg-white bg-opacity-5 p-3">
                        <div className="font-medium mb-2">Banner</div>
                        <textarea
                            value={banner.text}
                            onChange={(e) => setBanner({ ...banner, text: e.target.value })}
                            maxLength={200}
                            rows={2}
                            placeholder="A short message shown at the top of the desktop"
                            aria-label="Banner text"
                            className="w-full rounded bg-black bg-opacity-40 border border-white border-opacity-20 p-2 outline-none focus:border-ub-orange resize-none"
                        />
                        <div className="flex items-center gap-3 mt-2">
                            <label className="flex items-center gap-1"><input type="radio" checked={banner.tone === 'info'} onChange={() => setBanner({ ...banner, tone: 'info' })} /> Info</label>
                            <label className="flex items-center gap-1"><input type="radio" checked={banner.tone === 'warn'} onChange={() => setBanner({ ...banner, tone: 'warn' })} /> Warning</label>
                            <span className="flex-grow" />
                            <button type="button" disabled={busy || !settings.banner} onClick={() => { setBanner({ text: '', tone: 'info' }); save({ ...settings, banner: null }, 'Banner removed.'); }} className="px-3 py-1 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-40">Remove</button>
                            <button type="button" disabled={busy || !banner.text.trim()} onClick={() => save({ ...settings, banner: { text: banner.text, tone: banner.tone } }, 'Banner saved.')} className="px-3 py-1 rounded-full bg-ub-orange disabled:opacity-40">Save banner</button>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
