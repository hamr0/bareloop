// TESTGEN mutant generator — job #4, TESTGEN-PREREG.md §5 (frozen rules).
// Mechanical, seeded (42): enumerate single-line mutation sites in aurora's
// orchestrator.py, stratify by line-number decile, sample K=40, verify each
// sampled mutant leaves the module importable (an import-breaking mutant is
// trivially killed by everything — no signal — and is resampled from its
// decile, a rule frozen in the prereg BEFORE generation ran).
//
// Token-free, $0. Output: docs/02-experiments/testgen-mutants.json — the
// frozen set, committed before any API call. Deterministic: same file, same
// seed → same set (no Date.now/Math.random anywhere in selection).
//
//   node scripts/gen-mutants-testgen.mjs          # writes the set, prints the table
//
// Honest limits, stated: the docstring/comment/string scanner is a line-level
// heuristic, not a parser. Its failure mode is an unkillable (equivalent)
// mutant wasting a slot — absorbed by the prereg's 90%-ceiling threshold
// formula, and the printed table below is the eyeball check.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const WORKDIR = '/home/hamr/PycharmProjects/bareloop-patients/aurora-soar';
const TARGET_REL = 'src/aurora_soar/orchestrator.py'; // the import-resolving copy
const MIRROR_REL = 'packages/soar/src/aurora_soar/orchestrator.py'; // byte-identical mirror
const FROZEN_SHA_PREFIX = 'b75a7fe7f71199f8'; // TESTGEN-PREREG §3
const SEED = 42;
const K = 40;
const OUT = new URL('../docs/02-experiments/testgen-mutants.json', import.meta.url);

