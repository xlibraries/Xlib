import { describe, expect, it } from 'vitest';
import * as web from '../src/index';

describe('the package entry', () => {
    it('exports the page-side helpers', () => {
        expect(Object.keys(web).sort()).toEqual(['BACKEND_LABEL', 'BUTTONS', 'NO_PAD', 'deadzone', 'pickBackend', 'readPad', 'samePad', 'webgl2Available', 'webgpuAvailable']);
    });
});
