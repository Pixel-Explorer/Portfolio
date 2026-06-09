# SPEC — Immersive folder overlay (no split) + choreography + scene cleanup

> **Evolution note:** This spec started as bubble-pop (Pass d2) but has since evolved through 6 iterations
> (elastic pop → cinematic slide-up → tab font/sizing iterations → hover peek → duplicate heading removal →
> **physical tab movement**). The current build replaces bubble-pop with a cinematic GSAP slide-up and the
> top priority is making the tab button physically move from the tab bar to the card top (no duplicates, no
> hiding). See AGENTS.md §0 for full iteration history.
>
> The folder DECK (full-panel folders stacked, front shows content, tabs peek, OPEN→single page) is **done
> and good — keep it.** This pass changes how it's *rendered and animated* so the whole thing feels organic
> and immersive, and strips the 3D scene down to just the city. Claude = supervisor/reviewer; **OpenCode =
> implementer.** `CLAUDE.md` rules apply (vanilla JS, transform-only anims, CSS `.visible` owns opacity).

## The problem now
The deck is an **opaque bottom-sheet panel** → there's a hard, **visible split** between the 3D city (top)
and the folder panel (bottom). The user wants **no split**: the 3D city fills the whole viewport and the
folders float as a **2D overlay on top of the 3D layer**, popping out of the scene.

---

## Part A — Kill the split: folders overlay the full-viewport 3D
- The **3D canvas fills the entire viewport** (city framed to fill the frame, rendered behind everything).
- The folder overlay (`#projectPage` / the deck container) becomes a **full-viewport, fully transparent**
  layer — **no panel background, no border, no fixed bottom height, no slide-up-as-a-sheet**. The only
  visible UI is the **folder cards themselves**, floating over the live city.
- Keep the cards' folder look + the front-panel/peeking-tabs/OPEN→ behaviour exactly as built.
- Position the deck as a floating cluster in the frame (e.g. to one side of the focused building — see Part B
  camera move), not pinned to the bottom edge.
- Remove `.folder-sheet` bottom-panel CSS (bg fill, border-top, `--sheet-h`, the bottom drawer geometry).
  Single-entry detail stays a folder but also floats (no opaque sheet behind it).

## Part B — Bubble-pop choreography (the organic, immersive animation)
When a cluster opens, in this order, **coordinated between the DOM (GSAP) and the Three camera (terrain.js)**:
1. **Camera makes space.** `animateCameraTo(...)` ([terrain.js:2323](terrain.js:2323)) pans/dollies the city
   aside (shift `azimuth` + `camTarget.x`, maybe pull `radius`) so there's open frame for the folders to
   populate. Folders can enter from **either side**, opposite the city.
2. **Folders pop in like bubbles.** GSAP timeline: each card scales from ~0 with an **elastic/overshoot ease**
   (bubble pop), settling into its deck position. The stagger is **non-uniform and eased** — vary the delays
   so some pops cluster close together and some are further apart (an organic rhythm, NOT a constant
   stagger). Vary each card's **depth/scale/offset** so some read closer and some further.
3. **Each pop reacts the camera.** On every card's pop, fire a small **camera impulse / shake** — a quick
   decaying jitter on the viewpoint, so each pop feels like it has weight and disturbs the scene. Strength
   can scale with the card's apparent size/closeness.
4. Transform + scale only; opacity stays owned by CSS `.visible` (a stalled GSAP opacity tween strands the
   overlay — documented in CLAUDE.md).

**New terrain API to expose** (on the object terrain.js returns, so the folder code can drive the camera):
- `terrain.makeSpaceForCluster(side)` — the Part-B-1 camera move.
- `terrain.cameraImpulse(strength)` — a transient decaying offset added to the camera (implement as a shake
  offset applied in `applyCamera()` / tweened back to 0 via GSAP); call once per folder pop.
- `terrain.restoreCamera()` — undo the make-space move on close.
The cluster-open code (`openClusterPage` / the deck init in `app.js`) calls these in step with the GSAP pop
timeline (`onStart`/per-card callbacks → `cameraImpulse`).

## Part C — Scene cleanup: keep ONLY the city cluster
In `terrain.js` scene build, remove (or gate off) the diorama extras, keep the GLB city:
- **Remove the circular plinth** (`name:"plinth"`, `CylinderGeometry` ~[terrain.js:326](terrain.js:326)).
- Remove the **road bed**, **lamp posts + the plinth-edge lamp ring**, **all vegetation** (bushes / flowers /
  hedges / pixel crops), **kiosks / benches**, and the **under-plinth reflection**.
- **Keep:** the Adobe-Dimensions **GLB city composition** (`stagerCityGroup`), the dark floor/background,
  lighting + shadow map + IBL env map (so the city still reads as lit).
- Net result: just the building cluster floating on the dark ground — nothing else.

## Implementation map
- Camera: `camTarget` + `camState{radius,polar,azimuth}` → `applyCamera()` (2307); `animateCameraTo` (2323).
  Add a `shakeOffset` Vector3 added to `camera.position` in `applyCamera`, tweened toward 0 for the impulse.
- Folder overlay markup/anim: the deck the user just approved (`openClusterPage` + the deck CSS). Reuse it;
  change only the container (full-viewport transparent) + the open animation (GSAP pop timeline + camera calls).
- Reuse `findBucketForTags`/`ROLE_PILLS`, `selectEntry`, `refreshProjectBack`/`state.clusterContext`.

## Constraints
Don't break: single-entry folder (also floats now), prev/next, Escape, cluster-back (`×`↔`←`),
building-highlight (`setCityFocus`). Mobile can fall back to a simpler stacked overlay. Token-frugal.
Bump `index.html` `?v=`; one-line note to `CLAUDE.md` §0 + `AGENTS.md`. Retire dead `.folder-sheet` /
FOLDER-LOOK CSS you replace.

## Acceptance criteria
- [ ] **No visible split** — the 3D city fills the viewport; folders float over it as a transparent overlay.
- [ ] Opening a cluster: **camera makes space**, then folders **pop in like bubbles** — staggered with
      eased, non-uniform timing, varied depth — and **each pop nudges/shakes the camera**.
- [ ] **Plinth + road + lamps + vegetation + reflection are gone**; only the city cluster + ground remain.
- [ ] Deck content (front panel + peeking tabs + OPEN→single page), single-entry folder, prev/next, Escape,
      cluster-back, building-highlight all still work; no console errors; no glass.

## Run / verify
`node scripts/static-server.mjs` → `http://127.0.0.1:4173/?archive`. Open HAUS (11) / MOVIES (7): confirm no
split, camera make-space, cinematic card slide-up with content stagger, and a clean city (no
plinth/vegetation). Screenshot the populated overlay + the stripped scene.
```

---

## Study material & design references

| Reference | URL | What it informed |
|---|---|---|
| @shrshhez (Shrushti) | <https://x.com/shrshhez> | Daily design/motion/3D inspiration feed |
| Artycoders | <https://artycoders.com/> | Cinematic web design + brand-elevation visuals |
| @exploraX_ | <https://x.com/exploraX_> | AI + design content curation |
| Oluwaphilemon | <https://x.com/Oluwaphilemon1> | Portfolio construction + agency-level patterns |
| GSAP docs | <https://gsap.com/docs/> | Camera choreography, card slide-ups, stagger animations |
| Three.js examples | <https://threejs.org/examples/> | DRACOLoader, GLB loading, EXRLoader, PMREMGenerator |

