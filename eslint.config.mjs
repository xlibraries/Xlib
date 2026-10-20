import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
    ...nextCoreWebVitals,
    ...nextTypescript,
    {
        rules: {
            // The desktop uses plain <img> on purpose (icons, external badges); next/image isn't a fit here
            "@next/next/no-img-element": "off",
            // Files still opted out of type checking; remove `// @ts-nocheck` file by file as they get typed
            "@typescript-eslint/ban-ts-comment": ["warn", { "ts-nocheck": true }],
        },
    },
    {
        // Test fakes (e.g. Google Apps Script services) are loosely typed on purpose
        files: ["tests/**"],
        rules: { "@typescript-eslint/no-explicit-any": "off" },
    },
    {
        ignores: [".next/**", "out/**", "node_modules/**", "public/**", "backend/**", "next-env.d.ts"],
    },
];

export default config;
