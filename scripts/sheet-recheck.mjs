#!/usr/bin/env node
// S5, ITEM33-BUILD "S5: surfaces and the $0 re-check". A dev/operator tool (scripts/ is not in the package `files`; it does not ship): it re-runs ONE run's signed sheet checks on the run's own saved FROZEN sheet and says ok, or
// names the mismatch. Reads only; writes nothing; no provider, no spend.
// usage: node scripts/sheet-recheck.mjs <run folder>     the folder holding resolved-spec.json and source-seed/ (a panel session folder).   exit 0 = ok, 1 = NOT OK (or unreadable), 2 = bad usage.
// What it does: (1) each sheet input the run recorded a `tableSha` for is read again from the run's frozen tree, its bytes held to the door's sha256 and its table to the recorded `tableSha`; (2) each sheet stage of the signed
// close is graded again by the same judge the run used (`gradeStep`), on the step file the worker wrote (`tree/output/steps/<n>.json`) and the frozen tables, and every check prints `ok <id>` or `RED <id> <gap words>`.
// What it does NOT do (named): it shares the run's CSV reader and judge (src/csv.js, src/rubricstep.js), so it proves the saved record is self-consistent and still holds, not that those readers are right; it never prints a cell.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tableSha } from 'bareguard';
import { parseCsv, sheetTable } from '../src/csv.js';
import { gradeStep, stepFileRel, sha256Of } from '../src/rubricstep.js';
import { sheetRolesOfParams } from '../src/sheetclaims.js';

const folder = process.argv[2];
if (!folder) { console.error('usage: node scripts/sheet-recheck.mjs <run folder>'); process.exit(2); }

let bad = false;
const say = (/** @type {string} */ s) => console.log(s);
const fail = (/** @type {string} */ s) => { say(s); bad = true; };
const readJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));

try {
  const dir = resolve(folder);
  const spec = readJson(join(dir, 'resolved-spec.json'));
  const into = join(dir, 'source-seed');
  const tree = join(into, 'tree');
  const manifest = readJson(join(into, 'source.json'));
  const stages = (Array.isArray(spec?.closeDecl?.stages) ? spec.closeDecl.stages : []).filter((/** @type {any} */ s) => s?.kind === 'rubric-step' && sheetRolesOfParams(s.params).length > 0);
  if (stages.length === 0) throw new Error('the signed job has no sheet checks');

  // 1. the frozen sheets and the fingerprints the run recorded
  /** @type {Record<string, any>} */ const tables = {};
  /** @type {Record<string, string>} */ const shas = {};
  for (const i of Array.isArray(manifest.inputs) ? manifest.inputs : []) {
    if (typeof i?.tableSha !== 'string') continue;
    const buf = readFileSync(join(tree, i.rel));
    const table = sheetTable(parseCsv(buf.toString('utf8')));
    const mine = tableSha(table);
    tables[i.label] = table;
    shas[i.label] = i.tableSha;
    if (sha256Of(buf) !== i.sha256) fail(`mismatch table ${i.label}: the saved sheet is not the bytes frozen at the source door`);
    else if (mine !== i.tableSha) fail(`mismatch table ${i.label}: the saved sheet gives ${mine}, the run recorded ${i.tableSha}`);
    else say(`ok table ${i.label} ${mine.slice(0, 12)}`);
  }

  // 2. each sheet stage, graded again on the claims its worker wrote
  for (const st of stages) {
    const n = st.params.step;
    const ids = st.params.parts.filter((/** @type {any} */ p) => p?.class === 'sheet').flatMap((/** @type {any} */ p) => p.checks.map((/** @type {any} */ c) => String(c.id)));
    const file = join(tree, stepFileRel(n));
    if (!existsSync(file)) { for (const id of ids) fail(`RED ${id} no step file for job line ${n}`); continue; }
    const bytes = readFileSync(file, 'utf8');
    const g = await gradeStep({ params: st.params, bytes, outputBytes: bytes, inputs: {}, tables }, shas);
    if (g.verdict === 'stopped') { for (const id of ids) fail(`RED ${id} stopped: ${g.fault}`); continue; }
    const gaps = Array.isArray(g.gapLines) ? g.gapLines : [];
    const raw = Array.isArray(g.rawGaps) ? g.rawGaps : [];
    for (const id of ids) {
      const mine = raw.filter((/** @type {any} */ x) => String(x.id ?? x.check) === id);
      if (mine.length === 0) say(`ok ${id}`);
      else fail(`RED ${id} ${gaps.filter((/** @type {string} */ l) => l.includes(`${id}`)).join('; ') || 'did not pass'}`);
    }
    // a red that names no check of the sheet (claim boxes missing, a shape fault) is still not ok
    for (const x of raw.filter((/** @type {any} */ y) => !ids.includes(String(y.id ?? y.check)))) fail(`RED line ${n} ${String(x.id ?? x.check)} ${String(x.kind ?? '')}`.trimEnd());
  }
} catch (e) {
  fail(`NOT OK could not re-check: ${/** @type {Error} */ (e).message}`);
}
say(bad ? 'NOT OK' : 'ok');
process.exitCode = bad ? 1 : 0;
