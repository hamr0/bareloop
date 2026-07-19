// Shared test fixtures (N2 module 5). The scripted provider is the legitimate
// seam — the provider is a SHELL-owned binding by design — but its response
// envelope was hand-copied across the run/interpret/extract suites, and two
// envelopes drifting apart are two instruments. ONE envelope, ONE scripted
// stub, ONE sum-suite scaffold, ONE spine reader. Envelope semantics worth
// keeping exact: costUsd uses `'in'`, never `??` — an entry's EXPLICIT
// undefined/null is the unpriced case (F6) and must never be laundered into
// the priced default.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const GOOD_SUM = 'export function sum(a, b) { return a + b; }\n';
export const BAD_SUM = 'export function sum(a, b) { return a - b; }\n';

/**
 * The ONE provider response envelope every stub returns.
 * @param {{text?: string, toolCalls?: object[], costUsd?: number|null, usage?: object, stopReason?: string}} entry
 * @param {number} [fallbackCostUsd] priced default when the entry stays silent
 */
export const reply = (entry, fallbackCostUsd = 0.001) => ({
  text: entry.text ?? '',
  toolCalls: entry.toolCalls ?? [],
  // the four tiers the provider prices SEPARATELY — a stub that reports only
  // input/output cannot exercise the cache-read path, which is precisely where
  // re-sent context hides (F18)
  usage: { inputTokens: 10, outputTokens: 10, ...(entry.usage ?? {}) },
  costUsd: 'costUsd' in entry ? entry.costUsd : fallbackCostUsd,
  // BA-6: the real Loop reads stopReason to detect a truncated round. Default null
  // reproduces pre-BA-6 behaviour (a finished turn), so existing scripts are unaffected.
  stopReason: entry.stopReason ?? null,
  model: null,
});

/**
 * Scripted provider: returns each script entry in turn (sticks on the last),
 * records each prompt in `calls`.
 * @param {Array<{text?: string, toolCalls?: object[], costUsd?: number|null, usage?: object}>} script
 */
export function scriptedProvider(script) {
  /** @type {string[]} */
  const calls = [];
  /** @type {string[]} the system prompt per call — Loop prepends it as messages[0] (the persona IS shell territory, F16) */
  const systems = [];
  /** @type {string[][]} the tool names OFFERED per call — the menu is the grant (2b), so what reaches the provider is the observable */
  const toolsOffered = [];
  return {
    calls,
    systems,
    toolsOffered,
    /**
     * @param {Array<{role?: string, content: string}>} messages
     * @param {Array<{name: string}>} [tools] loop.run forwards its toolDefs here (bare-agent loop.js: provider.generate(toSend, activeTools, options))
     */
    async generate(messages, tools) {
      const s = script[Math.min(calls.length, script.length - 1)];
      if (messages[0]?.role === 'system') systems.push(messages[0].content);
      calls.push(messages.at(-1).content);
      toolsOffered.push((tools ?? []).map((t) => t.name));
      return reply(s);
    },
  };
}

/**
 * The sum-suite scaffold: the artifact lives under src/ (inside the fixture
 * writeScope "src/**"); the suite lives OUTSIDE the scope — a workflow can
 * never edit its own close. breakSuite writes a close that can never green.
 * @param {string} base per-file tmp root
 * @param {string} name run directory name under base
 * @param {{breakSuite?: boolean}} [opts]
 */
export function makeSumWork(base, name, { breakSuite = false } = {}) {
  const workdir = join(base, name);
  mkdirSync(join(workdir, 'src'), { recursive: true });
  const suite = join(workdir, 'sum.test.mjs');
  writeFileSync(suite, breakSuite
    ? 'process.exit(1); // a close that can never green'
    : `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './src/sum.mjs';
test('adds', () => assert.equal(sum(2, 3), 5));`);
  return { workdir, target: join(workdir, 'src', 'sum.mjs'), close: ['node', '--test', suite], suiteCmd: `node --test ${suite}` };
}

/** ONE spine reader: parsed events in seq order. @param {string} file */
export const readSpine = (file) => readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** the valid workflow-config fixture, a fresh copy per call */
export const validConfig = () => JSON.parse(readFileSync(new URL('./fixtures/valid.json', import.meta.url), 'utf8'));
