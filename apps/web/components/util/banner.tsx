import { useState } from 'react';
import type { Banner as BannerSettings } from '../../lib/site-settings';

// A message set from the admin panel, shown under the top bar; visitors can dismiss it for this visit
export default function Banner({ banner }: { banner: BannerSettings }) {
    const key = 'banner-dismissed:' + banner.text;
    const [dismissed, setDismissed] = useState(() => {
        try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
    });
    if (dismissed) return null;
    const dismiss = () => {
        setDismissed(true);
        try { sessionStorage.setItem(key, '1'); } catch { /* storage blocked */ }
    };
    return (
        <div role="status" id="site-banner" className={"absolute top-9 left-1/2 transform -translate-x-1/2 z-40 max-w-xl w-11/12 flex items-start gap-3 rounded-lg px-4 py-2 text-sm text-white shadow-lg " + (banner.tone === 'warn' ? 'bg-yellow-700' : 'bg-ub-orange')}>
            <span className="flex-grow">{banner.text}</span>
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="opacity-80 hover:opacity-100">✕</button>
        </div>
    );
}
