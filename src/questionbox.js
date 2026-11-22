// The question box of the drafting chat (hamr 2026-11-12, as fwdloop M10 am29/am30/am31): a question asked while drafting gets its own box in the panel, with the question,
// its own buttons (the person's intent is a typed choice, never words read). A check question (a look's reading, a proposed check) is BUTTONS ONLY (hamr 2026-11-15): no box to type in; a rule is changed by Revise.
// The drafter's own try-3 questions and the Destination question have no button to answer with, so they keep one line to type in. This file is the ONE owner of what the
// panel shows for a pending question and of which choices a question offers (the page draws it, never works it out). The CLI (src/authorrun.js) is a sibling caller of the same
// questions and keeps typing words; the stored question text never changes, only the panel's copy of it is cut.
import { DROP_IT } from './pagemap.js';
import { DEST_ANSWER, DEST_ANSWER_FOLDER } from './destpoint.js';

/** the door's refusals, word for word (fwd am31); a refusal leaves the question open and writes nothing */
export const CHOICE_SAYS = Object.freeze({
  bad: 'That answer is not one of the choices. Nothing was saved.',
  notOffered: 'That choice is not offered for this question. Nothing was saved.',
  outOfDate: 'This page is out of date. Reload it and answer again. Nothing was saved.',
  noRule:'That question is about the job line, not one of your ~ rules, so there is nothing to drop. Nothing was saved.',
  pickColumn: 'This question has a list to choose from: pick one of the columns, or Drop it. Nothing was saved.',
  blank: 'An answer is needed here — there is no skip. Type it in the box and press Send.',
});

/**
 * Which buttons a look question offers. Agree only when it carries a proposal (a reading ask with its reading, a check-pick ask with its check); Drop it only where "drop it" leaves
 * one of the person's own `~` rules Not checked (a reading or check-pick ask about a rule number). A rule with nothing to agree to is not asked at all (src/checkblock.js).
 * A column TIE (S1, hamr 2026-11-17) carries `columns`: the picker lists every one (no cutoff); it has no reading to Agree to and takes no own words (a closed question).
 * @param {{source?: string, ask?: string, reading?: unknown, check?: unknown, rule?: unknown, columns?: unknown}} q @returns {{agree: boolean, drop: boolean, columns?: string[]}}
 */
export function offersOf(q) {
  const look = q.source === 'look';
  const agree = look && ((q.ask === 'reading' && typeof q.reading === 'string') || (q.ask === 'check' && q.check !== null && typeof q.check === 'object'));
  const drop = look && Number.isInteger(q.rule) && (q.ask === 'check' || q.ask === 'reading');
  const columns = look && q.ask === 'reading' && Array.isArray(q.columns) && q.columns.length > 0 ? q.columns.map(String) : undefined;
  return { agree, drop, ...(columns ? { columns } : {}) };
}

/**
 * A question as the PANEL shows it: the Destination question's own typed-answer words (`DEST_ANSWER`) cut off the end, because its buttons and box say it. A look question carries no answer words
 * (its buttons say it); it is returned whole. Only the known tail is cut, matched exactly as a suffix (never a pattern over the prose).
 * @param {{question: string, line?: number, source?: string}} q @returns {string}
 */
export function panelQuestionText(q) {
  const text = String(q.question);
  if (q.source === 'dest-point') {
    for (const tail of [DEST_ANSWER, DEST_ANSWER_FOLDER]) if (text.endsWith(tail)) return text.slice(0, text.length - tail.length);
  }
  return text;
}

/**
 * What a try-3 answer DOES, in the words the ask shows (Addendum 2026-11-14 (c) piece 5): `replaces` = the old words of the `~` rule the answer replaces; `adds` = the answer is a new rule of the line.
 * Null when the question says neither (a code-forced look question has its own words). ONE owner: the panel's box, its chat line and the CLI print it.
 * @param {{replaces?: unknown, adds?: unknown, line?: unknown}} step @returns {string|null}
 */
export function answerEffectWords(step) {
  if (typeof step.replaces === 'string' && step.replaces !== '') return `This replaces: ${step.replaces}`;
  if (step.adds === true && Number.isInteger(step.line)) return `This adds a new rule to line ${step.line}`;
  return null;
}

/**
 * What the panel's question box shows for one pending ask. Only a question the person answers (`kind: 'answer'`) has a box; every other ask (language, menu, install)
 * keeps the chat input. `sendChoice` = the choice the box's own Send posts.
 * @param {{kind: string, source?: string, ask?: string, index?: number, total?: number, question?: string, line?: number, offers?: {agree: boolean, drop: boolean, columns?: string[]}, folder?: string|null, current?: string, replaces?: string, adds?: boolean}} step
 * @returns {{head: string, line: string, text: string, choices: {choice: string, label: string}[], columns?: string[], orLabel: string|null, sendChoice: string}|null}
 */
