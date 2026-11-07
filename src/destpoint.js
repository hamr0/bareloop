// R7b (3), hamr 2026-11-07 (option A): "the AI points, the person decides". Before a repo job is drafted, ONE small paid call reads the job lines and names, for a line that
// names a file to change, the line, the file (copied from that line) and the folder that holds it. Plain code then checks every claim (the line is a job line, the path
// stands in that line's own words, the file is in the repo's committed tree, the folder is a real parent of it) and that the file lies OUTSIDE the Destination. Only then is
// there ONE question, worded by code, answered yes or no like the fit check's "go on". A made-up file, a path the line does not hold or a malformed reply is no question.
// Failure is OPEN (a wrong question is the costly mistake): a call that does not finish asks nothing and drafting goes on. The call/book/retry pattern is src/fitcheck.js's.

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
export const DEST_CALL_LABEL = 'dest-point';

export const DEST_SYSTEM = 'You read the numbered lines of a code job. You never invent words: every file path you name must be copied, character for character, from the job line that holds it.';

/**
 * What the AI is told (the numbered job text only, no `~` rules) and the one rule, with a legal example.
 * @param {{jobLines: {n: number, text: string}[], destination: string}} o @returns {string}
 */
export function destPrompt({ jobLines, destination }) {
  const job = jobLines.map((l) => `LINE ${l.n}: ${l.text}`).join('\n');
  return `THE JOB:\n${job}\n\nDestination (the only place the job may change files): ${destination}\n\n`
    + 'For EACH job line that names a file to change, give the line number, the file path copied exactly from that line, and the folder that holds that file (the folder part of the path, ending with /). '
    + 'A line that names no file path is left out; never guess a path the line does not contain. '
    + 'Reply with JSON only, no prose, no code fence: {"points":[{"line":<line number>,"file":"<path copied from the line>","folder":"<its folder>"}]}. '
    + 'Example: for the line "LINE 1: Fix the bug in src/sum.js so the tests pass" the reply is {"points":[{"line":1,"file":"src/sum.js","folder":"src/"}]}; for "LINE 2: make npm test pass" it is {"points":[]}.';
}

/** @typedef {{line: number, file: string, folder: string}} DestPoint */

/** does `file` lie under the Destination (a folder, a file, a glob, or `.`)? @param {string} file @param {string} destination @returns {boolean} */
export function destinationCovers(file, destination) {
  for (const raw of destination.split(/[,\n]/)) {
    const t = raw.trim().replace(/^(\.\/)+/, '').replace(/\/+$/, '');
    if (raw.trim() === '') continue;
    if (t === '' || t === '.') return true;
    if (/[*?]/.test(t)) {
      const re = new RegExp(`^${t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')}$`);
      if (re.test(file)) return true;
    } else if (file === t || file.startsWith(`${t}/`)) return true;
  }
  return false;
}

/**
 * Read the AI's reply and decide, all in code. Malformed (no repair): not JSON, not `{points:[...]}`, a point that is not an object with a whole line, a string file and a string folder.
 * A point survives only when its line is a job line, the file path is written in that line's own text, the file is in the repo's committed tree, the folder is a real parent folder
 * of that file, and the file is NOT under the Destination. The survivors are ordered by line.
 * @param {unknown} text @param {{jobLines: {n: number, text: string}[], files: readonly string[], destination: string}} o
 * @returns {{status: 'malformed'}|{status: 'ok', points: DestPoint[], dropped: number}}
 */
