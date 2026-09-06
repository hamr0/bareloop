#!/usr/bin/env node
// Export M2 — a thin adapter. ALL logic lives in `src/cli.js`; this file only
// supplies the real deps and turns the returned exit code into
// `process.exitCode` (never `process.exit()`, which can discard queued
// stdout under a slow reader).
import { main } from '../src/cli.js';

// A reader closing early (e.g. `| head`) makes a queued stdout write throw
// EPIPE — the one legitimate `process.exit()` in this file: the reader is
// gone, so there is no more queued output to lose by exiting immediately,
// and re-throwing would print a scary stack trace for ordinary pipe usage.
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

const code = await main(process.argv.slice(2), {
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  stdin: process.stdin,
});
process.exitCode = code;
