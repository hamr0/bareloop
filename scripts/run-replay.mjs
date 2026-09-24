#!/usr/bin/env node
// PANEL-BUILD.md P0 — a thin adapter. ALL logic lives in `src/cli.js`'s
// `bareloop replay` command (backed by `src/replayio.js`); this file only
// forwards argv (unparsed — `bareloop replay`'s own grammar owns `--all`)
// and turns the returned exit code into `process.exitCode` (never
// `process.exit()`, which can discard queued stdout under a slow reader) —
// the same ~10-line shape `bin/bareloop.mjs` already is over `src/cli.js`.
//
//   node scripts/run-replay.mjs <spine.jsonl>
//   node scripts/run-replay.mjs --all <dir>
import { main } from '../src/cli.js';

// A reader closing early (e.g. `| head`) makes a queued stdout write throw
// EPIPE — the one legitimate `process.exit()` in this file: the reader is
// gone, so there is no more queued output to lose by exiting immediately,
// and re-throwing would print a scary stack trace for ordinary pipe usage.
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

const code = await main(['replay', ...process.argv.slice(2)], {
  env: process.env, stdout: process.stdout, stderr: process.stderr, cwd: process.cwd(),
});
process.exitCode = code;
