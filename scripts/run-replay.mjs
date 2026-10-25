#!/usr/bin/env node
// `bareloop replay` left the CLI (PRD v1.114, one menu); it lives here now. One run's whole story, reconstructed from its spine +
// gate-audit sidecar, printed as one page (formatReplay); or every spine in a directory, one aligned row each (formatAllLines).
// Read-only, $0, mints no verdict, writes nothing. The logic is the library's (`src/replayio.js`, `src/replay.js`); this file only
// parses the two forms and turns the result into an exit code (never `process.exit()`, which can discard queued stdout).
//
//   node scripts/run-replay.mjs <spine.jsonl>
//   node scripts/run-replay.mjs --all <dir>
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseJsonl, looksLikeSpine, replayOne, listSpines,
} from '../src/replayio.js';
import { formatReplay, formatAllLines } from '../src/replay.js';

// A reader closing early (e.g. `| head`) makes a queued stdout write throw
// EPIPE — the one legitimate `process.exit()` in this file: the reader is
// gone, so there is no more queued output to lose by exiting immediately,
// and re-throwing would print a scary stack trace for ordinary pipe usage.
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

/**
 * @param {string[]} args @param {string} cwd
 * @returns {number}
 */
function replayMain(args, cwd) {
  const out = (/** @type {string} */ s) => process.stdout.write(`${s}\n`);
  const err = (/** @type {string} */ s) => process.stderr.write(`${s}\n`);
  if (args[0] === '--all') {
    const dirArg = args[1];
    if (!dirArg) { err('usage: node scripts/run-replay.mjs --all <dir>'); return 1; }
    const dir = resolve(cwd, dirArg);
    if (!existsSync(dir)) { err(`no such directory: ${dir}`); return 1; }
    const entries = listSpines(dir);
    if (entries.length === 0) { out(`no .jsonl files found in ${dir}`); return 0; }
    out(formatAllLines(entries));
    return 0;
  }
  const spinePathArg = args[0];
  if (!spinePathArg) {
    err('usage: node scripts/run-replay.mjs <spine.jsonl>');
    err('       node scripts/run-replay.mjs --all <dir>');
    return 1;
  }
  const spinePath = resolve(cwd, spinePathArg);
  if (!existsSync(spinePath)) { err(`no such file: ${spinePath}`); return 1; }
  const spine = parseJsonl(spinePath);
  if (!looksLikeSpine(spine.records)) {
    err(`${spinePath} does not look like a spine (no job-start or run-start record found)`);
    return 1;
  }
  out(formatReplay(replayOne(spinePath, { preParsedSpine: spine })));
  return 0;
}

process.exitCode = replayMain(process.argv.slice(2), process.cwd());
