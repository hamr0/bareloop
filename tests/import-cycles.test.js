// F403: src/ has no static-import cycle at all (docs/product/ITEM33-BUILD.md addendum 2026-11-26). Same finder as tests/import-cycle-replay.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function importGraph(files) {
  const g = new Map();
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    const deps = new Set();
    for (const m of t.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
      deps.add(path.resolve(path.dirname(f), m[1] ?? m[2]));
    }
    g.set(f, [...deps]);
  }
  return g;
}

function cyclesOf(g) {
  const cycles = [];
  const state = new Map();
  const stack = [];
  const dfs = (n) => {
    state.set(n, 1);
    stack.push(n);
    for (const d of g.get(n) ?? []) {
      if (!g.has(d)) continue;
      if (state.get(d) === 1) cycles.push(stack.slice(stack.indexOf(d)).map((x) => path.relative(SRC, x)));
      else if (!state.get(d)) dfs(d);
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const f of g.keys()) if (!state.get(f)) dfs(f);
  return cycles;
}

test('the cycle finder can see a cycle (a two-file cycle in a made-up graph)', () => {
  const g = new Map([[path.join(SRC, 'a.js'), [path.join(SRC, 'b.js')]], [path.join(SRC, 'b.js'), [path.join(SRC, 'a.js')]]]);
  assert.equal(cyclesOf(g).length, 1);
});

test('src/ holds no static-import cycle', () => {
  const found = cyclesOf(importGraph(jsFiles(SRC))).map((c) => c.join(' -> '));
  assert.deepEqual(found, []);
});
