// Build 2026-11-14 (b), live run mwgjlezb: a rubric line whose `~` rule maps to a fact is facts-only, so "Write a one-sentence triage note ..." produced results and no note.
// ONE typed call per job, ONLY when a line is facts-only: the AI answers yes/no per line, "does the line also ask for written words beyond the facts found?"; CODE decides what it means
// (src/checkblock.js buildNote). The AI sees the numbered line text only (no `~` rules). Wording and reply shape are the POC's (.claude/scratch/poc-note-question, 12/12), the call/book/retry
// pattern is src/destpoint.js's `runDestPoint`. A call that does not finish is `failed` for every asked line (the card says so); never a guess.

import { createRequire } from 'node:module';
import { priceOf, scrubRaw, tallyCalls, capStop, callCasualty } from './text.js';
import { redactSecrets } from './validate.js';
import { isTransportFailure } from './transport.js';
import { isRateLimited, rateLimitWaitMs } from './ratelimit.js';
import { isOutputCutOff } from './authorflow.js';
import { AUTHOR_CALL_TIMEOUT_MS, AUTHOR_SCOUT_MAX_TOKENS } from './authorscout.js';

const require = createRequire(import.meta.url);
const { Loop } = require('bare-agent');

/** the label of the one paid call, as the drafting book sees it */
export const NOTE_CALL_LABEL = 'note-ask';

export const NOTE_SYSTEM = 'You read the numbered lines of a job. You answer only about what each line says; you never invent words.';

/** What the AI is told: the numbered job lines (text only), the one question, the reply shape and a legal example. @param {{n: number, text: string}[]} lines @returns {string} */
export function notePrompt(lines) {
  return `THE JOB:\n${lines.map((l) => `LINE ${l.n}: ${l.text}`).join('\n')}\n\n`
    + 'For EACH line answer ONE question: does the line also ask for written words (a note, a sentence, a paragraph, a summary) beyond the facts found on the page (items, numbers, dates, quoted words)? '
    + 'A line that only asks to list, find or give items with their fields is "no". '
    + 'Reply with JSON only, no prose, no code fence: {"lines":[{"line":<line number>,"writtenWords":"yes"|"no"}]}, one entry per line. '
    + 'Example: for "LINE 1: List the 3 newest posts with title and date" and "LINE 2: Write a two-sentence recap of the newest post" the reply is {"lines":[{"line":1,"writtenWords":"no"},{"line":2,"writtenWords":"yes"}]}.';
}

/**
 * Code reads the reply: every asked line answered exactly yes or no, else malformed (no repair). An answer for a line not asked is malformed too.
 * @param {unknown} text @param {{n: number}[]} lines @returns {Map<number, 'yes'|'no'>|null}
 */
export function decideNote(text, lines) {
  /** @type {any} */
  let j;
  try { j = JSON.parse(String(text ?? '').trim()); } catch { return null; }
  if (j === null || typeof j !== 'object' || !Array.isArray(j.lines)) return null;
  /** @type {Map<number, 'yes'|'no'>} */
  const out = new Map();
  for (const e of j.lines) {
    if (e === null || typeof e !== 'object' || !Number.isInteger(e.line) || (e.writtenWords !== 'yes' && e.writtenWords !== 'no') || !lines.some((l) => l.n === e.line)) return null;
    out.set(e.line, e.writtenWords);
  }
  return lines.every((l) => out.has(l.n)) ? out : null;
}

const defaultLoop = (/** @type {any} */ { system, onLlmResult, provider, rates }) =>
  new Loop({ provider, system, onLlmResult, ...(rates ? { rates } : {}) });

/**
 * Run the call: one call, one retry on a malformed reply, a transport failure or a 429. Never throws on a call casualty; every failure is `failed` (the lines stay facts-only).
 * @param {{lines: {n: number, text: string}[], provider?: any, maxTokens?: number, ceilingUsd?: number|null, callTimeoutMs?: number,
 *   onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: Function, rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>}} o
 * @returns {Promise<{state: 'answered'|'failed', answers: Map<number, 'yes'|'no'>, reason: string|null, calls: {label: string, costUsd: number|null, unpricedRounds: number}[]}>}
 */
