// LANGUAGE DETECTION (PRD item 33/M3, ruling 3 — `docs/product/ITEM33-BUILD.md`,
// "Five detection points"): a code job's checks always run the repo's OWN
// tools in the repo's own language, so language is a FACT of the repository,
// never a question asked of the person. This module is that fact-finder —
// $0, no provider, no model — and it replaces the `--lang` flag (default
// `js`) `scripts/run-interview.mjs` and `scripts/run-author.mjs` used to
// carry.
//
// ONE DATA TABLE (`MANIFEST_RULES`), not a code path per language: M3b's job
// is to flip a language from "known but no genre data" to "known and
// supported" by adding it to `GENRE_LANGUAGES` (`src/authoring.js`) — this
// module never hardcodes the supported set a second time, it reads
// `GENRE_LANGUAGES` live, so a language landing in M3b needs no edit here.
//
// FOUR OUTCOMES, discriminated by `kind`, never a throw for the ones a caller
// must act on in the ordinary course of a run:
//   - `resolved`             — a known, SUPPORTED manifest: 'js' or 'python'.
//   - `language-unsupported` — a known manifest this catalogue has no genre
//                               data for yet (go, rust, java, csharp, php...).
//                               Never a silent fallback to js. Carries a
//                               `refusal` shaped exactly like the `Refusal`
//                               `src/authorjob.js` already returns for its own
//                               language refusal (same `REFUSAL_LIB`,
//                               `REFUSAL_CATEGORY`, `request-red` shape) —
//                               reusing that pattern rather than inventing a
//                               second one, so a caller with a spine can emit
//                               it through the same `refusalEvents()` either
//                               already imports.
//   - `no-code-job`           — no manifest anywhere in the walk. NOT an
//                               error: PRD item 33 M3 ruling 7 says a
//                               plain-folder job gets the form and an honest
//                               "no checks yet" stop later (M4), so this is a
//                               normal reading, not a refusal.
//   - `ambiguous`             — two DIFFERENT supported languages' manifests
//                               at the same (nearest) directory level. The
//                               confirm-turn UI that would ask a person to
//                               pick is a later M3 piece; for now this is
//                               reported so a caller can stop rather than
//                               guess.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { GENRE_LANGUAGES } from './authoring.js';
import { GENRE, REFUSAL_CATEGORY, REFUSAL_LIB } from './authorjob.js';

/** @typedef {{code: string, path: string, detail: string, [k: string]: any}} Red */
/** @typedef {{kind: 'request-red', verb: string|null, path: string, detail: string,
 *   options: string[], red: Red}} LangRefusal */

/**
 * THE MANIFEST TABLE, as data — the whole language vocabulary this module
 * knows, one entry per manifest shape. `supported` is DERIVED from
 * `GENRE_LANGUAGES` at lookup time (never stored), so a language M3b adds
 * there flips from "unsupported stop" to "resolved" by that one edit, never
 * by adding a new branch here.
 * @type {ReadonlyArray<{kind: 'exact'|'ext', name?: string, ext?: string, language: string}>}
 */
const MANIFEST_RULES = Object.freeze([
  Object.freeze({ kind: 'exact', name: 'package.json', language: 'js' }),
  Object.freeze({ kind: 'exact', name: 'pyproject.toml', language: 'python' }),
  Object.freeze({ kind: 'exact', name: 'setup.py', language: 'python' }),
  Object.freeze({ kind: 'exact', name: 'go.mod', language: 'go' }),
  Object.freeze({ kind: 'exact', name: 'Cargo.toml', language: 'rust' }),
  Object.freeze({ kind: 'exact', name: 'pom.xml', language: 'java' }),
  Object.freeze({ kind: 'exact', name: 'build.gradle', language: 'java' }),
  Object.freeze({ kind: 'exact', name: 'build.gradle.kts', language: 'java' }),
  Object.freeze({ kind: 'exact', name: 'composer.json', language: 'php' }),
  Object.freeze({ kind: 'ext', ext: '.csproj', language: 'csharp' }),
  Object.freeze({ kind: 'ext', ext: '.sln', language: 'csharp' }),
]);

/**
 * A human label for a matched rule, for messages — `package.json` for an
 * exact match, `*.csproj` for an extension match.
 * @param {{kind: 'exact'|'ext', name?: string, ext?: string}} rule
 * @returns {string}
 */
