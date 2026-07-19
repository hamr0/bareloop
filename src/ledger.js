// The upstream ledger (module 4) — reactive lib/primitive incident monitoring.
// Design record: docs/plans/2026-07-11-upstream-ledger-design.md (adaptlearn
// POC'd spec) + its 2026-07-13 addendum: the bareloop event mapping. One
// append-only JSONL both the consumer (the panel, N6) and the maintainer read;
// the A1/A2/A3 upstream-ask flow, mechanized — evidence in, human judgment out.
//
// Doctrine this encodes:
// - Spines stay ground truth; the ledger is DERIVED and reconstructible
//   (delete it, re-run the collector over the corpus: same fold). Current
//   state is a fold, never a mutation — occurrence rows are cumulative deltas.
// - Idempotence is the collector contract: pass the FULL spine corpus each
//   time; counts are totals computed from what you pass, and a row appends
//   only when a key is new or its count grew.
// - suggestedAsk is a template seed for UPSTREAM-ASKS, never auto-filed —
//   filing stays human (the arbiter line, maintainer form). Status rows
//   (open → filed → fixed → consumed) are human-appended; this module only
//   folds them.
// - capability-gap (cap-halt + request-red in one spine) ships but is dormant
//   in N2: a request-red is a job-validation red today, so the job never runs.
//   It goes live when in-loop admission lands (2b deferral).

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { VERBS } from './validate.js';

/** severity order, worst-first (the fold's display order; frequency ranks within) */
export const LEDGER_CLASSES = Object.freeze([
  'silent-degradation', // A3: a degraded primitive throws nothing — only the known-answer smoke reds it
  'runtime-red',        // a store/verb threw at runtime
  'provider-red',       // the provider path failed (bare-agent territory)
  'pricing-red',        // F6: a result carried no priced cost — the cap went blind
  'capability-gap',     // a locked verb was requested AND the run cap-halted
  'broken-close',       // consumer-attributed: the arbiter itself cannot run
  'request-red',        // admission demand for a locked-but-listed verb
  'retention-red',      // litectx retention failed on-green (green stands, mints nothing)
  'config-red',         // drafting friction — bareloop's own schema/prompt indicted
]);

/** @typedef {{spine: string, seq: number}} Sample */
/** @typedef {{key: string, class: string, lib: string, verb: string, sig: string, detail: string, sample: Sample}} Occurrence */
/** @typedef {{key: string, lib: string, verb: string, class: string, sig: string, detail: string, occurrences: number, samples: Sample[], suggestedAsk: string, status: string, ref?: string}} FoldEntry */

const DETAIL_MAX = 300;
/** paths and numbers are run-local noise: normalize them so the same bug
 * across runs dedupes and distinct bugs in one verb don't merge */
