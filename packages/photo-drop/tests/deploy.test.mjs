import { describe, expect, it } from 'vitest';
import { deployPlan } from '../scripts/deploy.mjs';

describe('deployPlan', () => {
    it('pushes backend/ and updates the existing deployment', () => {
        expect(deployPlan({ scriptId: 'S1', deploymentId: 'D1' })).toEqual({
            claspJson: { scriptId: 'S1', rootDir: '.' },
            configGs: null,
            commands: [['push', '--force'], ['redeploy', 'D1', '--description', 'Deployed from the Xlib repo']],
        });
    });

    it('explains where to find missing ids', () => {
        expect(() => deployPlan({ deploymentId: 'D1' })).toThrow(/Script ID/);
        expect(() => deployPlan({ scriptId: 'S1' })).toThrow(/\/exec URL/);
    });

    it('writes the admin key hash into config.gs for the push', () => {
        const hash = 'a'.repeat(64);
        expect(deployPlan({ scriptId: 'S1', deploymentId: 'D1', adminKeyHash: hash }).configGs).toContain(`const ADMIN_KEY_HASH = '${hash}';`);
        expect(() => deployPlan({ scriptId: 'S1', deploymentId: 'D1', adminKeyHash: 'not-a-hash' })).toThrow(/SHA-256/);
    });
});
