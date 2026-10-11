// rewritten-from: fwdloop src/provider.js@f9449e8 (`effectiveModels`, `tickedLines`)
// PANEL-BUILD.md P4b / P8 — the Providers rows, driven by the keys file. NOTHING here is a
// hardcoded provider list, model, address or price: one row exists per key in
// `~/.config/bareloop/.env` that has a value; each row's API shape / Base URL / old-max_tokens
// tick come from config.json `keys.<ENV NAME>` and its model lines from `models.<ENV NAME>`
// (src/config.js), else the plain defaults below (shape `openai-api`, no address, no lines).
// A row's API shape names a `src/providers.js` table entry (`PROVIDER_TABLE`); its Base URL is
// that provider's `baseUrl` option.
//
// This module is also THE one owner of "model -> key + shape + URL": Chat's Model menu,
// the author doors and the run doors all resolve through `findRow` / `keyNameFor` /
// `applyConfiguredKey` / `modelChoiceFor` below — no second lookup exists. Key VALUES
// never pass through here — only names.
import { readConfig } from './config.js';
import { filledKeyNames } from './keysfile.js';
import { SHAPES } from './providershapes.js';

export { SHAPES };

/** What a row with nothing saved reads as: no vendor is assumed. */
const DEFAULT_SHAPE = 'openai-api';

/**
 * A key line whose value is the word `null` is SET and means "no real key": the row exists and
 * the provider is handed this harmless stand-in (local servers ignore auth). It is not a
 * secret and is never shown or logged as a key.
 */
export const NO_KEY_PLACEHOLDER = 'no-key-needed';

/**
 * The key value to hand a provider: the `null` marker becomes the placeholder, anything else
 * passes through unchanged.
 * @template {string|undefined} T
 * @param {T} raw
 * @returns {T|string}
 */
export function usableKey(raw) {
  return raw === 'null' ? NO_KEY_PLACEHOLDER : raw;
}

/**
 * @typedef {object} ModelLine one model line of a row (`models.<ENV>` in config.json)
 * @property {string} model the model id
 * @property {boolean} use ticked = offered in Chat (needs both prices)
 * @property {number} [inPerM] the customer's own price, USD per 1M input tokens
 * @property {number} [outPerM] the same, for output tokens
 */

/** @typedef {{ rates: { in: number, out: number }, inPerM: number, outPerM: number, envName: string }|null} PriceResult */

/**
 * @typedef {object} KeyRow
 * @property {string} envName the key variable NAME (read-only label; never a value)
 * @property {string} provider the `src/providers.js` table entry (the API shape's id)
 * @property {string} baseUrl the saved Base URL ('' = none typed yet)
 * @property {boolean} legacyMaxTokens the "old max_tokens" tick (only meaningful on `openai-api`)
 * @property {ModelLine[]} models the row's model lines
 */

const isPrice = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * The model lines of a row, pure (no I/O, no rewrite of the file). A row WITH `models.<ENV>` uses
 * that list and ignores `keys.<ENV>.{name,priceInPerM,priceOutPerM}`. A row WITHOUT it whose
 * `keys.<ENV>.name` is a non-empty saved string reads as ONE line: ticked when BOTH older prices
 * are finite numbers >= 0 (the line carries them), else UNTICKED with no price (a ticked line
 * needs both prices). A row with no saved name reads as no lines — nothing is carried from a
 * built-in table.
 * @param {string} envName
 * @param {Record<string, any>} config
 * @returns {ModelLine[]}
 */
export function effectiveModels(envName, config) {
  const models = config?.models;
  if (models && typeof models === 'object' && Object.hasOwn(models, envName) && Array.isArray(models[envName])) {
    return models[envName].map((/** @type {ModelLine} */ l) => ({ ...l }));
  }
  const s = config?.keys?.[envName];
  if (!s || typeof s !== 'object' || typeof s.name !== 'string' || s.name === '') return [];
  return isPrice(s.priceInPerM) && isPrice(s.priceOutPerM)
    ? [{ model: s.name, use: true, inPerM: s.priceInPerM, outPerM: s.priceOutPerM }]
    : [{ model: s.name, use: false }];
}

/** @param {ModelLine} l @returns {boolean} a line Chat may offer: ticked and priced */
export const isTickedLine = (l) => l.use === true && isPrice(l.inPerM) && isPrice(l.outPerM);

