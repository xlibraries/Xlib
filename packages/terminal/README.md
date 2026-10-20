# @xlibraries/terminal

An Ubuntu-style terminal and a calculator, as apps for the Xlib desktop
([xlibraries.com](https://xlibraries.com)). Both run on one shared `Prompt` component (input line, blinking
cursor, ↑/↓ history) and take the desktop's `host` from [`@xlibraries/app-sdk`](../app-sdk).

## Terminal

The terminal is built from a config, so the folders and commands are yours:

```tsx
import { createTerminal } from '@xlibraries/terminal';

const Terminal = createTerminal({
    user: 'aman',
    home: '/home/aman',
    files: { root: ['projects', 'notes'], projects: ['Xlib'] },   // what cd and ls see
    privateDirs: ['notes'],                                       // cd/ls refuse these
    apps: { code: 'vscode', music: 'music' },                    // `code` → host.openApp('vscode')
    commands: {
        hello: { run: (args) => ({ output: { kind: 'text', text: `hi ${args.join(' ')}` } }) },
        secret: { hidden: true, run: () => ({ effects: [{ type: 'openUrl', url: '/secret' }] }) },
    },
});

<Terminal host={host} />
```

Built in: `cd`, `ls`, `pwd`, `echo`, `mkdir` (→ `host.addFolder`), `clear`, `exit` (→ `host.close`).
Custom commands return `{ output?, effects? }`: output is text, a list or an image; effects are `openApp`,
`addFolder`, `openUrl`, `track`, `clear` and `close`. The interpreter (`runCommand`) is a pure function, so
commands are easy to test.

## Calc

`<Calc host={host} />`: arithmetic, functions (`sqrt`, `sin`, `log10`, …), factorial and variables (`x=5`,
then `x*2`), via [expr-eval](https://github.com/silentmatt/expr-eval). `help`, `clear` and `exit` work as in
the terminal.

## Notes

- Styling is inline (Ubuntu colours), so it needs no CSS setup or Tailwind.
- Ships TypeScript source; compile it with your bundler (in Next.js: `transpilePackages`).
- Tests: `pnpm test` (Vitest).
