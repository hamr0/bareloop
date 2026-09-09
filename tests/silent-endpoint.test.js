// F152/PRD 30.4 — a live provider endpoint that accepts a request and never
// answers HANGS THE PROCESS FOREVER: an open socket is an active handle, so
// node's event loop never drains and no `beforeExit` backstop can fire
// (measured, scratchpad `silent-probe.mjs`, quoted in FINDINGS F152). The only
// instrument that fires on the ABSENCE of events is a deadline.
//
// Two provider paths carried NO deadline at all: the softgreen judge
// (`runLocate`, src/judged.js) and the authoring scout (`runAuthorScout`,
// src/authorscout.js). Both are now bounded — this file proves it against a
// REAL local HTTP server that accepts and never answers, driven through a REAL
// bare-agent provider (`OpenAIProvider`, `baseUrl` pointed at the local port),
// exercising the REAL production call paths rather than an injected fake.
//
// Deliberately separate from judged.test.js ("NO test in this file makes a
// paid call") and authorscout.test.js's fake-loop convention, for the same
// reason tests/transport.test.js is separate from isTransportFailure's
// pure-function cases: this is live network behaviour, not logic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runLocate, LOCATE_AXES, defaultJudgeLoop } from '../src/judged.js';
import { runAuthorScout, SURVEY_CAUSES } from '../src/authorscout.js';

/** a local HTTP server that accepts every request and never answers it — the
 * exact shape F152's probe measured, in both sub-forms (headers or not, the
 * hang is identical either way since bare-agent's idle timeout is what fires).
 * @returns {Promise<{port: number, close: () => Promise<void>}>} */
async function silentServer() {
  const srv = createServer((req, res) => { req.resume(); /* never res.end() */ });
  srv.unref();
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {any} */ (srv.address());
  return { port, close: () => new Promise((resolve) => srv.close(() => resolve(undefined))) };
}

const BOUND_MS = 1500;
// generous: bare-agent's idle timer plus scheduling slack, well under node:test's
// own per-test timeout below — a real hang would blow BOTH.
const SLACK_MS = BOUND_MS * 2 + 1500;

test(
  'runLocate: a real silent endpoint REJECTS within the bound instead of hanging forever (F152)',
  { timeout: 15_000 },
  async () => {
    const { OpenAIProvider } = await import('bare-agent/providers');
    const srv = await silentServer();
    try {
      const provider = new OpenAIProvider({ apiKey: 'x', model: 'm', baseUrl: `http://127.0.0.1:${srv.port}/v1` });
      // the SAME production seam planrun.js wires the judge through — no policy,
      // toolless, exactly `defaultJudgeLoop({ provider, system })`.
      const loopFactory = (/** @type {{system: string}} */ o) => defaultJudgeLoop({ provider, system: o.system });

      const startedAt = Date.now();
      const r = await runLocate({
        artifactText: 'function f() {}\n',
        card: { items: [{ rule: 'has-doc', text: 'every function needs a doc comment' }] },
        loopFactory,
        callBounds: { timeoutMs: BOUND_MS },
      });
      const elapsedMs = Date.now() - startedAt;

      assert.ok(elapsedMs < SLACK_MS, `must settle near the ${BOUND_MS}ms bound, not hang: took ${elapsedMs}ms`);
      assert.equal(r.ok, false, 'a silent endpoint can never produce usable facts');
      assert.equal(r.red?.axis, LOCATE_AXES.PROVIDER, 'a call that never answers is the call-failed axis, honestly, never a laundered pass');
      assert.equal(r.costUsd, null, 'a call that never resolved has no knowable cost (F6) — never a laundered $0');
    } finally {
      await srv.close();
    }
  },
);

test(
  'runAuthorScout: a real silent endpoint REJECTS within the bound instead of hanging the process (F152)',
  { timeout: 15_000 },
  async () => {
    const { OpenAIProvider } = await import('bare-agent/providers');
    const { Loop } = await import('bare-agent');
    const srv = await silentServer();
    try {
      const provider = new OpenAIProvider({ apiKey: 'x', model: 'm', baseUrl: `http://127.0.0.1:${srv.port}/v1` });
      // no menu, no policy — the scout's own tool grant is irrelevant here: the
      // call never gets far enough to ask for one.
      const createSurveyor = async () => ({ tools: [], policy: undefined, onLlmResult: undefined, cleanup: async () => {} });
      const createLoop = (/** @type {{system: string, provider: any}} */ o) => new Loop({ provider: o.provider, system: o.system });

      const startedAt = Date.now();
      const r = await runAuthorScout({
        workdir: '/w', provider, attempts: 1, callTimeoutMs: BOUND_MS, createSurveyor, createLoop,
      });
      const elapsedMs = Date.now() - startedAt;

      assert.ok(elapsedMs < SLACK_MS, `must settle near the ${BOUND_MS}ms bound, not hang: took ${elapsedMs}ms`);
      assert.equal(r.state, 'ABSENT', 'a silent endpoint never produces a survey');
      assert.equal(r.cause, SURVEY_CAUSES.CALL_FAILED, 'the call failed — the existing typed cause, not an uncaught crash');
    } finally {
      await srv.close();
    }
  },
);
