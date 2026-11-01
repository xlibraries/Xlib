/** @file `xl-native-test`: compiles and runs the native tests of the package in the current folder. */
import { runNativeTests } from './index.mjs';

/**
 * Runs xl-native-test.
 * @param io `cwd` (the package), `error` for output and `exec` for commands (replaceable, for tests).
 * @return The exit code (a promise of it): 0 when every test passes, 1 otherwise.
 */
export async function main({ cwd = process.cwd(), error = console.error, exec } = {}) {
    try {
        await runNativeTests(cwd, exec ? { exec } : {});
        return 0;
    } catch (err) {
        error(err.message);
        return 1;
    }
}
