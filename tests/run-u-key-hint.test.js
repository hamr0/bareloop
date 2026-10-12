// F187 — `scripts/run-u.mjs`'s printed invocation hints (the "To approve and
// run" line and the sleep-inhibitor wrapper line, both built through the
// SAME `invoke()` helper) used to hardcode `ANTHROPIC_API_KEY=...`
// regardless of the job's actual provider. A job on `openai-api` (DeepSeek)
// printed the wrong variable name to set — a person pasting the hint
// verbatim only got the right refusal by accident of the runner's own
// generic error message, never from the hint itself.
//
// Driven through the REAL script's PREVIEW path (no `--approve`, so nothing
// reads a key and nothing spends), the same instrument
// tests/reviewdoor-u.test.js/tests/hitl-u.test.js already use for run-u.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cleanEnv } from './helpers.js';

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;

// P8: the hint names the Settings ROW's own variable (there is no built-in key name). The scratch config home carries two rows —
// ANTHROPIC_API_KEY (Anthropic shape) and GW_KEY (OpenAI shape at the address the bench spec signs).
const preview = (job, model) => {
  const r = spawnSync(process.execPath, [RUNNER, '--job', job, ...(model ? ['--model', model] : [])], {
    encoding: 'utf8', timeout: 60_000, env: { ...cleanEnv({}, { rows: true }), ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === null) throw new Error(`run-u.mjs never exited (${r.error?.code ?? r.signal ?? 'no error'}):\n${out.slice(0, 400)}`);
  return { code: r.status, out };
};

test('an openai-shaped job (bareguard-types-gateway) prints its row\'s variable (GW_KEY) in its invocation hints, never another provider\'s', () => {
  const { code, out } = preview('bareguard-types-gateway', 'deepseek-flash');
  assert.equal(code, 0, out);
  assert.match(out, /GW_KEY=\.\.\. node scripts\/run-u\.mjs --job bareguard-types-gateway/, 'the approve line names the row the model line is on');
  assert.doesNotMatch(out, /ANTHROPIC_API_KEY|OPENAI_API_KEY/, 'no vendor key name anywhere in its preview');
});

test('an anthropic-shaped job (aurora-spawner) prints the variable of ITS row — the fix must not have flipped everyone to one name', () => {
  const { code, out } = preview('aurora-spawner');
  assert.equal(code, 0, out);
  assert.match(out, /ANTHROPIC_API_KEY=\.\.\. node scripts\/run-u\.mjs --job aurora-spawner/, 'the row is NAMED ANTHROPIC_API_KEY here by the fixture, not by the code');
  assert.doesNotMatch(out, /GW_KEY/);
});
