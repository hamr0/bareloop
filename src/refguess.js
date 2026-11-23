// "Did you mean branch: X?" (hamr 2026-11-23): code never parses prose for a branch or a range, but it can GUIDE the person to the typed token (src/rangereview.js owns the token and its grammar).
// A job with NO typed `branch:`/`range:` token whose text holds a WORD that equals a real local branch of the repo (exact match, compared by git, no word list), or a word `A..B` whose two ends both
// resolve in the repo (a REVIEW job only: a change job's `range:` is refused), is asked ONE yes/no question in code's words. Yes appends the typed token to that job line (so it is read by the one token reader,
// exactly as if typed); No changes nothing. Read-only git through the one owner (`branchTip`, `resolveRange`), $0, no model.
import { rangeTokens, branchTip, resolveRange } from './rangereview.js';
import { spawnClose } from './ralph.js';

/** @typedef {{kind: 'branch', name: string, line: number}|{kind: 'range', a: string, b: string, line: number}} RefGuess */

/** the question, whole, in code's words @param {RefGuess} g @returns {string} */
export const refGuessQuestion = (g) => `Did you mean ${g.kind === 'branch' ? `branch: ${g.name}` : `range: ${g.a}..${g.b}`}?`;

/** the typed token Yes appends to the line @param {RefGuess} g @returns {string} */
export const refGuessToken = (g) => (g.kind === 'branch' ? `branch: ${g.name}` : `range: ${g.a}..${g.b}`);

/**
 * The first guess in the job's lines (in line order, then word order), or null. A job that already carries a typed token is never guessed at.
 * @param {{repo: string, jobLines: {n: number, text: string}[]|null|undefined, review?: boolean, env?: NodeJS.ProcessEnv, run?: typeof spawnClose}} o
 * @returns {Promise<RefGuess|null>}
 */
export async function refGuess({ repo, jobLines, review = false, env = process.env, run = spawnClose }) {
  if (!Array.isArray(jobLines) || rangeTokens(jobLines).length > 0) return null;
  for (const l of jobLines) {
    const seen = new Set();
    for (const word of String(l?.text ?? '').split(/\s+/)) {
      if (word === '' || word.startsWith('-') || seen.has(word)) continue;
      seen.add(word);
      const m = /^([^\s.][^\s]*?)\.\.([^\s]+)$/.exec(word);
      if (m !== null) {
        if (!review) continue;
        const r = await resolveRange({ repo, token: { kind: 'range', a: m[1], b: m[2], line: l.n }, env, run });
        if (r.ok) return { kind: 'range', a: m[1], b: m[2], line: l.n };
        continue;
      }
      const tip = await branchTip({ repo, name: word, env, run });
      if (tip.ok) return { kind: 'branch', name: word, line: l.n };
    }
  }
  return null;
}
