// hamr 2026-11-15 (Design B): "the AI points, code decides" for the write fence. When a repo draft leaves a `~` rule Not checked and the repo holds files OUTSIDE the signed write scope, ONE small paid call
// shows the AI those rules and those paths and asks, per rule, for the ONE path (copied from the list) the rule asks to leave as it is, or null. Plain code then proves every pointed path (src/repolist.js
// `proveFenceClaim`) and a proven one becomes the same "kept by the write fence" row a drafter's `fenceKept` makes; a path not on the list, or one the proof refuses, leaves the rule Not checked. Why it exists: the
// drafter's own `fenceKept` is optional and was left out in a real draft (session smwhwzspwg7ez) though it had written the right reason into free-text notes. Failure is OPEN: a call that does not finish
// points at nothing and drafting goes on. The call/book/retry pattern is src/destpoint.js's `runDestPoint` (no JSON repair: a malformed reply is asked again once, then given up).

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
export const FENCE_CALL_LABEL = 'fence-point';
/** the most paths shown to the AI */
export const FENCE_LIST_MAX = 300;

export const FENCE_SYSTEM = 'You read the rules of a code job and a list of repo paths. You never invent words: every path you name must be copied, character for character, from the list.';

/** @typedef {{line: number, rule: number, text: string}} FenceRule */

/**
 * The paths the AI may name: the files outside the write scope and their folders (a folder ends with /), sorted; a long listing keeps only the entries at most two levels deep, then the first FENCE_LIST_MAX.
 * @param {string[]} outside @returns {string[]}
 */
export function fenceCandidates(outside) {
  const all = new Set();
  for (const f of outside) {
    all.add(f);
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) all.add(`${parts.slice(0, i).join('/')}/`);
  }
  let list = [...all].sort();
  if (list.length > FENCE_LIST_MAX) list = list.filter((p) => p.replace(/\/$/, '').split('/').length <= 2);
  return list.slice(0, FENCE_LIST_MAX);
}

/**
 * What the AI is told: the rules in the person's words and the paths it may name, nothing else, with one legal example.
 * @param {{rules: FenceRule[], paths: string[]}} o @returns {string}
 */
export function fencePrompt({ rules, paths }) {
  const rs = rules.map((r) => `RULE line ${r.line}, rule ${r.rule}: ${r.text}`).join('\n');
  return `THE RULES (written by the person, not yet checked by anything):\n${rs}\n\nTHE PATHS (places the job may NOT change; the only paths you may name):\n${paths.map((p) => `- ${p}`).join('\n')}\n\n`
    + 'For EACH rule, name the ONE path from THE PATHS that the rule asks to leave as it is, or that the rule can only be broken by changing; copy it exactly from the list. '
    + 'If no path on the list is that, answer null for that rule; never guess a path. '
    + 'Reply with JSON only, no prose, no code fence: {"picks":[{"line":<line number>,"rule":<rule number>,"path":"<a path from the list>"}]} with "path": null where nothing on the list fits. '
    + 'Example: for "RULE line 1, rule 1: do not change package.json" and a list holding package.json the reply is {"picks":[{"line":1,"rule":1,"path":"package.json"}]}; for "RULE line 1, rule 2: keep the header comment" and a list that holds no file with that comment it is {"picks":[{"line":1,"rule":2,"path":null}]}.';
}

/** `p` with one trailing slash and a leading ./ taken off, to compare a pointed path with the list @param {string} p @returns {string} */
const norm = (p) => p.trim().replace(/^(\.\/)+/, '').replace(/\/+$/, '');

/**
 * Read the AI's reply and decide, all in code. Malformed (no repair): not JSON, not `{picks:[...]}`, a pick that is not an object with whole line and rule numbers and a string-or-null path.
 * A pick survives only when its line+rule is one that was asked and its path is on the list (compared without a trailing /); the rest are dropped. A rule is pointed at most once (the first pick).
 * @param {unknown} text @param {{rules: FenceRule[], paths: string[]}} o
 * @returns {{status: 'malformed'}|{status: 'ok', picks: {line: number, rule: number, path: string}[], dropped: number}}
 */
