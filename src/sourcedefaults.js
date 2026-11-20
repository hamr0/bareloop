// REVIEW THE CODE (docs/product/ITEM33-BUILD.md "Addendum 2026-11-20 (b)"): the ONE place that says where a rubric-road job reads its input from.
// A review is the EXISTING rubric road over a REPO; a rubric job on files is the same road over FILES. The only thing that differs is the SOURCE, signed once in
// `closeDecl.source` ('files' | 'repo'; absent on a text close = 'files'; a code close has none). The crossroads (src/reviewpick.js `chooseRoad`) is its writer; every
// place that has to know reads it here, so there is no `review` flag to thread and nothing to guess from the tree.

/** the sources a text close may sign @type {readonly string[]} */
export const SOURCES = Object.freeze(['files', 'repo']);

/**
 * The source a signed close reads: `files` (absent on a text close) or `repo`; null for a close that is not the text close (a code close has no source).
 * @param {any} closeDecl the signed close declaration @returns {'files'|'repo'|null}
 */
export const sourceOf = (closeDecl) => (closeDecl?.lang !== 'text' ? null : closeDecl?.source === 'repo' ? 'repo' : 'files');
