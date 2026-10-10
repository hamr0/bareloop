// The "job" block's parser (P7, docs/product/PANEL-BUILD.md "Addendum 2026-10-10"): ONE owner of how the person's
// own multi-line words become numbered job lines and numbered inputs. The panel server AND the CLI interview both
// call these two functions, so the two doors can never read the same text two ways.
//
// Both are pure and $0: a malformed block is a named red `{ok: false, error}`, never a throw and never a guess.

/** @typedef {{verdict: 'PASS'|'FAIL', text: string}} JobExample a `~ PASS:` / `~ FAIL:` line (rubric only), kept with its job line */
/** @typedef {{n: number, text: string, rule: string, examples: JobExample[]}} JobLine one numbered job line; `rule` = its `~` lines joined with '; ' ('' when none) */
/** @typedef {{n: number, label: string, value: string}} JobInput one numbered `label: value` input line */

/** the joiner for consecutive `~` lines (fwd's joinGuardrails) */
export const RULE_JOINER = '; ';

/**
 * Parse "The job" box. A plain line is a numbered job line (1, 2, 3...). A line starting `~` has no number and belongs
 * to the numbered line above; consecutive `~` lines become ONE rule joined with `'; '`. A `~` line starting `PASS:` or
 * `FAIL:` is also a judge example (kept with its line number); any other `~` line is a guardrail. Empty lines are
 * ignored. A `~` before line 1 is a red.
 * @param {unknown} text the box's raw text
 * @returns {{ok: true, lines: JobLine[]}|{ok: false, error: string}}
 */
export function parseJobBlock(text) {
  if (typeof text !== 'string') return { ok: false, error: 'The job is required' };
  /** @type {JobLine[]} */
  const lines = [];
  /** @type {string[]} */
  let rule = [];
  const flush = () => { if (lines.length) lines[lines.length - 1].rule = rule.join(RULE_JOINER); rule = []; };
  let row = 0;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === '') continue;
    row += 1;
    if (t.startsWith('~')) {
      if (lines.length === 0) return { ok: false, error: `The job, line ${row}: a "~" line belongs to the numbered line above it, and there is none yet` };
      const body = t.slice(1).trim();
      if (body === '') continue;
      rule.push(body);
      const m = /^(PASS|FAIL):\s*(.*)$/i.exec(body);
      if (m) {
        if (m[2].trim() === '') return { ok: false, error: `The job, line ${row}: "${m[1].toUpperCase()}:" needs an example after it` };
        lines[lines.length - 1].examples.push({ verdict: /** @type {'PASS'|'FAIL'} */ (m[1].toUpperCase()), text: m[2].trim() });
      }
      continue;
    }
    flush();
    lines.push({ n: lines.length + 1, text: t, rule: '', examples: [] });
  }
  flush();
  if (lines.length === 0) return { ok: false, error: 'The job is required' };
  return { ok: true, lines };
}

/** a label: a word or two, no colon */
const LABEL_RE = /^[A-Za-z][A-Za-z0-9_ -]{0,39}$/;

/**
 * Parse the "Inputs" box: one `label: value` per line, numbered 1, 2, 3 in the order written. Empty lines are ignored.
 * This only checks the SHAPE — what a value must point at (line 1 an absolute repo, lines 2+ tracked files inside it)
 * is proven by the panel at $0.
 * @param {unknown} text
 * @returns {{ok: true, inputs: JobInput[]}|{ok: false, error: string}}
 */
export function parseInputs(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Inputs is required' };
  /** @type {JobInput[]} */
  const inputs = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === '') continue;
    const n = inputs.length + 1;
    const i = t.indexOf(':');
    const label = i < 0 ? '' : t.slice(0, i).trim();
    const value = i < 0 ? '' : t.slice(i + 1).trim();
    if (!LABEL_RE.test(label) || value === '') return { ok: false, error: `Inputs, line ${n}: write it as "label: value"` };
    inputs.push({ n, label, value });
  }
  if (inputs.length === 0) return { ok: false, error: 'Inputs is required' };
  return { ok: true, inputs };
}
