# HANDOFF — Roles & Clients UI restyle (OpenCode)

> Claude did the **data + bucketing layer** of "Final mass UI Pass 1" and shipped
> it to `master` (commits `e4d15d3`, `382226a`). The Roles/Clients pages now bucket
> correctly — compound roles split, AIESEC demoted, Life=3, clients deduped. **But
> the pages still render as plain "bento" cards, not manila folders, and the codex
> view is a generic stub.** This brief hands the *visual + codex* pass to OpenCode.
>
> Stack: vanilla JS + ES modules + Three.js 0.164 + GSAP 3.12. **No React, no
> bundler, no Tailwind.** Read `HANDOFF-OC-MANILA-V2.md`, `OC-CODEMAP-MANILA-V2.md`,
> and `OC-REFS-MANILA-V2.md` first — the manila-folder pattern + GSAP safety rules
> there apply verbatim here.

---

## Status of "Final mass UI Pass 1" (the original 5-item prompt)

Reconcile before you start — most items are already implemented; **don't redo them.**

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Dark ↔ light mode toggle | **DONE (audit only)** | `initTheme`/`toggleTheme` app.js:310; `[data-theme="light"]` block styles.css:114-179. Sweep for any surface that didn't get a light override (see §4). |
| 2 | Tags overlay → search-bar chips | **DONE** | `renderSearchChips` app.js:349; keydown handler app.js:478. Type + Enter/comma adds a chip; ✕ removes. Verify the old left-hand tags overlay is fully gone. |
| 3 | Big-type AGE/PROJECTS/ROLES behind cluster | **DONE** | `makeBigStatNumber` calls terrain.js:350-352. Confirm they read on screen at default camera; nudge offsets only if buried. |
| 4 | Ground reflections | **DONE** | `Reflector` terrain.js:9,261-296. On by default, `?noreflect=1` to disable. Confirm the hazy city mirror is visible. |
| 5 | **Roles restyle + codex view** | **TODO — this is the job** | See §1–§3 below. |

If items 1–4 visibly regressed, fix in passing — but the bulk of this handoff is **#5**.

---

## §1. What you're building (the core ask)

Turn the **Roles** and **Clients** master pages from flat bento cards into the
**manila-folder language** already established for the cluster drawer (`mf-*`
classes, styles.css:5658+), and wire a **real codex view** (indrajaal big-type
scroller) that shows **shuffled evidence from that bucket's projects**.

Per Anirudh's prompt, verbatim asks still open:

- **Switch from card view → codex view** via the existing `CODEX VIEW` button.
  The button works (toggles `navCodexActive`) but the codex render is a stub.
- **Each card looks like a manila folder** (new manila style, not the boxy bento).
- **Main folder → multiple folders inside it** — i.e. theme folder opens to reveal
  its role sub-folders, each itself a mini manila folder, each opening to its
  projects. Keep the existing two-level drill (theme → role → projects) but dress
  every level as manila.
- **Codex view shows shuffled evidence from the respective bucket's projects** —
  big-type rows, hover swaps a centered stage image, row click opens that entry's
  artifact (`selectEntry(id, {zoom:true})` or `openProjectPage`).

---

## §2. Files & exact reuse targets

Everything lives in **`app.js`** (`renderNavPage` + helpers) and **`styles.css`**.
**Do not touch `data/ledger.json`** — the schema is finalized (see §5).

### app.js — the render path (all in `renderNavPage`, starts ~line 2530)

| Function | Line | What it does now | Your change |
|---|---|---|---|
| `getEntryThemes(entry)` | ~2497 | NEW — returns theme keys from `entry.roleGroups[]` + `entry.roles[]`. Entries with `roleGroups:[]` are excluded. | **Don't change** — this is the source of truth. |
| `groupEntriesByBucket()` | ~2520 | Returns `[[label, entries[], pill], …]` for the 6 themes, multi-membership. | **Don't change.** |
| `buildClientGroups()` | ~2767 | Returns client groups from `clientCanonical`/`clientGroup`/`clientOutcome`, excludes `excludeFromClients`, green Education pill w/ outcome labels. | **Don't change** the grouping; just restyle the output rows. |
| `renderNavPage()` codex branch | ~2556 | `if (navCodexActive)` — builds `allEvidence`, shuffles, renders generic `.mf-codex-row`s into a `.bento-grid`. | **Rewrite** to the real indrajaal codex (see §3). |
| `renderNavPage()` bento branch | ~2600 | `projectRow`/`projectList`/`roleSubgrid`/`groupRows` build `.bento-box` markup. | **Re-skin** to manila `.mf-*` markup. Keep the same data wiring + toggle handlers. |

