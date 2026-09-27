// PANEL-BUILD.md P3 — the chat/authoring session engine. LAYERING LAW
// (PANEL-BUILD.md §2): this file is one more CALLER of the same `src/`
// library functions `bareloop interview`/`bareloop author` already call
// (`src/interviewrun.js`, `src/authorrun.js`) — it mirrors their library
// calls (the same functions, in the same order, with the same $0-before-paid
// discipline), it never drives either script's own readline loop, and it
// never reimplements anything arbiter-territory: `validateJob`,
// `jobSpecHash`, `prepareSigning`'s gates, `checkApproval` all stay in the
// library, called here exactly as `src/authorrun.js` calls them.
//
// WHAT THIS FILE DOES NOT DO: sign anything (`prepareSigning` only PREPARES —
// see its own doc, "it stops at prepareSigning"), spawn a run, or read a
// provider key anywhere but from the injected `env` (never logged, never
// sent to the page — `src/panel/server.js`'s own routes own that boundary).
//
// THE ASK CHANNEL: `runConfirmTurn` (via `authorCloseForJob`) takes one
// interactive seam, `ask(step) -> Promise<string|null>` — `src/authorrun.js`
// backs it with a readline loop over stdin; this backs the IDENTICAL seam
// with an HTTP-driven resolver queue of depth one (`answer()`, called from
// `src/panel/server.js`'s POST routes). Nothing here changes what a step
// means or what an answer does — only where the answer comes from.

import {
  mkdirSync, existsSync, writeFileSync, readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  prepareSource, proveDestination, missingDependencies, looksLikeRepoSource,
} from '../source.js';
import { detectLanguage } from '../detectlang.js';
import {
  validateJob, jobSpecHash, resolveWorkerModel,
} from '../job.js';
import {
  authorCloseForJob, assembleSpec, AUTHORED_SPEC_FIELDS, CONFIRM_AUTHORED_FIELDS, PLAIN_FOLDER_DEFERRED_FIELDS,
} from '../authorjob.js';
import { prepareSigning } from '../authorjob.js';
import {
  questionsFor, requiredAnswersFor, makeLoopGenerate, CONFIRM_SYSTEM,
} from '../authorflow.js';
import {
  resolveProvider, buildRunnerProviders, apiKeyProblem,
} from '../providers.js';
import { resolveJobJudge, defaultJudgeLoop } from '../judged.js';
import { closeJudges } from '../kinds.js';
import { redactSecrets } from '../validate.js';

/**
 * The job card's "Model" select — a fixed, small, source-grounded mapping
 * from a display id to the `{provider, baseUrl?}` pair `src/interviewrun.js`
 * itself documents (that script's own `--provider openai-api --base-url
 * https://api.deepseek.com/v1` usage line for DeepSeek): the panel builds no
 * provider table of its own, this is a UI convenience over the SAME two
 * provider identities the CLI already resolves through `resolveProvider`.
 * @type {Readonly<Record<string, {provider: string, baseUrl?: string}>>}
 */
export const MODEL_OPTIONS = Object.freeze({
  'claude-sonnet-5': Object.freeze({ provider: 'anthropic-api' }),
  'deepseek-flash': Object.freeze({ provider: 'openai-api', baseUrl: 'https://api.deepseek.com/v1' }),
});

/** the confirm turn's own fixed round cap (`src/authorflow.js`'s
 * `runConfirmTurn`: `for (let round = 1; round <= 2; round += 1)`) — named
 * here, once, rather than re-guessed at every `onPhase('confirm-round')`
 * below. Not itself exported from the library as a named constant (it is
 * the loop bound the confirm turn's own doc calls "D3" / "ruling 5"); this is
 * this file's one place that would need editing if that cap ever changed. */
const CONFIRM_ROUND_CAP = 2;

/** @param {string} name @returns {boolean} kebab-case slug, same rule `job.js`'s `SLUG_RE` enforces */
function isSlug(name) {
  return typeof name === 'string' && /^[a-z][a-z0-9-]*$/.test(name);
}

