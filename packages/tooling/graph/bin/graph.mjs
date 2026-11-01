#!/usr/bin/env node
// The dependency-graph check (src/cli.mjs says what it does).
import { main } from '../src/cli.mjs';

process.exit(main(process.argv.slice(2)));
