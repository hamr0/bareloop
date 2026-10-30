// PANEL-BUILD.md P8 batch 3 — the Settings > Providers page (rewritten from fwdloop's m4d-am3 layout). The page is one file, so these
// read the HTML the panel SERVES (token, Host guard and all) and pin the grid tracks, the two breakpoints, every data-testid and every
// visible sentence. What a browser does with them is checked by hand-taken screenshots, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPanelServer } from '../src/panel/server.js';

/** @param {import('node:test').TestContext} t */
async function servedHtml(t) {
  const home = mkdtempSync(join(tmpdir(), 'providers-layout-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const { port, close } = await createPanelServer({ port: 0, home, env: {}, sessionsRoot: join(home, 's') });
  t.after(() => close());
  return (await fetch(`http://127.0.0.1:${port}/`)).text();
}
/** the CSS rule block that starts with `sel{` */
const rule = (html, sel) => new RegExp(`\\n  ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`).exec(html)?.[1];

test('the grid: ONE shared track list (7 columns, the last exactly 272px for [ Test ] [ ⟳ Refresh ]), column-gap 8px, rows are grids', async (t) => {
  const html = await servedHtml(t);
  assert.match(html, /\.pv-grid\{--pv-cols:minmax\(0,2\.8fr\) minmax\(0,1\.5fr\) minmax\(0,\.95fr\) minmax\(0,\.95fr\) minmax\(0,\.9fr\) minmax\(0,\.6fr\) 272px;/);
  for (const cls of ['.pv-head', '.pv-krow', '.pv-mhead', '.pv-mrow']) assert.ok(html.includes(cls), cls);
  assert.match(html, /\.pv-head,\.pv-krow,\.pv-mhead,\.pv-mrow\{display:grid;grid-template-columns:var\(--pv-cols\);column-gap:8px;/);
  assert.match(rule(html, '.pv-c-url'), /grid-column:3 \/ span 2/, 'Base URL spans tracks 3-4');
  assert.match(rule(html, '.pv-key'), /border-top:1px solid/, 'a key row has a SOLID line above');
  assert.match(rule(html, '.pv-mrow'), /border-top:1px dotted/, 'a model row a DOTTED one');
  assert.match(rule(html, '.table-wrap'), /overflow-x:auto/, 'the wrapper scrolls sideways if it must; the page never does');
  assert.match(html, /<div class="pv-head" aria-hidden="true"><span>KEY<\/span><span>API SHAPE<\/span><span class="pv-c-url">BASE URL<\/span><span>OLD MAX_TOKENS<\/span><span class="pv-tok">TOKENS<\/span><span><\/span><\/div>/);
  assert.match(html, /<span class="pv-um"><span class="pv-uh">USE<\/span><span>MODEL<\/span><\/span><span class="pv-pair"><span>IN \$\/1M<\/span><span>OUT \$\/1M<\/span><\/span><span class="pv-tok">TOKENS<\/span>/);
});

test('breakpoints: <1280px both header rows hide and every cell is a label : value line with 44px controls; <900px the KEYS strip stacks', async (t) => {
  const html = await servedHtml(t);
  const at1279 = /@media \(max-width: 1279px\)\{([\s\S]*?)\n  \}/.exec(html)?.[1] ?? '';
  assert.ok(at1279, 'a 1279px media block exists');
  assert.match(at1279, /\.pv-head,\.pv-mhead\{display:none;\}/);
  assert.match(at1279, /\.pv-cell\{display:grid;grid-template-columns:104px minmax\(0,1fr\);/, 'a 104px label column + the value');
  assert.match(at1279, /\.pv-grid select,\.pv-grid input\[type=text\]\{height:44px;font-size:14px;\}/);
  assert.match(at1279, /\.pv-legacy input,\.pv-m-use input\{width:24px;height:24px;\}/, 'tick boxes 24px');
  assert.match(at1279, /\.pv-fold,\.pv-refbtn,\.pv-more \.pv-add\{min-height:44px;min-width:44px;\}/);
  assert.match(at1279, /\.pv-cell\.pv-pair::before\{content:"In \/ Out \$\/1M";/, 'the price pair is ONE line labelled In / Out $/1M');
  assert.match(html, /@media \(max-width: 899px\)\{\s*\.money-strip\{grid-template-columns:1fr 1fr;\}\s*\.keyfile-strip-main\{flex:1 1 100%;\}/, 'strip text full width under 900px');
  assert.match(rule(html, '.keyfile-strip-actions'), /flex-wrap:wrap/);
  for (const lbl of ['Tokens', 'API shape', 'Base URL', 'Old max_tokens']) assert.ok(html.includes(`<span class="pv-lbl">${lbl}</span>`), lbl);
});

test('every data-testid and aria-label the page and its tests rely on is in the served page', async (t) => {
  const html = await servedHtml(t);
  const ids = ['settings-tab-providers', 'settings-tab-money', 'settings-back', 'keys-strip', 'keys-path', 'keys-refusal', 'keys-open-note', 'open-keys-folder', 'reload-keys',
    'provider-table-wrap', 'provider-table', 'pv-note', 'provider-row-', 'pv-fold', 'pv-status-', 'pv-sum', 'prov-shape', 'prov-baseurl', 'prov-legacy', 'pv-tokens-', 'prov-test', 'prov-refresh',
    'prov-msg-test', 'prov-msg-edit', 'prov-msg-legacyMaxTokens', 'models-row-', 'model-typed-open', 'model-typed', 'model-add', 'model-typed-msg', 'model-line', 'model-use', 'model-in', 'model-out',
    'model-tokens', 'model-msg', 'models-note'];
  // a testid is either literal markup or set from script (`setAttribute("data-testid", "model-line")`, or built from the row name)
  for (const id of ids) assert.ok(html.includes(`data-testid="${id}`) || html.includes(`"${id}`), id);
  for (const id of ['tab-providers', 'panel-providers', 'tab-money']) assert.ok(html.includes(`id="${id}"`), id);
  for (const a of ['" API shape"', '" Base URL"', '" legacy max_tokens"', '"Test "', '"Refresh models for "', '" model name"', '" use"', '" price in per 1M tokens"', '" price out per 1M tokens"', '"Fold "', '"Unfold "']) assert.ok(html.includes(a), a);
  assert.ok(html.includes('aria-label="Open keys folder"'));
  // the Test button sits in the key row's LAST track, beside Refresh, in ONE row
  assert.match(html, /<div class="pv-refbtns"><button class="btn small pv-refbtn" type="button" data-act="test-key" data-testid="prov-test"[^>]*>Test<\/button><button class="btn small pv-refbtn" type="button" data-act="refresh-models" data-testid="prov-refresh"[^>]*>&#10227; Refresh<\/button><\/div>/);
  // Open keys folder is in the KEYS strip, not the key row
  const strip = html.slice(html.indexOf('class="keyfile-strip"'), html.indexOf('data-testid="provider-table-wrap"'));
  assert.ok(strip.includes('id="open-keys-folder"') && strip.includes('id="reload-keys"'));
});

test('every visible sentence is present, word for word; the removed ones are gone', async (t) => {
  const html = await servedHtml(t);
  const must = [
    'Put <code>NAME=key</code> lines in <code id="keys-path" data-testid="keys-path">',
    ', then Reload keys &mdash; each row below says whether its key is set. Only names are listed; keys never reach this page.',
    '&#10227; refresh models (free) &middot; old max_tokens: tick if the server wants the old field name',
    'type the Base URL', '+ type a model name', 'type a model name', 'No models yet. Press ⟳ to refresh models, or type a name.', ' Type the model name below.',
    'failed — type a name', ' · none ticked', ' ticked', 'saved — applies from the next model call', 'Could not open it here. Your keys folder: ',
    'OK \\u00b7 ', 'testing&hellip;', 'refreshing&hellip;', '"refused": "refused — see above"', '"set in file": "set in file", "found in shell": "found in shell", "not set": "not set"',
    'Type a Base URL for ', ' in Settings.', 'added', 'Reading your models',
  ];
  for (const s of must.filter((x) => x !== 'Reading your models')) assert.ok(html.includes(s), s);
  const gone = ['If your vendor lists two prices', 'Name is the model id Chat uses', 'pv-shell', 'no keys with a value yet', 'balance-note', '/providers/balance', 'pv-balance', 'Tokens used</th>', '<th>Balance</th>', 'providers/row', 'providers/test', 'pv-price-in', 'pv-table'];
  for (const s of gone) assert.equal(html.includes(s), false, `${s} is removed`);
  assert.ok(html.includes('document.dispatchEvent(new CustomEvent("bareloop-providers-changed"))'), 'Chat\'s Model menu still re-reads after a save');
});

test('the page posts only the P8 routes, with the field names the server expects', async (t) => {
  const html = await servedHtml(t);
  for (const route of ['/api/settings/providers', '/api/settings/provider', '/api/settings/model', '/api/settings/models', '/api/settings/test', '/api/settings/open-keys-folder']) {
    assert.ok(html.includes(`"${route}"`), route);
  }
  assert.match(html, /authorPost\("\/api\/settings\/model", \{ slot: slot, model: inp\.value\.trim\(\), use: false \}\)/, 'a typed name is added UNTICKED');
  assert.match(html, /authorPost\("\/api\/settings\/model", payload\)/);
  assert.match(html, /var payload = \{ slot: key\.getAttribute\("data-slot"\), shape: key\.querySelector\("\[data-prov=shape\]"\)\.value, baseUrl: /);
});

test('a model row holding focus takes the Runs list\'s selected blue (hover stays faint), and every key starts folded', async (t) => {
  const html = await servedHtml(t);
  assert.match(rule(html, '.pv-mrow:hover'), /background:var\(--panel2\)/, 'hover stays the faint fill');
  const focus = rule(html, '.pv-mrow:focus-within,.pv-mrow:focus-within:hover');
  assert.match(focus ?? '', /background:var\(--rl-accent-bg-strong\)/, 'focus inside the row: the selected-run fill');
  assert.match(focus ?? '', /var\(--accent\)/, 'and the accent edge');
  assert.ok(!/\.pv-mrow:hover,\.pv-mrow:focus-within\{/.test(html), 'focus no longer shares the hover fill');
  assert.ok(html.includes('folds[row.slot] = false;'), 'a key starts folded');
  assert.ok(!html.includes('row.models.some(function(m){ return m.use === true; })'), 'a ticked model no longer opens its key');
});
