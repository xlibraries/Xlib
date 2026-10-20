// Live site settings, changed from the admin panel without a deploy: which apps visitors see and a banner.
// Stored as one JSON value in Redis (`settings`), served publicly by /api/settings and saved by
// /api/admin/settings. (Photo Drop open/closed lives in its Apps Script, where it's enforced.)
import type { Store } from '@xlibraries/analytics/server';

export interface Banner { text: string; tone: 'info' | 'warn' }

export interface SiteSettings {
    hiddenApps: string[];
    banner: Banner | null;
}

export const DEFAULT_SETTINGS: SiteSettings = { hiddenApps: [], banner: null };
const KEY = 'settings';

/** Keeps only what's valid (known app ids, a short plain-text banner); anything else falls back to the default. */
export function cleanSettings(input: unknown, appIds: string[]): SiteSettings {
    const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const hiddenApps = Array.isArray(s.hiddenApps) ? [...new Set(s.hiddenApps.filter((id): id is string => typeof id === 'string' && appIds.includes(id)))] : [];
    const b = s.banner as Record<string, unknown> | null | undefined;
    const text = b && typeof b.text === 'string' ? b.text.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    const banner = text ? { text, tone: b?.tone === 'warn' ? 'warn' as const : 'info' as const } : null;
    return { hiddenApps, banner };
}

export async function readSettings(store: Store | null, appIds: string[]): Promise<SiteSettings> {
    if (!store) return DEFAULT_SETTINGS;
    try {
        const raw = await store.get(KEY);
        return raw ? cleanSettings(JSON.parse(raw), appIds) : DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export async function writeSettings(store: Store, input: unknown, appIds: string[]): Promise<SiteSettings> {
    const settings = cleanSettings(input, appIds);
    await store.set(KEY, JSON.stringify(settings));
    return settings;
}