export function boxFor(step) {
  if (step.kind !== 'answer' || typeof step.question !== 'string') return null;
  const before = step.source === 'dest-point';
  // the Destination point: yes / no buttons and a box for a different Destination (checked at $0 before it is taken)
  if (step.source === 'dest-point') {
    return {
      head: 'A question before drafting', line: Number.isInteger(step.line) ? `About job line ${step.line}` : '', text: panelQuestionText(/** @type {any} */ (step)),
      choices: [...(typeof step.folder === 'string' ? [{ choice: 'yes', label: `Yes, set it to ${step.folder}` }] : []), { choice: 'no', label: `No, keep ${String(step.current ?? '').trim().replace(/\s*\n\s*/g, ', ')}` }],
      orLabel: 'Or type a different Destination:', sendChoice: 'path',
    };
  }
  /** @type {{choice: string, label: string}[]} */
  const choices = [];
  if (step.offers?.agree) choices.push({ choice: 'agree', label: 'Agree' });
  if (step.offers?.drop) choices.push({ choice: 'drop', label: 'Drop it' });
  const buttonsOnly = step.source === 'look';
  return {
    head: before ? 'A question before drafting' : `A question the plan raised (${step.index ?? 1} of ${step.total ?? 1})`,
    line: `${Number.isInteger(step.line) ? `About job line ${step.line}` : ''}${answerEffectWords(step) === null ? '' : `${Number.isInteger(step.line) ? '. ' : ''}${answerEffectWords(step)}`}`,
    text: panelQuestionText({ question: step.question, source: step.source, ...(Number.isInteger(step.line) ? { line: step.line } : {}) }),
    choices,
    // a proposed-check question is buttons only (no box); a READING question also takes the person's correction (hamr 2026-11-15 ruling); the drafter's own question has no button, so it keeps the one line to type in
    // a column TIE is a closed question (hamr 2026-11-17): the picker, Drop it and Send only, no box to type in
    orLabel: buttonsOnly ? (step.ask === 'reading' && !step.offers?.columns ? 'Or type the right reading:' : null) : 'Type your answer:',
    sendChoice: 'rule',
    // a column tie: ONE choose-one picker listing every tied column; the box's Send with a column picked (and no words typed) is the `column` choice (the page)
    ...(step.offers?.columns ? { columns: [...step.offers.columns] } : {}),
  };
}

/** the choices each kind of question's answer may name: a check question has its buttons only (hamr 2026-11-15); the drafter's own question and the Destination question keep typed words */
const CHOICES = { look: ['agree', 'drop', 'rule', 'column'], 'dest-point': ['yes', 'no', 'path'], typed: ['rule'] };

/**
 * The door's check of a choice sent for the pending ask. Null = accepted; else the refusal words.
 * `column` (a tie's pick) is allowed only with the name of one of the question's own columns in `text`.
 * @param {{kind: string, source?: string, ask?: string, rule?: unknown, folder?: string|null, offers?: {agree: boolean, drop: boolean, columns?: string[]}}} step @param {unknown} choice @param {unknown} [text] @returns {string|null}
 */
export function refuseChoice(step, choice, text) {
  if (step.kind !== 'answer') return CHOICE_SAYS.notOffered;
  const own = step.source === 'dest-point' ? CHOICES['dest-point'] : step.source === 'look' ? CHOICES.look : CHOICES.typed;
  if (typeof choice !== 'string' || !own.includes(choice)) return CHOICE_SAYS.bad;
  // the box's own words are for a READING question only; a proposed check has its buttons
  if (choice === 'rule' && step.source === 'look' && step.ask !== 'reading') return CHOICE_SAYS.notOffered;
  // a column tie is closed: its answers are one of its own columns or Drop it, never own words
  if (Array.isArray(step.offers?.columns)) {
    if (choice === 'rule') return CHOICE_SAYS.pickColumn;
    if (choice === 'column' && !(typeof text === 'string' && step.offers.columns.includes(text))) return CHOICE_SAYS.pickColumn;
  }
  if (choice === 'column' && !Array.isArray(step.offers?.columns)) return CHOICE_SAYS.notOffered;
  if (step.source === 'dest-point') return choice === 'yes' && typeof step.folder !== 'string' ? CHOICE_SAYS.notOffered : null;
  if (choice === 'agree' && step.offers?.agree !== true) return CHOICE_SAYS.notOffered;
  if (choice === 'drop' && step.offers?.drop !== true) return step.source === 'look' && !Number.isInteger(step.rule) ? CHOICE_SAYS.noRule : CHOICE_SAYS.notOffered;
  return null;
}

/**
 * What a choice resolves the question with: the words the asker reads (today's own words for the effect, so the drafting log and the CLI path see the same), and the chat line the person
 * sees as their own. `rule` = the box's words kept whole.
 * @param {unknown} choice @param {unknown} text @returns {{value: string, shown: string}|{error: string}}
 */
export function resolveChoice(choice, text) {
  if (choice === 'agree') return { value: 'agree', shown: 'Agree' };
  if (choice === 'drop') return { value: DROP_IT, shown: 'Drop it' };
  if (choice === 'yes') return { value: 'yes', shown: 'Yes' };
  if (choice === 'no') return { value: 'no', shown: 'No' };
  const said = String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();
  return said === '' ? { error: CHOICE_SAYS.blank } : { value: said, shown: said };
}
