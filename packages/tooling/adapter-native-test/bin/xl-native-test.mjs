#!/usr/bin/env node
// Compiles and runs the native tests of the package in the current folder (src/cli.mjs).
import { main } from '../src/cli.mjs';

process.exit(main());
