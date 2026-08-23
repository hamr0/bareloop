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

For work that is repeated, long, and verifiable: an agent authors the workflow scaffolding
itself, as a constrained and validated config rather than freeform code. Every run executes
under an outer gate the agent cannot reach or argue with. And the workflow gets better across
runs, because what actually worked is kept with receipts and carried into the next run.

Agents got good at doing the work. The open problem is knowing when the work is actually
done. Three of the strongest results in long-running agent work landed on the same answer
independently: the ralph loop, code machine MCP, and recursive language models all trust the
agent to do the work and verify it with something the agent cannot reach. Trust, but verify.

bareloop takes that principle and makes it the product. You describe a repeated, verifiable
job and what *done* means for it. The agent handles the rest, under verification it never
gets to touch.

## Two kinds of done

Jobs differ by what decides the result is good. That difference is the product's spine, so you
choose it when you create the job.

**green** — a predicate decides. Tests pass, the build exits clean, the type checker is
quiet.
> *"Fix the failing suite."* · *"Migrate this package to strict types."*

**softgreen** — an assessment decides, against a rubric you wrote and signed. You say what
separates a pass from a fail, and give one example of each; the judge only quotes back what it
finds in the real work, and fixed rules — not the judge — render the verdict.
> *"Reserve a ticket from SF to LA under $400."* · *"Improve my resume."*

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

## Usage

A signed job spec goes in. A verdict comes out.

```js
import { runJob, jobSpecHash, makeSpine } from 'bareloop';
import { AnthropicProvider } from 'bare-agent';

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
[`docs/wiki/PRD.md`](docs/wiki/PRD.md).

## License

Apache License, Version 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
