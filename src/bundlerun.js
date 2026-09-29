// One runner (`feat/one-runner`) — `bareloop run <bundle> --repo <path>` is a thin DOOR to
// the same engine `bareloop run-u` drives (`src/userrun.js`), not a second runner. This
// module does only what is bundle-specific and $0: the bundle's own integrity/deps/
// envelope/blessing checks, the fresh git worktree (planned here, CREATED by the engine's
// `prepareTree` hook once its own refusals — keys, monthly limit — have passed), the
// tightened spec and its hash, and, after the engine returns, the bundle's history row,
// its first-green blessing and the merge hints. Providers, keys, judge, monthly limit,
// watchdog, readout and run list are the engine's — nothing here talks to a model.
//
// The signature the engine checks is `approve === jobSpecHash(spec)`. A bundle's human
// signature is its `bundleHash` (checked here, step 3); the executed spec is the tightened,
// `$BARELOOP_BUNDLE`-resolved one, so the door hands the engine the hash of exactly that
// spec — the equality stays a real check (the spec the engine sees is the spec hashed).
// `bundleHash` never changes when the runner tightens; `history.jsonl` records both hashes.

import { hostname } from 'node:os';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  readBundle, resolveBundleSpec, checkEnvelope, bless, verifyBlessing, appendHistory, checkBundleDeps,
} from './bundle.js';
import { jobSpecHash } from './job.js';
import { parseJsonl } from './replayio.js';
import { startRun, resumeRun } from './userrun.js';