/**
 * Every ticked-and-priced line of the rows, in keys-file order.
 * @param {readonly KeyRow[]} rows
 * @returns {{ row: KeyRow, line: ModelLine }[]}
 */
export function tickedLines(rows) {
  return rows.flatMap((row) => row.models.filter(isTickedLine).map((line) => ({ row, line })));
}

/**
 * The rows: one per name in `filled`, saved entry over defaults.
 * @param {{ filled: readonly string[], config: Record<string, any> }} src
 * @returns {KeyRow[]}
 */
export function keyRows({ filled, config }) {
  const saved = config?.keys && typeof config.keys === 'object' && !Array.isArray(config.keys) ? config.keys : {};
  return filled.map((envName) => {
    const s = saved[envName] && typeof saved[envName] === 'object' ? saved[envName] : {};
    const provider = SHAPES.some((x) => x.id === s.shape) ? s.shape : DEFAULT_SHAPE;
    return {
      envName,
      provider,
      baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : '',
      legacyMaxTokens: s.legacyMaxTokens === true && provider === 'openai-api',
      models: effectiveModels(envName, config),
    };
  });
}

/**
 * The key names that make rows: every key in the keys file with a value (file order), plus — when `env` is given — a key only the
 * SHELL holds that config already names (`keys.<ENV>` or `models.<ENV>`), sorted after them. The page shows such a row as
 * "found in shell"; the run path must resolve it the same way.
 * @param {readonly string[]} filled the keys file's filled names
 * @param {Record<string, any>} config
 * @param {Record<string, string|undefined>} [env] the shell side
 * @returns {string[]}
 */
export function rowNamesOf(filled, config, env) {
  if (!env) return [...filled];
  const named = new Set([...Object.keys(config?.keys ?? {}), ...Object.keys(config?.models ?? {})]);
  const shellOnly = [...named].filter((n) => !filled.includes(n) && typeof env[n] === 'string' && env[n] !== '').sort();
  return [...filled, ...shellOnly];
}

/**
 * The rows for a keys home. `undefined` home (a door that skipped the keys file) = no rows. With `env`, a shell-only key that
 * config names is a row too ({@link rowNamesOf}).
 * @param {string|undefined} home
 * @param {Record<string, string|undefined>} [env]
 * @returns {KeyRow[]}
 */
export function rowsForHome(home, env) {
  if (home === undefined) return [];
  const config = readConfig({ home }).config;
  return keyRows({ filled: rowNamesOf(filledKeyNames(home), config, env), config });
}

/**
 * EVERY row a config home names, keyed or not: the keys file's filled names plus every name `keys.<ENV>` / `models.<ENV>` carries. For
 * a readout that must say which variable a model line WOULD read ("KEY is not set in this shell") before any key exists. Never for a run.
 * @param {string|undefined} home
 * @returns {KeyRow[]}
 */
export function namedRowsForHome(home) {
  if (home === undefined) return [];
  const config = readConfig({ home }).config;
  const named = [...new Set([...Object.keys(config?.keys ?? {}), ...Object.keys(config?.models ?? {})])];
  const filled = filledKeyNames(home);
  return keyRows({ filled: [...filled, ...named.filter((n) => !filled.includes(n))], config });
}

/**
 * An endpoint in comparable form: scheme + host lower-cased, trailing slashes dropped. A blank
 * Base URL is blank — there is no default host.
 * @param {string} provider
 * @param {string|null|undefined} baseUrl
 * @returns {string}
 */
export function endpointOf(provider, baseUrl) {
  void provider;
  const raw = (typeof baseUrl === 'string' ? baseUrl : '').trim();
  if (raw === '') return '';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch { return raw.replace(/\/+$/, ''); }
}

/**
 * A job's provider in plain words for a refusal line: the host its Base URL points at (else the
 * shape's label), plus the model when the spec names one. Never a key, a path or a status code.
 * @param {{provider?: string, baseUrl?: string|null, model?: string|null}} spec
 * @returns {string}
 */
export function providerInWords(spec) {
  const provider = String(spec?.provider ?? '');
  const url = endpointOf(provider, spec?.baseUrl ?? null);
  let host = '';
  try { host = new URL(url).host; } catch { host = ''; }
  if (host === '') host = SHAPES.find((s) => s.id === provider)?.label ?? provider;
  const model = typeof spec?.model === 'string' ? spec.model.trim() : '';
  return model !== '' ? `${host}, ${model}` : host;
}