// mulberry32 — tiny deterministic PRNG; Math.random is banned from selection
function mulberry32(/** @type {number} */ a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

const targetPath = join(WORKDIR, TARGET_REL);
const mirrorPath = join(WORKDIR, MIRROR_REL);
const src = readFileSync(targetPath, 'utf8');
const mirror = readFileSync(mirrorPath, 'utf8');
if (src !== mirror) throw new Error('DRIFT: the two orchestrator copies differ — STOP, re-screen the patient');
const sha = createHash('sha256').update(src).digest('hex');
if (!sha.startsWith(FROZEN_SHA_PREFIX)) throw new Error(`DRIFT: orchestrator sha ${sha.slice(0, 16)} != frozen ${FROZEN_SHA_PREFIX}`);

const lines = src.split('\n');

// ---- code-vs-prose scanner (line-level heuristic) ---------------------------
// Track triple-quoted blocks across lines; within a line, mask single-quoted
// string spans so operators inside string literals are never mutation sites.
let inTriple = false;
/** @type {boolean[]} true = line is (partly) real code */
const isCode = [];
/** @type {string[]} the line with string-literal spans blanked out */
const masked = [];
for (const line of lines) {
  let l = line;
  let code = !inTriple;
  // toggle triple-quote state; a line containing an odd number of """ or ''' flips it
  const triples = (l.match(/"""|'''/g) ?? []).length;
  if (triples % 2 === 1) { code = !inTriple; inTriple = !inTriple; }
  if (!code && triples === 0) { isCode.push(false); masked.push(''); continue; }
  // comments: strip from # to EOL (a # inside a string is rare here; heuristic)
  const hash = l.indexOf('#');
  if (hash !== -1) l = l.slice(0, hash);
  // mask quoted spans (non-greedy, both quote kinds, f-strings included)
  l = l.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, (m) => ' '.repeat(m.length));
  l = l.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => ' '.repeat(m.length));
  isCode.push(l.trim().length > 0);
  masked.push(l);
}

// enclosing function per line: nearest preceding `def name(` (method granularity)
/** @type {string[]} */
const funcOf = [];
let currentFunc = '(module)';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
  if (m) currentFunc = m[1];
  funcOf.push(currentFunc);
}

// ---- operator classes (order matters within a line scan) --------------------
/** @type {Array<{cls: string, find: RegExp, sub: (m: string) => string}>} */
const OPS = [
  { cls: 'is-none', find: /\bis not None\b/g, sub: () => 'is None' },
  { cls: 'is-none', find: /\bis None\b/g, sub: () => 'is not None' },
  { cls: 'eq-neq', find: /(?<![=!<>+\-*/])==(?!=)/g, sub: () => '!=' },
  { cls: 'eq-neq', find: /!=(?!=)/g, sub: () => '==' },
  { cls: 'cmp', find: /<=(?![=<])/g, sub: () => '<' },
  { cls: 'cmp', find: />=(?![=>])/g, sub: () => '>' },
  { cls: 'cmp', find: /(?<![-<=!])<(?![=<])/g, sub: () => '<=' },
  { cls: 'cmp', find: /(?<![-<=!>])>(?![=>])/g, sub: () => '>=' },
  { cls: 'bool-op', find: /(?<=\s)and(?=\s)/g, sub: () => 'or' },
  { cls: 'bool-op', find: /(?<=\s)or(?=\s)/g, sub: () => 'and' },
  { cls: 'bool-lit', find: /\bTrue\b/g, sub: () => 'False' },
  { cls: 'bool-lit', find: /\bFalse\b/g, sub: () => 'True' },
  { cls: 'arith', find: /(?<=\S) \+ (?=\S)/g, sub: () => ' - ' },
  { cls: 'arith', find: /(?<=\S) - (?=\S)/g, sub: () => ' + ' },
  { cls: 'int-const', find: /\b\d+\b/g, sub: (m) => String(Number(m) + 1) },
  { cls: 'return-none', find: /^(\s*)return\s+(?!None\b).+$/g, sub: () => '' }, // handled specially
];

/** @type {Array<{line: number, cls: string, before: string, after: string, func: string}>} */
const sites = [];
for (let i = 0; i < lines.length; i++) {
  if (!isCode[i]) continue;
  const codePart = masked[i];
  const orig = lines[i];
  for (const op of OPS) {
    if (op.cls === 'return-none') {
      const m = codePart.match(/^(\s*)return\s+(?!None\b)\S/);
      // skip `return` inside a masked string zone (can't be), and annotations
      if (m && !orig.trimStart().startsWith('#')) {
        sites.push({ line: i + 1, cls: op.cls, before: orig, after: `${m[1]}return None`, func: funcOf[i] });
      }
      continue;
    }
    op.find.lastIndex = 0;
    let match;
    while ((match = op.find.exec(codePart)) !== null) {
      const col = match.index;
      // apply at the SAME column in the original line; verify the original has
      // the same token there (mask replaced strings with spaces, columns align)
      const token = match[0];
      if (orig.slice(col, col + token.length) !== token) continue; // masked zone artifact
      const after = orig.slice(0, col) + op.sub(token) + orig.slice(col + token.length);
      if (after === orig) continue;
      sites.push({ line: i + 1, cls: op.cls, before: orig, after, func: funcOf[i] });
    }
  }
}

// dedupe identical (line, after) pairs; a line may host several distinct sites
const seen = new Set();
const pool = sites.filter((s) => {
  const k = `${s.line}|${s.after}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

// ---- stratified sample: 4 per line-number decile ----------------------------
const N = lines.length;
const decileOf = (/** @type {number} */ line) => Math.min(9, Math.floor(((line - 1) / N) * 10));
/** @type {Array<typeof pool>} */
const byDecile = Array.from({ length: 10 }, () => []);
for (const s of pool) byDecile[decileOf(s.line)].push(s);

const py = join(WORKDIR, '.venv/bin/python');
const ENV = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONDONTWRITEBYTECODE: '1' };
const clearPycache = () => {
  rmSync(join(WORKDIR, 'src/aurora_soar/__pycache__'), { recursive: true, force: true });
  rmSync(join(WORKDIR, 'packages/soar/src/aurora_soar/__pycache__'), { recursive: true, force: true });
};

/** apply a mutant to BOTH copies. Compare BOTH before writing EITHER — a
 *  compare failure must never leave one copy mutated (the first launch did
 *  exactly that: a mid-apply throw skipped restore and dirtied the patient). */
function apply(/** @type {{line: number, before: string, after: string}} */ mu) {
  const cur = [targetPath, mirrorPath].map((p) => readFileSync(p, 'utf8').split('\n'));
  for (let j = 0; j < cur.length; j++) {
    if (cur[j][mu.line - 1] !== mu.before) throw new Error(`DRIFT applying line ${mu.line} in copy ${j}:\n  disk:     ${JSON.stringify(cur[j][mu.line - 1])}\n  recorded: ${JSON.stringify(mu.before)}`);
  }
  for (let j = 0; j < cur.length; j++) {
    cur[j][mu.line - 1] = mu.after;
    writeFileSync([targetPath, mirrorPath][j], cur[j].join('\n'));
  }
}
function restore() {
  writeFileSync(targetPath, src);
  writeFileSync(mirrorPath, mirror);
}

function importsClean(/** @type {{line: number, before: string, after: string}} */ mu) {
  try {
    apply(mu); // inside the try: ANY throw must still restore (first-launch lesson)
    clearPycache();
    execFileSync(py, ['-c', 'import aurora_soar.orchestrator'], { cwd: WORKDIR, env: ENV, timeout: 30_000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  } finally {
    restore();
    clearPycache();
  }
}

const perDecile = K / 10; // 4
/** @type {Array<{id: string, decile: number, line: number, cls: string, func: string, before: string, after: string}>} */
const chosen = [];
let rejected = 0;
for (let d = 0; d < 10; d++) {
  const bucket = [...byDecile[d]];
  let need = perDecile;
  // seeded shuffle-order draw; import-broken candidates are resampled (frozen rule)
  while (need > 0 && bucket.length > 0) {
    const i = Math.floor(rand() * bucket.length);
    const cand = bucket.splice(i, 1)[0];
    process.stdout.write(`  decile ${d} line ${cand.line} [${cand.cls}] … `);
    if (importsClean(cand)) {
      chosen.push({ id: `M${String(chosen.length + 1).padStart(2, '0')}`, decile: d, ...cand });
      need--;
      console.log('ok');
    } else {
      rejected++;
      console.log('import-broken → resample');
    }
  }
  if (need > 0) throw new Error(`decile ${d} exhausted with ${need} still needed — pool too thin, STOP (never spill silently)`);
}

const out = {
  prereg: 'docs/02-experiments/TESTGEN-PREREG.md',
  seed: SEED, k: K, file: TARGET_REL, mirror: MIRROR_REL,
  fileSha256: sha, poolSize: pool.length, importRejected: rejected,
  mutants: chosen,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
const outSha = createHash('sha256').update(readFileSync(OUT)).digest('hex');

console.log(`\npool ${pool.length} sites → K=${K} frozen (${rejected} import-broken resampled)`);
console.log('\nid   ln    decile cls          func');
for (const m of chosen) console.log(`${m.id}  ${String(m.line).padEnd(5)} ${m.decile}      ${m.cls.padEnd(12)} ${m.func}`);
console.log(`\nwritten: docs/02-experiments/testgen-mutants.json  sha256 ${outSha.slice(0, 16)}`);
