// PRD v1.106 Part 5 Q1 + Q3: the questions the person answers are recorded in the drafting log and drawn in the Audit's drafting table; CODE forces the
// early ask for a `~` rule the page map could not tie (T2). T1 (a number the AI made) is NOT built: the look carries no numbers - see the commit message.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../src/panel/authorsession.js';
import { readDraftSteps, DRAFT_LOG_FILE } from '../src/draftspend.js';
import { askableFromLook, parseMapAnswer, isLeaveUnchecked, LEAVE_UNCHECKED } from '../src/pagemap.js';
import { applyPageRules } from '../src/pagerules.js';
import { normalizeQuestions, MAX_QUESTIONS } from '../src/authorflow.js';
import { dropRows, dropLine } from '../src/pagedropwords.js';
import { lineRules } from '../src/rubricstep.js';
import { redactSecrets } from '../src/validate.js';
import { ANTH_CFG } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'fixtures', 'part5');
/** @type {string[]} */
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const tmp = (p = 'part5-ask-') => { const d = mkdtempSync(join(tmpdir(), p)); made.push(d); return d; };
const changelogCopy = () => { const f = join(tmp(), 'CHANGELOG.md'); copyFileSync(join(HERE, '..', 'CHANGELOG.md'), f); return f; };
const keysHome = () => { const d = tmp('part5-ask-home-'); writeFileSync(join(d, '.env'), 'ANTHROPIC_API_KEY=fake-not-a-real-key\n', { mode: 0o600 }); writeFileSync(join(d, 'config.json'), JSON.stringify(ANTH_CFG)); return d; };
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => { setTimeout(r, 10); }); return fn(); };