Toggle wiring already exists and works — **keep it**:
- `[data-action="toggle-codex"]` click → flips `navCodexActive`, re-renders (app.js ~2708).
- `[data-box-toggle]` / `[data-subbox-toggle]` → expand/collapse (app.js ~2670-2694).
- `[data-entry-jump]` → `selectEntry(id,{zoom:true})` (app.js ~2697).

### Reuse from the cluster drawer (already shipped, proven)

- **Manila folder shape + open motion**: `.mf-folder` / `.mf-tab` / `.mf-body`
  styles.css:5694-5790. Port the *look* (unibody tab+body, no border-radius seam,
  role-color fill) to the nav-page folders. You may need a `.nav-page` variant
  prefix (e.g. `.np-folder`) so you don't collide with the drawer's absolute
  `layoutStack()` positioning — the nav page is a normal scrolling grid, not a
  depth-stacked pile. **Take the skin, not the stacking math.**
- **Codex scroller**: `.mf-codex*` styles.css:6011+ and `initCodexScroller` in the
  gallery path — the drag/wheel/momentum + `elementFromPoint` hover + centered
  `#codexStageImg` pattern. The Roles codex should feel identical. Reuse the CSS;
  factor the scroller JS into something `renderNavPage` can call, or inline a
  trimmed copy. **Never `setPointerCapture` on the scroller** (kills row clicks —
  see CLAUDE.md gallery note).

### Theme/color per bucket

Each group row already carries its pill object (`g[2]`) with `.color` / `.modalBg`
/ `.ink`. Use `--box-color` (already set on `.bento-box` style attr) as the manila
tab/spine fill. Education client groups come through green (`#5B8C3E`) with an
`clientGroup:"Education"` flag on the pill — keep that visual cue.

---

## §3. Codex view spec (the stub to replace)

Current stub (app.js ~2556-2598) flattens all evidence and dumps plain rows. Replace with:

- **Big-type rows** = evidence caption (fallback: entry title), `clamp(28px,5vw,72px)`,
  uppercase, monospace display — match the gallery codex (`initCodexScroller`).
- **Meta line** per row: `type · bucketLabel · entryTitle` (no raw filenames).
- **Centered stage image** bleeding behind the type; swaps to the hovered row's
  evidence `src` in real time via `document.elementFromPoint` in the RAF tick
  (not mouseenter — the list scrolls under a stationary cursor).
- **Shuffled** across the bucket's projects (shuffle already in the stub — keep it).
- **Drag + wheel + momentum**; `>6px` drag sets a `justDragged` guard to suppress
  the click. Row click → `selectEntry(entryId,{zoom:true})` then `closeNavPage()`
  (same as `[data-entry-jump]`).
- Header keeps the `FOLDER VIEW` / `CODEX VIEW` toggle button (`data-action="toggle-codex"`).
- **Codex should respect the open bucket** if one is expanded — i.e. codex of the
  active theme's projects, not all 90. If nothing is expanded, codex = whole page.
  (Decide with Anirudh if ambiguous; default to active-bucket-or-all.)

---

## §4. Smaller open items (do if time; don't block on them)

- **Volunteer 3-level nesting.** Spec wants `Volunteer → {Arahantas, AIESEC,
  Auroville}`. Right now Volunteer is a flat sub-folder under Leadership & Education
  (5 projects). If you nest it, drive the children off `clientCanonical`
  (`AIESEC` / `Arahantas` / `Auroville Consulting`) — don't hardcode ids.
- **AIESEC as a sub-folder.** It's correctly *off* the top level now. Confirm its
  projects still surface under Leadership & Education → Volunteer / Student rows
  (LCC entries 17,18 are `roleGroups:["Volunteer"]`).
- **Light-theme audit.** Open every nav surface in light mode; anything still dark
  needs a `[data-theme="light"]` rule (styles.css:114 block). Manila folders are
  cream already, so they should read in both themes — verify contrast of ink.
