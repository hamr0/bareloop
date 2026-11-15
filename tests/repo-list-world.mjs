// A repo job's signed list, built the way the product builds it: through the ONE CheckBlock (src/checkblock.js, `repo` type), with nobody to ask (a rule code cannot prove is Not checked with REASON.noRule).
// Shared by the view tests (Job tab, signed card, Audit, success line, Result tab) that need the rows of a repo close.
import { CheckBlock } from '../src/checkblock.js';

/** @param {{jobLines: any[], stages: any[], refused?: any[]|null, guardNames: string[], writeScope: string[], files: string[]|null}} o @returns {any[]} */
export function repoList({ jobLines, stages, refused = null, guardNames, writeScope, files }) {
  const b = new CheckBlock({ texts: {}, labels: [], asks: false, repo: { files, writeScope } });
  b.setGuards(guardNames, writeScope);
  b.fromJob(jobLines);
  b.addStages(stages, { guardNames, refused: refused ?? [] });
  return b.closeView().list;
}
