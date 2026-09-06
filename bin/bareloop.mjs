#!/usr/bin/env node
// Export M2 — a thin adapter. ALL logic lives in `src/cli.js`; this file only
// supplies the real deps and turns the returned exit code into
// `process.exitCode` (never `process.exit()`, which can discard queued
// stdout under a slow reader).
import { main } from '../src/cli.js';

const code = await main(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  stdin: process.stdin,
});
process.exitCode = code;
