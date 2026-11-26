// F399 parity pins, CLI readout (docs/product/ITEM33-BUILD.md Addendum 2026-11-25d, PARITY CHECKLIST "CLI readout").
// The readout lines "checks N runs · menu [...]" and "close first judgment ... → fix loop ran" are the run's OWN stdout, written from the leg's own events in src/userrun.js (allow-listed in
// tests/runread-guard.test.js: a writer, not a reader of a finished spine). Driven by the REAL engine over a scripted worker ($0, tests/sheet-surfaces-world.mjs): the SHEET and the worker's answer
// are authored (no real sheet run exists), the spine and the stdout are the engine's own; expected words are read off that spine by a plain scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRunList } from '../src/runlist.js';
import { runSheetJob } from './sheet-surfaces-world.mjs';

const spineOf = (/** @type {string} */ runid, /** @type {string} */ home) => readFileSync(/** @type {any} */ (readRunList({ home }).rows.find((x) => x.runid === runid)).spine, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('cli-readout-parity: the "checks" line counts the leg\'s check-run records and names the check menu; the "close" line is the FIRST judgment of the outer close, with "fix loop ran" only when a fix-loop record exists (authored sheet, real engine)', async () => {
  for (const [opts, want] of [[{}, { first: 'satisfied', fix: false }], [{ named: [7] }, { first: 'needs_revision', fix: true }]]) {
    const r = await runSheetJob(opts);
    const spine = spineOf(r.runid, r.home);
    const menu = spine.find((x) => x.type === 'check-menu').offered.join(', ');
    const n = spine.filter((x) => x.type === 'check-run').length;
    assert.match(r.out, new RegExp(`^checks    ${n} runs · menu \\[${menu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, 'm'));
    const oc = spine.findLast((x) => x.type === 'outer-close');
    assert.equal(oc.verdict, want.first);
    const fixed = spine.some((x) => x.type === 'fix-loop');
    assert.equal(fixed, want.fix);
    const outcome = spine.findLast((x) => x.type === 'job-end').outcome;
    assert.match(r.out, new RegExp(`^close     first judgment ${oc.verdict}${oc.stage ? ` \\(stage ${oc.stage}\\)` : ''}${fixed ? ` → fix loop ran → ${outcome}` : ''}$`, 'm'));
  }
});
