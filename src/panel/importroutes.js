// PANEL-BUILD.md P5 item 4 — IMPORT, READ ONLY. A person points the panel at a job folder (an exported bundle) to
// LOOK at it: its goal, checks, guardrails, caps, model, exported history and whether it is approved on this
// machine. Nothing here runs a bundle, signs anything or writes into the folder; the only write is one line in
// `<home>/imports.jsonl` (`{at, dir, job, bundleHash}`, the list of what was imported).
//
// Two routes carry NEW DISK EXPOSURE, so both sit behind `checkHumanGuard` (token + own address), the strict
// guard `/api/author/*` has — not just the Host guard the read-only GETs use:
//   GET  /api/fs/list?path=   folders only: names plus a `bundle` tag where a manifest.json file sits
//   POST /api/imports {path}  import one folder (readBundle must be clean)
// plus the guarded reads `GET /api/imports` (the list, every bundle re-read) and `GET /api/imports/:id` (one view).
//
// PATH SAFETY (the listing is a window onto the person's disk, so it is narrow by construction):
//   * the requested path is expanded (`~` / `~/…` only), refused if it carries a NUL byte or is not absolute,
//     then `resolve`d (`.`/`..` collapsed) and `realpath`ed — the REAL folder is what is listed and what is
//     recorded, and the response says which it chose (`path` beside `requested`);
//   * a path that is not a directory is refused; names are listed, file CONTENTS are never read here;
//   * a SYMLINK inside the listing is never listed and never followed (Dirent.isDirectory() is false for a link,
//     which is what `readdir` withFileTypes reports — it types by lstat);
//   * the `bundle` tag is a regular FILE named manifest.json (lstat), never a link to one.

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import {
  appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync, lstatSync, realpathSync,
} from 'node:fs';
import { dirname, join, isAbsolute, resolve } from 'node:path';
import { checkHumanGuard } from './authorroutes.js';
import { readBundle, verifyBlessing } from '../bundle.js';
import { runlistHome } from '../runlist.js';
import { bundleRuns, latestGreenRun, latestBridgeGreen, bridgeRunDetail, importedRunId } from './importrun.js';

/** the longest path the routes will look at (bytes) */
export const MAX_PATH_LEN = 4096;
/** the most folder names one listing returns; past it `truncated: true` */
export const MAX_ENTRIES = 500;

/**
 * Expand, normalise and `realpath` a requested folder. Never throws.
 * @param {unknown} input the raw `path` (absent/blank = the person's home folder)
 * @param {string} userHome the home folder (`~`)
 * @returns {{ok: true, requested: string, path: string}|{ok: false, error: string}}
 */
export function resolveFsPath(input, userHome) {
  const raw = input === undefined || input === null ? '' : input;
  if (typeof raw !== 'string') return { ok: false, error: 'the path must be text' };
  if (raw.length > MAX_PATH_LEN) return { ok: false, error: 'that path is too long' };
  if (raw.includes('\0')) return { ok: false, error: 'that path has a character no folder name can have' };
  let want = raw.trim();
  if (want === '') want = userHome;
  else if (want === '~') want = userHome;
  else if (want.startsWith('~/')) want = join(userHome, want.slice(2));
  else if (want.startsWith('~')) return { ok: false, error: 'only ~ and ~/… are understood, not another user\'s home' };
  if (!isAbsolute(want)) return { ok: false, error: 'use an absolute path (starting with / or ~)' };
  const requested = resolve(want);
  /** @type {string} */
  let real;
  try { real = realpathSync(requested); } catch (/** @type {any} */ e) {
    return { ok: false, error: e?.code === 'ENOENT' ? `no such folder: ${requested}` : `could not open ${requested} (${e?.code ?? 'error'})` };
  }
  let isDir = false;
  try { isDir = statSync(real).isDirectory(); } catch { isDir = false; }
  if (!isDir) return { ok: false, error: `not a folder: ${real}` };
  return { ok: true, requested, path: real };
}

/**
 * The folders directly inside `dir` (a `realpath` already): names and a `bundle` tag, nothing else. Symlinks are
 * never listed. Non-dot names first, then dot-names, each alphabetical.
 * @param {string} dir
 * @returns {{entries: {name: string, bundle: boolean}[], truncated: boolean}}
 */
export function listFolders(dir) {
  const names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  names.sort((a, b) => {
    const da = a.startsWith('.');
    const db = b.startsWith('.');
    if (da !== db) return da ? 1 : -1;
    return a.localeCompare(b);
  });
  const entries = names.slice(0, MAX_ENTRIES).map((name) => {
    let bundle = false;
    try { bundle = lstatSync(join(dir, name, 'manifest.json')).isFile(); } catch { bundle = false; }
    return { name, bundle };
  });
  return { entries, truncated: names.length > MAX_ENTRIES };
}

/** @param {string} [home] @returns {string} `<home>/imports.jsonl` */
export function importsPath(home) { return join(runlistHome(home), 'imports.jsonl'); }

