// The CLI's one line-asker (PRD v1.114, one menu). Every prompt in `bareloop` — the menu and the job commands — reads through
// this, so a closed stdin and the "empty Enter" rule behave the same everywhere.

import { createInterface } from 'node:readline';

/**
 * One readline over `stdin`, with a LINE QUEUE: lines that arrive before the next question (piped input, a paste) wait for it instead
 * of being dropped, and a closed stdin answers '' (the safe default) and never hangs.
 * @param {{ stdin?: any, stdout?: any }} [io]
 * @returns {{ ask: (q: string) => Promise<string>, close: () => void }}
 */
export function openAsker(io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stdin = io.stdin ?? process.stdin;
  const tty = Boolean(stdin.isTTY);
  // a real terminal needs readline's output to echo the typed line; piped input echoes nothing
  const rl = createInterface({ input: stdin, ...(tty ? { output: stdout, terminal: true } : { terminal: false }) });
  /** @type {string[]} */
  const queue = [];
  /** @type {((s: string) => void)[]} */
  const waiting = [];
  let closed = false;
  rl.on('line', (line) => { const w = waiting.shift(); if (w) w(line); else queue.push(line); });
  rl.once('close', () => { closed = true; while (waiting.length) /** @type {(s: string) => void} */ (waiting.shift())(''); });
  const ask = (/** @type {string} */ q) => {
    stdout.write(q);
    if (queue.length) return Promise.resolve(/** @type {string} */ (queue.shift()));
    if (closed) return Promise.resolve('');
    return new Promise((resolve) => { waiting.push(resolve); });
  };
  return { ask, close: () => rl.close() };
}

/** `q` (any case, trimmed) at a job question means "leave this command" (hamr 2026-10-25). @param {string} s @returns {boolean} */
export const isQuit = (s) => s.trim().toLowerCase() === 'q';

/**
 * A required prompt (hamr 2026-10-25): an empty Enter asks ONCE more; a second empty Enter gives up; `q` gives up at once. `null` = nothing was chosen
 * (the caller ends its command cleanly: a plain line, nothing run, exit 0).
 * @param {(q: string) => Promise<string>} ask @param {string} question
 * @returns {Promise<string|null>}
 */
export async function askRequired(ask, question) {
  for (let i = 0; i < 2; i += 1) {
    const a = (await ask(question)).trim();
    if (isQuit(a)) return null;
    if (a !== '') return a;
  }
  return null;
}
