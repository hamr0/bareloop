#!/usr/bin/env node
// PRD item 33/M2 — the source front door's CLI (`docs/product/ITEM33-BUILD.md`,
// call site 1). A thin wrapper: parse argv, call `prepareSource`
// (src/source.js), print the tree path, the seed, and the exact next
// command. All the real logic lives in the library, tested there directly.
//
// $0, no provider: this is the mechanical step hamr's ruling put BEFORE any
// token spends — freezing a plain folder/file/URL into a hidden git tree so a
// later run and its close judge the same bytes.
//
// usage:
//   node scripts/prep-source.mjs --source <path-or-url> --into <dir> \
//     [--destination <absolute-directory>]
//
// D3 rework (hamr's ruling, 2026-09-12, `docs/product/ITEM33-BUILD.md`):
// destination is a DIRECTORY, never a filename — the job's output files are
// named by the agent and delivered from `output/` on a green, so there is no
// `--output` flag any more. `--destination` is optional on its own now (it
// used to be signed together with `--output`); the destination is a PER-RUN
// value recorded in the manifest, never a signed job-spec field.

import { resolve } from 'node:path';
import { prepareSource } from '../src/source.js';

const argv = process.argv.slice(2);
/** @param {string} name @returns {string|null} */
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : (argv[i + 1] ?? null);
};

const source = arg('source');
const into = arg('into');
const destination = arg('destination');

if (!source || !into) {
  console.error('prep-source: --source and --into are required\n'
    + '  usage: node scripts/prep-source.mjs --source <path-or-url> --into <dir> [--destination <absolute-directory>]');
  process.exitCode = 2;
} else {
  const result = await prepareSource({
    source,
    into,
    ...(destination === null ? {} : { destination: resolve(destination) }),
  });
  if (result.stop !== null) {
    console.error(`prep-source: REFUSED — ${result.code}: ${result.stop}`);
    process.exitCode = 2;
  } else {
    console.log(`tree      ${result.tree}`);
    console.log(`kind      ${result.manifest.kind}`);
    console.log(`manifest  ${result.manifestPath}`);
    console.log(`seed      ${result.manifest.seed}`);
    console.log(`files     ${result.manifest.files.length} (${result.manifest.files.reduce((n, f) => n + f.bytes, 0)}B)`);
    // M2b fix 5 — a redirect must never be invisible: a link that quietly
    // lands on a login page, an error page, or a different host is something a
    // person has to be able to SEE before a single token spends.
    if (result.manifest.finalUrl && result.manifest.finalUrl !== result.manifest.source) {
      console.log(`redirected  ${result.manifest.source}\n         →  ${result.manifest.finalUrl}   (CHECK this is the page you meant — a redirect can land on a login or error page)`);
    }
    if (result.manifest.destination) {
      console.log(result.manifest.kind === 'repo'
        ? `destination  ${result.manifest.destination}  (a repo source's destination is the WRITE FENCE — wiring into writeScope lands in a later milestone; nothing is copied out by this door for a repo source)`
        : `destination  ${result.manifest.destination}  (every non-empty file under output/ is delivered here, each under its own dated name, on a minted green)`);
    }
    // M2b fix 8 (hamr's ruling, verbatim in substance): the blast radius of a
    // folder source is the whole folder — everything in it is frozen, read and
    // judged. Said here, in `bareloop.context.md`, and beside the panel's
    // Source field (N6).
    if (result.manifest.kind === 'folder') {
      console.log('\nnote: make a new folder, put only the file(s) this job needs in it, point bareloop');
      console.log('      at that — never your original folder.');
    }
    console.log('\nnext:');
    console.log(`  node scripts/run-interview.mjs --patient ${result.tree}`);
    console.log(`  node scripts/run-author.mjs --patient ${result.tree} ...`);
  }
}
