// F259: a root `shell_grep` walked into the arbiter's books because the loop gate judges a
// directory grep ONCE, on the root path it names, and bare-agent's walk did no per-path check.
// bare-agent 0.55.0 adds `canRead`; `gatedShellOptions` wires it to the gate's own `allows()`.
// Real Gate, real `createShellTools`, real files: no stub of the seam. The un-wired control
// proves the instrument can see the leak (a test that cannot fail proves nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { toolAction, gatedShellOptions } from '../src/tools.js';
import { ARBITER_BOOK_STORES, GATE_AUDIT_FILE } from '../src/kinds.js';

const require = createRequire(import.meta.url);
const { Gate } = require('bareguard');
const { createShellTools } = require('bare-agent/tools');

const MARKER = 'F259_MARKER_LINE';

/** a patient tree: one allowed source file and the four arbiter books, all carrying the marker */
async function fixture() {
  const wd = mkdtempSync(join(tmpdir(), 'bareloop-f259-'));
  const put = (/** @type {string} */ rel, /** @type {string} */ text) => {
    mkdirSync(join(wd, rel, '..'), { recursive: true });
    writeFileSync(join(wd, rel), text + '\n');
  };
  put('src/a.js', `// ${MARKER} src`);
  put('.smoke/spine.jsonl', `{"x":"${MARKER} spine"}`);
  put('.smoke/x.jsonl', `{"x":"${MARKER} smoke"}`);
  put('.litectx/index/x', `${MARKER} litectx`);
  put(GATE_AUDIT_FILE, `{"x":"${MARKER} audit"}`);
  const auditPath = join(wd, GATE_AUDIT_FILE);
  // the same fence planrun builds (src/planrun.js): readScope = the tree, deny = audit + book stores
  const gate = new Gate({
    fs: { writeScope: [], readScope: [wd], deny: [auditPath, ...ARBITER_BOOK_STORES.map((s) => join(wd, s))] },
    limits: { maxTurns: 50 },
    audit: { path: auditPath },
    humanChannel: async () => ({ decision: 'terminate' }),
  });
  await gate.init();
  return { wd, gate };
}

/** @param {any} tools @param {string} name */
const tool = (tools, name) => tools.tools.find((/** @type {{name: string}} */ t) => t.name === name);

/** the files named in a grep result (`path:line:text` rows or a {matches} object, whichever this version returns) */
function hitFiles(/** @type {any} */ out, /** @type {string} */ wd) {
  const text = typeof out === 'string' ? out : JSON.stringify(out);
  return [...new Set([...text.matchAll(new RegExp(`${wd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^:"\\\\\\s]+)`, 'g'))].map((m) => m[1]))].sort();
}

test('control: an un-wired createShellTools() root grep reads the books (the leak is visible to this instrument)', async () => {
  const { wd, gate } = await fixture();
  try {
    // the loop gate really does allow the root and deny the direct book read
    assert.equal(await gate.allows(toolAction('shell_grep', { path: wd }, wd)), true);
    assert.equal(await gate.allows(toolAction('shell_read', { path: join(wd, '.smoke/spine.jsonl') }, wd)), false);
    const out = await tool(createShellTools(), 'shell_grep').execute({ pattern: MARKER, path: wd });
    const files = hitFiles(out, wd);
    assert.ok(files.includes('.smoke/spine.jsonl') && files.includes(GATE_AUDIT_FILE), `expected the un-wired walk to leak, got ${JSON.stringify(files)}`);
  } finally { rmSync(wd, { recursive: true, force: true }); }
});

test('F259: with gatedShellOptions a root grep returns only the allowed file, never .smoke, the gate audit or .litectx', async () => {
  const { wd, gate } = await fixture();
  try {
    const out = await tool(createShellTools(gatedShellOptions(gate, wd)), 'shell_grep').execute({ pattern: MARKER, path: wd });
    assert.deepEqual(hitFiles(out, wd), ['src/a.js']);
    const text = JSON.stringify(out);
    for (const leak of ['spine', 'smoke', 'litectx', 'audit']) assert.ok(!text.includes(`${MARKER} ${leak}`), `${leak} line leaked: ${text}`);
  } finally { rmSync(wd, { recursive: true, force: true }); }
});

test('F259: a grep rooted at a denied dir is still refused by the loop gate, and a non-recursive grep is unchanged', async () => {
  const { wd, gate } = await fixture();
  try {
    assert.equal(await gate.allows(toolAction('shell_grep', { path: join(wd, '.smoke') }, wd)), false);
    const out = await tool(createShellTools(gatedShellOptions(gate, wd)), 'shell_grep').execute({ pattern: MARKER, path: wd, recursive: false });
    assert.deepEqual(hitFiles(out, wd), []);
  } finally { rmSync(wd, { recursive: true, force: true }); }
});

test('F259: noFollowSymlinks is on - a symlinked root is refused loudly', async () => {
  const { wd, gate } = await fixture();
  try {
    symlinkSync(join(wd, 'src'), join(wd, 'link'));
    await assert.rejects(
      tool(createShellTools(gatedShellOptions(gate, wd)), 'shell_grep').execute({ pattern: MARKER, path: join(wd, 'link') }),
      /symlink/i,
    );
  } finally { rmSync(wd, { recursive: true, force: true }); }
});

test('F259: both call sites that build shell tools with a gate pass gatedShellOptions', () => {
  for (const f of ['../src/planrun.js', '../src/authorscout.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(src, /createShellTools\(gatedShellOptions\(gate, workdir\)\)/, `${f} builds shell tools with no canRead`);
    assert.doesNotMatch(src, /createShellTools\(\)\.tools/, `${f} still has an un-wired createShellTools()`);
  }
});
