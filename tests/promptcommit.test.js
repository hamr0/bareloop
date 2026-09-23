// prompt-commit-check exit criteria (PRD build-list item 5 / TODO #8, Q9
// answered 2026-08-25: "a check"). Exercises the PURE decision path
// (`scripts/promptcommitlib.mjs`) with inputs constructed in-process — no
// tmp git repo, no shelling out to git, and consequently no tmp dir to clean
// up: every case here passes commits/messages straight in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCommitMessage, evaluateCommits, PROMPT_COMMIT_LABELS, FAILURE_NEEDS_RUN_REF,
  classifyProseOnlyLines, parseChangedLineNumbers, fileChangeIsProseOnly,
} from '../scripts/promptcommitlib.mjs';
import { isPromptFile, PROMPT_REGISTERS } from '../src/promptregisters.js';

// 'mszcthk1' is a REAL archived run id (bareloop.context.md's own replayRun
// example), used here rather than an invented one.
const COMPLIANT = 'fix: tighten PERSONA_TOOLS\n\n'
  + 'Failure: run mszcthk1 — worker read the arbiter spine after being told it was denied\n'
  + 'Addresses: PERSONA_TOOLS did not name the spine file explicitly\n'
  + 'Corrects: spells the denied paths from ARBITER_BOOK_STORES\n';

test('PROMPT_REGISTERS inventory is non-empty and isPromptFile matches every entry', () => {
  assert.ok(PROMPT_REGISTERS.length > 0);
  for (const { file } of PROMPT_REGISTERS) {
    assert.equal(isPromptFile(file), true, `expected isPromptFile to match ${file}`);
  }
  assert.equal(isPromptFile('src/plan.js'), false);
  assert.equal(isPromptFile(''), false);
  assert.equal(isPromptFile(/** @type {any} */ (null)), false);
});

test('isPromptFile matches an absolute path ending in a registered file', () => {
  assert.equal(isPromptFile('/home/x/bareloop/src/tools.js'), true);
  assert.equal(isPromptFile('./src/readshim.js'), true);
});

// Item 6 (2026-09-15) — TYPES_GENRE_TEMPLATE (src/authoring.js) is
// interpolated verbatim into the authoring prompt (src/authorflow.js's "THE
// GENRE TEMPLATE" block) but was missing from this inventory entirely —
// src/authoring.js was never covered, either as a listed prompt file or as
// one of the module-header's own audited no-prompt-content files. A commit
// touching src/authoring.js now falls under the same rule every other
// prompt-register file does.
test('src/authoring.js (TYPES_GENRE_TEMPLATE) is a registered prompt file', () => {
  assert.equal(isPromptFile('src/authoring.js'), true);
  assert.ok(PROMPT_REGISTERS.some((e) => e.file === 'src/authoring.js' && e.name === 'TYPES_GENRE_TEMPLATE'));
});

// The registry module itself (src/promptregisters.js) is the ONE meta file
// that is never itself a prompt-content file — declaring an entry is not
// carrying model-facing text.
test('src/promptregisters.js is NOT itself a registered prompt file', () => {
  assert.equal(isPromptFile('src/promptregisters.js'), false);
});