/**
 * Which row a `(provider, baseUrl[, model])` identity belongs to: the rows on that shape and
 * endpoint; when several share it, the one that HAS a ticked-and-priced line for `model`, else
 * the first.
 * @param {readonly KeyRow[]} rows
 * @param {{ provider?: string|null, baseUrl?: string|null, model?: string|null }} id
 * @returns {KeyRow|null}
 */
export function findRow(rows, { provider, baseUrl, model }) {
  if (typeof provider !== 'string') return null;
  const want = endpointOf(provider, baseUrl);
  const same = rows.filter((r) => r.provider === provider && endpointOf(r.provider, r.baseUrl) === want);
  if (same.length === 0) return null;
  return (model ? same.find((r) => r.models.some((l) => l.model === model && isTickedLine(l))) : undefined) ?? same[0];
}

/**
 * How a Model-menu pick resolves: the row named by `provider` (its key's env name) with a ticked-and-priced line for `model`.
 * With no `provider` (an older caller) the first row ticking the model. `baseUrl` is absent when blank, exactly as a spec omits it.
 * A model no row ticks, or a row that does not tick it, is `null` — never offered, never run.
 * @param {readonly KeyRow[]} rows
 * @param {{ provider?: string|null, model?: string|null }} pick `provider` is the KEY's env name
 * @returns {{ provider: string, baseUrl?: string, envName: string, name: string, legacyMaxTokens: boolean }|null}
 */
export function modelChoiceFor(rows, { provider, model }) {
  if (typeof model !== 'string' || model === '') return null;
  const hit = tickedLines(rows).find((x) => x.line.model === model && (typeof provider === 'string' && provider !== '' ? x.row.envName === provider : true));
  if (!hit) return null;
  const r = hit.row;
  return { provider: r.provider, ...(r.baseUrl.trim() !== '' ? { baseUrl: r.baseUrl.trim() } : {}), envName: r.envName, name: hit.line.model, legacyMaxTokens: r.legacyMaxTokens };
}

/**
 * The lines Chat's Model menu offers: every ticked-and-priced line of the rows, in keys-file order, labelled `<KEY> · <model>`.
 * @param {readonly KeyRow[]} rows
 * @returns {{ slot: string, model: string, label: string }[]}
 */
export function chatLines(rows) {
  return tickedLines(rows).map(({ row, line }) => ({ slot: row.envName, model: line.model, label: `${row.envName} · ${line.model}` }));
}

/** The plain sentence when a stale Chat pick names a key and a model no row ticks (fwd's wording, bareloop's seam). */
export const REFUSE_NO_TICK = 'Tick a model in Settings > Providers. Nothing was spent.';
export const REFUSE_NO_PICK = 'Pick a model. Nothing was spent.';
/** @param {string} key @returns {string} */
export const refuseNotSetUp = (key) => `${key} is not set up: put its key in your keys file and type its Base URL in Settings > Providers. Nothing was spent.`;

/**
 * Judge a Model-menu pick `{provider, model}` against the rows, for the doors that start a session. `ok:true` carries the choice;
 * otherwise the plain refusal (one of the three sentences).
 * @param {readonly KeyRow[]} rows
 * @param {{ provider?: string|null, model?: string|null }} pick
 * @returns {{ ok: true, choice: NonNullable<ReturnType<typeof modelChoiceFor>> } | { ok: false, say: string }}
 */
export function judgePick(rows, pick) {
  if (typeof pick.model !== 'string' || pick.model === '') return { ok: false, say: tickedLines(rows).length === 0 ? REFUSE_NO_TICK : REFUSE_NO_PICK };
  const choice = modelChoiceFor(rows, pick);
  if (choice) return { ok: true, choice };
  const key = typeof pick.provider === 'string' ? pick.provider : '';
  if (key !== '' && !rows.some((r) => r.envName === key)) return { ok: false, say: refuseNotSetUp(key) };
  if (key !== '') return { ok: false, say: rows.find((r) => r.envName === key)?.models.some(isTickedLine) ? REFUSE_NO_PICK : REFUSE_NO_TICK };
  return { ok: false, say: tickedLines(rows).length === 0 ? REFUSE_NO_TICK : REFUSE_NO_PICK };
}

