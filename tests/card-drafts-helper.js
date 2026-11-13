// The two live drafts of 2026-11-13 as fixtures (tests/fixtures/card-drafts): the saved page, the page-map reply the AI really sent (its raw text, from the session's own draft log) and the
// ledger-suggest result (read from the log's own `ledger` rows). The look is the REAL runPageMap over the real page, so a fact is tied to its `~` rule exactly as in the session.
//   A = session smwelq2l6srdb: "List 3 flights from Boston to Chicago", ~ under $450, ~ departure between 05:00 and 21:59
//   B = session smwelw0jrax5c: the same plus ~ nonstop is not mandatory (revise 1)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPageMap } from '../src/pagemap.js';
import { CheckBlock } from '../src/checkblock.js';
import { reply } from './helpers.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'card-drafts');
const SESSION = { A: 'smwelq2l6srdb', B: 'smwelw0jrax5c' };
const RULES = { A: ['under $450', 'departure between 05:00 and 21:59'], B: ['under $450', 'departure between 05:00 and 21:59', 'nonstop is not mandatory'] };

/** @param {'A'|'B'} which */
export function readDraft(which) {
  const log = readFileSync(join(DIR, `${SESSION[which]}-draft-log.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const raw = log.find((e) => e.kind === 'call' && e.label === 'page-map').raw;
  const ledger = log.filter((e) => e.kind === 'ledger' && e.from === 'agent');
  return {
    session: SESSION[which], page: readFileSync(join(DIR, `flights-${which}.txt`), 'utf8'), raw, ledgerRows: log.filter((e) => e.kind === 'ledger'),
    jobLines: [{ n: 1, text: 'List 3 flights from Boston to Chicago', rules: RULES[which] }],
    extra: ledger.flatMap((e) => (e.rowKind === 'count' ? [{ op: 'add', kind: 'count', line: 1, min: Number(/count\.(\d+)-/.exec(e.key)?.[1]), ...(/-(\d+)$/.test(e.key) ? { max: Number(/-(\d+)$/.exec(e.key)?.[1]) } : {}) }]
      : e.rowKind === 'phrase' ? [{ op: 'add', kind: 'phrase', line: 1, name: e.words[0], words: [e.words[0]], source: 'flights' }] : [])),
  };
}

/** the block of a draft, built in the order authorjob builds it: job, look, the ledger-suggest adds, reconcile @param {'A'|'B'} which @param {{asks?: boolean, extra?: any[], untie?: string, split?: boolean}} [o] */
export async function draftBlock(which, { asks = false, extra, untie = '', split = true } = {}) {
  const d = readDraft(which);
  const map = await runPageMap({
    texts: { flights: d.page }, inputs: [{ n: 1, label: 'flights' }], jobLines: d.jobLines, sleep: async () => {}, onCall: () => {},
    provider: { async generate() { return reply({ text: d.raw, costUsd: 0.001 }); } },
  });
  const block = new CheckBlock({ texts: { flights: d.page }, labels: ['flights'], asks, split });
  block.fromJob(d.jobLines);
  block.addLook(untie ? map.facts.look.facts.map((/** @type {any} */ f) => { if (f.name !== untie) return f; const { forRule, ...rest } = f; return rest; }) : map.facts.look.facts, map.facts.look.dropped);
  block.reconcile();
  block.applyDelta({ label: 'pre:ledger-suggest', pre: true, edits: extra ?? d.extra });
  block.reconcile();
  return { block, d, look: map.facts.look };
}