- **CLAUDE.md + AGENTS.md** — append a one-paragraph iteration note when done.
- **Cache bump** in `index.html` (`?v=` query on app.js/styles.css).

---

## §5. Data schema — FINAL, do not migrate

`data/ledger.json` entries now carry (added by `scripts/normalize-roles-clients.mjs`,
already run + committed):

```jsonc
{
  "role": "Cinematographer, Director",        // display string (compound preserved)
  "roles": ["Cinematographer", "Director"],   // canonical split — drives sub-folders
  "roleGroups": ["Cinematographer","Director","Moving Images"], // theme membership (multi)
  // roleGroups: []  → entry excluded from ALL role buckets (e.g. id 95 Riga deport, id 97 Pixelate ENDS)
  "clientCanonical": "Self",                   // normalized client (Self/Independent merged, AIESEC unified, Letsarc deduped)
  "clientGroup": "Education",                  // optional → green pill
  "clientOutcome": "BBA-IT",                   // optional → outcome label on green pill
  "excludeFromClients": true                   // Diana (id 117), Haus of Pixels (id 76), Life-only moments
}
```

Read these fields; **never re-derive buckets from keyword-matching `tags`/`role`**
(that was the bug Claude just fixed). The legacy `SPATIAL_FILTERS[].match` arrays
+ `findBucketForTags` (app.js:240,272) are **still used by the 3D role-filter pills**
in terrain — leave them alone, don't repurpose them for the nav page.

### Verified bucket counts (your restyle must preserve these)

Roles (6 themes): Moving Images `8 roles·35`, Visual Systems `4·24`,
Computational Culture `3·5`, Documentation & Research `3·3`,
Leadership & Education `8·26`, **Life `1·3`**.

Moving Images sub-folders: Cinematographer 14, Photographer 10, Director 9,
Art Director 5, Unit Still Photographer 4, Editor 3, Producer 1, Visual Designer 1.

Clients: 55 groups; Self 11, AIESEC 6, Pixelate 4, `SEMCOM College — BBA-IT / Faculty` 4,
Letsarc Media 3, Arahantas 2, KindHealth 2, Rabble 2. Diana + Haus absent.

---

## §6. Acceptance

- [ ] Roles & Clients pages render as **manila folders** (unibody tab+body,
      role-color fill, no boxy bento), at all drill levels (theme → role → project).
- [ ] Compound roles still appear as **separate** sub-folders (Cinematographer
      *and* Director, never "Cinematographer, Director" as one row).
- [ ] `CODEX VIEW` toggles to a working **indrajaal codex**: big-type rows,
      centered stage image that swaps on real-time hover, drag/wheel/momentum,
      row click opens the artifact, `FOLDER VIEW` toggles back.
- [ ] Codex shows **shuffled evidence**, no raw filenames in the meta line.
- [ ] Counts unchanged from §5. Life = 3. AIESEC not a top-level theme.
- [ ] Green Education clients keep the green pill + outcome label.
- [ ] Items 1–4 (theme/chips/numbers/reflections) still work — no regression.
- [ ] No console errors. **CSS owns opacity; GSAP animates transform only**
      (overlay opacity tweens stall — see CLAUDE.md gallery "back is broken" note).
- [ ] `node --check app.js` passes; CSS braces balanced.
- [ ] Cache bumped; one-line note in CLAUDE.md + AGENTS.md.

## §7. Run / verify

```
node scripts/static-server.mjs        # localhost:4173
```

The nav pages are **not** WebGL-gated — Claude's preview tool *can* screenshot
them (unlike the cluster drawer). Drive them from the console:

```js
openNavPage("roles")     // then click a folder, expand, toggle CODEX
openNavPage("clients")
```

Or click the `Roles` / `Clients` nav links. Take real screenshots of: collapsed
folders, an expanded theme showing role sub-folders, the codex view with stage
image, and both light + dark themes.

## §8. Anti-asks

- Don't migrate or hand-edit `data/ledger.json`. Schema is final (§5).
- Don't reintroduce keyword bucketing for the nav page (use `roleGroups`/`roles`).
- Don't break the 3D role-filter pills (`SPATIAL_FILTERS.match` / `findBucketForTags`).
- Don't `setPointerCapture` on the codex scroller.
- Don't animate overlay opacity with GSAP. Transform only.
- No React / bundler / Tailwind.
