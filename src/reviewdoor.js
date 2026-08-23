// THE REVIEW DOOR — the signer's three doors at the END of a run (softgreen
// module 8; PRD v1.71 §3, design record 2026-08-17 §3 + the 2026-08-18 addenda).
//
// THE LAW, hamr verbatim: *"it's important not to change the loop self verdict."*
// The close mints the verdict and the ledger records it before anything here runs.
// What a door records is a DISPOSITION — what the person wants done about a
// verdict, never what the verdict is. Nothing in this file returns, writes or
// implies an outcome, and the run it answers has already ended.
//
// WHY THIS IS NOT `runPlan`'s job. A door opens after the run is over: a person
// may answer minutes or days later, from a different process, and the answer
// cannot ride the run's own return path (module 6 named this when it left
// `applyDoorDecision` exported and unwired). So the door is OPENED by the run
// (one record on its spine, `src/planrun.js`) and ANSWERED here, off that record.
//
// THE THREE DOORS, and what each one costs:
//   accept — the close's MECHANICAL stages re-run against the tree as it stands
//            (hamr's N4 ruling: an accept is not a rubber stamp), and only then is
//            the disposition recorded and — for a held judged green — the learning
//            credit released. A red at re-run means the tree changed under the
//            signer: the accept is REFUSED with the stage named. Never the judged
//            or human stages: a machine may re-prove a machine's reading, and a
//            judgment is not re-run behind the person who rendered it.
//   rerun  — a fresh engagement (§3.4). The person's words ARE the gap; empty
//            words are refused at the same seam every other door is refused at.
//            It re-proves nothing here — the NEW run's close is what judges.
//   pause  — not now. Nothing runs, nothing is spent, and the same three doors are
//            open the next time somebody looks. An unanswered door expires under
//            the existing 60-day checkpoint TTL, and that expiry IS what `cancel`
//            used to do (doors addendum, 2026-08-18).
//
// The registry half is module 6's (`applyDoorDecision`), called from exactly one
// place here so a disposition cannot be recorded twice or by two spellings.

import { REVIEW_DOOR, HUMAN_DECISIONS, mechanicalStages, normalizeHumanRuling } from './kinds.js';
import { closeStagesOf } from './plan.js';
import { isDeclaredClose, runDeclaredStages, HITL_DECISION_RED } from './declaredclose.js';
import { runStages } from './ralph.js';
import { redactSecrets } from './validate.js';
import { applyDoorDecision, PAUSE_TTL_MS } from './reuse.js';

/** the door's own record, off the run's spine — the LAST one, because a run that
 * ends at a door writes exactly one and a reader that guesses which is which is a
 * reader that will one day answer the wrong question.
 * @param {any[]} events the run's spine, parsed
 * @returns {any|null} */
export function doorRecordOf(events) {
  if (!Array.isArray(events)) return null;
  return events.findLast?.((e) => e?.type === REVIEW_DOOR) ?? null;
}

/**
 * IS THE DOOR STILL OPEN? The same 60-day TTL a hitl checkpoint keeps
 * (`PAUSE_TTL_MS`) and deliberately the same NUMBER — the door replaced `cancel`
 * precisely because an unanswered door and an unresumed pause are one state, and
 * two TTLs for one state is how they come to disagree.
 *
 * An UNREADABLE stamp refuses too: unknown is not young (F6). Reading the age is
 * not the same as deciding on it, so this states both the answer and the arithmetic.
 * @param {any} door the door record
 * @param {{now?: () => number, ttlMs?: number}} [opts]
 * @returns {{ok: boolean, ageMs: number|null, ttlMs: number, detail: string}}
 */
export function doorAgeGate(door, { now = Date.now, ttlMs = PAUSE_TTL_MS } = {}) {
  const days = (/** @type {number} */ ms) => (ms / 86_400_000).toFixed(1);
  const at = typeof door?.ts === 'string' ? Date.parse(door.ts) : NaN;
  if (!Number.isFinite(at)) {
    return { ok: false, ageMs: null, ttlMs, detail: 'the door carries no readable timestamp, and an unknown age is not a young one — the decision cannot be honoured on a record nobody can date' };
  }
  const ageMs = now() - at;
  if (ageMs > ttlMs) {
    return { ok: false, ageMs, ttlMs, detail: `the door was opened ${days(ageMs)} days ago and a door keeps for ${days(ttlMs)} days — it has expired on its own, which is exactly what nobody having to decide looks like` };
  }
  return { ok: true, ageMs, ttlMs, detail: `${days(ageMs)} days old, of ${days(ttlMs)}` };
}

