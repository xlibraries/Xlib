// Life outside work, as an RPG: a world map of travels, a quest log, a character sheet and some lore.
// Travel data comes from public/side-quests/*.json (built by scripts/side-quests/, town-level only, private
// places removed); the rest is content/side-quests.ts.
import React from "react";
import type { LatLng } from "../../../content/side-quests";
import { trackPageview } from "../../../lib/analytics";
import { CharacterTab } from "./CharacterTab";
import { loadTravel, type Travel } from "./data";
import { LoreTab } from "./LoreTab";
import { QuestsTab } from "./QuestsTab";
import { THEME } from "./theme";
import { WorldTab } from "./WorldTab";

const TABS = [
    { id: "world", label: "World", icon: "🗺️" },
    { id: "quests", label: "Quests", icon: "📜" },
    { id: "character", label: "Character", icon: "🧝" },
    { id: "lore", label: "Lore", icon: "🪶" },
];

function savedTab(): string {
    try {
        const saved = localStorage.getItem("side-quests-tab");
        return TABS.some(t => t.id === saved) ? saved! : "world";
    } catch {
        return "world";
    }
}

export default function SideQuests() {
    // The app only renders in the browser (next/dynamic with ssr: false), so localStorage is readable here
    const [tab, setTab] = React.useState(savedTab);
    const [travel, setTravel] = React.useState<Travel | null>(null);
    const [focus, setFocus] = React.useState<LatLng | null>(null);

    React.useEffect(() => { loadTravel().then(setTravel); }, []);

    const open = (id: string) => {
        setTab(id);
        try { localStorage.setItem("side-quests-tab", id); } catch { /* storage blocked */ }
        trackPageview("/side-quests/" + id, "Side Quests");
    };

    const showOnMap = (at: LatLng) => {
        setFocus([at[0], at[1]]);
        open("world");
    };

    return (
        <div className="w-full h-full flex flex-col select-none" style={{ background: THEME.bg, color: THEME.ink }}>
            <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto windowMainScreen" style={{ background: THEME.sunset }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => open(t.id)}
                        className={(tab === t.id ? "bg-white shadow-md font-bold " : "text-white hover:bg-white hover:bg-opacity-20 ") + "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors"}
                        style={tab === t.id ? { color: THEME.pink } : undefined}
                    >
                        <span>{t.icon}</span>{t.label}
                    </button>
                ))}
                <div className="ml-auto pl-3 text-xs whitespace-nowrap hidden md:block text-white font-medium opacity-95">
                    Off the clock · things I do for fun ✌️
                </div>
            </div>
            <div className="flex-grow overflow-hidden">
                {tab === "world" && <WorldTab travel={travel} focus={focus} />}
                {tab === "quests" && <QuestsTab onShow={showOnMap} />}
                {tab === "character" && <CharacterTab travel={travel} />}
                {tab === "lore" && <LoreTab />}
            </div>
        </div>
    );
}