/**
 * The CLI sentence when a run names no model and the spec carries none (fwd's `pickTicked` sentence).
 */
export const REFUSE_NAME_MODEL = 'Name the model with --model <id>: one ticked in Settings > Providers with both prices.';

/**
 * Which Settings line a RUN works on. A spec's own `model` wins; a spec that names none (signed before models were required)
 * takes `--model <id>`; a spec with no `baseUrl` (the same era) matches a row on any endpoint of its shape. `--provider <KEY>`
 * narrows to one key when two keys tick the same id. Pure; the signed spec is never changed, so its hash is untouched.
 * @param {readonly KeyRow[]} rows
 * @param {{ provider?: string|null, baseUrl?: string|null, model?: string|null }} spec the signed spec's worker fields
 * @param {{ model?: string|null, provider?: string|null }} [flags] the operator's `--model` / `--provider`
 * @returns {{ ok: true, row: KeyRow, line: ModelLine, model: string, baseUrl: string|undefined } | { ok: false, say: string }}
 */
export function resolveWorker(rows, spec, flags = {}) {
  const model = typeof spec.model === 'string' && spec.model !== '' ? spec.model : (typeof flags.model === 'string' && flags.model !== '' ? flags.model : '');
  if (model === '') return { ok: false, say: REFUSE_NAME_MODEL };
  const want = typeof spec.baseUrl === 'string' && spec.baseUrl.trim() !== '' ? endpointOf(String(spec.provider), spec.baseUrl) : null;
  const key = typeof flags.provider === 'string' && flags.provider !== '' ? flags.provider : null;
  const hits = tickedLines(rows).filter(({ row, line }) => row.provider === spec.provider && line.model === model
    && (want === null || endpointOf(row.provider, row.baseUrl) === want) && (key === null || row.envName === key));
  if (hits.length === 0) return { ok: false, say: refuseNotSetUp(model) };
  const names = [...new Set(hits.map((h) => h.row.envName))];
  if (names.length > 1) return { ok: false, say: `${model} is ticked on more than one key (${names.join(', ')}): name one with --provider <KEY>. Nothing was spent.` };
  const { row, line } = hits[0];
  return { ok: true, row, line, model, baseUrl: row.baseUrl.trim() !== '' ? row.baseUrl.trim() : undefined };
}

/**
 * The key variable NAME a job on `(provider, baseUrl[, model])` reads: the matching row's own env name. There is NO built-in
 * name: no matching row = no key (`name: null`).
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @param {readonly KeyRow[]} rows
 * @param {string|null|undefined} [model]
 * @returns {{ name: string|null, chosen: boolean }}
 */
export function keyNameFor(provider, baseUrl, rows, model) {
  const row = findRow(rows, { provider, baseUrl, model });
  return row ? { name: row.envName, chosen: true } : { name: null, chosen: false };
}

/**
 * The key VALUE for a row's env name out of an env (the `null` no-key marker becomes {@link NO_KEY_PLACEHOLDER}); `undefined`
 * when the row's variable is unset or empty.
 * @param {Record<string,string|undefined>} env
 * @param {string|null|undefined} envName
 * @returns {string|undefined}
 */
export function keyValueOf(env, envName) {
  if (typeof envName !== 'string') return undefined;
  const v = env[envName];
  return v === undefined || v === '' ? undefined : usableKey(v);
}

/**
 * A per-1M price for a readout: two decimals at least ($1.20), more when the number needs them so a
 * tiny price never rounds to $0.00 or $0.01 ($0.006, $0.0004).
 * @param {number} n USD per 1M tokens
 * @returns {string}
 */
function perMoney(n) {
  const shown = String(n);
  if (!shown.includes('e') && (shown.split('.')[1] ?? '').length >= 2) return `$${shown}`;
  if (shown.includes('e')) return `$${n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')}`;
  return `$${n.toFixed(2)}`;
}

/**
 * The one readout line for a resolved customer price, preview and run tail alike:
 * `yours: in $0.006 / out $1.20 per 1M tokens (DEEPSEEK_API_KEY row)`. A 0 / 0 price is accepted (the price
 * is the customer's) but the line says so: every round then books $0, so spend and limits read $0.
 * @param {{ inPerM: number, outPerM: number, envName: string }} price a {@link ratesFor} result
 * @returns {string}
 */