/** one red, one spelling @param {string} code @param {string} detail @param {string} [path] */
const red = (code, detail, path = 'decision') => [{ code, path, detail }];

/**
 * Answer a run's review door.
 *
 * Never throws and never conjures: a malformed decision, a run that opened no
 * door, an expired one, a tree that moved and a registry that is not there all
 * come back as named reds. The loop's verdict is untouched on every path — this
 * function has no way to write one.
 *
 * @param {object} opts
 * @param {any} opts.job the SIGNED spec the run was judged by (its close is what an accept re-proves)
 * @param {string} opts.workdir the patient, as it stands NOW
 * @param {any[]} opts.events the run's own spine, parsed
 * @param {string} opts.decision one of the three doors
 * @param {string|null} [opts.text] the rerun's words — the gap, and refused when empty
 * @param {number} [opts.closeTimeoutMs] the per-stage bound for the accept's re-run
 * @param {string|null} [opts.registryDir] the workflow registry, when the runner keeps one
 * @param {string|null} [opts.name] the workflow this run wrote its row against
 * @param {string|null} [opts.runid] the RUN's id, exactly as the bridge row records it
 * @param {string|null} [opts.at] when the person answered
 * @param {() => number} [opts.now] the clock, injected for the TTL
 * @param {number} [opts.ttlMs]
 * @param {((type: string, data: any) => any)|null} [opts.emit] the run's spine, to record the disposition on
 * @returns {Promise<{ok: boolean, decision: string|null, next: string|null, released: boolean,
 *   doorRecorded: boolean, reds: any[], mechanical: any, door: any, text: string|null,
 *   options: string[], ttlMs: number, note: string|null}>}
 */
export async function answerReviewDoor({
  job, workdir, events, decision, text = null, closeTimeoutMs,
  registryDir = null, name = null, runid = null, at = null,
  now = Date.now, ttlMs = PAUSE_TTL_MS, emit = null,
}) {
  /** @type {any} */
  const out = {
    ok: false, decision: null, next: null, released: false, doorRecorded: false,
    reds: [], mechanical: null, door: null, text: null, options: [...HUMAN_DECISIONS], ttlMs, note: null,
  };

  // ── 1. THE OPERATOR'S OWN INPUT, at the LIBRARY's one seam. A fourth door and
  // an empty rerun are refused by `normalizeHumanRuling` — the same rulebook the
  // close's human stage is answered through, so a surface cannot admit what a run
  // refuses.
  const norm = normalizeHumanRuling({ decision, ...(text === null ? {} : { text }) });
  if (!norm.ok) {
    out.reds = red(HITL_DECISION_RED, /** @type {string} */ (norm.why));
    return out;
  }
  const ruling = /** @type {{decision: string, text: string|null}} */ (norm.ruling);
  out.decision = ruling.decision;
  out.text = ruling.text;

  // ── 2. IS THERE A DOOR? A run that opened none has nothing to answer, and
  // conjuring one would let a decision be recorded against a verdict nobody was
  // ever shown the evidence for.
  const door = doorRecordOf(events);
  if (door === null) {
    out.reds = red('no-door', 'this run opened no review door — its verdict stands on its own, and there is nothing here to dispose of (a green-class run opens one only when the runner asks: --review-door)', 'events');
    return out;
  }
  out.door = door;

  // ── 3. IS IT STILL OPEN? The TTL is the cancel case: nobody has to decide, and
  // a door nobody answered simply expires.
  const age = doorAgeGate(door, { now, ttlMs });
  if (!age.ok) {
    out.reds = red('door-expired', age.detail, 'door.ts');
    return out;
  }

  // ── 4. ACCEPT RE-PROVES THE TREE. Everything above is $0 and deterministic;
  // this is the only branch that runs anything, and it runs the close's own
  // mechanical stages — never a second, weaker spelling of "is it still green".
  if (out.decision === 'accept') {
    const proof = await proveMechanically({ job, workdir, events, closeTimeoutMs });
    out.mechanical = proof.reading;
    if (!proof.ok) {
      out.reds = red('door-accept-red', proof.detail, proof.reading.stage ? `stage.${proof.reading.stage}` : 'close');
      // NOTHING IS RECORDED on a refusal. A disposition the machine would not
      // honour is not a disposition the record should carry: the person's answer
      // was about a tree that no longer exists.
      if (emit) emit('door-decision', { decision: 'accept', honoured: false, stage: proof.reading.stage ?? null, reason: 'the tree moved under the signer' });
      return out;
    }
  }

  // ── 5. THE DISPOSITION IS RECORDED, and only accept releases (module 6's
  // `recordDoor`, reached through its one on-disk seam). Every door is a datum:
  // *"the signer's accepts double as the judge's ongoing report card"* (v1.71 §3),
  // and a rerun over a judged green is exactly as informative as an accept.
  if (registryDir && name && runid) {
    // ALREADY-GREEN MINTS NOTHING, from the other side: a run that changed
    // nothing wrote no row of its own, so there is nothing to record a door on and
    // nothing to release. Stated rather than surfaced as a `no-row-for-run` red —
    // the rule is the design, not a failure.
    if (door.outcome === 'already-green') {
      out.note = 'already-green: the run minted no row of its own, so the door records nothing and releases nothing — accept confirms a verdict, it never mints one';
    } else {
      const r = applyDoorDecision({ registryDir, name, runid, decision: out.decision, at });
      if (!r.ok) {
        out.reds = r.reds;
        return out;
      }
      out.released = r.released;
      out.doorRecorded = true;
    }
  }

  out.ok = true;
  out.next = out.decision === 'accept' ? 'accepted' : (out.decision === 'rerun' ? 'rerun' : 'paused');
  if (emit) {
    emit('door-decision', {
      decision: out.decision,
      honoured: true,
      ...(out.text === null ? {} : { text: redactSecrets(out.text) }),
      released: out.released,
      recorded: out.doorRecorded,
      meaning: 'a disposition — the verdict this run minted is untouched, and nothing here can change it',
    });
  }
  return out;
}

