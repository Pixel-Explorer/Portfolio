# CLAUDE-STORY-MODE.md

> Context pickup for Story Mode implementation. Auto-load when working on `story/`.

---

## Architecture overview

```
story/
├── beat-data.js        ← 14 beats (id, voText, camera pos/target, buildings[], orbState, colorGrade, veerPath, year)
├── story-engine.js     ← orchestrator: scroll→beat, tick loop, building lifecycle, bg management
├── camera-rig.js       ← animateTo (establishing shot) → chase mode (handheld follow orb), dollyZoom
├── orb.js              ← PointLight sphere, mouse-follow target, trail particles, state machine
├── beat-buildings.js   ← extract nodes from stagerCityGroup → pivot → animate (reveal/rise/veer/dock/skyline)
├── ui.js               ← hook line, subtitle, rest indicator, skip link, year ticker, letterbox, mode toggle
├── audio-manager.js    ← HTMLAudio+MP3 fallback→TTS VO + score mood ducking/swelling
├── transitions.js      ← 5-part grammar (flow/veer/drain/break/bloom), sequence-counter cancellation
├── scroll-manager.js   ← window scroll → progress (0.08 lerp), lock/unlock, scroll-gated rests
├── color-grader.js     ← ShaderPass (saturation/contrast/tint) — ERA_COLORS per beat
├── explode-view.js     ← real ledger data cards fan-out from building anchor (explode/collapse)
└── mobile-teaser.js    ← 2D DOM/CSS slide sequence + particle canvas + landing card for mobile
```

**Integration points in main app:**
- `index.html` → `.story-mode-select`, `.story-subtitle`, `.story-hook-line`, `.story-skip-link`, `.story-year-ticker`, `.story-letterbox`, `.story-mode-toggle`, etc
- `styles.css` → lines ~4317–4545: all story overlay styles, plus mobile-teaser styles
- `app.js` → `showModeSelect()` (lines 103–177), `startStory()` (dynamic import + init)
- `terrain.js` → `__storyRefs` (line 3323), `__storyMode` (wheel guard line 2725), `cityReady` (line 3601)

---

## Data flow

```
scroll position → progress (0..1)
    → _findBeatForProgress() → _enterBeat(beatIndex)
        → hide prev buildings (moveToSkyline)
        → run transition (bloom/drain/break)
        → show subtitle (beat.voText)
        → set scene background (BG_COLORS[beat.colorGrade])
        → color grader preset (ERA_COLORS[beat.colorGrade])
        → animateTo(beat.camera) → establishing shot (3.5s) → chase mode

tick loop (60fps):
    mouse (norm -1..1) → orb._targetPos (offset from beat camera target)
    orb.tick() → lerp _currentPos toward _targetPos → group.position
    camera.updateChase(orb.group.position) → _chasePos lerp + micro-shake
    scheduleRender()
```

---

## Key concepts

### Chase mode (camera-rig.js)
After `animateTo` completes (3.5s establishing shot), `_chaseActive = true`.
`updateChase()`: desiredPos = orbPos + _chaseOffset → lerp _chasePos at 2.5 speed → apply micro-shake (sin 0.04 intensity).

### Orb projection (story-engine.js _tick)
`mouseNorm * maxOffset` added to beat camera target → orb target.
maxOffset = min(8, dist * 0.06). Orb lerps toward target at 1.5 speed.

### Subtitle system (ui.js)
`showSubtitle(voText)` — display VO text as on-screen captions (uppercase bold per typography.md).
Shown on beat enter, hidden during transition to next beat.

### Background management (story-engine.js)
`BG_COLORS` map (10 dark hues from ERA_COLORS tints). GSAP-animates scene.background r/g/b.
All city buildings hidden at story start via `hideAllBuildings()` (sets `node.visible = false`).
Re-hidden when city GLB finishes loading in `_waitForCity()`.

### Building lifecycle (beat-buildings.js)
1. `hideAllBuildings()` — start of story
2. `_getOrCreatePivot(name)` — extracts node from stagerCityGroup → wrapper pivot (sets node.visible = true)
3. `revealBuilding/riseBuilding/veerBuilding/dockBuilding` — per-beat hero animation (accumulate, don't throw)
4. `dockBuilding(name)` — animate to original world position + dim emissive (accumulation, not skyline discard)
5. `veerBuildingAlongPath(name, waypoints)` — deviation geography (Schoogle arc, Europe stall)
6. `revealAllBuildings()` — beat 12: scale-in all city buildings staggered
7. 3-tier visibility: future/active/reached (with `markReached`/`isReached`)

---

## Beat 12-13 archive transition

- **Beat 12**: bg fades to 0x0f0f0f, `revealAllBuildings` (3s stagger), chase disabled
- **Beat 13**: orb handoff → `_complete()` → fly camera to archive orbit (1.5s) → restore FOV (10°) → restore bg → destroy engine → `onComplete` callback → `app.js` runs `init()` (archive mode)

---

## Known issues / gaps

1. **Audio BG track**: `_bgUrl = null` in audio-manager.js. Set to a royalty-free track path to enable.
2. **Mobile teaser**: Mobile gets 2D slide sequence + landing card ("Built for a big screen"), not the full 3D story. Mobile teaser uses a canvas particle system and GSAP slide transitions.
3. **Building names must match GLB**: `_findBuildingNode` does fuzzy matching, but beat-data.js building names must be recognizable in the GLB hierarchy.
4. **First beat auto-advance**: Beat 0 `scrollLocked: true` triggers `_startAutoAdvance` (4s, 2s reduced-motion). After auto-advance finishes, scroll unlock. User scrolling cancels auto-advance.
5. **ExplodeView**: Wired to hero beats (Movies, Pixelate, Haus work block, Buddy Tales). Real ledger data cards anchored to building world position. Collapses on next beat or rest end.
6. **rest beats**: VO text `onEnd` calls `_startRest()` — shows "↓ Scroll to continue" for 12s. Scroll-gated (85% of beat progress range to leave). During rest, scroll input is blocked (`_restActive` check in `_onUserScroll`).
7. **Reduced motion**: `prefers-reduced-motion: reduce` support in engine, transitions, and explode-view. Skips GSAP fan-outs, shortens auto-advance, uses instant overlay flashes.

---

## How to test

```
http://127.0.0.1:4173/?story      # skip landing, go straight to story
http://127.0.0.1:4173/?archive    # skip landing, go straight to archive
http://127.0.0.1:4173/             # show mode select (Play Film / Explore Archive)
```

`Ctrl+F5` to hard-refresh (no live reload).

---

*Last updated: 4 Jun 2026 — T0–T10 complete: discovery, audio, scroll, buildings, orb lighting, deviation, transitions, explode-view, cinematic UI, mobile teaser, reduced-motion, cleanup.*