// ── the REAL look of run mve5y8fa, rebuilt at $0 from its own saved page and the page-map answer its draft log kept ──
const spec = JSON.parse(readFileSync(join(FX, 'mve5y8fa.resolved-spec.json'), 'utf8'));
const draftLog = readFileSync(join(FX, 'mve5y8fa.draft-log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const mapping = parseMapAnswer(draftLog.find((e) => e.label === 'page-map').raw);
const page = readFileSync(join(FX, 'mve5y8fa.flights.txt'), 'utf8');
const realLook = () => { assert.ok(mapping.ok); const kept = applyPageRules(page, /** @type {any} */ (mapping).mapping, spec.jobLines); return { facts: kept.facts.map((f) => ({ line: f.line, name: f.name, forRule: f.forRule })), dropped: kept.dropped }; };

test('T2 on the real look of mve5y8fa: all three ~ rules are tied to kept page words, so code asks nothing', () => {
  const look = realLook();
  assert.deepEqual(look.facts.filter((f) => f.forRule !== undefined).map((f) => f.forRule).sort(), [1, 2, 3]);
  assert.deepEqual(askableFromLook(look, spec.jobLines), []);
});

test('T2: a rule no kept fact carries is asked (line, rule, code-owned words); the one that IS tied is not; the same rule twice is asked once', () => {
  const look = realLook();
  const untied = { facts: look.facts.filter((f) => f.forRule !== 3) }; // the page gave nothing for "nonstop"
  const qs = askableFromLook(untied, spec.jobLines);
  assert.equal(qs.length, 1);
  assert.deepEqual([qs[0].line, qs[0].rule, qs[0].source], [1, 3, 'look']);
  assert.equal(qs[0].question, `Your line 1 says "nonstop". I found no word on the page for it. Check it how? Say it another way or give the numbers (your answer is added as a new ~ rule on line 1), or answer "${LEAVE_UNCHECKED}".`);
  const twice = [{ n: 1, text: 'x', rule: 'nonstop; nonstop', rules: ['nonstop', 'Nonstop'] }];
  assert.equal(askableFromLook({ facts: [] }, twice).length, 1, 'the same guardrail on the same line is asked once');
  assert.deepEqual(askableFromLook({ facts: [] }, [{ n: 1, text: 'x' }]), [], 'a line with no ~ rule asks nothing');
  assert.deepEqual(askableFromLook(null, []), []);
});

test('T2: at most MAX_QUESTIONS are asked, the rest are logged as dropped, never silent', () => {
  const lines = [1, 2, 3, 4].map((n) => ({ n, text: `l${n}`, rule: `r${n}`, rules: [`r${n}`] }));
  const cands = askableFromLook({ facts: [] }, lines);
  assert.equal(cands.length, 4);
  const kept = normalizeQuestions(cands, [1, 2, 3, 4]);
  assert.equal(kept.kept.length, MAX_QUESTIONS);
  assert.equal(kept.dropped.length, 2);
  assert.deepEqual(kept.kept.map((q) => [q.line, q.rule, q.source]), [[1, 1, 'look'], [2, 1, 'look']], 'line order, rule and source survive the cap');
});

test('isLeaveUnchecked: the exact words, any case, a closing full stop; nothing else', () => {
  assert.equal(isLeaveUnchecked('Leave it not checked.'), true);
  assert.equal(isLeaveUnchecked('  leave it Not checked '), true);
  assert.equal(isLeaveUnchecked('leave it'), false);
  assert.equal(isLeaveUnchecked('please leave it Not checked, thanks'), false);
});

/** a panel session over a look with one untied rule; the confirm model raises one question of its own */
function sessionWith({ lookFacts, confirmQuestions }) {
  const file = changelogCopy();
  const sessionsRoot = tmp('part5-ask-sess-');
  /** @type {any[]} */ const legs = [];
  const survey = { state: 'PRESENT', reason: null, cause: null, budgetStop: null, calls: [], raws: [],
    facts: { rubricFiles: true, inputs: [{ n: 1, label: 'Changelog' }], look: { facts: lookFacts, prose: [], notFound: [], dropped: [] } } };
  const PLAN = { goal: 'Find releases.', checks: [{ text: 'three releases are listed', fromLine: [1] }], notChecked: [], questions: confirmQuestions };
  const session = createSession({
    checkType: 'rubric', model: 'claude-sonnet-5', jobName: 'part5-ask-job', jobText: '1. Find the last 3 releases\n~ one per week',
    inputs: `Changelog: ${file}`, destination: join(tmp(), 'delivered'), capUsd: 1,
  }, {
    env: { ANTHROPIC_API_KEY: 'fake-not-a-real-key' }, home: keysHome(), sessionsRoot,
    generate: async () => { throw new Error('no model call'); },
    lookFn: async () => survey,
    confirmGenerate: async (_c, tools) => { await tools[0].execute(PLAN); return { text: JSON.stringify(PLAN), error: null, cost: 0.0005 }; },
    authorFn: async (o) => { legs.push(o); return { ok: false, stop: 'max-revisions', declaration: null, iterations: [], raws: [], cost: { costUsd: 0, knownUsd: 0, spendComplete: true, calls: [], unpricedRounds: 0 }, reds: [{ code: 'x', path: 'p', detail: 'line 1: nothing. Nothing was signed.' }] }; },
  });
  const sessionDir = () => join(sessionsRoot, readdirSync(sessionsRoot)[0]);
  return { session, legs, sessionDir, survey };
}

test('Q1 + Q3: the early ask and a confirm question are each recorded as a `human` row (source, question, answer); a blank answer leaves no row; a secret is masked; "leave it Not checked" adds no rule and lands on the look\'s Not checked list', async () => {
  const secret = `sk-ant-api03-${'a'.repeat(40)}`;
  assert.notEqual(redactSecrets(secret), secret, 'precondition: the repo\'s own inventory masks this shape');
  const { session, legs, sessionDir, survey } = sessionWith({ lookFacts: [], confirmQuestions: ['Which airport do you mean?'] });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'), `${session.state.phase} / ${session.state.error}`);
  assert.equal(session.state.pendingAsk.source, 'look');
  session.send('   ');                                 // blank: re-asks, records nothing
  assert.ok(await until(() => session.state.messages.some((m) => /An answer is needed/.test(m.text))));
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  session.send('Leave it Not checked.');               // T2: no new rule
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'menu'), 'then the plan is confirmed as usual');
  session.signPrepare();
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer' && session.state.pendingAsk.source === 'confirm'), 'the confirm card\'s own question');
  session.send(`LAX, and my key is ${secret}`);
  assert.ok(await until(() => ['refused', 'error', 'prepared'].includes(session.state.phase) || legs.length > 0));
  assert.ok(await until(() => legs.length === 1));
  const raw = readFileSync(join(sessionDir(), DRAFT_LOG_FILE), 'utf8');
  assert.ok(!raw.includes(secret), 'the secret never reaches the log');
  const humans = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'human');
  assert.equal(humans.length, 2, 'two answered questions, the blank answer left nothing');
  assert.deepEqual(humans.map((h) => [h.source, h.line ?? null]), [['look', 1], ['confirm', null]]);
  assert.match(humans[0].question, /^Your line 1 says "one per week"\./);
  assert.equal(humans[0].answer, 'Leave it Not checked.');
  assert.match(humans[1].answer, /^LAX, and my key is \[REDACTED/);
  // the steps fold them in under the step that was running
  const steps = readDraftSteps(sessionDir());
  const withHumans = steps.filter((x) => x.humans.length > 0);
  assert.deepEqual(withHumans.map((x) => [x.id, x.humans.length]), [['look', 1], ['confirm', 1]]);
  assert.equal(withHumans[1].humans[0].askedText, 'you were asked: Which airport do you mean?');
  assert.match(withHumans[1].humans[0].saidText, /^you said: LAX, and my key is \[REDACTED/);
  // T2 "leave": no rule was added, and the rule is on the look's own Not checked list, so it reads that way everywhere
  assert.deepEqual(legs[0].jobLines[0].rules, ['one per week']);
  const left = survey.facts.look.dropped;
  assert.deepEqual(left.map((d) => [d.line, d.rule, d.reason]), [[1, 1, 'person-left']]);
  assert.equal(dropLine(dropRows(left)[0], legs[0].jobLines, lineRules), 'line 1: "one per week" — You chose to leave it Not checked.');
});

