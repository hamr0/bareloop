// The one owner of how a printed re-invocation is spelled. The package ships `src/` and `bin/`
// only, so a person who reached a flow through the `bareloop` CLI must be told
// `bareloop run-u ...`, never `node scripts/run-u.mjs ...` (a path their install does not have).
// Each flow's `main(argv, deps)` takes `deps.invokedAs` — the command it was actually reached
// through (`src/cli.js` passes `'bareloop <name>'`; the `scripts/*.mjs` adapters pass none).

/** @typedef {'run-u' | 'interview' | 'author'} Flow */

/** the script adapter each flow keeps for a source-tree run */
const SCRIPT = /** @type {const} */ ({ 'run-u': 'run-u', interview: 'run-interview', author: 'run-author' });

/**
 * The command that runs `flow`, spelled the way the caller reached this flow: `bareloop <flow>`
 * when `invokedAs` names the CLI, else the source-tree script.
 * @param {Flow} flow @param {string|undefined} invokedAs
 * @returns {string}
 */
export function commandFor(flow, invokedAs) {
  return invokedAs !== undefined && /^bareloop(\s|$)/.test(invokedAs)
    ? `bareloop ${flow}`
    : `node scripts/${SCRIPT[flow]}.mjs`;
}
