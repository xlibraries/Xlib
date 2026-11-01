#!/usr/bin/env node
// Builds the package in the current folder's native modules (src/cli.mjs says how).
import { main } from '../src/cli.mjs';

process.exit(await main(process.argv.slice(2)));
