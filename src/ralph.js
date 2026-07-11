// The outer shell — fixed, deliberately dumb, permanent (PRD §4). It holds the
// arbiter (the close: exit code = truth) and the iteration budget, and nothing
// inside negotiates with either (design law #1: the agent never authors its
// arbiter). Stateless across runs and stdlib-only by design: it must stay too
// dumb to be gamed. Do not make it smarter.

import { spawnSync } from 'node:child_process';

/**
 * Run a close command; its exit code is the verdict (hard green, PRD §4).
 * 0 → satisfied; nonzero → needs_revision (gap fed back); spawn error → failed (terminal).
 * @param {string[]} close argv, e.g. ['node', '--test', 'close/']
 */
export function runClose(close) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a `node --test` close inherits this from a test runner and silently no-ops — a fake green
  const r = spawnSync(close[0], close.slice(1), { env, encoding: 'utf8', timeout: 120_000 });
  if (r.error) return { verdict: 'failed', detail: String(r.error) };
  if (r.status === 0) return { verdict: 'satisfied' };
  return { verdict: 'needs_revision', gap: (r.stderr || r.stdout || '').slice(0, 2000), exitCode: r.status };
}

/**
 * The loop: `while close-red and under-cap: run the middle`. Stops at first
 * green (within-run tuning past a visible close is the fit-to-pass surface,
 * PRD §2). The two honest terminals are green and a decision-ready escalation;
 * cap-halt means "not under cap", its own category, never merged with "wrong"
 * (design law #8). A broken close escalates immediately — a broken arbiter
 * must not masquerade as a bad harness.
 *
 * A middle that throws is read through the failure map: a throw carrying
 * `category: 'cap-halt'` (the USD gate tripping inside the middle) escalates
 * as cap-halt; any other named category is relayed as-is; an unnamed throw is
 * an interpreter-red — a broken interpreter must not masquerade as a bad
 * harness. Ralph never interprets, only relays.
 *
 * @param {object} opts
 * @param {(iteration: number, gap?: string) => void|Promise<void>} opts.middle the emergent middle; never sees close/cap
 * @param {string[]} opts.close argv whose exit code is truth
 * @param {number} opts.capRuns budget: max middle runs
 * @param {(type: string, data?: object) => object} opts.emit a spine emitter
 * @returns {Promise<'green'|'escalated'>}
 */
export async function ralph({ middle, close, capRuns, emit }) {
  emit('run-start', { capRuns, close: close.join(' ') });
  const verdicts = [];
  let gap;
  for (let iteration = 1; iteration <= capRuns; iteration++) {
    emit('iteration-start', { iteration });
    try {
      await middle(iteration, gap);
    } catch (e) {
      // dumb passthrough: the thrower names its category (cap-halt | gate-red | …)
      const category = e && typeof e.category === 'string' ? e.category : 'interpreter-red';
      if (category === 'cap-halt') emit('cap-halt', { category, meaning: 'not under cap — not "can\'t"', detail: String(e.message || e) });
      const DECISIONS = {
        'cap-halt': [`Budget gate tripped mid-run (${e && e.message}). Continue with a higher cap, change approach, or stop?`,
          ['raise the cap and rerun', 'change the middle/harness', 'abandon the task']],
        'gate-red': ['The gate denied an action mid-run — the harness asked for something outside its scope.',
          ['widen the write scope deliberately', 'change the middle/harness', 'abandon the task']],
      };
      const [decision, options] = DECISIONS[category]
        ?? ['The middle itself broke — no harness verdict is trustworthy until it is fixed.', ['fix the interpreter', 'abandon the task']];
      emit('escalation', {
        category, decisionReady: true, verdicts,
        spend: { runs: iteration, capRuns },
        decision, options, detail: String(e.message || e),
      });
      emit('run-end', { outcome: 'escalated', iterations: iteration });
      return 'escalated';
    }
    emit('middle-done', { iteration });
    const v = runClose(close);
    verdicts.push(v.verdict);
    emit('close-verdict', { iteration, ...v });
    if (v.verdict === 'satisfied') {
      emit('run-end', { outcome: 'green', iterations: iteration });
      return 'green';
    }
    if (v.verdict === 'failed') {
      emit('escalation', {
        category: 'broken-close', decisionReady: true, verdicts,
        spend: { runs: iteration, capRuns },
        decision: 'The close itself cannot run — no verdict is trustworthy until it is fixed.',
        options: ['fix the close command', 'abandon the task'],
        detail: v.detail,
      });
      emit('run-end', { outcome: 'escalated', iterations: iteration });
      return 'escalated';
    }
    gap = v.gap; // feedback for the next middle run; the shell itself learns nothing
  }
  emit('cap-halt', { category: 'cap-halt', meaning: 'not under cap — not "can\'t"', capRuns });
  emit('escalation', {
    category: 'cap-halt', decisionReady: true, verdicts,
    spend: { runs: capRuns, capRuns },
    decision: `${capRuns}/${capRuns} runs spent, close still red. Continue, change approach, or stop?`,
    options: ['raise the cap and rerun', 'change the middle/harness', 'abandon the task'],
  });
  emit('run-end', { outcome: 'escalated', iterations: capRuns });
  return 'escalated';
}
