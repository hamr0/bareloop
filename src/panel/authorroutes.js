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
import { createSession, validateJobCard, MODEL_OPTIONS } from './authorsession.js';
import { resolveProvider, apiKeyProblem, checkProviderReachable } from '../providers.js';

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
 *   jobsDir?: string, fetchImpl?: typeof fetch }} opts
 */
export function createAuthorRoutes(opts) {
  const env = opts.env ?? process.env;
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
      const choice = MODEL_OPTIONS[modelId];
      if (!choice) { send(400, { ok: false, error: `unknown model "${modelId}"` }); return true; }
      /** @type {any} */
      let providerEntry;
      try { providerEntry = resolveProvider(choice.provider); } catch (e) { send(400, { ok: false, error: /** @type {Error} */ (e).message }); return true; }
      const raw = env[providerEntry.envKey];
      const problem = raw ? apiKeyProblem(raw) : null;
      const keyStatus = !raw ? 'missing' : (problem ? 'bad-shape' : 'found');
      if (keyStatus !== 'found') {
        send(200, {
          ok: true, envKey: providerEntry.envKey, keyStatus, keyProblem: problem,
          reachability: { checked: false, reachable: null, modelListed: null, status: null, note: 'no usable key to check reachability with' },
        });
        return true;
      }
      // GET ONLY, no completion request, never spends a token (see
      // `checkProviderReachable`'s own doc) — a short timeout so a flaky
      // endpoint never hangs the card.
      checkProviderReachable({
        providerName: choice.provider, apiKey: /** @type {string} */ (raw), model: providerEntry.tiers.sonnet,
        baseUrl: choice.baseUrl, fetchImpl, timeoutMs: 4000,
      }).then((r) => {
        send(200, {
          ok: true,
          envKey: providerEntry.envKey,
          keyStatus,
          keyProblem: null,
          reachability: {
            checked: true, reachable: r.reachable, modelListed: r.modelListed, status: r.status, note: r.note,
          },
        });
      });
      return true;
    }

    if (pathname === '/api/author/start') {
      if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }
      if (hasLiveSession()) { send(409, { ok: false, error: 'an authoring session is already live — one at a time' }); return true; }
      const card = body ?? {};
      const v = validateJobCard(card);
      if (!v.ok) { send(400, { ok: false, error: v.error }); return true; }
      const session = createSession(card, { env, sessionsRoot: opts.sessionsRoot });
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
      const r = signRun(session, claimedHash, { env, spawnFn, bareloopBin, sessionsRoot: opts.sessionsRoot });
      send(r.ok ? 200 : 400, r);
      return true;
    }
    send(404, { ok: false, error: 'not found' });
    return true;
  }

  return { handle, sessions };
}

/**
 * THE ONLY function in this file (or anywhere in the panel) that spawns a
 * run. Refuses unless the session is `prepared` AND the hash the request
 * carried matches the session's OWN `signing.json` `specHash` exactly — the
 * click carries the hash (per the mockup's own "the person never has to copy
 * it to sign"), and this is where it is checked, not trusted.
 * @param {ReturnType<typeof createSession>} session
 * @param {string} claimedHash
 * @param {{env: any, spawnFn: typeof realSpawn, bareloopBin: string, sessionsRoot?: string}} o
 * @returns {{ok: boolean, error?: string, job?: string}}
 */
export function signRun(session, claimedHash, o) {
  if (session.state.phase !== 'prepared') return { ok: false, error: `session is not prepared (phase=${session.state.phase}) — nothing to sign` };
  if (!session.state.specHash || claimedHash !== session.state.specHash) return { ok: false, error: 'spec hash mismatch — refusing to sign' };
  if (!session.state.resolvedSpecPath) return { ok: false, error: 'no resolved spec on disk — refusing to sign' };
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
  const args = [
    'systemd-inhibit', '--why=bareloop panel run',
    process.execPath, o.bareloopBin,
    'run-u', '--spec', session.state.resolvedSpecPath, '--approve', session.state.specHash,
    ...(draftSpentUsd !== null ? ['--draft-spent-usd', String(draftSpentUsd)] : []),
  ];
  /** @type {number|null} */
  let logFd = null;
  try { logFd = openSync(logFile, 'a'); } catch { logFd = null; }
  const child = o.spawnFn('setsid', args, {
    detached: true, stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'], env: o.env,
  });
  if (typeof child?.unref === 'function') child.unref();
  session.state.phase = 'signed';
  const draftLine = draftSpentUsd !== null ? ` — drafting spent $${draftSpentUsd.toFixed(4)} (folds out of the run's own cap)` : '';
  session.state.messages.push({ role: 'system', text: `signed — spec hash ${session.state.specHash}${draftLine} — run starting detached, own log at ${logFile}` });
  return { ok: true, job: session.state.resolvedSpecPath };
}
