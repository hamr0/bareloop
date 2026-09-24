#!/usr/bin/env node
// PANEL-BUILD.md P0 — a thin adapter. ALL logic lives in `src/interviewrun.js`
// (one argv-parsing `main(argv, deps)`); this file only supplies the real
// deps (stdin/stdout/stderr/env) and turns the returned exit code into
// `process.exitCode` (never `process.exit()`, which can discard queued
// stdout under a slow reader) — the same ~10-line shape `bin/bareloop.mjs`
// already is over `src/cli.js`.
import { main } from '../src/interviewrun.js';

// A reader closing early (e.g. `| head`) makes a queued stdout write throw
// EPIPE — the one legitimate `process.exit()` in this file: the reader is
// gone, so there is no more queued output to lose by exiting immediately,
// and re-throwing would print a scary stack trace for ordinary pipe usage.
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

const code = await main(process.argv.slice(2), {
  env: process.env, stdin: process.stdin, stdout: process.stdout, stderr: process.stderr,
});
process.exitCode = code;