/** the stable id of an imported folder (its real path, hashed — never the path itself in a URL) */
export function importId(/** @type {string} */ dir) { return createHash('sha256').update(dir).digest('hex').slice(0, 12); }

/**
 * The imported list: the LATEST row per folder (a re-import supersedes), newest first. A malformed line is skipped.
 * @param {string} [home]
 * @returns {{at: string, dir: string, job: string, bundleHash: string, id: string}[]}
 */
export function readImports(home) {
  let text = '';
  try { text = readFileSync(importsPath(home), 'utf8'); } catch { return []; }
  /** @type {Map<string, any>} */
  const byDir = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r && typeof r.dir === 'string' && typeof r.job === 'string' && typeof r.bundleHash === 'string') byDir.set(r.dir, { ...r, id: importId(r.dir) });
  }
  return [...byDir.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** The ONE spelling of the plain-words line for a changed import (Run tab, reuse refusal). The list tag stays the short statusText. */
export const IMPORT_CHANGED_LINE = 'files changed since you imported it \u2014 Reuse is off. Import it again if the change was yours.';

/**
 * Re-read one imported folder NOW and say how it stands against the import: `ok`, `changed` (the bundle's own
 * hash, a tampered file or an unreadable part differ from what was imported — shown red as "changed since
 * import"), or `missing` (the folder is gone). Never throws.
 * @param {{dir: string, bundleHash: string}} row
 * @returns {{status: 'ok'|'changed'|'missing', statusText: string|null, reds: string[], bundle: ReturnType<typeof readBundle>}}
 */
export function bundleStatus(row) {
  const bundle = readBundle(row.dir);
  const reds = bundle.reds.map((r) => r.code);
  if (!existsSync(row.dir)) return { status: 'missing', statusText: 'folder not found — it was moved or deleted since import', reds, bundle };
  const hash = bundle.manifest && typeof bundle.manifest.bundleHash === 'string' ? bundle.manifest.bundleHash : null;
  if (bundle.ok && hash === row.bundleHash) return { status: 'ok', statusText: null, reds, bundle };
  return { status: 'changed', statusText: 'changed since import', reds, bundle };
}

/**
 * The `bundle` half of an import view: the exported history (the registry rows the bundle shipped), the approval
 * on THIS machine (`blessing.json`, written by the first green run here), nothing about the folder's other files.
 * @param {ReturnType<typeof readBundle>} bundle
 */
export function bundleHistoryAndApproval(bundle) {
  /** @type {any[]} */
  const rows = [];
  for (const b of bundle.bridges) if (b && Array.isArray(b.history)) rows.push(...b.history);
  rows.sort((a, b) => String(b?.at ?? '').localeCompare(String(a?.at ?? '')));
  const greens = rows.filter((r) => r && r.outcome === 'green').length;
  const approval = verifyBlessing(bundle);
  const blessedAt = bundle.blessing && typeof bundle.blessing.blessedAt === 'string' ? bundle.blessing.blessedAt.slice(0, 10) : null;
  return {
    history: {
      greens, reds: rows.length - greens, total: rows.length,
      recent: rows.slice(0, 10).map((r) => ({
        at: typeof r?.at === 'string' ? r.at : null, runid: typeof r?.runid === 'string' ? r.runid : null,
        outcome: typeof r?.outcome === 'string' ? r.outcome : null, costUsd: typeof r?.costUsd === 'number' ? r.costUsd : null,
      })),
    },
    approved: approval.ok,
    approvedText: approval.ok ? `approved on this machine${blessedAt ? ` (first green run ${blessedAt})` : ''}`
      : (approval.unblessed ? 'not approved on this machine yet — it has never run green here'
        : 'approval is stale — the bundle changed since it was approved'),
  };
}

/**
 * The import routes' handler. `describeSpec(spec)` is the server's own spec reader (the SAME fact-readers the Job
 * tab uses, so an imported job and a run read alike): `{checkType, goal, success, guardrails, model, budgetUsd,
 * maxWallMs}`.
 * @param {{ port: number, token: string, home?: string, userHome?: string,
 *   describeSpec: (spec: any) => any }} opts
 */
export function createImportRoutes(opts) {
  const userHome = opts.userHome ?? homedir();

  /** the view of one imported row, re-read now */
  const viewOf = (/** @type {{id: string, at: string, dir: string, job: string, bundleHash: string}} */ row) => {
    const st = bundleStatus(row);
    const spec = st.bundle.spec;
    return {
      id: row.id, job: row.job, dir: row.dir, importedAt: row.at, bundleHash: row.bundleHash,
      status: st.status, statusText: st.statusText, changedLine: st.status === 'changed' ? IMPORT_CHANGED_LINE : null, reds: st.reds,
      ...(spec && typeof spec === 'object' ? opts.describeSpec(spec) : {}),
      ...bundleHistoryAndApproval(st.bundle),
      ...importedRunView(row, st.bundle),
    };
  };

  /**
   * What the Run tab shows below the IMPORTED facts (see importrun.js): `runsHere` (run folders with a readable spine),
   * and `run` — `{kind:'spine', id, runid, at}` (the newest green run in the bundle's `runs/`, read through
   * `/api/runs/<id>`), `{kind:'bridge', runid, at, detail}` (the bridge's green version as a run detail) or
   * `{kind:'none'}`. Never throws: a bundle that cannot be read is `none`.
   * @param {{id: string, dir: string, job: string}} row
   * @param {ReturnType<typeof readBundle>} bundle
   */
  const importedRunView = (row, bundle) => {
    try {
      const runsHere = bundleRuns(row.dir).length;
      const g = latestGreenRun(row.dir);
      if (g) return { runsHere, run: { kind: 'spine', id: importedRunId(row.id, g.runid), runid: g.runid, at: g.at } };
      const b = latestBridgeGreen(bundle.bridges);
      if (b) {
        const spec = bundle.spec && typeof bundle.spec === 'object' ? bundle.spec : {};
        const facts = opts.describeSpec(spec);
        const detail = bridgeRunDetail(b, {
          job: row.job, checkType: facts.checkType, checkTypeTitle: null,
          model: typeof spec.model === 'string' && spec.model.length > 0 ? spec.model : null,
          budgetUsd: typeof spec.budgetUsd === 'number' ? spec.budgetUsd : null,
        });
        return { runsHere, run: { kind: 'bridge', runid: detail.runid, at: b.version.greenAt, detail } };
      }
      return { runsHere, run: { kind: 'none' } };
    } catch {
      return { runsHere: 0, run: { kind: 'none' } };
    }
  };

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} pathname
   * @param {any} body
   * @returns {boolean}
   */
  function handle(req, res, pathname, body) {
    const viewM = /^\/api\/imports\/([0-9a-f]{12})$/.exec(pathname);
    if (pathname !== '/api/fs/list' && pathname !== '/api/imports' && !viewM) return false;
    const send = (/** @type {number} */ code, /** @type {any} */ obj) => {
      const text = JSON.stringify(obj);
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    };
    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }

    if (pathname === '/api/fs/list') {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const q = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1').searchParams.get('path') ?? '';
      const r = resolveFsPath(q, userHome);
      if (!r.ok) { send(400, r); return true; }
      try {
        const l = listFolders(r.path);
        const parent = dirname(r.path);
        send(200, {
          ok: true, requested: r.requested, path: r.path, parent: parent === r.path ? null : parent,
          bundle: (() => { try { return lstatSync(join(r.path, 'manifest.json')).isFile(); } catch { return false; } })(),
          entries: l.entries, truncated: l.truncated,
        });
      } catch (/** @type {any} */ e) {
        send(400, { ok: false, error: `could not read ${r.path} (${e?.code ?? 'error'})` });
      }
      return true;
    }

    if (viewM) {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const row = readImports(opts.home).find((x) => x.id === viewM[1]);
      if (!row) { send(404, { ok: false, error: 'no such imported job' }); return true; }
      send(200, { ok: true, ...viewOf(row) });
      return true;
    }

    // /api/imports
    if (req.method === 'GET') {
      send(200, {
        ok: true,
        imports: readImports(opts.home).map((r) => {
          const st = bundleStatus(r);
          return { id: r.id, job: r.job, dir: r.dir, importedAt: r.at, bundleHash: r.bundleHash, status: st.status, statusText: st.statusText };
        }),
      });
      return true;
    }
    if (req.method !== 'POST') { send(405, { ok: false, error: 'GET or POST only' }); return true; }
    const r = resolveFsPath(body?.path, userHome);
    if (!r.ok) { send(400, r); return true; }
    const bundle = readBundle(r.path);
    if (!bundle.ok || !bundle.manifest || typeof bundle.manifest.job !== 'string' || typeof bundle.manifest.bundleHash !== 'string') {
      const why = bundle.reds.length > 0 ? bundle.reds.map((x) => `${x.code} (${x.path})`).join('; ') : 'no manifest';
      send(400, { ok: false, error: `${r.path} is not a clean exported job folder — ${why}` });
      return true;
    }
    const row = { at: new Date().toISOString(), dir: r.path, job: bundle.manifest.job, bundleHash: bundle.manifest.bundleHash };
    try {
      mkdirSync(runlistHome(opts.home), { recursive: true, mode: 0o700 });
      appendFileSync(importsPath(opts.home), `${JSON.stringify(row)}\n`, { mode: 0o600 });
    } catch (/** @type {any} */ e) {
      send(500, { ok: false, error: `could not record the import: ${e?.message ?? e}` });
      return true;
    }
    send(200, { ok: true, id: importId(r.path), job: row.job, dir: r.path, requested: r.requested });
    return true;
  }

  return { handle, viewOf };
}
