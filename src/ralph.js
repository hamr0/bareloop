// The outer shell — fixed, deliberately dumb, permanent (PRD §4). It holds the
// arbiter (the close: exit code = truth) and the iteration budget, and nothing
// inside negotiates with either (design law #1: the agent never authors its
// arbiter). Stateless across runs and stdlib-only by design: it must stay too
// dumb to be gamed. Do not make it smarter.

import { spawnSync } from 'node:child_process';

/**
 * Run a close command; its exit code is the verdict (hard green, PRD §4).
 * `expect` → satisfied; any other exit → needs_revision (gap fed back).
 *
 * THE FORBIDDEN ZONE (PRD v1.11, F17; adaptlearn F25/V10). The two clean bands
 * are green (exit == expect, judgment rendered) and red (exit != expect,
 * judgment rendered). Every other outcome rendered NO JUDGMENT and is therefore
 * NOT A VERDICT — it gets its own name and escalates; coercing one into a
 * verdict IS the instrument fault (law #8 generalized):
 *   - `failed`    — the close cannot RUN (spawn error).             → broken-close
 *   - `timed-out` — it ran and never finished judging.              → close-timeout
 *   - `killed`    — it died by signal (status null, no spawn error). → close-killed
 *   - `crashed`   — it ran, exited, and judged nothing.             → close-crashed
 * `timed-out` is split OUT of `failed` deliberately: "raise the timeout" and
 * "fix the argv" are different human decisions, so pooling them erases the
 * decision information the escalation exists to carry.
 *
 * `judged` is the judgment-rendered signal, and it is the hard one. Exit code
 * ALONE cannot separate a crash-at-load from an honest red — they are
 * byte-identical at this seam, and against `node --test` so are the test counts
 * (node synthesizes ONE failing test for the file that crashed, so a crash
 * reports `tests 1 / fail 1`, exactly like a one-assertion failure). So the
 * signal cannot be "zero judged"; it must be a FLOOR against a declared
 * baseline: litectx runs ~390 tests, and a run claiming it judged 1 did not
 * judge. `judged.pattern` extracts one integer from the close's own (redacted)
 * output; below `judged.min` the close crashed, WHATEVER its exit code says —
 * and that check runs on the GREEN side too: a close that exits 0 having judged
 * nothing is a confident fake green, the only real failure there is (law #8).
 * `judged` is OPTIONAL — a linter or a hitl close may have no count to give —
 * and its absence stamps `unaudited: true` so the blind spot is NAMED on the
 * record rather than passed off as a trustworthy exit code.
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
 * @param {{ timeoutMs?: number, cwd?: string, expect?: number, judged?: {pattern: string, min: number} }} [opts]
 *   close wall-clock cap (operator-set via the runner, never the config's — the
 *   agent must not author its arbiter's clock), the directory the close runs in
 *   (the workdir — the tree it is judging), the exit code the SIGNED spec calls
 *   success, and the judgment-rendered signal. All four are arbiter territory:
 *   the drafted workflow config cannot express any of them.
 * @returns {{verdict: 'satisfied'|'needs_revision'|'failed'|'timed-out'|'killed'|'crashed',
 *   gap?: string, exitCode?: number, signal?: string, detail?: string,
 *   judgedCount?: number|null, unaudited?: boolean}}
 */
