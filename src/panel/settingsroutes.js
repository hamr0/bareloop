// PANEL-BUILD.md P4a — Settings routes (`/api/settings/*`). A separate module from the
// authoring routes on purpose: the chat/authoring session can reach NO route here (it has
// no path to this file's handlers), and every route here is behind the same human-click
// guard (per-server-start token + Origin/Host, `checkHumanGuard`) — GET too, because the
// pages these serve name key variables and spend.
//
// Providers (P4b): the rows are the keys file's filled lines; Name / API shape / Base URL save to
// config.json `keys.<ENV NAME>` (src/providerrows.js is the one owner of the rows).
//
// Every write goes to `~/.config/bareloop/config.json` through `src/config.js` (the one
// writer); the monthly limit is a person's own number, set by hand — nothing here (and
// nothing the agent can reach) raises it on their behalf. Key VALUES never appear in any
// response: names and found / not set only.
import { checkHumanGuard } from './authorroutes.js';
import { readConfig, updateConfig, ConfigError } from '../config.js';
import { spendSummary, monthlyLimitOf } from '../monthly.js';
import { loadKeysEnv, keysFilePath, filledKeyNames, ensureKeysFile } from '../keysfile.js';
import { SHAPES, PRESET_KEY_NAMES, keyRows, endpointOf, defaultUrlOf, usableKey } from '../providerrows.js';
import { apiKeyProblem, checkProviderReachable } from '../providers.js';

/** DeepSeek's own balance endpoint (same host as its models list). */
const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';

/**
 * @param {{ port: number, token: string, home?: string, env?: Record<string,string|undefined>,
 *   fetchImpl?: typeof fetch, now?: () => number }} opts
 */
