// The prompt UI shared by Terminal and Calc: past entries, then a live input line with a blinking block
// cursor and ↑/↓ history. The parent owns the entries and decides what each submitted line produces.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

export interface PromptEntry {
    prompt: ReactNode;
    input: string;
    output?: ReactNode;
}

export interface PromptProps {
    /** Input ids are `${idPrefix}-input-${n}`. */
    idPrefix: string;
    /** The prompt for the live line, e.g. "aman:~$". */
    prompt: ReactNode;
    entries: PromptEntry[];
    onSubmit(input: string): void;
    /** Shown above the entries. */
    header?: ReactNode;
    style?: CSSProperties;
}

export const COLORS = {
    background: '#2C001E',
    text: '#FFFFFF',
    muted: '#AEA79F',
    green: '#4E9A06',
    blue: '#3465A4',
};

const BLINK = `@keyframes xlib-prompt-blink { 50% { visibility: hidden } }`;

export function Prompt({ idPrefix, prompt, entries, onSubmit, header, style }: PromptProps) {
    const [value, setValue] = useState('');
    const [focused, setFocused] = useState(true);
    const history = useRef<string[]>([]);
    const historyIndex = useRef(-1);
    const input = useRef<HTMLInputElement>(null);

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const line = value.trim();
            if (!line) return;
            history.current.push(line);
            historyIndex.current = history.current.length;
            setValue('');
            onSubmit(line);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const step = e.key === 'ArrowUp' ? -1 : 1;
            const next = Math.min(Math.max(historyIndex.current + step, 0), history.current.length);
            historyIndex.current = next;
            setValue(history.current[next] ?? '');
        }
    };

    return (
        <div
            onClick={() => input.current?.focus()}
            style={{ height: '100%', width: '100%', overflowY: 'auto', padding: 4, background: COLORS.background, color: COLORS.text, fontSize: 14, fontWeight: 700, ...style }}
        >
            <style>{BLINK}</style>
            {header}
            {entries.map((entry, i) => (
                <div key={i}>
                    <div style={{ display: 'flex', minHeight: 20 }}>
                        {entry.prompt}
                        <span style={{ whiteSpace: 'pre', letterSpacing: '0.05em', fontWeight: 400 }}>{entry.input}</span>
                    </div>
                    {entry.output != null && <div style={{ margin: '8px 0', fontWeight: 400, whiteSpace: 'pre-wrap' }}>{entry.output}</div>}
                </div>
            ))}
            <div style={{ display: 'flex', minHeight: 20 }}>
                {prompt}
                <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                    <span style={{ float: 'left', whiteSpace: 'pre', letterSpacing: '0.05em', fontWeight: 400 }}>{value}</span>
                    <div style={{ float: 'left', marginTop: 4, width: 6, height: 14, background: COLORS.text, animation: focused ? 'xlib-prompt-blink 1s steps(1) infinite' : undefined }} />
                    <input
                        ref={input}
                        id={`${idPrefix}-input-${entries.length}`}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        aria-label="Command"
                        autoFocus
                        spellCheck={false}
                        autoComplete="off"
                        style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, border: 0, outline: 'none', background: 'transparent' }}
                    />
                </div>
            </div>
        </div>
    );
}
