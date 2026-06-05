# CLAUDE-STORY-MODE.md

> Context pickup for Story Mode implementation. Auto-load when working on `story/`.
> Last updated: 5 Jun 2026 — pass-04 complete (hard isolation guard, hero framing lift, multi-building framing, plinth tone, single orb, hero-only reveal, tightened selftest)

---

## Architecture overview

```
story/
├── beat-data.js        ← 18 beats (id, voText, camera, buildings[], orbState, colorGrade, veerPath, year)
├── story-engine.js     ← orchestrator: scroll→beat, tick loop, building lifecycle, bg management
├── camera-rig.js       ← animateTo → chase mode, dollyZoom, veer-drift
├── orb.js              ← PointLight sphere + additive halo sprite, building-anchor orbit
├── beat-buildings.js   ← pivot system (reveal/rise/veer/dock), idle bounce tick, hide/show all
├── ui.js               ← hook line, subtitle, rest indicator, skip link, year ticker, letterbox, mode toggle
├── audio-manager.js    ← HTMLAudio+MP3 fallback→TTS VO + score mood ducking/swelling
├── transitions.js      ← 5-part grammar (flow/veer/drain/break/bloom), sequence-counter cancellation
├── scroll-manager.js   ← window scroll → progress, lock/unlock, scroll-gated rests
├── color-grader.js     ← ShaderPass (saturation/contrast/tint) — ERA_COLORS per beat
├── explode-view.js     ← real ledger data cards + proof images from building anchor
├── tuning.js           ← GLOBAL_TUNING (orb/camera/grade/plinth/proximity/scroll/rest) + BEAT_TUNING (per-beat camera) + frameBuilding() helper
├── selftest.js         ← ?story&selftest runtime assertion harness (resolution + framing)
├── tune-panel.js       ← ?story&tune live sliders (GLOBAL + per-beat camera) + copy-to-clipboard
├── selftest-precommit.js ← node.js static analysis (beat structure, IDs, manifest)
├── audio-manifest.js   ← VO_FILES map (beatId → MP3 path) + SCORE_BED
└── mobile-teaser.js    ← 2D DOM/CSS slide sequence + particle canvas + landing card
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

## Beat 15-17 archive transition (arrival→cta→handoff)

- **Beat 15** (arrival): bg fades to 0x0f0f0f, `revealAllBuildings` (3s stagger), chase disabled, corner caption
- **Beat 16** (cta): clean wide city shot, corner caption, no profanity
- **Beat 17** (handoff): orb handoff → `_complete()` → fly camera to archive orbit (1.5s) → restore FOV (10°) → restore bg → destroy engine → `onComplete` callback → `app.js` runs `init()` (archive mode)

---

## Known issues / gaps

1. **Audio MP3 files**: No MP3 files exist in `story/audio/` — all beats fall through to TTS. VO_FILES manifest has entries for all 18 beats; drop files to enable.
2. **Proof images**: Explode-view loads `public/proof/<entryId>/thumb.jpg` — no images exist yet. Falls back to text-only cards.
3. **Camera framing**: BEAT_TUNING computed from real GLB world positions via `frameBuilding()`. Framing is correct (on-screen) but may need aesthetic tuning via `?story&tune`.
4. **Mobile teaser**: Mobile gets 2D slide sequence + landing card ("Built for a big screen"), not the full 3D story.
5. **Building names must match GLB**: `_findBuildingNode` does fuzzy matching. Building parents are Object3D (not Mesh/Group) — `_findBuildingNode` and `revealAllBuildings` match by name without type filters.
6. **First beat auto-advance**: Beat 0 `scrollLocked: true` triggers `_startAutoAdvance` (4s, 2s reduced-motion).
7. **rest beats**: VO text `onEnd` calls `_startRest()` — scroll-gated (85% threshold) + 12s timeout.
8. **Reduced motion**: `prefers-reduced-motion: reduce` gated in engine, transitions, explode-view, orb, beat-bounce, camera veer-drift.

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
