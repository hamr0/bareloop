// The structured-ask ladder and the cost book it books into (import-cycle cleanup, batch G): moved out of authorflow.js unchanged, so checklist, checksuggest, fencepointcall and authorjob
// reach them without importing the whole authoring flow back.
import { priceOf, scrubRaw, tallyCalls, capStop, extractArtifact, callCasualty } from './text.js';
import { redactSecrets } from './validate.js';
import { isOutputCutOff } from './transport.js';

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */

/** validator reds carried into a revise turn, trim announced (F28) */
export const REVISE_RED_CAP = 20;

export const STRUCTURE_INSTRUCTION_TEXT = 'Your reply could not be read as one JSON declaration. '
  + 'Reply with ONLY the JSON object, in a single fenced block, and nothing else.';

/**
 * The measured block when the declaration never reached execution. Both cases are
 * machine outputs of the pipeline, never editorial prose about the model's work.
 *
 * SCRUBBED at the emission boundary, for the SAME reason `renderSeedReadBlock`
 * is and through the SAME one redactor. The channel here is different and just
 * as real: a validation red QUOTES WHAT THE MODEL DECLARED, verbatim — the
 * genre-env branch echoes the expected and the declared value, the deny floor
 * echoes the whole `cmd`, the listing rule echoes the path — and this block
 * becomes the next USER TURN sent to the provider. A declared value shaped like
 * a credential crossed unmasked before this line existed. Applied to the whole
 * rendered block rather than one field, so a red added to the validator is
 * scrubbed by construction rather than by remembering.
 * @param {{kind: 'validation'|'artifact'|'edits', reds: (Red|string)[], cap?: number}} o
 */
export function renderRejectBlock({ kind, reds, cap = REVISE_RED_CAP }) {
  const head = kind === 'validation'
    ? 'MEASURED VALIDATION — your declaration was rejected by the validator before any stage could run:'
    : kind === 'edits'
      ? 'MEASURED EDITS — some of your edits were refused; each refusal is its own and your other edits stand:'
      : 'MEASURED PARSE — your reply could not be read as one declaration:';
  const rendered = (reds ?? []).map((r) => (typeof r === 'string' ? r : `${r.code} at ${r.path || '(root)'}: ${r.detail}${typeof r.hint === 'string' ? ` ${r.hint}` : ''}`));
  const shown = rendered.slice(0, cap);
  const tail = rendered.length > shown.length
    ? [`  [${rendered.length - shown.length} of ${rendered.length} reds withheld — the cap is ${cap}]`]
    : [];
  return redactSecrets([head, ...shown.map((r) => `  ${r}`), ...tail].join('\n'));
}

// ── 5. COST ──────────────────────────────────────────────────────────────────

/**
 * F6's shape: an unpriced call or round makes the TOTAL unknown, and unknown is
 * reported as null — never as the sum of the priced half wearing a complete coat.
 * `knownUsd` carries the priced half explicitly so nothing is hidden either way.
 *
 * IT IS ALSO THE RUN'S AUDIT OF WHAT WAS SAID, not only of what was spent. Every
 * `add` records the call's RAW output beside its price, through the one
 * scrubbed-persist helper — one list of calls, read two ways. That pairing is
 * structural rather than remembered: run mslhn707 metered a $0.053 scout call
 * and kept not one byte of what it returned, so the malformation that killed the
 * run could not be read afterwards. A cost entry with no raw beside it is that
 * run again.
 */
/**
 * @param {{ceilingUsd?: number|null,
 *   onCall?: (call: {label: string, costUsd: number|null, unpricedRounds: number, thinkingStatus?: string, raw?: string}) => void}} [o]
 *   `ceilingUsd` is the OPERATOR's ceiling; `null`/absent is UNBOUNDED.
 *   `onCall` is a REPORTING seam fired as each metered call lands — the shell's
 *   only chance to know what has been spent while the run is still alive. It is
 *   never consulted and never governs: `capStop` below is still the one
 *   predicate, still asked between calls, and still reads the same `entries`.
 *   `absorb` deliberately does NOT fire it: those calls were metered (and
 *   reported) by whoever made them, and reporting them twice would double the
 *   scout's spend in every reader downstream.
 */
