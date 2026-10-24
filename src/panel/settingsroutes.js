// rewritten-from: fwdloop src/panel/settings.js@f9449e8 (the Providers routes; the Money routes are bareloop's own)
// PANEL-BUILD.md P4a / P8 — Settings routes (`/api/settings/*`). A separate module from the
// authoring routes on purpose: the chat/authoring session can reach NO route here (it has
// no path to this file's handlers), and every route here is behind the same human-click
// guard (per-server-start token + Origin/Host, `checkHumanGuard`) — GET too, because the
// pages these serve name key variables and spend.
//
// Providers (P8): the rows are the keys file's filled lines (plus a shell-only key that config
// already names); API shape / Base URL / old-max_tokens save to config.json `keys.<ENV NAME>`
// and the model lines to `models.<ENV NAME>` (src/providerrows.js is the one owner of the rows).
// Test and Refresh are ONE free GET of `<Base URL>/models` (src/modellist.js), never a completion,
// and write no spend row. Every refusal is a plain sentence in `say`; the page shows `say`, never
// a code or an HTTP status.
//
// Every write goes to `~/.config/bareloop/config.json` through `src/config.js` (the one
// writer); the monthly limit is a person's own number, set by hand — nothing here (and
// nothing the agent can reach) raises it on their behalf. Key VALUES never appear in any
// response: names and found / not set only.
import { checkHumanGuard } from './authorroutes.js';
import {
  readConfig, updateConfig, ConfigError, providerFieldProblem, cleanBaseUrl, modelsProblem,
} from '../config.js';
import { spendSummary, monthlyLimitOf } from '../monthly.js';
import { openInOs } from '../opener.js';
import { loadKeysEnv, keysFilePath, keysHome, filledKeyNames, ensureKeysFile } from '../keysfile.js';
import { SHAPES } from '../providershapes.js';
import { keyRows, effectiveModels, usableKey, rowNamesOf } from '../providerrows.js';
import { apiKeyProblem } from '../providers.js';
import { listModels } from '../modellist.js';

const BROKEN_CONFIG = 'Your settings file (config.json) cannot be read. Fix or remove it, then look again.';
const BAD_KEY = 'The key has a space or a line break in it. Fix it in your keys file, then reload keys.';

/**
 * `openFolderSpawn` / `platform` are test seams for the Open keys folder button (a real caller passes
 * neither: `child_process.spawn` and `process.platform`).
 * @param {{ port: number, token: string, home?: string, env?: Record<string,string|undefined>,
 *   fetchImpl?: typeof fetch, now?: () => number, openFolderSpawn?: (cmd: string, args: string[], o: object) => any,
 *   platform?: string }} opts
 */