/**
 * `true` when `jobs/<name>.json` already exists in the repo's own jobs/ dir
 * (resolved from THIS module's own on-disk location, never `process.cwd()`,
 * the same rule `src/panel/server.js`'s `jobsDir()` follows) — P3 is new-jobs-
 * only (Q4=A), so a name collision refuses at $0 rather than silently
 * overwriting or authoring a second spec under one name.
 * @param {string} name
 * @param {{jobsDir?: string}} [opts] test seam
 * @returns {boolean}
 */
export function jobNameTaken(name, opts = {}) {
  const dir = opts.jobsDir ?? join(new URL('../../jobs', import.meta.url).pathname);
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).includes(`${name}.json`);
  } catch { return false; }
}

/**
 * `$0` validation of the job card fields the server must check BEFORE it
 * creates a session or spends anything — never inside the async pipeline,
 * so a bad card refuses synchronously, in the same HTTP response.
 * @param {any} card
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function validateJobCard(card) {
  if (!card || typeof card !== 'object') return { ok: false, error: 'missing job card' };
  const { draftingCapUsd, jobName, checkType, model, goal, source, destination, success, guardrails, capUsd } = card;
  if (typeof draftingCapUsd !== 'number' || !Number.isFinite(draftingCapUsd) || draftingCapUsd <= 0) {
    return { ok: false, error: 'Drafting $ cap is required and must be a positive number — there is no default (Q2=A)' };
  }
  if (!isSlug(jobName)) return { ok: false, error: 'Job name must be a kebab-case slug (letters, digits, dashes)' };
  if (jobNameTaken(jobName, card.jobsDirOverride ? { jobsDir: card.jobsDirOverride } : {})) {
    return { ok: false, error: `a job named "${jobName}" already exists — P3 is new jobs only (Q4=A)` };
  }
  if (checkType !== 'deterministic' && checkType !== 'rubric') return { ok: false, error: 'Check type must be deterministic or rubric' };
  if (!MODEL_OPTIONS[model]) return { ok: false, error: `Model must be one of: ${Object.keys(MODEL_OPTIONS).join(', ')}` };
  for (const [field, label] of [[goal, 'Goal'], [source, 'Source'], [destination, 'Destination'], [success, 'Success'], [guardrails, 'Guardrails']]) {
    if (typeof field !== 'string' || field.trim() === '') return { ok: false, error: `${label} is required` };
  }
  if (checkType === 'rubric' && (typeof card.judgeExamples !== 'string' || card.judgeExamples.trim() === '')) {
    return { ok: false, error: 'Judge examples is required for a rubric (soft-green) check type' };
  }
  if (typeof capUsd !== 'number' || !Number.isFinite(capUsd) || capUsd <= 0) {
    return { ok: false, error: '$ cap is required and must be a positive number' };
  }
  return { ok: true };
}

/**
 * ONE session's engine — created already RUNNING (the caller awaits nothing;
 * the pipeline drives itself, reporting through `state`). `state.pendingAsk`
 * is the ONE thing a person answers next; `answer()`/`send()`/`revise()`/
 * `signPrepare()` are the only ways in.
 * @param {any} card the validated job card (see {@link validateJobCard})
 * @param {{env?: Record<string,string|undefined>, sessionsRoot?: string, timeoutMs?: number,
 *   scout?: any, generate?: Function, confirmGenerate?: Function, authorFn?: Function,
 *   prepareSigningFn?: Function}} [deps] the last five are TEST SEAMS ONLY — see the note
 *   just above where each is read, below.
 * @returns {any} the session object
 */