export function makeCostBook({ ceilingUsd = null, onCall = () => {} } = {}) {
  /** @type {{label: string, costUsd: number|null, unpricedRounds: number}[]} */
  const entries = [];
  /** @type {ReturnType<typeof scrubRaw>[]} */
  const raws = [];
  return {
    /** @param {string} label @param {any} r a bare-agent run result @param {number} [attempt] */
    add(label, r, attempt = 1) {
      const call = { label, ...priceOf(r) };
      entries.push(call);
      const kept = scrubRaw({ label, attempt, text: r?.text, reason: r?.error ? String(r.error) : null });
      raws.push(kept);
      // bare-agent's per-run `thinkingStatus` ('applied' | 'unsupported' | 'ignored' | 'unknown') rides the REPORTING seam only —
      // never the stored entry, so the cost report and every persisted shape stay as they were; absent when thinkingMode was not sent.
      // R9 (Part B 4): the call's scrubbed answer rides the same seam (secret-masked and bounded by `scrubRaw`, the one mask owner), so the session's drafting log keeps what an
      // unusable draft try actually said; an empty answer (a tool-delivered reply) adds nothing
      onCall({ ...call, ...(kept.text === '' ? {} : { raw: kept.text }), ...(r?.thinkingStatus === undefined ? {} : { thinkingStatus: r.thinkingStatus }) });
      return entries.at(-1);
    },
    /** @param {{label: string, costUsd: number|null, unpricedRounds: number}[]} calls
     * @param {ReturnType<typeof scrubRaw>[]} [callRaws] */
    absorb(calls, callRaws) { for (const c of calls ?? []) entries.push({ ...c }); for (const w of callRaws ?? []) raws.push({ ...w }); },
    /** the persisted raws, in call order — the same order and the same labels as
     * `report().calls`, because both are readings of one list */
    raws() { return raws.map((w) => ({ ...w })); },
    report() {
      return { ...tallyCalls(entries), calls: entries.map((e) => ({ ...e })) };
    },
    /**
     * THE CEILING'S OWN READING, asked between metered calls. The book is the one
     * place this pipeline's spend accumulates, so it is the one place that can
     * answer honestly — and it answers through the shared predicate rather than a
     * second hand-spelled comparison (`src/text.js`, beside `priceOf`).
     * @returns {'cap-halt'|'pricing-red'|null}
     */
    capStop() { return capStop({ ceilingUsd, ...tallyCalls(entries) }); },
    /** what was set, stated — `null` is "nobody set one", which is UNBOUNDED and
     * a visible operator choice, never a defaulted number */
    ceilingUsd,
  };
}

/**
 * ONE structured ask, with the malformed-emission retry bounded on its OWN axis.
 * A reply that carries no artifact is an ARTIFACT-RED — name the axis, retry
 * under a cap, write nothing — and it never consumes a revision, because a
 * transport fault is not a defect in a close.
 *
 * THE CHANNEL IS A PARAMETER, and that is softgreen module 4's only change here:
 * the rubric card and the calibration set are a SECOND schema-forced emission
 * with the same failure modes, and a second ladder is a second place for the cap,
 * the reject block and the re-ask to drift. The declaration channel below is the
 * one this loop has always used, spelled out rather than inlined — nothing about
 * the authoring path's behaviour moves.
 * @param {{messages: any[], generate: Function, mode: 'tool'|'text', retries: number,
 *   label: string, book: ReturnType<typeof makeCostBook>,
 *   channel: {name: string, instruction: string, textPath?: string, tool: (box: {calls: any[]}) => any}}} o
 * @returns {Promise<{artifact: any, attempts: number, convo: any[], raw: string,
 *   providerError: string|null, red: Red|null, budget: 'cap-halt'|'pricing-red'|null, allCutOff?: boolean}>}
 */
