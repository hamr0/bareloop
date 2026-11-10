// M4e amendment 14 item 3 (fwdloop v0.29.0), the bareloop mapping: a draft has 2 revises, then the button reads Start over (a fresh draft with its own 2).
// A revise or Start over is a NEW authoring session here (the old draft is ended, the boxes reopen), so the count rides the carry link: a session folder holds
// `revises.json` ({used}); a draft that follows another by Revise has that draft's used + 1, one that follows by Start over (or follows nothing) has 0. The server is
// the only reader that decides: a refresh brings the count back from the session's own state, and a third revise is refused at $0 before anything is ended or sent.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_REVISES = 2;
/** the count's file, inside a drafting session folder only */
export const REVISES_FILE = 'revises.json';
const SESSION_ID = /^s[a-z0-9]+$/;

/** The one spelling of the drafting sessions folder (the session and the routes both read it).
 * @param {string|undefined} root */
export function sessionsRootOf(root) {
  return root ?? join(process.env.HOME ?? '/tmp', '.config', 'bareloop', 'panel-sessions');
}

/** @param {string} root @param {string} id revises used by that draft; no file, or an unreadable one, is 0 (a draft from before the count existed)
 * @returns {number} */
export function revisesUsedOf(root, id) {
  if (!SESSION_ID.test(id)) return 0;
  try {
    const n = Number(JSON.parse(readFileSync(join(root, id, REVISES_FILE), 'utf8')).used);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}

/** The revises a draft will have used, given what it follows: a Revise adds one to the draft it follows; Start over, or following nothing, starts at 0.
 * @param {string} root @param {unknown} carryFrom @param {unknown} carryKind
 * @returns {number} */
export function nextRevisesUsed(root, carryFrom, carryKind) {
  return carryKind === 'revise' && typeof carryFrom === 'string' ? revisesUsedOf(root, carryFrom) + 1 : 0;
}

/** Plain words when that revise would be a third; null when it is allowed. $0: called before anything is ended or started.
 * @param {string} root @param {unknown} carryFrom @param {unknown} carryKind
 * @returns {string|null} */
export function reviseRefusal(root, carryFrom, carryKind) {
  if (nextRevisesUsed(root, carryFrom, carryKind) <= MAX_REVISES) return null;
  return `This draft has used its ${MAX_REVISES} revises. Start over: it keeps the boxes and gives ${MAX_REVISES} new revises. Nothing was sent.`;
}

/** The words the draft record and the Audit use for a draft that follows another (fwdloop am14 item 6): `revise 1`, `revise 2`, `start over`; a first draft has none.
 * @param {unknown} carryFrom @param {unknown} carryKind @param {number} used this draft's revises used
 * @returns {string|null} */
export function draftLabelOf(carryFrom, carryKind, used) {
  if (typeof carryFrom !== 'string') return null;
  if (carryKind === 'revise') return `revise ${used}`;
  return carryKind === 'startover' ? 'start over' : null;
}

/** @param {string} dir the session's folder @param {number} used */
export function writeRevisesUsed(dir, used) {
  try { writeFileSync(join(dir, REVISES_FILE), `${JSON.stringify({ used })}\n`, { mode: 0o600 }); } catch { /* the count is a convenience: a disk fault only means a later Revise reads 0 */ }
}
