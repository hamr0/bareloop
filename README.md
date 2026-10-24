```
                    ╭──────────────────────────────────────╮
                    │  ╔╗ ╔═╗╦═╗╔═╗╦  ╔═╗╔═╗╔═╗            │
                    │  ╠╩╗╠═╣╠╦╝╠╣ ║  ║ ║║ ║╠═╝            │
                    │  ╚═╝╩ ╩╩╚═╚═╝╩═╝╚═╝╚═╝╩              │
                    │    run ──→ verdict ──→ inherit       │
                    │     ↑                     │          │
                    │     └─────────────────────┘          │
                    ╰──╮───────────────────────────────────╯
                       ╰── workflows that earn their own design
```

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/hamr0/bareloop?label=version&color=2a4f8c" alt="version (auto from package.json)">
  <img src="https://img.shields.io/badge/license-Apache%202.0-2a4f8c" alt="license: Apache 2.0">
  <img src="https://img.shields.io/badge/status-WIP-orange" alt="status: WIP">
</p>

**"Automate this job — I don't know the best workflow."**

The best workflow is the shortest proven path that gets the job done, and that heals itself when a different model works a different way.

bareloop finds that path for you. Write your problem in plain language, as steps. Under each step, say what counts as success and what it must never do. The agent builds the bridge it will walk on, and the run is green only when the output passes checks the agent never touches.

The harness (budget, time, what it may touch) and the judge both sit **outside** the agent loop. The agent can't judge itself. Every run is recorded, so you can audit it and replay it at $0 and see exactly what happened.

## Two kinds of jobs

**Deterministic (code)**: code decides. Tests pass, the linter is quiet, the build exits clean. If no check exists yet, say what you need and the agent builds that check first.
> *"Fix the lint errors."* · *"Add doc comments to every function."* · *"Split this 3,000-line file without breaking a test."*

**Rubric (research)**: it searches, collects, compares and hands you a report where every fact is quoted from a saved copy of its source. A judge only points at the quotes, and fixed rules decide.
> *"Find flights LAX→SFO under $400, nonstop, no red-eye."* · *"Compare these 5 laptops on price, weight and warranty."*

## What it won't do

bareloop reads, searches and writes. It never acts on the world: no paying, booking, sending forms or posting. When a job needs a person partway through, or needs to *do* something, like book the flight bareloop found, that's **[fwdloop](https://npmjs.com/package/fwdloop)**.

**Small tools, all local.** Built on the bare suite (bareagent, bareguard, litectx), always LLM-agnostic, always on your machine, with a simple panel UI.

## You have the last word

Every judged run ends at a **review door** (a purely mechanical green finishes on its own —
ask for the door with `--review-door`): here is what changed, here is what every check said,
here is what I'm asking you. **Accept** it, **rerun** it — what you type is the feedback the next
attempt works from, funded fresh — or **pause** it and decide another day. A pause costs
nothing, keeps everything, and picks up from the start of the last step whenever you come back.
Never come back, and it quietly expires on its own.

The door never rewrites the run's own verdict. A green stays green in the record whatever you
decide about it; your answer says what happens to the work, not what the work scored.

## Why the agent authors the workflow

The bare suite gave us forty-plus primitives, and there are at least as many opinions about
how context engineering should be broken into steps. Instead of picking one opinion and
shipping it as the recipe, bareloop makes the agent the author. It chooses its own path
through the primitives and then has to survive verification it cannot edit, widen, or
disable.

The lessons from ralph, RLMs, and code machine MCP are in here, applied to the small parts
rather than adopted whole. None of them is the workflow; each one is available to the agent
building it.

## Install

```bash
npm install bareloop
```

Quick start: `npm install -g bareloop`, then `bareloop` — a menu to start the panel, stop it, see its status, and set up `~/.config/bareloop/`.

## Usage

A signed job spec goes in. A verdict comes out.

```js
import { runJob, jobSpecHash, makeSpine } from 'bareloop';
import { AnthropicProvider } from 'bare-agent/providers';

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

// you sign the spec; an edited spec is unsigned by construction
const approvals = [
  { specHash: jobSpecHash(spec), signer: 'you', ts: new Date().toISOString() },
];

const outcome = await runJob(spec, {
  approvals,
  workdir: '/path/to/checkout',
  provider: new AnthropicProvider({ model: 'claude-sonnet-5' }), // key from env
  emit: makeSpine('/path/to/checkout/run.jsonl'),
});
// 'green' means your close passed. Anything else is a named, decision-ready stop.
```