export function decideDestPoint(text, { jobLines, files, destination }) {
  /** @type {any} */
  let j;
  try { j = JSON.parse(String(text ?? '').trim()); } catch { return { status: 'malformed' }; }
  if (j === null || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.points)) return { status: 'malformed' };
  const lines = new Map(jobLines.map((l) => [l.n, l.text]));
  const tree = new Set(files);
  /** @type {DestPoint[]} */
  const points = [];
  let dropped = 0;
  for (const p of j.points) {
    if (p === null || typeof p !== 'object' || Array.isArray(p) || !Number.isInteger(p.line) || typeof p.file !== 'string' || typeof p.folder !== 'string') return { status: 'malformed' };
    const file = p.file.replace(/^(\.\/)+/, '');
    const folder = p.folder.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
    const lineText = lines.get(p.line);
    const ok = lineText !== undefined && file !== '' && lineText.includes(p.file) && tree.has(file) && folder !== '' && file.startsWith(`${folder}/`) && !destinationCovers(file, destination);
    if (ok) points.push({ line: p.line, file, folder: `${folder}/` }); else dropped += 1;
  }
  points.sort((a, b) => a.line - b.line);
  return { status: 'ok', points, dropped };
}

/** the one question, worded by code @param {DestPoint} p @param {string} destination @returns {string} */
export const destQuestionText = (p, destination) => redactSecrets(
  `Line ${p.line} needs ${p.file} changed, but Destination is ${destination.trim().replace(/\s*\n\s*/g, ', ')}, so the job could not change it. Set Destination to ${p.folder}? Type yes to set it, or no to keep it as it is.`,
);
/** the answers (any case, a closing full stop allowed) @param {unknown} text @returns {'yes'|'no'|null} */
export const yesNoOf = (text) => {
  const t = String(text ?? '').trim().replace(/\.$/, '').toLowerCase();
  return t === 'yes' || t === 'y' ? 'yes' : (t === 'no' || t === 'n' ? 'no' : null);
};

const defaultLoop = (/** @type {any} */ { system, onLlmResult, provider, rates }) =>
  new Loop({ provider, system, onLlmResult, ...(rates ? { rates } : {}) });

/**
 * Run the pointing call: one call (one retry on a malformed reply, a transport failure or a 429). Never throws on a call casualty; every failure is `absent` (no question).
 * @param {{jobLines: {n: number, text: string}[], files: readonly string[], destination: string, provider?: any, maxTokens?: number, ceilingUsd?: number|null,
 *   callTimeoutMs?: number, onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: Function, rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>}} o
 * @returns {Promise<{state: 'point'|'none'|'absent', point: DestPoint|null, reason: string|null, calls: {label: string, costUsd: number|null, unpricedRounds: number}[]}>}
 */
export async function runDestPoint({
  jobLines, files, destination, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null, callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS,
  onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const callTimeout = Number.isFinite(Number(callTimeoutMs)) && Number(callTimeoutMs) > 0 ? Math.min(Math.trunc(Number(callTimeoutMs)), AUTHOR_CALL_TIMEOUT_MS) : AUTHOR_CALL_TIMEOUT_MS;
  const priced = rates ? { rates } : {};
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  let attempts = 0;
  const record = (/** @type {any} */ r) => {
    const call = { label: DEST_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: DEST_CALL_LABEL, attempt: attempts, text: r?.text });
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const absent = (/** @type {string} */ reason) => ({ state: /** @type {'absent'} */ ('absent'), point: null, reason, calls });
  const content = destPrompt({ jobLines, destination });
  let malformed = 0;
  let transportRetried = false;
  let rateRetried = false;
  for (;;) {
    if (capStop({ ceilingUsd, ...tallyCalls(calls) })) return absent('the folder check was not made: the spend ceiling was reached');
    attempts += 1;
    const loop = createLoop({ system: DEST_SYSTEM, onLlmResult: undefined, provider, ...priced });
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
      return absent(`the folder check call failed: ${redactSecrets(casualty)}`);
    }
    record(r);
    if (isOutputCutOff(r)) return absent('the folder check answer was cut off');
    if (r?.error) return absent(`the folder check call failed: ${redactSecrets(String(r.error))}`);
    const d = decideDestPoint(r?.text, { jobLines, files, destination });
    if (d.status === 'ok') return { state: d.points.length > 0 ? 'point' : 'none', point: d.points[0] ?? null, reason: null, calls };
    malformed += 1;
    if (malformed >= 2) return absent('the folder check answer was not readable twice');
  }
}
