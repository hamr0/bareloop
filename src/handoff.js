// The handoff note (F253): a map of the files earlier workers in THIS run read, appended to the next step/fix
// worker's first prompt. Code-written only, never a model; names files, never carries their content.
// The switch is the signed spec's `handoffNote` (absent = on, only `false` turns it off; see src/job.js).
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { isArbiterBook } from './kinds.js';

/** The one cap on a note, in characters. */
export const HANDOFF_CAP = 8000;
export const HANDOFF_HEADING = '== Files earlier workers in this run read (a map only; contents are not included; line ranges as ctx_recall prints them) ==';
/** Per-entry symbol-map cap, so one huge file cannot eat the whole note. */
const ENTRY_MAP_CAP = 500;

/**
 * Is this repo-relative path off limits to a note: outside the job root, an arbiter book (the one list,
 * `isArbiterBook`: .smoke — spine, attempt-diff, bridges — .litectx, the gate audit), or inside `.git` / `.bareloop`.
 * @param {string} rel
 */
export function isHandoffExcluded(rel) {
  if (rel === '' || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) return true;
  if (isArbiterBook(rel) !== null) return true;
  return rel.split('/').some((seg) => seg === '.git' || seg === '.bareloop');
}

/**
 * Wrap the worker's read-class tools (the real names come from the caller: shell_read, ctx_get) so a call that
 * reached `execute` (the gate already allowed it) and returned a file's text is reported to `onRead`.
 * Wraps in place: tool objects are fresh per worker.
 * @param {{name: string, execute: Function}[]} tools
 * @param {string[]} names
 * @param {(absPath: string) => void} onRead
 * @param {string} workdir
 */
export function trackReads(tools, names, onRead, workdir) {
  for (const t of tools) {
    if (!names.includes(t.name)) continue;
    const inner = t.execute;
    t.execute = async (/** @type {any} */ args) => {
      const r = await inner(args);
      if (typeof r === 'string' && typeof args?.path === 'string' && !/^ctx_get failed/.test(r)) {
        const abs = isAbsolute(args.path) ? args.path : resolve(workdir, args.path);
        try { if (statSync(abs).isFile()) onRead(abs); } catch { /* not a file: nothing was read */ }
      }
      return r;
    };
  }
}

/**
 * Run-level store of the paths earlier workers read. Newest read last; a re-read moves a path to newest.
 * In memory only: a resumed leg starts empty (the first ask of a resumed leg gets no note, later asks do).
 * @param {{workdir: string}} o
 */
export function createHandoffStore({ workdir }) {
  /** @type {Set<string>} insertion order = oldest first */
  const paths = new Set();
  /** @param {Iterable<string>} absPaths */
  const absorb = (absPaths) => {
    for (const a of absPaths) {
      const rel = relative(workdir, a).split('\\').join('/');
      if (isHandoffExcluded(rel)) continue;
      paths.delete(rel);
      paths.add(rel);
    }
  };
  /**
   * @param {{getNode?: (rel: string) => any}} [o] `getNode`: the LiteCtx index's node for a path (its `chunks`)
   * @returns {{text: string, paths: number}} text '' when nothing was read; else heading + body, length <= HANDOFF_CAP
   */
  const render = ({ getNode = () => null } = {}) => {
    if (paths.size === 0) return { text: '', paths: 0 };
    const lineCount = (/** @type {string} */ rel) => { try { return readFileSync(resolve(workdir, rel), 'utf8').split('\n').length; } catch { return null; } };
    const entries = [...paths].map((rel) => {
      const n = lineCount(rel);
      let node = null;
      try { node = getNode(rel); } catch { node = null; }
      // Fresh index only: a node whose last chunk ends past the file's current end is stale — fall back to the count.
      const named = (node?.chunks ?? []).filter((/** @type {any} */ c) => c.symbol);
      const fresh = n !== null && named.every((/** @type {any} */ c) => c.endLine <= n);
      let map = '';
      let more = 0;
      for (let i = 0; fresh && i < named.length; i++) {
        const c = named[i];
        const piece = `${c.symbol} ${c.startLine}-${c.endLine}`;
        if ((map ? map.length + 2 : 0) + piece.length > ENTRY_MAP_CAP) { more = named.length - i; break; }
        map += (map ? ', ' : '') + piece;
      }
      return `- ${rel}${n === null ? '' : ` (${n} lines)`}${map ? `: ${map}` : ''}${more ? `, +${more} more` : ''}`;
    });
    const wrap = (/** @type {string[]} */ es, /** @type {number} */ dropped) => `${HANDOFF_HEADING}\n${dropped ? `[trimmed: ${dropped} older path(s)]\n` : ''}${es.join('\n')}`;
    let dropped = 0;
    let out = wrap(entries, 0);
    while (out.length > HANDOFF_CAP && dropped < entries.length) {
      dropped++;
      out = wrap(entries.slice(dropped), dropped);
    }
    return { text: out, paths: entries.length - dropped };
  };
  return { absorb, render, size: () => paths.size };
}
