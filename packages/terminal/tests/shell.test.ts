import { describe, expect, it } from 'vitest';
import { availableCommands, initialState, runCommand, type ShellConfig } from '../src/shell';

const config: ShellConfig = {
    user: 'aman',
    home: '/home/aman',
    files: { root: ['projects', 'secrets'], projects: ['Xlib', 'Lone Ember'] },
    privateDirs: ['secrets'],
    apps: { code: 'vscode', music: 'music' },
    commands: {
        hello: { run: (args) => ({ output: { kind: 'text', text: `hi ${args.join(' ')}` } }) },
        upload: { hidden: true, run: () => ({ effects: [{ type: 'openUrl', url: './drop/' }] }) },
    },
};
const run = (input: string, state = initialState) => runCommand(input, state, config);

describe('runCommand', () => {
    it('cd moves into a child directory and back home', () => {
        const inProjects = run('cd projects').state;
        expect(inProjects).toEqual({ dir: 'projects', path: '~/projects' });
        expect(run('pwd', inProjects).output).toEqual({ kind: 'text', text: '/home/aman/projects' });
        expect(run('cd', inProjects).state).toEqual(initialState);
    });

    it('cd refuses unknown, parent and private directories', () => {
        expect(run('cd nowhere').output).toEqual({ kind: 'text', text: 'bash: cd: nowhere: No such file or directory' });
        expect(run('cd ..').output).toEqual({ kind: 'text', text: "Type 'cd' to go back 😅" });
        expect(run('cd secrets').output?.kind).toBe('text');
        expect(run('cd secrets').state).toEqual(initialState);
        expect(run('cd a b').output).toEqual({ kind: 'text', text: 'too many arguments, arguments must be <1.' });
    });

    it('ls lists the current or named directory, but not private ones', () => {
        expect(run('ls').output).toEqual({ kind: 'list', items: ['projects', 'secrets'] });
        expect(run('ls projects').output).toEqual({ kind: 'list', items: ['Xlib', 'Lone Ember'] });
        expect(run('ls secrets').output).toEqual({ kind: 'text', text: 'Nope! 🙃' });
        expect(run('ls nope').output).toEqual({ kind: 'text', text: "ls: cannot access 'nope': No such file or directory" });
    });

    it('echo returns the text as plain text, never markup', () => {
        expect(run('echo <b>hi</b> there').output).toEqual({ kind: 'text', text: '<b>hi</b> there' });
    });

    it('turns side effects into effect objects', () => {
        expect(run('mkdir Mixtapes').effects).toEqual([{ type: 'addFolder', name: 'Mixtapes' }]);
        expect(run('mkdir').output).toEqual({ kind: 'text', text: 'mkdir: missing operand' });
        expect(run('clear').effects).toEqual([{ type: 'clear' }]);
        expect(run('exit').effects).toEqual([{ type: 'close' }]);
    });

    it('opens apps by command, with no argument or "."', () => {
        expect(run('code').effects).toEqual([{ type: 'openApp', id: 'vscode' }]);
        expect(run('code .').effects).toEqual([{ type: 'openApp', id: 'vscode' }]);
        expect(run('code foo').output?.kind).toBe('text');
    });

    it('runs custom commands and hides hidden ones from the list', () => {
        expect(run('hello there').output).toEqual({ kind: 'text', text: 'hi there' });
        expect(run('upload').effects).toEqual([{ type: 'openUrl', url: './drop/' }]);
        expect(availableCommands(config)).toEqual(['cd', 'ls', 'pwd', 'echo', 'clear', 'exit', 'mkdir', 'code', 'music', 'hello']);
    });

    it('explains unknown commands', () => {
        const output = run('nonsense').output;
        expect(output?.kind === 'text' && output.text).toMatch(/^Command 'nonsense' not found.*\nAvailable Commands: \[ cd, ls/);
    });

    it('ignores blank input', () => {
        expect(run('   ')).toEqual({ state: initialState });
    });
});
