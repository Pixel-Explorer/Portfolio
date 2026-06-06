# PASS-04 — Polish + Hard Isolation

## Summary
- Cache bumped `story-pass-03` → `story-pass-04`
- P0: `story/_guard-snapshot.json` created from `git ls-files -s data/ public/`
- P2: Hero framings lifted — single-building beats now land at NDC.y ≈ −0.15 to +0.30
- P3: Multi-building beats (film/studio/europe) widened — all subjects within |NDC| < 0.7
- P4: Plinth desaturated during story (→ warm neutral `0x1a1814`), restored on handoff
- P5: Stray PointLights cleaned from scene at init; only one orb group exists
- P6: `hideAllBuildings` now keeps reached/active building nodes visible (hero-only reveal)
- P7: Selftest tightened with framing window, orb count, plinth tone assertions

## Violations Caught
None — data/ and public/ untouched.

## Files Modified
- `app.js` — cache bump
- `index.html` — cache bump
- `story/story-engine.js` — plinth name-based lookup, stray light cleanup
- `story/tuning.js` — new BEAT_TUNING with lifted framings
- `story/beat-buildings.js` — hero-only reveal via `_reachedNodes`
- `story/selftest.js` — tighter framing window, orb/plinth assertions
