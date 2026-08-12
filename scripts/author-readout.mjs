// The authoring runner's SIGNING readout — the goal, and the stages that will
// judge it — in the one place a test can reach it.
//
// `run-author.mjs` is a script: importing it runs it, and the block this replaces
// is only reached after a real scout and a real model call. So the lines a person
// actually signs against live here instead, and the runner calls them — the same
// reason `u-readout.mjs` exists.
//
// F87 is the whole point of the pairing. The goal must state everything the close
// will judge, and NOTHING derives one from the other or checks them against each
// other; an unstated stage is a cost the run discovers at its tail. The only
// defence is that the person signing reads both halves at once — and neither
// signing surface offered that: this one printed the declaration and never the
// goal, run-u's --approve gate printed the goal and never the declaration.
// A half of a reading is not a smaller reading; it is a different one.

/**
 * @param {{goal?: string|null, closeDecl?: any}} spec the RESOLVED spec — the bytes
 *   that get hashed and signed, never the operator's draft and never the authored
 *   half on its own.
 * @returns {string[]} one console line each, in print order.
 */
export function declarationLines({ goal, closeDecl }) {
  // An absent goal reads as ABSENT. A bare `goal` label with nothing after it is
  // indistinguishable from a goal that says nothing, and this readout exists to
  // make exactly that kind of silence visible.
  const lines = [`goal       ${goal === undefined || goal === null || goal === '' ? '(none — the draft carried no goal, and a close judges against one)' : JSON.stringify(goal)}`];
  lines.push('declaration');
  for (const s of closeDecl?.stages ?? []) {
    lines.push(`  ${s.name}  [${s.kind}]${s.offer === false ? '  (not lendable)' : ''}${(s.needs ?? []).length ? `  needs: ${s.needs.join(', ')}` : ''}`);
    lines.push(`      params ${JSON.stringify(s.params ?? {})}`);
  }
  for (const n of closeDecl?.notes ?? []) lines.push(`  note: ${n}`);
  return lines;
}
