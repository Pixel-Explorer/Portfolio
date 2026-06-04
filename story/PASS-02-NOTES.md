# STORY-PASS-02 NOTES

## Cache tag
`story-pass-02` — applied in `index.html` (2 files) and `app.js` (5 occurrences).

## Branch
`story-mode-preloader` — no merge to master.

## Commits (after pass-01 base)
1. `Cache bump: story-pass-01 → story-pass-02` — tag update across index.html + app.js
2. `A1-A7: Audit fixes` — hideAllBuildings/isMesh traversal, orb rewrite, stage-direction stripping, letterbox classes, caption safe zone, ERA_COLORS saturation, dockBuilding pivot.scale + NaN guard
3. `B1-B4: Tuning infrastructure` — tuning.js, dumpnodes v2, frameBuilding helper, tune-panel.js
4. `C1-C2: Self-test` — selftest.js harness, static method-signature audit
5. `Group D: beat expansion 14→18` — graduation split, photon, aiesec, rabble, cta added; hardcoded indices updated
6. `Group E: motion & feature polish` — veer drift, buildings tick bounce, orb building-anchor orbit
7. `Group F: proof images, pre-commit hook` — explode-view image loading, npm test script, .git/hooks/pre-commit

## State
- 18 beats from `boot`→`handoff` (0.0→1.0 scroll, 12 viewports)
- All beat IDs unique; progressRanges contiguous
- Audio files NOT yet in `story/audio/` — TTS fallback runs for all beats
- BEAT_TUNING in tuning.js has entries for: birth, graduation, veer, film, pixelate, studio, europe, pondi, arrival, handoff
- Missing BEAT_TUNING: photon, aiesec, rabble, film_fall, break, cta, meta, boot (no buildings, default camera fine)

## TODOs
- Human-in-loop tuning with `?story&tune` for camera positions (especially new beats)
- Record/place MP3 files in `story/audio/` for all 18 beats
- Add proof images to `public/proof/<entryId>/thumb.jpg`
- Run `?story&selftest` in browser to validate full beat sequence
- Run `?story` to check for zero console errors

## Known warnings (benign)
- New beats (photon, aiesec, rabble, cta) have no audio-manifest entries → TTS fallback
- photon has no BEAT_TUNING entry → uses beat-data camera defaults
- No audio MP3 files exist yet in `story/audio/`

## Testing
```bash
npm test              # Static pre-commit checks (beat structure, IDs, ranges)
npm start             # http-server on :8080
# Then browse:
#   /?story           — full story mode
#   /?archive         — archive mode (must not break)
#   /?story&tune      — live camera tuning panel
#   /?story&selftest  — runtime assertion harness (browser console)
