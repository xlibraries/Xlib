// The terminal's command interpreter, as a pure function: input + state + config in, new state + output +
// effects out. The React component (Terminal.tsx) renders the output and carries out the effects.
import type { AnalyticsEvent } from '@xlibraries/app-sdk';

export type Output =
    | { kind: 'text'; text: string }
    | { kind: 'list'; items: string[] }
    | { kind: 'image'; src: string; alt: string };

export type Effect =
    | { type: 'openApp'; id: string }
    | { type: 'addFolder'; name: string }
    | { type: 'openUrl'; url: string }
    | { type: 'track'; event: AnalyticsEvent }
    | { type: 'clear' }
    | { type: 'close' };

export interface CommandResult {
    output?: Output;
    effects?: Effect[];
}

export interface CustomCommand {
    run(args: string[]): CommandResult;
    /** Left out of the "available commands" list. */
    hidden?: boolean;
}

export interface ShellConfig {
    /** Shown in the prompt, e.g. "aman". */
    user: string;
    /** What `pwd` prints for `~`, e.g. "/home/aman". */
    home: string;
    /** Directory name → its entries. "root" is the home directory. */
    files: Record<string, string[]>;
    /** Directories that `cd` and `ls` refuse to open. */
    privateDirs?: string[];
    /** Command → app id it opens, e.g. { code: "vscode" }. */
    apps?: Record<string, string>;
    /** Extra commands. */
    commands?: Record<string, CustomCommand>;
}

export interface ShellState {
    /** Name of the current directory ("root" for ~). */
    dir: string;
    /** The path shown in the prompt, e.g. "~/projects". */
    path: string;
}

export const initialState: ShellState = { dir: 'root', path: '~' };

const BUILTINS = ['cd', 'ls', 'pwd', 'echo', 'clear', 'exit', 'mkdir'];

export function availableCommands(config: ShellConfig): string[] {
    const custom = Object.entries(config.commands ?? {}).filter(([, c]) => !c.hidden).map(([name]) => name);
    return [...BUILTINS, ...Object.keys(config.apps ?? {}), ...custom];
}

const text = (t: string): Output => ({ kind: 'text', text: t });
const notFound = (command: string, config: ShellConfig) =>
    text(`Command '${command}' not found, or not yet implemented.\nAvailable Commands: [ ${availableCommands(config).join(', ')} ]`);

export function runCommand(input: string, state: ShellState, config: ShellConfig): CommandResult & { state: ShellState } {
    const [command, ...args] = input.trim().split(/\s+/).filter(Boolean);
    const rest = args.join(' ');
    const isPrivate = (dir: string) => (config.privateDirs ?? []).includes(dir);
    const done = (result: CommandResult = {}, next: ShellState = state) => ({ state: next, ...result });

    if (!command) return done();

    switch (command) {
        case 'cd': {
            if (!rest) return done({}, initialState);
            if (args.length > 1) return done({ output: text('too many arguments, arguments must be <1.') });
            if (isPrivate(rest)) return done({ output: text(`bash /${state.dir} : Permission denied 😏`) });
            if (rest === '.' || rest === '..' || rest === '../') return done({ output: text("Type 'cd' to go back 😅") });
            if ((config.files[state.dir] ?? []).includes(rest)) return done({}, { dir: rest, path: `${state.path}/${rest}` });
            return done({ output: text(`bash: cd: ${rest}: No such file or directory`) });
        }
        case 'ls': {
            if (args.length > 1) return done({ output: text('too many arguments, arguments must be <1.') });
            const target = args[0] ?? state.dir;
            if (isPrivate(target)) return done({ output: text('Nope! 🙃') });
            if (target in config.files) return done({ output: { kind: 'list', items: config.files[target] } });
            return done({ output: text(`ls: cannot access '${target}': No such file or directory`) });
        }
        case 'pwd':
            return done({ output: text(state.path.replace('~', config.home)) });
        case 'echo':
            return done({ output: text(rest) });
        case 'mkdir':
            return args[0] ? done({ effects: [{ type: 'addFolder', name: args[0] }] }) : done({ output: text('mkdir: missing operand') });
        case 'clear':
            return done({ effects: [{ type: 'clear' }] });
        case 'exit':
            return done({ effects: [{ type: 'close' }] });
    }

    const app = config.apps?.[command];
    if (app) {
        return args.length === 0 || args[0] === '.' ? done({ effects: [{ type: 'openApp', id: app }] }) : done({ output: notFound(command, config) });
    }
    const custom = config.commands?.[command];
    if (custom) return done(custom.run(args));
    return done({ output: notFound(command, config) });
}
