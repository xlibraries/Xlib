import { describe, expect, it } from 'vitest';
import { i2cdetect, shell } from '../src/runtime/terminal';

const ctx = { script: 'from gpiozero import LED\nLED(17).on()\n', scan: () => [0x48, 0x68] };

describe('the Pi terminal', () => {
    it('i2cdetect -y 1 draws the real table', () => {
        const t = i2cdetect([0x48, 0x68]);
        expect(t[0]).toBe('     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f');
        expect(t[1]).toBe('00:          -- -- -- -- -- -- -- -- -- -- -- -- --');
        expect(t[5]).toBe('40: -- -- -- -- -- -- -- -- 48 -- -- -- -- -- -- --');
        expect(t[7]).toBe('60: -- -- -- -- -- -- -- -- 68 -- -- -- -- -- -- --');
        expect(t[8]).toBe('70: -- -- -- -- -- -- -- --');
        expect(shell('i2cdetect -y 1', ctx).output).toEqual(t);
        expect(shell('sudo i2cdetect -y 1', ctx).output).toEqual(t);
        expect(shell('i2cdetect -y 0', ctx).output[0]).toMatch(/i2c-0/);
    });

    it('runs the script, opens Python, shows the file', () => {
        expect(shell('python3 main.py', ctx).action).toBe('run');
        expect(shell('python main.py', ctx).action).toBe('run');
        expect(shell('python3', ctx).action).toBe('python');
        expect(shell('python3 other.py', ctx).output[0]).toMatch(/can't open file 'other.py'/);
        expect(shell('cat main.py', ctx).output).toEqual(['from gpiozero import LED', 'LED(17).on()']);
        expect(shell('ls -l', ctx).output).toEqual(['main.py']);
        expect(shell('clear', ctx).action).toBe('clear');
    });

    it('answers the rest like a shell', () => {
        expect(shell('', ctx).output).toEqual([]);
        expect(shell('help', ctx).output[0]).toMatch(/understands/);
        expect(shell('pinout', ctx).output.some(l => l.includes('GPIO2 = I²C SDA'))).toBe(true);
        expect(shell('pip install numpy', ctx).output[0]).toMatch(/offline/);
        expect(shell('rm -rf /', ctx).output).toEqual(['bash: rm: command not found (try help)']);
        expect(shell('cat "main.py"', ctx).output).toHaveLength(2);
    });
});
