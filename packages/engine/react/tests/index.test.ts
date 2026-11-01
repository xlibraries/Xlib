import { describe, expect, it } from 'vitest';
import * as react from '../src/index';

describe('the package entry', () => {
    it('exports the view and its helpers', () => {
        expect(Object.keys(react).sort()).toEqual(['EngineView', 'applyVolume', 'screenPitch', 'tiltLean']);
    });
});
