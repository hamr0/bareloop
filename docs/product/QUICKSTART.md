# Quickstart: run your first bareloop job

The shortest path from nothing to a signed job you can run. Everything up to "Run it"
costs $0 and needs no API key. For everything else, read
[`bareloop.context.md`](../../bareloop.context.md) — this page is deliberately narrow.

## What you need

- Node.js >= 20.
- A git repo with at least one commit — the "patient" bareloop will work in. Use a copy,
  never your only copy: the job you sign gets permission to write to it.
- An Anthropic API key in your environment as `ANTHROPIC_API_KEY`. Never put it in a file
  bareloop reads — it loads secrets from the environment only.

## Install

```bash
npm install bareloop
```

## Your first job

A job is a plain object describing what "done" means and what the agent is allowed to
touch. Here is the smallest real one:

```js
const spec = {
  schema: 'job-v1',
  job: 'my-maintainer',
  description: 'fix src until the suite greens',
  goal: 'Fix any failure in src/ so the suite passes.',
  verdictType: 'green',
  close: [{ name: 'suite-green', cmd: 'npm test', expect: 0 }],
  provider: 'anthropic-api',
  cadence: { unit: 'day', every: 1 },
  budgetUsd: 1.5,
  writeScope: ['src/**'],
  tools: ['read', 'grep', 'write', 'edit'],
  escalation: { mode: 'decision-ready' },
};
```

One field at a time, in plain words:

- `goal` — the instruction the agent gets. Say what "fixed" or "done" looks like.
- `close` — the actual check that decides pass or fail. Here: run `npm test`, exit code
  `0` means it passed. This decides the outcome, never the agent's own opinion of its work.
- `budgetUsd` — the hard dollar ceiling. The run stops when it's spent, whatever state
  the work is in.
- `writeScope` — the only paths the agent may write to. Anything outside this is
  off-limits, enforced, not just requested.
- `tools` — the verbs the agent may use (here: read files, search, write, edit). Running
  shell commands is never one of the choices bareloop offers an agent.
- `verdictType` — how "done" gets decided. `green` means a mechanical check (like `close`
  above) — exit code is truth. Use this to start.

## Sign it

An agent can draft a spec, but nothing runs until a human signs the exact bytes of it —
hash the spec and attach an approval record. Editing the spec after signing invalidates it.

```js
import { jobSpecHash } from 'bareloop';

const approvals = [
  { specHash: jobSpecHash(spec), signer: 'you', ts: new Date().toISOString() },
];
```

`approvals` is a separate record, not part of the spec file. Keep it next to the spec;
`runJob` checks the hash matches before it does anything else.

## Run it

This step spends money — it calls a real model. Make sure `ANTHROPIC_API_KEY` is set first.

```js
import { runJob, makeSpine } from 'bareloop';
import { AnthropicProvider } from 'bare-agent/providers';

const outcome = await runJob(spec, {
  approvals,
  workdir: '/path/to/your/checkout',
  // bareloop never reads your key: you construct the provider and hand it the key yourself.
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-sonnet-5' }),
  emit: makeSpine('/path/to/your/checkout/run.jsonl'),
});

console.log(outcome);
```

`outcome` is one word naming what happened. The four you'll see most:

- `green` — the close passed. The job is done.
- `escalated` — the agent ran out of ideas before the close passed; it stops and reports
  rather than guessing further. Not a crash — a named, readable stop.
- `cap-halt` — the money ran out mid-run. The wallet, not the clock.
- `wall-halt` — the time ran out mid-run. The clock, not the wallet.

Anything else is also a named outcome, never a silent failure — see `bareloop.context.md`
if you get one you don't recognize.

## Read the result

The file you passed to `makeSpine` (`run.jsonl` above) is the run's own append-only log —
one JSON line per event, written as it happens: every step, every dollar spent, and the
final outcome. Nothing reads it back for you; open it yourself and check the last lines.

## What's next

Once a job has earned a real `green`, package it — workflow, close, and all — into a
reusable bundle:

```bash
bareloop export jobs/my-maintainer.json --registry ./bridges --out ./my-maintainer.bareloop
```

That bundle runs again, anywhere, without re-drafting. For everything past this page —
reuse, export, budgets, review — read [`bareloop.context.md`](../../bareloop.context.md), the
complete adopter contract.
