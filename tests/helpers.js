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
import { execFileSync } from 'node:child_process';


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
 * Scripted NATIVE clipipe provider factory (BA-16 shape) — the analog of
 * `scriptedProvider` for the surface where the CLI owns the turn cycle. The
 * factory receives `{policy, onTurn, maxTurns}` (the per-worker governance the
 * runner clips onto the PROVIDER, not the Loop); the returned provider's
 * `generate()` runs ONE session per call: it meters each scripted turn through
 * `onTurn` (costUsd `null` — the CLI prices the SESSION), honors the gate
 * `policy` on tool turns (a deny SKIPS the tool, exactly as the bridge does),
 * bounds at `maxTurns` (surfacing `error:'max_turns'`), and closes with one
 * authoritative `kind:'session'` cost. `ownsCycle` + `session.usageReported`
 * reproduce the real provider's contract, so the real Loop drives it identically
 * (the live POC proved the REAL provider+gate; this drives OUR executor branch).
 * @param {Array<{turns: Array<{text?: string, tool?: string, args?: any}>, cost?: number}>} sessions
 *   one entry per `generate()` call (sticks on the last)
 */
export function scriptedNativeFactory(sessions) {
  // ONE script tape shared across every worker's provider (the runner builds a
  // fresh native provider per worker, so `s` must live OUT here — the analog of
  // scriptedProvider's single shared `calls` cursor; a per-provider counter
  // would replay scout→plan→step from the top for each worker).
  let s = 0;
  return ({ policy, onTurn, maxTurns, hasTools }) => {
    // FAITHFUL to the live-verified reality: a native session with NO tools fires
    // ZERO onTurn events and reports no cost, so the runner routes a toolless
    // worker (the drafter) through claude-json TEXT mode — a plain metered
    // result cost, exactly like an API round (via the Loop's onLlmResult). A fake
    // that fired onTurn for a toolless session would MASK the unmetered-spend bug
    // the live smoke caught (validate against the real instrument, not a fixture).
    if (!hasTools) {
      return {
        name: 'clipipe-native-text-stub',
        async generate() {
          const plan = sessions[Math.min(s++, sessions.length - 1)];
          const text = plan.turns.map((/** @type {any} */ t) => t.text ?? '').filter(Boolean).join('\n');
          return { text, toolCalls: [], usage: { inputTokens: 5, outputTokens: 5 }, model: 'clipipe', costUsd: plan.cost ?? 0.01, stopReason: null };
        },
      };
    }
    return {
      name: 'clipipe-native-stub',
      ownsCycle: true,
      /** @param {any} _messages @param {Array<{name: string, execute: Function}>} [tools] */
      async generate(_messages, tools = []) {
        const plan = sessions[Math.min(s++, sessions.length - 1)];
        let turns = 0; let toolCalls = 0; let lastText = ''; let error = null;
        // BA-11 on the NATIVE surface, spelled exactly as provider-clipipe-mcp.js
        // spells it: a single deny stays ADVISORY so the model can pivot to an
        // allowed tool; only a STREAK with no allowed call in between ends the
        // session with the `denied:<tool>` terminal. Any allowed call resets it.
        let consecutiveDenials = 0;
        const DENY_CAP = 3;
        const meter = async (/** @type {object} */ arg) => {
          try { await onTurn(arg); } catch (e) {
            if (e && /** @type {any} */ (e).name === 'HaltError') { error = error ?? `halt:${/** @type {any} */ (e).message}`; return false; }
            throw e;
          }
          return true;
        };
        for (const step of plan.turns) {
          if (turns >= maxTurns) { error = 'max_turns'; break; }
          turns += 1;
          if (!(await meter({ usage: { inputTokens: 5, outputTokens: 5 }, costUsd: null, pricing: null, kind: 'turn' }))) break;
          if (step.text !== undefined) { lastText = step.text; continue; }
          if (step.tool) {
            toolCalls += 1;
            let verdict;
            try { verdict = await policy(step.tool, step.args, undefined); }
            catch (e) { if (e && /** @type {any} */ (e).name === 'HaltError') { error = `halt:${/** @type {any} */ (e).message}`; break; } throw e; }
            if (verdict !== true) {
              // deny is advisory — the tool never runs (the fence held)
              consecutiveDenials += 1;
              if (consecutiveDenials >= DENY_CAP) { error = `denied:${step.tool}`; break; }
              continue;
            }
            consecutiveDenials = 0;
            const tool = tools.find((t) => t.name === step.tool);
            if (tool) await tool.execute(step.args);
          }
        }
        // the authoritative session cost (the CLI prices the whole session)
        await meter({ usage: {}, costUsd: plan.cost ?? 0.01, pricing: 'priced', kind: 'session' });
        return { text: lastText, toolCalls: [], usage: { inputTokens: 5, outputTokens: 5 }, model: 'clipipe', session: { turns, toolCalls, error, usageReported: true }, error };
      },
    };
  };
}

/** ONE spine reader: parsed events in seq order. @param {string} file */
export const readSpine = (file) => readFileSync(file, 'utf8').trimEnd().split('\n').filter(Boolean).map((l) => JSON.parse(l));

/**
 * ONE patient-repository maker. The WORK BRANCH hard rule (PRD v1.57 §3) makes a
 * git checkout a PRECONDITION of running a job at all — the run creates its own
 * branch before any write-capable worker can exist, and a patient with no
 * repository is an honest `branch-red` before a token is bought. So every
 * fixture patient that a runner is pointed at is a real repo with one commit,
 * exactly like the real ones.
 *
 * Global/system git config is neutralised so a developer's own `init.defaultBranch`,
 * hooks or templates cannot change what the fixture is — the handed branch is
 * always `main`, in CI and on every machine.
 * @param {string} dir an existing directory (its current contents become the seed commit)
 * @returns {string} the seed commit sha
 */
export function initPatientRepo(dir) {
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'bareloop-test', GIT_AUTHOR_EMAIL: 'test@bareloop',
    GIT_COMMITTER_NAME: 'bareloop-test', GIT_COMMITTER_EMAIL: 'test@bareloop',
  };
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env });
  git(['init', '-q', '-b', 'main']);
  // an EMPTY tree still needs a commit: `git checkout -b` works on an unborn head,
  // but the declared close's seed (`git rev-parse HEAD`) does not, and a fixture
  // that only half-resembles a patient is the fixture that hides the next defect.
  writeFileSync(join(dir, '.gitkeep'), '');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'seed']);
  return git(['rev-parse', 'HEAD']).trim();
}

/** which branch a patient is standing on right now. @param {string} dir */
export const currentBranch = (dir) => execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();

/** every local branch in a patient, sorted. @param {string} dir */
export const localBranches = (dir) => execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { cwd: dir, encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean).sort();

