import type { ReactNode } from "react";

export function SectionTitle({ children, emoji, color, className = "" }: { children: ReactNode; emoji: string; color: string; className?: string }) {
    return (
        <div className={className + " text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2"} style={{ color }}>
            <span className="text-base">{emoji}</span>
            <span>{children}</span>
            <span className="flex-grow rounded-full" style={{ height: 3, background: `linear-gradient(90deg, ${color}66, transparent)` }} />
        </div>
    );
}
