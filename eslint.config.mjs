// Lint rules for packages/* (the site in apps/web has its own Next.js config). Each package runs
// `eslint .` from its folder; ESLint finds this file by walking up.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    { ignores: ['**/node_modules/**', 'apps/**', 'packages/*/dist/**', 'packages/*/build/**', 'packages/*/.tools/**'] },
    ...tseslint.configs.recommended,
    {
        rules: { '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }] },
    },
    {
        files: ['**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
    {
        // Test fakes are loosely typed on purpose
        files: ['**/tests/**'],
        rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
);
