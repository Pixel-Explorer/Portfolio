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
// Computed from real GLB world positions (pass-03 §2 ground truth) via frameBuilding().
export const BEAT_TUNING = {
  // birth: Hospital_Building_n3d @ 2.55, 0, 3.91
  birth:   { camPos: [-8.79, 5, 10.36], camTarget: [2.55, 2, 3.91], fov: 40 },
  // graduation: BBA-ITM @ 3.95, 0, 2.11
  graduation: { camPos: [17.87, 6, 7.94], camTarget: [3.95, 2, 2.11], fov: 40 },
  // aiesec: AIESEC @ 2.24, 0, 2.18
  aiesec:  { camPos: [2.24, 6, -9.82], camTarget: [2.24, 2, 2.18], fov: 40 },
  // veer: Schoogle @ 12.89, 0, -5.54
  veer:    { camPos: [22.79, 6, -0.60], camTarget: [12.89, 2, -5.54], fov: 40 },
  // film: midpoint of Movies (0.58,0,-0.95) + Corp Filims (5.40,0,-2.96) ≈ (2.99, 0, -1.96)
  film:    { camPos: [-5.01, 7, 8.00], camTarget: [2.99, 2, -1.96], fov: 38 },
  // pixelate: Pixelate @ 2.36, -6.69, -5.62 — target building center at ~y3 above ground
  pixelate: { camPos: [-9.64, 6, -10.62], camTarget: [2.36, 3, -5.62], fov: 36 },
  // studio: midpoint of Haus of Pixels (-5.67,0,4.43) + Haus work block (-13.14,0,14.44) ≈ (-9.41, 0, 9.44)
  studio:  { camPos: [-21.41, 6, 3.44], camTarget: [-9.41, 2, 9.44], fov: 40 },
  // europe: midpoint of Buddy Tales (-4.17,0,1.63) + KH (-7.78,0,3.31) ≈ (-5.98, 0, 2.47)
  europe:  { camPos: [-5.98, 6, 16.47], camTarget: [-5.98, 2, 2.47], fov: 38 },
  // rabble: Rabble building @ -3.66, 0, -3.51
  rabble:  { camPos: [4.34, 5, 4.49], camTarget: [-3.66, 2, -3.51], fov: 40 },
  // pondi: Remote Stations-Homes @ -7.09, 0, -3.10
  pondi:   { camPos: [-19.09, 6, -9.10], camTarget: [-7.09, 2, -3.10], fov: 40 },
  // arrival/cta: wide city shot (center ≈ 0.3, 0, -3; radius ~15)
  arrival: { camPos: [0.3, 16, -33], camTarget: [0.3, 4, -3], fov: 40 },
  cta:     { camPos: [15, 14, -25], camTarget: [0.3, 3, -3], fov: 42 },
  // handoff: orb-level intimate
  handoff: { camPos: [3, 3, 0], camTarget: [0, 2, -5], fov: 45 },
};

// Compute a cinematic camera position targeting a building.
//   worldPos: [x, y, z] — the building's world position (y is typically 0)
//   azimuthDeg: degrees off north (0 = camera on +Z side, 90 = camera on +X side)
//   distance: how far back from the building
//   height: camera height above worldPos.y
//   lookHeight: where the camera looks (above worldPos.y, i.e. building mid-height)
//   fov: field of view
export function frameBuilding(worldPos, { azimuthDeg = 35, distance = 14, height = 6, lookHeight = 3, fov = 40 } = {}) {
  const az = azimuthDeg * Math.PI / 180;
  const x = worldPos[0];
  const z = worldPos[2];
  const groundY = Math.max(0, worldPos[1] || 0);
  return {
    camPos: [x + distance * Math.sin(az), groundY + height, z + distance * Math.cos(az)],
    camTarget: [x, groundY + lookHeight, z],
    fov,
  };
}
