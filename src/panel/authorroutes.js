// PANEL-BUILD.md P3 — the WRITE side of the panel: chat/authoring + sign +
// run-start. Everything in `src/panel/server.js` proper stays read-only
// (that file's own header comment); this module is the ONE place a POST can
// reach, and it is deliberately kept separate so the read-only file's own
// "GET/HEAD only" invariant is never touched by this build.
//
// THE HUMAN-CLICK GUARD (hard line, PANEL-BUILD.md §5: "only hamr's own
// click signs. The chat can't."): every route in this file requires BOTH —
//   (a) the per-server-start token, minted once by {@link mintToken} and
//       templated into `index.html` exactly like the port, sent back on
//       every POST as the `x-bareloop-token` header;
//   (b) an Origin/Host header naming this same server's own bind address.
// The SIGN route additionally requires the EXACT `specHash` from that
// session's own `signing.json` (never trusted from the request body alone
// without that check) — a mismatch, a missing gate, or a session not yet
// `prepared` all refuse. No other route in this file (start/send/revise/
// sign-prepare) can reach the sign path — `signRun` is the only function
// here that ever calls `spawnFn`.

import { randomBytes } from 'node:crypto';
import { spawn as realSpawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createSession, validateJobCard } from './authorsession.js';
import { checkMonthlyRoom, monthlyRefusalText } from '../monthly.js';
import { ConfigError } from '../config.js';
import { keysForDoor, keysHome } from '../keysfile.js';
import { keyNameFor, modelChoiceFor, rowsForHome, chatModels } from '../providerrows.js';
import { apiKeyProblem, checkProviderReachable } from '../providers.js';

/** @returns {string} a fresh per-process token — never persisted, never logged */
export function mintToken() {
  return randomBytes(24).toString('hex');
}

/**
 * `true` when a request may reach ANY route in this file — the token header
 * plus an Origin/Host that names this exact bind address. `req.headers`
 * lower-cases header names (node's own `http` behaviour), so this reads
 * lower-case names throughout.
 * @param {import('node:http').IncomingMessage} req
 * @param {{token: string, port: number}} o
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function checkHumanGuard(req, { token, port }) {
  const got = req.headers['x-bareloop-token'];
  if (got !== token) return { ok: false, reason: 'missing or wrong token' };
  const want = `127.0.0.1:${port}`;
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin === 'string' && origin.length > 0) {
    if (origin !== `http://${want}` && origin !== `https://${want}`) return { ok: false, reason: 'wrong Origin' };
  } else if (host !== want) {
    return { ok: false, reason: 'wrong Host (and no Origin header)' };
  }
  return { ok: true };
}

/**
 * The one-at-a-time authoring session store (build spec: "one authoring
 * session at a time — a second Start is refused while one is live"). A
 * session is "live" from creation until its phase settles into a terminal
 * one; a terminal session is kept (so its chat/hash stay readable) but no
 * longer counts against the one-at-a-time rule.
 */
const TERMINAL_PHASES = new Set(['refused', 'abandoned', 'error', 'signed', 'signing-failed']);

/**
 * Builds this file's own request handler, holding its session store in a
 * closure (one per `createPanelServer` call, exactly like `handleRequest`'s
 * own module holds none — this file owns the state `src/panel/server.js`
 * deliberately has none of).
 * @param {{ port: number, token: string, env?: Record<string,string|undefined>,
 *   sessionsRoot?: string, spawnFn?: typeof realSpawn, bareloopBin?: string,
 *   jobsDir?: string, fetchImpl?: typeof fetch, home?: string }} opts
 */
