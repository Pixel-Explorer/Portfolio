# OC REFS — inspiration → exact behaviour spec (Manila v2)

> Six references from Anirudh. Each section: the URL, what it does, and the
> precise behaviour to reproduce in vanilla JS/CSS/GSAP. WebFetch these if you
> need the implementation detail; the distilled spec below is the source of truth.

---

## 1. Aceternity — Animated Tooltip  →  FOLDER HOVER
URL: https://ui.aceternity.com/components/animated-tooltip

**What it does:** hovering an avatar pops a tooltip that **tilts and translates
based on the cursor's horizontal position** over the element (springy rotate +
x-shift), with a name/title card floating above.

**Reproduce (folder tab hover):**
- On `mouseenter` of `.mf-tab`, track `mousemove`; map cursor x within the tab
  (-0.5..0.5) → `rotateY` ≈ ±10deg and `translateX` ≈ ±12px (spring/lerp, not
  instant). Add `translateY(-10px)` lift + slight `scale(1.04)`.
- Float a **spotlight card** above the tab: the entry's first evidence image
  (thumb) + title + meta (`year · role`). Fade/scale in (CSS-owned opacity).
- On `mouseleave`, spring back to rest.
- Use GSAP quickTo/lerp in a rAF for the tilt; transform-only.
- Touch devices: skip (no hover).

## 2. Aceternity — Tabs  →  CLICK = COME TO FRONT + EXPAND
URL: https://ui.aceternity.com/components/tabs

**What it does:** tabs are stacked cards; the active tab animates **to the front
of the stack** and its panel expands; inactive tabs sit behind, **scaled down +
offset + dimmed**.

**Reproduce (folder click):**
- Clicking a folder tab raises that folder's `z-index` above all others and
  expands its body (slides up as one unibody shape — see #4).
- The **other folders recede**: `scale(0.96)` + small `translateY` back + reduce
  brightness (~0.6) while one is open. (Drive via a `.mf-drawer.has-open` parent
  class + per-folder transition; or set inline transforms.)
- Only one open at a time. Re-click / × / backdrop / Escape closes → all return.

## 3. Aceternity — Draggable Card  →  DRAG WHEN STACKED
URL: https://ui.aceternity.com/components/draggable-card

**What it does:** cards are physically draggable with velocity, rotation toward
drag direction, and a **spring back** to a resting spot.

**Reproduce (stacked/minimised mode):**
- When NO folder is open (stacked mode), each `.mf-folder` is pointer-draggable:
  `pointerdown`→`pointermove` translate by delta + slight `rotate` proportional
  to velocity; `pointerup` → GSAP spring (`elastic.out`/`back.out`) back toward
  its layout home **plus a small randomised jitter offset** (so the pile feels
  hand-stacked and the user can "reveal" folders behind by dragging ones in front).
- Distinguish drag from click: only treat as click if pointer moved < 6px.
- Dragging is disabled while a folder is open (that mode is read, not rearrange).
- This is the "each card on a canvas, user can move them around" ask.

## 4. Massimo CodePen — the folder shape + open anim  →  PORT TO VERTICAL
URL: https://codepen.io/_massimo/pen/oYWbqL/

**What it does (horizontal in the original):** a realistic folder — a back
flap + a front flap + the tab — where opening lifts the front flap and the
contents slide out as **one connected piece**. The folder is unibody: tab,
flaps, and body share the form.

**Reproduce — VERTICAL variant:**
- Folder = a single shape: **tab on top** (heading, content-width) seamlessly
  attached to a **body** below (no seam — share fill, bridged corner/lip).
- At rest the folder is tucked under the bottom edge; only the tab + a thin body
  lip show (unibody hint).
- On open, the **front face/contents slide up** out of the folder as one piece
  (think: pulling a document up out of the folder). Use the CodePen's easing
  feel. Reveal the body content with a staggered transform (transform-only).
- WebFetch the pen's CSS/JS for the exact flap geometry + cubic-bezier; adapt
  axis from horizontal to vertical.

## 5. 98.css — Tabs (multirows)  →  BOTTOM MENUBAR
URL: https://jdan.github.io/98.css/#tabs  (see the `menu` element + multirows)

**What it does:** 98.css renders `<menu role="tablist">` as Win98 tabs; a
`.multirows` modifier wraps them into multiple rows.

**Reproduce:**
- Wrap the folder tabs in a `<menu role="tablist" class="multirows">`-style
  container so they pack into **multiple rows** (98.css visual: beveled, flush).
  You may pull in 98.css's tab CSS rules (copy the relevant selectors into
  styles.css; do NOT add a build dep) OR mimic the bevels with box-shadows,
  while keeping the role-colour manila fill.
- The **bottom-most row is a full-width menu bar** (not folder tabs):
  - **Left:** the building / cluster label + count — `HAUS OF PIXELS · 11`.
  - **Right:** a button `[ CODEX → ]` that switches to codex mode (#6).
  - Style it like a Win98 status/menu bar (beveled, monospace).

## 6. Indrajaal codex + single page  →  CODEX MODE WIRING
(existing in-app: `initCodexScroller`, `openGalleryOverlay`, `openProjectPage`)

**Behaviour:**
- Clicking `[ CODEX → ]` cross-fades the folder pile out and reveals the
  **indrajaal big-type codex scroller** populated with **this cluster's entries**
  (not the 269 gallery photos). Reuse `galleryContext = {mode:"cluster",
  clusterInfo, items, label}` (already stubbed) + the codex render path.
  - Big type per row = entry title (or role); meta line = `year · role · org`.
  - Centered stage image swaps to the hovered row's first evidence image
    (real-time via `elementFromPoint` in the rAF tick — pattern already in code).
- Clicking a codex row → `openProjectPage(entry)` (the single-page artifact).
  Set `state.clusterContext` so the artifact's ← returns to **codex** (one
  level), and × exits the whole cluster.
- A `[ ← FOLDERS ]` affordance in codex mode returns to the folder pile.

---

## Motion budget / feel
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` for slides; `back.out(1.6)` / spring
  for drag release and the come-to-front pop.
- Durations: hover ~0.25s, open/expand ~0.5–0.6s, codex cross-fade ~0.4s.
- Everything transform-driven; CSS owns opacity (see CODEMAP safety rule).
- 60fps: animate transform/opacity only, `will-change` the moving folder.

## Verify against refs
Open each URL, compare side-by-side. The hover tilt (#1), the come-to-front
expand (#2), the drag spring (#3), the unibody open (#4), the multirows menubar
(#5), and the codex→single-page flow (#6) should each be recognisably the same.
