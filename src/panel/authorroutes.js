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
// `prepared` all refuse. No other route in this file (start/send/
// sign-prepare) can reach the sign path — `signRun` is the only function
// here that ever calls `spawnFn`.

import { randomBytes } from 'node:crypto';
import { spawn as realSpawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { planMatchesClose } from '../rubricstep.js';
import { createSession, validateJobCard, validateReuseCard, lockedFieldChanged, buildReuseSpec, cardFields, startDestinationProblem, STEP_LABELS } from './authorsession.js';
import { parseInputs } from '../jobblock.js';
import { proveInputFiles, looksLikeRubricInput } from '../source.js';
import { validateJob, workflowKey } from '../job.js';
import { checkMonthlyRoom, monthlyRefusalText } from '../monthly.js';
import { ConfigError } from '../config.js';
import { keysForDoor, keysHome } from '../keysfile.js';
import { endpointOf, judgePick, keyValueOf, rowsForHome, tickedLines } from '../providerrows.js';
import { thinkingForLine } from '../thinking.js';
import { apiKeyProblem, checkProviderReachable } from '../providers.js';

/** @returns {string} a fresh per-process token — never persisted, never logged */
export function mintToken() {
  return randomBytes(24).toString('hex');
}

/**
 * The ONE spelling of this panel's own bind address (`host:port`), shared by the Host and Origin checks.
 * @param {number} port
 */
const bindAddress = (port) => `127.0.0.1:${port}`;

/**
 * The ONE Host check: the request names this panel's own bind address. A page on another
 * origin reaching the panel through a rebound DNS name sends that name as Host, so it fails here.
 * @param {import('node:http').IncomingMessage} req
 * @param {{port: number}} o
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
export function checkHostGuard(req, { port }) {
  return req.headers.host === bindAddress(port) ? { ok: true } : { ok: false, reason: 'wrong Host' };
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
  const want = bindAddress(port);
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length > 0) {
    if (origin !== `http://${want}` && origin !== `https://${want}`) return { ok: false, reason: 'wrong Origin' };
  } else if (!checkHostGuard(req, { port }).ok) {
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
 *   jobsDir?: string, fetchImpl?: typeof fetch, home?: string,
 *   schedules?: ReturnType<typeof import('./schedules.js').createScheduleDoor>,
 *   sessionDeps?: Record<string, any>,
 *   startFrom?: {get: (runid: string, o?: {model?: string}) => any, getImport: (id: string, o?: {model?: string}) => any, listJobs?: (o?: {model?: string}) => any[]} }} opts
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

  /** Headless (scheduled) sessions live apart from the person's: neither blocks nor is blocked by the other (T I.5). Not addressable over HTTP. */
  /** @type {Map<string, ReturnType<typeof createSession>>} */
  const headless = new Map();

  const hasLiveSession = () => [...sessions.values()].some((s) => !TERMINAL_PHASES.has(s.state.phase));

  /**
   * THE one session start (T Part 4, C.4.2): prove the Inputs at $0, then create the session — the route's tail, factored so the
   * HTTP route and the schedule starter share ONE function. A scheduled fire is exactly a Reuse the person did not click.
   * `headless` puts the session in its own map and skips the one-live-session rule.
   * @param {any} card the form (fields only)
   * @param {{spec: any, workflowKey: string}|null} reuse
   * @param {import('../jobblock.js').JobInput[]} inputs the parsed Inputs
   * @param {{headless?: boolean, filesJob?: boolean}} [o]
   * @returns {Promise<{ok: true, session: ReturnType<typeof createSession>}|{ok: false, status: number, error: string}>}
   */
  function startSession(card, reuse, inputs, o = {}) {
    return (o.filesJob ? Promise.resolve(/** @type {{ok: true}} */ ({ ok: true })) : proveInputFiles(inputs)).then((proof) => {
      if (!proof.ok) return { ok: /** @type {false} */ (false), status: 400, error: proof.error };
      if (!o.headless && hasLiveSession()) return { ok: /** @type {false} */ (false), status: 409, error: 'an authoring session is already live — one at a time' };
      // the SAME Destination check the session runs, at $0, BEFORE the session (and its folder) exists
      const destProblem = startDestinationProblem(card);
      if (destProblem !== null) return { ok: /** @type {false} */ (false), status: 400, error: destProblem };
      const session = createSession(cardFields(card), {
        env: envNow(), sessionsRoot: opts.sessionsRoot, ...(opts.home !== undefined ? { home: opts.home } : {}), ...(reuse ? { reuse } : {}), ...(opts.sessionDeps ?? {}),
      });
      (o.headless ? headless : sessions).set(session.id, session);
      return { ok: /** @type {true} */ (true), session };
    }).catch((e) => ({ ok: /** @type {false} */ (false), status: 500, error: `could not check the inputs: ${/** @type {Error} */ (e)?.message ?? e}` }));
  }

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
      const rows = rowsForHome(keysHome(opts.home), envNow());
      const pick = judgePick(rows, { provider: q.get('provider'), model: q.get('model') });
      if (!pick.ok) { send(400, { ok: false, error: pick.say }); return true; }
      const choice = pick.choice;
      // the key of the Settings row this line belongs to
      const keyName = choice.envName;
      const raw = keyValueOf(envNow(), keyName);
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
      // every ticked-and-priced line of a row, labelled `<KEY> · <model>`; `thinking` is the server's answer for the "Thinking on" box
      const lines = tickedLines(rowsForHome(keysHome(opts.home), envNow())).map(({ row, line }) => ({
        slot: row.envName, model: line.model, label: `${row.envName} · ${line.model}`, shape: row.provider, endpoint: endpointOf(row.provider, row.baseUrl), thinking: thinkingForLine(row.provider, line.model, row.baseUrl),
      }));
      send(200, { ok: true, lines, say: lines.length === 0 ? 'Tick a model in Settings > Providers.' : '' });
      return true;
    }

    if (pathname === '/api/author/monthly-check') {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const q = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1').searchParams;
      const cap = Number(q.get('cap'));
      if (!Number.isFinite(cap) || cap <= 0) { send(200, { ok: true, refusal: null }); return true; }
      try {
        const room = checkMonthlyRoom({ capUsd: cap, home: opts.home, sessionsRoot: opts.sessionsRoot });
        send(200, { ok: true, refusal: monthlyRefusalText(room), leftUsd: room.leftUsd, atLeast: room.atLeast });
      } catch (e) {
        if (!(e instanceof ConfigError)) throw e;
        send(200, { ok: true, refusal: null, configProblem: e.message });
      }
      return true;
    }

    // ── REUSE WORKFLOW (replaces P5 item 3's Start from this). `GET /api/author/start-from?runid=` (or `?import=`) —
    // the prefill from the SIGNED job, which boxes are locked, the track record. $0, read-only. The route keeps its name.
    if (pathname === '/api/author/start-from') {
      if (!opts.startFrom) { send(404, { ok: false, error: 'not found' }); return true; }
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const sp = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1').searchParams;
      const runid = sp.get('runid') ?? '';
      // `model` = the card's Model box right now: the estimate line counts only runs on that worker
      const asModel = sp.has('model') ? { model: sp.get('model') ?? '', provider: sp.get('provider') ?? '' } : {};
      const pre = sp.has('import') ? opts.startFrom.getImport(sp.get('import') ?? '', asModel) : opts.startFrom.get(runid, asModel);
      if (pre === null) { send(404, { ok: false, error: 'no such run' }); return true; }
      if (!pre.ok) { send(409, pre); return true; }
      // the card of a SCHEDULED job opens with the folder that schedule delivers to (a plain-files job keeps it on the schedule, not in the spec)
      const sched = sp.get('mode') === 'schedule' && opts.schedules ? opts.schedules.readSchedule(pre.origin.job) : null;
      send(200, {
        ok: true, origin: pre.origin, card: typeof sched?.destination === 'string' ? { ...pre.card, destination: sched.destination } : pre.card, from: pre.from, note: pre.note,
        locked: pre.locked, open: pre.open, specHash: pre.specHash, workflowKey: pre.workflowKey, trackRecord: pre.trackRecord,
        line: pre.line, specNamesModel: pre.specNamesModel, specWorker: pre.specWorker,
        // T Part 3: `mode=schedule` also returns the job's current schedule (data only) for the When field's prefill; Part 7 adds the
        // card's own words (`scheduleCard`: now / refusal / editNote / the button table). Edit in chat on a scheduled job gets the
        // fixed edit note to show BEFORE signing (D.7).
        ...(sp.get('mode') === 'schedule' && opts.schedules ? { schedule: opts.schedules.read(pre.origin.job), scheduleCard: opts.schedules.cardFor(pre.origin.job) } : {}),
        ...(sp.get('mode') !== 'schedule' && opts.schedules && pre.origin?.job ? { editNote: opts.schedules.editNoteFor(pre.origin.job) } : {}),
      });
      return true;
    }

    // The Reuse workflow picker's list: one entry per job with a green local run (newest green's runid + the SAME
    // estimate line start-from returns). $0, read-only; `?model=` passes through exactly as start-from's does.
    if (pathname === '/api/author/reuse-jobs') {
      if (!opts.startFrom || !opts.startFrom.listJobs) { send(404, { ok: false, error: 'not found' }); return true; }
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const sp = new URL(/** @type {string} */ (req.url), 'http://127.0.0.1').searchParams;
      const asModel = sp.has('model') ? { model: sp.get('model') ?? '', provider: sp.get('provider') ?? '' } : {};
      send(200, { ok: true, jobs: opts.startFrom.listJobs(asModel) });
      return true;
    }

    // ── T Part 3: the schedule door, two clicks, both $0 (no drafter, no run, no provider call). Click 1 signs and
    // writes nothing; click 2 carries the hash it was shown. `when: null` cancels (never refused). Placed with the
    // other exact matches, before the session regex below.
    if (pathname === '/api/author/schedule-prepare' || pathname === '/api/author/schedule') {
      if (!opts.schedules) { send(404, { ok: false, error: 'not found' }); return true; }
      if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }
      const r = pathname.endsWith('-prepare') ? opts.schedules.prepare(body ?? {}) : opts.schedules.set(body ?? {});
      send(r.status, r.body);
      return true;
    }

    // A refreshed page re-attaches to the one live (non-terminal) session: its id and state (card, messages, steps),
    // or `null`. The server's session map is the only truth; nothing is stored page-side.
    if (pathname === '/api/author/live') {
      if (req.method !== 'GET') { send(405, { ok: false, error: 'GET only' }); return true; }
      const live = [...sessions.values()].find((s) => !TERMINAL_PHASES.has(s.state.phase));
      send(200, { ok: true, sessionId: live ? live.state.id : null, state: live ? live.state : null });
      return true;
    }

    if (pathname === '/api/author/start') {
      if (req.method !== 'POST') { send(405, { ok: false, error: 'POST only' }); return true; }
      if (hasLiveSession()) { send(409, { ok: false, error: 'an authoring session is already live — one at a time' }); return true; }
      const card = body ?? {};
      const rows = rowsForHome(keysHome(opts.home), envNow());
      // Reuse workflow — started from a green run or an imported job: only Source, Destination and the two caps may
      // differ from the signed workflow. The SERVER refuses any other change (the page greys those boxes, but is
      // never trusted); the spec it signs is a copy of the origin's with just those four set. Nothing is drafted.
      /** @type {{spec: any, workflowKey: string}|null} */
      let reuse = null;
      const from = card.startFrom;
      const fromRunid = typeof from === 'string' ? from : (typeof from?.runid === 'string' ? from.runid : null);
      const fromImport = typeof from?.importId === 'string' ? from.importId : null;
      if (fromRunid !== null || fromImport !== null) {
        const pre = opts.startFrom ? (fromImport !== null ? opts.startFrom.getImport(fromImport) : opts.startFrom.get(fromRunid)) : null;
        if (pre === null || pre === undefined) { send(404, { ok: false, error: 'no such run to reuse' }); return true; }
        if (!pre.ok) { send(409, pre); return true; }
        // only a run that earned a real green is a reuse source (hamr 2026-10-08) — the pickers already filter, but a
        // hand-made POST must not sign a reuse of an already-green, red or still-running run. Imports are green by ruling;
        // Edit in chat and Resume only READ start-from (GET) and never post a startFrom, so this gate never touches them.
        if (fromImport === null && pre.outcome !== 'green') {
          send(409, { ok: false, error: pre.outcome === 'green-held' ? 'This run was started by a schedule and is waiting for your Accept. Accept it first, then it can be reused.' : 'only a run that finished green can be reused — this one did not' });
          return true;
        }
        const locked = lockedFieldChanged(card, pre.card);
        if (locked !== null) { send(400, { ok: false, error: `${locked} is locked on a reused workflow — Clear the card to change it` }); return true; }
        const rv = validateReuseCard(card, { rows });
        if (!rv.ok) { send(400, { ok: false, error: rv.error }); return true; }
        const spec = buildReuseSpec(pre.spec, card, rows);
        const jv = validateJob(spec, { shellCapUsd: spec.budgetUsd });
        if (!jv.ok) { send(400, { ok: false, error: `the spec this reuse would sign is not valid (${jv.reds.map((r) => `${r.code} at ${r.path}`).join('; ')})` }); return true; }
        reuse = { spec, workflowKey: pre.workflowKey };
      }
      if (reuse === null) {
        const v = validateJobCard(card, { jobsDir: opts.jobsDir, rows });
        if (!v.ok) { send(400, { ok: false, error: v.error }); return true; }
      }
      // P7: the Inputs are proven at $0 before a session (so before any token): line 1 the repo, lines 2+ tracked files inside it.
      // A miss is a plain 400 naming the line, shown under the card exactly like every other refused start.
      const ip = parseInputs(card.inputs);
      if (!ip.ok) { send(400, { ok: false, error: ip.error }); return true; }
      // Part 1a: a rubric job whose first input is a local FILE has no repo to prove inputs against; the session proves every
      // line itself (`proveRubricInputs`), at $0, before any model call
      const filesJob = reuse === null && card?.checkType === 'rubric' && looksLikeRubricInput(ip.inputs[0].value);
      startSession(card, reuse, ip.inputs, { filesJob }).then((r) => {
        if (!r.ok) { send(r.status, { ok: false, error: r.error }); return; }
        send(200, { ok: true, sessionId: r.session.id, reuse: reuse !== null, state: r.session.state });
      });
      return true;
    }

    const m = /^\/api\/author\/([A-Za-z0-9]+)(\/(send|sign-prepare|sign|check-deps|abandon))?$/.exec(pathname);
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
    if (sub === 'abandon') {
      const r = session.abandon();
      send(r.ok ? 200 : 400, { ...r, state: session.state });
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
      const r = signRun(session, claimedHash, { env: envNow(), spawnFn, bareloopBin, sessionsRoot: opts.sessionsRoot, home: opts.home, ...(opts.schedules ? { schedules: opts.schedules } : {}) });
      send(r.ok ? 200 : 400, r);
      return true;
    }
    send(404, { ok: false, error: 'not found' });
    return true;
  }

  return {
    handle, sessions, headless, startSession, envNow, spawnFn, bareloopBin,
    /** a headless session the starter has removed from disk leaves its map too @param {string} id */
    forgetHeadless: (id) => { headless.delete(id); },
  };
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
export function panelMoney2(n) {
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
 * @param {{env: any, spawnFn: typeof realSpawn, bareloopBin: string, sessionsRoot?: string, home?: string, schedules?: {clearIfEdited: (job: string, key: string) => boolean}, reviewDoor?: boolean, onSpawnError?: (e: Error) => void, onExit?: (code: number|null) => void}} o
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
    const refusal = monthlyRefusalText(checkMonthlyRoom({ capUsd: Number(spec.budgetUsd), home: o.home, sessionsRoot: o.sessionsRoot }));
    if (refusal !== null) return { ok: false, error: refusal };
  } catch (e) {
    if (e instanceof ConfigError) return { ok: false, error: `${e.message} — refusing rather than guess the monthly limit` };
    return { ok: false, error: 'could not read the signed spec to check the monthly limit — refusing to sign' };
  }
  // PART 1a, the sign-vs-run invariant: the checks on the plan card the person saw are exactly the checks of the close about to be
  // signed, per line. A mismatch is refused in plain words and nothing is spawned.
  if (session.state.finalPlan) {
    try {
      const spec = JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
      const m = planMatchesClose(session.state.finalPlan.checkItems, spec.closeDecl);
      if (!m.ok) return { ok: false, error: m.error };
    } catch { return { ok: false, error: 'could not read the signed spec to compare it with the plan you were shown — refusing to sign' }; }
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
    // T (F.1): a scheduled run opens the review door even when deterministic, so its green waits for the person's Accept
    ...(o.reviewDoor === true ? ['--review-door'] : []),
    ...(draftSpentUsd !== null ? ['--draft-spent-usd', String(draftSpentUsd), ...(draftIncomplete ? ['--draft-spend-incomplete'] : [])] : []),
  ];
  /** @type {number|null} */
  let logFd = null;
  try { logFd = openSync(logFile, 'a'); } catch { logFd = null; }
  const child = o.spawnFn('setsid', args, {
    detached: true, stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'], env: o.env,
  });
  if (typeof child?.unref === 'function') child.unref();
  if (o.onSpawnError && typeof child?.once === 'function') child.once('error', o.onSpawnError);
  if (o.onExit && typeof child?.once === 'function') child.once('exit', o.onExit);
  // T (D.7): signing an EDIT of a scheduled job clears its schedule back to by hand. A Reuse or a hand run of the same
  // workflow has the same workflow key and clears nothing. After the spawn: a refusal above never reaches here.
  if (o.schedules) {
    try {
      const signed = JSON.parse(readFileSync(session.state.resolvedSpecPath, 'utf8'));
      if (typeof signed?.job === 'string') o.schedules.clearIfEdited(signed.job, workflowKey(signed));
    } catch { /* an unreadable spec was already refused above; the schedule stays */ }
  }
  session.state.phase = 'signed';
  // hamr 2026-10-05: the sign shows as the last step of the one progress list, never as a thread bubble
  // hamr 2026-10-05 (option A): the drafting-spend line is that step's detail — nothing when there was no drafting spend (a Reuse)
  const draftLine = draftSpentUsd !== null
    ? `drafting spent ${draftIncomplete ? 'at least ' : ''}${panelMoney2(draftSpentUsd)} (folds out of the run's own cap)`
    : '';
  if (Array.isArray(session.state.steps)) session.state.steps.push({ id: 'signed', label: STEP_LABELS.signed, status: 'done', detail: draftLine });
  return { ok: true, job: session.state.resolvedSpecPath };
}
