// Admin: Photo Drop's health and recent uploads. Google's authorization lasts 7 days (consent screen in
// Testing), so this counts down from the last `setup` run and says how to renew it.
import { useCallback, useEffect, useState } from 'react';

interface Status {
    album: string;
    access: { ok: boolean; error: string | null };
    authorizedAt: number | null;
    expiresAt: number | null;
    uploads: { at: number; name: string; by: string }[];
}

const DAY = 24 * 3600 * 1000;
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function accessSummary(status: Pick<Status, 'access' | 'expiresAt'>, now = Date.now()): { tone: 'ok' | 'warn' | 'bad'; text: string } {
    if (!status.access.ok) return { tone: 'bad', text: 'Uploads are failing: Google access has expired or was revoked.' };
    if (!status.expiresAt) return { tone: 'warn', text: "Working. Run setup once so this can count down to the next renewal." };
    const left = status.expiresAt - now;
    if (left <= 0) return { tone: 'bad', text: 'Google access is due to expire about now: renew it.' };
    const days = Math.floor(left / DAY), hours = Math.floor((left % DAY) / 3600000);
    return { tone: left < DAY ? 'warn' : 'ok', text: `Working. Expires in ${days ? `${days} d ` : ''}${hours} h (${when(status.expiresAt)}).` };
}

const TONES = { ok: 'border-emerald-400 bg-emerald-900', warn: 'border-yellow-400 bg-yellow-900', bad: 'border-red-400 bg-red-900' };

export default function AdminPhotoDrop() {
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/photo-drop', { cache: 'no-store' });
            if (res.status === 401) return window.location.reload();
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setStatus(data);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches once on open
    useEffect(() => { load(); }, [load]);

    const summary = status && accessSummary(status);

    return (
        <div className="h-full w-full overflow-y-auto p-4 text-white" style={{ background: '#1f1f1f' }}>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="text-lg font-bold">Photo Drop</div>
                    {status && <div className="text-xs text-gray-400">Album: {status.album}</div>}
                </div>
                <button type="button" onClick={load} disabled={loading} className="text-xs px-3 py-1 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50">
                    {loading ? 'Checking…' : 'Refresh'}
                </button>
            </div>

            {error && <div className="rounded border border-red-400 bg-red-900 bg-opacity-30 p-3 text-sm mb-3">{error}</div>}

            {summary && (
                <div className={`rounded border ${TONES[summary.tone]} bg-opacity-30 p-3 text-sm mb-3`}>
                    <div className="font-medium">{summary.text}</div>
                    {summary.tone !== 'ok' && (
                        <ol className="list-decimal pl-5 mt-2 text-gray-200 space-y-0.5">
                            <li>Open <a className="underline" href="https://script.google.com/home" target="_blank" rel="noreferrer noopener">Apps Script</a> → <b>xlib&apos;s gallery</b>.</li>
                            <li>Choose the <code>setup</code> function and press <b>Run</b>, then approve the permissions.</li>
                            <li>Press Refresh here.</li>
                        </ol>
                    )}
                    {status?.access.error && <div className="mt-2 text-xs text-gray-300">{status.access.error}</div>}
                    {status?.authorizedAt && <div className="mt-1 text-xs text-gray-400">Last renewed {when(status.authorizedAt)}</div>}
                </div>
            )}

            {status && (
                <div className="rounded-lg bg-white bg-opacity-5 p-3">
                    <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">Recent uploads</div>
                    {status.uploads.length === 0 && <div className="text-sm text-gray-500">No uploads recorded yet.</div>}
                    {status.uploads.map((u, i) => (
                        <div key={i} className="flex justify-between gap-3 text-sm py-1 border-t border-white border-opacity-5 first:border-0">
                            <span className="truncate">{u.name}{u.by && <span className="text-gray-400"> · {u.by}</span>}</span>
                            <span className="text-gray-400 whitespace-nowrap">{when(u.at)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
