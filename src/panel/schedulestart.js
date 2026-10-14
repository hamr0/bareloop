// T Part 4 (PANEL-BUILD.md T addendum, C.4): the ONE starter of a scheduled run. A scheduled fire is exactly a Reuse the
// person did not click: it goes through the SAME start path as `POST /api/author/start` (`startSession`, which proves the
// Inputs at $0, prepares the copy, runs signing gates 1-3) and the SAME `signRun` (the only function that spawns a run).
//   wouldAccept(job, cause)  cheap, $0, no copy, no session: would a start go through?
//   start(job, cause, hooks) runs the session to `prepared`, THEN calls hooks.beforeSpawn (the consuming row), writes
//                            trigger.json (wx), then signRun with --review-door. Returns {ok, ...} and never throws.
// RULED 2026-10-14 (retry when back up): everything that can say "no" says it BEFORE beforeSpawn, so a refusal consumes
// nothing. Only a spawn error comes after it; the caller then writes a `released` row (schedules.fire).
// Rewritten from fwdloop src/panel/authorstart.js `start` (the trigger.json `wx` write before the spawn); where fwd
// writes `ran` before the starter answers, the starter now answers first (T16).
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jobSpecHash, workflowKey } from '../job.js';
import { parseInputs } from '../jobblock.js';
import { judgePick, keyValueOf } from '../providerrows.js';
import { recheck } from '../triggerfiles.js';
import { scheduledWords } from '../schedulewords.js';
import { signRun } from './authorroutes.js';

/** how long a headless session may take to reach `prepared` (copy, install, signing gates) */
export const PREPARE_TIMEOUT_MS = 20 * 60_000;

/**
 * The spec one fire runs: the signed schedule's spec; for a file cause, Inputs line 1 is the arriving file. Every other
 * field must be deep-equal and the workflow key unchanged (F.4): the person signed the SCHEDULE, each fire's hash is
 * derived by code. A clock fire's spec equals the signed spec byte for byte (same hash).
 * @param {{spec: any, specHash: string, workflowKey: string}} schedule
 * @param {{kind: 'clock'}|{kind: 'file', path: string}} cause
 * @returns {{ok: true, spec: any, hash: string}|{ok: false, why: string}}
 */
export function perFireSpec(schedule, cause) {
  if (jobSpecHash(schedule.spec) !== schedule.specHash) return { ok: false, why: 'The saved schedule no longer matches what you signed. Nothing started.' };
  const spec = JSON.parse(JSON.stringify(schedule.spec));
  if (cause.kind === 'file') {
    const first = Array.isArray(spec.inputs) ? spec.inputs[0] : null;
    if (!first) return { ok: false, why: 'The saved schedule has no input for the file to replace. Nothing started.' };
    spec.inputs = [{ ...first, value: cause.path }, ...spec.inputs.slice(1)];
  }
  const { inputs: _a, ...restA } = spec;
  const { inputs: _b, ...restB } = schedule.spec;
  if (JSON.stringify(restA) !== JSON.stringify(restB) || workflowKey(spec) !== schedule.workflowKey) {
    return { ok: false, why: 'This run would differ from what you signed by more than its input. Nothing started.' };
  }
  return { ok: true, spec, hash: jobSpecHash(spec) };
}

/**
 * @param {{
 *   door: ReturnType<typeof import('./schedules.js').createScheduleDoor>,
 *   startSession: ReturnType<typeof import('./authorroutes.js').createAuthorRoutes>['startSession'],
 *   envNow: () => Record<string, string|undefined>,
 *   spawnFn: Function, bareloopBin: string, sessionsRoot?: string, home?: string,
 *   rowsFor: () => readonly import('../providerrows.js').KeyRow[],
 *   startFrom: (runid: string) => any,
 *   now?: () => number, prepareTimeoutMs?: number, pollMs?: number,
 * }} deps
 */
