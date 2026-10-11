// rewritten-from: fwdloop src/thinking.js@f9449e8
// PANEL-BUILD.md P8 batch 5 — THE one owner of what a drafting or judging model call sends for thinking. bareloop keeps NO per-model
// thinking list and NO vendor regex: bare-agent (>=0.52) owns which request shape switches thinking for which model, and
// `thinkingSupport(kind, model, {baseUrl})` is its own pure lookup (no network): `true` (measured switchable), `false` (measured
// NOT switchable), `'unverified'` (not measured — the shape ladder is tried at runtime; if every shape fails with a client
// validation error ONE plain request decides, and the call still runs, reported `thinkingStatus: 'unsupported'`).
//
// The tick is the person's, per job ("Thinking on", the signed optional `thinking` field; absent = off). It covers DRAFTING and the
// rubric JUDGE; the WORKER is never handed a thinking option. PER-CALL options, never constructor options (the drafter's provider is
// the worker's instance, deliberately left as it was). The raw `thinking` option is never sent (bare-agent throws if both are set).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { thinkingSupport: baseSupport, AnthropicProvider, OpenAIProvider, GeminiProvider } = require('bare-agent/providers');

/** The words under a greyed "Thinking on" box (the server's `thinking.canChange` decides; the page decides nothing). */
export const THINKING_FIXED_SAY = "can't change this for this model";

/** API shape id -> bare-agent's thinking-ladder kind. A missing shape (clipipe, a test double) has no kind. */
const KIND_OF_SHAPE = Object.freeze({ 'anthropic-api': 'anthropic', 'openai-api': 'openai', 'gemini-api': 'gemini' });

/**
 * What bare-agent knows about switching this model's thinking. A missing kind, a non-function `impl`, or a throw all read
 * `'unverified'` — never a guess in either direction.
 * @param {string} shape an API shape id (src/providershapes.js)
 * @param {string} model
 * @param {{ baseUrl?: string|null, impl?: Function }} [o] `impl` is a test seam; production uses bare-agent's own
 * @returns {true|false|'unverified'}
 */
export function thinkingSupport(shape, model, { baseUrl, impl = baseSupport } = {}) {
  const kind = /** @type {Record<string, string>} */ (KIND_OF_SHAPE)[shape];
  if (kind === undefined || typeof impl !== 'function') return 'unverified';
  try {
    const r = impl(kind, model, baseUrl ? { baseUrl } : undefined);
    return r?.switchable === true ? true : (r?.switchable === false ? false : 'unverified');
  } catch { return 'unverified'; }
}

/**
 * The per-call options for one support answer and one tick (`true` = "Thinking on"). The table (PANEL-BUILD.md P8, ruling Q1):
 *   tick on : true -> on | false -> {} (the box is greyed, cannot be on) | 'unverified' -> on
 *   tick off: true -> off | false -> {} (the model thinks as it would) | 'unverified' -> off (bare-agent decides; plain request on failure)
 * @param {true|false|'unverified'} support
 * @param {boolean} tick
 * @returns {{ thinkingMode: 'on'|'off' } | {}}
 */
export function thinkingOptions(support, tick) {
  if (support === false) return {};
  return { thinkingMode: tick ? 'on' : 'off' };
}

/** The enumerated operator knob a drafting call is built with: 'on' | 'off' (the tick, spelled as a word). */
export const THINKING_MODES = Object.freeze(['on', 'off']);

/**
 * Throw unless `mode` is one of {@link THINKING_MODES} — an operator-param guard, so a typo never silently means a mode.
 * @param {unknown} mode
 * @returns {'on'|'off'}
 */
export function assertThinkingMode(mode) {
  if (mode === 'on' || mode === 'off') return mode;
  throw new Error(`[thinking] draftThinking must be one of ${THINKING_MODES.join(' | ')}, got ${JSON.stringify(mode)}`);
}

/**
 * The API shape of a constructed bare-agent provider (the three client classes only); `null` for a test double or a clipipe.
 * @param {any} provider
 * @returns {string|null}
 */
export function shapeOfProvider(provider) {
  if (provider instanceof AnthropicProvider) return 'anthropic-api';
  if (provider instanceof OpenAIProvider) return 'openai-api';
  if (provider instanceof GeminiProvider) return 'gemini-api';
  return null;
}

/**
 * The per-call options every DRAFTING and JUDGING model call on this provider instance carries for this mode. A provider that is
 * not one of the three client classes (a test double, a clipipe) is never sent the switch.
 * @param {any} provider a constructed bare-agent provider
 * @param {unknown} [mode] 'on' | 'off' (default 'off')
 * @returns {{ thinkingMode: 'on'|'off' } | {}}
 */
export function thinkingCallOptions(provider, mode = 'off') {
  const m = assertThinkingMode(mode);
  const shape = shapeOfProvider(provider);
  if (shape === null) return {};
  return thinkingOptions(thinkingSupport(shape, String(provider.model), { baseUrl: provider.baseUrl }), m === 'on');
}

/**
 * What the drafting calls will carry for a model the caller has only NAMED (shape, model id, Base URL) — no key, no network. The
 * first drafting row is shown from this, before the key is read.
 * @param {{providerName: string, model: string, baseUrl?: string|null}} o
 * @param {unknown} [mode] 'on' | 'off'
 * @returns {{ support: true|false|'unverified', mode: 'on'|'off', options: {thinkingMode?: 'on'|'off'} }}
 */
export function thinkingPlanFor({ providerName, model, baseUrl }, mode = 'off') {
  const m = assertThinkingMode(mode);
  const support = thinkingSupport(providerName, model, { baseUrl });
  return { support, mode: m, options: thinkingOptions(support, m === 'on') };
}

/**
 * The server's answer for one Model-menu line: whether the "Thinking on" box can change and the words under it. `false` greys and
 * unticks the box (the note reads {@link THINKING_FIXED_SAY}); `'unverified'` leaves it enabled with no note.
 * @param {string} shape @param {string} model @param {string|null|undefined} baseUrl
 * @returns {{ support: true|false|'unverified', canChange: boolean, say: string }}
 */
export function thinkingForLine(shape, model, baseUrl) {
  const support = thinkingSupport(shape, model, { baseUrl });
  return { support, canChange: support !== false, say: support === false ? THINKING_FIXED_SAY : '' };
}

/**
 * The first drafting row's words — code-owned, ALWAYS starting "thinking on" or "thinking off". `status` is bare-agent's own
 * `thinkingStatus` for a call that has run ('applied' | 'unsupported' | 'ignored' | 'unknown'); undefined = before any call, read from
 * the plan (`support`, `mode`).
 * @param {{ mode: 'on'|'off', support?: true|false|'unverified', status?: string }} s
 * @returns {string}
 */
export function thinkingRowText({ mode, support, status }) {
  if (status === 'applied') return `thinking ${mode}`;
  if (status === 'unsupported') return "thinking on (this model can't change it)";
  if (status === 'ignored') return 'thinking on (the model thought anyway)';
  if (status === 'unknown') return `thinking ${mode} (not confirmed)`;
  if (support === false) return "thinking on (this model can't change it)";
  if (support === 'unverified') return `thinking ${mode} (not verified for this model)`;
  return `thinking ${mode}`;
}
