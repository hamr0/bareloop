// PANEL-BUILD.md P4a — Settings routes (`/api/settings/*`). A separate module from the
// authoring routes on purpose: the chat/authoring session can reach NO route here (it has
// no path to this file's handlers), and every route here is behind the same human-click
// guard (per-server-start token + Origin/Host, `checkHumanGuard`) — GET too, because the
// pages these serve name key variables and spend.
//
// Every write goes to `~/.config/bareloop/config.json` through `src/config.js` (the one
// writer); the monthly limit is a person's own number, set by hand — nothing here (and
// nothing the agent can reach) raises it on their behalf. Key VALUES never appear in any
// response: names and found / not set only.
import { checkHumanGuard } from './authorroutes.js';
import { readConfig, updateConfig, ConfigError } from '../config.js';
import { spendSummary } from '../monthly.js';
import { loadKeysEnv, keysFilePath } from '../keysfile.js';
import { PROVIDER_ROWS, keyNameFor } from '../providerrows.js';
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
        const limit = cfg.config.monthlyLimitUsd;
        send(200, {
          ok: true,
          configProblem: cfg.problem,
          totalUsd: s.total.usd, totalAtLeast: s.total.atLeast,
          monthUsd: s.month.usd, monthAtLeast: s.month.atLeast,
          monthlyLimitUsd: typeof limit === 'number' && Number.isFinite(limit) ? limit : null,
          byProvider: Object.values(s.byProvider).sort((a, b) => b.totalUsd - a.totalUsd),
        });
        return true;
      }
      if (req.method === 'POST') {
        // a blank / null limit removes it (no limit); anything else must be a number > 0
        const raw = body?.monthlyLimitUsd;
        const limit = raw === null || raw === '' || raw === undefined ? null : Number(raw);
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

    // ── Providers (P4a item 4): read + test + key-NAME dropdown. No add/edit/remove (P4b). ──
    if (pathname === '/api/settings/providers' && req.method === 'GET') {
      const cfg = readConfig({ home: opts.home });
      const k = keys();
      const s = spendSummary({ home: opts.home, now: opts.now });
      const rows = PROVIDER_ROWS.map((r) => {
        const kn = keyNameFor(r.provider, r.baseUrl, cfg.config);
        const raw = k.env[kn.name];
        const problem = raw ? apiKeyProblem(raw) : null;
        const p = s.byProvider[r.id];
        const note = cfg.config.anthropicBalanceNote;
        return {
          id: r.id, name: r.name, shape: r.shape, url: r.shownUrl,
          keyName: kn.name, builtInKey: kn.builtIn,
          keyOptions: [...new Set([kn.builtIn, ...k.names])],
          keyStatus: !raw ? 'not set' : (problem ? `bad shape (${problem})` : 'found'),
          canTest: r.provider !== 'gemini-api',
          tokens: p ? p.tokens : 0,
          balance: r.id === 'anthropic'
            ? { kind: 'note', usd: typeof note === 'number' && Number.isFinite(note) ? note : null }
            : (r.id === 'deepseek' ? { kind: 'fetch' } : { kind: 'none' }),
          // priced by a rate somebody vouched for, or a bareloop guess — never a bare "priced"
          price: p && p.vouchedRounds > 0 && p.otherRounds === 0 ? 'vouched' : 'estimated',
        };
      });
      send(200, {
        ok: true,
        keysFile: { path: keysFilePath(opts.home), exists: k.exists, names: k.names, warning: k.warning },
        configProblem: cfg.problem,
        rows,
      });
      return true;
    }

    if (pathname === '/api/settings/providers/key' && req.method === 'POST') {
      const row = PROVIDER_ROWS.find((r) => r.id === body?.id);
      if (!row) { send(400, { ok: false, error: 'unknown provider' }); return true; }
      const builtIn = keyNameFor(row.provider, row.baseUrl, {}).builtIn;
      const want = body?.key === null || body?.key === builtIn ? null : String(body?.key ?? '');
      // only a NAME the keys file actually holds (or the built-in default) can be chosen
      if (want !== null && !keys().names.includes(want)) {
        send(400, { ok: false, error: `${want} is not in your keys file — add the line NAME=key to it, reload keys, then pick it` });
        return true;
      }
      try {
        updateConfig({ providers: { [row.id]: { key: want } } }, { home: opts.home });
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        send(400, { ok: false, error: e.message });
        return true;
      }
      send(200, { ok: true, id: row.id, keyName: want ?? builtIn });
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
      const row = PROVIDER_ROWS.find((r) => r.id === body?.id);
      if (!row) { send(400, { ok: false, error: 'unknown provider' }); return true; }
      const kn = keyNameFor(row.provider, row.baseUrl, readConfig({ home: opts.home }).config);
      const raw = keys().env[kn.name];
      if (!raw) { send(200, { ok: true, reachable: false, status: 'no key', note: `${kn.name} not set`, ms: null }); return true; }
      const problem = apiKeyProblem(raw);
      if (problem) { send(200, { ok: true, reachable: false, status: 'bad key', note: `${kn.name} ${problem}`, ms: null }); return true; }
      const started = Date.now();
      // $0: one GET of the provider's models list (never a completion), key only in a header
      checkProviderReachable({
        providerName: row.provider, apiKey: raw, baseUrl: row.baseUrl ?? undefined, fetchImpl, timeoutMs: 4000,
      }).then((r) => {
        send(200, { ok: true, reachable: r.reachable, status: r.status, note: r.note, ms: Date.now() - started });
      });
      return true;
    }

    if (pathname === '/api/settings/providers/balance' && req.method === 'GET') {
      // DeepSeek only: fetched server-side from the provider (key in a header, never returned)
      const row = PROVIDER_ROWS.find((r) => r.id === 'deepseek');
      if (!row) { send(404, { ok: false, error: 'not found' }); return true; }
      const kn = keyNameFor(row.provider, row.baseUrl, readConfig({ home: opts.home }).config);
      const raw = keys().env[kn.name];
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