export function runClose(close, redact = (s) => s, { timeoutMs = 120_000, cwd, expect = 0, judged } = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a `node --test` close inherits this from a test runner and silently no-ops — a fake green
  const r = spawnSync(close[0], close.slice(1), { env, cwd, encoding: 'utf8', timeout: timeoutMs });

  // ── forbidden zone, before any exit code is believed ──────────────────────
  if (r.error) {
    // spawnSync reports BOTH "cannot run" and "ran too long" through `error`;
    // they are different human decisions, so they get different names.
    const code = /** @type {NodeJS.ErrnoException} */ (r.error).code;
    if (code === 'ETIMEDOUT') return { verdict: 'timed-out', detail: `close exceeded ${timeoutMs}ms and was killed — it never finished judging` };
    return { verdict: 'failed', detail: String(r.error) };
  }
  // No spawn error and no exit status: the close died by signal (OOM, an
  // external kill). It did not fail — it never rendered an opinion.
  if (r.status === null) {
    return { verdict: 'killed', signal: r.signal ?? undefined, detail: `close died by signal ${r.signal ?? 'unknown'} — no judgment was rendered` };
  }

  // Redact at the SOURCE, before anything is read back: the count is extracted
  // from scrubbed text, so a secret in the close's output can never ride out on
  // the judged path any more than it can on the gap path (the hard line).
  const out = redact(r.stdout || '');
  const err = redact(r.stderr || '');

  // ── the judgment-rendered signal: did this close actually judge anything? ──
  // Checked on BOTH bands — an exit-0 close that judged nothing is a fake green.
  let judgedCount;
  if (judged) {
    const m = new RegExp(judged.pattern, 'm').exec(`${out}\n${err}`);
    const n = m ? Number(m[1]) : NaN;
    judgedCount = Number.isFinite(n) ? n : null; // honest null: no number rendered (F6)
    if (judgedCount === null || judgedCount < judged.min) {
      return {
        verdict: 'crashed', judgedCount, exitCode: r.status,
        detail: `close judged ${judgedCount ?? 'nothing'} of a declared floor of ${judged.min} — it exited ${r.status} without rendering judgment (a crash, not a verdict)`,
      };
    }
  }

  if (r.status === expect) return { verdict: 'satisfied', ...(judged ? { judgedCount } : { unaudited: true }) };
  // The gap must never be falsy: every consumer guards with `if (gap)` — an
  // empty-output red would silently kill gap feedback, after-red hooks, AND
  // stall detection, leaving the worker re-prompted byte-identically to the cap.
  // Bound AFTER redaction so a token straddling the bound can't survive.
  return {
    verdict: 'needs_revision',
    gap: boundGap(err || out) || `(close exited ${r.status}, expected ${expect}, with no output)`,
    exitCode: r.status,
    ...(judged ? { judgedCount } : { unaudited: true }),
  };
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
 * The forbidden zone, named (PRD v1.11). Each row is an outcome in which the
 * close rendered NO JUDGMENT — so it is not a verdict, it never feeds a gap
 * back, and it is never retried. They are kept SEPARATE on purpose: pooling
 * them would erase the decision information the escalation exists to carry —
 * "raise the timeout", "fix the argv", and "re-run, it was OOM-killed" are
 * three different human answers.
 * Exported because the RUNNER's close-first precheck runs the same arbiter
 * before any tokens: two maps would be two instruments, and two instruments
 * disagreeing about the same outcome is the fault this whole addendum exists
 * to close.
 * @type {Record<string, {category: string, decision: string, options: string[]}>}
 */
export const CLOSE_FAULTS = Object.freeze({
  failed: {
    category: 'broken-close',
    decision: 'The close itself cannot run — no verdict is trustworthy until it is fixed.',
    options: ['fix the close command', 'abandon the task'],
  },
  'timed-out': {
    category: 'close-timeout',
    decision: 'The close ran but never finished judging — it hit the timeout and was killed. It did not fail; it did not answer.',
    options: ['raise the close timeout', 'make the close faster', 'abandon the task'],
  },
  killed: {
    category: 'close-killed',
    decision: 'The close died by signal (OOM, or an external kill) — it rendered no judgment, so its exit tells you nothing about the tree.',
    options: ['re-run (a transient kill)', 'fix the close environment (memory, sandbox limits)', 'abandon the task'],
  },
  crashed: {
    category: 'close-crashed',
    decision: 'The close exited without judging anything — it crashed rather than failed. Its exit code is NOT a verdict, in either direction.',
    options: ['fix what makes the close crash at startup', 'fix the close argv', 'lower the declared judgment floor if the suite legitimately shrank', 'abandon the task'],
  },
});

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
 * @param {number} [opts.expect] the exit code the SIGNED spec calls success
 * @param {{pattern: string, min: number}} [opts.judged] the judgment-rendered signal
 * @returns {Promise<'green'|'escalated'>}
 */
export async function ralph({ middle, close, capRuns, emit, redact, closeTimeoutMs, cwd, expect, judged }) {
  emit('run-start', { capRuns, close: close.join(' ') });
  // The blind spot is NAMED, never hidden: with no judgment-rendered signal this
  // close cannot tell a crash from an honest red (they are byte-identical at the
  // exit-code seam), so the record says so out loud rather than passing the exit
  // code off as trustworthy (PRD v1.11).
  if (!judged) emit('close-unaudited', { close: close.join(' '), meaning: 'no judgment-rendered signal declared — a crash-at-load is indistinguishable from an honest red for this close' });
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
    const v = runClose(close, redact, { timeoutMs: closeTimeoutMs ?? 120_000, cwd, expect, judged });
    verdicts.push(v.verdict);
    emit('close-verdict', { iteration, ...v });
    if (v.verdict === 'satisfied') {
      emit('run-end', { outcome: 'green', iterations: iteration });
      return 'green';
    }
    // Forbidden zone: no judgment was rendered, so there is no verdict. Escalate
    // by the outcome's OWN name and never retry — retrying a broken arbiter is
    // the §5b violation adaptlearn found live in its shipped shell (F25/Z-3).
    const fault = Object.hasOwn(CLOSE_FAULTS, v.verdict) ? CLOSE_FAULTS[v.verdict] : undefined;
    if (fault) {
      emit('escalation', {
        category: fault.category, decisionReady: true, verdicts,
        spend: { runs: iteration, capRuns },
        decision: fault.decision, options: fault.options, detail: v.detail,
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