test('validateCommitMessage: a compliant message passes with no missing labels', () => {
  const { ok, missing } = validateCommitMessage(COMPLIANT);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

for (const label of PROMPT_COMMIT_LABELS) {
  test(`validateCommitMessage: message missing ${label} fails and names it`, () => {
    const withoutLabel = COMPLIANT.split('\n').filter((line) => !line.toLowerCase().startsWith(`${label.toLowerCase()}:`)).join('\n');
    const { ok, missing } = validateCommitMessage(withoutLabel);
    assert.equal(ok, false);
    assert.deepEqual(missing, [label]);
  });

  test(`validateCommitMessage: ${label} present but empty fails and names it`, () => {
    const emptied = COMPLIANT.split('\n').map((line) => (line.toLowerCase().startsWith(`${label.toLowerCase()}:`) ? `${label}:` : line)).join('\n');
    const { ok, missing } = validateCommitMessage(emptied);
    assert.equal(ok, false);
    assert.deepEqual(missing, [label]);
  });
}

test('validateCommitMessage: label matching is case-insensitive at line start', () => {
  const lowered = COMPLIANT.replace('Failure:', 'failure:').replace('Addresses:', 'ADDRESSES:').replace('Corrects:', 'CoRrEcTs:');
  const { ok, missing } = validateCommitMessage(lowered);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: message missing all three labels fails and names all three', () => {
  const { ok, missing } = validateCommitMessage('fix: tighten PERSONA_TOOLS\n\nno labels here at all\n');
  assert.equal(ok, false);
  assert.deepEqual(missing, [...PROMPT_COMMIT_LABELS]);
});

test('validateCommitMessage: Failure present but no run ref fails with FAILURE_NEEDS_RUN_REF, other labels unaffected', () => {
  const noRunRef = COMPLIANT.replace('Failure: run mszcthk1 — worker read the arbiter spine after being told it was denied', 'Failure: worker read the arbiter spine after being told it was denied');
  const { ok, missing } = validateCommitMessage(noRunRef);
  assert.equal(ok, false);
  assert.deepEqual(missing, [FAILURE_NEEDS_RUN_REF]);
});

test('validateCommitMessage: "run failed" (prose, not a citation) no longer passes as a run ref — PR #23 review item 2, scripts/promptcommitlib.mjs:29', () => {
  const prose = 'fix: tighten PERSONA_TOOLS\n\n'
    + 'Failure: the CI run failed intermittently\n'
    + 'Addresses: PERSONA_TOOLS did not name the spine file explicitly\n'
    + 'Corrects: spells the denied paths from ARBITER_BOOK_STORES\n';
  const { ok, missing } = validateCommitMessage(prose);
  assert.equal(ok, false);
  assert.deepEqual(missing, [FAILURE_NEEDS_RUN_REF]);
});

test('validateCommitMessage: "run u-<id>" form passes', () => {
  const withPrefixed = COMPLIANT.replace('run mszcthk1', 'run u-mszcthk1');
  const { ok, missing } = validateCommitMessage(withPrefixed);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: "run <id>" form (no u- prefix) passes', () => {
  const { ok, missing } = validateCommitMessage(COMPLIANT);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: two run refs cited on the Failure line both pass', () => {
  const twoRuns = COMPLIANT.replace('Failure: run mszcthk1 — ', 'Failure: run mszcthk1 and run u-mszcfaof — ');
  const { ok, missing } = validateCommitMessage(twoRuns);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('validateCommitMessage: run-ref matching is case-insensitive on the "run" keyword', () => {
  const upperRun = COMPLIANT.replace('Failure: run mszcthk1', 'Failure: RUN mszcthk1');
  const { ok, missing } = validateCommitMessage(upperRun);
  assert.equal(ok, true);
  assert.deepEqual(missing, []);
});

test('evaluateCommits: a commit touching no prompt file passes regardless of message', () => {
  const { ok, offenders } = evaluateCommits(
    [{ sha: 'abc123', message: 'no labels, does not matter', files: ['src/plan.js', 'README.md'] }],
    isPromptFile,
  );
  assert.equal(ok, true);
  assert.deepEqual(offenders, []);
});

test('evaluateCommits: a commit touching a prompt file with a compliant message passes', () => {
  const { ok, offenders } = evaluateCommits(
    [{ sha: 'def456', message: COMPLIANT, files: ['src/tools.js'] }],
    isPromptFile,
  );
  assert.equal(ok, true);
  assert.deepEqual(offenders, []);
});

test('evaluateCommits: a commit touching a prompt file with a non-compliant message fails and names the sha + missing labels', () => {
  const { ok, offenders } = evaluateCommits(
    [{ sha: 'ghi789', message: 'no labels here', files: ['src/readshim.js'] }],
    isPromptFile,
  );
  assert.equal(ok, false);
  assert.deepEqual(offenders, [{ sha: 'ghi789', missing: [...PROMPT_COMMIT_LABELS] }]);
});

// --- hamr's narrow exemption (2026-09-23): a commit touching a prompt-
// register file changes no prompt TEXT — covers classifyProseOnlyLines,
// parseChangedLineNumbers, fileChangeIsProseOnly, and evaluateCommits'
// integration of all three via `promptFileDiffs`. ---------------------------

test('classifyProseOnlyLines: a full JSDoc block comment is prose-only on every line, including a param line shaped exactly like commit 565fb99\'s real edit', () => {
  const text = [
    'function f(opts) {}',
    '/**',
    ' * @param {{decision: string, text?: string|null}|null} [opts.humanRuling] N4',
    ' */',
    'const other = 1;',
  ].join('\n');
  const classified = classifyProseOnlyLines(text);
  assert.deepEqual(classified, [false, true, true, true, false]);
});

test('classifyProseOnlyLines: a `//` line comment is prose-only, a code line is not', () => {
  const text = 'const x = 1;\n// a real comment\nconst y = 2; // trailing comment still has code before it';
  assert.deepEqual(classifyProseOnlyLines(text), [false, true, false]);
});

test('classifyProseOnlyLines: a markdown-bullet-shaped line INSIDE a template literal is never mistaken for a JSDoc continuation line', () => {
  // This is the adversarial case the exemption must not fall for: `* like
  // this` is a real JSDoc-continuation shape, but here it is model-facing
  // PROMPT TEXT sitting inside a backtick template, not a comment.
  const text = [
    'const PERSONA_TOOLS = `',
    '* Always be nice',
    '* Never lie',
    '`;',
  ].join('\n');
  assert.deepEqual(classifyProseOnlyLines(text), [false, false, false, false]);
});

test('classifyProseOnlyLines: a `/* */`-shaped sequence inside a string never opens a real block comment (no state leak to the next line)', () => {
  const text = 'const s = "a /* b";\nreal_code_here();';
  // Both lines carry real code — if the string wrongly let "/*" open a block
  // comment, line 2 (or the tail of line 1) could misclassify as comment.
  assert.deepEqual(classifyProseOnlyLines(text), [false, false]);
});

test('classifyProseOnlyLines: an UNTERMINATED "/* "-shaped sequence inside a TEMPLATE literal must not leak a fake block-comment state into the next real code line', () => {
  // The dangerous direction: if backtick-tracking were dropped, the scanner
  // would (wrongly, still in "code" state) treat the `/*` inside this prompt
  // string as opening a REAL block comment with no closing `*/` on the same
  // line, and that fake comment state would then swallow the next line's
  // real code as "prose-only" too — a false EXEMPT. Template tracking must
  // prevent that: the whole first line is template content (never a real
  // comment start), and the second line is real code, full stop.
  const text = 'const PROMPT = `note: /* looks like a comment start inside a string`;\nconst REAL_CODE_AFTER = mustNotBeHidden();';
  assert.deepEqual(classifyProseOnlyLines(text), [false, false]);
});

test('parseChangedLineNumbers: a single-line hunk (no comma — git\'s real -U0 shape for a 1-line change, e.g. 565fb99)', () => {
  const diff = '--- a/src/planrun.js\n+++ b/src/planrun.js\n@@ -935 +935 @@ ${scoutBlob}\n'
    + '- * @param {{decision: string, text?: string}|null} [opts.humanRuling] N4\n'
    + '+ * @param {{decision: string, text?: string|null}|null} [opts.humanRuling] N4\n';
  assert.deepEqual(parseChangedLineNumbers(diff), { oldLines: [935], newLines: [935] });
});

test('parseChangedLineNumbers: multi-line, multi-hunk headers with explicit counts', () => {
  const diff = '@@ -10,3 +12,5 @@\n-a\n-b\n-c\n+a\n+b\n+c\n+d\n+e\n@@ -40 +44,2 @@\n-x\n+x\n+y\n';
  assert.deepEqual(parseChangedLineNumbers(diff), {
    oldLines: [10, 11, 12, 40],
    newLines: [12, 13, 14, 15, 16, 44, 45],
  });
});

test('parseChangedLineNumbers: no hunk headers resolves to zero changed lines', () => {
  assert.deepEqual(parseChangedLineNumbers('not a diff at all'), { oldLines: [], newLines: [] });
});

const PROSE_ONLY_OLD = [
  'const AUTHOR_SYSTEM = `hello`;',
  '/**',
  ' * @param {string} x old text',
  ' */',
  'const other = 1;',
].join('\n');
const PROSE_ONLY_NEW = PROSE_ONLY_OLD.replace('old text', 'new text');
const PROSE_ONLY_DIFF = '@@ -3 +3 @@\n- * @param {string} x old text\n+ * @param {string} x new text\n';

test('fileChangeIsProseOnly: a comment-only line edit (the real 565fb99 shape) is exempt-eligible', () => {
  assert.equal(fileChangeIsProseOnly(PROSE_ONLY_OLD, PROSE_ONLY_NEW, PROSE_ONLY_DIFF), true);
});

test('fileChangeIsProseOnly: a real prompt-text (template literal) edit is REJECTED', () => {
  const oldText = PROSE_ONLY_OLD;
  const newText = oldText.replace('`hello`', '`hello world`');
  const diff = '@@ -1 +1 @@\n-const AUTHOR_SYSTEM = `hello`;\n+const AUTHOR_SYSTEM = `hello world`;\n';
  assert.equal(fileChangeIsProseOnly(oldText, newText, diff), false);
});

test('fileChangeIsProseOnly: a prompt-text edit AND a comment edit in the SAME file/diff is still REJECTED (mixed-hunk case)', () => {
  const oldText = PROSE_ONLY_OLD;
  const newText = oldText.replace('`hello`', '`hello world`').replace('old text', 'new text');
  const diff = '@@ -1 +1 @@\n'
    + '-const AUTHOR_SYSTEM = `hello`;\n+const AUTHOR_SYSTEM = `hello world`;\n'
    + '@@ -3 +3 @@\n- * @param {string} x old text\n+ * @param {string} x new text\n';
  assert.equal(fileChangeIsProseOnly(oldText, newText, diff), false);
});

test('fileChangeIsProseOnly: any null input (unresolved diff/blob) is never exempt', () => {
  assert.equal(fileChangeIsProseOnly(null, PROSE_ONLY_NEW, PROSE_ONLY_DIFF), false);
  assert.equal(fileChangeIsProseOnly(PROSE_ONLY_OLD, null, PROSE_ONLY_DIFF), false);
  assert.equal(fileChangeIsProseOnly(PROSE_ONLY_OLD, PROSE_ONLY_NEW, null), false);
});

test('fileChangeIsProseOnly: a PURE DELETION of a real prompt-text line (no replacement added) is REJECTED — the old-side check must run even when nothing was added', () => {
  const oldText = 'const AUTHOR_SYSTEM = `hello`;\nconst other = 1;';
  const newText = 'const other = 1;';
  const diff = '@@ -1 +0,0 @@\n-const AUTHOR_SYSTEM = `hello`;\n';
  assert.equal(fileChangeIsProseOnly(oldText, newText, diff), false);
});

test('fileChangeIsProseOnly: a diff with zero resolvable hunks is never exempt (nothing was positively proven prose-only)', () => {
  assert.equal(fileChangeIsProseOnly(PROSE_ONLY_OLD, PROSE_ONLY_NEW, 'no hunks here'), false);
});

test('fileChangeIsProseOnly: the markdown-bullet-inside-a-template adversarial case is REJECTED end to end', () => {
  const oldText = ['const PERSONA_TOOLS = `', '* Always be nice', '* Never lie', '`;'].join('\n');
  const newText = ['const PERSONA_TOOLS = `', '* Always be nice', '* Never lie to the user', '`;'].join('\n');
  const diff = '@@ -3 +3 @@\n-* Never lie\n+* Never lie to the user\n';
  assert.equal(fileChangeIsProseOnly(oldText, newText, diff), false);
});

test('evaluateCommits: a comment-only prompt-register edit is EXEMPT — passes with no labels at all', () => {
  const { ok, offenders } = evaluateCommits(
    [{
      sha: 'exempt1',
      message: 'fix: widen a JSDoc type for tsc, no run behind it',
      files: ['src/planrun.js'],
      promptFileDiffs: { 'src/planrun.js': { oldText: PROSE_ONLY_OLD, newText: PROSE_ONLY_NEW, diffText: PROSE_ONLY_DIFF } },
    }],
    isPromptFile,
  );
  assert.equal(ok, true);
  assert.deepEqual(offenders, []);
});

test('evaluateCommits: a real prompt-text edit still requires the three labels even with promptFileDiffs present', () => {
  const oldText = PROSE_ONLY_OLD;
  const newText = oldText.replace('`hello`', '`hello world`');
  const diff = '@@ -1 +1 @@\n-const AUTHOR_SYSTEM = `hello`;\n+const AUTHOR_SYSTEM = `hello world`;\n';
  const { ok, offenders } = evaluateCommits(
    [{
      sha: 'notexempt1',
      message: 'fix: change the greeting',
      files: ['src/planrun.js'],
      promptFileDiffs: { 'src/planrun.js': { oldText, newText, diffText: diff } },
    }],
    isPromptFile,
  );
  assert.equal(ok, false);
  assert.deepEqual(offenders, [{ sha: 'notexempt1', missing: [...PROMPT_COMMIT_LABELS] }]);
});

test('evaluateCommits: a commit touching TWO prompt files where only one is proven prose-only is NOT exempt overall', () => {
  const oldText = PROSE_ONLY_OLD;
  const newText = oldText.replace('`hello`', '`hello world`');
  const diff = '@@ -1 +1 @@\n-const AUTHOR_SYSTEM = `hello`;\n+const AUTHOR_SYSTEM = `hello world`;\n';
  const { ok, offenders } = evaluateCommits(
    [{
      sha: 'mixedfiles1',
      message: 'fix: two files',
      files: ['src/planrun.js', 'src/tools.js'],
      promptFileDiffs: {
        'src/planrun.js': { oldText: PROSE_ONLY_OLD, newText: PROSE_ONLY_NEW, diffText: PROSE_ONLY_DIFF },
        'src/tools.js': { oldText, newText, diffText: diff },
      },
    }],
    isPromptFile,
  );
  assert.equal(ok, false);
  assert.deepEqual(offenders, [{ sha: 'mixedfiles1', missing: [...PROMPT_COMMIT_LABELS] }]);
});

test('evaluateCommits: a touched prompt file with NO promptFileDiffs entry at all is not exempt (missing data is not a pass)', () => {
  const { ok, offenders } = evaluateCommits(
    [{ sha: 'nodiffdata1', message: 'fix: no diff data supplied', files: ['src/planrun.js'], promptFileDiffs: {} }],
    isPromptFile,
  );
  assert.equal(ok, false);
  assert.deepEqual(offenders, [{ sha: 'nodiffdata1', missing: [...PROMPT_COMMIT_LABELS] }]);
});

test('evaluateCommits: multiple commits in a range, mixed compliance', () => {
  const commits = [
    { sha: 'a1', message: 'unrelated change', files: ['README.md'] },
    { sha: 'a2', message: COMPLIANT, files: ['src/authorflow.js'] },
    // 'x' after Failure: has no run ref, on top of the pre-existing missing Addresses
    { sha: 'a3', message: 'Failure: x\nAddresses:\nCorrects: z', files: ['src/judged.js'] },
    { sha: 'a4', message: 'touches two prompt files, no labels', files: ['src/tools.js', 'src/planrun.js'] },
  ];
  const { ok, offenders } = evaluateCommits(commits, isPromptFile);
  assert.equal(ok, false);
  assert.deepEqual(offenders, [
    { sha: 'a3', missing: ['Addresses', FAILURE_NEEDS_RUN_REF] },
    { sha: 'a4', missing: [...PROMPT_COMMIT_LABELS] },
  ]);
});
