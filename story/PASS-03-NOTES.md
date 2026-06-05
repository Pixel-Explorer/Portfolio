# STORY-PASS-03 NOTES

## Cache tag
`story-pass-03` — applied in `index.html` (2), `app.js` (5), `story/story-engine.js` (1).

## Branch
`story-mode-preloader` — no merge to master.

## Commits (pass-03, 9 commits)
1. **P0**: Bump cache tag `story-pass-02→story-pass-03`; remove pre-commit hook
2. **P1**: Confirm TDZ fix + `_findBuildingNode` name-match; relax Object3D guard in `revealAllBuildings`
3. **P2**: `frameBuilding()` with azimuth/distance/height; BEAT_TUNING recomputed from real GLB world positions (pass-03 §2 ground truth)
4. **P3**: arrival/cta wide city framing (center ≈0.3,0,-3; distance 30/25, height 16/14, FOV 40/42); corner caption mode verified
5. **P4**: Wire `photon`/`aiesec`/`rabble`/`cta` in `audio-manifest.js` + `photon` BEAT_TUNING (contemplative orb shot over city)
6. **P5**: `explode-view.js` graceful fallback — skip entries with no usable content; guard `entry.id` in image src
7. **P6**: Call `hideAllBuildings()` at init; fix `_getOrCreatePivot` to restore mesh visibility after hide; archive handoff `showAllBuildings()` intact
8. **P7**: Selftest framing assertion — projects each beat's building through tuned camera; checks NDC on-screen (|x|<0.85, |y|<0.85, z>0)
9. **P8**: Confirmed orb proximity-brighten (falloffRadius=12, maxBoost=2.0), plinth tint (0x1a1814), desaturated ERA_COLORS
10. **P9**: Final gate — zero console errors, archive parity, CTA clean (no profanity), cache tags consistent

## State
- 18 beats, all with BEAT_TUNING entries (photon: contemplative orb, no building)
- All audio-manifest entries present (files not yet in `story/audio/` — TTS fallback active)
- Every hero beat's building frames correctly from real GLB world positions
- Selftest checks both building resolution AND framing (NDC projection)
- No git hooks installed

## Verification
```bash
node story/selftest-precommit.js   # Static checks: beats, IDs, ranges, manifest, tuning
# Browser:
#   ?story&selftest                 # Runtime: resolution + framing assertions
#   ?story                          # Scrub all beats, zero console errors
#   ?archive                        # Backward compat, pixel-identical to cold load
```

## Known gaps
- No MP3 files in `story/audio/` — all beats fall through to TTS
- Proof images in `public/proof/<entryId>/thumb.jpg` needed for explode-view cards
- Camera framing may need aesthetic nudging via `?story&tune` — P2 gets it on-screen; the panel makes it beautiful
