// A permanent, seeded differential test for the two linear-time scanner rewrites (48a8d24 close-integrity stringLiteralsOf, 1a41097 bundle
// staticImportsOf). Each rewrite replaced a regex that went quadratic/cubic; the claim was "same results". The 0-mismatch fuzz used to live
// only in untracked scratch, so a future edit that changed results was caught nowhere. Here the OLD regexes (verbatim from git) are the
// oracle, a deterministic PRNG makes every case reproducible, and a mutant of each scanner proves the comparison can fail.
// The scanners are module-private, so their source is sliced out of the file and evaluated (a moved marker fails loudly, not silently).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** the text from `from` up to (not including) `to`, both required */
function slice(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a !== -1, `marker not found: ${from}`);
  const b = to === null ? src.length : src.indexOf(to, a);
  assert.ok(b !== -1, `marker not found: ${to}`);
  return src.slice(a, b);
}
const strip = (t) => t.replace(/\/\*\*[\s\S]*?\*\//g, ''); // JSDoc is not code

function load(code, name) {
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\nreturn ${name};`)();
}

const closeSrc = read('../src/close-integrity.js');
const bundleSrc = read('../src/bundle.js');
const stringCode = strip(slice(closeSrc, 'const STRING_BODY = {', '/**\n * F8/F129'));
const importCode = strip(slice(bundleSrc, 'function staticImportsOf(source) {', '// Dynamic `import('));

// the OLD readers, verbatim from the commits before 48a8d24 and 1a41097
const OLD_STRING_RE = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
const OLD_IMPORT_RE = /import\s+(?:([^'";]*?)\s+from\s+)?(['"])([^'"]+)\2/g;
const oldStrings = (s) => [...s.matchAll(OLD_STRING_RE)].map((m) => ({ value: m[1] ?? m[2] ?? m[3], backtick: m[3] !== undefined }));
const oldImports = (s) => [...s.matchAll(OLD_IMPORT_RE)].map((m) => ({ raw: m[0], clause: m[1], spec: m[3] }));

/** mulberry32: a small seeded PRNG, same sequence on every run */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gen(rand, parts, maxLen) {
  const n = 1 + Math.floor(rand() * maxLen);
  let s = '';
  for (let i = 0; i < n; i += 1) s += parts[Math.floor(rand() * parts.length)];
  return s;
}

const STRING_PARTS = ["'", '"', '`', '\\', '\\\\', "\\'", '\\"', 'a', 'b', '/', '/x', ' ', '\n', '\r', ' ', '${x}', '$', '{', '}'];
const IMPORT_PARTS = ['import', 'import ', 'import  ', 'from', ' from ', ' ', '  ', '\n', '\t', '{ a }', '{a, b as c}', 'a', 'x', '*', 'as', ',', ';', "'", '"', './y', 'bareloop', '(', ')'];
const WS = [' ', '  ', '\n', ' \t ', ''];
const CLAUSES = ['{ a }', '{a, b as c}', 'a', '* as n', 'a, { b }', ''];
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
/** half noise, half statement-shaped (an import word, whitespace, optional clause + from, a quoted specifier), 1-3 of them with noise between */
function importSource(r) {
  if (r() < 0.5) return gen(r, IMPORT_PARTS, 14);
  let s = '';
  for (let k = 1 + Math.floor(r() * 3); k > 0; k -= 1) {
    const q = pick(r, ["'", '"', "'", '"', '`']);
    const clause = pick(r, CLAUSES);
    s += `import${pick(r, WS)}${clause ? `${clause}${pick(r, WS)}from${pick(r, WS)}` : ''}${q}${pick(r, ['./y', 'bareloop', 'x y', ''])}${r() < 0.9 ? q : pick(r, ["'", '"'])}${pick(r, [';', '\n', ' ', ''])}${gen(r, IMPORT_PARTS, 3)}`;
  }
  return s;
}
const CASES = 20000;

function compare(cases, mk, expected, actual) {
  const rand = prng(20261023);
  let produced = 0;
  const bad = [];
  for (let i = 0; i < cases; i += 1) {
    const s = mk(rand);
    const want = expected(s);
    produced += want.length;
    if (JSON.stringify(want) !== JSON.stringify(actual(s))) bad.push(s);
  }
  return { produced, bad };
}

test('stringLiteralsOf (48a8d24) reads the same literals, values and order as the old STRING_LITERAL_RE over 20k seeded sources', () => {
  const scan = load(`${stringCode}`, 'stringLiteralsOf');
  const { produced, bad } = compare(CASES, (r) => gen(r, STRING_PARTS, 40), oldStrings, scan);
  assert.deepEqual(bad.slice(0, 3), [], `${bad.length} mismatching sources`);
  assert.ok(produced > 5000, `the fuzz must actually produce literals (${produced})`);
});

test('stringLiteralsOf: a mutant that skips too much after a failed read IS caught by the same comparison', () => {
  assert.ok(stringCode.includes('deadUntil[quote] = end;'), 'the mutation site exists');
  const mutant = load(stringCode.replace('deadUntil[quote] = end;', 'deadUntil[quote] = end + 5;'), 'stringLiteralsOf');
  assert.ok(compare(CASES, (r) => gen(r, STRING_PARTS, 40), oldStrings, mutant).bad.length > 0);
});

test('staticImportsOf (1a41097) reads the same statements (raw, clause, specifier) as the old STATIC_IMPORT_RE over 20k seeded sources', () => {
  const scan = load(importCode, 'staticImportsOf');
  const { produced, bad } = compare(CASES, importSource, oldImports, (s) => scan(s).map(({ raw, clause, spec }) => ({ raw, clause, spec })));
  assert.deepEqual(bad.slice(0, 3), [], `${bad.length} mismatching sources`);
  assert.ok(produced > 500, `the fuzz must actually produce statements (${produced})`);
});

test('staticImportsOf: a mutant that drops the empty-clause shape IS caught by the same comparison', () => {
  assert.ok(importCode.includes("clause = ''; // `import  from 'x'`"), 'the mutation site exists');
  const mutant = load(importCode.replace("else if (f === b && blanks >= 2) clause = ''; // `import  from 'x'`", 'else if (false) clause = \'\';'), 'staticImportsOf');
  assert.ok(compare(CASES, importSource, oldImports, (s) => mutant(s).map(({ raw, clause, spec }) => ({ raw, clause, spec }))).bad.length > 0);
});
