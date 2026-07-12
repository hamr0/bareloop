// The outer shell — fixed, deliberately dumb, permanent (PRD §4). It holds the
// arbiter (the close: exit code = truth) and the iteration budget, and nothing
// inside negotiates with either (design law #1: the agent never authors its
// arbiter). Stateless across runs and stdlib-only by design: it must stay too
// dumb to be gamed. Do not make it smarter.

import { spawnSync } from 'node:child_process';

/**
 * Run a close command; its exit code is the verdict (hard green, PRD §4).
 * 0 → satisfied; nonzero → needs_revision (gap fed back); spawn error → failed (terminal).
 *
 * `redact` scrubs the close's own output at the SOURCE — before the gap becomes
 * a spine event or a worker prompt — so a secret a checked command echoes
 * (a 401 dumping an `Authorization: Bearer …` header) never enters the
 * append-only spine (the hard line). It is INJECTED, not imported: the shell
 * stays stdlib-only and un-gameable, and the redactor is a fixed shell
 * primitive (bareguard's, wired by the interpreter), never an emergent
 * component — so V4 holds. The shell's canonical emission IS the redacted text;
 * a benign gap is returned byte-identical (default: identity).
 * @param {string[]} close argv, e.g. ['node', '--test', 'close/']
 * @param {(s: string) => string} [redact] source scrubber; identity by default
 */
export function runClose(close, redact = (s) => s) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a `node --test` close inherits this from a test runner and silently no-ops — a fake green
  const r = spawnSync(close[0], close.slice(1), { env, encoding: 'utf8', timeout: 120_000 });
  if (r.error) return { verdict: 'failed', detail: String(r.error) };
  if (r.status === 0) return { verdict: 'satisfied' };
  // The gap must never be falsy: every consumer guards with `if (gap)` — an
  // empty-output red would silently kill gap feedback, after-red hooks, AND
  // stall detection, leaving the worker re-prompted byte-identically to the cap.
  // Redact BEFORE slicing so a token straddling the 2000-char bound can't survive.
  return { verdict: 'needs_revision', gap: redact(r.stderr || r.stdout || '').slice(0, 2000) || '(close exited nonzero with no output)', exitCode: r.status };
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
 * @param {(s: string) => string} [opts.redact] source scrubber for close output
 *   (secrets never enter the spine); injected so the shell stays stdlib-only
 * @returns {Promise<'green'|'escalated'>}
 */
export async function ralph({ middle, close, capRuns, emit, redact }) {
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
      // Object.hasOwn, not bare lookup: a category named after an
      // Object.prototype member ("toString") would return the inherited
      // function, and destructuring it would crash the shell inside its own
      // escalation path — the one place that must never break.
      const [decision, options] = (Object.hasOwn(DECISIONS, category) ? DECISIONS[category] : undefined)
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
    const v = runClose(close, redact);
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
