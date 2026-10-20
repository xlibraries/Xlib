import { describe, expect, it } from 'vitest';
import { deployPlan } from '../scripts/deploy.mjs';

describe('deployPlan', () => {
    it('pushes backend/ and updates the existing deployment', () => {
        expect(deployPlan({ scriptId: 'S1', deploymentId: 'D1' })).toEqual({
            claspJson: { scriptId: 'S1', rootDir: '.' },
            commands: [['push', '--force'], ['redeploy', 'D1', '--description', 'Deployed from the Xlib repo']],
        });
    });

    it('explains where to find missing ids', () => {
        expect(() => deployPlan({ deploymentId: 'D1' })).toThrow(/Script ID/);
        expect(() => deployPlan({ scriptId: 'S1' })).toThrow(/\/exec URL/);
    });
});
