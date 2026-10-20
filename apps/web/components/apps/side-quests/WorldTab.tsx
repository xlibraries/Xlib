import type { LatLng } from "../../../content/side-quests";
import { formatKm, monthLabel, onTheRoadKm, roadTripKm } from "../../../lib/side-quests";
import type { Travel } from "./data";
import { MODE_STYLE, THEME } from "./theme";
import { WorldMap } from "./WorldMap";

export function WorldTab({ travel, focus }: { travel: Travel | null; focus: LatLng | null }) {
    const km: Travel["km"] = travel ? travel.km : {};
    const earlierKm = travel ? roadTripKm(travel.roadTrips) : 0;
    const roadKm = onTheRoadKm(km.road, travel ? travel.roadTrips : []);
    const stats = [
        { icon: "🛣️", value: formatKm(roadKm), label: "km on the road", color: THEME.pink },
        { icon: "🏍️", value: formatKm(km.motorcycle), label: "km on two wheels", color: THEME.orange },
        { icon: "🚆", value: formatKm(km.train), label: "km by rail", color: THEME.sky },
        { icon: "✈️", value: formatKm(km.flight), label: "km flown", color: THEME.violet },
        { icon: "📍", value: travel ? travel.places.length : "–", label: `towns · ${travel ? travel.states.length : "–"} states`, color: THEME.coral },
    ];
    return (
        <div className="relative w-full h-full">
            <WorldMap travel={travel} focus={focus} />
            <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1.5 pointer-events-none" style={{ zIndex: 500 }}>
                {stats.map(s => (
                    <div key={s.label} className="px-2.5 py-1 rounded-full text-xs shadow-md" style={{ background: "#ffffff", color: THEME.ink, border: `2px solid ${s.color}` }}>
                        <span className="mr-1">{s.icon}</span>
                        <b style={{ color: s.color }}>{s.value}</b> <span style={{ color: THEME.muted }}>{s.label}</span>
                    </div>
                ))}
            </div>
            <div className="absolute bottom-2 left-2 px-3 py-2 rounded-xl text-xs space-y-1 shadow-md" style={{ zIndex: 500, background: "rgba(255,255,255,0.95)", color: THEME.ink }}>
                <div className="flex items-center gap-1.5"><Dot color={THEME.coral} /> Last 12 months{travel ? ` (${monthLabel(travel.period.from)} – ${monthLabel(travel.period.to)})` : ""}</div>
                {travel && (
                    <div style={{ color: THEME.muted }}>
                        🛣️ {formatKm(Math.round(km.road || 0))} km tracked by road + {formatKm(earlierKm)} km of earlier road trips
                    </div>
                )}
                <div className="flex items-center gap-1.5"><Dot color={THEME.teal} /> Earlier adventures <span className="inline-block w-4 rounded-full ml-1" style={{ height: 4, background: THEME.teal }} /> earlier road trips</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                    {Object.entries(MODE_STYLE).map(([mode, s]) => (
                        <span key={mode} className="flex items-center gap-1">
                            <span className="inline-block w-4 rounded-full" style={{ height: 4, background: s.color }} /> {s.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

const Dot = ({ color }: { color: string }) => (
    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(29,35,64,.15)" }} />
);
