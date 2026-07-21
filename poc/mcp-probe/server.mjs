// Minimal MCP stdio server for the clipipe-native probe (BA-16 evidence).
// Vanilla node, newline-delimited JSON-RPC 2.0. Three tools:
//   lookup_code(name)            — returns an unknowable answer (native-call proof)
//   write_file(path, content)    — FENCED: only under WRITE_SCOPE; denial is a
//                                  tool RESULT (gate-in-handler viability)
//   read_file(path)              — reads a file (multi-turn driver)
// Every call is appended to CALL_LOG so the harness can assert what really ran.
import { createInterface } from 'node:readline';
import { appendFileSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CALL_LOG = process.env.PROBE_CALL_LOG || '/tmp/mcp-probe-calls.jsonl';
const WRITE_SCOPE = process.env.PROBE_WRITE_SCOPE || '/tmp/mcp-probe-scope';
const log = (obj) => appendFileSync(CALL_LOG, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');

const TOOLS = [
  { name: 'lookup_code', description: 'Returns the secret verification code for a given name.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'write_file', description: 'Write content to a file at path.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'read_file', description: 'Read the file at path.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
];

function callTool(name, args) {
  log({ tool: name, args });
  if (name === 'lookup_code') return `verification code for ${args.name}: XK-7741-DELTA`;
  if (name === 'write_file') {
    const p = resolve(String(args.path));
    if (!p.startsWith(WRITE_SCOPE + '/')) {
      // the FENCE: denial is a tool result, never a crash (gate-in-handler)
      return `DENIED: write outside the granted scope (${WRITE_SCOPE}) — this refusal was decided by the caller's gate, not the model`;
    }
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, String(args.content));
    return `wrote ${p} (${String(args.content).length} bytes)`;
  }
  if (name === 'read_file') {
    try { return readFileSync(String(args.path), 'utf8').slice(0, 2000); }
    catch (e) { return `read error: ${e.code}`; }
  }
  return `unknown tool ${name}`;
}

const rl = createInterface({ input: process.stdin });
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'probe', version: '0.0.1' },
    } });
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    const text = callTool(params.name, params.arguments || {});
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
  } else if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
  } else if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
  } // notifications: no response
});
