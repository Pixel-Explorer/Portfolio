# C1 — Retire the `!important` stack in `styles.css` (theme-token refactor)

> **Handoff spec for OpenCode. Hands-off.** Claude architected this; you implement it.
> Author: Claude (Opus 4.8), 15 Jun 2026. Two components (role pills, nav tabs) are
> already done as the reference implementation — copy that pattern exactly.

---

## 0. OpenCode kickoff prompt (paste this to start)

```
Read C1-IMPORTANT-REFACTOR-SPEC.md in the repo root and execute it end to end,
hands-off. It retires the CSS !important stack in styles.css by making rules
theme-token-driven, component by component. Two components (role pills, nav tabs)
are already done — follow that exact pattern. Obey every rule in §4 (gotchas) and
verify each component per §6 in BOTH light and dark before moving on. Do not touch
app.js / terrain.js logic or the 3D scene. Bump the cache version in index.html
when done. Report a per-component table of !important removed and any rule you had
to keep (with the reason).
```

---

## 1. Goal

`styles.css` has ~345 `!important` declarations. They exist because the **folio UI**
(`body.folio-home …`) was bolted on as an override layer over the older pre-folio
archive styles, and a **light-theme layer** (`:root[data-theme="light"] body.folio-home …`)
was bolted on over that. The goal is to retire `!important` by:

1. Making base rules **theme-token-driven** (semantic CSS custom properties that flip
   per theme), then **deleting** the light-theme `!important` override block, and
2. Removing the folio-base `!important` **wherever natural specificity already wins**
   (it usually does — see §3), keeping it only where §4 says you must.

**Non-negotiable:** rendering must be **pixel-identical** to today in BOTH themes.
This is a live, deadline-critical portfolio. Verify, don't assume.

---

## 2. Architecture facts you must know

- **`<body>` ALWAYS has class `folio-home`** (set literally in `index.html`). So every
  chrome element is under `body.folio-home`. The bare pre-folio `.X` rules are the
  "legacy base layer"; folio rules sit on top of them.
- **Theme switch:** `data-theme="light"` is set on `<html>` (`document.documentElement`).
  **No attribute = dark** (the default). Toggled by `#themeToggle`.
- **Folio color tokens** (defined on `:root`, ~L6571):
  - `--folio-lm: #f5f5f5` (white/light) · `--folio-dm: #1a1a1a` (black/dark)
  - `--folio-vs: #d4ff00` (acid — roles) · `--folio-mi: #ff0000` (red — clients)
  - `--folio-neutral: #2e2e2e`
- **Specificity cheat sheet** (column = `classes/attrs/pseudo-classes`):
  | selector | specificity |
  |---|---|
  | `.X` | (0,1,0) |
  | `.X.active`, `.X:hover` | (0,2,0) |
  | `body.folio-home .X` | (0,2,1) |
  | `body.folio-home .X[attr]`, `body.folio-home .X.active` | (0,3,1) |
  | `[data-theme="light"] .X.active` | (0,3,0) |
  | `:root[data-theme="light"] body.folio-home .X` | (0,5,1) |
  - **Key insight:** `body.folio-home .X` (0,2,1) already beats bare `.X` (0,1,0) and
    `.X.active`/`.X:hover` (0,2,0) **without `!important`**. So most folio `!important`
    that exists "to beat the legacy block" is **cargo-cult and removable.**

---

## 3. The proven pattern (copy this)

Reference commits already in the tree: **role pills** (`body.folio-home .rolepill*`,
~L6900) and **nav tabs** (`body.folio-home .navlink*`, ~L6836). Read them first.

**Step A — define a flip-token pair** on the folio scope and its light variant. Put
2 small rules (no `!important`):
```css
body.folio-home              { --X-fg: var(--folio-lm); --X-inv: var(--folio-dm); }
:root[data-theme="light"] body.folio-home { --X-fg: var(--folio-dm); --X-inv: var(--folio-lm); }
```
Use as many tokens as the component needs. If a value is **identical in both themes**
(e.g. the acid/red brand tabs), DON'T tokenize it — leave the literal and just delete
its light-override duplicate.

