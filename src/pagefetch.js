// URL inputs (PART 1c, docs/product/ITEM33-BUILD.md "4. URL inputs", PRD item 33 RF21/RF22): an Inputs line may be a web address the
// person pastes (a results page). bareloop fetches it with barebrowse, READ ONLY, headless and incognito, as published:
//
//     browse(url, { incognito: true, blockPrivateNetwork: true, pruneMode: 'act' })
//
// (the options proven in step 0: 'read' and 'full' returned almost nothing from a results page). The text that comes back is the
// input. An empty or near-empty fetch is a plain-words stop, never a silent empty input. Nothing here touches a model.

import { SECRET_PATTERNS } from './validate.js';

/** the options step 0 proved; kept as ONE frozen object so a test can pin them */
export const BROWSE_OPTIONS = Object.freeze({ incognito: true, blockPrivateNetwork: true, pruneMode: 'act' });
/** a page that comes back with fewer characters than this (after trimming) is treated as "nothing came back" */
export const MIN_PAGE_CHARS = 200;
/** our own deadline around one fetch (a hung browser leaves no trace; this is the only thing that fires on the absence of an answer) */
export const PAGE_FETCH_TIMEOUT_MS = 90_000;

/** @param {unknown} v @returns {boolean} an http(s) address (the one spelling of "this Inputs value is a web address") */
export function isWebUrl(v) {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
}

/**
 * Fetch one page's text. `browse` is injected (a test never reaches the network); the default is barebrowse's own `browse`.
 * @param {string} url
 * @param {{browse?: (url: string, opts: Record<string, any>) => Promise<string>, timeoutMs?: number}} [o]
 * @returns {Promise<{ok: true, text: string, url: string}|{ok: false, error: string}>} `error` is plain words, without a spend line
 */
export async function fetchPageText(url, { browse, timeoutMs = PAGE_FETCH_TIMEOUT_MS } = {}) {
  let u;
  try { u = new URL(url.trim()); } catch { return { ok: false, error: `${url} is not a web address bareloop can read` }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: `${url} is not an http or https address` };
  if (u.username !== '' || u.password !== '') return { ok: false, error: 'a web address with a user name or password in it is refused - bareloop reads a page with no credentials at all' };
  if (SECRET_PATTERNS.some((re) => re.test(u.href))) return { ok: false, error: 'the web address carries a known secret shape - secrets never enter a job' };
  /** @type {(url: string, opts: Record<string, any>) => Promise<string>} */
  let run;
  if (browse) run = browse;
  else {
    try { run = (await import('barebrowse')).browse; } catch (e) { return { ok: false, error: `the page reader (barebrowse) could not be loaded: ${/** @type {Error} */ (e).message}` }; }
  }
  /** @type {NodeJS.Timeout|undefined} */
  let timer;
  try {
    const text = await Promise.race([
      run(u.href, { ...BROWSE_OPTIONS }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer inside ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs); }),
    ]);
    if (typeof text !== 'string') return { ok: false, error: `${u.href} did not come back as text` };
    if (/\[BOT CHALLENGE DETECTED\]/.test(text)) return { ok: false, error: `${u.href} asked for a human check (a bot challenge), so the page could not be read` };
    const size = text.trim().length;
    if (size < MIN_PAGE_CHARS) return { ok: false, error: `${u.href} came back with ${size === 0 ? 'no text' : `only ${size} characters of text`} (less than ${MIN_PAGE_CHARS}) - the page did not load, or holds nothing to read` };
    return { ok: true, text, url: u.href };
  } catch (e) {
    return { ok: false, error: `${u.href} could not be read: ${/** @type {Error} */ (e)?.message ?? String(e)}` };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