export function createStarter(deps) {
  const { now = Date.now, prepareTimeoutMs = PREPARE_TIMEOUT_MS, pollMs = 25 } = deps;

  /** @param {any} schedule @param {any} cause @returns {{ok: true, spec: any, hash: string}|{ok: false, why: string}} */
  function resolveFire(schedule, cause) {
    return perFireSpec(schedule, cause.kind === 'file' ? { kind: 'file', path: cause.path } : { kind: 'clock' });
  }

  return {
    /**
     * Cheap, $0, no copy, no session. `{ok: true}` or `{ok: false, why}` (words).
     * @param {string} job
     * @param {{kind: 'clock'} | {kind: 'file', path: string, sha: string}} cause
     * @returns {{ok: true}|{ok: false, why: string}}
     */
    wouldAccept(job, cause) {
      const schedule = deps.door.readSchedule(job);
      if (!schedule) return { ok: false, why: 'This job has no schedule any more. Nothing started.' };
      const fire = resolveFire(schedule, cause);
      if (!fire.ok) return fire;
      // the inputs are there: the arriving file, looked at again at use time; a clock fire's first input, when it is a local path
      if (cause.kind === 'file') {
        const r = recheck({ path: cause.path, sha: cause.sha });
        if (r.state === 'deleted') return { ok: false, why: `The file ${cause.path} is not there (${r.say}). Nothing started.` };
        if (r.state === 'changed') return { ok: false, why: `The file ${cause.path} changed before its turn. Nothing started.` };
      } else {
        for (const inp of fire.spec.inputs ?? []) {
          const v = String(inp.value);
          if (/^https?:\/\//i.test(v)) continue;
          if (!existsSync(v)) return { ok: false, why: `The input "${inp.label}" is not there (${v}). Nothing started.` };
        }
      }
      // the keys load, and the model line is still ticked, priced and keyed
      const rows = deps.rowsFor();
      const row = rows.find((r) => r.provider === fire.spec.provider && r.models.some((l) => l.model === fire.spec.model));
      if (!row) return { ok: false, why: "The key for this job's model is not set up. Put it in your keys file and tick the model in Settings > Providers. Nothing started." };
      const pick = judgePick(rows, { provider: row.envName, model: fire.spec.model });
      if (!pick.ok) return { ok: false, why: `${pick.say.replace(/ Nothing was spent\.$/, '')}. Nothing started.`.replace(/\.\./g, '.') };
      const key = keyValueOf(deps.envNow(), pick.choice.envName);
      if (!key) return { ok: false, why: `${pick.choice.envName} is not set up: put its key in your keys file. Nothing started.` };
      return { ok: true };
    },

    /**
     * Start the run. Never throws. `consumed` says whether `beforeSpawn` ran, so the caller knows whether a `released` row is owed.
     * @param {string} job
     * @param {{kind: 'clock', slot: number, catchUp: boolean, missed: number} | {kind: 'file', path: string, sha: string}} cause
     * @param {{beforeSpawn?: () => void}} [hooks]
     * @returns {Promise<{ok: true, sessionId: string, specHash: string, consumed: true}|{ok: false, why: string, consumed: boolean}>}
     */
    async start(job, cause, hooks = {}) {
      let consumed = false;
      try {
        const schedule = deps.door.readSchedule(job);
        if (!schedule) return { ok: false, why: 'This job has no schedule any more. Nothing started.', consumed };
        const fire = resolveFire(schedule, cause);
        if (!fire.ok) return { ok: false, why: fire.why, consumed };
        const pre = deps.startFrom(schedule.originRunid);
        if (!pre || !pre.ok) return { ok: false, why: "The good run this schedule was made from is gone from the list, so its saved job cannot be read. Nothing started.", consumed };
        const spec = fire.spec;
        const rows = deps.rowsFor();
        const row = rows.find((r) => r.provider === spec.provider && r.models.some((l) => l.model === spec.model));
        const inputsText = cause.kind === 'file'
          ? spec.inputs.map((/** @type {any} */ i) => `${i.label}: ${i.value}`).join('\n')
          : schedule.inputsText;
        const card = {
          ...pre.card,
          inputs: inputsText,
          destination: Array.isArray(spec.writeScope) ? spec.writeScope.join(', ') : pre.card.destination,
          capUsd: spec.budgetUsd,
          ...(typeof spec.maxWallMs === 'number' ? { maxWallMs: spec.maxWallMs } : { maxWallMs: undefined }),
          model: spec.model,
          ...(row ? { provider: row.envName } : {}),
        };
        const ip = parseInputs(card.inputs);
        if (!ip.ok) return { ok: false, why: `${ip.error}. Nothing started.`, consumed };
        const made = await deps.startSession(card, { spec, workflowKey: schedule.workflowKey }, ip.inputs, { headless: true });
        if (!made.ok) return { ok: false, why: `${made.error}. Nothing started.`, consumed };
        const { session } = made;
        const t0 = Date.now();
        const settled = new Set(['prepared', 'refused', 'error', 'abandoned', 'signing-failed', 'install-needed']);
        while (!settled.has(session.state.phase) && Date.now() - t0 < prepareTimeoutMs) await new Promise((r) => { setTimeout(r, pollMs); });
        if (session.state.phase !== 'prepared') {
          const phase = session.state.phase;
          if (!settled.has(phase)) session.abandon();
          const why = phase === 'install-needed' ? "Packages are missing in the job's copy. Nothing started."
            : (!settled.has(phase) ? 'Getting the job ready took too long. Nothing started.' : `The job could not be made ready: ${String(session.state.error ?? phase)}. Nothing started.`);
          if (phase === 'install-needed') session.abandon();
          return { ok: false, why, consumed };
        }
        // EVERY "no" is behind us. From here the slot or file is consumed (the caller's row), and only a spawn error can undo it.
        hooks.beforeSpawn?.();
        consumed = true;
        const outDir = session.state.outDir;
        const words = scheduledWords(schedule.trigger, deps.door.userHome) ?? '';
        const catchUp = cause.kind === 'clock' && cause.catchUp === true;
        writeFileSync(join(outDir, 'trigger.json'), `${JSON.stringify({
          kind: cause.kind, trigger: words, reason: `Started by the schedule: ${words}${catchUp ? ' (catch-up)' : ''}`, catchUp,
          ...(cause.kind === 'clock' ? { slot: cause.slot, missed: cause.missed } : { file: cause.path, sha: cause.sha }),
        }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        /** @type {Error|null} */
        let spawnError = null;
        const signed = signRun(session, session.state.specHash, {
          env: deps.envNow(), spawnFn: /** @type {any} */ (deps.spawnFn), bareloopBin: deps.bareloopBin, sessionsRoot: deps.sessionsRoot, home: deps.home,
          schedules: deps.door, reviewDoor: true, onSpawnError: (e) => { spawnError = e; },
        });
        // a spawn failure is reported on the next turn of the event loop; give it that turn before calling this started
        await new Promise((r) => { setImmediate(r); });
        if (!signed.ok) return { ok: false, why: `${signed.error ?? 'The run did not start'}. Nothing started.`.replace(/\.\./g, '.'), consumed };
        if (spawnError) return { ok: false, why: `The run could not be launched (${/** @type {Error} */ (spawnError).message}). Nothing started.`, consumed };
        return { ok: true, sessionId: session.state.id, specHash: session.state.specHash, consumed: true };
      } catch (e) {
        return { ok: false, why: `The run could not start (${/** @type {Error} */ (e).message}). Nothing started.`, consumed };
      }
    },
  };
}