export function createSettingsRoutes(opts) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  /** the env keys are looked up in: the door's env (shell + keys file), re-read against the
   * keys file on every call so "Reload keys" is just another request. NAMES leave this
   * module; values never do.
   * @returns {ReturnType<typeof loadKeysEnv>} */
  const keys = () => loadKeysEnv({ env: opts.env, home: opts.home });
  /** the Providers rows: keys with a value in the file, over the saved settings
   * @param {Record<string, any>} config */
  const currentRows = (config) => keyRows({ filled: filledKeyNames(opts.home), config });
  /** @param {string} u @returns {string} */
  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
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
        const s = spendSummary({ home: opts.home, now: opts.now });
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

    // ── Providers (P4b): one row per key in the keys file that has a value. ──
    if (pathname === '/api/settings/providers' && req.method === 'GET') {
      // a missing keys file is created with the five empty preset lines (never edited if present)
      ensureKeysFile(PRESET_KEY_NAMES, opts.home);
      const cfg = readConfig({ home: opts.home });
      const k = keys();
      const rows = currentRows(cfg.config);
      const s = spendSummary({ home: opts.home, now: opts.now, rows });
      const note = cfg.config.anthropicBalanceNote;
      // a preset key exported only in the shell gets no row (the rows are the keys file): NAMES the
      // person can act on, read off the RAW shell env — never a value, never a length
      const shellEnv = opts.env ?? process.env;
      const filled = new Set(filledKeyNames(opts.home));
      const shellOnly = PRESET_KEY_NAMES.filter((n) => typeof shellEnv[n] === 'string' && shellEnv[n] !== '' && !filled.has(n));
      send(200, {
        ok: true,
        shellOnly,
        keysFile: { path: keysFilePath(opts.home), exists: k.exists, names: k.names, warning: k.warning },
        configProblem: cfg.problem,
        shapes: SHAPES.map((x) => ({ id: x.id, label: x.label })),
        rows: rows.map((r) => {
          const raw = k.env[r.envName];
          const problem = raw ? apiKeyProblem(raw) : null;
          const isDeepseek = r.provider === 'openai-api' && hostOf(endpointOf(r.provider, r.baseUrl)) === 'api.deepseek.com';
          return {
            envName: r.envName, name: r.name, shape: r.provider, baseUrl: r.baseUrl,
            placeholder: defaultUrlOf(r.provider),
            keyStatus: !raw ? 'not set' : (raw === 'null' ? 'no key needed' : (problem ? `bad shape (${problem})` : 'found')),
            canTest: r.provider !== 'gemini-api',
            priceInPerM: typeof r.priceInPerM === 'number' ? r.priceInPerM : null,
            priceOutPerM: typeof r.priceOutPerM === 'number' ? r.priceOutPerM : null,
            tokens: s.tokensByRow[r.envName] ?? 0,
            balance: r.provider === 'anthropic-api'
              ? { kind: 'note', usd: typeof note === 'number' && Number.isFinite(note) ? note : null }
              : (isDeepseek ? { kind: 'fetch' } : { kind: 'none' }),
          };
        }),
      });
      return true;
    }

    if (pathname === '/api/settings/providers/row' && req.method === 'POST') {
      const row = currentRows(readConfig({ home: opts.home }).config).find((r) => r.envName === body?.envName);
      if (!row) { send(400, { ok: false, error: 'unknown key — add NAME=key to your keys file and reload keys' }); return true; }
      // only the three settings a row has; each is optional in the body, the whole triple is stored
      /** @type {Record<string, string|number|null>} */
      const patch = {
        name: typeof body?.name === 'string' ? body.name.trim() : row.name,
        shape: typeof body?.shape === 'string' ? body.shape : row.provider,
        baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : row.baseUrl,
      };
      // the two prices (USD per 1M tokens): absent = unchanged; blank / null = not set (the field is removed,
      // never written as 0); otherwise a finite number >= 0 — anything else is refused and nothing is saved
      for (const f of /** @type {const} */ (['priceInPerM', 'priceOutPerM'])) {
        if (!Object.hasOwn(body ?? {}, f)) continue;
        const v = body[f];
        const label = f === 'priceInPerM' ? 'In' : 'Out';
        if (v === null || (typeof v === 'string' && v.trim() === '')) { patch[f] = null; continue; }
        const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : NaN);
        if (!(Number.isFinite(n) && n >= 0)) {
          send(400, { ok: false, error: `the ${label} price must be a number, 0 or more (USD per 1M tokens), or blank for not set` });
          return true;
        }
        patch[f] = n;
      }
      // a price is both fields or neither — ratesFor refuses a half-set one at run time, so never save half
      const after = (/** @type {'priceInPerM'|'priceOutPerM'} */ f) => (Object.hasOwn(patch, f) ? patch[f] !== null : row[f] !== undefined);
      if (after('priceInPerM') !== after('priceOutPerM')) {
        send(400, { ok: false, error: 'set both prices (In and Out, USD per 1M tokens) or neither — a half-set price is refused' });
        return true;
      }
      try {
        updateConfig({ keys: { [row.envName]: patch } }, { home: opts.home });
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        send(400, { ok: false, error: e.message });
        return true;
      }
      send(200, { ok: true, envName: row.envName, ...patch });
      return true;
    }

    if (pathname === '/api/settings/providers/balance-note' && req.method === 'POST') {
      // the Anthropic balance is a NOTE the person types; no check ever reads it
      const raw = body?.usd;
      const usd = raw === null || raw === '' || raw === undefined ? null : Number(raw);
      if (usd !== null && !(Number.isFinite(usd) && usd >= 0)) { send(400, { ok: false, error: 'the balance must be a number, 0 or more' }); return true; }
      try {
        updateConfig({ anthropicBalanceNote: usd }, { home: opts.home });
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        send(400, { ok: false, error: e.message });
        return true;
      }
      send(200, { ok: true, usd });
      return true;
    }

    if (pathname === '/api/settings/providers/test' && req.method === 'POST') {
      const row = currentRows(readConfig({ home: opts.home }).config).find((r) => r.envName === body?.envName);
      if (!row) { send(400, { ok: false, error: 'unknown key' }); return true; }
      const raw = keys().env[row.envName];
      if (!raw) { send(200, { ok: true, reachable: false, status: 'no key', note: `${row.envName} not set`, ms: null }); return true; }
      const problem = apiKeyProblem(raw);
      if (problem) { send(200, { ok: true, reachable: false, status: 'bad key', note: `${row.envName} ${problem}`, ms: null }); return true; }
      const started = Date.now();
      // $0: one GET of the models list with THIS row's shape + URL (never a completion), key only in a header
      checkProviderReachable({
        providerName: row.provider, apiKey: usableKey(raw), baseUrl: row.baseUrl.trim() !== '' ? row.baseUrl : undefined, fetchImpl, timeoutMs: 4000,
      }).then((r) => {
        send(200, { ok: true, reachable: r.reachable, status: r.status, note: r.note, ms: Date.now() - started });
      });
      return true;
    }

    if (pathname === '/api/settings/providers/balance' && req.method === 'GET') {
      // DeepSeek only: fetched server-side from the provider (key in a header, never returned)
      const q = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1').searchParams;
      const row = currentRows(readConfig({ home: opts.home }).config).find((r) => r.envName === q.get('env'));
      if (!row || row.provider !== 'openai-api' || hostOf(endpointOf(row.provider, row.baseUrl)) !== 'api.deepseek.com') { send(404, { ok: false, error: 'not found' }); return true; }
      const raw = keys().env[row.envName];
      if (!raw || apiKeyProblem(raw)) { send(200, { ok: true, text: null, note: 'no usable key' }); return true; }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      fetchImpl(DEEPSEEK_BALANCE_URL, { method: 'GET', headers: { Authorization: `Bearer ${raw}` }, signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) { send(200, { ok: true, text: null, note: `HTTP ${res.status}` }); return; }
          /** @type {any} */
          let j = null;
          try { j = await res.json(); } catch { j = null; }
          const infos = Array.isArray(j?.balance_infos) ? j.balance_infos : [];
          const parts = infos
            .filter((/** @type {any} */ b) => b && typeof b.currency === 'string' && b.total_balance !== undefined)
            .map((/** @type {any} */ b) => `${String(b.total_balance)} ${b.currency}`);
          send(200, { ok: true, text: parts.length ? parts.join(' + ') : null, note: parts.length ? null : 'balance not reported' });
        })
        .catch((/** @type {any} */ e) => { send(200, { ok: true, text: null, note: `request failed: ${e?.name === 'AbortError' ? 'timeout' : (e?.code || e?.name || 'error')}` }); })
        .finally(() => clearTimeout(timer));
      return true;
    }

    send(404, { ok: false, error: 'not found' });
    return true;
  }
  return { handle };
}