export async function askStructured({ messages, generate, mode, retries, label, book, channel }) {
  /** @type {any[]} */
  const convo = [...messages];
  let attempts = 0;
  /** @type {Red|null} */
  let red = null;
  /** how many of this ask's attempts were cut off at the output cap (P7: all of them = a failed try for the question gate) */
  let cutOffs = 0;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // THE CEILING, immediately before the paid call and nowhere else. Sited HERE
    // rather than in the revise loop because this is where every declaration call
    // is actually made: the author call, each revise, AND each malformed-emission
    // retry. The retry axis is the one that matters most — it fires exactly when
    // the model is malforming, which is the worst moment for a paid loop to be
    // unbounded. `attempts` is returned as-is so the caller can tell a cap that
    // tripped before this ask began (0) from one that cut a retry ladder short.
    const halt = book.capStop();
    if (halt) return { artifact: null, attempts, convo, raw: '', providerError: null, red: null, budget: halt };

    /** @type {{calls: any[]}} */
    const box = { calls: [] };
    // the tool's schema is CLASS-SCOPED, like the prompt's catalogue block: the
    // two must offer one set of kinds, or the composer reads about a kind it
    // cannot call — or worse, calls one the ceiling will refuse after we paid.
    const tools = mode === 'tool' ? [channel.tool(box)] : [];
    // F179/F180 — bare-agent 0.42.0's OpenAIProvider.generate used to THROW
    // mid-call (a raw SyntaxError off a malformed tool-call arguments string,
    // parsed with no try/catch) rather than resolve with `{error}` the way a
    // settled provider-shape casualty normally does; 0.43.0 fixed that class
    // upstream (BA-27), so `callCasualty` no longer admits a SyntaxError at
    // all (its branch was dead code and was removed). This try/catch stays
    // for the class it was ALSO built to cover: `callCasualty` is the SAME
    // predicate `authorscout.js`'s `settled` uses for its idle-timeout seam
    // (src/text.js, beside `priceOf`) — a HaltError or an unrecognised throw
    // re-raises unchanged; only an admitted casualty class lands here as the
    // same `{error}` shape the resolved-error path already books and returns
    // below.
    let r;
    try {
      r = await generate(convo, tools, {});
    } catch (e) {
      const reason = callCasualty(e);
      if (reason === null) throw e;
      attempts += 1;
      book.add(attempt === 0 ? label : `${label}#${attempt + 1}`, { error: reason }, attempts);
      return { artifact: null, attempts, convo, raw: '', providerError: reason, red: null, budget: null };
    }
    attempts += 1;
    book.add(attempt === 0 ? label : `${label}#${attempt + 1}`, r, attempts);
    const raw = redactSecrets(String(r?.text ?? ''));

    // ITEM 6 (P7, live session smv2bzdqmp0f8, 2026-10-10): a round cut off at the output cap is the MODEL's own overlong
    // answer, not a transport fault — it is a failed try on the same ladder as a malformed artifact (the spend is already
    // booked above). Only a real error (a throw, a provider/halt tag) stays provider-red.
    const cutOff = isOutputCutOff(r);
    if (cutOff) cutOffs += 1;
    if (r?.error && !cutOff) {
      return { artifact: null, attempts, convo, raw, providerError: String(r.error), red: null, budget: null };
    }

    if (cutOff) {
      red = {
        code: 'artifact-red',
        path: channel.name,
        detail: "the AI's answer was cut off at the output limit",
        axis: 'output-truncated',
      };
    } else if (mode === 'tool') {
      // F179 (2026-09-15 ruling) — retry, never repair. bare-agent 0.43.0
      // (BA-27) already priced this round on the real usage and returns it
      // with `toolCalls: []` plus its own `malformedToolCall` marker instead
      // of throwing; this ladder's EXISTING malformed-emission retry (below)
      // is the whole mechanism — no new cap, no second pricing path, nothing
      // here ever re-parses or edits the model's arguments. The raw malformed
      // string itself is never persisted, only the parser's own error
      // message, scrubbed like every other model-authored text on this trail.
      //
      // Checked BEFORE the `box.calls.length === 1` accept and REGARDLESS of
      // how many calls survived (0 or more — bare-agent's `parseToolCalls` is
      // itself all-or-nothing, BA-27, so a real provider always returns 0 on
      // a malformed round): before this fix, a two-call reply was ALWAYS the
      // 'multiple-declaration-tool-calls' red, never an accept, so a
      // malformed call riding alongside a valid one must not widen what this
      // ladder takes from a malformed reply. Nothing from a malformed reply
      // is ever accepted.
      if (r?.malformedToolCall) {
        red = {
          code: 'artifact-red',
          path: channel.name,
          detail: `the reply's ${channel.name} call arguments were not valid JSON `
            + `(${redactSecrets(String(r.malformedToolCall.error))}) — nothing is repaired; the call must be re-sent whole`,
          axis: 'malformed-tool-call-arguments',
        };
      } else if (box.calls.length === 1) {
        return { artifact: box.calls[0], attempts, convo, raw, providerError: null, red: null, budget: null };
      } else {
        red = {
          code: 'artifact-red',
          path: channel.name,
          detail: box.calls.length === 0
            ? `the reply delivered no ${channel.name} call — structure is enforced, prose is never parsed`
            : `the reply delivered ${box.calls.length} ${channel.name} calls; exactly one is expected`,
          axis: box.calls.length === 0 ? 'no-declaration-tool-call' : 'multiple-declaration-tool-calls',
        };
      }
    } else {
      // THE FALLBACK PATH — providers without tool mode only. The ONE shipped
      // parser, never a second one.
      const at = channel.textPath ?? channel.name;
      const { code, red: extractRed } = extractArtifact(raw);
      if (code) {
        try { return { artifact: JSON.parse(code), attempts, convo, raw, providerError: null, red: null, budget: null }; }
        catch (e) { red = { code: 'artifact-red', path: at, detail: `the ${at} did not parse as JSON: ${String(/** @type {any} */ (e)?.message ?? e)}`, axis: 'unparseable-json' }; }
      } else {
        red = { code: 'artifact-red', path: at, detail: `no artifact in the reply: ${extractRed}`, axis: 'no-artifact' };
      }
    }

    if (attempt < retries) {
      const block = renderRejectBlock({ kind: 'artifact', reds: [/** @type {Red} */ (red).detail] });
      // a cut-off reply is NOT replayed (it would re-bill the whole cap as input and teach nothing)
      convo.push({ role: 'assistant', content: (cutOff ? '' : raw.trim()) || '(the reply carried no text)' });
      convo.push({ role: 'user', content: `${block}\n\n${mode === 'tool' ? channel.instruction : STRUCTURE_INSTRUCTION_TEXT}` });
    }
  }
  return { artifact: null, attempts, convo, raw: '', providerError: null, red, budget: null, allCutOff: attempts > 0 && cutOffs === attempts };
}