export async function runNoteAsk({
  lines, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null, callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS,
  onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const callTimeout = Number.isFinite(Number(callTimeoutMs)) && Number(callTimeoutMs) > 0 ? Math.min(Math.trunc(Number(callTimeoutMs)), AUTHOR_CALL_TIMEOUT_MS) : AUTHOR_CALL_TIMEOUT_MS;
  const priced = rates ? { rates } : {};
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  let attempts = 0;
  const record = (/** @type {any} */ r) => {
    const call = { label: NOTE_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: NOTE_CALL_LABEL, attempt: attempts, text: r?.text });
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const failed = (/** @type {string} */ reason) => ({ state: /** @type {'failed'} */ ('failed'), answers: /** @type {Map<number, 'yes'|'no'>} */ (new Map()), reason, calls });
  const content = notePrompt(lines);
  let malformed = 0;
  let transportRetried = false;
  let rateRetried = false;
  for (;;) {
    if (capStop({ ceilingUsd, ...tallyCalls(calls) })) return failed('the note question was not asked: the spend ceiling was reached');
    attempts += 1;
    const loop = createLoop({ system: NOTE_SYSTEM, onLlmResult: undefined, provider, ...priced });
    /** @type {any} */
    let r;
    try {
      r = await loop.run([{ role: 'user', content }], [], { cacheMessages: true, maxTokens, timeoutMs: callTimeout, ...callOptions });
    } catch (e) {
      if (isRateLimited(e) && !rateRetried) {
        const wait = rateLimitWaitMs(e);
        if (wait !== null) { rateRetried = true; await sleep(wait); continue; }
      }
      const casualty = callCasualty(e) ?? (isTransportFailure(e) ? String(/** @type {any} */ (e)?.message ?? e) : null);
      if (casualty === null) throw e;
      record({ error: casualty });
      if (!transportRetried) { transportRetried = true; continue; }
      return failed(`the note question call failed: ${redactSecrets(casualty)}`);
    }
    record(r);
    if (isOutputCutOff(r)) return failed('the note question answer was cut off');
    if (r?.error) return failed(`the note question call failed: ${redactSecrets(String(r.error))}`);
    const d = decideNote(r?.text, lines);
    if (d) return { state: 'answered', answers: d, reason: null, calls };
    malformed += 1;
    if (malformed >= 2) return failed('the note question answer was not readable twice');
  }
}

/**
 * The drafting step: when the block has a facts-only line (and a `noteFn`), make the ONE call, then let code decide through `block.setNotes`. No facts-only line, or no `noteFn`: no call, nothing changes.
 * A failed call leaves the lines facts-only, each with its Not checked row. Returns the calls made (for the drafting book).
 * @param {{block: import('./checkblock.js').CheckBlock, jobLines: {n: number, text: string}[], noteFn: Function|null, ceilingUsd?: number|null, onCall?: Function, onPhase?: (name: string, data: any) => void}} o
 * @returns {Promise<{label: string, costUsd: number|null, unpricedRounds: number}[]>}
 */
export async function askNotes({ block, jobLines, noteFn, ceilingUsd = null, onCall = () => {}, onPhase = () => {} }) {
  if (typeof noteFn !== 'function') return [];
  const only = block.factOnlyLines();
  if (only.length === 0) return [];
  onPhase('note-ask', { lines: only.length });
  const nr = await noteFn({ lines: jobLines.filter((l) => only.includes(l.n)).map((l) => ({ n: l.n, text: l.text })), ceilingUsd, onCall });
  const answers = only.map((n) => ({ line: n, answer: /** @type {'yes'|'no'|'failed'} */ (nr.state === 'answered' ? (nr.answers.get(n) ?? 'failed') : 'failed') }));
  block.setNotes(answers);
  onPhase('note-answered', { state: nr.state, answers, reason: nr.reason ?? null });
  return nr.calls ?? [];
}