/**
 * `bareloop run <bundleDir> --repo <path> [--budget N] [--wall MIN] [--approve <bundleHash>]`
 * `bareloop run <bundleDir> --resume <runid> [--repo <path>] [--budget N] [--wall MIN] [--approve <bundleHash>]`
 * @param {string[]} args
 * @param {{
 *   out: (s: string) => void, err: (s: string) => void, cwd: string,
 *   env: Record<string,string|undefined>, now: () => number, deps: any, keysHome?: string,
 *   parseFlags: (a: string[]) => { positional: string[], flags: Record<string, string|true> },
 *   printReds: (reds: import('./bundle.js').Red[], err: (s: string) => void) => void,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function bundleMain(args, {
  out, err, cwd, env, now, deps, keysHome, parseFlags, printReds,
}) {
  const { positional, flags } = parseFlags(args);
  const bundleDirArg = positional[0];
  const repoArg = typeof flags.repo === 'string' ? flags.repo : undefined;
  const resumeArg = typeof flags.resume === 'string' ? flags.resume : undefined;
  if (flags.resume === true || (!bundleDirArg) || (resumeArg === undefined && !repoArg)) {
    err('usage: bareloop run <bundleDir> --repo <path> [--budget N] [--wall MIN] [--approve <bundleHash>]\n'
      + '       bareloop run <bundleDir> --resume <runid> [--repo <path>] [--budget N] [--wall MIN] [--approve <bundleHash>]');
    return 1;
  }
  const bundleDir = resolve(cwd, bundleDirArg);

  // 1. readBundle — this must complete, clean, before anything else touches the bundle or
  // the repo. Any red (incl. bundle-tampered) stops here.
  const bundle = readBundle(bundleDir);
  if (!bundle.ok) { printReds(bundle.reds, err); return 1; }

  // 1b. F128 — the bundle's OWN node_modules must carry `bareloop` before anything else
  // runs. Left unchecked, the close crashes deep inside runJob's close-first precheck with
  // a bare ERR_MODULE_NOT_FOUND, reported as an unhelpful generic close-red with no cure.
  const depsCheck = checkBundleDeps(bundleDir);
  if (!depsCheck.ok) { printReds(depsCheck.reds, err); return 1; }

  // 2. checkEnvelope — tighten-only, wall given in minutes -> ms.
  /** @type {{ budgetUsd?: number, maxWallMs?: number }} */
  const envelope = {};
  if (flags.budget !== undefined) {
    const n = Number(flags.budget);
    if (!Number.isFinite(n)) { err(`--budget must be a number, got ${JSON.stringify(flags.budget)}`); return 1; }
    envelope.budgetUsd = n;
  }
  if (flags.wall !== undefined) {
    const n = Number(flags.wall);
    if (!Number.isFinite(n)) { err(`--wall must be a number of minutes, got ${JSON.stringify(flags.wall)}`); return 1; }
    envelope.maxWallMs = n * 60_000;
  }
  const envCheck = checkEnvelope(bundle.spec, envelope);
  if (!envCheck.ok) { printReds(envCheck.reds, err); return 1; }

  // 3. blessing — BEFORE any key is read (the engine reads the key last).
  const { manifest } = bundle;
  if (!bundle.blessing) {
    // The runid that ACTUALLY minted this bundle's own signed spec — the bridge VERSION
    // (base or shape fork; both ship into bridges/) whose recorded specHash equals the
    // resolved bundle spec's jobSpecHash. NOT the bridge's first history row: a job can be
    // re-exported/rebased many times, and only the version at THIS exact hash proves
    // anything for THIS bundle.
    const { approveHash: mintMatchHash } = resolveBundleSpec(bundle, bundleDir);
    let mintRunid = null;
    for (const b of bundle.bridges) {
      const versions = Array.isArray(b.versions) ? b.versions : [];
      const v = versions.find((/** @type {any} */ ver) => ver.specHash === mintMatchHash);
      if (v) { mintRunid = v.runid; break; }
    }
    // the bundle's own README (the operator questions) belongs on this first-run screen:
    // the engine, not this door, now refuses a missing key.
    let readme = null;
    try { readme = readFileSync(join(bundleDir, 'README.md'), 'utf8'); } catch { /* the hash alone */ }
    if (readme) out(readme);
    out('first run — this bundle has never been blessed on this machine.');
    out(mintRunid ? `minting run: ${mintRunid} (spine not bundled in v1)` : 'no version at this hash');
    out(`bundleHash: ${manifest.bundleHash}`);
    if (flags.approve !== manifest.bundleHash) {
      err(`--approve ${manifest.bundleHash} is required for the first run of an unblessed bundle`);
      return 1;
    }
  } else {
    const vb = verifyBlessing(bundle);
    if (!vb.ok) { printReds(vb.reds, err); return 1; }
    if (flags.approve) out('already blessed, --approve ignored');
  }

  // 4. the tree — refuse a non-repo, a repo with no commit, or a collision; ALWAYS fresh,
  // never reused (a reused worktree reads last run's edits as "already-green" — the
  // negative POC's exact finding). Only PLANNED here: the engine creates it (prepareTree)
  // after its own $0 refusals, so a refusal leaves no worktree behind. A RESUME is the one
  // exception: it re-enters the SAME worktree its halted run left (recorded in that run's
  // `run.json`), and a gone tree is a stop, never a silent fresh start.
  const runid = now().toString(36);
  /** @type {string} */
  let repo;
  /** @type {string} */
  let seed;
  /** @type {string} */
  let worktree;
  /** @type {string|null} */
  let deadSpine = null;
  if (resumeArg !== undefined) {
    if (!/^[a-z0-9]+$/.test(resumeArg)) { err(`--resume ${JSON.stringify(resumeArg)} is not a run id of this bundle`); return 1; }
    const deadRunJson = join(bundleDir, 'runs', resumeArg, 'run.json');
    /** @type {any} */
    let rec;
    try { rec = JSON.parse(readFileSync(deadRunJson, 'utf8')); } catch {
      err(`--resume ${resumeArg}: no readable ${deadRunJson} — not a run of this bundle (or one that never started)`);
      return 1;
    }
    if (typeof rec?.worktree !== 'string' || typeof rec?.seed !== 'string' || typeof rec?.repo !== 'string') {
      err(`--resume ${resumeArg}: ${deadRunJson} does not record a worktree, seed and repo`);
      return 1;
    }
    if (repoArg !== undefined && resolve(cwd, repoArg) !== rec.repo) {
      err(`--repo ${repoArg} is not the repo run ${resumeArg} used (${rec.repo}) — a resume re-enters that run's own worktree`);
      return 1;
    }
    if (!existsSync(rec.worktree)) {
      err(`--resume ${resumeArg}: its worktree ${rec.worktree} is gone — a resume needs the tree the halted run left`);
      return 1;
    }
    repo = rec.repo;
    seed = rec.seed;
    worktree = rec.worktree;
    deadSpine = join(bundleDir, 'runs', resumeArg, 'spine.jsonl');
  } else {
    repo = resolve(cwd, /** @type {string} */ (repoArg));
    try {
      seed = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch (e) {
      err(`--repo ${repoArg} must be a git repository with at least one commit: ${/** @type {Error} */ (e).message}`);
      return 1;
    }
    worktree = join(repo, '.bareloop', 'wt', runid);
    if (existsSync(worktree)) { err(`worktree already exists: ${worktree}`); return 1; }
  }

  // 5. resolve (in-memory $BARELOOP_BUNDLE substitution) + tighten. The envelope tightens
  // the ACTUAL spec that runs (budgetUsd/maxWallMs have no separate override — the library
  // reads them off the spec itself), so the hash is computed AFTER tightening: the door
  // mints its own approval over the exact spec it hands the engine, never over the
  // untightened one. The bundleHash a human approved never changes.
  const runSpec = resolveBundleSpec(bundle, bundleDir).spec;
  if (envelope.budgetUsd !== undefined) runSpec.budgetUsd = envelope.budgetUsd;
  if (envelope.maxWallMs !== undefined) runSpec.maxWallMs = envelope.maxWallMs;
  const approveHash = jobSpecHash(runSpec);

  const runDir = join(bundleDir, 'runs', runid);
  const spineFile = join(runDir, 'spine.jsonl');
  // `run.json` is written by EVERY leg (a resume leg's points at the SAME worktree/seed): it is
  // the bundle-local, always-present record of where the tree is — history.jsonl is written only
  // at job-end (a killed run has none) and the run list is machine-global.
  const prepareTree = () => {
    if (deadSpine === null) {
      mkdirSync(dirname(worktree), { recursive: true });
      try {
        execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', worktree, 'HEAD'], { encoding: 'utf8' });
      } catch (e) {
        throw new Error(`git worktree add failed: ${/** @type {Error} */ (e).message}`);
      }
    }
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'run.json'), `${JSON.stringify({
      runid, worktree, seed, repo, at: new Date(now()).toISOString(), ...(resumeArg === undefined ? {} : { resumedFrom: resumeArg }),
    }, null, 2)}\n`);
  };

  // 6. the engine. `deps` passes through exactly as `bareloop run-u` passes it, so every
  // test seam (provider/providerFor/judgeProvider/runlistHome/keysHome) is the same one.
  let engineCode;
  try {
    /** @type {import('./userrun.js').RunOpts} */
    const opts = {
      workdir: worktree,
      seed,
      approve: approveHash,
      deps: { ...deps, env, out, err, ...(keysHome === undefined ? {} : { keysHome }) },
      bundle: {
        runid,
        runDir,
        invoke: `bareloop run ${bundleDirArg} --repo ${repo}`,
        printApprove: manifest.bundleHash,
        prepareTree,
      },
    };
    engineCode = deadSpine === null ? await startRun(runSpec, opts) : await resumeRun(deadSpine, { ...opts, spec: runSpec });
  } catch (e) {
    err(`${/** @type {Error} */ (e).message}`);
    return 1;
  }

  // 7. history + (on a first green) the blessing — off THIS run's own spine, tolerant of
  // a torn line. No job-end (a $0 refusal, a crash) means no history row, as ever.
  const events = existsSync(spineFile) ? parseJsonl(spineFile).records : [];
  const je = events.findLast((/** @type {any} */ e) => e.type === 'job-end');
  if (!je) return engineCode;
  const outcome = je.outcome;
  const spentUsd = je.spentUsd ?? null;
  const spendComplete = je.spendComplete ?? null;
  let branch = null;
  try { branch = execFileSync('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* leave null — reported honestly below */ }
  appendHistory(bundleDir, {
    runid,
    at: new Date(now()).toISOString(),
    outcome,
    spentUsd,
    spendComplete,
    budgetUsd: runSpec.budgetUsd,
    maxWallMs: runSpec.maxWallMs ?? null,
    worktree,
    branch,
    bundleHash: manifest.bundleHash,
    approveHash,
    ...(resumeArg === undefined ? {} : { resumedFrom: resumeArg }),
  });
  if (outcome === 'green' && !bundle.blessing) {
    bless(bundleDir, {
      bundleHash: manifest.bundleHash, blessedAt: new Date(now()).toISOString(), runid, outcome, host: hostname(),
    });
  }

  // 8. the merge hints (the engine printed the outcome/spend readout).
  out(`branch    ${branch ?? 'UNKNOWN (could not read the worktree branch)'}`);
  out(`worktree  ${worktree}`);
  if (branch) out(`merge     git merge ${branch}   (merge stays human — this CLI never merges)`);
  out(`the worktree is kept until you remove it: git worktree remove ${worktree}`);
  // exit 0 ONLY for a real green — every other outcome exits 1 so a caller scripting
  // `bareloop run` off its exit code cannot mistake a red for a success. The engine's own
  // 2 (refusal) / 3 (spine leak) are preserved.
  return engineCode || (outcome === 'green' || outcome === 'already-green' ? 0 : 1);
}
