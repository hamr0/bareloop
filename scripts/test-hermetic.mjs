#!/usr/bin/env node
// F136 (2026-09-07): three releases in a row went red only on CI because a local test
// leaned on this machine — v0.19.0 hardcoded a local path, v0.22.0's F136 leaned on
// hamr's own global git identity (`user.name`/`user.email`) to paper over a fixture's
// unset-env `git commit`, so it stayed green here and red on the CI runner, which has
// no such config. This runner closes that class AT THE SOURCE (the local run, not the
// test): `npm test` now runs `node --test` inside an environment that is blind to this
// machine's identity and config the same way CI's ubuntu-latest runner already is, so a
// test that (re-)leans on either fails HERE first, before it ever reaches a PR.
//
// What it neutralises: HOME (redirected to a fresh empty `mkdtemp` dir, so no
// `~/.gitconfig`, `~/.npmrc`, etc. is visible) and git's own identity/config resolution
// (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`,
// plus deleting any inherited `GIT_AUTHOR_*`/`GIT_COMMITTER_*`/`EMAIL` so nothing already
// in this shell's env quietly supplies an identity either).
//
// What it deliberately does NOT do: this is not a sandbox. PATH, `node_modules`, network
// access, and external binaries the suite shells out to (e.g. ripgrep for litectx's
// `impact()`) are all left exactly as inherited — only the machine-identity surface that
// has twice caused a CI-only red is closed.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpHome = mkdtempSync(join(tmpdir(), 'bareloop-hermetic-home-'));

const env = { ...process.env, HOME: tmpHome };
env.GIT_CONFIG_GLOBAL = '/dev/null';
env.GIT_CONFIG_SYSTEM = '/dev/null';
env.GIT_CONFIG_NOSYSTEM = '1';
for (const key of Object.keys(env)) {
  if (key.startsWith('GIT_AUTHOR_') || key.startsWith('GIT_COMMITTER_') || key === 'EMAIL') {
    delete env[key];
  }
}

const child = spawn(process.execPath, ['--test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('close', (code, signal) => {
  try {
    rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    // best-effort cleanup only — never mask the real test outcome on a cleanup failure
  }
  process.exitCode = signal ? 1 : (code ?? 1);
});

child.on('error', (err) => {
  try {
    rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    // best-effort cleanup only
  }
  console.error(err);
  process.exitCode = 1;
});
