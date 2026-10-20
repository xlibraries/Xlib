import { HOME_BASE, SKILLS, WORK_BASE } from "../../../content/side-quests";
import type { Travel } from "./data";
import { SectionTitle } from "./SectionTitle";
import { PASTELS, THEME } from "./theme";

export function CharacterTab({ travel }: { travel: Travel | null }) {
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <div className="rounded-2xl p-4 flex items-center gap-4 text-white shadow-lg" style={{ background: THEME.sunset }}>
                <img src="./images/logos/bitmoji.png" alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white flex-shrink-0 shadow-md" style={{ boxShadow: "0 0 0 4px rgba(255,255,255,.6)" }} />
                <div className="min-w-0">
                    <div className="text-xl md:text-2xl font-bold">Aman</div>
                    <div className="text-sm font-medium">Class: Engineer · Wanderer · Storyteller</div>
                    <div className="text-xs mt-1 opacity-90">
                        Home base: {HOME_BASE.name}, MP · Work base: {WORK_BASE.name}{travel ? ` · ${travel.states.length} states explored this year` : ""}
                    </div>
                </div>
            </div>
            <SectionTitle emoji="✨" color={THEME.violet} className="mt-5">Skills & side hustles of the soul</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {SKILLS.map((s, i) => (
                    <div key={s.name} className="rounded-2xl p-3 flex gap-3 transform hover:scale-[1.02] transition-transform" style={{ background: PASTELS[i % PASTELS.length] }}>
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xl flex-shrink-0 shadow-sm">{s.icon}</div>
                        <div className="min-w-0">
                            <div className="font-bold text-sm" style={{ color: THEME.ink }}>{s.name}</div>
                            <div className="text-xs mt-0.5 leading-snug" style={{ color: "#454d6b" }}>{s.note}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
