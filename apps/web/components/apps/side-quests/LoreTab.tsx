import React from "react";
import { LORE, SONG_ID } from "../../../content/side-quests";
import { SectionTitle } from "./SectionTitle";
import { THEME } from "./theme";

export function LoreTab() {
    const [playing, setPlaying] = React.useState(false);
    const notes = [{ bg: "#fff1a8", tilt: "-1.5deg" }, { bg: "#ffd6e7", tilt: "1.2deg" }];
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <SectionTitle emoji="🪶" color={THEME.orange}>Scrolls</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-1 py-2">
                {LORE.map((line, i) => (
                    <blockquote
                        key={line}
                        className="rounded-md p-5 text-lg md:text-xl italic leading-snug shadow-lg"
                        style={{ background: notes[i % notes.length].bg, color: THEME.ink, transform: `rotate(${notes[i % notes.length].tilt})`, fontFamily: "Georgia, 'Times New Roman', serif" }}
                    >
                        “{line}”
                    </blockquote>
                ))}
            </div>
            <SectionTitle emoji="🎸" color={THEME.pink} className="mt-6">Bard&apos;s corner</SectionTitle>
            <div className="rounded-2xl overflow-hidden max-w-xl shadow-lg" style={{ background: THEME.card }}>
                <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                    {playing ? (
                        <iframe
                            className="absolute inset-0 w-full h-full"
                            src={`https://www.youtube-nocookie.com/embed/${SONG_ID}?autoplay=1&rel=0`}
                            title="Debugging Love"
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full group bg-black" aria-label="Play Debugging Love">
                            <img src={`https://i.ytimg.com/vi/${SONG_ID}/hqdefault.jpg`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <span className="absolute inset-0 flex items-center justify-center">
                                <span className="w-16 h-16 rounded-full flex items-center justify-center text-2xl text-white shadow-xl" style={{ background: THEME.sunset }}>▶</span>
                            </span>
                        </button>
                    )}
                </div>
                <div className="p-3 flex items-center justify-between">
                    <div>
                        <div className="font-bold" style={{ color: THEME.ink }}>Debugging Love</div>
                        <div className="text-xs" style={{ color: THEME.muted }}>An original song · xlibraries</div>
                    </div>
                    <a href="https://www.youtube.com/@xlibraries" target="_blank" rel="noreferrer noopener" className="text-xs font-bold px-3 py-1 rounded-full text-white shadow-sm hover:opacity-90" style={{ background: THEME.coral }}>
                        YouTube channel ↗
                    </a>
                </div>
            </div>
        </div>
    );
}
