#!/usr/bin/env node
// Compiles and runs the native tests of the package in the current folder (see src/index.mjs).
import { runNativeTests } from '../src/index.mjs';

try {
    runNativeTests(process.cwd());
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