/**
 * The accept's re-proof: the close's MECHANICAL stages, run against the tree as it
 * stands now, through the SAME executors the run itself was judged by.
 *
 * The declared path measures against the run's OWN seed (`close-decl.seedRef` off
 * the spine), never a fresh one: re-basing the baseline onto today's HEAD would
 * compare the tree to itself and turn "nothing has changed since the run" into a
 * green for a `files-changed` stage that means the opposite. A run whose seed is
 * not on its spine is refused rather than guessed at.
 * @param {{job: any, workdir: string, events: any[], closeTimeoutMs?: number}} o
 */
async function proveMechanically({ job, workdir, events, closeTimeoutMs }) {
  const stages = mechanicalStages(closeStagesOf(job) ?? []);
  if (!stages.length) {
    // Honest, and named: a close with no mechanical stage has nothing a machine
    // can re-prove, so the accept rests on the person alone. Never a silent pass
    // dressed as a re-run.
    return { ok: true, detail: '', reading: { ran: 0, verdict: null, stage: null, stages: [], note: 'this close has no mechanical stage — there is nothing a machine can re-prove, so the accept rests on the person' } };
  }
  /** @type {any} */
  let v;
  if (isDeclaredClose(job)) {
    const seedRef = events.findLast?.((e) => e?.type === 'close-decl' && typeof e.seedRef === 'string')?.seedRef ?? null;
    if (!seedRef) {
      return { ok: false, detail: 'this run left no seed on its spine (`close-decl.seedRef`), and a declared close measures against a seed — re-proving against a guessed baseline would grade a tree nobody chose', reading: { ran: 0, verdict: null, stage: null, stages: [] } };
    }
    v = await runDeclaredStages(stages, redactSecrets, { timeoutMs: closeTimeoutMs, cwd: workdir, seedRef });
  } else {
    v = await runStages(stages, redactSecrets, { timeoutMs: closeTimeoutMs, cwd: workdir });
  }
  const reading = {
    ran: stages.length,
    verdict: v.verdict ?? null,
    stage: v.stage ?? null,
    stages: v.stages ?? [],
    ...(v.gap ? { gap: v.gap } : {}),
  };
  if (v.verdict === 'satisfied') return { ok: true, detail: '', reading };
  return {
    ok: false,
    reading,
    detail: `the close's mechanical stage "${v.stage ?? 'unknown'}" no longer passes on this tree (${v.verdict}) — `
      + 'the tree moved under you, so the accept is refused rather than applied to work you did not read. '
      + `${redactSecrets(String(v.gap ?? v.detail ?? '')).split('\n').slice(0, 3).join(' ')}`.trim(),
  };
}