**Step B — point the folio base rule at the tokens** (replace the per-theme literals):
```css
body.folio-home .X { color: var(--X-fg); background: var(--X-inv); /* … */ }
```

**Step C — DELETE the light-theme `!important` override** for that component
(`:root[data-theme="light"] body.folio-home .X { … !important }`). The token flip now
produces the light values. Replace with a one-line comment noting where it moved.

**Step D — remove `!important`** from the folio base rule **only where §4 allows**.

**Step E — verify** per §6 in both themes. Only then move to the next component.

---

## 4. CRITICAL gotchas (each one bit during the reference work)

### 4.1 Inline styles set by JS → KEEP `!important`
Some elements get inline `style="…"` from `app.js` (e.g. `.rolepill-dot` gets inline
`background`/`color` per pill). **Inline styles beat every non-`!important` rule.** So
for any property the JS sets inline, the folio `!important` is doing real work —
**keep it** (but still tokenize the value).

**How to check before removing `!important` on property `P` of element `.X`:**
```
grep -nE "\.X|querySelector.*X|class.*X" app.js | grep -iE "style|\.P\b"
```
If JS writes `el.style.P = …` (or sets a `style="…P:…"` string) for that element,
keep `!important` on `P`. The reference: `.rolepill-dot` keeps `!important` on
`background`+`color`; everything else on the pill dropped it.

### 4.2 Higher-specificity legacy competitor → keep `!important` OR delete the legacy rule
Before removing a folio `!important`, scan for any **other** rule that targets the same
property at **specificity ≥ the folio rule's**. Example found on navlink:
`[data-theme="light"] .navlink.active` (0,3,0) would beat `body.folio-home .navlink[data-view]`
(0,3,1)? No — but it beats lower folio rules. The safe rule:
- **Conservative (default):** if any legacy rule could win once `!important` is gone,
  **keep the folio `!important`** and only retire the light-override duplicate. This is
  what navlink did (kept base `!important`, deleted the 4 light dups → −8 `!important`,
  zero risk).
- **Aggressive (only if you confirm the legacy rule is dead):** delete the legacy rule,
  then drop the folio `!important`. A legacy rule is "dead" only if nothing outside
  `body.folio-home` uses that selector — and since `body.folio-home` is always on, most
  pre-folio `.X` rules ARE dead. But **confirm by reading**, and re-verify both themes.

When in doubt, be conservative. Removing the light-override layer is the guaranteed win;
removing folio-base `!important` is the bonus.

### 4.3 Measure with transitions SUPPRESSED
Many chrome elements have CSS `transition`. `getComputedStyle()` during a transition
returns the **mid-flight interpolated value**, not the target — this produced a false
"regression" reading during the reference work. Always inject `* { transition: none !important }`
(scoped to the component) before measuring. See §6.

---

## 5. Targets

### 5.1 Light-override `!important` layer — RETIRE ALL of these (small, do first)
Each becomes a token flip per §3, then delete the rule:

| line(s) | selector | notes |
|---|---|---|
| ✅ done | `…rolepill*` | reference impl (36→3 `!important`) |
| ✅ done | `…navlink*` | reference impl (−8) |
| ~L6807 | `:root[data-theme="light"] body.folio-home { background:#f5f5f5 !important }` | page bg. Tokenize: `body.folio-home { --home-bg: <dark page bg> }` + light `#f5f5f5`; set `background: var(--home-bg)` on the folio-home background rule (find the dark one first). |
| ~L6988 | `… .map-stage { background, border-color }` | 2 `!important` |
| ~L6991-6992 | `… .stat strong`, `… .stat span` | text colors |
| ~L6993-6997 | `… .search-glass, .filter-pills, .theme-toggle { background, border-color, color }` | grouped; check `.filter-pills` interaction (it has its own folio rule with `!important`) |
| ~L6998 | `… .search-glass::placeholder` | color |
| ~L169 | `[data-theme="light"] .nav-page { background:#F5F0E8 !important }` | **special case** — read the comment above it; tokens were "hijacked dark." Fix by adding a proper light page token rather than blind-removing. |