export function createAuthorRoutes(opts) {
  // the RAW env with the keys file re-merged on every use, so an edited file takes effect
  // without a restart (never a start-time snapshot). An injected env with no `home` skips the file.
  const envNow = () => keysForDoor({ env: opts.env, keysHome: opts.home }).env;
  const spawnFn = opts.spawnFn ?? realSpawn;
  const bareloopBin = opts.bareloopBin ?? new URL('../../bin/bareloop.mjs', import.meta.url).pathname;
  // TEST SEAM ONLY: a test injects a fake `fetch`-shaped function so the
  // model-readiness route's own network probe (item 7 below) never makes a
  // real request — production always uses the real global `fetch`.
  const fetchImpl = opts.fetchImpl ?? fetch;
  /** @type {Map<string, ReturnType<typeof createSession>>} */
  const sessions = new Map();

  const hasLiveSession = () => [...sessions.values()].some((s) => !TERMINAL_PHASES.has(s.state.phase));

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} pathname
   * @param {any} body already-parsed JSON body (or `null`)
   * @returns {boolean} true if this module handled the request
   */
  function handle(req, res, pathname, body) {
    if (!pathname.startsWith('/api/author')) return false;

    const send = (code, obj) => {
      const text = JSON.stringify(obj);
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    };

    const guard = checkHumanGuard(req, { token: opts.token, port: opts.port });
    if (!guard.ok) { send(403, { ok: false, error: `refused — ${guard.reason}` }); return true; }

    // ── build item 7: model readiness, BEFORE drafting, $0/no tokens ──────
    // ONE server-side function (`checkProviderReachable`, src/providers.js)
    // the future Settings providers table (PANEL-BUILD.md P4) reuses as-is —
    // this route is the ONLY caller today. Never returns key material: the
    // page sees the key's NAME (`envKey`) and a status word, never the value.
    if (pathname === '/api/author/model-check') {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const q = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1').searchParams;
      const modelId = q.get('model') ?? '';
      const rows = rowsForHome(keysHome(opts.home));
      const choice = modelChoiceFor(rows, modelId);
      if (!choice) { send(400, { ok: false, error: `unknown model "${modelId}"` }); return true; }
      // the key of the Settings row this Name belongs to
      const keyName = keyNameFor(choice.provider, choice.baseUrl, rows, choice.name).name;
      const raw = envNow()[keyName];
      const problem = raw ? apiKeyProblem(raw) : null;
      const keyStatus = !raw ? 'missing' : (problem ? 'bad-shape' : 'found');
      if (keyStatus !== 'found') {
        send(200, {
          ok: true, envKey: keyName, keyStatus, keyProblem: problem,
          reachability: { checked: false, reachable: null, modelListed: null, status: null, note: 'no usable key to check reachability with' },
        });
        return true;
      }
      // GET ONLY, no completion request, never spends a token (see
      // `checkProviderReachable`'s own doc) — a short timeout so a flaky
      // endpoint never hangs the card.
      checkProviderReachable({
        providerName: choice.provider, apiKey: /** @type {string} */ (raw), model: choice.name,
        baseUrl: choice.baseUrl, fetchImpl, timeoutMs: 4000,
      }).then((r) => {
        send(200, {
          ok: true,
          envKey: keyName,
          keyStatus,
          keyProblem: null,
          reachability: {
            checked: true, reachable: r.reachable, modelListed: r.modelListed, status: r.status, note: r.note,
          },
        });
      });
      return true;
    }

    // ── P4a: the monthly-limit note under the cap field. READ-ONLY, $0 — the same
    // library check (`checkMonthlyRoom`, src/monthly.js) the run-start seam and the
    // Sign refusal use, so the note the person sees is never a second opinion. The
    // page is never the arbiter: Sign & run re-checks server-side regardless.
    // ── P4b: Chat's Model menu IS the Settings rows (a blank Name is not offered). ──
    if (pathname === '/api/author/models') {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      send(200, { ok: true, models: chatModels(rowsForHome(keysHome(opts.home))) });
      return true;
    }

    if (pathname === '/api/author/monthly-check') {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const q = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1').searchParams;
      const cap = Number(q.get('cap'));
      if (!Number.isFinite(cap) || cap <= 0) { send(200, { ok: true, refusal: null }); return true; }
      try {
        const room = checkMonthlyRoom({ capUsd: cap, home: opts.home });
        send(200, { ok: true, refusal: monthlyRefusalText(room), leftUsd: room.leftUsd, atLeast: room.atLeast });
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        send(200, { ok: true, refusal: null, configProblem: e.message });
      }
      return true;
    }

    if (pathname === '/api/author/start') {
      if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }
      if (hasLiveSession()) { send(409, { ok: false, error: 'an authoring session is already live — one at a time' }); return true; }
      const card = body ?? {};
      const v = validateJobCard(card, { jobsDir: opts.jobsDir, rows: rowsForHome(keysHome(opts.home)) });
      if (!v.ok) { send(400, { ok: false, error: v.error }); return true; }
      const session = createSession(card, { env: envNow(), sessionsRoot: opts.sessionsRoot, ...(opts.home !== undefined ? { home: opts.home } : {}) });
      sessions.set(session.id, session);
      send(200, { ok: true, sessionId: session.id, state: session.state });
      return true;
    }

    const m = /^\/api\/author\/([A-Za-z0-9]+)(\/(send|revise|sign-prepare|sign|check-deps))?$/.exec(pathname);
    if (!m) { send(404, { ok: false, error: 'not found' }); return true; }
    const session = sessions.get(m[1]);
    if (!session) { send(404, { ok: false, error: 'no such session' }); return true; }
    const sub = m[3] ?? null;

    if (sub === null) {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      send(200, { ok: true, state: session.state });
      return true;
    }
    if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }

    if (sub === 'send') {
      const r = session.send(String(body?.text ?? ''));
      send(r.ok ? 200 : 400, { ...r, state: session.state });
      return true;
    }
    if (sub === 'revise') {
      session.revise(String(body?.text ?? '')).then((r) => send(r.ok ? 200 : 400, { ...r, state: session.state }));
      return true;
    }
    if (sub === 'check-deps') {
      const r = session.checkDeps();
      send(r.ok ? 200 : 400, { ...r, state: session.state });
      return true;
    }
    if (sub === 'sign-prepare') {
      const r = session.signPrepare();
      send(r.ok ? 200 : 400, { ...r, state: session.state });
      return true;
    }
    if (sub === 'sign') {
      const claimedHash = String(body?.specHash ?? '');
      const r = signRun(session, claimedHash, { env: envNow(), spawnFn, bareloopBin, sessionsRoot: opts.sessionsRoot, home: opts.home });
      send(r.ok ? 200 : 400, r);
      return true;
    }
    send(404, { ok: false, error: 'not found' });
    return true;
  }

  return { handle, sessions };
}

