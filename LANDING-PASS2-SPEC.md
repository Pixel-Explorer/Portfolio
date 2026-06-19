# LANDING PASS 2 — Interaction Polish Spec

> **For:** OpenCode implementation
> **Branch:** `landing-scroll-pitch`
> **Files to edit:** `landing.html`, `landing.css`, `landing.js`
> **Do NOT touch:** `index.html`, `app.js`, `styles.css`, `terrain.js` (those are the live Archive app)
> **Stack:** Vanilla JS + GSAP 3.12 (global `gsap`) + Lenis (global `Lenis`). NO React. NO npm install. Everything is CDN.
> **Date:** 2026-06-17

---

## Context

`landing.html` is a 7-beat scroll-pitch prototype (Lenis smooth scroll + GSAP ScrollTrigger pin/scrub per beat). It works: headlines mask-reveal, beats pin and scrub, progress rail tracks scroll. But it feels static between the type animations. This pass adds 5 interaction layers that make it feel like the reference sites (ArtPill, Alche Studio) without adding any new dependencies.

**Reference report:** `web-interaction-study-report.md` in repo root. Patterns are documented there with code snippets.

---

## Conventions (MUST follow)

1. **No em-dashes (—) or decorative middots (·) in any copy or comments.** Use colon, comma, or period. They read as an AI tell.
2. **`?debug=1` gated logging.** The file already has `const DEBUG` and `const log`. Use `log(...)` for dev output, never raw `console.log`.
3. **`prefers-reduced-motion` guard.** The file already has `const PREFERS_REDUCED_MOTION`. Gate ALL new ambient/infinite animations behind it. The reduced-motion CSS block in `landing.css` already kills CSS animations; JS tweens need the JS guard.
4. **Desktop-only cursor.** Hide custom cursor and skip magnetic effects on `pointer: coarse` (touch devices). Check via `matchMedia('(pointer: coarse)')`.
5. **GSAP safety rule:** Animate transforms only, never opacity, for overlay reveals. (Not relevant here since we're not touching overlays, but don't break the rule if you add any.)
6. **Cache bust:** Bump the `?v=land-01` on both `landing.css` and `landing.js` in `landing.html` to `?v=land-02`.

---

## Item 1: Magnetic Hover on Interactive Elements

**What:** Tooltips (`.tooltip`, beat 7), orbit pills (`.orbit-obj`, beat 2), and artifact thumbs (`.artifact-thumb`, beat 5) should magnetically follow the cursor when hovered, then spring back on leave.

**Where to add JS:** `landing.js`, new function `initMagnetic()` called from `init()` (after the beats loop, before the debug handle).

**Pattern:**

```javascript
function initMagnetic() {
  if (PREFERS_REDUCED_MOTION) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  document.querySelectorAll('.tooltip, .orbit-obj, .artifact-thumb').forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - (rect.left + rect.width / 2)) * 0.3;
      const y = (e.clientY - (rect.top + rect.height / 2)) * 0.3;
      gsap.to(el, { x, y, duration: 0.4, ease: 'power2.out' });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
    });
  });
}
```