function ruleLabel(rule) {
  return rule.kind === 'exact' ? /** @type {string} */ (rule.name) : `*${rule.ext}`;
}

/**
 * The directory chain to walk, NEAREST first, stopping at the repo root (the
 * nearest ancestor carrying a `.git` entry, directory OR file — a submodule's
 * `.git` is a file). When no `.git` exists anywhere above `start`, the walk
 * is exactly `[start]` — this module never reads above the folder it was
 * asked about when there is no repo boundary to stop it honestly.
 * @param {string} start
 * @returns {string[]}
 */
function walkChain(start) {
  /** @type {string[]} */
  const chain = [];
  let d = resolve(start);
  for (;;) {
    chain.push(d);
    const parent = dirname(d);
    if (parent === d) break; // filesystem root
    d = parent;
  }
  const repoRootIdx = chain.findIndex((dir) => existsSync(join(dir, '.git')));
  return repoRootIdx === -1 ? [chain[0]] : chain.slice(0, repoRootIdx + 1);
}

/**
 * Every manifest rule matched inside `dir`, reading its entries once.
 * @param {string} dir
 * @returns {{kind: 'exact'|'ext', name?: string, ext?: string, language: string}[]}
 */
function matchesIn(dir) {
  /** @type {string[]} */
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // an unreadable directory has no manifest, not an error this module raises
  }
  return MANIFEST_RULES.filter((r) => (
    r.kind === 'exact' ? entries.includes(/** @type {string} */ (r.name)) : entries.some((e) => e.endsWith(/** @type {string} */ (r.ext)))
  ));
}

/**
 * The `language-unsupported` refusal, shaped exactly like `src/authorjob.js`'s
 * own `Refusal` — same `REFUSAL_LIB`, same `request-red` code, so a caller
 * holding a spine can hand it straight to `refusalEvents()` without this
 * module inventing a second recording shape.
 * @param {string} language @param {string} manifest
 * @returns {LangRefusal}
 */
function unsupportedRefusal(language, manifest) {
  const detail = `We can't run this kind of job yet: the nearest manifest is ${manifest}, which names "${language}" `
    + `as this repository's language. The catalogue only has ${GENRE} genre data for ${GENRE_LANGUAGES.join(' and ')} `
    + `today — a language it has no data for must refuse rather than author a close without the guards it cannot `
    + 'supply.';
  return {
    kind: 'request-red',
    verb: 'language-unsupported',
    path: 'lang',
    detail,
    options: [
      `wait for a later build to add ${language} (PRD item 33 M3b)`,
      `restate the job for ${GENRE_LANGUAGES.join(' or ')}, the languages this catalogue currently measures`,
    ],
    red: {
      code: 'request-red', path: 'lang', detail, verb: 'language-unsupported', lib: REFUSAL_LIB, category: REFUSAL_CATEGORY,
    },
  };
}

/**
 * Detect a code job's language from its repository, $0, no provider.
 *
 * @param {string} sourcePath the Source path (a folder, or a file inside one)
 * @returns {{kind: 'resolved', lang: string, dir: string, manifest: string} | {kind: 'language-unsupported', language: string, dir: string, manifest: string, refusal: LangRefusal} | {kind: 'no-code-job'} | {kind: 'ambiguous', candidates: string[], dir: string}}
 */
export function detectLanguage(sourcePath) {
  const st = statSync(sourcePath);
  const start = st.isDirectory() ? sourcePath : dirname(sourcePath);
  const chain = walkChain(start);

  for (const dir of chain) {
    const matched = matchesIn(dir);
    if (!matched.length) continue;

    const languages = [...new Set(matched.map((m) => m.language))];
    if (languages.length > 1) {
      // Ruling 3, point (3): two manifests at the same level. Named literally
      // rather than the spec's minimal "two supported languages" example —
      // ANY two different languages at the nearest level is an unresolved
      // pick, listed rather than silently narrowed to the supported ones.
      return { kind: 'ambiguous', candidates: languages.sort(), dir };
    }

    const language = languages[0];
    const manifest = ruleLabel(/** @type {any} */ (matched.find((m) => m.language === language)));
    if (GENRE_LANGUAGES.includes(language)) {
      return { kind: 'resolved', lang: language, dir, manifest };
    }
    return {
      kind: 'language-unsupported', language, dir, manifest, refusal: unsupportedRefusal(language, manifest),
    };
  }

  return { kind: 'no-code-job' };
}
