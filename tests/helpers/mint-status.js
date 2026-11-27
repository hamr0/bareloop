// Page tests hand the page parts the way the SERVER sends them: each part, attempt and graded try carrying the `status` the owner mints
// (src/panel/server.js withStatuses -> src/panel/status.js). Never a hand-spelled sign: the real owner runs here, so a fixture cannot disagree with it.
import { withStatuses } from '../../src/panel/server.js';

/**
 * @param {any[]} parts replay-shaped parts
 * @param {{runKey?: string, died?: boolean}} [o] the run's own status key ('passed' | 'failed' | 'capped' | 'stopped' | 'running'), and whether it died
 * @returns {any[]}
 */
export function mintParts(parts, { runKey = 'passed', died = false } = {}) {
  return parts.map((p, i, all) => withStatuses(p, i === all.length - 1, died ? 'died' : runKey, died));
}
