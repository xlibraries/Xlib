import type { Rarity } from "../../../content/side-quests";

// Bright, sunny palette (the app icon's navy and gold, plus candy accents)
export const THEME = {
    bg: "#fff7ec",
    card: "#ffffff",
    ink: "#1d2340",
    muted: "#5d6683",
    line: "rgba(29, 35, 64, 0.08)",
    sunset: "linear-gradient(100deg, #ff8a3d 0%, #ff4f8b 55%, #7b5cff 100%)",
    coral: "#ff5a5f",
    pink: "#ff3d7f",
    orange: "#ff8a00",
    sky: "#0a9bff",
    violet: "#8b5cf6",
    teal: "#00b8a9",
    sun: "#ffc93c",
};

export const RARITY: Record<Rarity, { color: string; gradient: string }> = {
    Legendary: { color: "#e07a00", gradient: "linear-gradient(90deg, #ffc93c, #ff8a00)" },
    Epic: { color: "#a634d6", gradient: "linear-gradient(90deg, #c77dff, #ff4f8b)" },
    Rare: { color: "#0a84d6", gradient: "linear-gradient(90deg, #4cc9f0, #0a9bff)" },
    Common: { color: "#159a6a", gradient: "linear-gradient(90deg, #7ae582, #25c38b)" },
};

// A different pastel for every hobby card
export const PASTELS = ["#ffe3d3", "#e3f4ff", "#efe4ff", "#dff7ea", "#fff1c9", "#ffe0ec", "#dff3f1"];

export const MODE_STYLE: Record<string, { color: string; label: string; dash?: string }> = {
    car: { color: THEME.pink, label: "Road trips" },
    motorcycle: { color: THEME.orange, label: "Motorcycle" },
    train: { color: THEME.sky, label: "Rail", dash: "6 6" },
    bus: { color: THEME.violet, label: "Bus" },
};
