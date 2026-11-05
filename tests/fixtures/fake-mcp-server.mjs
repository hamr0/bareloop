// borrowed-from: fwdloop test/fixtures/fake-mcp-server.mjs@cdcde84 (bareloop addition: FAKE_PLANT appends a planted text to the ticket body)
// A tiny fake MCP server for the M12 piece 1 tests (stdio, newline JSON-RPC). No network. Behaviour comes from the env its .mcp.json entry sets:
//   FAKE_MCP_SERVER  must be '1' (else it exits 0 at once, so `node --test` does not hang on it)
//   FAKE_TOOLS  JSON list of {name, annotations?}   (default: issue_read + list_issues, both readOnlyHint true)
//   FAKE_REPLY  'ok' (default) | 'device' (GitHub's device-login text) | 'empty' | 'error'
//   FAKE_CALLS  a file path; each tools/call appends one JSON line {name, arguments}
//   FAKE_PR_HEAD / FAKE_PR_BASE  the head and base sha `pull_request_read` (method get) answers with; FAKE_PR_HEADS 'a,b,..' = the head of the 1st, 2nd... read (a PR that moves);
//               FAKE_PR_NOHEAD=1 omits `head`. The reply has the keys of the real GitHub server's (measured 2026-11-04), plus FAKE_PLANT in the body.
//   FAKE_ISSUE  a JSON object merged over the issue_read reply (R5: labels, state); a value "__omit__" drops that key
//   FAKE_LIST   a file path holding JSON [{number, state, labels, ...}], newest first (M12 piece 2); list_issues pages it like GitHub's (perPage, after = offset, state filter),
//               re-read on every call so a test changes it between looks
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

// `node --test` runs every .mjs under test/ as a test file; without this, that run would sit on stdin forever. A spawner's .mcp.json env sets FAKE_MCP_SERVER=1.
if (process.env.FAKE_MCP_SERVER !== '1') process.exit(0);
import { createInterface } from 'node:readline';

const tools = JSON.parse(process.env.FAKE_TOOLS ?? JSON.stringify([
  { name: 'issue_read', annotations: { readOnlyHint: true } }, { name: 'list_issues', annotations: { readOnlyHint: true } }, { name: 'pull_request_read', annotations: { readOnlyHint: true } },
]));
const reply = process.env.FAKE_REPLY ?? 'ok';
const send = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') return send(m.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '0' } });
  if (m.method === 'tools/list') return send(m.id, { tools: tools.map((t) => ({ ...t, inputSchema: { type: 'object', properties: {} } })) });
  if (m.method === 'tools/call') {
    if (process.env.FAKE_CALLS) appendFileSync(process.env.FAKE_CALLS, `${JSON.stringify({ name: m.params.name, arguments: m.params.arguments })}\n`);
    if (reply === 'device') return send(m.id, { content: [{ type: 'text', text: 'Visit https://github.com/login/device and enter the code AAAA-BBBB to authorize the GitHub MCP Server.\n\nAfter authorizing, retry your request.' }] });
    if (reply === 'empty') return send(m.id, { content: [] });
    if (reply === 'error') return send(m.id, { isError: true, content: [{ type: 'text', text: 'Could not resolve to a Repository\nsecond line' }] });
    if (m.params.name === 'list_issues' && process.env.FAKE_LIST) {
      const a = m.params.arguments;
      const all = JSON.parse(readFileSync(process.env.FAKE_LIST, 'utf8')).filter((i) => !a.state || i.state === a.state);
      const from = Number(a.after ?? 0);
      const issues = all.slice(from, from + (a.perPage ?? 30));
      const more = from + issues.length < all.length;
      return send(m.id, { content: [{ type: 'text', text: JSON.stringify({ issues, pageInfo: { hasNextPage: more, endCursor: String(from + issues.length) }, totalCount: all.length }) }] });
    }
    if (m.params.name === 'pull_request_read') {
      const a = m.params.arguments;
      const nth = process.env.FAKE_CALLS && existsSync(process.env.FAKE_CALLS) ? readFileSync(process.env.FAKE_CALLS, 'utf8').split('\n').filter((l) => l.includes('"pull_request_read"')).length - 1 : 0;
      const heads = (process.env.FAKE_PR_HEADS ?? '').split(',').filter(Boolean);
      const sha = heads.length ? heads[Math.min(nth, heads.length - 1)] : (process.env.FAKE_PR_HEAD ?? '70f268580000000000000000000000000000abcd');
      const pr = {
        number: a.pullNumber, title: 'Bump the thing', body: `Updates the thing.${process.env.FAKE_PLANT ? ` token ${process.env.FAKE_PLANT}` : ''}`, state: 'open', draft: false, merged: false, mergeable_state: 'clean',
        html_url: `https://github.com/${a.owner}/${a.repo}/pull/${a.pullNumber}`, user: { login: 'dependabot[bot]' }, labels: [{ name: 'dependencies' }],
        ...(process.env.FAKE_PR_NOHEAD ? {} : { head: { sha, ref: 'dependabot/npm/thing', label: 'x:dependabot/npm/thing' } }),
        base: { sha: process.env.FAKE_PR_BASE ?? 'b'.repeat(40), ref: 'main' }, additions: 3, deletions: 1, changed_files: 2, commits: 1, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
      };
      return send(m.id, { content: [{ type: 'text', text: JSON.stringify(pr) }] });
    }
    const issue = JSON.parse(`{"number":${m.params.arguments.issue_number},"title":"Crash on tap","state":"open","body":"Tap the back arrow${process.env.FAKE_PLANT ? ` token ${process.env.FAKE_PLANT}` : ''}","labels":[{"name":"P2"}]}`);
    // FAKE_ISSUE: a JSON object merged over the issue (R5: other labels / state); a key set to the string "__omit__" is left out (GitHub omits `labels` when there are none)
    for (const [k, v] of Object.entries(JSON.parse(process.env.FAKE_ISSUE ?? '{}'))) { if (v === '__omit__') delete issue[k]; else issue[k] = v; }
    return send(m.id, { content: [{ type: 'text', text: JSON.stringify(issue) }] });
  }
  return undefined;
});
