// The question box of the drafting chat (hamr 2026-11-12, as fwdloop M10 am29/am30/am31): a question asked while drafting gets its own box in the panel, with the question,
// its own buttons where the question offers choices (the person's intent is a typed choice, never words read), and one line to type in. This file is the ONE owner of what the
// panel shows for a pending question and of which choices a question offers (the page draws it, never works it out). The CLI (src/authorrun.js) is a sibling caller of the same
// questions and keeps typing words; the stored question text never changes, only the panel's copy of it is cut.
import { readingTail, cantCheckTail, DROP_IT } from './pagemap.js';
import { HOW_TO_ANSWER } from './checkpick.js';
import { FIT_ANSWER, FIT_GO_ON } from './fitcheck.js';
import { DEST_ANSWER } from './destpoint.js';

/** the door's refusals, word for word (fwd am31); a refusal leaves the question open and writes nothing */
export const CHOICE_SAYS = Object.freeze({
  bad: 'That answer is not one of the choices. Nothing was saved.',
  notOffered: 'That choice is not offered for this question. Nothing was saved.',
  outOfDate: 'This page is out of date. Reload it and answer again. Nothing was saved.',
  noRule:'That question is about the job line, not one of your ~ rules, so there is nothing to drop. Agree, or type your own words. Nothing was saved.',
  blank: 'An answer is needed here — there is no skip. Type it in the box and press Send.',
});

/**
 * Which buttons a look question offers. Agree only when it carries a proposal (a reading ask with its reading, a check-pick ask with its check); Drop it only where "drop it" leaves
 * one of the person's own `~` rules Not checked (a can't-check ask or a check-pick ask about a rule number).
 * @param {{source?: string, ask?: string, reading?: unknown, check?: unknown, rule?: unknown}} q @returns {{agree: boolean, drop: boolean}}
 */
export function offersOf(q) {
  const look = q.source === 'look';
  const agree = look && ((q.ask === 'reading' && typeof q.reading === 'string') || (q.ask === 'check' && q.check !== null && typeof q.check === 'object'));
  const drop = look && Number.isInteger(q.rule) && (q.ask === 'cant-check' || q.ask === 'check' || q.ask === 'no-check');
  return { agree, drop };
}

/**
 * A look question as the PANEL shows it: the code's own answer words (`Answer "agree"...` / `Answer "drop it"...`) cut off the end, because the buttons and the box say it.
 * Only the known tails are cut, matched exactly as a suffix (never a pattern over the prose); a question that ends in none of them is returned whole.
 * @param {{question: string, line?: number, source?: string}} q @returns {string}
 */
export function panelQuestionText(q) {
  const text = String(q.question);
  if (q.source === 'fit-check') return text.endsWith(FIT_ANSWER) ? text.slice(0, text.length - FIT_ANSWER.length) : text;
  if (q.source === 'dest-point') return text.endsWith(DEST_ANSWER) ? text.slice(0, text.length - DEST_ANSWER.length) : text;
  if (q.source !== 'look' || !Number.isInteger(q.line)) return text;
  const n = /** @type {number} */ (q.line);
  const hit = [readingTail(n), cantCheckTail(n), ` ${HOW_TO_ANSWER(n, true)}`, ` ${HOW_TO_ANSWER(n, false)}`].find((t) => text.endsWith(t));
  return hit === undefined ? text : text.slice(0, text.length - hit.length);
}

/**
 * What the panel's question box shows for one pending ask. Only a question the person answers (`kind: 'answer'`) has a box; every other ask (language, menu, install)
 * keeps the chat input. `sendChoice` = the choice the box's own Send posts.
 * @param {{kind: string, source?: string, index?: number, total?: number, question?: string, line?: number, offers?: {agree: boolean, drop: boolean}, folder?: string, current?: string}} step
 * @returns {{head: string, line: string, text: string, choices: {choice: string, label: string}[], orLabel: string|null, sendChoice: string}|null}
 */
export function boxFor(step) {
  if (step.kind !== 'answer' || typeof step.question !== 'string') return null;
  const before = step.source === 'fit-check' || step.source === 'dest-point';
  // the fit check: two buttons, no box (go on = keep drafting; stop = anything else, as typed words did)
  if (step.source === 'fit-check') {
    return { head: 'A question before drafting', line: '', text: panelQuestionText(/** @type {any} */ (step)), choices: [{ choice: 'go-on', label: 'Go on' }, { choice: 'stop', label: 'Stop' }], orLabel: null, sendChoice: 'stop' };
  }
  // the Destination point: yes / no buttons and a box for a different Destination (checked at $0 before it is taken)
  if (step.source === 'dest-point') {
    return {
      head: 'A question before drafting', line: Number.isInteger(step.line) ? `About job line ${step.line}` : '', text: panelQuestionText(/** @type {any} */ (step)),
      choices: [{ choice: 'yes', label: `Yes, set it to ${step.folder ?? ''}` }, { choice: 'no', label: `No, keep ${String(step.current ?? '').trim().replace(/\s*\n\s*/g, ', ')}` }],
      orLabel: 'Or type a different Destination:', sendChoice: 'path',
    };
  }
  /** @type {{choice: string, label: string}[]} */
  const choices = [];
  if (step.offers?.agree) choices.push({ choice: 'agree', label: 'Agree' });
  if (step.offers?.drop) choices.push({ choice: 'drop', label: 'Drop it' });
  return {
    head: before ? 'A question before drafting' : `A question the plan raised (${step.index ?? 1} of ${step.total ?? 1})`,
    line: Number.isInteger(step.line) ? `About job line ${step.line}` : '',
    text: panelQuestionText({ question: step.question, source: step.source, ...(Number.isInteger(step.line) ? { line: step.line } : {}) }),
    choices,
    orLabel: choices.length > 0 ? 'Or type a new rule:' : 'Type your answer:',
    sendChoice: 'rule',
  };
}

/** the choices each kind of question's typed answer may name */
const CHOICES = { look: ['agree', 'drop', 'rule'], 'fit-check': ['go-on', 'stop'], 'dest-point': ['yes', 'no', 'path'] };

/**
 * The door's check of a choice sent for the pending ask. Null = accepted; else the refusal words.
 * @param {{kind: string, source?: string, rule?: unknown, offers?: {agree: boolean, drop: boolean}}} step @param {unknown} choice @returns {string|null}
 */
export function refuseChoice(step, choice) {
  if (step.kind !== 'answer') return CHOICE_SAYS.notOffered;
  const own = /** @type {string[]|undefined} */ (/** @type {Record<string, string[]>} */ (CHOICES)[step.source === 'fit-check' || step.source === 'dest-point' ? step.source : 'look']);
  if (typeof choice !== 'string' || !(own ?? CHOICES.look).includes(choice)) return CHOICE_SAYS.bad;
  if (step.source === 'fit-check' || step.source === 'dest-point') return null;
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
  if (choice === 'go-on') return { value: FIT_GO_ON, shown: 'Go on' };
  if (choice === 'stop') return { value: 'stop', shown: 'Stop' };
  if (choice === 'yes') return { value: 'yes', shown: 'Yes' };
  if (choice === 'no') return { value: 'no', shown: 'No' };
  const said = String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();
  return said === '' ? { error: CHOICE_SAYS.blank } : { value: said, shown: said };
}
