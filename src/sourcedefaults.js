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

/** the label a repo's quotes are cited under: the one input they come from (the repo itself) */
export const REPO_LABEL = 'repo';

/** one item field code adds on its own: required text that is not empty, no other limit @param {string} name */
const textField = (name) => Object.freeze({ name, kind: 'text', required: true, bounds: Object.freeze({ minChars: 1 }) });

/**
 * The ONE table keyed by source: what differs between a rubric job on files and a rubric job on a repo. Nothing else may say "this is a review".
 *   `engineDirs`: the directories the ENGINE makes in the run's tree (the worker's answer files). A files job's hidden tree lists them; a repo's own listing never does, so for a repo they select without being listed.
 *   `fields`: the item fields code adds to EVERY shape line of the source (`[default]` rows; the worker is told them; the shape look is told they exist): none for files; a repo's items name a file, quote it and say why.
 *   `cite`: the label each item's quote is found under (the signed shape part's `cite`), or null: a repo's quotes are found in the repo files the items name.
 *   `reportInRepo`: where the ONE report is delivered. false = every file under output/ plus the report go to the person's folder OUTSIDE the tree; true = ONLY the report is written into `<worktree>/<Destination>` and the run's normal green commit carries it.
 *   `roadWords`: what the draft readout's first line adds about the job (a files job says nothing).
 *   `commitExclude`: the paths that green commit leaves out (a repo: the worker's scratch `output/`, so only the report goes on the branch).
 * @type {Readonly<Record<'files'|'repo', {engineDirs: readonly string[], fields: readonly {name: string, kind: 'text', required: true, bounds: {minChars: number}}[], cite: string|null, reportInRepo: boolean, commitExclude: readonly string[], roadWords: string}>>}
 */
export const SOURCE_DEFAULTS = Object.freeze({
  files: Object.freeze({ engineDirs: Object.freeze(/** @type {string[]} */ ([])), fields: Object.freeze(/** @type {{name: string, kind: 'text', required: true, bounds: {minChars: number}}[]} */ ([])), cite: /** @type {string|null} */ (null), reportInRepo: false, commitExclude: Object.freeze(/** @type {string[]} */ ([])), roadWords: '' }),
  repo: Object.freeze({ engineDirs: Object.freeze(['output', 'output/steps']), fields: Object.freeze(['file', 'quote', 'why'].map(textField)), cite: /** @type {string|null} */ (REPO_LABEL), reportInRepo: true, commitExclude: Object.freeze(['output']), roadWords: ' \u2014 review (reads the code, changes none)' }),
});

/** the defaults row of a source (files when none) @param {string|null|undefined} source */
export const defaultsOf = (source) => (source === 'repo' ? SOURCE_DEFAULTS.repo : SOURCE_DEFAULTS.files);
