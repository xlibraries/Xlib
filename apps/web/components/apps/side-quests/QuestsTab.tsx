import { ORIGINS, QUESTS, type LatLng } from "../../../content/side-quests";
import { SectionTitle } from "./SectionTitle";
import { PASTELS, RARITY, THEME } from "./theme";

export function QuestsTab({ onShow }: { onShow(at: LatLng): void }) {
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <SectionTitle emoji="📜" color={THEME.pink}>Quest log</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {QUESTS.map(q => {
                    const rarity = RARITY[q.rarity];
                    return (
                        <div key={q.title} className="rounded-2xl overflow-hidden flex flex-col shadow-md transform hover:-translate-y-0.5 transition-transform" style={{ background: THEME.card }}>
                            <div style={{ height: 6, background: rarity.gradient }} />
                            <div className="p-3.5 flex flex-col flex-grow">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="font-bold text-base" style={{ color: THEME.ink }}>{q.title}</div>
                                        <div className="text-xs" style={{ color: THEME.muted }}>{q.when} · {q.where}</div>
                                    </div>
                                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap text-white shadow-sm" style={{ background: rarity.gradient }}>{q.rarity}</span>
                                </div>
                                <p className="text-sm mt-2 leading-snug flex-grow" style={{ color: "#3a4160" }}>{q.story}</p>
                                <div className="flex items-center justify-between mt-3">
                                    <div className="flex flex-wrap gap-1">
                                        {q.tags.map(t => <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${rarity.color}14`, color: rarity.color }}>{t}</span>)}
                                    </div>
                                    <button type="button" onClick={() => onShow(q.at)} className="text-xs font-bold px-3 py-1 rounded-full text-white shadow-sm hover:opacity-90" style={{ background: THEME.sunset }}>
                                        Show on map →
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <SectionTitle emoji="🧭" color={THEME.teal} className="mt-6">Chapter zero · earlier adventures</SectionTitle>
            <div className="flex flex-wrap gap-2">
                {ORIGINS.map((o, i) => (
                    <span key={o} className="text-xs md:text-sm px-3 py-1 rounded-full font-medium" style={{ background: PASTELS[i % PASTELS.length], color: THEME.ink }}>{o}</span>
                ))}
            </div>
        </div>
    );
}
