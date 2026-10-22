// The Pi's terminal: a small shell in front of the Python runtime. It answers what a beginner types on a real Pi
// (ls, cat main.py, python3 main.py, i2cdetect -y 1, pinout) and opens the Python prompt; anything it doesn't know
// gets bash's answer. Pure: the worker supplies the script and the I²C bus, and carries out the action.

export const SHELL_PROMPT = 'pi@botlab:~ $ ';
export const PY_PROMPT = '>>> ';
export const PY_MORE = '... ';

export interface ShellContext {
    /** main.py */
    script: string;
    /** Addresses answering on I²C bus 1 */
    scan(): number[];
}

export interface ShellResult {
    output: string[];
    /** What the worker should do next */
    action?: 'run' | 'python' | 'clear';
}

const HELP = [
    'Bot Lab’s Raspberry Pi understands:',
    '  python3 main.py   run the script (same as ▶ Run)',
    '  python3           the Python prompt (exit() to leave)',
    '  cat main.py       show the script;  ls  list files',
    '  i2cdetect -y 1    the I²C devices on GPIO2/GPIO3',
    '  pinout            the header’s pins',
    '  clear             clear the screen',
    'Ctrl+C (or ■ Stop) ends a running script.',
];

const PINOUT = [
    '      3V3  (1) (2)  5V',
    '    GPIO2  (3) (4)  5V        GPIO2 = I²C SDA',
    '    GPIO3  (5) (6)  GND       GPIO3 = I²C SCL',
    '    GPIO4  (7) (8)  GPIO14',
    '      GND  (9) (10) GPIO15',
    '   GPIO17 (11) (12) GPIO18    GPIO18 = PWM0',
    '   GPIO27 (13) (14) GND',
    '   GPIO22 (15) (16) GPIO23',
    '      3V3 (17) (18) GPIO24',
    '   GPIO10 (19) (20) GND',
    '    GPIO9 (21) (22) GPIO25',
    '   GPIO11 (23) (24) GPIO8',
    '      GND (25) (26) GPIO7',
    '    GPIO0 (27) (28) GPIO1',
    '    GPIO5 (29) (30) GND',
    '    GPIO6 (31) (32) GPIO12',
    '   GPIO13 (33) (34) GND',
    '   GPIO19 (35) (36) GPIO16',
    '   GPIO26 (37) (38) GPIO20',
    '      GND (39) (40) GPIO21',
];

/** i2cdetect's table: rows of 16 addresses, "--" where nothing answers, 0x03–0x77 scanned. */
export function i2cdetect(found: number[]): string[] {
    const lines = ['     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f'];
    for (let row = 0; row < 8; row++) {
        let line = `${(row * 16).toString(16).padStart(2, '0')}:`;
        for (let col = 0; col < 16; col++) {
            const addr = row * 16 + col;
            line += addr < 3 || addr > 0x77 ? '   ' : found.includes(addr) ? ` ${addr.toString(16).padStart(2, '0')}` : ' --';
        }
        lines.push(line.trimEnd());
    }
    return lines;
}

/** Splits a command line into words, honouring quotes. */
function words(line: string): string[] {
    const out: string[] = [];
    for (const m of line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
}

export function shell(line: string, ctx: ShellContext): ShellResult {
    const [cmd = '', ...args] = words(line.trim());
    switch (cmd) {
        case '': return { output: [] };
        case 'help': return { output: HELP };
        case 'clear': return { output: [], action: 'clear' };
        case 'ls': return { output: args.length === 0 || args.every(a => a.startsWith('-')) ? ['main.py'] : args.filter(a => !a.startsWith('-')).map(a => a === 'main.py' ? a : `ls: cannot access '${a}': No such file or directory`) };
        case 'cat': {
            const files = args.filter(a => !a.startsWith('-'));
            if (!files.length) return { output: ['cat: reading from the keyboard isn’t supported here; try cat main.py'] };
            return { output: files.flatMap(f => f === 'main.py' || f === './main.py' ? ctx.script.replace(/\n$/, '').split('\n') : [`cat: ${f}: No such file or directory`]) };
        }
        case 'python': case 'python3': {
            if (args.length === 0) return { output: ['Python 3 on Bot Lab’s Pi (Pyodide). gpiozero, RPi.GPIO, pigpio and smbus2 drive the bench. exit() to leave.'], action: 'python' };
            if (args[0] === '--version' || args[0] === '-V') return { output: ['Python 3'] };
            if (args[0] === 'main.py' || args[0] === './main.py') return { output: [], action: 'run' };
            return { output: [`${cmd}: can't open file '${args[0]}': [Errno 2] No such file or directory (the script is main.py)`] };
        }
        case 'i2cdetect': {
            const bus = args.filter(a => !a.startsWith('-'))[0];
            if (bus === undefined) return { output: ['Error: No i2c-bus specified!', 'Usage: i2cdetect -y 1'] };
            if (bus !== '1') return { output: [`Error: Could not open file \`/dev/i2c-${bus}': No such file or directory`] };
            return { output: i2cdetect(ctx.scan()) };
        }
        case 'pinout': return { output: PINOUT };
        case 'pip': case 'pip3': return { output: ['Bot Lab’s Pi is offline. It has gpiozero, RPi.GPIO, pigpio, smbus2 and Python’s standard library.'] };
        case 'sudo': return args.length ? shell(args.join(' '), ctx) : { output: ['usage: sudo command'] };
        case 'exit': case 'logout': return { output: ['(this terminal stays open; there’s nowhere to log out to)'] };
        default: return { output: [`bash: ${cmd}: command not found (try help)`] };
    }
}
