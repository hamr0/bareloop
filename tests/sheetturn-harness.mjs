// Shared by the S2 row-edit turn tests (not a test file): one drafting run of authorClose (the row-edit turn of a rubric job) over ONE input, a scripted model that delivers row-edit replies,
// recording every message and tool the model was shown. Used for the sheet turn and for the byte-diff gate (a job with no CSV is shown today's turn, byte for byte).
import { mkdtempSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorClose, GREEN_QUESTIONS } from '../src/authorflow.js';
import { ROW_EDIT_TOOL } from '../src/rowedit.js';
import { RUBRIC_LANG } from '../src/authoring.js';
import { proveRubricInputs } from '../src/source.js';
import { buildSeedListing } from '../src/authorscout.js';

export const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */ const made = [];
export const cleanup = () => { for (const d of made) rmSync(d, { recursive: true, force: true }); };
export const tmp = (p = 'sheetturn-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };

/**
 * @param {{input: {value: string, label: string}, jobLines: any[], replies: any[], ticket?: boolean, csv?: string, jobText?: string}} o
 * `csv` is a fixture name under tests/fixtures/sheets (copied to a temp file, so the input is a real `.csv` file)
 */
export async function turnOver({ input, jobLines, replies, ticket = false, csv, jobText }) {
  let value = input.value;
  if (csv) { value = join(tmp(), csv); copyFileSync(join(HERE, 'fixtures', 'sheets', csv), value); }
  const proved = await proveRubricInputs({ inputs: [{ n: 1, label: input.label, value }], into: join(tmp(), 'seed'), fetchUrl: async (url) => ({ ok: true, text: readFileSync(join(HERE, 'fixtures', 'page-partial.txt'), 'utf8'), url }) });
  if (!proved.ok) throw new Error(`inputs not proved: ${JSON.stringify(proved)}`);
  const prep = proved.prep;
  /** @type {any[]} */ const sent = [];
  /** @type {any[]} */ const tools = [];
  let n = 0;
  const generate = async (/** @type {any[]} */ m, /** @type {any[]} */ ts) => {
    sent.push(JSON.parse(JSON.stringify(m)));
    const tool = ts.find((t) => t.name === ROW_EDIT_TOOL);
    tools.push(JSON.parse(JSON.stringify(ts.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })))));
    const f = replies[Math.min(n, replies.length - 1)];
    n += 1;
    await tool.execute(f);
    return { text: '', error: null, msgs: [], metrics: { costUsd: 0.01, unpricedRounds: 0 } };
  };
  const listing = await buildSeedListing({ workdir: prep.tree, seedRef: prep.manifest.seed, sourcePaths: undefined, testPaths: undefined });
  const r = await authorClose({
    workdir: prep.tree, seedRef: prep.manifest.seed, lang: RUBRIC_LANG, verdictType: 'soft-green',
    answers: { 1: jobText ?? '1. job' }, questions: { 1: GREEN_QUESTIONS[1] },
    scout: { state: 'PRESENT', facts: { rubricFiles: true, inputs: [{ n: 1, label: input.label }] }, calls: [], raws: [] },
    listing, generate, writeScope: ['output/'], jobLines, inputs: [{ n: 1, label: input.label, value }], ticket,
  });
  return { r, sent, tools, calls: n };
}

export { GREEN_QUESTIONS };
