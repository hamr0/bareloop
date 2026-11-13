// Shared scaffolding for the drafting question-box tests (hamr 2026-11-12, as fwdloop M10 am29/am30/am31): real panel sessions over a real rubric job, the model boundary scripted.
// Every session is built over a scratch HOME; nothing here touches the real ~/.config/bareloop.
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';
import { createSession } from '../src/panel/authorsession.js';
import { SUGGEST_TOOL } from '../src/checkpick.js';
import { DRAFT_LOG_FILE } from '../src/draftspend.js';
import { ANTH_CFG } from './helpers.js';

export const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
export const tmp = (/** @type {string} */ p = 'qbox-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
export const until = async (/** @type {() => any} */ fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };
const keysHome = () => { const d = tmp('qbox-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };
const EMPTY_LOOK = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [], facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: [], prose: [], notFound: [] } } };
export const FAILED_LEG = { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [] };

/**
 * A rubric draft over the repo's own CHANGELOG as the input. `picks` = the check-suggestion call's answer (R10 asks: a proposal, or none); `survey` replaces the look.
 * @param {{jobText: string, picks?: any[], survey?: any, extra?: Record<string, any>}} o
 */
export function rubricSession({ jobText, picks, survey = EMPTY_LOOK, extra = {} }) {
  const file = join(tmp(), 'CHANGELOG.md');
  copyFileSync(join(HERE, '..', 'CHANGELOG.md'), file);
  const sessionsRoot = tmp('qbox-sess-');
  /** @type {any[]} */ const legs = [];
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'qbox-job', jobText, inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot,
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    ...(picks === undefined ? {} : { pickGenerate: async (/** @type {any} */ _m, /** @type {any[]} */ tools) => { await tools.find((t) => t.name === SUGGEST_TOOL).execute({ checks: picks }); return { text: '', error: null, msgs: [], metrics: { costUsd: 0.0009, unpricedRounds: 0 } }; } }),
    confirmGenerate: async (/** @type {any} */ _c, /** @type {any[]} */ tools) => { const P = { goal: 'g', checks: [], notChecked: [], questions: [] }; await tools[0].execute(P); return { text: '', error: null, cost: 0.0005 }; },
    authorFn: async (/** @type {any} */ o) => { legs.push(o); return FAILED_LEG; },
    ...extra,
  });
  const bot = () => session.state.messages.filter((/** @type {any} */ m) => m.role === 'bot');
  const log = () => readFileSync(join(session.state.outDir, DRAFT_LOG_FILE), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { session, legs, bot, log, sessionsRoot };
}
export { readdirSync };
