# AGENTS.md

> Persistent project memory for Codex. Auto-loaded at session start.

**Read `CLAUDE.md` in this directory. It is the single source of truth for this
project and it is kept current.**

This file used to carry its own 541-line copy of the project state. The two
drifted, and the copy here went stale — it still described the manila-folder /
`fluent.css` era, which no longer exists. Rather than maintain two memories that
disagree, this one is now a pointer.

Do not re-expand this file. If something belongs in agent memory, it goes in
`CLAUDE.md`.

## The short version

- Vanilla JS + ES modules, Three.js 0.164 via CDN import map, GSAP. **No React,
  no bundler.** Not up for renegotiation.
- One stylesheet: **`carbon.css`** (IBM Carbon — IBM Plex, `--cds-*` tokens,
  `[data-theme]` light/dark). `styles.css` and `fluent.css` are deleted.
- `node scripts/static-server.mjs` → `http://127.0.0.1:3000`. No build step.
- `data/ledger.json` is canonical (89 entries). The xlsx is archival.
- Before wiring any ledger field into a view, read the **field contract** in
  `CLAUDE.md` §9. `notes` / `evidenceSource` / `evidenceDetail` are internal
  research fields and must never render.
- Never LFS-track anything Vercel must serve — it deploys LFS pointers as raw
  133-byte text.
- `graphify-out/GRAPH_REPORT.md` is a pre-built knowledge graph of the repo.
  Orienting from it is cheaper than re-grepping.
