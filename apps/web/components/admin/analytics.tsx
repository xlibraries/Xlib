// Admin: the site's own analytics (@xlibraries/analytics), read from the admin-only endpoint.
import { useCallback, useState } from 'react';
import { Dashboard, type Report } from '@xlibraries/analytics';

export default function AdminAnalytics() {
    const [loggingOut, setLoggingOut] = useState(false);

    const load = useCallback(async (days: number): Promise<Report> => {
        const res = await fetch(`/api/admin/analytics?days=${days}`, { cache: 'no-store' });
        if (res.status === 401) {
            window.location.reload();   // session expired: back to the passcode screen
            throw new Error('Session expired');
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        return res.json();
    }, []);

    const logout = async () => {
        setLoggingOut(true);
        await fetch('/api/admin/logout', { method: 'POST' }).catch(() => { });
        window.location.reload();
    };

    return (
        <div className="relative h-full w-full">
            <Dashboard load={load} />
            <button type="button" onClick={logout} disabled={loggingOut} className="absolute bottom-3 right-4 text-xs px-3 py-1 rounded-full bg-white bg-opacity-10 hover:bg-opacity-20 text-gray-200">
                {loggingOut ? 'Logging out…' : 'Log out of admin'}
            </button>
        </div>
    );
}
