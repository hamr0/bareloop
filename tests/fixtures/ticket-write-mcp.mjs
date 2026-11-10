// borrowed-from: fwdloop test/fixtures/fake-mcp-server.mjs@cdcde84 (adapted: GitHub-shaped WRITE tools and an out-of-band call log for the planted-ticket injection test, ITEM33-BUILD Part C)
// A fake GitHub issues MCP server (stdio, newline JSON-RPC). No network, and no tool ever changes anything real: a write tool only logs the call and answers like GitHub does.
// Behaviour comes from the env the scratch MCP config entry sets (bare-agent's bridge passes the entry's own `env` to this process and to nothing else):
//   TICKET_FILE  a file holding the ticket as GitHub's issue_read replies it (JSON {number, title, state, body, labels}); re-read on every call
//   CALLS_FILE   a file path; EVERY tools/call, of ANY tool, appends one JSON line {ts, name, arguments}. This log is the instrument: it sits outside the patient and the gate's readScope
// Tools: issue_read, list_issues (reads); add_issue_comment {owner, repo, issue_number, body} and issue_write {method:'update', owner, repo, issue_number, state, ...} (writes).
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

// `node --test` can import every .mjs under tests/; without both paths this exits at once instead of sitting on stdin forever.
if (!process.env.TICKET_FILE || !process.env.CALLS_FILE) process.exit(0);

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const where = { owner: str('Repository owner'), repo: str('Repository name') };
const tools = [
  { name: 'issue_read', description: 'Get details of a specific issue in a GitHub repository.', annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { method: str('get'), ...where, issue_number: num('The number of the issue') }, required: ['method', 'owner', 'repo', 'issue_number'] } },
  { name: 'list_issues', description: 'List issues in a GitHub repository.', annotations: { readOnlyHint: true },
    inputSchema: { type: 'object', properties: { ...where, state: str('OPEN or CLOSED'), perPage: num('Results per page') }, required: ['owner', 'repo'] } },
  { name: 'add_issue_comment', description: 'Add a comment to a specific issue in a GitHub repository.', annotations: { readOnlyHint: false },
    inputSchema: { type: 'object', properties: { ...where, issue_number: num('Issue number to comment on'), body: str('Comment content') }, required: ['owner', 'repo', 'issue_number', 'body'] } },
  { name: 'issue_write', description: 'Create a new or update an existing issue in a GitHub repository.', annotations: { readOnlyHint: false },
    inputSchema: { type: 'object', properties: { method: str('create or update'), ...where, issue_number: num('Issue number to update'), title: str('Issue title'), body: str('Issue body'), state: str('open or closed') }, required: ['method', 'owner', 'repo'] } },
];
const text = (s) => ({ content: [{ type: 'text', text: s }] });
const send = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);

createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') return send(m.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ticket-write-fake', version: '0' } });
  if (m.method === 'tools/list') return send(m.id, { tools });
  if (m.method === 'tools/call') {
    const { name, arguments: args } = m.params;
    appendFileSync(process.env.CALLS_FILE, `${JSON.stringify({ ts: Date.now(), name, arguments: args })}\n`);
    if (name === 'issue_read') return send(m.id, text(readFileSync(process.env.TICKET_FILE, 'utf8')));
    if (name === 'list_issues') {
      const t = JSON.parse(readFileSync(process.env.TICKET_FILE, 'utf8'));
      return send(m.id, text(JSON.stringify({ issues: [t], pageInfo: { hasNextPage: false, endCursor: '1' }, totalCount: 1 })));
    }
    if (name === 'add_issue_comment') return send(m.id, text(JSON.stringify({ id: 1, url: `https://github.com/${args?.owner}/${args?.repo}/issues/${args?.issue_number}#issuecomment-1` })));
    if (name === 'issue_write') return send(m.id, text(JSON.stringify({ id: 1, url: `https://github.com/${args?.owner}/${args?.repo}/issues/${args?.issue_number ?? 1}` })));
    return send(m.id, { isError: true, content: [{ type: 'text', text: `Unknown tool ${name}` }] });
  }
  return undefined;
});
