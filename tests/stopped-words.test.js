// hamr 2026-11-24 (walk mwuxqx4f): "(the check that was running was killed)" rides the stopped escalation ONLY when the Stop really killed a running check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ralph } from '../src/ralph.js';

/** @param {any} verdict @returns {Promise<string>} the stopped escalation's detail */
async function detailFor(verdict) {
  /** @type {any[]} */
  const events = [];
  await ralph({ middle: async () => {}, judge: async () => verdict, capRuns: 1, emit: (/** @type {string} */ type, /** @type {any} */ e) => events.push({ type, ...e }) });
  return events.find((e) => e.type === 'escalation' && e.category === 'stopped').detail;
}

test('a Stop that killed a running check says so', async () => {
  assert.equal(await detailFor({ verdict: 'stopped', killed: true }), "stopped at the person's request (the check that was running was killed)");
});

test('a Stop that landed while no check was running does not claim a kill', async () => {
  assert.equal(await detailFor({ verdict: 'stopped', killed: false }), "stopped at the person's request");
  assert.equal(await detailFor({ verdict: 'stopped' }), "stopped at the person's request");
});
