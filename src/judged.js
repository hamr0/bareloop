// THE JUDGE'S IDENTITY — which model a job's `judge` names, and nothing else.
//
// hamr 2026-11-14 ("i don't need old runs in anything"): the old judge's engine is gone from this file — the locate call, the
// owned rulebook, `decide()`, the calibration set's shape and the judged-floor kind it served. A rubric (soft-green) job grades
// on the check list (src/rubricstep.js, bareguard's rubric primitive); no model renders its verdict. What stays here is the
// ONE thing a current job still reads: the spec's `judge` field and the workflow key resolve through these two functions
// (src/job.js `workflowKey`, src/panel/authorsession.js, src/userrun.js), so the identity has exactly one spelling.

import { resolveProvider } from './providers.js';

/**
 * WHICH MODEL A JOB'S JUDGE NAMES (PRD item 32.1), in precedence order: `spec.judge`, an explicit SIGNED `{provider, model}` (a spec field the
 * human signs, part of `jobSpecHash`; the drafting agent cannot express it), else the job's OWN worker provider and model. There is deliberately
 * NO third fallback to a library-pinned model, and a malformed `judge` THROWS rather than quietly becoming the worker's.
 * @param {{specJudge?: any, workerProvider?: string, workerModel?: string}} o
 * @returns {{provider: string, model: string}}
 */
export function resolveJudge({ specJudge, workerProvider, workerModel } = {}) {
  const nonEmpty = (/** @type {any} */ v) => typeof v === 'string' && v.trim() !== '';
  if (specJudge !== null && typeof specJudge === 'object'
    && nonEmpty(specJudge.provider) && nonEmpty(specJudge.model)) {
    return { provider: specJudge.provider, model: specJudge.model };
  }
  if (specJudge !== undefined && specJudge !== null) {
    // A malformed `judge` is never quietly ignored into the worker default: the
    // spec VALIDATOR reds it (src/job.js), and reaching here with one means a
    // caller skipped validation. Throwing beats grading under an identity the
    // signer did not write.
    throw new Error('[judged] spec.judge, when present, is {provider, model} with both non-empty — '
      + `got ${JSON.stringify(specJudge)}. A malformed judge is not a request to use the worker's.`);
  }
  if (!nonEmpty(workerProvider) || !nonEmpty(workerModel)) {
    throw new Error('[judged] resolveJudge needs the job\'s worker provider and model to default the judge to them '
      + '(PRD item 32.1) — a caller that can name neither a judge nor a worker has not wired a judge, and there is '
      + 'no library-pinned fall-back any more.');
  }
  return { provider: /** @type {string} */ (workerProvider), model: /** @type {string} */ (workerModel) };
}

/**
 * `resolveJudge` for a draft or an assembled spec: the one spelling of the identity both the spec stamp and the workflow key use.
 * `source` is read for `provider`/`model`/`judge` only. `resolveWorkerModelFn` is a PARAMETER (`resolveWorkerModel` from `./job.js`) because
 * this module cannot import `./job.js` (it would close an import cycle). An absent or unresolvable provider, or a malformed `judge`, THROWS.
 * @param {{provider?: string, model?: string, judge?: any}} source draft or spec
 * @param {string} fallbackProviderName used only when `source.provider` is absent
 * @param {(o: {specModel?: string, flagModel?: string, suppliedModel?: string}) => {model: string, source: string}} resolveWorkerModelFn
 * @returns {{provider: string, model: string}}
 */
export function resolveJobJudge(source, fallbackProviderName, resolveWorkerModelFn) {
  const providerName = source?.provider ?? fallbackProviderName;
  resolveProvider(providerName); // an unknown shape is the named throw, never a silent default
  const { model } = resolveWorkerModelFn({ specModel: source?.model, flagModel: undefined });
  return resolveJudge({ specJudge: source?.judge, workerProvider: providerName, workerModel: model });
}
