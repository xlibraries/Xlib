// The Shader Playground's editor: presets, your code (GLSL on WebGL2, WGSL on WebGPU), live recompiles and errors.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '../games';
import { LANGUAGE, type ShaderError } from './compose';
import { PRESETS } from './presets';
import { check } from './validate';

interface PlaygroundInstance {
    _pg_set_shader(ptr: number): number;
    _pg_reset_time(): void;
    _free(ptr: number): void;
    stringToNewUTF8(text: string): number;
}

const STORAGE_KEY = (lang: string) => `arcade-playground-${lang.toLowerCase()}`;

export function PlaygroundEditor({ instance, backend }: PanelProps) {
    const game = instance as unknown as PlaygroundInstance;
    const lang = LANGUAGE[backend];
    const field = lang === 'GLSL' ? 'glsl' : 'wgsl';
    const [code, setCode] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY(lang)) || PRESETS[0][field]; } catch { return PRESETS[0][field]; }
    });
    const [errors, setErrors] = useState<ShaderError[]>([]);
    const [status, setStatus] = useState<'compiling' | 'ok' | 'error'>('compiling');
    const latest = useRef(0);

    const run = useCallback(async (text: string) => {
        const id = ++latest.current;
        setStatus('compiling');
        const { source, errors: found } = await check(backend, text);
        if (id !== latest.current) return;   // a newer edit superseded this one
        if (found.length) {
            setErrors(found);
            setStatus('error');
            return;
        }
        const ptr = game.stringToNewUTF8(source);
        const ok = game._pg_set_shader(ptr) === 1;
        game._free(ptr);
        setErrors(ok ? [] : [{ line: null, message: 'The GPU rejected this shader.' }]);
        setStatus(ok ? 'ok' : 'error');
        try { localStorage.setItem(STORAGE_KEY(lang), text); } catch { /* storage blocked */ }
    }, [backend, game, lang]);

    // Recompile shortly after you stop typing
    useEffect(() => {
        const timer = setTimeout(() => run(code), 450);
        return () => clearTimeout(timer);
    }, [code, run]);

    return (
        <div className="h-full flex flex-col text-white text-xs" style={{ background: '#16121f' }}>
            <div className="flex flex-wrap items-center gap-1.5 p-2 border-b border-white border-opacity-10">
                <span className="px-2 py-0.5 rounded bg-white bg-opacity-10 font-bold">{lang}</span>
                {PRESETS.map(p => (
                    <button key={p.id} type="button" onClick={() => { setCode(p[field]); game._pg_reset_time(); }} className="px-2 py-0.5 rounded-full bg-white bg-opacity-5 hover:bg-opacity-15">
                        {p.title}
                    </button>
                ))}
                <span className="flex-grow" />
                <span role="status" data-status={status} className={status === 'ok' ? 'text-emerald-300' : status === 'error' ? 'text-red-300' : 'text-gray-400'}>
                    {status === 'ok' ? '● running' : status === 'error' ? '● error' : '● compiling'}
                </span>
            </div>
            <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                wrap="off"
                aria-label={`${lang} shader code`}
                className="flex-grow w-full resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none text-gray-100"
                style={{ tabSize: 4 }}
                onKeyDown={(e) => {
                    if (e.key !== 'Tab') return;
                    e.preventDefault();   // indent instead of leaving the editor
                    const el = e.currentTarget, start = el.selectionStart;
                    const next = code.slice(0, start) + '    ' + code.slice(el.selectionEnd);
                    setCode(next);
                    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 4; });
                }}
            />
            {errors.length > 0 && (
                <div role="alert" className="max-h-32 overflow-y-auto border-t border-red-400 border-opacity-40 bg-red-900 bg-opacity-30 p-2 font-mono">
                    {errors.map((e, i) => <div key={i}>{e.line ? `line ${e.line}: ` : ''}{e.message}</div>)}
                </div>
            )}
            <div className="p-2 text-gray-500 border-t border-white border-opacity-10">
                {lang === 'GLSL' ? 'mainImage(out vec4 fragColor, in vec2 fragCoord) · iTime iResolution iMouse' : 'fn mainImage(fragCoord: vec2f) -> vec4f · u.time u.resolution u.mouse'}
            </div>
        </div>
    );
}