test('Q1: an abandoned or unanswered question writes no row; an old session (the real mve5y8fa log) has no human rows and its steps carry an empty list', async () => {
  const { session, sessionDir } = sessionWith({ lookFacts: [], confirmQuestions: [] });
  assert.ok(await until(() => session.state.pendingAsk?.kind === 'answer'));
  const raw = () => { try { return readFileSync(join(sessionDir(), DRAFT_LOG_FILE), 'utf8'); } catch { return ''; } };
  assert.ok(!raw().includes('"kind":"human"'), 'asked but not answered: nothing written');
  session.abandon?.();
  const real = tmp('part5-ask-old-');
  copyFileSync(join(FX, 'mve5y8fa.draft-log.jsonl'), join(real, DRAFT_LOG_FILE));
  const steps = readDraftSteps(real);
  assert.ok(steps.length > 5);
  assert.ok(steps.every((x) => Array.isArray(x.humans) && x.humans.length === 0));
});

test('Q1 on the page: the drafting table draws "you were asked" / "you said" under the step, from the server\'s words; the page types neither', async () => {
  const PAGE = readFileSync(join(HERE, '..', 'src', 'panel', 'index.html'), 'utf8');
  const fnSrc = (name) => { const st = PAGE.indexOf(`function ${name}(`); let d = 0; let i = PAGE.indexOf('{', st); for (; i < PAGE.length; i += 1) { if (PAGE[i] === '{') d += 1; else if (PAGE[i] === '}') { d -= 1; if (d === 0) break; } } return PAGE.slice(st, i + 1); };
  const f = new Function('escapeXml', 'duration', 'panelMoney', `${['draftingCallCost', 'draftingMoneyText', 'draftingTableHtml'].map(fnSrc).join('\n')}\nreturn draftingTableHtml;`)(
    (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'), (ms) => `${ms}ms`, (v) => `$${Number(v).toFixed(2)}`);
  const html = f({ draftSteps: [{ label: 'confirming plan', wallMs: 1000, calls: [{ label: 'confirm', model: 'm', costUsd: 0.001, unpricedRounds: 0 }], humans: [{ askedText: 'you were asked: Which airport do you mean?', saidText: 'you said: LAX' }] }], wallMs: 1000, rounds: 1, spentUsd: 0.001, spendComplete: true });
  assert.match(html, /<tr class="human-row" data-testid="drafting-human"><td colspan="5"[^>]*>you were asked: Which airport do you mean\?<br>you said: LAX<\/td><\/tr>/);
  const none = f({ draftSteps: [{ label: 'x', wallMs: 1, calls: [], humans: [] }], wallMs: 1, rounds: 0, spentUsd: 0, spendComplete: true });
  assert.doesNotMatch(none, /human-row/);
  const CODE_ONLY = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(CODE_ONLY, /you were asked|you said/);
});
