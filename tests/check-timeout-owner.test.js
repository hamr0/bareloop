// F393 guard: ONE place decides what a timed-out check does to a leg - `closeFaultEnding` (src/ralph.js). No other src file may map a timed-out
// verdict to an outcome. This is a source scan (comments stripped), so a sixth site that branches on its own is caught the day it is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { closeFaultEnding } from '../src/ralph.js';

const SRC = new URL('../src', import.meta.url).pathname;
const OWNER = 'ralph.js';
const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
});
// code lines only: whole-line and trailing line comments and block comments dropped
const codeLines = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).split('\n')
  .map((l, i) => ({ n: i + 1, code: l.replace(/(^|\s)\/\/.*$/, '') }));

test('no src file but the owner maps a timed-out verdict to an outcome', () => {
  const offences = [];
  for (const f of files(SRC)) {
    if (f.endsWith(`/${OWNER}`)) continue;
    for (const { n, code } of codeLines(readFileSync(f, 'utf8'))) {
      const at = `${relative(SRC, f)}:${n}: ${code.trim()}`;
      // branching on the verdict next to an ending
      if (/['"]timed-out['"]/.test(code) && /(check-timeout|close-timeout|close-red|check-red|\breturn\b)/.test(code)) offences.push(at);
      // returning the ending (or the bare category) as an outcome
      if (/\breturn\b.*['"`](check|close)-timeout['"`]/.test(code)) offences.push(at);
      // an outcome picked by a literal fallback on the category
      if (/\?\?\s*['"`]check-timeout['"`]/.test(code)) offences.push(at);
    }
  }
  assert.deepEqual(offences, [], 'a timed-out check must end through closeFaultEnding (src/ralph.js) only');
});

test('the owner: a timed-out verdict ends check-timeout, carries the limit; the other faults have no outcome of their own', () => {
  const t = closeFaultEnding({ verdict: 'timed-out', detail: 'd', limitMs: 1234 });
  assert.equal(t?.outcome, 'check-timeout');
  assert.deepEqual(
    { category: t?.escalation.category, limitMs: t?.escalation.limitMs, ends: t?.escalation.ends, detail: t?.escalation.detail },
    { category: 'close-timeout', limitMs: 1234, ends: 'check-timeout', detail: 'd' },
  );
  for (const verdict of ['failed', 'killed', 'crashed', 'close-tampered']) {
    const e = closeFaultEnding({ verdict, detail: 'x' });
    assert.equal(e?.outcome, null, verdict);
    assert.equal(e?.escalation.ends, undefined, verdict);
  }
  assert.equal(closeFaultEnding({ verdict: 'satisfied' }), null);
  assert.equal(closeFaultEnding({ verdict: 'needs_revision' }), null);
  assert.match(closeFaultEnding({ verdict: 'timed-out' }, { decisionLead: 'Lead. ' })?.escalation.decision ?? '', /^Lead\. /);
});
