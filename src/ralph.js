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
 * `cwd` is where the close RUNS, and it is load-bearing (F8): a close is a
 * command in a repository — `npm test`, `make check` — and every one of them is
 * cwd-relative. Run it anywhere but the workdir and the arbiter judges the wrong
 * tree: exit-code-is-truth silently becomes exit-code-of-some-other-repo-is-truth.
 * The default (the runner's own cwd) exists only for callers with an absolute
 * close; the runner and the interpreter always pass the workdir.
 *
 * @param {string[]} close argv, e.g. ['node', '--test', 'close/']
 * @param {(s: string) => string} [redact] source scrubber; identity by default
 * @param {{ timeoutMs?: number, cwd?: string }} [opts] close wall-clock cap (operator-set via
 *   the runner, never the config's — the agent must not author its arbiter's clock)
 *   and the directory the close runs in (the workdir — the tree it is judging)
 */
export function runClose(close, redact = (s) => s, { timeoutMs = 120_000, cwd } = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a `node --test` close inherits this from a test runner and silently no-ops — a fake green
  const r = spawnSync(close[0], close.slice(1), { env, cwd, encoding: 'utf8', timeout: timeoutMs });
  if (r.error) return { verdict: 'failed', detail: String(r.error) };
  if (r.status === 0) return { verdict: 'satisfied' };
  // The gap must never be falsy: every consumer guards with `if (gap)` — an
  // empty-output red would silently kill gap feedback, after-red hooks, AND
  // stall detection, leaving the worker re-prompted byte-identically to the cap.
  // Redact BEFORE bounding so a token straddling the bound can't survive.
  return { verdict: 'needs_revision', gap: boundGap(redact(r.stderr || r.stdout || '')) || '(close exited nonzero with no output)', exitCode: r.status };
}

// Tail-biased bound: a test runner's useful output (the assertion diff, the
// failing case name) is at the END; head-only truncation fed the worker the
// preamble and dropped the cause (N2 queue, F2). Head sample kept so "what ran"
// stays visible; the marker is hygiene, not load-bearing (F3).
const GAP_HEAD = 400, GAP_TAIL = 1500;
function boundGap(s) {
  if (s.length <= GAP_HEAD + GAP_TAIL + 100) return s;
  return `${s.slice(0, GAP_HEAD)}\n…[${s.length - GAP_HEAD - GAP_TAIL} chars truncated]…\n${s.slice(-GAP_TAIL)}`;
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
 * @param {number} [opts.closeTimeoutMs] close wall-clock cap (shell/operator
 *   territory — the workflow config cannot express it)
 * @param {string} [opts.cwd] the directory every close runs in — the tree it is
 *   judging (F8: a cwd-relative close run elsewhere judges the wrong repository)
 * @returns {Promise<'green'|'escalated'>}
 */
export async function ralph({ middle, close, capRuns, emit, redact, closeTimeoutMs, cwd }) {
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
        'provider-red': ['The provider path failed mid-run (transport, not logic) — no verdict exists and the spend for the failed call is unknown (F6).',
          ['retry the run', 'fix the provider binding', 'abandon the task']],
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
    const v = runClose(close, redact, { timeoutMs: closeTimeoutMs ?? 120_000, cwd });
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
