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
  // P2: Lift hero framings — lower camera height + look near building base so
  // buildings sit at NDC.y ≈ −0.15 to +0.30 (upper-middle, clear of caption).
  // birth: Hospital_Building_n3d @ 2.55, 0, 3.91
  birth:   { camPos: [8.86, 4, 12.92], camTarget: [2.55, 0.8, 3.91], fov: 40 },
  // graduation: BBA-ITM @ 3.95, 0, 2.11
  graduation: { camPos: [10.26, 4, 11.12], camTarget: [3.95, 0.8, 2.11], fov: 40 },
  // photon: no building — contemplative orb shot over city center
  photon:  { camPos: [0, 6, 18], camTarget: [0, 2, 0], fov: 40 },
  // aiesec: AIESEC @ 2.24, 0, 2.18
  aiesec:  { camPos: [8.55, 4, 11.19], camTarget: [2.24, 0.8, 2.18], fov: 40 },
  // veer: Schoogle @ 12.89, 0, -5.54
  veer:    { camPos: [19.77, 4, 4.29], camTarget: [12.89, 0.8, -5.54], fov: 40 },
  // P3: film — center of Movies(0.58,0,-0.95)+Corp Filims(5.40,0,-2.96)+Schoogle(12.89,0,-5.54) ≈ (6.29,0,-3.15); spread ~7.0, widen distance so all fit within |NDC|<0.7
  film:    { camPos: [16.61, 5, 11.59], camTarget: [6.29, 2, -3.15], fov: 38 },
  // pixelate: Pixelate @ 2.36, -6.69, -5.62
  pixelate: { camPos: [-1.74, 4, -16.90], camTarget: [2.36, 0.5, -5.62], fov: 36 },
  // P3: studio — center of Haus(-5.67,0,4.43)+Haus work(-13.14,0,14.44) ≈ (-9.41,0,9.44); widen distance for both buildings
  studio:  { camPos: [-0.23, 5, 22.54], camTarget: [-9.41, 2, 9.44], fov: 40 },
  // P3: europe — center of Buddy Tales(-4.17,0,1.63)+KH(-7.78,0,3.31) ≈ (-5.98,0,2.47)
  europe:  { camPos: [-5.98, 4, 16.47], camTarget: [-5.98, 0.8, 2.47], fov: 38 },
  // rabble: Rabble building @ -3.66, 0, -3.51
  rabble:  { camPos: [2.65, 4, 5.50], camTarget: [-3.66, 0.8, -3.51], fov: 40 },
  // pondi: Remote Stations-Homes @ -7.09, 0, -3.10
  pondi:   { camPos: [-0.20, 4, -12.93], camTarget: [-7.09, 0.8, -3.10], fov: 40 },
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
