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

/**
 * @param {{ port: number, token: string, home?: string, env?: Record<string,string|undefined>,
 *   fetchImpl?: typeof fetch, now?: () => number }} opts
 */
export function createSettingsRoutes(opts) {
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
    send(404, { ok: false, error: 'not found' });
    return true;
  }
  return { handle };
}