/**
 * The panel's OWN 2-decimal money render for a chat line — hamr's ruling
 * 2026-09-28 (2nd addendum, panel money 2-decimals): a positive amount below
 * a cent reads `<$0.01`, never `$0.00` (a real cost must never read as
 * free). This is the server-side (Node, chat-text) sibling of
 * `src/panel/index.html`'s own inline `panelMoney` — the two can't share
 * code (one runs in the browser as inlined script, the other in Node), the
 * same duplication `src/replay.js`'s `money()`/`index.html`'s `money()`
 * already carry, so both apply the identical rule rather than drift.
 * @param {number} n a non-negative dollar amount
 * @returns {string}
 */
function panelMoney2(n) {
  if (n > 0 && n < 0.01) return '<$0.01';
  // two-step rounding (matching index.html's own panelMoney): clean to
  // 6-decimal precision first (the same precision src/text.js's tallyCalls
  // sums to) before rounding to cents, so a summed float landing just under
  // an exact cent boundary is never mis-rounded.
  const clean = Math.round(n * 1e6) / 1e6;
  const cents = Math.round(clean * 100 + 1e-6);
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * THE ONLY function in this file (or anywhere in the panel) that spawns a
 * run. Refuses unless the session is `prepared` AND the hash the request
 * carried matches the session's OWN `signing.json` `specHash` exactly — the
 * click carries the hash (per the mockup's own "the person never has to copy
 * it to sign"), and this is where it is checked, not trusted.
 * @param {ReturnType<typeof createSession>} session
 * @param {string} claimedHash
 * @param {{env: any, spawnFn: typeof realSpawn, bareloopBin: string, sessionsRoot?: string, home?: string}} o
 * @returns {{ok: boolean, error?: string, job?: string}}
 */
export function signRun(session, claimedHash, o) {
  if (session.state.phase !== 'prepared') return { ok: false, error: `session is not prepared (phase=${session.state.phase}) — nothing to sign` };
  if (!session.state.specHash || claimedHash !== session.state.specHash) return { ok: false, error: 'spec hash mismatch — refusing to sign' };
  if (!session.state.resolvedSpecPath) return { ok: false, error: 'no resolved spec on disk — refusing to sign' };
  // P4a — the monthly $ limit REFUSES here too, server-side, before anything is spawned
  // (the page's note is a courtesy; this is the check). Same library call, same text as
  // the run-start seam in src/userrun.js. The session stays `prepared`, so the person can
  // lower nothing (the cap is signed in) but may raise the limit in Settings and sign again.
  try {
    const spec = JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
    const refusal = monthlyRefusalText(checkMonthlyRoom({ capUsd: Number(spec.budgetUsd), home: o.home }));
    if (refusal !== null) return { ok: false, error: refusal };
  } catch (e) {
    if (e instanceof ConfigError) return { ok: false, error: `${e.message} — refusing rather than guess the monthly limit` };
    return { ok: false, error: 'could not read the signed spec to check the monthly limit — refusing to sign' };
  }
  const logFile = join(session.state.outDir, 'run.log');
  // array argv, never a shell string — `--approve <hash>` is a literal
  // element, checkable byte-for-byte by a test stubbing `spawnFn`, and there
  // is no shell to mis-quote a path or a hash through.
  // hamr's ruling 2026-09-28 ("one cap covers drafting + run") — this
  // session's own drafting spend (the known floor `authorsession.js`'s
  // `onCall` tracks, off the SAME `metered` list the chat's cost readout
  // already used) rides along so the run's own enforced ceiling is
  // `Cap $ − drafting spent`, computed in the ONE place (`src/run.js`'s
  // `remainingUsd`) that arithmetic lives. Omitted when there is nothing to
  // report (a session that spent $0 drafting, e.g. every gate 1-3-only
  // path) — `run-u`'s own flag default (0) is identical, so this is never a
  // silent difference.
  const draftSpentUsd = typeof session.state.draftSpentUsd === 'number' && session.state.draftSpentUsd > 0
    ? session.state.draftSpentUsd : null;
  // hamr's ruling 2026-09-28 (2nd addendum) — a NEW field beside draftSpentUsd
  // (never a value inside it): whether this session's own known floor was
  // EXACT. Meaningless without a drafting spend, so only ever passed
  // alongside --draft-spent-usd, matching run-u's own guard.
  const draftIncomplete = draftSpentUsd !== null && session.state.draftSpendComplete === false;
  const args = [
    'systemd-inhibit', '--why=bareloop panel run',
    process.execPath, o.bareloopBin,
    'run-u', '--spec', session.state.resolvedSpecPath, '--approve', session.state.specHash,
    ...(draftSpentUsd !== null ? ['--draft-spent-usd', String(draftSpentUsd), ...(draftIncomplete ? ['--draft-spend-incomplete'] : [])] : []),
  ];
  /** @type {number|null} */
  let logFd = null;
  try { logFd = openSync(logFile, 'a'); } catch { logFd = null; }
  const child = o.spawnFn('setsid', args, {
    detached: true, stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'], env: o.env,
  });
  if (typeof child?.unref === 'function') child.unref();
  session.state.phase = 'signed';
  const draftLine = draftSpentUsd !== null
    ? ` — drafting spent ${draftIncomplete ? 'at least ' : ''}${panelMoney2(draftSpentUsd)} (folds out of the run's own cap)`
    : '';
  session.state.messages.push({ role: 'system', text: `signed — spec hash ${session.state.specHash}${draftLine} — run starting detached, own log at ${logFile}` });
  return { ok: true, job: session.state.resolvedSpecPath };
}
