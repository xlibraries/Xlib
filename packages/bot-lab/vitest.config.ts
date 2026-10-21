import { defineConfig } from 'vitest/config';

// JSPI (WebAssembly stack switching) lets the Pi's Python suspend in time.sleep; Node 24 has it behind a flag
const execArgv = ['--experimental-wasm-jspi'];

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    // the bench and board tests emulate a 16 MHz chip plus a circuit solve 4800 times a second: slow on CI runners
    test: {
        include: ['tests/**/*.test.{ts,tsx,mjs}'], environment: 'node', testTimeout: 60_000,
        poolOptions: { forks: { execArgv }, threads: { execArgv } },
    },
});
