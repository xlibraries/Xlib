import { useState, type ComponentType } from 'react';
import type { AppProps, Host } from '@xlibraries/app-sdk';
import { COLORS, Prompt, type PromptEntry } from './Prompt';
import { initialState, runCommand, type Effect, type Output, type ShellConfig } from './shell';

function renderOutput(output: Output | undefined) {
    if (!output) return undefined;
    switch (output.kind) {
        case 'text':
            return output.text;
        case 'list':
            return (
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {output.items.map((item) => <span key={item} style={{ marginRight: 8, fontWeight: 700, color: COLORS.blue }}>&apos;{item}&apos;</span>)}
                </div>
            );
        case 'image':
            return <img src={output.src} alt={output.alt} style={{ width: '40%' }} />;
    }
}

function promptFor(user: string, path: string) {
    return (
        <div style={{ display: 'flex', marginRight: 4 }}>
            <span style={{ color: COLORS.green }}>{user}</span>
            <span style={{ margin: '0 1px' }}>:</span>
            <span style={{ color: COLORS.blue }}>{path}</span>
            <span style={{ margin: '0 1px' }}>$</span>
        </div>
    );
}

function apply(effect: Effect, host: Host, clear: () => void) {
    switch (effect.type) {
        case 'openApp': return host.openApp(effect.id);
        case 'addFolder': return host.addFolder(effect.name);
        case 'openUrl': return void window.open(effect.url, '_blank', 'noopener');
        case 'track': return host.track(effect.event);
        case 'clear': return clear();
        case 'close': return host.close();
    }
}

/** Builds a terminal app for the given file tree, app shortcuts and extra commands. */
export function createTerminal(config: ShellConfig): ComponentType<AppProps> {
    return function Terminal({ host }: AppProps) {
        const [state, setState] = useState(initialState);
        const [entries, setEntries] = useState<PromptEntry[]>([]);

        const onSubmit = (input: string) => {
            const result = runCommand(input, state, config);
            const prompt = promptFor(config.user, state.path);
            let cleared = false;
            for (const effect of result.effects ?? []) apply(effect, host, () => { cleared = true; });
            setEntries(cleared ? [] : (prev) => [...prev, { prompt, input, output: renderOutput(result.output) }]);
            setState(result.state);
        };

        return <Prompt idPrefix="terminal" prompt={promptFor(config.user, state.path)} entries={entries} onSubmit={onSubmit} />;
    };
}
