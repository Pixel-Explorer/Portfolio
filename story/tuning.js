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
export const BEAT_TUNING = {
  // Hero beats — seeded from GLB world positions (v2 dump). Tune with ?story&tune.
  birth: {
    camPos: [8, 6, 12],
    camTarget: [0, 4, 0],
    fov: 35,
  },
  graduation: {
    camPos: [-10, 8, 14],
    camTarget: [0, 5, 0],
    fov: 38,
  },
  veer: {
    camPos: [12, 6, 10],
    camTarget: [4, 4, 0],
    fov: 40,
  },
  film: {
    camPos: [0, 6, 12],
    camTarget: [0, 3, 0],
    fov: 36,
  },
  pixelate: {
    camPos: [-8, 8, 14],
    camTarget: [0, 5, 0],
    fov: 35,
  },
  studio: {
    camPos: [6, 7, 13],
    camTarget: [0, 4, 0],
    fov: 36,
  },
  europe: {
    camPos: [-5, 6, 12],
    camTarget: [0, 4, 0],
    fov: 38,
  },
  pondi: {
    camPos: [10, 5, 10],
    camTarget: [2, 3, 0],
    fov: 40,
  },
  arrival: {
    camPos: [0, 18, 28],
    camTarget: [0, 6, 0],
    fov: 45,
  },
  handoff: {
    camPos: [0, 25, 35],
    camTarget: [0, 8, 0],
    fov: 50,
  },
};

// Compute a sensible camera position looking at a building center.
// offsetMultiplier: how far back/up relative to building size (3–5 = hero, 8–12 = wide)
export function frameBuilding(worldPos, size, { offsetMultiplier = 4, fov = 40 } = {}) {
  if (!size) return { camPos: [0, 10, 10], camTarget: [0, 5, 0], fov };
  const w = size[0] || 2;
  const h = size[1] || 4;
  const d = size[2] || 2;
  const maxDim = Math.max(w, h, d);
  const dist = maxDim * offsetMultiplier;
  return {
    camPos: [worldPos[0], worldPos[1] + h * 0.6, worldPos[2] + dist],
    camTarget: [worldPos[0], worldPos[1] + h * 0.4, worldPos[2]],
    fov,
  };
}
