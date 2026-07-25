// T4 failure-lineage grader — applies the FROZEN read only.
// Prereg: docs/02-experiments/N3-T4-FAILURE-LINEAGE-PREREG.md (frozen 24d4f1e).
//   PRIMARY   readBeforeWrite (STRUCTURAL — cannot be satisfied by quoting the note)
//   SECONDARY G1 read-source-for-exact-behavior; G3 tree-must-actually-change
//   EXCLUDED  G2 environ (confounded by the spec; declared invalid BEFORE any number)
//   CARRIED   winShape proxy, first-draft validity (F53's hypothesis, pre-registered here)
//
//   node scripts/n3-t4-grade.mjs [rawfile]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = process.argv[2] ?? fileURLToPath(new URL('../scratch-n3-t4.jsonl', import.meta.url));
const rows = readFileSync(raw, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const WRITE = ['write', 'edit'];
const G1 = /(read|inspect|extract|study)[^.]{0,100}(source|assess\.py|module|implementation)[^.]{0,140}(exact|actual|current|logic|constant|threshold)|extract the exact/i;
const G3 = /byte-identical|identical re-?write|must (actually )?change|new test file|distinct file/i;

/** PRIMARY: a read-only step that inspects code, ordered before the first write-class step. */
function readBeforeWrite(plan) {
  const steps = plan?.steps ?? [];
  const firstWrite = steps.findIndex((s) => (s.tools ?? []).some((t) => WRITE.includes(t)));
  if (firstWrite < 0) return false;                    // no write step at all
  return steps.slice(0, firstWrite).some((s) => {
    const ro = (s.tools ?? []).length && !(s.tools ?? []).some((t) => WRITE.includes(t));
    return ro && /read|grep|inspect|review|examine|survey|analyz/i.test(String(s.action ?? ''));
  });
}

const by = {};
for (const r of rows) {
  const b = (by[r.arm] ??= { n: 0, invalid: 0, err: 0, trunc: 0, scored: [] });
  b.n++;
  if (r.error) { b.err++; continue; }
  if (r.truncated) { b.trunc++; continue; }
  if (r.valid === false) { b.invalid++; continue; }
  if (!r.plan) continue;
  const t = JSON.stringify(r.plan);
  b.scored.push({ primary: readBeforeWrite(r.plan), g1: G1.test(t), g3: G3.test(t), nSteps: (r.plan.steps ?? []).length });
}

const rate = (v, k) => v.length ? v.filter((x) => x[k]).length / v.length : NaN;
const fmt = (x) => Number.isNaN(x) ? ' -- ' : x.toFixed(2);

console.log(`\n=== T4 — failure-lineage (frozen read) — ${raw} ===`);
console.log(`arm      n  ok   PRIMARY readBeforeWrite   G1 read-source   G3 tree-change   validity(1-invalid)`);
for (const a of ['Q0', 'Qfail']) {
  const d = by[a]; if (!d) continue;
  const v = d.scored;
  console.log(`${a.padEnd(7)} ${String(d.n).padStart(2)} ${String(v.length).padStart(3)}      ${fmt(rate(v, 'primary'))}                ${fmt(rate(v, 'g1'))}            ${fmt(rate(v, 'g3'))}            ${fmt((d.n - d.invalid) / d.n)}` +
    (d.err || d.trunc || d.invalid ? `   [err ${d.err} trunc ${d.trunc} invalid ${d.invalid}]` : ''));
}
const p0 = by.Q0 ? rate(by.Q0.scored, 'primary') : NaN;
const p1 = by.Qfail ? rate(by.Qfail.scored, 'primary') : NaN;
console.log(`\nPRIMARY delta (Qfail - Q0): ${Number.isNaN(p1 - p0) ? '--' : (p1 - p0).toFixed(2)}`);
console.log(`(Frozen rule: Qfail ~ Q0 => readable arm DEAD across every constructible axis.\n Qfail materially above Q0 => promoted to a PLAN-LEVEL claim, enters the battery.\n G2/environ is EXCLUDED by the freeze. Plan-level only — never an outcome claim.)`);
