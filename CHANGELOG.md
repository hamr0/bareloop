# Changelog

## Unreleased

- PRD addendum v1.1 (2026-07-11, post-lock interview + adaptlearn cross-check): panel
  layout + web-CLI command bar (spec: `docs/01-product/PANEL.md`); full five-package
  disclosure with the two-red routing rule (request-red admission in-loop vs upstream-gap
  fix-and-consume, never a local shim); graduated-disclosure probe pre-registered in
  bareloop with M3 discipline (verified never exercised in adaptlearn; archive stays
  closed). UPSTREAM-ASKS repurposed as the upstream-gap fix queue.
- PRD locked at v1 (2026-07-11) after the bloat audit: §6→§9 open-questions dedup,
  §4 secrets-never-enter-the-spine invariant, §5 mobile-responsive mandate on the
  panel. From here the PRD amends by dated addenda only.
- npm publish workflow added (trusted publishing via OIDC, manual dispatch).

## 0.0.1 — 2026-07-11

- Repo cut from the adaptlearn seed (adaptlearn closed at v0.11.1; see
  `docs/00-context/` for the inherited record).
- Named **bareloop**; `bareloop@0.0.1` published to npm as a name reservation
  (README + package.json only, no code).
- PRD named and repointed: `docs/01-product/PRD.md` at v0.2 — locks as v1 after the
  bloat audit.
- Scaffold: CLAUDE.md, fresh FINDINGS.md (at F1), UPSTREAM-ASKS.md, guardrails
  pre-tool hook wired in `.claude/settings.json`.