export function createSession(card, deps = {}) {
  const env = deps.env ?? process.env;
  const sessionsRoot = deps.sessionsRoot ?? join(process.env.HOME ?? '/tmp', '.config', 'bareloop', 'panel-sessions');
  const timeoutMs = deps.timeoutMs ?? 300_000;
  // TEST SEAMS ONLY (never set by `src/panel/authorroutes.js`'s real caller):
  // override the declaration composer and/or `prepareSigning` itself so a
  // test can drive the REAL confirm turn / ask() channel / revise-round /
  // hash-matching machinery this file owns, without also re-running (and
  // re-proving) `authorClose`'s own composer ladder or `prepareSigning`'s own
  // gates — both already have their own test suites. Absent, both default to
  // the real library functions, exactly as production always runs.
  const authorFnOverride = deps.authorFn ?? null;
  const prepareSigningFn = deps.prepareSigningFn ?? prepareSigning;
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const outDir = join(sessionsRoot, id);
  mkdirSync(outDir, { recursive: true });

  /** @type {any} */
  const state = {
    id,
    phase: 'starting',
    messages: /** @type {{role: string, text: string}[]} */ ([]),
    pendingAsk: /** @type {any} */ (null),
    cost: /** @type {any} */ (null),
    revisesLeft: CONFIRM_ROUND_CAP,
    specHash: /** @type {string|null} */ (null),
    resolvedSpecPath: /** @type {string|null} */ (null),
    error: /** @type {string|null} */ (null),
    outDir,
  };

  /** @param {'bot'|'you'|'system'} role @param {string} text */
  const say = (role, text) => { state.messages.push({ role, text }); };

  /** @type {((value: string|null) => void)|null} */
  let resolvePending = null;

  /**
   * The confirm turn's own `ask` seam — HTTP-backed, depth one. `describe`
   * renders the SAME plain-language prompts `src/authorrun.js`'s own `ask`
   * writes to its terminal, adapted for the chat thread rather than stdout.
   * @param {{kind: string, [k: string]: any}} step
   * @returns {Promise<string|null>}
   */
  const ask = (step) => new Promise((resolveFn) => {
    state.pendingAsk = step;
    resolvePending = resolveFn;
    if (step.kind === 'worseThanBefore') say('bot', step.field?.prompt ?? 'Anything about this run that must not get worse than before?');
    else if (step.kind === 'language') say('bot', `${step.field?.prompt ?? 'Which language is this job about?'} (${(step.candidates ?? []).join(', ')})`);
    else if (step.kind === 'menu') {
      const p = step.plan ?? {};
      const lines = [`Plan: ${JSON.stringify(p.goal ?? '')}`, `Checks: ${(p.checks ?? []).join(' · ') || '(none)'}`];
      if ((p.notChecked ?? []).length) lines.push(`Not checked: ${p.notChecked.join(' · ')}`);
      if ((p.questions ?? []).length) lines.push(`Questions: ${p.questions.join(' · ')}`);
      lines.push('Sign & run to confirm this plan, or Revise to describe a change.');
      say('bot', lines.join('\n'));
    } else if (step.kind === 'answer') say('bot', `A question the plan raised (${step.index} of ${step.total}): ${step.question}`);
    else if (step.kind === 'goal') say('bot', 'Type the goal sentence yourself.');
    else if (step.kind === 'fix') say('bot', 'What should change?');
  });

  /** @param {string|null} value @returns {boolean} */
  const answer = (value) => {
    if (!resolvePending) return false;
    const r = resolvePending;
    resolvePending = null;
    state.pendingAsk = null;
    r(value);
    return true;
  };

  /** @param {'menu'|'fix'|'answer'|'worseThanBefore'|'language'|'goal'} kind @param {number} timeoutMsInner */
  const waitForPendingKind = async (kind, timeoutMsInner = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMsInner) {
      if (state.pendingAsk?.kind === kind) return true;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 10); });
    }
    return state.pendingAsk?.kind === kind;
  };

  const onPhase = (name, data = {}) => {
    if (name === 'confirm-round' && typeof data.round === 'number') {
      state.revisesLeft = Math.max(0, CONFIRM_ROUND_CAP - (data.round - 1));
    }
    say('system', `… ${name}`);
  };
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const metered = [];
  const onCall = (call) => {
    metered.push({ label: call.label, costUsd: call.costUsd ?? null, unpricedRounds: call.unpricedRounds ?? 0 });
    const known = metered.reduce((acc, c) => acc + (c.costUsd ?? 0), 0);
    const unpriced = metered.some((c) => c.costUsd === null);
    state.cost = unpriced ? `≥$${known.toFixed(4)} (unpriced calls present)` : `$${known.toFixed(4)}`;
  };

  const refuse = (message) => {
    state.phase = 'refused';
    state.error = message;
    say('system', message);
  };

  async function run() {
    // ── keys, at $0, before anything is prepared ────────────────────────
    const modelChoice = MODEL_OPTIONS[card.model];
    let providerEntry;
    try { providerEntry = resolveProvider(modelChoice.provider); } catch (e) { refuse(/** @type {Error} */ (e).message); return; }
    const apiKey = env[providerEntry.envKey];
    if (!apiKey) { refuse(`${providerEntry.envKey} not set — refusing at $0, before any spend`); return; }
    const keyProblem = apiKeyProblem(apiKey);
    if (keyProblem) { refuse(`${providerEntry.envKey} ${keyProblem} — refusing rather than crashing mid-call`); return; }

    const verdictType = card.checkType === 'rubric' ? 'soft-green' : 'green';
    const into = join(outDir, 'source-seed');
    const isRepoLike = looksLikeRepoSource(card.source);

    state.phase = 'preparing-source';
    say('system', 'preparing the source — a hidden, frozen copy this job works from ($0, no provider)…');
    const prep = await prepareSource({
      source: card.source, into, destination: isRepoLike ? card.destination : card.destination,
    });
    if (prep.stop !== null) { refuse(`source/destination refused (${prep.code}): ${prep.stop}`); return; }

    const IS_REPO_SOURCE = prep.manifest.kind === 'repo';
    let LANG = 'none-detected';
    /** @type {any} */
    let langResult = null;
    if (IS_REPO_SOURCE) {
      langResult = detectLanguage(prep.tree);
      if (langResult.kind === 'language-unsupported') {
        refuse(`${langResult.refusal.detail}`);
        return;
      }
      LANG = langResult.kind === 'resolved' ? langResult.lang : (langResult.kind === 'ambiguous' ? langResult.candidates[0] : 'none-detected');
      const depsGap = missingDependencies(prep.tree, prep.manifest.sourceSubdir ?? '');
      if (depsGap) {
        refuse(`${prep.tree} has no installed packages (${depsGap.reason}). bareloop never installs — run \`${depsGap.command}\` in the copy, then start a new session.`);
        return;
      }
    }
    if (!IS_REPO_SOURCE) {
      state.phase = 'refused';
      state.error = 'non-code-source';
      say('system', "This is a plain folder, not a code project. bareloop can't check this kind of job yet. Nothing was spent.");
      return;
    }

    const writeScope = card.destination.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    /** @type {any} the confirm turn (below) fills `goal` in once accepted —
     * declared loosely rather than typed field-by-field, since this object's
     * own shape is a `job-v1` draft `validateJob` itself is the real
     * authority on, not a second hand-typed interface here. */
    const draft = {
      schema: 'job-v1',
      job: card.jobName,
      description: `${card.jobName} — authored through the bareloop panel (${verdictType}, ${LANG})`,
      provider: modelChoice.provider,
      ...(modelChoice.baseUrl ? { baseUrl: modelChoice.baseUrl } : {}),
      cadence: { unit: 'day', every: 1 },
      budgetUsd: card.capUsd,
      ...(typeof card.maxWallMs === 'number' ? { maxWallMs: card.maxWallMs } : {}),
      writeScope,
      escalation: { mode: 'decision-ready' },
    };
    const draftReds = validateJob(draft, { shellCapUsd: draft.budgetUsd }).reds
      .filter((r) => ![...AUTHORED_SPEC_FIELDS, ...CONFIRM_AUTHORED_FIELDS, ...PLAIN_FOLDER_DEFERRED_FIELDS]
        .some((f) => String(r.path) === f || String(r.path).startsWith(`${f}.`)));
    if (draftReds.length) {
      refuse(`the spec draft does not validate — ${draftReds.map((r) => `${r.code} at ${r.path}`).join('; ')}`);
      return;
    }

    /** @type {Record<string, string>} */
    const answers = { 1: card.goal, 2: card.success, 3: card.guardrails };
    if (verdictType === 'soft-green') answers[4] = card.judgeExamples;
    const required = requiredAnswersFor(verdictType);
    for (const n of required) {
      if (!answers[n]) { refuse(`the ${verdictType} check type needs ${required.length} answers and one is missing (key ${n})`); return; }
    }

    const draftJudge = (() => {
      try { return resolveJobJudge(draft, modelChoice.provider, resolveWorkerModel); } catch { return { provider: modelChoice.provider, model: providerEntry.tiers.sonnet }; }
    })();
    const MODEL = providerEntry.tiers.sonnet;
    const { provider } = buildRunnerProviders({
      providerName: modelChoice.provider, apiKey, model: MODEL, tierModels: providerEntry.tiers, baseUrl: modelChoice.baseUrl,
      judgeApiKey: apiKey, judgeModel: MODEL, judgeProviderName: modelChoice.provider, judgeBaseUrl: modelChoice.baseUrl,
    });
    // TEST SEAMS (see the constructor's own note): a test overrides
    // `generate`/`confirmGenerate` directly (bypassing this real, constructed
    // `provider` for the model boundary) and/or `scout` (bypassing the real
    // paid scout) so it can drive the REAL confirm turn/ask()/revise/hash
    // machinery below with a deterministic fake, never a live provider call.
    const generate = deps.generate ?? makeLoopGenerate(provider);
    const confirmGenerate = deps.confirmGenerate ?? makeLoopGenerate(provider, { system: CONFIRM_SYSTEM });

    state.phase = 'drafting';
    say('system', `== drafting == ${modelChoice.provider}/${MODEL} — drafting cap $${card.draftingCapUsd}`);
    const authored = await authorCloseForJob({
      judgeModel: draftJudge.model,
      answers, verdictType, repoPath: prep.tree, lang: LANG,
      questions: questionsFor(verdictType),
      writeScope, provider, generate,
      ceilingUsd: card.draftingCapUsd,
      onPhase, onCall,
      ask, confirmGenerate, isRepo: true, langResult,
      ...(deps.scout ? { scout: deps.scout } : {}),
      ...(authorFnOverride ? { authorFn: authorFnOverride } : {}),
    });

    if (!authored.ok) {
      state.phase = authored.stop === 'confirm-abandoned' ? 'abandoned' : 'refused';
      state.error = authored.stop ?? 'authoring-failed';
      say('system', `stopped: ${authored.stop ?? 'authoring-failed'}${authored.refusal ? ` — ${authored.refusal.detail}` : ''}`);
      return;
    }

    if (authored.confirmed?.goal) draft.goal = redactSecrets(String(authored.confirmed.goal));
    const spec = assembleSpec(draft, { ...authored, verdictType: /** @type {string} */ (authored.verdictType) });
    const specFile = join(outDir, 'resolved-spec.json');
    writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);
    state.resolvedSpecPath = specFile;

    const jv = validateJob(spec, { shellCapUsd: spec.budgetUsd });
    if (!jv.ok) {
      state.phase = 'refused';
      state.error = `spec-invalid: ${jv.reds.map((r) => r.code).join(', ')}`;
      say('system', state.error);
      return;
    }

    state.phase = 'signing-gates';
    say('system', 'running gates 1–3 ($0) and gate 4 (calibration, paid, rubric only if this close judges)…');
    const judges = closeJudges(spec.closeDecl);
    const judge = judges ? resolveJobJudge(spec, modelChoice.provider, resolveWorkerModel) : null;
    let judgeProvider = null;
    if (judge) {
      const judgeKeyValue = env.JUDGE_API_KEY ?? env[resolveProvider(judge.provider).envKey];
      const judgeKeyProblem = judgeKeyValue ? apiKeyProblem(judgeKeyValue) : null;
      if (!judgeKeyValue || judgeKeyProblem) {
        refuse(`the judge key is not usable (${judgeKeyProblem ?? 'not set'}) — refusing before gate 4 spends anything`);
        return;
      }
      judgeProvider = buildRunnerProviders({
        providerName: modelChoice.provider, apiKey, model: MODEL, tierModels: providerEntry.tiers, baseUrl: modelChoice.baseUrl,
        judgeApiKey: judgeKeyValue, judgeModel: judge.model, judgeProviderName: judge.provider,
        judgeBaseUrl: judge.provider === modelChoice.provider ? modelChoice.baseUrl : undefined,
      }).judgeProvider;
    }
    const signing = await prepareSigningFn({
      spec, workdir: prep.tree, seedRef: authored.seedRef, timeoutMs,
      shellCapUsd: spec.budgetUsd, ceilingUsd: card.draftingCapUsd, priorCalls: [...metered],
      judgeLoop: judgeProvider ? (o) => defaultJudgeLoop({ provider: judgeProvider, system: o.system }) : null,
      judgeModel: judge?.model ?? null,
      onJudgeCost: (c) => onCall({ label: `${c.label}:${c.id}`, costUsd: c.costUsd, unpricedRounds: c.unpricedRounds }),
    });
    const signingFile = join(outDir, 'signing.json');
    writeFileSync(signingFile, `${JSON.stringify(signing, null, 2)}\n`);

    if (!signing.ok) {
      state.phase = 'refused';
      state.error = `signing gates failed — ${signing.reds.map((r) => r.code).join(', ') || 'no work red at seed'}`;
      say('system', state.error);
      return;
    }
    state.specHash = signing.specHash;
    state.phase = 'prepared';
    say('bot', `SIGNING PREPARED — spec hash ${signing.specHash}`);
  }

  // fire-and-forget — the caller (src/panel/server.js) never awaits this; it
  // polls `state` instead. A crash anywhere in `run()` is caught here so it
  // can never take the panel server process down with it.
  run().catch((e) => {
    state.phase = 'error';
    state.error = /** @type {Error} */ (e)?.message ?? String(e);
    say('system', `internal error: ${state.error}`);
  });

  return {
    id,
    state,
    /** @param {string} text */
    send: (text) => {
      if (!state.pendingAsk) return { ok: false, error: 'nothing is being asked right now' };
      if (state.pendingAsk.kind === 'menu') return { ok: false, error: 'use Sign & run or Revise for a plan, never Send — the chat can never sign or pick a plan action' };
      say('you', text);
      answer(text);
      return { ok: true };
    },
    /** @param {string} text */
    revise: async (text) => {
      if (!state.pendingAsk || state.pendingAsk.kind !== 'menu') return { ok: false, error: 'no plan is waiting for a Revise right now' };
      if (state.revisesLeft <= 0) return { ok: false, error: 'no revises left (D3: max 2 rounds)' };
      answer('fix');
      const reached = await waitForPendingKind('fix', 3000);
      if (!reached) return { ok: false, error: 'the confirm turn did not ask for a fix in time' };
      say('you', text);
      answer(text);
      return { ok: true };
    },
    /** click 1 — the confirm pick. Never signs on its own. */
    signPrepare: () => {
      if (!state.pendingAsk || state.pendingAsk.kind !== 'menu') return { ok: false, error: 'no plan is waiting for a decision right now' };
      answer('confirm');
      return { ok: true };
    },
  };
}
