import { describe, expect, it } from 'vitest';
import { evaluate, HELP, type Scope } from '../src/evaluate';

describe('evaluate', () => {
    it('does arithmetic with precedence and functions', () => {
        expect(evaluate('2+3*4', {})).toBe('14');
        expect(evaluate('sqrt(16) + 2^3', {})).toBe('12');
        expect(evaluate('5!', {})).toBe('120');
    });

    it('remembers variables across lines', () => {
        const scope: Scope = {};
        expect(evaluate('x=5', scope)).toBe('5');
        expect(evaluate('x*x', scope)).toBe('25');
    });

    it('reports bad input instead of throwing', () => {
        expect(evaluate('2+*', {})).toBe('Invalid Expression');
        expect(evaluate('y+1', {})).toMatch(/undefined variable: y/);
    });

    it('rejects comparison and logic operators', () => {
        expect(evaluate('1 < 2', {})).toBe('Invalid Expression');
    });

    it('has help text', () => {
        expect(HELP).toContain('Square root of x');
    });
});
