// Idea A core fixtures (docs/product/ITEM33-BUILD.md section 8): REAL saved pages (barebrowse captures made for the idea A POC), the AI's
// REAL saved map for each, and the golden output - the POC run with its OUT rules off (.claude/scratch/idea-a-core/golden.mjs). Each file's
// sha256 is pinned here: a fixture is never edited, and an edit fails the suite. Not a test file (no `.test.js`).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'idea-a');

/** page key -> sha256 of the page, of the saved map, of the golden output */
export const HASHES = {
  sfo1: ['fa50de61c18c0c14af5ab0dc6d11cd7baa169b1e3e9a18f8a60cc29712206af7', 'c5b5d90c0d742d4aeb281b8a769ae534733bf8d25bec43f90d2582a8d6766ae0', '0b8b40cfabb99d9e328a68e5acc6d3eb42b5c51aec181c32791540dd5dd97456'],
  sfo2: ['1ee1341b6006cc8f54d524ed2786f5903975f3bebbc80ff293849b1cfcd3f03f', '5724536acb73501aa26a5e234fb4c32838b291d04205554dd2c175217f303c4c', '3103b119ca14554db1572fab6c4b7f630ddae9bca7383c54d68c672f356020df'],
  'ord-den': ['cc8e416476ed42e3c26b6d06ea5434b9e1da1d427830c17510fb6314b6edd7c1', '5b1e88d2ff022f660650eb814c601017fde4356d92024a3f88dad31690a0e548', '5c88f7e34d360f432398fb02cfdefa01b835681bb6717bee8f4cd0e48fcce76c'],
  'jfk-lax': ['25a445265d6455b92e736a8c004b842e3bdfab10ca3cac55c2de758c8cb58c35', '262109d795a03672e0beafa04752dec5d280346e97535f48ac777037f6b720ae', '228e8d495c10898bcf7b51398a41a2174a895567191bb1adfec184594875b5b6'],
  'lax-jfk': ['eb85a6b4260879021c44320c5afd6699aa80cc8872519e4832930b5867802424', '4bd88b0baf42ddec2733c9bad6980f85602d1f96763ea46ba3041a8ebe64d8e4', '0cbca4b1461d959a8b643095015dd0a0041300e3d66617050e54f930ff3855e7'],
  'bos-ord': ['2730b4733e9003afb1239c8b73f0fdb0f53545a512fc07fc5dcfa78977d79be2', '134d8275c09f294309c107fff4ade0dd236effbd1ebab78aa6537c7f48e661e7', 'd9c9bbcb5d6252c3a1f72cb7c4ad636e93317785bfb101882e5ca4958ada6936'],
  'airbnb-lisbon': ['440ede09fb76fdc85b041a47ba773d757569cdc3b80afa609e838df8e93d1c81', 'c7374038dca30f11e251bff699bd26cb6528b948d3aacfb8a049aee5731252d0', '07335e033b3cb88ac232d3e0edde81babce5dc0d23a8a9b76325f2e13a036e36'],
  'airbnb-porto': ['4c7686659b79698232ab5156fe14c71b6cc1f78b7fb2d29350ea707b4a6131b3', 'bef3cfd3e555da94504041c5706e132af2969b20acac96da498407b1507b28a5', 'ae46e0631c8e3a3474ff525473bcc3ceac74f86c0c4edebad2e7fd4248137730'],
};
export const PAGE_KEYS = Object.keys(HASHES);

/** @param {string} name @param {string} want */
function readPinned(name, want) {
  const buf = readFileSync(join(DIR, name));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== want) throw new Error(`fixture ${name} changed: sha256 ${got}, pinned ${want}. A fixture is never edited.`);
  return buf.toString('utf8');
}

/** @param {string} key @returns {{page: string, map: any, mapText: string, golden: any}} */
export function loadFixture(key) {
  const [p, m, g] = HASHES[/** @type {keyof typeof HASHES} */ (key)];
  const mapText = readPinned(`${key}.map.json`, m);
  return { page: readPinned(`${key}.page.txt`, p), mapText, map: JSON.parse(mapText), golden: JSON.parse(readPinned(`${key}.golden.json`, g)) };
}

/** the job line each saved map was made for (the POC's own job words); the `~` rules are the POC's */
export const JOBS = {
  flights: [{ n: 1, text: 'List 3 flights from San Francisco to Los Angeles', rules: ['under $450', 'not a red-eye', 'nonstop'] }],
  airbnb: [{ n: 1, text: 'List 3 stays in Lisbon', rules: ['under €400 total', 'for 2 guests'] }],
};
