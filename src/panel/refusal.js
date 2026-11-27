// The ONE owner of the boxes a refused draft can be pinned under (fwd v0.38.0 M19 am14b, F400).
// A refusal is `{box, words}`. `box` is one of these names, set as a literal at the refusing call site, or null
// (the words stay under the Draft button). It is never read from the words and never guessed.

/** the legal box names, each one the page's red line under a card box (job, inputs, Cap $, model, Destination, Job name) */
export const BOX = Object.freeze({ job: 'job', inputs: 'inputs', capUsd: 'capUsd', model: 'model', dest: 'dest', name: 'name' });

/**
 * @typedef {'job'|'inputs'|'capUsd'|'model'|'dest'|'name'} RefusalBox
 * @typedef {{box: RefusalBox|null, words: string}} Refusal
 */

/**
 * A typed refusal.
 * @param {RefusalBox|null} box the refusing call site's own literal
 * @param {string} words
 * @returns {Refusal}
 */
export function refusalOf(box, words) {
  return { box, words };
}