export function priceReadout(price) {
  const zero = price.inPerM === 0 && price.outPerM === 0 ? ' — WARNING: this price is $0, so spend and limits read $0' : '';
  return `yours: in ${perMoney(price.inPerM)} / out ${perMoney(price.outPerM)} per 1M tokens (${price.envName} row)${zero}`;
}

/**
 * The customer's own price for the model LINE of the row a `(provider, baseUrl[, model])` identity
 * belongs to — the SAME row match {@link keyNameFor} uses (`findRow`), so the price and the key
 * always come from one row. With a `model`, the row's line of that name; without one, the row's
 * first ticked line. `null` = no price set (the run keeps bare-agent's built-in guess). A line's
 * price is a pair or nothing ({@link modelsProblem} guards the file), so a half price never
 * reaches here. `rates` is bare-agent's `Loop({ rates })` shape (USD per 1K); `inPerM`/`outPerM`
 * are what a readout prints.
 * @param {string|null|undefined} provider
 * @param {string|null|undefined} baseUrl
 * @param {readonly KeyRow[]} rows
 * @param {string|null|undefined} [model]
 * @returns {{ rates: { in: number, out: number }, inPerM: number, outPerM: number, envName: string }|null}
 */
export function ratesFor(provider, baseUrl, rows, model) {
  const row = findRow(rows, { provider, baseUrl, model });
  if (!row) return null;
  const line = model ? row.models.find((l) => l.model === model) : row.models.find(isTickedLine);
  const r = line ? ratesOfLine(line) : null;
  return r ? { ...r, envName: row.envName } : null;
}

/**
 * A model line's own price in bare-agent's shape, or `null` when the line carries none (a price is a pair or nothing).
 * @param {ModelLine} line
 * @returns {{ rates: { in: number, out: number }, inPerM: number, outPerM: number }|null}
 */
export function ratesOfLine(line) {
  if (!isPrice(line.inPerM) || !isPrice(line.outPerM)) return null;
  const inPerM = /** @type {number} */ (line.inPerM);
  const outPerM = /** @type {number} */ (line.outPerM);
  return { rates: { in: inPerM / 1000, out: outPerM / 1000 }, inPerM, outPerM };
}

/**
 * The row a judge's key and endpoint come from: the worker's own row when the judge shares the worker's API shape, else the judge
 * shape's row that ticks the judge's model (else the first row of that shape). `null` when no row is on that shape.
 * @param {readonly KeyRow[]} rows
 * @param {{ provider: string, model?: string|null }} judge
 * @param {string|null|undefined} workerProvider
 * @param {KeyRow|null} workerRow
 * @returns {KeyRow|null}
 */
export function judgeRowFor(rows, judge, workerProvider, workerRow) {
  if (judge.provider === workerProvider && workerRow) return workerRow;
  const onShape = rows.filter((r) => r.provider === judge.provider);
  return onShape.find((r) => r.models.some((l) => l.model === judge.model && isTickedLine(l))) ?? onShape[0] ?? null;
}

/**
 * The price a judge's rounds are booked at. A price belongs to the MODEL's line: when the judge is
 * the worker's own provider it calls the worker's endpoint, so a row on that endpoint with a line
 * NAMED for the judge's model prices it ({@link ratesFor}); a judge model that is absent or names
 * no line there keeps the worker's price (the worker's row, or none = the guess). A different
 * provider resolves with no endpoint. The judge's KEY is chosen elsewhere (`applyConfiguredKey`,
 * by the worker's model), so the two can come from different rows.
 * @param {{ provider: string, model?: string|null }} judge
 * @param {string|null|undefined} workerProvider
 * @param {string|null|undefined} workerBaseUrl
 * @param {ReturnType<typeof ratesFor>} workerPrice what the worker's own rounds are booked at
 * @param {readonly KeyRow[]} rows
 * @returns {ReturnType<typeof ratesFor>}
 */
export function judgeRatesFor(judge, workerProvider, workerBaseUrl, workerPrice, rows) {
  if (judge.provider !== workerProvider) return ratesFor(judge.provider, undefined, rows, judge.model);
  const want = endpointOf(judge.provider, workerBaseUrl);
  const named = judge.model ? rows.some((r) => r.provider === judge.provider && endpointOf(r.provider, r.baseUrl) === want && r.models.some((l) => l.model === judge.model)) : false;
  return named ? ratesFor(judge.provider, workerBaseUrl, rows, judge.model) : workerPrice;
}