const normalizeDetail = (/** @type {unknown} */ s) => String(s ?? '')
  .replace(/(?:~|\.{1,2})?\/[^\s"'`):,]+/g, '<path>')
  .replace(/\d+(?:\.\d+)?/g, '#')
  .slice(0, DETAIL_MAX);
const sigOf = (/** @type {string} */ normalized) => createHash('sha256').update(normalized).digest('hex').slice(0, 8);

const VERB_RE = new RegExp(`\\b(${VERBS.join('|')})\\b`);
const QUOTED_VERB_RE = /"([a-z0-9-]+)"/;

/** The deliberate escalation exclusions as a RUNTIME set, not prose: anything
 * outside {classified} ∪ {this} is an unmapped class and gets counted (see the
 * escalation branch). Kept beside the doc comment on classifyIncidents, which
 * explains WHY each one classifies to nothing. */
const EXCLUDED_ESCALATIONS = new Set([
  'cap-halt',           // a budget story, not a lib bug
  'gate-red',           // governance working as intended
  'smoke-red',          // already counted via primitive-smoke
  'hitl-close',         // by design: a human is the close
  'close-unsupported',  // honest refusal, by design
  'close-timeout',      // close-verdict reds: the arbiter's own named terminals
  'close-killed',       // (F17) — operator/environment stories, never a suite lib
  'close-crashed',
]);

/** suggestedAsk templates — seeds for UPSTREAM-ASKS entries, never auto-filed */
const ASKS = /** @type {Record<string, (o: {lib: string, verb: string, detail: string}) => string>} */ ({
  'silent-degradation': (o) => `${o.lib}: \`${o.verb}\` failed its known-answer smoke — ${o.detail}`,
  'runtime-red': (o) => `${o.lib}: \`${o.verb}\` threw at runtime — ${o.detail}`,
  'provider-red': (o) => `bare-agent: the provider path failed — ${o.detail}`,
  'pricing-red': (o) => `bare-agent: a provider result carried no priced cost (unpriced is never free, F6) — ${o.detail}`,
  'capability-gap': (o) => `bare-agent: locked \`${o.verb}\` was requested and the run cap-halted — admission candidate`,
  'broken-close': (o) => `job owner: the close itself cannot run — ${o.detail}`,
  'request-red': (o) => `admission: locked \`${o.verb}\` requested by a job spec — demand evidence, never a grant`,
  'retention-red': (o) => `litectx: on-green retention failed — ${o.detail}`,
  'config-red': (o) => `bareloop: drafting friction at ${o.verb} — ${o.detail}`,
});

/**
 * Classify one spine's events into incident occurrences (the design table in
 * bareloop vocabulary). Deliberate exclusions — bare cap-halt (a budget story),
 * close-verdict reds and artifact-red (worker stories, the §5b line), gate-red
 * (governance working as intended), pr-red (operator environment, not a suite
 * lib), smoke-red escalations (already counted via primitive-smoke), hitl-close
 * and close-unsupported (by design) — classify to nothing.
 * @param {any[]} events one spine's parsed events, in seq order
 * @param {{spine?: string}} [opts] spine id stamped into samples
 * @returns {Occurrence[]}
 */
export function classifyIncidents(events, { spine = 'spine' } = {}) {
  /** @type {Occurrence[]} */
  const occs = [];
  let capHalted = false;
  /** @type {(ev: any, cls: string, lib: string, verb: string, rawDetail: unknown) => void} */
  const add = (ev, cls, lib, verb, rawDetail) => {
    const detail = normalizeDetail(rawDetail);
    const sig = sigOf(detail);
    occs.push({ key: `${lib}:${verb}:${cls}:${sig}`, class: cls, lib, verb, sig, detail, sample: { spine, seq: ev.seq } });
  };

  for (const ev of events) {
    if (ev.type === 'primitive-smoke' && ev.ok === false) {
      add(ev, 'silent-degradation', ev.primitive ?? 'unknown', 'smoke', ev.detail);
    } else if (ev.type === 'retention-red') {
      add(ev, 'retention-red', 'litectx', 'remember', ev.detail);
    } else if (ev.type === 'cap-halt') {
      capHalted = true; // not an incident alone — see capability-gap below
    } else if (ev.type === 'config-red') {
      // in bareloop the config is model-drafted against OUR schema description:
      // a repeated signature indicts the drafting prompt/schema, i.e. bareloop
      add(ev, 'config-red', 'bareloop', String(ev.path ?? 'config').split('.')[0] || 'config', `${ev.code} at ${ev.path}: ${ev.detail ?? ''}`);
    } else if (ev.type === 'job-red' && ev.code === 'request-red') {
      // the structured field wins; the prose-quoted verb stays as the fallback
      // for spines written before the field existed
      add(ev, 'request-red', 'bare-agent', ev.verb ?? (String(ev.detail ?? '').match(QUOTED_VERB_RE) ?? [])[1] ?? 'unknown', ev.detail);
    } else if (ev.type === 'escalation') {
      if (ev.category === 'broken-close') {
        add(ev, 'broken-close', 'consumer', 'close', ev.detail);
      } else if (ev.category === 'provider-red') {
        // the runner's transport-throw seam (design table: retry-exhausted seam)
        add(ev, 'provider-red', 'bare-agent', 'provider', ev.detail ?? ev.decision);
      } else if (ev.category === 'pricing-red') {
        add(ev, 'pricing-red', 'bare-agent', 'pricing', ev.decision ?? ev.detail);
      } else if (ev.category === 'interpreter-red') {
        // the design split: a store verb in the detail → runtime-red (verb→lib
        // map); a worker-loop/provider failure → provider-red; neither is
        // still counted (runtime-red, lib unknown) — never silently dropped
        const detail = String(ev.detail ?? '');
        // The STRUCTURED field wins, prose stays the fallback for spines written
        // before it existed (the request-red contract above). Prose alone
        // misfiled deterministically: interpret.js prefixes every worker-loop
        // error with "worker loop:", and the verb sniff ran first, so a
        // bare-agent transport failure whose text merely said "recall" was
        // billed to litectx — wrong upstream asked, real regression hidden.
        if (ev.lib === 'bare-agent') add(ev, 'provider-red', 'bare-agent', 'provider', detail);
        else if (ev.lib === 'litectx') add(ev, 'runtime-red', 'litectx', (detail.match(VERB_RE) ?? [])[1] ?? 'store', detail);
        else {
          const verb = (detail.match(VERB_RE) ?? [])[1];
          if (verb || /\blitectx\b/.test(detail)) add(ev, 'runtime-red', 'litectx', verb ?? 'store', detail);
          else if (/worker loop|provider/i.test(detail)) add(ev, 'provider-red', 'bare-agent', 'provider', detail);
          else add(ev, 'runtime-red', 'unknown', 'middle', detail);
        }
      } else if (!EXCLUDED_ESCALATIONS.has(String(ev.category))) {
        // The exclusions above are DELIBERATE and now executable (see the set):
        // a category that is neither classified nor named there is a NEW or
        // renamed failure class, and the four-way chain used to drop it into
        // exactly the same silence as a deliberate skip — a whole class could
        // leave the ledger with no red, no count, nothing to notice. Counted
        // against bareloop: a stale emit→classify mapping is OUR bug.
        add(ev, 'runtime-red', 'bareloop', 'escalation', `unclassified escalation category "${ev.category}": ${ev.detail ?? ev.decision ?? ''}`);
      }
    }
  }

  if (capHalted) {
    // capability-gap: the run hit its cap in a spine that also asked for a
    // locked verb — the strongest admission evidence there is (design table)
    for (const verb of new Set(occs.filter((o) => o.class === 'request-red').map((o) => o.verb))) {
      const halt = events.find((e) => e.type === 'cap-halt');
      add(halt, 'capability-gap', 'bare-agent', verb, `locked "${verb}" requested and the run cap-halted`);
    }
  }
  return occs;
}

/**
 * Fold ledger rows to current state — latest cumulative count per key, latest
 * human-appended status riding on top (default 'open'). A status row for a key
 * with no incident row still folds (occurrences 0): a human note must never
 * silently vanish.
 * @param {any[]} rows parsed ledger rows, in seq order
 * @returns {Record<string, FoldEntry>}
 */
export function foldLedger(rows) {
  /** @type {Record<string, FoldEntry>} */
  const fold = {};
  for (const row of rows) {
    if (row.type === 'lib-incident') {
      const prev = fold[row.key];
      const { seq: _seq, ts: _ts, type: _type, ...fields } = row;
      // incident fields refresh; a human-appended status must ride on top
      fold[row.key] = { ...fields, status: prev?.status ?? 'open', ...(prev?.ref !== undefined ? { ref: prev.ref } : {}) };
    } else if (row.type === 'lib-incident-status') {
      /** @type {FoldEntry} */
      const prev = fold[row.key] ?? { key: row.key, lib: 'unknown', verb: 'unknown', class: 'unknown', sig: '', detail: '', occurrences: 0, samples: [], suggestedAsk: '', status: 'open' };
      fold[row.key] = { ...prev, status: row.status, ref: row.ref };
    }
  }
  return fold;
}

const SAMPLES_MAX = 5;

/**
 * Compute the append-only delta rows: group occurrences by key; a row is due
 * only when the key is new or its corpus total grew past the folded count.
 * detail is first-seen (the fold's wins); samples are the corpus's first few.
 * @param {Record<string, FoldEntry>} fold current ledger state
 * @param {Occurrence[]} occurrences the FULL corpus's occurrences
 * @returns {object[]} lib-incident rows, unstamped (no seq/ts)
 */
export function ledgerDeltas(fold, occurrences) {
  /** @type {Map<string, Occurrence[]>} */
  const byKey = new Map();
  for (const o of occurrences) {
    const group = byKey.get(o.key) ?? [];
    group.push(o);
    byKey.set(o.key, group);
  }
  const rows = [];
  for (const [key, group] of byKey) {
    const prev = fold[key];
    if (prev && group.length <= prev.occurrences) continue;
    const first = group[0];
    const detail = prev?.detail || first.detail;
    rows.push({
      type: 'lib-incident', key, lib: first.lib, verb: first.verb, class: first.class, sig: first.sig,
      detail, occurrences: group.length, samples: group.slice(0, SAMPLES_MAX).map((o) => o.sample),
      suggestedAsk: ASKS[first.class]({ lib: first.lib, verb: first.verb, detail }),
    });
  }
  return rows;
}

/** @param {string} file @returns {any[]} */
function readJsonl(file) {
  const rows = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try { rows.push(JSON.parse(lines[i])); } catch {
      // corruption in a derived file is never papered over — rebuild from spines
      throw new Error(`${file} line ${i + 1}: malformed JSONL`);
    }
  }
  return rows;
}

/**
 * The collector: read the ledger, classify the FULL spine corpus, append the
 * deltas (spine conventions: type first, ts stamped last, seq continuing
 * monotonically across appends). Idempotent over the same corpus; the CLI
 * wrapping this lands at N5, the panel reads the same file at N6.
 * @param {{ledgerFile: string, spineFiles: string[]}} o spineFiles: the corpus
 *   (pass ALL of it each time — counts are totals, not increments)
 * @returns {{appended: object[], fold: Record<string, FoldEntry>}}
 */
export function updateLedger({ ledgerFile, spineFiles }) {
  const rows = existsSync(ledgerFile) ? readJsonl(ledgerFile) : [];
  const occurrences = spineFiles.flatMap((f) => classifyIncidents(readJsonl(f), { spine: basename(f).replace(/\.jsonl$/, '') }));
  const deltas = ledgerDeltas(foldLedger(rows), occurrences);
  let seq = rows.reduce((m, r) => Math.max(m, r.seq ?? 0), 0);
  const appended = deltas.map((row) => {
    /** @type {Record<string, unknown>} */
    const stamped = { ...row, seq: ++seq };
    stamped.ts = new Date().toISOString();
    appendFileSync(ledgerFile, JSON.stringify(stamped) + '\n');
    return stamped;
  });
  return { appended, fold: foldLedger(rows.concat(appended)) };
}