You do not have to hand-write that `close` yourself. bareloop can author it with you from a
short interview about what done means for the job, then hand you the result to sign.

**Integrating an agent?** Point it at the contract, not this file:

```
Read bareloop.context.md from node_modules/bareloop/bareloop.context.md
```

That single file is the complete adopter contract: the API, the boundary, the refusals, the
constraints. The README is the pitch. (Suite-wide pattern: every bare package ships its
`*.context.md`.)

## Build it once, keep it

A simple localhost UI lets you build a job by talking about it and watch it run. When it
works, **export the whole workflow** — with its self-healing harness — and run it again
anywhere. The point is to stop trial-and-erroring your way to the workflow that fits a job.
Find it once, keep it, reuse it. It is a seed of something bigger over time.

### Export a job

When a job in the panel has gone green, keep it as a bundle you can run anywhere:

```bash
bareloop export "my-job (run-3)" --out ./my-job.bareloop     # or just `bareloop export` and pick from the list
cd ./my-job.bareloop && npm install
bareloop run "my-job (run-3)" --repo /path/to/checkout --approve <bundleHash printed above>
```

Bare `bareloop` is one menu: the panel (1 start, 2 stop, 3 status, 4 install) and the jobs
(5 export, 6 run, 7 resume, 8 history), each asking for what it needs. `export` only ships a run that
already earned a real green, and only repo jobs for now. The first `run` on a new machine asks you to
approve the bundle's printed hash; once that run goes green, later runs need no re-approval as long
as the bundle stays unchanged. Every run works in its own fresh git worktree, commits a green on its
own branch and leaves the merge to you. A cap above the one signed is shown back and needs your
typed `yes` (or `--yes`). A halted run continues with `bareloop run <bundle> --resume <runid>`. Full
contract — flags, approval/blessing rules, exit codes — in
[`bareloop.context.md`](bareloop.context.md).

## Running it

bareloop runs locally, as you. Secrets load from the environment and never enter the tree or
the run's records. It reduces exposure but it is not a sandbox: the code your job writes runs
with your permissions, so give bareloop a repo you would let an agent touch.

## The bare ecosystem

Local-first, composable agent infrastructure. Same API patterns throughout. Mix and match,
each module works standalone. bareloop is the suite's flagship consumer: it exercises every
package, and gaps get fixed upstream rather than shimmed.

**Core** — the brain, the gate, the memory.

- **[bareagent](https://npmjs.com/package/bare-agent)** — the think→act→observe loop. *Goal in → coordinated actions out.* Replaces LangChain, CrewAI, AutoGen.
- **[bareguard](https://npmjs.com/package/bareguard)** — the single gate every action passes through. *Action in → allow / deny / ask-a-human out.* Replaces hand-rolled allowlists and scattered policy code.
- **[litectx](https://npmjs.com/package/litectx)** — tree-sitter code + memory graph with activation decay, plus lightweight context engineering (write · select · compress · isolate). *Query in → ranked context out.*

**Optional reach** — give the agent hands.

- **[barebrowse](https://npmjs.com/package/barebrowse)** — a real browser for agents. *URL in → pruned snapshot out.* Replaces Playwright, Selenium, Puppeteer.
- **[baremobile](https://npmjs.com/package/baremobile)** — Android + iOS device control. *Screen in → pruned snapshot out.* Replaces Appium, Espresso, XCUITest.
- **[beeperbox](https://github.com/hamr0/beeperbox)** — 50+ messaging networks via one MCP server. *Chat in → unified message stream out.* Replaces Twilio, per-platform bot APIs.

## Background

bareloop is the productization of **[adaptlearn](https://github.com/hamr0/adaptlearn)**, a
closed experimental record on whether agent-authored workflows improve under an honest gate.
The design laws it inherited, and the open questions it has not answered yet, are in
[`docs/product/PRD.md`](docs/product/PRD.md).

## License

Apache License, Version 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
