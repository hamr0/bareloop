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

const RUNNER = new URL('../scripts/run-u.mjs', import.meta.url).pathname;

const preview = (job) => {
  const r = spawnSync(process.execPath, [RUNNER, '--job', job], {
    encoding: 'utf8', timeout: 60_000, env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status === null) throw new Error(`run-u.mjs never exited (${r.error?.code ?? r.signal ?? 'no error'}):\n${out.slice(0, 400)}`);
  return { code: r.status, out };
};

test('an openai-api job (bareguard-types-deepseek) prints OPENAI_API_KEY in its invocation hints, never ANTHROPIC_API_KEY', () => {
  const { code, out } = preview('bareguard-types-deepseek');
  assert.equal(code, 0, out);
  assert.match(out, /OPENAI_API_KEY=\.\.\. node scripts\/run-u\.mjs --job bareguard-types-deepseek/, 'the approve line names the real provider key');
  assert.doesNotMatch(out, /ANTHROPIC_API_KEY/, 'an openai-api job must never print the anthropic key name anywhere in its preview');
});

test('an anthropic-api job (aurora-spawner) still prints ANTHROPIC_API_KEY — the fix must not have flipped everyone to one name', () => {
  const { code, out } = preview('aurora-spawner');
  assert.equal(code, 0, out);
  assert.match(out, /ANTHROPIC_API_KEY=\.\.\. node scripts\/run-u\.mjs --job aurora-spawner/);
  assert.doesNotMatch(out, /OPENAI_API_KEY/);
});
