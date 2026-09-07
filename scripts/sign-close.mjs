#!/usr/bin/env node
// PRD item 27/M2 — the close-bytes signing helper
// (`docs/product/CLOSE-INTEGRITY-BUILD.md`). Fills every `close[].sha256`
// field a `jobs/<x>.json` spec's node-script (or bare-executable) close
// stages can address, from the REAL bytes on disk right now, and prints the
// old→new `jobSpecHash` so the operator sees exactly what a re-sign moves.
//
// NEVER writes unless `--write` is passed — this is a MINTING tool, and
// minting a signature is arbiter territory (`docs/product/CLOSE-INTEGRITY-BUILD.md`
// M2 §3: "the agent never writes this field"). A run with no `--write` is a
// dry run: it prints the same report and touches nothing.
//
// All the actual logic (`signCloseScripts`) lives in
// `src/close-integrity.js`, tested there directly — this file is a thin CLI
// wrapper (argv parsing, read/write JSON, print the report), the smaller of
// the two shapes the build doc offered ("a scripts/sign-close.mjs (or a
// bareloop sign-style helper... — pick the smaller, report the choice").
//
// usage:
//   node scripts/sign-close.mjs <jobs/x.json> [--write]
//   node scripts/sign-close.mjs --all [--write]   # every jobs/*.json whose
//                                                  # close names a script

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { signCloseScripts } from '../src/close-integrity.js';
import { jobSpecHash } from '../src/job.js';

const argv = process.argv.slice(2);
const write = argv.includes('--write');
const all = argv.includes('--all');
const files = argv.filter((a) => !a.startsWith('--'));

if (!all && files.length === 0) {
  console.error('sign-close: a job spec path is required, or --all for every jobs/*.json\n'
    + '  usage: node scripts/sign-close.mjs <jobs/x.json> [--write]\n'
    + '         node scripts/sign-close.mjs --all [--write]');
  process.exitCode = 2;
} else {
  const targets = all
    ? readdirSync('jobs').filter((f) => f.endsWith('.json')).map((f) => join('jobs', f))
    : files;

  /** @type {{ file: string, oldHash: string, newHash: string, changes: any[], missing: any[] }[]} */
  const report = [];
  let anyMissing = false;

  for (const file of targets) {
    const path = resolve(file);
    /** @type {any} */
    let spec;
    try {
      spec = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      console.error(`sign-close: ${file}: could not read/parse — ${/** @type {Error} */ (e).message}`);
      process.exitCode = 1;
      continue;
    }
    if (!Array.isArray(spec.close)) {
      console.log(`${file}: no command close (closeDecl or non-array) — nothing to sign, skipped`);
      continue;
    }
    // cwd for resolving a RELATIVE script path: the spec file's own
    // directory. Every shipped jobs/*.json today uses absolute cmd paths,
    // so this only matters for a future relative-path spec.
    const cwd = dirname(path);
    const oldHash = jobSpecHash(spec);
    const { spec: signed, changes, missing } = signCloseScripts(spec, cwd);
    const newHash = jobSpecHash(signed);
    report.push({ file, oldHash, newHash, changes, missing });
    if (missing.length) anyMissing = true;

    if (changes.length === 0 && missing.length === 0) {
      console.log(`${file}: no addressable script stages (nothing this rung can sign) — hash unchanged ${oldHash.slice(0, 12)}…`);
      continue;
    }
    console.log(`${file}:`);
    for (const c of changes) {
      console.log(`  ${c.stage}: ${c.old ? `${c.old.slice(0, 12)}…` : '<unsigned>'} -> ${c.new.slice(0, 12)}… (${c.path})`);
    }
    for (const m of missing) {
      console.log(`  ${m.stage}: MISSING — could not read ${m.path}; sha256 left untouched, spec NOT fully signable`);
    }
    console.log(`  jobSpecHash: ${oldHash} -> ${newHash}`);

    if (write) {
      if (missing.length) {
        console.log(`  ${file}: --write refused — ${missing.length} stage(s) unreadable, this spec is not fully signable yet`);
      } else {
        writeFileSync(path, `${JSON.stringify(signed, null, 2)}\n`);
        console.log(`  ${file}: written`);
      }
    }
  }

  if (!write && report.some((r) => r.changes.length > 0)) {
    console.log('\n(dry run — pass --write to actually write the signed spec(s) back to disk)');
  }
  if (anyMissing) process.exitCode = 1;
}