> ⚠️ Line numbers drift as you edit — match by **selector**, not number.

### 5.2 Folio-base `!important` layer — the bulk (~330 occurrences)
Enumerate every folio base block and apply §3 Step D + §4:
```
grep -nE 'body\.folio-home' styles.css
```
Work top-to-bottom. For each block, for each `!important` declaration, ask §4.1
(inline JS?) and §4.2 (higher-spec legacy competitor?). If neither, drop `!important`.
The `body.folio-home .X` (0,2,1) specificity almost always wins over the legacy `.X`
already — verify, then drop.

---

## 6. Verification protocol (MANDATORY per component)

Dev server: `node scripts/static-server.mjs` → http://localhost:4173 (already may be running).

**A. Computed-style check, both themes, transitions suppressed.** In a browser console
(or preview eval), run — parametrized per component (`SEL` = the element selector,
list the properties that matter):
```js
(() => {
  const SEL = '.rolepill';                       // <-- set per component
  const PROPS = ['color','backgroundColor','borderColor'];
  const el = document.querySelector(SEL);
  const k = document.createElement('style');
  k.textContent = SEL + ', ' + SEL + ' * { transition: none !important; }';
  document.head.appendChild(k);
  const root = document.documentElement, prev = root.getAttribute('data-theme');
  const read = () => { void el.offsetWidth; const c = getComputedStyle(el);
    return Object.fromEntries(PROPS.map(p => [p, c[p]])); };
  root.removeAttribute('data-theme'); const dark = read();
  root.setAttribute('data-theme','light'); const light = read();
  prev ? root.setAttribute('data-theme', prev) : root.removeAttribute('data-theme');
  k.remove();
  return { dark, light };
})()
```
**Capture the values BEFORE your edit (git stash or note them) and AFTER. They must be
identical.** Test active/hover variants too (add `.active` to SEL, etc.).

**B. No console errors:** the page must load clean (check the console).

**C. The element renders** (it's in the DOM and visible) in both themes.

A component is DONE only when A/B/C pass. If any value differs, you exposed a legacy
rule or inline style (§4) — keep that one `!important` (tokenized) and note it.

---

## 7. Hard constraints (do NOT break)

1. **Do not touch `app.js` / `terrain.js` logic** or the Three.js scene. CSS only.
   (You may *read* app.js to check for inline-style writes per §4.1.)
2. **Rendering identical in both themes.** Pixel parity is the acceptance bar.
3. **Don't delete the a11y blocks** at the end of `styles.css`
   (`:focus-visible`, `@media (prefers-reduced-motion)`, `@media (pointer: coarse)`).
   Their `!important` is the canonical a11y pattern — **leave them.**
4. **Keep the manila sheet** `height: 100vh /* past the fold */` as-is.
5. **Bump the cache version** in `index.html` (`styles.css?v=folio-0N` and
   `app.js?v=folio-0N`) when finished, so the changes ship.
6. Token frugality: don't rewrite working files wholesale; make surgical edits.

---

## 8. Done-when checklist

- [ ] Every `:root[data-theme="light"] body.folio-home … !important` rule in §5.1 retired via token flip (or kept with a documented reason).
- [ ] Folio-base `!important` (§5.2) dropped wherever §4 allows; kept ones are commented with why.
- [ ] Both themes verified per §6 for each component (no diffs, no console errors).
- [ ] `grep -o '!important' styles.css | wc -l` reported before/after (target: large reduction; the only legitimate remainders are inline-JS overrides, confirmed-needed legacy pins, and the a11y blocks).
- [ ] `index.html` cache version bumped.
- [ ] Final report: per-component table of `!important` removed / kept (+reason).
