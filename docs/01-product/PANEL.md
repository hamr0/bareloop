# bareloop panel — UI spec (v0.1)

> Decisions from the 2026-07-11 PRD interview (hamr). Build stays deferred until the spine
> is good (PRD §10, N6). Two standing invariants: the panel is a **pure observer of the
> spine plus a command passthrough** — it can never do something the CLI can't — and it is
> **dead simple**.

## Layout — two panes

- **Left: chat.** System↔operator conversation, HITL prompts and confirms, and result
  announcements (each announcement links into the results pane; results never live only in
  scrollback). At the bottom of the pane: the **command bar** — a web CLI speaking the
  exact verbs of the headless CLI (create job, run, pause, show rules, tail spine). One
  implementation; the panel passes commands through. The bar must not disturb the two-pane
  layout.
- **Right, top: progress.** Current step, cost so far vs the run's hard cap, run/generation
  state.
- **Right, bottom: results.** Artifact cards, newest first. Job #1: PR link + diff stat +
  suite verdict. A posting job: the posted URL. Whatever the job's closes produce.
- **Mobile** (house rule — responsive by default): stacks to progress strip → chat →
  results behind a tap.

## Primitive menu presentation — provisional

The menu breaks primitives under **recall / compress / stash / remember** for easy
categorization — the adaptlearn-proven spine set, one verb per litectx primitive
(Select → recall, Compress → compress, Isolate → stash, Write → remember). Explicitly
provisional: change or simplify as development teaches us. Open detail (not decided):
where non-CE verbs (barebrowse, baremobile, bareagent, bareguard surfaces) sit — by
package until this scheme evolves. Locked-but-listed primitives render visibly distinct
from admitted ones (disclosure ≠ admission, PRD addendum v1.1 §3).

## Context-graph — third view, eventual

litectx already ships the primitive: `ContextGraph` (`litectx/src/contextgraph.js`) — an
`observe()` proxy records every CE verb call live; `.json()` / `.mermaid()` out;
visualization is explicitly a consumer concern. The panel's third view is that consumer,
fed by ContextGraph traces + the spine, drawing the whole workflow: runs, retries,
verdicts, rule lineage. Visual only, not load-bearing, not first — the slot is reserved
and nothing in the two-pane layout may squat on it.

## Timing

Headless first. UI when the spine is good — no early read-only viewer unless the spine
earns it sooner. When the panel lands, everything above is the starting layout; changes
from real use get dated notes here.
