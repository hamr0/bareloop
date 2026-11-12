// The question box of the drafting chat (hamr 2026-11-12, as fwdloop M10 am29): a question asked while drafting gets its own box in the panel, with the question,
// its own buttons where the question offers choices, and one line to type in. This file is the ONE owner of what the panel shows for a pending question
// (the page draws it, never works it out). The CLI (src/authorrun.js) is a sibling caller of the same questions and keeps typing words; the stored question
// text never changes.

/**
 * What the panel's question box shows for one pending ask. Only a question the person answers (`kind: 'answer'`) has a box; every other ask (language, menu, install)
 * keeps the chat input.
 * @param {{kind: string, source?: string, index?: number, total?: number, question?: string, line?: number}} step
 * @returns {{head: string, line: string, text: string, choices: {choice: string, label: string}[], orLabel: string|null}|null}
 */
export function boxFor(step) {
  if (step.kind !== 'answer' || typeof step.question !== 'string') return null;
  const before = step.source === 'fit-check' || step.source === 'dest-point';
  return {
    head: before ? 'A question before drafting' : `A question the plan raised (${step.index ?? 1} of ${step.total ?? 1})`,
    line: Number.isInteger(step.line) ? `About job line ${step.line}` : '',
    text: step.question,
    choices: [],
    orLabel: 'Type your answer:',
  };
}