**CSS:** Add `cursor: pointer` to `.tooltip, .orbit-obj, .artifact-thumb` in `landing.css` (they don't have it yet).

**Gotcha:** The orbit objects and tooltips already have GSAP scrub tweens on them (yPercent, xPercent in `buildBeat`). The magnetic effect uses `x` and `y` (px), which are independent GSAP properties from `xPercent`/`yPercent`, so they won't conflict. Don't change this to use xPercent/yPercent.

---

## Item 2: Custom Cursor (Desktop Only)

**What:** A small (20px) circle that lerps toward the mouse position at ~0.12 speed. `mix-blend-mode: difference` so it inverts over any background. Grows to ~48px when hovering magnetic elements (`.tooltip`, `.orbit-obj`, `.artifact-thumb`, `.artifact`). Hidden on touch devices.

**HTML:** Add this inside `<body>`, before `<main>`:

```html
<div id="cursor" class="custom-cursor" aria-hidden="true"></div>
```

**CSS in `landing.css`:**

```css
/* ---------------------------------------------------------------- custom cursor */
.custom-cursor {
  position: fixed;
  top: 0; left: 0;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--paper);
  mix-blend-mode: difference;
  pointer-events: none;
  z-index: 100;
  transform: translate(-50%, -50%);
  transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1),
              height 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}
.custom-cursor--hover {
  width: 48px; height: 48px;
}

@media (pointer: coarse) {
  .custom-cursor { display: none; }
}
```

Also add `cursor: none` to `body.landing` (only when custom cursor is active, so gate it):

```css
@media (pointer: fine) {
  body.landing { cursor: none; }
  body.landing a, body.landing button { cursor: none; }
}
```

**JS in `landing.js`:** New function `initCursor()` called from `init()`.

```javascript
function initCursor() {
  if (PREFERS_REDUCED_MOTION) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  const cur = document.getElementById('cursor');
  if (!cur) return;

  let mouseX = 0, mouseY = 0, cx = 0, cy = 0;
  const LERP = 0.12;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  const hoverTargets = '.tooltip, .orbit-obj, .artifact-thumb, .artifact';
  document.querySelectorAll(hoverTargets).forEach(el => {
    el.addEventListener('mouseenter', () => cur.classList.add('custom-cursor--hover'));
    el.addEventListener('mouseleave', () => cur.classList.remove('custom-cursor--hover'));
  });

  gsap.ticker.add(() => {
    cx += (mouseX - cx) * LERP;
    cy += (mouseY - cy) * LERP;
    cur.style.transform = `translate(${cx - 10}px, ${cy - 10}px)`;
  });

  cur.style.opacity = '1';
  log('cursor on');
}
```

**Gotcha:** The cursor `transform` must use `translate(px, px)` not `translate(-50%, -50%)` once the RAF loop takes over. Set the initial CSS `translate(-50%, -50%)` as a starting state, then the JS overwrites it. The `- 10` offset in JS centers the 20px circle (half of width). When it grows to 48px via the `--hover` class, the visual center shifts slightly, which is fine and feels organic. If you want pixel-perfect centering, compute `cur.offsetWidth / 2` each frame, but it's not worth it.

**Gotcha 2:** Don't add `will-change: transform` to the cursor in JS. It's already in the CSS. Adding it via GSAP's `force3D` would double-promote the layer.

---

## Item 3: Text Highlight Reveal on Beat 3 Lede

**What:** The lede paragraph in beat 3 ("I build the creative systems...") currently mask-reveals like a headline. Instead, it should have a scroll-driven highlight effect: as the user scrolls through beat 3, a colored background sweeps left-to-right behind the text, like a highlighter pen.

**CSS change in `landing.css`:** Add a new rule:

```css
/* ---- beat 3: scroll-driven text highlight ---- */
.lede-highlight {
  background: linear-gradient(to right, var(--accent) 0%, var(--accent) 100%);
  background-repeat: no-repeat;
  background-size: 0% 100%;
  background-position: left center;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0.08em 0.14em;
  transition: background-size 0.05s linear;
}
```

**HTML change in `landing.html`:** Wrap each line of the lede text content in a `<span class="lede-highlight">`:

BEFORE (beat 3 lede, lines 72-76):
```html
<p class="lede" data-reveal>
  <span class="line"><span class="line-in">I build the creative systems that keep brand,</span></span>
  <span class="line"><span class="line-in">product, story and pipeline coherent, so a</span></span>
  <span class="line"><span class="line-in">5-person team ships like a 50-person one.</span></span>
</p>
```

AFTER:
```html
<p class="lede" data-reveal>
  <span class="line"><span class="line-in"><span class="lede-highlight">I build the creative systems that keep brand,</span></span></span>
  <span class="line"><span class="line-in"><span class="lede-highlight">product, story and pipeline coherent, so a</span></span></span>
  <span class="line"><span class="line-in"><span class="lede-highlight">5-person team ships like a 50-person one.</span></span></span>
</p>
```

**JS change in `landing.js`:** In the `buildBeat` function, inside the `if (n === 3)` block, add the highlight animation to the timeline AFTER the existing title-lock animation:

```javascript
// scroll-driven highlight on lede text
const highlights = qa('.lede-highlight');
if (highlights.length) {
  highlights.forEach((h, i) => {
    tl.to(h, {
      backgroundSize: '100% 100%',
      duration: 0.15,
      ease: 'none',
    }, 0.12 + i * 0.06);
  });
}
```

This staggers the highlight across the three lines as the user scrolls (line 1 starts at 12% through the beat, line 2 at 18%, line 3 at 24%). The highlight sweeps are done well before the exit animation at `SPEED.exitAt` (0.72).

**Gotcha:** The `.lede-highlight` spans are INSIDE `.line-in` which gets `yPercent` animation. The highlight `background-size` is independent of transforms, so no conflict. The exit tween already on `.lede` (the `tl.to([q('.lede'), ...], { y: -60, autoAlpha: 0 }` at `SPEED.exitAt`) will carry the highlighted text out with it.

---

## Item 4: SlotButton Hover on Beat 7 Tooltips

**What:** The three tooltip pills ("Drag to orbit.", "Scroll to zoom.", "Click a tower to enter.") should have the text-swap-on-hover effect: the text slides up and an identical copy slides in from below.

**HTML change in `landing.html`:** Replace the three tooltip spans in beat 7 (lines ~148-151):

BEFORE:
```html
<div class="tooltips" data-tooltips>
  <span class="tooltip">Drag to orbit.</span>
  <span class="tooltip">Scroll to zoom.</span>
  <span class="tooltip">Click a tower to enter.</span>
</div>
```

AFTER:
```html
<div class="tooltips" data-tooltips>
  <span class="tooltip"><span class="tooltip-wrap"><span class="tooltip-text">Drag to orbit.</span><span class="tooltip-hover" aria-hidden="true">Drag to orbit.</span></span></span>
  <span class="tooltip"><span class="tooltip-wrap"><span class="tooltip-text">Scroll to zoom.</span><span class="tooltip-hover" aria-hidden="true">Scroll to zoom.</span></span></span>
  <span class="tooltip"><span class="tooltip-wrap"><span class="tooltip-text">Click a tower to enter.</span><span class="tooltip-hover" aria-hidden="true">Click a tower to enter.</span></span></span>
</div>
```

**CSS addition in `landing.css`:** Replace/extend the existing `.tooltip` rule and add:

```css
.tooltip {
  /* keep all existing tooltip styles */
  overflow: hidden;  /* ADD this to existing rule */
}
.tooltip-wrap {
  display: block;
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.tooltip:hover .tooltip-wrap {
  transform: translateY(-100%);
}
.tooltip-hover {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  padding: 0.4rem 0.8rem;
  opacity: 0;
  transition: opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.tooltip:hover .tooltip-hover {
  opacity: 1;
}
```

**No JS needed.** This is pure CSS.

**Gotcha:** The `.tooltip` already has `padding: 0.4rem 0.8rem`. The `.tooltip-hover` needs the same padding so the text aligns. The `.tooltip-wrap` wraps both labels and slides them as a unit.

---

## Item 5: Scramble Text on Kickers

**What:** When a beat enters the viewport, its kicker label ("01 / THE PITCH", "02 / RANGE", etc.) scrambles through random characters before settling on the final text. Like a departure board or cipher decoding.

**Where to add JS:** `landing.js`, new function `scrambleText(el)` and integrate into the per-beat ScrollTrigger.

**Pattern:**

```javascript
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function scrambleText(el, duration = 600) {
  if (PREFERS_REDUCED_MOTION) return;
  const original = el.textContent;
  const len = original.length;
  const startTime = performance.now();

  function tick() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // characters resolve left-to-right
    const resolved = Math.floor(progress * len);
    let result = '';
    for (let i = 0; i < len; i++) {
      if (i < resolved) {
        result += original[i];
      } else if (original[i] === ' ' || original[i] === '/') {
        result += original[i];  // preserve spaces and slashes
      } else {
        result += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
    }
    el.textContent = result;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
```

**Integration:** In the existing `beats.forEach` loop inside `init()`, where the ScrollTrigger is created for each beat, add the scramble trigger. The non-reduced-motion path already has `onEnter` and `onEnterBack` callbacks that call `setBeat(n)`. Extend them:

In the ScrollTrigger config object (the one with `pin: true, scrub: true`), change:

```javascript
onEnter: () => {
  setBeat(n);
  const kicker = beat.querySelector('.kicker');
  if (kicker) scrambleText(kicker);
},
onEnterBack: () => {
  setBeat(n);
  const kicker = beat.querySelector('.kicker');
  if (kicker) scrambleText(kicker);
},
```

**Gotcha:** The kicker has a `::before` pseudo-element (the yellow accent bar). `textContent` won't touch pseudo-elements, so the bar stays. The scramble only affects the visible text node.

**Gotcha 2:** The scramble uses `requestAnimationFrame` directly (not GSAP ticker) because it's a short fire-and-forget effect, not a scrubbed animation. This is fine.

---

## Verification Checklist

After implementing all 5 items:

1. **Open `http://localhost:4173/landing.html`** (start server with `node scripts/static-server.mjs` if not running)
2. **Scroll through all 7 beats.** Every headline should still mask-reveal and exit cleanly.
3. **Beat 3:** Lede text should highlight left-to-right (yellow background sweep) as you scroll, THEN the whole lede + title-lock exits upward.
4. **Beat 7 tooltips:** Hover each pill. Text should slide up and duplicate slides in from below.
5. **Orbit pills (beat 2) and artifact thumbs (beat 5):** Hover should pull the element toward cursor, leave should spring it back.
6. **Custom cursor:** Visible on desktop (not touch). Small circle follows mouse with slight lag. Grows when hovering interactive elements.
7. **Kickers:** Each beat's kicker should scramble-decode when the beat enters.
8. **`?debug=1`:** HUD should still work. No console errors.
9. **Resize:** `ScrollTrigger.refresh()` should still fire on resize. No layout breakage.
10. **Reduced motion:** Set `prefers-reduced-motion: reduce` in browser DevTools. Cursor, magnetic, and scramble should all be skipped. Highlights should appear statically (background-size: 100% 100% from the start via the existing `revealExtrasStatic` path, or just not animate).

**Reduced-motion for highlight:** Add `.lede-highlight` to the `revealExtrasStatic` function's selector list so it gets `clearProps: 'all'` (which will leave background-size at its CSS default of `0% 100%`). Actually, for reduced motion you want the highlight visible, so instead add this CSS rule:

```css
@media (prefers-reduced-motion: reduce) {
  .lede-highlight { background-size: 100% 100% !important; }
}
```

This ensures the highlight is always visible when motion is reduced.

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `landing.html` | Add `#cursor` div, wrap beat-3 lede lines in `.lede-highlight`, restructure beat-7 tooltips for SlotButton pattern, bump `?v=land-02` on CSS+JS |
| `landing.css` | Add custom cursor styles, cursor `pointer: fine` body override, `.lede-highlight` rule, `.tooltip` overflow + SlotButton hover rules, reduced-motion highlight rule, `cursor: pointer` on magnetic targets |
| `landing.js` | Add `initMagnetic()`, `initCursor()`, `scrambleText()` functions, call from `init()`, extend beat-3 `buildBeat` with highlight tween, extend ScrollTrigger `onEnter`/`onEnterBack` with scramble call |

**Do not create new files.** All changes go into the existing three landing files.