export function decideFencePoint(text, { rules, paths }) {
  /** @type {any} */
  let j;
  try { j = JSON.parse(String(text ?? '').trim()); } catch { return { status: 'malformed' }; }
  if (j === null || typeof j !== 'object' || Array.isArray(j) || !Array.isArray(j.picks)) return { status: 'malformed' };
  const asked = new Set(rules.map((r) => `${r.line}.${r.rule}`));
  const listed = new Map(paths.map((p) => [norm(p), p]));
  /** @type {{line: number, rule: number, path: string}[]} */
  const picks = [];
  const seen = new Set();
  let dropped = 0;
  for (const p of j.picks) {
    if (p === null || typeof p !== 'object' || Array.isArray(p) || !Number.isInteger(p.line) || !Number.isInteger(p.rule) || !(p.path === null || typeof p.path === 'string')) return { status: 'malformed' };
    if (p.path === null) continue;
    const key = `${p.line}.${p.rule}`;
    const hit = listed.get(norm(p.path));
    if (!asked.has(key) || hit === undefined || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    picks.push({ line: p.line, rule: p.rule, path: hit.replace(/\/$/, '') });
  }
  return { status: 'ok', picks, dropped };
}

const defaultLoop = (/** @type {any} */ { system, onLlmResult, provider, rates }) =>
  new Loop({ provider, system, onLlmResult, ...(rates ? { rates } : {}) });

/**
 * Run the pointing call: ONE call for all rules (one retry on a malformed reply, a transport failure or a 429). Never throws on a call casualty; every failure is `absent` with its reason (the rules stay Not checked).
 * @param {{rules: FenceRule[], paths: string[], provider?: any, maxTokens?: number, ceilingUsd?: number|null, callTimeoutMs?: number,
 *   onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void,
 *   createLoop?: Function, rates?: {in: number, out: number}|null, callOptions?: Record<string, any>, sleep?: (ms: number) => Promise<void>}} o
 * @returns {Promise<{state: 'ok'|'absent', picks: {line: number, rule: number, path: string}[], dropped: number, reason: string|null, calls: {label: string, costUsd: number|null, unpricedRounds: number}[]}>}
 */
export async function runFencePoint({
  rules, paths, provider = null, maxTokens = AUTHOR_SCOUT_MAX_TOKENS, ceilingUsd = null, callTimeoutMs = AUTHOR_CALL_TIMEOUT_MS,
  onCall = () => {}, createLoop = defaultLoop, rates = null, callOptions = {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const callTimeout = Number.isFinite(Number(callTimeoutMs)) && Number(callTimeoutMs) > 0 ? Math.min(Math.trunc(Number(callTimeoutMs)), AUTHOR_CALL_TIMEOUT_MS) : AUTHOR_CALL_TIMEOUT_MS;
  const priced = rates ? { rates } : {};
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const calls = [];
  let attempts = 0;
  const record = (/** @type {any} */ r) => {
    const call = { label: FENCE_CALL_LABEL, ...priceOf(r) };
    calls.push(call);
    const raw = scrubRaw({ label: FENCE_CALL_LABEL, attempt: attempts, text: r?.text });
    onCall({ ...call, raw: raw.text, ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
  };
  const absent = (/** @type {string} */ reason) => ({ state: /** @type {'absent'} */ ('absent'), picks: [], dropped: 0, reason, calls });
  const content = fencePrompt({ rules, paths });
  let malformed = 0;
  let transportRetried = false;
  let rateRetried = false;
  for (;;) {
    if (capStop({ ceilingUsd, ...tallyCalls(calls) })) return absent('the fence check was not made: the spend ceiling was reached');
    attempts += 1;
    const loop = createLoop({ system: FENCE_SYSTEM, onLlmResult: undefined, provider, ...priced });
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
      return absent(`the fence check call failed: ${redactSecrets(casualty)}`);
    }
    record(r);
    if (isOutputCutOff(r)) return absent('the fence check answer was cut off');
    if (r?.error) return absent(`the fence check call failed: ${redactSecrets(String(r.error))}`);
    const d = decideFencePoint(r?.text, { rules, paths });
    if (d.status === 'ok') return { state: 'ok', picks: d.picks, dropped: d.dropped, reason: null, calls };
    malformed += 1;
    if (malformed >= 2) return absent('the fence check answer was not readable twice');
  }
}
