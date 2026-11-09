// R10 (fwdloop M10 am16 (1)): the ONE paid call that suggests, per `~` rule, a check from bareguard's list. It runs over bareloop's own structured ladder (`askStructured`: the ceiling
// is read before the call, one retry on an unusable reply, cut-off and malformed arguments are named reds, the answer is logged scrubbed), thinking as the drafter's (off).
// An unusable answer is NOT a guessed check: every rule then reads "I can't check this" (fwd: "one retry on an unusable answer, then every guardrail reads I can't check this").
import { askStructured, makeCostBook } from './authorflow.js';
import { suggestChannel, suggestUserText, rowsFromAnswer } from './checkpick.js';

/** the label of the call, as the drafting book and the draft log see it */
export const SUGGEST_LABEL = 'check-suggest';

/**
 * @param {{jobLines: {n: number, text: string}[], scoped: {line: number, rule: number, text: string}[], generate: Function, ceilingUsd?: number|null,
 *   onCall?: (call: any) => void, priorCalls?: any[], priorRaws?: any[]}} o
 * @returns {Promise<{state: 'ok'|'absent', reason: string|null, rows: ReturnType<typeof rowsFromAnswer>, calls: any[], raws: any[]}>}
 */
export async function runCheckSuggest({ jobLines, scoped, generate, ceilingUsd = null, onCall = () => {}, priorCalls = [], priorRaws = [] }) {
  const book = makeCostBook({ ceilingUsd, onCall });
  book.absorb(priorCalls, priorRaws);
  const before = book.report().calls.length;
  const beforeRaws = book.raws().length;
  const r = await askStructured({
    messages: [{ role: 'user', content: suggestUserText(jobLines, scoped) }], generate, mode: 'tool', retries: 1, label: SUGGEST_LABEL, book, channel: suggestChannel(),
  });
  const calls = book.report().calls.slice(before);
  const raws = book.raws().slice(beforeRaws);
  if (r.artifact) return { state: 'ok', reason: null, rows: rowsFromAnswer(scoped, r.artifact), calls, raws };
  const reason = r.budget ? 'the spend ceiling was reached' : (r.providerError ?? r.red?.detail ?? 'the answer could not be read');
  return { state: 'absent', reason, rows: rowsFromAnswer(scoped, { checks: [] }), calls, raws };
}
