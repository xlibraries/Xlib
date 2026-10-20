// The analytics dashboard: totals, a daily chart and top lists. Data comes from `load` (the site decides how
// to fetch it, e.g. from an admin-only endpoint).
import { useEffect, useState } from 'react';
import type { Report } from './server/recorder';

const RANGES = [7, 30, 90] as const;
const ACCENT = '#E95420';

const FLAG = (cc: string) => /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1f1a5 + c.charCodeAt(0))) : '🌐';

function DailyChart({ daily }: { daily: Report['daily'] }) {
    const max = Math.max(1, ...daily.map(d => d.visits));
    const w = 100 / daily.length;
    return (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-40" role="img" aria-label="Visits per day">
            {daily.map((d, i) => {
                const h = (d.visits / max) * 38;
                const hv = (d.visitors / max) * 38;
                return (
                    <g key={d.day}>
                        <title>{`${d.day}: ${d.visits} visits, ${d.visitors} visitors`}</title>
                        <rect x={i * w + w * 0.1} y={40 - h} width={w * 0.8} height={h} fill={ACCENT} opacity={0.35} />
                        <rect x={i * w + w * 0.25} y={40 - hv} width={w * 0.5} height={hv} fill={ACCENT} />
                    </g>
                );
            })}
        </svg>
    );
}

function TopList({ title, rows, format = (k) => k }: { title: string; rows: [string, number][]; format?: (key: string) => string }) {
    const max = Math.max(1, ...rows.map(([, n]) => n));
    return (
        <div className="rounded-lg bg-white bg-opacity-5 p-3">
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">{title}</div>
            {rows.length === 0 && <div className="text-sm text-gray-500">No data yet</div>}
            {rows.map(([key, n]) => (
                <div key={key} className="relative flex justify-between text-sm py-0.5 px-1">
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(n / max) * 100}%`, background: 'rgba(233, 84, 32, 0.18)' }} />
                    <span className="relative truncate pr-2">{format(key)}</span>
                    <span className="relative tabular-nums text-gray-300">{n.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
}

export function Dashboard({ load }: { load: (days: number) => Promise<Report> }) {
    const [days, setDays] = useState<number>(30);
    const [data, setData] = useState<Report | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let current = true;
        load(days).then(r => { if (current) { setData(r); setError(null); } }).catch(e => { if (current) setError((e as Error).message); });
        return () => { current = false; };
    }, [days, load]);

    return (
        <div className="h-full w-full overflow-y-auto p-4 text-white" style={{ background: '#1f1f1f' }}>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="text-lg font-bold">Analytics</div>
                    {data && <div className="text-xs text-gray-400">{data.from} → {data.to} (UTC)</div>}
                </div>
                <div className="flex rounded-full bg-white bg-opacity-10 p-0.5 text-sm">
                    {RANGES.map(r => (
                        <button key={r} type="button" onClick={() => setDays(r)} className={'px-3 py-1 rounded-full ' + (days === r ? 'text-white' : 'text-gray-300 hover:text-white')} style={days === r ? { background: ACCENT } : undefined}>
                            {r} days
                        </button>
                    ))}
                </div>
            </div>
            {error && <div className="rounded bg-red-900 bg-opacity-40 p-3 text-sm mb-3">Couldn&apos;t load analytics: {error}</div>}
            {!data && !error && <div className="text-gray-400 text-sm">Loading…</div>}
            {data && (
                <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="rounded-lg bg-white bg-opacity-5 p-3">
                            <div className="text-xs uppercase tracking-wider text-gray-400">Visits</div>
                            <div className="text-2xl font-bold tabular-nums">{data.totals.visits.toLocaleString()}</div>
                        </div>
                        <div className="rounded-lg bg-white bg-opacity-5 p-3">
                            <div className="text-xs uppercase tracking-wider text-gray-400">Visitors (per day, summed)</div>
                            <div className="text-2xl font-bold tabular-nums">{data.totals.visitors.toLocaleString()}</div>
                        </div>
                    </div>
                    <div className="rounded-lg bg-white bg-opacity-5 p-3 mb-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span className="uppercase tracking-wider">Per day</span>
                            <span><span style={{ color: ACCENT }}>■</span> visitors <span style={{ color: ACCENT, opacity: 0.4 }}>■</span> visits</span>
                        </div>
                        <DailyChart daily={data.daily} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <TopList title="Apps opened" rows={data.events.filter(([k]) => k.startsWith('Open App: ')).map(([k, n]) => [k.slice(10), n])} />
                        <TopList title="Screens" rows={data.views} />
                        <TopList title="Countries" rows={data.countries} format={cc => `${FLAG(cc)} ${cc}`} />
                        <TopList title="Referrers" rows={data.referrers} />
                        <TopList title="Devices" rows={data.devices} />
                        <TopList title="Other events" rows={data.events.filter(([k]) => !k.startsWith('Open App: '))} />
                    </div>
                </>
            )}
        </div>
    );
}