export function createSettingsRoutes(opts) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  /** the env keys are looked up in: the door's env (shell + keys file), re-read against the
   * keys file on every call so "Reload keys" is just another request. NAMES leave this
   * module; values never do.
   * @returns {ReturnType<typeof loadKeysEnv>} */
  const keys = () => loadKeysEnv({ env: opts.env, home: opts.home });

  /**
   * The row names: every key in the keys file with a value, plus a key only the SHELL holds when
   * config already names it (`keys.<ENV>` or `models.<ENV>`).
   * @param {Record<string, any>} config
   * @returns {{ filled: string[], shellOnly: string[], all: string[] }}
   */
  function rowNames(config) {
    const filled = filledKeyNames(opts.home);
    const all = rowNamesOf(filled, config, opts.env ?? process.env);
    return { filled, shellOnly: all.filter((n) => !filled.includes(n)), all };
  }
  /** config.json, or a plain-words problem (never read as "nothing set"). @returns {{config: Record<string, any>, problem: string|null}} */
  function config() {
    const c = readConfig({ home: opts.home });
    return c.problem ? { config: {}, problem: BROKEN_CONFIG } : { config: c.config, problem: null };
  }
  /** @param {string} refused @param {string} say @param {number} [status] */
  const refuse = (refused, say, status = 400) => ({ status, body: { ok: false, refused, say } });
  /** @param {number} status @param {any} body */
  const reply = (status, body) => ({ status, body });
  /** The row a request names, or null: only a key that is a row is a provider. @param {unknown} slot @param {Record<string, any>} cfg */
  const slotOf = (slot, cfg) => (typeof slot === 'string' && rowNames(cfg).all.includes(slot) ? slot : null);

  /** One row's key for a header only; or `{why}` in plain words. @param {string} slot @param {ReturnType<typeof loadKeysEnv>} k @returns {{ key?: string, why?: string }} */
  function keyFor(slot, k) {
    if (k.unreadable) return { why: String(k.warning) };
    const value = k.env[slot];
    if (value === undefined || value === '') return { why: 'No key set for this provider.' };
    if (value !== 'null' && apiKeyProblem(value)) return { why: BAD_KEY };
    return { key: /** @type {string} */ (usableKey(value)) };
  }

  /**
   * Test and Refresh: the ONE free GET (src/modellist.js) for a row. `{unknown:true}` when the slot is not a row.
   * @param {unknown} rawSlot
   * @returns {Promise<{unknown: true}|{ok: true, models: string[], ms: number}|{ok: false, why: string}>}
   */
  async function listFor(rawSlot) {
    const c = config();
    const k = keys();
    const slot = slotOf(rawSlot, c.config);
    if (!slot) return { unknown: true };
    if (c.problem) return { ok: false, why: c.problem };
    const row = keyRows({ filled: [slot], config: c.config })[0];
    // the address comes first: a row with no address has nothing to send yet
    if (row.baseUrl.trim() === '') return { ok: false, why: `Type a Base URL for ${slot} in Settings.` };
    const kf = keyFor(slot, k);
    if (kf.why) return { ok: false, why: kf.why };
    const r = await listModels({ shape: row.provider, baseUrl: row.baseUrl, key: /** @type {string} */ (kf.key), fetchImpl });
    return r.ok ? r : { ok: false, why: r.why };
  }

  /** The Providers GET. */
  function providers() {
    const k = keys();
    const c = config();
    const names = rowNames(c.config);
    const rows = keyRows({ filled: names.all, config: c.config });
    const spend = spendSummary({ home: opts.home, now: opts.now, rows });
    return reply(200, {
      ok: true,
      keysFile: { path: keysFilePath(opts.home), exists: k.exists, refusal: k.warning },
      configProblem: c.problem,
      shapes: SHAPES.map((x) => ({ id: x.id, label: x.label })),
      rows: rows.map((r) => {
        const raw = k.env[r.envName];
        let keyStatus = 'not set';
        if (k.unreadable) keyStatus = 'refused — see above';
        else if (raw && raw !== 'null' && apiKeyProblem(raw)) keyStatus = BAD_KEY;
        else if (names.filled.includes(r.envName)) keyStatus = 'set in file';
        else if (names.shellOnly.includes(r.envName)) keyStatus = 'found in shell';
        const own = spend.tokensByModel[r.envName] ?? {};
        return {
          slot: r.envName, label: r.envName, envVar: r.envName, keyStatus,
          shape: r.provider, baseUrl: r.baseUrl, legacyMaxTokens: r.legacyMaxTokens,
          tokens: spend.tokensByRow[r.envName] ?? 0,
          models: r.models.map(({ model, use, inPerM, outPerM }) => ({
            model, use, ...(inPerM === undefined ? {} : { inPerM }), ...(outPerM === undefined ? {} : { outPerM }),
            // this model's own tokens from the spend rows that name it; absent = no row names it (never 0)
            ...(Object.hasOwn(own, model) ? { tokens: own[model] } : {}),
          })),
        };
      }),
    });
  }

  /**
   * Save one model line: {slot, model, use?, inPerM?, outPerM?}. A field left out keeps the line's value; a price
   * `null` clears it. The WHOLE list is judged by `modelsProblem` (the one rule) before anything is written.
   * @param {any} body
   */
  function modelRoute(body) {
    const c = config();
    const k = keys();
    const slot = slotOf(body?.slot, c.config);
    if (!slot) return refuse('unknown-provider', 'That provider is not known.');
    if (c.problem) return refuse('config-broken', `${BROKEN_CONFIG} Nothing was saved.`);
    if (Object.hasOwn(body, 'cachedInPerM')) {
      return refuse('bad-price', 'Cached input has no price of its own: it is priced as input. Nothing was saved.');
    }
    if (typeof body.model !== 'string') return refuse('bad-model', 'Pick a model line. Nothing was saved.');
    const list = effectiveModels(slot, c.config).map((m) => ({ ...m }));
    /** @type {Record<string, any>|undefined} */
    let line = list.find((m) => m.model === body.model);
    if (!line) { line = { model: body.model, use: false }; list.push(/** @type {any} */ (line)); }
    if (Object.hasOwn(body, 'use')) line.use = body.use;
    for (const f of /** @type {const} */ (['inPerM', 'outPerM'])) {
      if (!Object.hasOwn(body, f)) continue;
      if (body[f] === null) delete line[f];
      else line[f] = body[f];
    }
    const problem = modelsProblem(list);
    if (problem) return refuse('bad-model', problem);
    try {
      updateConfig({ models: { [slot]: list } }, { home: opts.home });
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      return refuse('config-broken', `${BROKEN_CONFIG} Nothing was saved.`);
    }
    return reply(200, { ok: true, slot });
  }

  /** Save a row's shape, Base URL and old-max_tokens tick. Every field is judged first; write only if all pass. @param {any} body */
  function providerRoute(body) {
    const c = config();
    const slot = slotOf(body?.slot, c.config);
    if (!slot) return refuse('unknown-provider', 'That provider is not known.');
    if (c.problem) return refuse('config-broken', `${BROKEN_CONFIG} Nothing was saved.`);
    /** @type {Record<string, string>} */
    const say = { shape: 'Pick an API shape from the list.', baseUrl: 'The Base URL must start with http:// or https://.', legacyMaxTokens: 'The legacy max_tokens tick must be on or off.' };
    /** @type {Record<string, string|boolean|null>} */
    const patch = {};
    for (const key of Object.keys(say)) {
      if (!Object.hasOwn(body, key)) continue;
      const v = body[key];
      const clearUrl = key === 'baseUrl' && v === '';
      if (!clearUrl && providerFieldProblem(key, v) !== null) return refuse('bad-provider', `${say[key]} Nothing was saved.`);
      patch[key] = clearUrl ? null : (key === 'baseUrl' ? cleanBaseUrl(v) : v);
    }
    if (Object.keys(patch).length === 0) return refuse('bad-provider', 'Nothing to save.');
    try {
      updateConfig({ keys: { [slot]: patch } }, { home: opts.home });
    } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      return refuse('config-broken', `${BROKEN_CONFIG} Nothing was saved.`);
    }
    return reply(200, { ok: true, slot });
  }

  /**
   * Open the FOLDER of the server's own keys file (never a file, never an editor, never a path from the request) in the OS file manager:
   * argv array, no shell, detached. Another OS, a failed spawn, or a test process with no injected opener: `opened:false` + the path,
   * which the page shows as text.
   * @param {any} body
   * @returns {Promise<{status: number, body: any}>}
   */
  function openKeysFolder(body) {
    if (body !== null && typeof body === 'object' && Object.keys(body).length > 0) {
      return Promise.resolve(refuse('no-path-allowed', 'The keys folder is opened from the panel\'s own settings; a path cannot be sent. Nothing was opened.'));
    }
    const dir = keysHome(opts.home);
    const cannot = () => reply(200, { ok: true, opened: false, path: dir });
    // under a test process (NODE_ENV=test or `node --test`) nothing is spawned unless a test injected an opener
    const underTest = process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT !== undefined;
    return openInOs(dir, { platform: opts.platform, spawnFn: opts.openFolderSpawn, underTest })
      .then((opened) => (opened ? reply(200, { ok: true, opened: true, path: dir }) : cannot()));
  }

  /**
   * The POST routes that answer asynchronously.
   * @param {string} pathname
   * @param {any} body
   * @returns {Promise<{status: number, body: any}>|{status: number, body: any}}
   */
  function postRoute(pathname, body) {
    if (pathname === '/api/settings/provider') return providerRoute(body);
    if (pathname === '/api/settings/model') return modelRoute(body);
    if (pathname === '/api/settings/open-keys-folder') return openKeysFolder(body);
    return listFor(body?.slot).then((r) => {
      if ('unknown' in r) return refuse('unknown-provider', 'That provider is not known.');
      if (pathname === '/api/settings/test') return reply(200, r.ok ? { ok: true, ms: r.ms } : r);
      // /api/settings/models
      if (!r.ok) return reply(200, r);
      const ids = r.models;
      return reply(200, ids.length === 0 ? { ok: false, why: 'The provider did not list any models.' } : { ok: true, models: ids });
    });
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} pathname
   * @param {any} body already-parsed JSON body (or `null`)
   * @returns {boolean} true if this module handled the request
   */
  function handle(req, res, pathname, body) {
    if (!pathname.startsWith('/api/settings')) return false;
    const send = (/** @type {number} */ code, /** @type {any} */ obj) => {
      const text = JSON.stringify(obj);
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    };
    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }

    if (pathname === '/api/settings/money') {
      if (req.method === 'GET') {
        const cfg = readConfig({ home: opts.home });
        const rows = keyRows({ filled: rowNames(cfg.config).all, config: cfg.config });
        const s = spendSummary({ home: opts.home, now: opts.now, rows });
        /** @type {number|null} */
        let limit = null;
        let configProblem = cfg.problem;
        // a limit the file names but that is not a number above 0 is a problem, never "no limit"
        try { limit = monthlyLimitOf(cfg.config, opts.home); } catch (e) {
          if (!(e instanceof ConfigError)) throw e;
          configProblem = e.message;
        }
        send(200, {
          ok: true,
          configProblem,
          totalUsd: s.total.usd, totalAtLeast: s.total.atLeast,
          monthUsd: s.month.usd, monthAtLeast: s.month.atLeast,
          totalTokens: s.total.tokens, monthTokens: s.month.tokens,
          monthlyLimitUsd: limit,
          byProvider: Object.values(s.byProvider).sort((a, b) => b.totalUsd - a.totalUsd),
        });
        return true;
      }
      if (req.method === 'POST') {
        // an empty / unparseable body, or a JSON body without the key, is NOT "clear the limit" — only
        // an explicit null / blank clears it (that is how the auto-saving field clears it)
        if (body === null || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'monthlyLimitUsd')) {
          send(400, { ok: false, error: 'send {"monthlyLimitUsd": <number above 0>} to set the limit, or null to clear it' });
          return true;
        }
        // a blank / null limit removes it (no limit); anything else must be a number > 0
        const raw = body.monthlyLimitUsd;
        const limit = raw === null || raw === '' ? null : Number(raw);
        if (limit !== null && !(Number.isFinite(limit) && limit > 0)) {
          send(400, { ok: false, error: 'the monthly limit must be a number above 0 (leave it blank for no limit)' });
          return true;
        }
        try {
          updateConfig({ monthlyLimitUsd: limit }, { home: opts.home });
        } catch (e) {
          if (!(e instanceof ConfigError)) throw e;
          send(400, { ok: false, error: e.message });
          return true;
        }
        send(200, { ok: true, monthlyLimitUsd: limit });
        return true;
      }
      send(405, { ok: false, error: 'GET or POST only' });
      return true;
    }

    // ── Providers (P8) ──
    if (pathname === '/api/settings/providers' && req.method === 'GET') {
      // a missing keys file is created with its two comment lines (never edited if present)
      ensureKeysFile(opts.home);
      const r = providers();
      send(r.status, r.body);
      return true;
    }
    const postPaths = ['/api/settings/provider', '/api/settings/model', '/api/settings/models', '/api/settings/test', '/api/settings/open-keys-folder'];
    if (req.method === 'POST' && postPaths.includes(pathname)) {
      Promise.resolve(postRoute(pathname, body)).then((r) => send(r.status, r.body));
      return true;
    }

    const r = refuse('no-such-settings-route', 'Settings cannot do that. Keys are typed into your keys file by hand.', 404);
    send(r.status, r.body);
    return true;
  }
  return { handle };
}
