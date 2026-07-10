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
  <img src="https://img.shields.io/badge/status-pre--code%20%C2%B7%20PRD%20locked-8a6d1a" alt="status: pre-code, PRD locked">
</p>

**"Automate this job — I don't know the best workflow."** For tasks that are **repeated,
long, and verifiable**: an agent authors the workflow scaffolding (a constrained,
validated config — never freeform code); runs execute under an un-gameable outer gate;
and the scaffolding *improves across runs* through verdict-gated, run-as-executed
inheritance with ledger-counted attribution.

The pitch in one line: **workflows that earn their own design, with receipts** — every
inherited rule carries the green that minted it and the contrast that attributed it.

> **Status: pre-code.** The name is reserved, the PRD is locked, and the build ladder is
> in flight (roadmap below). The first usable release is the headless loop.

## Quick start

```bash
npm install bareloop
```

**Give your AI assistant the integration guide**

```
Read bareloop.context.md from node_modules/bareloop/bareloop.context.md
```

That single file is the complete adopter contract — the boundary, the architecture, the
refusals, the constraints — and it grows API sections as rungs land. (Suite-wide pattern:
every bare package ships its `*.context.md`.)

---

## How it works

Three layers; nothing inside negotiates with the layer above it.

| Layer | What it is | Emergent? |
|---|---|---|
| **Outer shell** | Per-run budget cap (bareguard), retry cap, verdict collection, escalation routing. Stateless across runs | never — permanent, dumb, un-gameable |
| **Emergent middle** | The authored workflow config: steps, per-step verdict class, memory binding, write scopes — schema-validated, config-red before tokens burn | yes — authored and improved by the agent |
| **Floor** | Append-only JSONL spine (single source for every UI), litectx store per job, per-run ledger | never — the record |

Every checkpoint in a workflow carries its own **verdict class**, and the class decides
what the run's learning is worth:

| Verdict | Truth source | Mints inheritance? |
|---|---|---|
| **Hard green** | predicate / exit-code (tests, build, lint) | automatically |
| **Soft green** | rubric / assessment | only with HITL confirm or N consistent repeats |
| **HITL green** | a human is the close (PR merge, "publish") | yes — and merge stays human, forever |

The full bare-suite surface is *disclosed* to the authoring agent; only *admitted* verbs
are callable per job. A request against a locked primitive is a structured red — real
diagnostic signal, and the admission path when it's justified.

## The science behind it

bareloop is the productization of **[adaptlearn](https://github.com/hamr0/adaptlearn)**
(archived at v0.11.1) — a closed experimental record, findings F1–F20. What it settled,
bareloop consumes without re-proving:

| Mechanism | Evidence |
|---|---|
| Agents author valid harness configs at hand-written parity | M4 (F10) |
| Mid-run revision recovers stuck runs | M5 (F11: 3/3 vs 1/3) |
| Verdict-gated inheritance beats ungated on pass/fail | F19: gated late 1.00 vs ungated 0.13 |
| Run-as-executed inheritance transmits in-run learning | F20: 6/6 lineages, ~½ cost |
| Which-knob attribution is countable from the ledger | V2: contrast bit 16/16 gens |
| Where memory pays: regularities outside the worker's prior | F17/F18: ~8× under acquisition cost |

Full PRD with design laws and open questions: [`docs/01-product/PRD.md`](docs/01-product/PRD.md).

## Roadmap — the build ladder

Each rung POCs its riskiest assumption; a rung that cannot meet its exit stops the
ladder, and the stop is a result.

| Rung | What lands |
|---|---|
| **N0** | Port + outer shell + spine (token-free) |
| **N1** | Job/close schema + validator |
| **N2** | Single-job headless loop — job #1 minimal (review→fix→PR, hard greens only) |
| **N3** | Executed inheritance + contrast-bit extractor — **kill-switch: rules must transmit across non-identical runs** |
| **N4** | Verdict classes complete (soft/HITL minting) |
| **N5** | Scheduler + budget ops |
| **N6** | The panel ([spec](docs/01-product/PRD.md#appendix-a--panel-spec-provisional): left chat + command bar, right progress over results, context-graph reserved) |

## The bare ecosystem

Local-first, composable agent infrastructure. Same API patterns throughout —
mix and match, each module works standalone. bareloop is the suite's flagship consumer:
it exercises every package and gaps get fixed upstream, never shimmed.

**Core** — the brain, the gate, the memory.

- **[bareagent](https://npmjs.com/package/bare-agent)** — the think→act→observe loop. *Goal in → coordinated actions out.* Replaces LangChain, CrewAI, AutoGen.
- **[bareguard](https://npmjs.com/package/bareguard)** — the single gate every action passes through. *Action in → allow / deny / ask-a-human out.* Replaces hand-rolled allowlists and scattered policy code.
- **[litectx](https://npmjs.com/package/litectx)** — tree-sitter code + memory graph with activation decay, plus lightweight context engineering (write · select · compress · isolate). *Query in → ranked context out.*

**Optional reach** — give the agent hands.

- **[barebrowse](https://npmjs.com/package/barebrowse)** — a real browser for agents. *URL in → pruned snapshot out.* Replaces Playwright, Selenium, Puppeteer.
- **[baremobile](https://npmjs.com/package/baremobile)** — Android + iOS device control. *Screen in → pruned snapshot out.* Replaces Appium, Espresso, XCUITest.
- **[beeperbox](https://github.com/hamr0/beeperbox)** — 50+ messaging networks via one MCP server. *Chat in → unified message stream out.* Replaces Twilio, per-platform bot APIs.

**Why this exists:** most automation stacks make you design the workflow before you know
what works. bareloop's bet — proven in adaptlearn — is that for repeated, verifiable
jobs, selection under an honest gate designs a better workflow than you would, and shows
its receipts.

## License

Apache License, Version 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
