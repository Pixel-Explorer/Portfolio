// story/tuning.js — Central tunable values for Story Mode.
// A human scrubs these with ?story&tune and copies the JSON back here.
// Module code reads from BEAT_TUNING[id] (falls back to beat-data fields)
// and GLOBAL_TUNING (falls back to per-module defaults).

export const GLOBAL_TUNING = {
  orb: {
    coreSize: 0.35,
    haloScale: 2.1,
    lightIntensity: 1.5,
    lightDistance: 60,
    emissiveBoost: 2.5,
    falloffRadius: 12,
    lerpSpeed: 1.5,
  },
  camera: {
    chaseLerp: 2.5,
    microShake: 0.04,
    dollyFovFrom: 40,
    dollyFovTo: 15,
    dollyDuration: 1.8,
    dollyPullback: 6,
  },
  grade: {
    // Multiply ERA_COLORS saturation values by this
    saturationScale: 0.9,
  },
  plinth: {
    tint: 0x1a1814,
  },
  proximity: {
    falloffRadius: 12,
    maxBoost: 2.0,
  },
  scroll: {
    totalViewports: 12,
    lerpFactor: 0.08,
  },
  rest: {
    timeoutMs: 12000,
    scrollThreshold: 0.85,
  },
};

// Per-beat camera overrides. Keys that are absent fall through to beat-data's camera field.
// A human fills these in via ?story&tune to fix framing without touching beat-data.
export const BEAT_TUNING = {};
