import { useRef, useState } from 'react';
import type { AppProps } from '@xlibraries/app-sdk';
import { COLORS, Prompt, type PromptEntry } from './Prompt';
import { evaluate, HELP, type Scope } from './evaluate';

const PROMPT = <span style={{ color: COLORS.green, marginRight: 8 }}>;</span>;

const HEADER = (
    <div style={{ color: COLORS.muted, fontWeight: 400 }}>
        <div>C-style arbitary precision calculator (version 2.12.7.2)</div>
        <div>Calc is open software.</div>
        <div>[ type &quot;exit&quot; to exit, &quot;clear&quot; to clear, &quot;help&quot; for help.]</div>
    </div>
);

export function Calc({ host }: AppProps) {
    const [entries, setEntries] = useState<PromptEntry[]>([]);
    const scope = useRef<Scope>({});

    const onSubmit = (input: string) => {
        if (input === 'exit') return host.close();
        if (input === 'clear') return setEntries([]);
        const output = input === 'help' ? HELP : evaluate(input, scope.current);
        setEntries((prev) => [...prev, { prompt: PROMPT, input, output }]);
    };

    return <Prompt idPrefix="calculator" prompt={PROMPT} entries={entries} onSubmit={onSubmit} header={HEADER} />;
}

export default Calc;
