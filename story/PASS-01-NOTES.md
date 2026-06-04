# STORY-PASS-01 — Handback notes

## What shipped

### Tasks T0–T11 complete

| Task | What was built |
|---|---|
| T0 | GLB node dump, building→entry map, `getEntryById`/`entries` exposure, cache tags |
| T1 | `audio-manifest.js`, AudioManager rewrite (HTMLAudio+MP3 → TTS fallback, score mood ducking/swelling) |
| T2 | 1200vh scroll height, progress smoothing (0.08 lerp), scroll-gated rests (85% band threshold, 12s safety timeout) |
| T3 | Building accumulation (dock — don't throw), 3-tier visibility (future/active/reached), fixed `revealAllBuildings` traversal |
| T4 | Ambient/hemisphere light base, proximity brighten (12-unit falloff, 2.0x max), fall-state suppression |
| T5 | `veerPath` + `veerBuildingAlongPath`/`returnBuilding`, Schoogle arc (veer→off-spine→return), Europe stall |
| T6 | 5-part transition grammar (flow/veer/drain/break/bloom), two-step drain→break at film_fall, single dolly-zoom |
| T7 | Explode-view with real ledger data cards (title, role·org, date, tag pills), anchored to building world position |
| T8 | Year ticker, letterbox bars, skip link, mode toggle (Archive button) |
| T9 | Mobile teaser — 2D DOM/CSS slide sequence + canvas particle system + landing card with copy link |
| T10 | Reduced-motion gating, node cache (no per-frame GLB traversal), Vector3 reuse, `destroy()` on all modules |
| T11 | Final audit, cache-tag consistency, this handback doc |

## What's stubbed / needs owner assets

### Audio (14 files)
Drop 11Labs renders into `story/audio/` named `<beatId>.mp3`:

```
story/audio/boot.mp3
story/audio/meta.mp3
story/audio/birth.mp3
story/audio/graduation.mp3
story/audio/veer.mp3
story/audio/break.mp3
story/audio/film.mp3
story/audio/film_fall.mp3
story/audio/pixelate.mp3
story/audio/studio.mp3
story/audio/europe.mp3
story/audio/pondi.mp3
story/audio/arrival.mp3
story/audio/handoff.mp3
```

Optional: `story/audio/score-bed.mp3` — looping ambient music bed.

Until files are present, browser TTS runs automatically (stage directions `[ ... ]` are stripped before TTS).

### Proof images
Explode-view panels have a documented image slot at `story/explode-view.js:81`:
```js
// image slot: if (entry.evidence?.[0]?.src) { load as texture } else { draw text card }
```
Drop images into `public/proof/<entryId>/` and they auto-appear in the hero-beat explode panels.

## Verified

- `?archive` boots with no console errors
- `?story` boots end-to-end on TTS (no MP3s needed)
- All `?v=` cache tags consistent: `story-pass-01`
- No stale `time-machine-r15` tags
- Reduced-motion: `prefers-reduced-motion: reduce` respected (calm transitions, no orb roam, no shake)
- All story overlays cleaned up on `destroy()` / `_complete()`

## Commit log

```
a21c464 story-pass T0: GLB node discovery, beat-data name reconciliation, expose building/entry refs
0b1213a story-pass T1: per-beat MP3 manifest + AudioManager (HTMLAudio VO, TTS fallback, score-mood ducking)
9326aa9 story-pass T2: 1200vh scroll, progress smoothing, scroll-gated rests
4af7f7d story-pass T3: building accumulation (dock not throw), 3-tier visibility, fix revealAllBuildings
5fd7376 story-pass T4: orb-lights-the-city (ambient base, proximity brighten, falls struggle, accumulation)
662ed40 story-pass T5: deviation geography — veer off-spine and return (NID→film, Europe stall)
946984d story-pass T6: transition grammar (flow/veer/drain/break/bloom) + single Vertigo dolly-zoom on film_fall
1de1fc2 story-pass T7: explode-view wired to hero rests, real ledger text, image slot for later
8b6499a story-pass T8: persistent cinematic UI (year ticker, letterbox, skip, mode toggle)
f963801 story-pass T9: mobile teaser (slide sequence + landing card + particle canvas)
ee3446c story-pass T10: reduced-motion, perf (node cache, vec3 reuse), destroy cleanup all modules, docs
[head]   story-pass T11: final self-audit, cleanup, PASS-01 handback notes
```

## Test URLs

```
http://127.0.0.1:4173/?story      # straight into story mode
http://127.0.0.1:4173/?archive    # straight into archive
http://127.0.0.1:4173/            # mode-select overlay (mobile → teaser)
```

Hard refresh (Ctrl+F5) — no live reload.
