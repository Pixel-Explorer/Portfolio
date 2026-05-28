// Spatial archive view — v3 (transposed grid + semantic zoom)
// Years on X-axis (columns), time-units on Z-axis (rows): months -> weeks -> days
// Glass prism aesthetic per Design doc.txt

import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const TOKENS = {
  room: "#F7F4EC",
  paper: "#EDE4CE",
  ink: "#1A1714",
  acid: "#D4C878",
  signal: "#C45A4A",
  gold: "#B8944E",
  leaf: "#6B8B6B",
  leafHi: "#8BA882",
  sun: "#FFF3D6",
  glassWhite: "#FFFDF6",
  graphite: "#5A6365",
};

// Role category buckets — synced with app.js ROLE_PILLS (5 CV categories + Other)
const ROLE_BUCKETS = [
  { key: "MovingImages",  color: "#C49A5A", accent: "#F23B21", ink: "#FFFFFF", tags: ["Photographer", "Photography", "Film", "Cinematographer", "Director", "DOP", "Producer", "Animation", "MusicVideo", "Documentary", "Wedding Photographer", "Unit Still", "BTS", "Filmmaker", "Editor"] },
  { key: "VisualSystems", color: "#B8A468", accent: "#E1FA3C", ink: "#1A1714", tags: ["Designer", "Design", "Graphic", "Art Director", "Visual", "Animator", "Branding", "Studio"] },
  { key: "CompCulture",   color: "#8A9AA0", accent: "#4A514A", ink: "#FFFFFF", tags: ["Tech", "Web3", "Blockchain", "AI", "Engineer", "IT", "Pixel Explorer", "Maker"] },
  { key: "DocResearch",   color: "#C8A04A", accent: "#C8923B", ink: "#FFFFFF", tags: ["Research", "Blogger", "Consultant", "Strategy", "Observer", "Documentation"] },
  { key: "LeadershipEdu", color: "#9AA878", accent: "#5B8C3E", ink: "#FFFFFF", tags: ["Lecturer", "Faculty", "Teacher", "AIESEC", "LCC", "VP", "Team Lead", "Founder", "Co-founder", "Leadership", "Education", "Student", "Graduate", "Member", "Mentor"] },
  { key: "Other",         color: "#A89878", accent: "#A89878", ink: "#FFFFFF", tags: [] },
];

function bucketForTag(tag) {
  const t = String(tag || "").toLowerCase();
  if (!t) return ROLE_BUCKETS[ROLE_BUCKETS.length - 1];
  for (const b of ROLE_BUCKETS) {
    for (const m of b.tags) {
      const escaped = m.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`).test(t)) return b;
    }
  }
  return ROLE_BUCKETS[ROLE_BUCKETS.length - 1];
}

// Legacy single-color lookup retained for selection/hover (returns bucket color)
const TAG_COLORS = ROLE_BUCKETS.reduce((acc, b) => {
  b.tags.forEach((t) => { acc[t] = b.color; });
  return acc;
}, { Milestone: TOKENS.gold, ThroughLine: TOKENS.signal });

const PRIORITY_TAGS = [
  "Milestone", "ThroughLine", "Founder", "Co-founder", "Film", "Cinematographer",
  "Director", "DOP", "Producer", "Filmmaker",
  "Designer", "Art Director", "Photographer", "Web3", "Blockchain",
  "Studio", "AIESEC", "Strategy", "Leadership", "Animation",
  "Documentary", "MusicVideo", "Branding", "BTS", "Editor",
  "Tech", "AI", "Engineer", "Research", "Consultant",
  "Lecturer", "Faculty", "Teacher", "Education",
  "Corporate", "Travel", "Earnings", "Job", "Volunteer", "Personal",
];

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const LOD = { MONTH: "month", WEEK: "week", DAY: "day" };

function pickDominantTag(tags) {
  for (const t of PRIORITY_TAGS) if (tags.includes(t)) return t;
  return tags[0] || "Personal";
}

function isoWeekToDate(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  return simple;
}

function dayOfYearFromEntry(entry) {
  const d = new Date(Date.UTC(entry.year, (entry.month || 1) - 1, entry.day || 1));
  const start = new Date(Date.UTC(entry.year, 0, 1));
  return Math.floor((d - start) / 86400000) + 1;
}

export function createArchiveTerrain(options) {
  const {
    container,
    years,
    entries,
    onHover,
    onMove,
    onLeave,
    onSelectEntry,
    onSelectWeek,
  } = options;

  if (!container) throw new Error("Terrain container missing.");

  // ─── GRID GEOMETRY CONSTANTS ───────────────────────────────────────
  const yearCount = years.length;
  const yearStride = 2.0;
  const gridWidth  = yearCount * yearStride;       // along X
  const gridDepth  = 18;                            // along Z (fixed)
  const cellPad    = 0.08;

  // ─── DATA AGGREGATION BY LOD ──────────────────────────────────────
  const entriesByMonth = new Map(); // "YYYY-MM"
  const entriesByWeek  = new Map(); // "YYYY-Www"
  const entriesByDay   = new Map(); // "YYYY-MM-DD"

  for (const e of entries) {
    if (!e.year) continue;
    const m = `${e.year}-${String(e.month || 1).padStart(2, "0")}`;
    const w = e.weekKey;
    const d = `${e.year}-${String(e.month || 1).padStart(2, "0")}-${String(e.day || 1).padStart(2, "0")}`;
    if (!entriesByMonth.has(m)) entriesByMonth.set(m, []);
    if (!entriesByWeek.has(w))  entriesByWeek.set(w, []);
    if (!entriesByDay.has(d))   entriesByDay.set(d, []);
    entriesByMonth.get(m).push(e);
    entriesByWeek.get(w).push(e);
    entriesByDay.get(d).push(e);
  }

  // ─── SCENE ────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  // Pass 04b: warmer saturated cream — gives the white plinth + buildings real
  // contrast to push against. Fog density backed off so distance reads as depth,
  // not haze. Buildings still carry the saturation; environment supports them.
  // Pass 08: background hex matches Dimensions's Environment background (#0F0F0F).
  const SKY_HEX = "#0F0F0F";
  scene.background = new THREE.Color("#0F0F0F");
  scene.fog = new THREE.FogExp2(0x050404, 0.0012);

  // Pass 08: FOV 10° matches Dimensions's 120mm focal length on 35mm-equiv 16:9 sensor.
  const camera = new THREE.PerspectiveCamera(10, 1, 0.1, 800);
  // logarithmicDepthBuffer: distributes z-precision uniformly across the
  // entire near→far range. Solves OBJ z-fighting (flicker / black mask)
  // without breaking focus-mode close-ups that need a tiny near plane.
  // preserveDrawingBuffer was disabling WebGL double-buffering, which let the
  // browser composite mid-render frames during drag → visible "flicker" /
  // "black mask" artifacts that moved with the pointer. Disabled.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color(SKY_HEX), 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Pass 08k: user-dialled exposure (from lighting debug panel).
  renderer.toneMappingExposure = 0.88;
  renderer.shadowMap.enabled = true;
  // PCFSoft + larger blur kernel = soft ceramic shadows, not harsh sun.
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  // Pass 08c: post-processing stripped. Per user spec, only Dimensions-native
  // settings are retained — HDRI IBL + ACES tone mapping. No bloom, no
  // tilt-shift, no vignette. The composer still wraps a single RenderPass
  // so the existing resize / scheduleRender plumbing continues to work
  // without divergence.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Hoisted from later in the file — async loaders (EXR HDRI) may fire
  // their completion callbacks synchronously if the resource is cached,
  // and those callbacks call scheduleRender. Declaring early avoids
  // a TDZ error on `needsRender`.
  let needsRender = true;
  function scheduleRender() { needsRender = true; }

  // ─── HDRI ENVIRONMENT (Pass 08 — Dimensions parity) ──────────────
  // Single-source IBL from Adobe Dimensions' "front_key_rear_panels" studio
  // HDRI. Replaces the previous 4-directional-light night setup. Any
  // PBR-authored model (Kitbash imports, hospital, future hero buildings)
  // now lights correctly without per-model shader hacks.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  // Pass 08k: user-dialled HDRI ambient fill (from lighting debug panel).
  scene.environmentIntensity = 0.18;
  new EXRLoader().load('/public/lighting/front_key_rear_panels.exr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const envRT = pmrem.fromEquirectangular(texture);
    scene.environment = envRT.texture;
    texture.dispose();
    // Defer scheduleRender to next frame — the callback may fire while
    // createTerrain is still executing, and `needsRender` (declared much
    // later in the closure) is still in the temporal dead zone.
    requestAnimationFrame(() => scheduleRender());
    console.log('[HDRI] front_key_rear_panels.exr loaded → scene.environment');
  }, undefined, (err) => {
    console.error('[HDRI] failed to load EXR:', err);
  });

  // ─── LIGHTS ───────────────────────────────────────────────────────
  // Pass 08h: HDRI handles ambient illumination. The key directional now
  // serves as the dedicated shadow caster — punchier intensity and a
  // tightly-framed shadow camera give defined sharp-soft shadows on the
  // plinth, matching the Dimensions ray-traced reference.
  // (No more AmbientLight — HDRI is already the ambient fill. Keeping a
  // tiny one as a safety floor for any non-PBR surfaces.)
  // Pass 08i: ambient zeroed — any non-zero ambient washes out shadows.
  // HDRI already provides realistic indirect light; pure black ambient
  // means shadows can read fully dark on surfaces facing away from the
  // directional key.
  scene.add(new THREE.AmbientLight("#FFFFFF", 0.0));

  // Pass 08k: user-dialled key light from the lighting debug panel.
  const key = new THREE.DirectionalLight("#FFFFFF", 1.45);
  key.position.set(50, 28, 17);
  key.target.position.set(0, 0, 0);
  scene.add(key.target);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  // Frustum tightly framed to the plinth: shadow map's 4096×4096 pixels
  // are now concentrated in the cluster area instead of wasting half on
  // empty ground beyond the plinth. Was ±gridWidth × ±gridDepth*1.3 (~50×65).
  // Literal 23.2 = PLINTH_RADIUS (14.5) × 1.6 — value inlined because
  // PLINTH_RADIUS isn't declared until later in this function (TDZ).
  const SHADOW_HALF = 23.2;
  key.shadow.camera.left = -SHADOW_HALF;
  key.shadow.camera.right = SHADOW_HALF;
  key.shadow.camera.top = SHADOW_HALF;
  key.shadow.camera.bottom = -SHADOW_HALF;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.02;
  // Pass 08k: user-dialled shadow softness from the lighting debug panel.
  key.shadow.radius = 3.5;
  key.shadow.blurSamples = 12;
  scene.add(key);

  // ─── GROUPS ───────────────────────────────────────────────────────
  const root = new THREE.Group();
  scene.add(root);

  const room = new THREE.Group();
  scene.add(room);

  // Pass 08g: Three.js Reflector tuned to MATCH the visible Dimensions
  // ground-plane reflection. Dimensions reports 9% opacity / 17% roughness,
  // but those values operate on HDR-linear scene values pre-tonemap. Our
  // Reflector samples an already-tonemapped LDR texture, so a literal 0.09
  // mix renders too dim. Effective visible-parity values:
  //   REFLECTION_OPACITY  ≈ 0.40  (visible cluster mirror under plinth)
  //   REFLECTION_ROUGHNESS ≈ 0.35 (more pronounced soft blur)
  // These are derived empirically against the user's Dimensions screenshot,
  // not numerically — adjust if the look drifts.
  const REFLECTION_OPACITY = 0.40;
  const REFLECTION_ROUGHNESS = 0.35;
  // Roughness driver: reduce render-target resolution so the bilinear
  // upsample produces a soft, slightly out-of-focus reflection. 35%
  // roughness → 35% smaller target than viewport.
  const reflTexW = Math.round(Math.min(2048, window.innerWidth * (window.devicePixelRatio || 1)) * (1 - REFLECTION_ROUGHNESS));
  const reflTexH = Math.round(Math.min(2048, window.innerHeight * (window.devicePixelRatio || 1)) * (1 - REFLECTION_ROUGHNESS));
  const floor = new Reflector(
    new THREE.PlaneGeometry(gridWidth * 12, gridDepth * 16),
    {
      textureWidth: reflTexW,
      textureHeight: reflTexH,
      // Base colour matches scene background (#0F0F0F) so there's no visible
      // horizon line where the floor meets the void.
      color: 0x0F0F0F,
      clipBias: 0.003,
    }
  );
  // Patch Reflector's fragment shader so reflection blends at 9% opacity
  // instead of 100% mirror. Replaces the default overlay blend with a mix.
  floor.material.fragmentShader = floor.material.fragmentShader.replace(
    'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
    `gl_FragColor = vec4( mix( color, base.rgb, ${REFLECTION_OPACITY.toFixed(3)} ), 1.0 );`,
  );
  floor.material.needsUpdate = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.62;
  room.add(floor);

  // Shore ring removed — white infinite ground reads clean without it.

  // Landscape backdrop removed — white infinite ground replaces it.

  // ─── CLUSTER MODE ─────────────────────────────────────────────────
  // Pass 05: archive is no longer a year×month grid. Buildings cluster
  // around the origin in a phyllotaxis spiral with tiered visual hierarchy
  // (milestones at center, then significant, then routine on the perimeter).
  // The Year Window slider in the HUD scrubs which years are "in focus";
  // out-of-window prisms fade + blur via applyWindowFilter().
  const CLUSTER_MODE = true;
  // Pass 08m: hide all decorative props (trees, bushes, hedges, lamp posts,
  // floating photons, rooftop AC units + water tanks). User wants only the
  // core architectural cluster + plinth + hospital + floor visible while
  // they iterate the look. Flip back to true to restore.
  const SHOW_SCENE_EXTRAS = false;
  // Approximate cluster radius — based on phyllotaxis with cellRadius 1.1
  // and ~110 month-groups: 1.1 * sqrt(110) ≈ 11.5.
  const CLUSTER_RADIUS = 12.5;
  const PLINTH_RADIUS = CLUSTER_RADIUS + 2.0;

  // Circular plinth — diorama base for the sculptural cluster.
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(PLINTH_RADIUS, PLINTH_RADIUS, 0.35, 96),
    new THREE.MeshPhysicalMaterial({
      // Pass 08 — bright lime-green plinth, matching the Dimensions
      // ground-plane fill colour. Porcelain finish (clearcoat 1.0) so it
      // catches the studio HDRI as a glossy painted disc.
      color: "#C5E03A",
      roughness: 0.55,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.05,
    }),
  );
  plinth.position.y = -0.21;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  plinth.name = "plinth";
  root.add(plinth);

  function seeded(index) {
    const n = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // Cluster mode skips the entire chronological road/sidewalk/kiosk system.
  // None of it makes sense without a time axis; the cluster is sculptural.
  // Stubs at module scope so downstream code that still references these
  // (e.g. vegetation push-away math, applyFiltersToPrisms lane recoloring)
  // compiles and behaves as "no road".
  let SPINE_WIDTH = 0;
  let SIDEWALK_WIDTH = 0;
  let SIDEWALK_HEIGHT = 0;
  let sidewalkTopY = 0;
  let CURB_WIDTH = 0;
  let CURB_HEIGHT = 0;
  let laneMat = null;
if (!CLUSTER_MODE) {
  // ─── PATHS: timeline spine + era cross-roads ─────────────────────
  // Wide dark asphalt spine with real 3D depth (not a flat decal).
  // Sits between two raised sidewalk strips.
  const SPINE_WIDTH = 1.6;
  const SPINE_THICKNESS = 0.14;    // visible side walls from low camera angles
  const SIDEWALK_WIDTH = 0.95;
  const SIDEWALK_HEIGHT = 0.12;
  const ERA_START_YEARS = [1991, 2009, 2013, 2015, 2016, 2018, 2022, 2024, 2025, 2026];

  // Asphalt road body — dark warm grey
  const pathMat = new THREE.MeshStandardMaterial({
    color: "#2A2724",
    roughness: 0.82,
    metalness: 0.04,
  });
  // Cross-roads (era markers) — slightly lighter than spine for hierarchy
  const crossRoadMat = new THREE.MeshStandardMaterial({
    color: "#36322D",
    roughness: 0.82,
    metalness: 0.04,
  });

  // Road bed — thick box with visible side walls. Top sits at y=0.07 (just above plinth).
  const spineGeom = new THREE.BoxGeometry(gridWidth * 1.04, SPINE_THICKNESS, SPINE_WIDTH);
  const pathMesh = new THREE.Mesh(spineGeom, pathMat);
  pathMesh.position.set(0, SPINE_THICKNESS / 2, 0);
  pathMesh.castShadow = false;
  pathMesh.receiveShadow = true;
  root.add(pathMesh);

  // Raised sidewalk strips — flank the road on both sides. Wider than the old curbs
  // so they create a clear pedestrian zone between road and buildings.
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: "#D8CFB7",
    roughness: 0.86,
    metalness: 0.02,
  });
  [-1, 1].forEach((side) => {
    const swGeom = new THREE.BoxGeometry(gridWidth * 1.04, SIDEWALK_HEIGHT, SIDEWALK_WIDTH);
    const sw = new THREE.Mesh(swGeom, sidewalkMat);
    sw.position.set(0, SIDEWALK_HEIGHT / 2, side * (SPINE_WIDTH / 2 + SIDEWALK_WIDTH / 2));
    sw.castShadow = true;
    sw.receiveShadow = true;
    root.add(sw);
  });

  // Curbs sit on top of the road bed, against the sidewalk edge.
  // They peek above the sidewalk for a sharp brutalist line.
  const CURB_HEIGHT = SIDEWALK_HEIGHT + 0.03;  // slight lip above sidewalk
  const CURB_WIDTH = 0.07;
  const curbMat = new THREE.MeshStandardMaterial({
    color: "#1A1714",
    roughness: 0.7,
    metalness: 0.1,
  });
  [-1, 1].forEach((side) => {
    const curbGeom = new THREE.BoxGeometry(gridWidth * 1.04, CURB_HEIGHT, CURB_WIDTH);
    const curb = new THREE.Mesh(curbGeom, curbMat);
    curb.position.set(0, CURB_HEIGHT / 2, side * (SPINE_WIDTH / 2 - CURB_WIDTH / 2 + 0.001));
    curb.castShadow = true;
    curb.receiveShadow = true;
    root.add(curb);
  });

  // Lane markings — dashed warm-yellow strip along the spine centerline
  const LANE_DASH_W = 0.42;
  const LANE_DASH_D = 0.05;
  const LANE_GAP = 0.34;
  const dashStride = LANE_DASH_W + LANE_GAP;
  const dashCount = Math.floor((gridWidth * 1.0) / dashStride);
  const laneMat = new THREE.MeshStandardMaterial({
    color: "#FFD66B",
    roughness: 0.45,
    emissive: "#FFB85C",
    emissiveIntensity: 0.18,
  });
  const laneDashGeom = new THREE.BoxGeometry(LANE_DASH_W, 0.012, LANE_DASH_D);
  const laneInst = new THREE.InstancedMesh(laneDashGeom, laneMat, dashCount);
  const laneDummy = new THREE.Object3D();
  for (let i = 0; i < dashCount; i++) {
    const x = (i - (dashCount - 1) / 2) * dashStride;
    laneDummy.position.set(x, SPINE_THICKNESS + 0.007, 0);
    laneDummy.updateMatrix();
    laneInst.setMatrixAt(i, laneDummy.matrix);
  }
  laneInst.instanceMatrix.needsUpdate = true;
  root.add(laneInst);

  // Era cross-roads + crosswalk stripes
  for (const y of ERA_START_YEARS) {
    const yi = years.indexOf(y);
    if (yi < 0) continue;
    const cx = (yi - (yearCount - 1) / 2) * yearStride;
    const crossGeom = new THREE.BoxGeometry(0.46, SPINE_THICKNESS, gridDepth * 0.94);
    const cross = new THREE.Mesh(crossGeom, crossRoadMat);
    cross.position.set(cx, SPINE_THICKNESS / 2, 0);
    cross.receiveShadow = true;
    root.add(cross);

    // Crosswalk: 5 white stripes inside the intersection (both sides of the spine)
    const stripeMat = new THREE.MeshStandardMaterial({
      color: "#F8F4EA",
      roughness: 0.4,
    });
    for (let s = -2; s <= 2; s++) {
      [-1, 1].forEach((side) => {
        const stripeGeom = new THREE.BoxGeometry(0.06, 0.012, SPINE_WIDTH * 0.86);
        const stripe = new THREE.Mesh(stripeGeom, stripeMat);
        stripe.position.set(cx + s * 0.085, SPINE_THICKNESS + 0.007, side * (SPINE_WIDTH * 0.32));
        // Only render crosswalk if it's outside the spine band
        if (Math.abs(stripe.position.z) > SPINE_WIDTH * 0.4) root.add(stripe);
      });
    }
  }

  // ─── STREET FURNITURE: lamp posts + commercial kiosks ─────────────
  // Lamp posts along both sides of the spine at regular intervals
  const LAMP_SPACING = 3.4;
  const lampCount = Math.floor((gridWidth * 0.95) / LAMP_SPACING);
  const lampPostMat = new THREE.MeshStandardMaterial({
    color: "#2C2925",
    roughness: 0.62,
    metalness: 0.35,
  });
  const lampHeadMat = new THREE.MeshStandardMaterial({
    color: "#FFF3D6",
    roughness: 0.35,
    emissive: "#FFC979",
    emissiveIntensity: 0.20,
  });
  const lampPostGeom = new THREE.CylinderGeometry(0.045, 0.06, 0.95, 10);
  const lampArmGeom = new THREE.BoxGeometry(0.32, 0.035, 0.035);
  const lampHeadGeom = new THREE.BoxGeometry(0.16, 0.12, 0.16);
  const sidewalkTopY = SIDEWALK_HEIGHT;
  for (let i = 0; i < lampCount; i++) {
    const x = (i - (lampCount - 1) / 2) * LAMP_SPACING;
    [-1, 1].forEach((side) => {
      // Place lamp on sidewalk, ~0.25 in from the road edge
      const zOffset = side * (SPINE_WIDTH / 2 + 0.25);
      const post = new THREE.Mesh(lampPostGeom, lampPostMat);
      post.position.set(x, 0.475 + sidewalkTopY, zOffset);
      post.castShadow = true;
      root.add(post);
      const arm = new THREE.Mesh(lampArmGeom, lampPostMat);
      arm.position.set(x, 0.92 + sidewalkTopY, zOffset - side * 0.16);
      arm.castShadow = true;
      root.add(arm);
      const head = new THREE.Mesh(lampHeadGeom, lampHeadMat);
      head.position.set(x, 0.88 + sidewalkTopY, zOffset - side * 0.32);
      root.add(head);
    });
  }

  // Commercial kiosks — small "restaurant" / "shop" buildings near the road
  // Anchored to commercial work in his CV (Auroville cafes, Pondicherry shops, etc.)
  // Placed along the road outside the curb, between the main city buildings
  const kioskSeed = 41;
  const kioskCount = 14;
  const kioskPalette = [
    { wall: "#E8DCC2", roof: "#B53F2E", awning: "#B53F2E" }, // red-roof restaurant
    { wall: "#F0E8D8", roof: "#2A6B5C", awning: "#2A6B5C" }, // teal cafe
    { wall: "#E4DABE", roof: "#3B3128", awning: "#3B3128" }, // dark wood shop
    { wall: "#EDE4CE", roof: "#C8923B", awning: "#C8923B" }, // gold awning bakery
  ];
  for (let i = 0; i < kioskCount; i++) {
    const x = (seeded(i + kioskSeed) - 0.5) * gridWidth * 0.86;
    const side = seeded(i + kioskSeed + 100) > 0.5 ? 1 : -1;
    // Place beyond the sidewalk — ~1.4 to 2.0 units off the road
    const z = side * (SPINE_WIDTH / 2 + SIDEWALK_WIDTH + 0.3 + seeded(i + 50) * 0.5);
    const w = 0.48 + seeded(i + 70) * 0.38;
    const d = 0.42 + seeded(i + 90) * 0.32;
    const h = 0.38 + seeded(i + 110) * 0.28;
    const palette = kioskPalette[i % kioskPalette.length];
    const kioskGroup = new THREE.Group();
    // Base wall — porcelain miniature finish
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: palette.wall,
      roughness: 0.42,
      metalness: 0.02,
      clearcoat: 0.38,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.7,
    });
    const wallGeom = new RoundedBoxGeometry(w, h, d, 2, 0.025);
    const wall = new THREE.Mesh(wallGeom, wallMat);
    wall.position.set(x, h / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    kioskGroup.add(wall);
    // Pitched roof — slight clearcoat for ceramic tile look
    const roofMat = new THREE.MeshPhysicalMaterial({
      color: palette.roof,
      roughness: 0.45,
      metalness: 0.05,
      clearcoat: 0.32,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.65,
    });
    const roofGeom = new THREE.BoxGeometry(w * 1.08, 0.06, d * 1.08);
    const roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.set(x, h + 0.03, z);
    roof.castShadow = true;
    kioskGroup.add(roof);
    // Awning facing the road
    const awningMat = new THREE.MeshStandardMaterial({
      color: palette.awning,
      roughness: 0.65,
      metalness: 0.05,
    });
    const awningGeom = new THREE.BoxGeometry(w * 0.92, 0.025, 0.22);
    const awning = new THREE.Mesh(awningGeom, awningMat);
    awning.position.set(x, h * 0.78, z - side * (d / 2 + 0.11));
    awning.castShadow = true;
    kioskGroup.add(awning);
    // Door (a small dark rect on the road-facing side)
    const doorMat = new THREE.MeshStandardMaterial({
      color: "#2A2522",
      roughness: 0.6,
      metalness: 0.15,
    });
    const doorGeom = new THREE.BoxGeometry(w * 0.22, h * 0.55, 0.02);
    const door = new THREE.Mesh(doorGeom, doorMat);
    door.position.set(x, h * 0.275, z - side * (d / 2 + 0.011));
    kioskGroup.add(door);
    // Window beside the door
    const winMat = new THREE.MeshStandardMaterial({
      color: "#FFE8B6",
      emissive: "#FFC979",
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const winGeom = new THREE.BoxGeometry(w * 0.28, h * 0.34, 0.02);
    const win = new THREE.Mesh(winGeom, winMat);
    win.position.set(x + w * 0.28, h * 0.5, z - side * (d / 2 + 0.011));
    kioskGroup.add(win);
    root.add(kioskGroup);
  }

  // Benches — small wooden rectangles scattered near kiosks on the sidewalk
  const benchMat = new THREE.MeshStandardMaterial({
    color: "#4A3826",
    roughness: 0.88,
    metalness: 0,
  });
  const benchGeom = new THREE.BoxGeometry(0.42, 0.06, 0.14);
  const benchLegGeom = new THREE.BoxGeometry(0.04, 0.12, 0.12);
  for (let i = 0; i < 18; i++) {
    const x = (seeded(i + 222) - 0.5) * gridWidth * 0.92;
    const side = seeded(i + 333) > 0.5 ? 1 : -1;
    const z = side * (SPINE_WIDTH / 2 + 0.5);
    // Skip if too close to a lamp post
    const lampStride = LAMP_SPACING;
    const nearestLampX = Math.round(x / lampStride) * lampStride;
    if (Math.abs(x - nearestLampX) < 0.5) continue;
    const seat = new THREE.Mesh(benchGeom, benchMat);
    seat.position.set(x, 0.16 + sidewalkTopY, z);
    seat.castShadow = true;
    root.add(seat);
    [-0.16, 0.16].forEach((legOffset) => {
      const leg = new THREE.Mesh(benchLegGeom, benchMat);
      leg.position.set(x + legOffset, 0.07 + sidewalkTopY, z);
      leg.castShadow = true;
      root.add(leg);
    });
  }

  // Vehicles + pedestrians removed entirely — they read as clutter at this scale.
} // end if (!CLUSTER_MODE)

  // ─── PERIMETER LAMPS (cluster mode) ────────────────────────────────
  // Ring of lamps around the plinth edge — gallery-installation feel.
  if (CLUSTER_MODE && SHOW_SCENE_EXTRAS) {
    const lampPostMat = new THREE.MeshStandardMaterial({
      color: "#0E0C0A", roughness: 0.65, metalness: 0.40,
    });
    const lampHeadMat = new THREE.MeshStandardMaterial({
      color: "#FFE8C0", roughness: 0.30,
      emissive: "#FFD080", emissiveIntensity: 0.18,
    });
    const lampPostGeom = new THREE.CylinderGeometry(0.045, 0.06, 1.15, 10);
    const lampHeadGeom = new THREE.SphereGeometry(0.10, 14, 10);
    const ringCount = 16;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      const lx = Math.cos(angle) * (PLINTH_RADIUS - 0.4);
      const lz = Math.sin(angle) * (PLINTH_RADIUS - 0.4);
      const post = new THREE.Mesh(lampPostGeom, lampPostMat);
      post.position.set(lx, 0.05 + 0.575, lz);
      post.castShadow = true;
      root.add(post);
      const head = new THREE.Mesh(lampHeadGeom, lampHeadMat);
      head.position.set(lx, 0.05 + 1.18, lz);
      root.add(head);
    }
  }

  // ─── BUSHES + HEDGES + FLOWER CLUSTERS ─────────────────────────────
  // Cluster mode places vegetation in a ring around + on the plinth, biased
  // toward the cluster base. Non-cluster mode uses the old rectangular grid.
  function placeVegetationXY(i, salt) {
    if (CLUSTER_MODE) {
      // All vegetation stays ON the plinth — dark scene, no outer scatter
      const angle = seeded(i + salt) * Math.PI * 2;
      const r = 0.3 + seeded(i + salt + 200) * (PLINTH_RADIUS * 0.90);
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    }
    let bx = (seeded(i + salt) - 0.5) * gridWidth * 1.0;
    let bz = (seeded(i + salt + 100) - 0.5) * gridDepth * 0.98;
    if (Math.abs(bz) < SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.4) {
      bz = Math.sign(bz || 1) * (SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.4 + seeded(i + salt + 200) * 0.6);
    }
    return [bx, bz];
  }

  const BUSH_COUNT = 80;
  const bushGeom = new THREE.SphereGeometry(1, 18, 14);
  const bushMat = new THREE.MeshStandardMaterial({
    color: "#142A10", roughness: 0.90,
  });
  const bushInst = new THREE.InstancedMesh(bushGeom, bushMat, BUSH_COUNT);
  bushInst.castShadow = true;
  bushInst.receiveShadow = true;
  const bushD = new THREE.Object3D();
  for (let i = 0; i < BUSH_COUNT; i++) {
    const [bx, bz] = placeVegetationXY(i, 6101);
    const s = 0.08 + seeded(i + 6401) * 0.14;
    bushD.position.set(bx, s * 0.6, bz);
    bushD.scale.set(s, s * 0.7, s);
    bushD.rotation.y = seeded(i + 6501) * Math.PI;
    bushD.updateMatrix();
    bushInst.setMatrixAt(i, bushD.matrix);
  }
  bushInst.instanceMatrix.needsUpdate = true;
  if (SHOW_SCENE_EXTRAS) root.add(bushInst);

  // Hedges — narrow stretched cuboid strips. Cluster mode places them
  // tangentially along the plinth perimeter for a gallery-edge feel.
  const HEDGE_COUNT = 18;
  const hedgeGeom = new THREE.BoxGeometry(1, 1, 1);
  const hedgeMat = new THREE.MeshStandardMaterial({
    color: "#162812", roughness: 0.92,
  });
  const hedgeInst = new THREE.InstancedMesh(hedgeGeom, hedgeMat, HEDGE_COUNT);
  hedgeInst.castShadow = true;
  hedgeInst.receiveShadow = true;
  const hD = new THREE.Object3D();
  for (let i = 0; i < HEDGE_COUNT; i++) {
    let hx, hz;
    if (CLUSTER_MODE) {
      const angle = (i / HEDGE_COUNT) * Math.PI * 2 + seeded(i + 7401) * 0.4;
      const r = PLINTH_RADIUS + 0.6 + seeded(i + 7501) * 0.8;
      hx = Math.cos(angle) * r;
      hz = Math.sin(angle) * r;
    } else {
      hx = (seeded(i + 7101) - 0.5) * gridWidth * 0.95;
      hz = (seeded(i + 7201) - 0.5) * gridDepth * 0.85;
      if (Math.abs(hz) < SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.6) {
        hz = Math.sign(hz || 1) * (SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.7 + seeded(i + 7301) * 0.4);
      }
    }
    const len = 0.7 + seeded(i + 7401) * 1.4;
    const dir = seeded(i + 7501) > 0.5 ? 0 : Math.PI / 2;
    hD.position.set(hx, 0.11, hz);
    hD.scale.set(len, 0.22, 0.16);
    hD.rotation.y = dir;
    hD.updateMatrix();
    hedgeInst.setMatrixAt(i, hD.matrix);
  }
  hedgeInst.instanceMatrix.needsUpdate = true;
  if (SHOW_SCENE_EXTRAS) root.add(hedgeInst);

  // Flower bed clusters — colored micro-spheres in patches
  const FLOWER_PATCH_COUNT = 28;
  const FLOWERS_PER_PATCH = 12;
  const flowerGeom = new THREE.IcosahedronGeometry(1, 0);
  const flowerColors = ["#4A1E1E", "#4A3818", "#3A1E2A", "#2A1E38", "#1E2A3A"];
  const flowerInstByColor = flowerColors.map((c) => {
    const m = new THREE.MeshStandardMaterial({
      color: c, roughness: 0.55, emissive: c, emissiveIntensity: 0.1,
    });
    return new THREE.InstancedMesh(flowerGeom, m, FLOWER_PATCH_COUNT * FLOWERS_PER_PATCH);
  });
  const flowerCounts = flowerColors.map(() => 0);
  const fD = new THREE.Object3D();
  for (let p = 0; p < FLOWER_PATCH_COUNT; p++) {
    const [px, pz] = placeVegetationXY(p, 8101);
    const palette = Math.floor(seeded(p + 8401) * flowerColors.length);
    for (let f = 0; f < FLOWERS_PER_PATCH; f++) {
      const ox = (seeded(p * 31 + f + 8501) - 0.5) * 0.35;
      const oz = (seeded(p * 41 + f + 8601) - 0.5) * 0.35;
      const s = 0.03 + seeded(p * 53 + f + 8701) * 0.025;
      fD.position.set(px + ox, 0.04 + s, pz + oz);
      fD.scale.setScalar(s);
      fD.rotation.set(seeded(f + 8801), seeded(f + 8901) * Math.PI, 0);
      fD.updateMatrix();
      flowerInstByColor[palette].setMatrixAt(flowerCounts[palette]++, fD.matrix);
    }
  }
  flowerInstByColor.forEach((im, i) => {
    im.count = flowerCounts[i];
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    root.add(im);
  });

  // ─── PIXEL CROP FIELDS ────────────────────────────────────────────
  // Dense miniature crop rows. Two color tones (sage + deep emerald)
  // alternate in stripes. Placed in 14 patches scattered around the
  // perimeter of the plinth, never overlapping the road corridor.
  const cropPatchCount = 14;
  const cropColors = [
    new THREE.Color("#162A12"),
    new THREE.Color("#1E3518"),
    new THREE.Color("#122210"),
    new THREE.Color("#203A18"),
  ];
  // 4 instanced meshes (one per color band) → all crop cuboids in 4 draws.
  const cropGeom = new RoundedBoxGeometry(0.06, 0.07, 0.06, 1, 0.012);
  const cropMats = cropColors.map((c) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.78, metalness: 0,
  }));
  const cropPatches = [];
  // Pre-plan patches so we know counts per color.
  for (let p = 0; p < cropPatchCount; p++) {
    let px, pz;
    if (CLUSTER_MODE) {
      // Patches form a soft ring around the plinth + a few inside cluster gaps.
      const angle = (p / cropPatchCount) * Math.PI * 2 + seeded(p + 5101) * 0.5;
      const inside = seeded(p + 5201) < 0.35;
      const r = inside
        ? PLINTH_RADIUS * 0.55 + seeded(p + 5301) * (PLINTH_RADIUS * 0.3)
        : PLINTH_RADIUS + 0.7 + seeded(p + 5301) * 1.8;
      px = Math.cos(angle) * r;
      pz = Math.sin(angle) * r;
    } else {
      px = (seeded(p + 5101) - 0.5) * gridWidth * 0.95;
      pz = (seeded(p + 5201) - 0.5) * gridDepth * 0.92;
      if (Math.abs(pz) < SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.7) {
        pz = Math.sign(pz || 1) * (SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.8 + seeded(p + 5301) * 0.6);
      }
    }
    const rotY = seeded(p + 5401) > 0.5 ? 0 : Math.PI / 2;
    const cols = 5 + Math.floor(seeded(p + 5501) * 4);   // 5..8 rows
    const rows = 6 + Math.floor(seeded(p + 5601) * 6);   // 6..11 plants per row
    const stripeStarts = Math.floor(seeded(p + 5701) * cropColors.length);
    cropPatches.push({ px, pz, rotY, cols, rows, stripeStarts });
  }
  // Total count per color
  const cropCounts = cropColors.map(() => 0);
  for (const patch of cropPatches) {
    for (let r = 0; r < patch.rows; r++) {
      // Row striping: every row index maps to a color, advancing slowly.
      const colorIdx = (patch.stripeStarts + Math.floor(r / 2)) % cropColors.length;
      cropCounts[colorIdx] += patch.cols;
    }
  }
  const cropInsts = cropMats.map((mat, i) => {
    const im = new THREE.InstancedMesh(cropGeom, mat, cropCounts[i]);
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  });
  const cropCursors = cropColors.map(() => 0);
  const cropD = new THREE.Object3D();
  const cosY = (a) => Math.cos(a), sinY = (a) => Math.sin(a);
  for (const patch of cropPatches) {
    const spacingX = 0.085;
    const spacingZ = 0.085;
    for (let r = 0; r < patch.rows; r++) {
      const colorIdx = (patch.stripeStarts + Math.floor(r / 2)) % cropColors.length;
      for (let c = 0; c < patch.cols; c++) {
        const lx = (c - (patch.cols - 1) / 2) * spacingX;
        const lz = (r - (patch.rows - 1) / 2) * spacingZ;
        // Rotate local (lx, lz) by patch.rotY
        const wx = patch.px + lx * cosY(patch.rotY) - lz * sinY(patch.rotY);
        const wz = patch.pz + lx * sinY(patch.rotY) + lz * cosY(patch.rotY);
        const hWiggle = 0.85 + Math.abs(Math.sin((r * 7.3 + c * 3.1))) * 0.5;
        cropD.position.set(wx, 0.05 + hWiggle * 0.018, wz);
        cropD.scale.set(1, hWiggle, 1);
        cropD.rotation.y = patch.rotY;
        cropD.updateMatrix();
        cropInsts[colorIdx].setMatrixAt(cropCursors[colorIdx]++, cropD.matrix);
      }
    }
  }
  for (const im of cropInsts) {
    im.instanceMatrix.needsUpdate = true;
    root.add(im);
  }

  // ─── PLAZA, LANDMARKS, DRONE, MOUNDS — grid-mode only ────────────
  // These use year-column positions which don't apply to the cluster layout.
  if (!CLUSTER_MODE) {
  const plazaYear = 2021;
  const plazaYi = years.indexOf(plazaYear);
  if (plazaYi >= 0) {
    const px = (plazaYi - (yearCount - 1) / 2) * yearStride;
    const pz = -gridDepth * 0.36;
    // Plaza base (circular paver area)
    const plazaPaverMat = new THREE.MeshStandardMaterial({
      color: "#D9CFB6", roughness: 0.86,
    });
    const plazaGeom = new THREE.CylinderGeometry(1.7, 1.7, 0.06, 36);
    const plazaMesh = new THREE.Mesh(plazaGeom, plazaPaverMat);
    plazaMesh.position.set(px, 0.04, pz);
    plazaMesh.receiveShadow = true;
    root.add(plazaMesh);
    // Radial paver lines (8 wedges)
    const wedgeMat = new THREE.MeshStandardMaterial({
      color: "#1A1714", roughness: 0.8,
    });
    for (let w = 0; w < 12; w++) {
      const ang = (w / 12) * Math.PI * 2;
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.005, 1.6), wedgeMat);
      wedge.position.set(px + Math.cos(ang) * 0.8, 0.072, pz + Math.sin(ang) * 0.8);
      wedge.rotation.y = ang + Math.PI / 2;
      root.add(wedge);
    }
    // Inner ring (darker stone)
    const innerRingMat = new THREE.MeshStandardMaterial({
      color: "#B5A988", roughness: 0.78,
    });
    const innerRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.08, 28), innerRingMat,
    );
    innerRing.position.set(px, 0.075, pz);
    innerRing.receiveShadow = true;
    root.add(innerRing);
    // ── HERO GLASS-DOMED SILO ─────────────────────────────────────
    // Tall translucent cylinder with a hemisphere cap + internal scaffold +
    // antenna spire. Lives where the fountain used to be; reads as the
    // skyline anchor for the city (matches reference image landmark).
    const siloOuterMat = new THREE.MeshPhysicalMaterial({
      color: "#F1ECD8",
      roughness: 0.16,
      metalness: 0.04,
      transmission: 0.62,
      thickness: 0.4,
      ior: 1.32,
      clearcoat: 0.65,
      clearcoatRoughness: 0.12,
      attenuationColor: new THREE.Color("#F8E8C2"),
      attenuationDistance: 1.4,
      envMapIntensity: 1.0,
    });
    const siloCapMat = new THREE.MeshPhysicalMaterial({
      color: TOKENS.signal,
      roughness: 0.28,
      metalness: 0.18,
      clearcoat: 0.55,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.85,
    });
    const siloRingMat = new THREE.MeshPhysicalMaterial({
      color: TOKENS.ink,
      roughness: 0.45,
      metalness: 0.6,
      clearcoat: 0.4,
      clearcoatRoughness: 0.25,
    });
    const siloInnerScaffoldMat = new THREE.MeshStandardMaterial({
      color: TOKENS.acid,
      emissive: TOKENS.acid,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });

    // Base footing — short wide cylinder anchoring the silo to the plaza floor
    const siloFoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.7, 0.16, 32),
      new THREE.MeshPhysicalMaterial({
        color: "#E8DFC6", roughness: 0.35, metalness: 0.05,
        clearcoat: 0.45, clearcoatRoughness: 0.2,
      }),
    );
    siloFoot.position.set(px, 0.16, pz);
    siloFoot.castShadow = true; siloFoot.receiveShadow = true;
    root.add(siloFoot);

    // Body — tall glass cylinder
    const siloBodyH = 1.65;
    const siloBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.5, siloBodyH, 40, 1, true),
      siloOuterMat,
    );
    siloBody.position.set(px, 0.24 + siloBodyH / 2, pz);
    siloBody.castShadow = true;
    siloBody.receiveShadow = true;
    root.add(siloBody);

    // Internal lit scaffold — emissive vertical spine + 3 horizontal hoops
    // reads as "something inside" through the translucent glass.
    const spine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, siloBodyH * 0.92, 8),
      siloInnerScaffoldMat,
    );
    spine.position.set(px, 0.24 + siloBodyH / 2, pz);
    root.add(spine);
    for (let r = 0; r < 4; r++) {
      const hoopY = 0.34 + (r * siloBodyH) / 4;
      const hoopGeom = new THREE.TorusGeometry(0.32, 0.014, 6, 24);
      const hoop = new THREE.Mesh(hoopGeom, siloInnerScaffoldMat);
      hoop.position.set(px, hoopY, pz);
      hoop.rotation.x = Math.PI / 2;
      root.add(hoop);
    }

    // Reinforcement rings — dark bands around the outside, top + bottom
    [0.30, 0.24 + siloBodyH - 0.04].forEach((ringY) => {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.51, 0.51, 0.06, 32, 1, true),
        siloRingMat,
      );
      ring.position.set(px, ringY, pz);
      root.add(ring);
    });

    // Hemisphere dome cap — signal-red, matches references' iconic landmark roof
    const siloDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
      siloCapMat,
    );
    siloDome.position.set(px, 0.24 + siloBodyH, pz);
    siloDome.castShadow = true;
    root.add(siloDome);

    // Antenna spire on top of the dome
    const spireMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.025, 0.62, 8),
      siloRingMat,
    );
    spireMast.position.set(px, 0.24 + siloBodyH + 0.36, pz);
    spireMast.castShadow = true;
    root.add(spireMast);
    // Signal blip at the tip
    const spireTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 10),
      new THREE.MeshStandardMaterial({
        color: TOKENS.signal,
        emissive: TOKENS.signal,
        emissiveIntensity: 1.2,
        roughness: 0.4,
      }),
    );
    spireTip.position.set(px, 0.24 + siloBodyH + 0.7, pz);
    root.add(spireTip);

    // Small dish off the dome — diagonal saucer
    const dishMat = new THREE.MeshPhysicalMaterial({
      color: "#E8DFC6", roughness: 0.3, metalness: 0.2,
      clearcoat: 0.4, clearcoatRoughness: 0.2,
    });
    const dishArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6),
      siloRingMat,
    );
    dishArm.position.set(px + 0.32, 0.24 + siloBodyH + 0.06, pz - 0.12);
    dishArm.rotation.z = Math.PI / 3;
    root.add(dishArm);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      dishMat,
    );
    dish.position.set(px + 0.4, 0.24 + siloBodyH + 0.14, pz - 0.18);
    dish.rotation.x = -Math.PI / 5;
    dish.rotation.z = Math.PI / 4;
    root.add(dish);
    // 8 benches around the plaza perimeter. Use a local material since the
    // sidewalk benches' benchMat is gated off in CLUSTER_MODE.
    const plazaBenchMat = new THREE.MeshStandardMaterial({
      color: "#4A3826", roughness: 0.88, metalness: 0,
    });
    for (let b = 0; b < 8; b++) {
      const ang = (b / 8) * Math.PI * 2 + Math.PI / 16;
      const bx = px + Math.cos(ang) * 1.42;
      const bz = pz + Math.sin(ang) * 1.42;
      const benchSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.05, 0.14), plazaBenchMat,
      );
      benchSeat.position.set(bx, 0.16, bz);
      benchSeat.rotation.y = ang + Math.PI / 2;
      benchSeat.castShadow = true;
      root.add(benchSeat);
    }
  }

  // ─── LANDMARK STRUCTURES — anchor major eras ─────────────────────
  // Cinema (2015 — Chhello Divas release), Studio (2022 — Haus of Pixels),
  // Bookshop (2018 — Tarikshir Dubai launch). Each sits in a specific year column.
  function placeLandmark(year, zOff, opts) {
    const yi = years.indexOf(year);
    if (yi < 0) return;
    const lx = (yi - (yearCount - 1) / 2) * yearStride;
    const lz = zOff;
    const g = new THREE.Group();
    // Base / wall — porcelain
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: opts.wall, roughness: 0.42, metalness: 0.04,
      clearcoat: 0.4, clearcoatRoughness: 0.2,
      envMapIntensity: 0.75,
    });
    const wall = new THREE.Mesh(
      new RoundedBoxGeometry(opts.w, opts.h, opts.d, 2, 0.05), wallMat,
    );
    wall.position.set(0, opts.h / 2, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
    // Roof — porcelain
    const roofMat = new THREE.MeshPhysicalMaterial({
      color: opts.roof, roughness: 0.4, metalness: 0.12,
      clearcoat: 0.45, clearcoatRoughness: 0.22,
      envMapIntensity: 0.8,
    });
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(opts.w * 1.08, 0.08, opts.d * 1.08), roofMat,
    );
    roof.position.set(0, opts.h + 0.04, 0);
    roof.castShadow = true;
    g.add(roof);
    // Marquee/sign on front face (a thin glowing box)
    const signMat = new THREE.MeshStandardMaterial({
      color: opts.sign, emissive: opts.sign, emissiveIntensity: 0.6,
      roughness: 0.4,
    });
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(opts.w * 0.7, opts.h * 0.18, 0.04), signMat,
    );
    sign.position.set(0, opts.h * 0.75, opts.d / 2 + 0.025);
    g.add(sign);
    // Entrance overhang
    const overhang = new THREE.Mesh(
      new THREE.BoxGeometry(opts.w * 0.55, 0.04, 0.35), roofMat,
    );
    overhang.position.set(0, opts.h * 0.45, opts.d / 2 + 0.18);
    overhang.castShadow = true;
    g.add(overhang);
    // Door
    const doorMat = new THREE.MeshStandardMaterial({
      color: "#1F1B17", roughness: 0.62, metalness: 0.18,
    });
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(opts.w * 0.22, opts.h * 0.42, 0.03), doorMat,
    );
    door.position.set(0, opts.h * 0.21, opts.d / 2 + 0.018);
    g.add(door);
    // Side windows (2 per side, glowing)
    const sideWinMat = new THREE.MeshStandardMaterial({
      color: "#FFE0A8", emissive: "#FFC979", emissiveIntensity: 0.4,
      roughness: 0.3,
    });
    [-1, 1].forEach((side) => {
      [0, 1].forEach((row) => {
        const wn = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, opts.h * 0.18, opts.d * 0.18), sideWinMat,
        );
        wn.position.set(side * (opts.w / 2 + 0.022),
                        opts.h * (0.3 + row * 0.32),
                        opts.d * 0.18 * (row ? 1 : -1));
        g.add(wn);
      });
    });
    g.position.set(lx, 0, lz);
    g.rotation.y = opts.rotY || 0;
    root.add(g);
  }
  // ─── DRONE — small detailed quadcopter floating above the plaza ──
  const drone = new THREE.Group();
  const droneBodyMat = new THREE.MeshStandardMaterial({
    color: "#E8E0D0", roughness: 0.45, metalness: 0.4,
  });
  const droneArmMat = new THREE.MeshStandardMaterial({
    color: "#1F1B17", roughness: 0.6, metalness: 0.3,
  });
  const dronePropMat = new THREE.MeshStandardMaterial({
    color: "#3F3A33", roughness: 0.5, metalness: 0.3,
    transparent: true, opacity: 0.6,
  });
  const droneBody = new THREE.Mesh(
    new RoundedBoxGeometry(0.22, 0.07, 0.16, 2, 0.03), droneBodyMat,
  );
  droneBody.castShadow = true;
  drone.add(droneBody);
  // 4 arms with motors + props
  const arms = [[0.16, 0.12], [-0.16, 0.12], [0.16, -0.12], [-0.16, -0.12]];
  for (const [ax, az] of arms) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), droneArmMat,
    );
    arm.position.set(ax * 0.55, 0, az * 0.55);
    arm.rotation.z = Math.atan2(az, ax);
    arm.castShadow = true;
    drone.add(arm);
    const motor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10), droneArmMat,
    );
    motor.position.set(ax, 0.04, az);
    drone.add(motor);
    const prop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.005, 16), dronePropMat,
    );
    prop.position.set(ax, 0.07, az);
    drone.add(prop);
  }
  drone.position.set(0, 6.2, -gridDepth * 0.2);
  root.add(drone);
  drone.userData.spinTime = 0;

  // Cinema — 2015 Chhello Divas
  placeLandmark(2015, gridDepth * 0.42, {
    w: 1.6, h: 0.95, d: 1.1,
    wall: "#F0E5C9", roof: "#1A1714", sign: "#F23B21",
  });
  // Studio — 2022 Haus of Pixels OPC registered
  placeLandmark(2022, -gridDepth * 0.42, {
    w: 1.5, h: 0.78, d: 1.3,
    wall: "#22201C", roof: "#E1FA3C", sign: "#E1FA3C",
  });
  // Bookshop — 2018 Tarikshir Dubai launch
  placeLandmark(2018, gridDepth * 0.42, {
    w: 1.0, h: 0.7, d: 0.85,
    wall: "#C8923B", roof: "#3B2E22", sign: "#FFE0A8",
  });

  // Photons curve defined outside gate — used for drifting particle animation.
  // In cluster mode, orbit around plinth. In grid mode, straight spine path.

  // Organic landscape mounds — stepped contours either side of the spine
  const moundMat = new THREE.MeshStandardMaterial({
    color: "#d9e2ce",
    roughness: 0.92,
  });
  const moundCount = 14;
  const SPINE_CLEAR = SPINE_WIDTH * 0.5 + 1.2;
  for (let i = 0; i < moundCount; i++) {
    const rx = (seeded(i + 700) - 0.5) * gridWidth * 0.9;
    let rz = (seeded(i + 800) - 0.5) * gridDepth * 0.9;
    // Push out of spine corridor
    if (Math.abs(rz) < SPINE_CLEAR) rz = Math.sign(rz || 1) * SPINE_CLEAR;
    const r = 1.4 + seeded(i + 900) * 2.0;
    const mGeom = new THREE.SphereGeometry(r, 24, 12);
    const mMesh = new THREE.Mesh(mGeom, moundMat);
    mMesh.scale.set(1, 0.18 + seeded(i) * 0.14, 1);
    mMesh.position.set(rx, -0.16, rz);
    mMesh.castShadow = true;
    mMesh.receiveShadow = true;
    root.add(mMesh);
  }
  } // end if (!CLUSTER_MODE) — plaza, landmarks, drone, mounds

  // Photon path curve — cluster mode orbits the plinth; grid mode is a straight spine
  const mainPathCurve = CLUSTER_MODE
    ? new THREE.CatmullRomCurve3([
        new THREE.Vector3(-PLINTH_RADIUS, 0.5, 0),
        new THREE.Vector3(0, 0.5, -PLINTH_RADIUS),
        new THREE.Vector3(PLINTH_RADIUS, 0.5, 0),
        new THREE.Vector3(0, 0.5, PLINTH_RADIUS),
      ], true)
    : new THREE.CatmullRomCurve3([
        new THREE.Vector3(-gridWidth * 0.52, 0.05, 0),
        new THREE.Vector3(0, 0.05, 0),
        new THREE.Vector3(gridWidth * 0.52, 0.05, 0),
      ]);

  const vegetation = new THREE.Group();

  // ─── TREES: 4 archetypes × varied palettes, cluster placement ─────
  // Each archetype is a shape+color pairing baked into its own InstancedMesh.
  // Combined with scale variation and red berry instances on ~30% of trees,
  // the grove reads organic without per-instance vertex colors.
  const TREE_COUNT = 90;
  // Smaller, tighter foliage. Smooth spheres + one conifer cone.
  // Foliage geometries: lower-poly icosahedrons read as stylized chunky blobs
  // rather than smooth spheres — matches the "miniature ceramic" reference look.
  // Detail variety achieved via 6 archetypes incl. dome and pill shapes.
  const treeArchetypes = [
    { geom: new THREE.IcosahedronGeometry(0.19, 1),                       color: "#1A3218", yScale: 1.05, rough: 0.82 },
    { geom: new THREE.IcosahedronGeometry(0.16, 1),                       color: "#243A1E", yScale: 1.0,  rough: 0.80 },
    { geom: new THREE.IcosahedronGeometry(0.17, 1),                       color: "#2A4222", yScale: 0.92, rough: 0.78 },
    { geom: new THREE.ConeGeometry(0.13, 0.50, 14),                       color: "#142A10", yScale: 1.25, rough: 0.85 },
    { geom: new THREE.CylinderGeometry(0.12, 0.15, 0.36, 14, 1, false),   color: "#1E3518", yScale: 1.0,  rough: 0.80 },
    { geom: new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI*2, 0, Math.PI*0.65), color: "#1A301A", yScale: 0.85, rough: 0.82 },
  ];
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#1A1510", roughness: 0.92 });
  // Slightly thicker, taller trunk so canopy doesn't read as a lollipop blob.
  const trunkGeom = new THREE.CylinderGeometry(0.028, 0.042, 0.28, 8);
  // Berries removed — read as random polka-dots on the foliage at our scale.

  // First pass: pick archetype + placement per tree, bucket into groups
  const treeBuckets = treeArchetypes.map(() => []);
  const dummy = new THREE.Object3D();
  const SPINE_CORRIDOR = SPINE_WIDTH * 0.5 + 0.55;
  const cellGrid = new Map(); // crude poisson-ish: at most ~2 trees per ~1×1 cell
  for (let i = 0; i < TREE_COUNT; i++) {
    let x, z, tries = 0, ok = false;
    while (tries++ < 8) {
      if (CLUSTER_MODE) {
        // Trees only ON the plinth — no outer ring scatter in dark mode
        const angle = seeded(i * 3 + tries) * Math.PI * 2;
        const r = 0.5 + seeded(i * 7 + tries) * (PLINTH_RADIUS * 0.92);
        x = Math.cos(angle) * r;
        z = Math.sin(angle) * r;
      } else {
        const rx = seeded(i * 3 + tries) - 0.5;
        const rz = seeded(i * 5 + tries + 41) - 0.5;
        x = rx * gridWidth * 1.04;
        z = rz * gridDepth * 1.05;
        if (Math.abs(z) < SPINE_CORRIDOR) z = Math.sign(z || 1) * (SPINE_CORRIDOR + seeded(i * 7) * 0.6);
      }
      const key = `${Math.round(x)},${Math.round(z)}`;
      const n = cellGrid.get(key) || 0;
      if (n < 2) { cellGrid.set(key, n + 1); ok = true; break; }
    }
    if (!ok) continue;
    const s = 0.55 + seeded(i + 83) * 1.65;
    const archIdx = Math.floor(seeded(i + 311) * treeArchetypes.length);
    treeBuckets[archIdx].push({ x, z, s, rot: seeded(i + 17) * Math.PI });
  }

  // Build instanced meshes per archetype
  treeArchetypes.forEach((arch, idx) => {
    const list = treeBuckets[idx];
    if (!list.length) return;
    const mat = new THREE.MeshStandardMaterial({ color: arch.color, roughness: arch.rough });
    const im = new THREE.InstancedMesh(arch.geom, mat, list.length);
    list.forEach((t, i) => {
      // Lift canopy to sit clearly above the trunk top.
      const isCone = arch.geom.type === "ConeGeometry";
      const canopyY = (isCone ? 0.42 : 0.34) * t.s;
      dummy.position.set(t.x, canopyY, t.z);
      dummy.scale.set(t.s * 0.92, t.s * arch.yScale * 0.92, t.s * 0.92);
      dummy.rotation.set(seeded(i + idx * 41) * 0.25, t.rot, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    vegetation.add(im);
  });

  // Trunks (shared)
  const allTrees = treeBuckets.flat();
  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, allTrees.length);
  allTrees.forEach((t, i) => {
    dummy.position.set(t.x, 0.11 * t.s, t.z);
    dummy.scale.set(t.s * 0.7, t.s * 0.7, t.s * 0.7);
    dummy.rotation.set(0, t.rot, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  vegetation.add(trunks);

  if (SHOW_SCENE_EXTRAS) root.add(vegetation);

  // Glass photon bubbles — small translucent spheres drifting in slow arcs
  // along the spine. They thread through the city like camera-following
  // signals; subtle but a key part of the cinematic miniature feel.
  const photonMat = new THREE.MeshPhysicalMaterial({
    color: "#FFD898",
    roughness: 0.22,
    transmission: 0.85,
    thickness: 0.12,
    ior: 1.35,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    emissive: "#000000",
    emissiveIntensity: 0.0,
  });
  const photons = [];
  const photonGeom = new THREE.SphereGeometry(1, 18, 14);
  for (let i = 0; i < 26; i++) {
    const r = 0.06 + seeded(i + 9101) * 0.05;
    const p = new THREE.Mesh(photonGeom, photonMat);
    p.scale.setScalar(r);
    p.castShadow = false;
    p.userData = {
      speed: 0.06 + seeded(i + 9201) * 0.08,
      phase: seeded(i + 9301) * Math.PI * 2,
      lift: 0.45 + seeded(i + 9401) * 1.8,
      drift: 0.25 + seeded(i + 9501) * 0.35,
    };
    if (SHOW_SCENE_EXTRAS) root.add(p);
    photons.push(p);
  }

  // ─── FLOOR ANNOTATIONS & GROUND PLANE ─────────────────────────────
  // We removed the scientific ghost grid to maintain the organic miniature city look.
  let ghostMesh = null;
  function buildGhostGrid(rowsPerYear) {
    // Instead of ghost boxes, we draw nothing here to keep the plaster floor clean.
  }

  // Center the grid so (0,0) is middle of years × middle of rows
  function xForYearIndex(i) {
    return (i - (yearCount - 1) / 2) * yearStride;
  }
  function zForRow(rowIndex, totalRows) {
    const raw = (rowIndex - (totalRows - 1) / 2) * (gridDepth / totalRows);
    // Push every row outward by a fixed corridor offset so the road + sidewalks
    // get a clear strip down the middle. Preserves spacing between rows.
    const sign = Math.sign(raw) || 1;
    const corridorOffset = SPINE_WIDTH / 2 + SIDEWALK_WIDTH + 0.35; // ~1.90
    return sign * (Math.abs(raw) + corridorOffset);
  }

  // ─── ENTRY PRISMS ─────────────────────────────────────────────────
  let entryPrisms = []; // {group, mesh, glow, segments[{mesh,edge,bucket}], cellKey, entries, dominantTag, primaryEntryId}
  let windowsInst = null;     // InstancedMesh of per-window protrusion boxes
  let windowFramesInst = null;  // InstancedMesh of per-window dark frame boxes
  let windowSillsInst = null;   // InstancedMesh of per-window sill protrusions
  let rooftopAcInst = null;   // InstancedMesh of rooftop AC units
  let rooftopTankInst = null; // InstancedMesh of rooftop water tanks
  function clearEntryPrisms() {
    for (const p of entryPrisms) {
      root.remove(p.group);
      for (const seg of p.segments || []) {
        seg.mesh.geometry.dispose();
        seg.mesh.material.dispose();
        if (seg.edge) { seg.edge.geometry.dispose(); seg.edge.material.dispose(); }
      }
    }
    entryPrisms = [];
    for (const im of [windowsInst, windowFramesInst, windowSillsInst, rooftopAcInst, rooftopTankInst]) {
      if (!im) continue;
      root.remove(im);
      im.geometry.dispose();
      im.material.dispose();
    }
    windowsInst = windowFramesInst = windowSillsInst = rooftopAcInst = rooftopTankInst = null;
  }

  // Per-window pattern config — mirrors the shader's per-role tile sizes.
  function getPatternConfig(bucketKey) {
    switch (bucketKey) {
      case 'MovingImages':   return { tile: [0.16, 0.62], density: 0.70, marginX: 0.22, marginY: 0.08 };
      case 'VisualSystems':  return { tile: [0.18, 0.22], density: 0.82, marginX: 0.22, marginY: 0.22 };
      case 'CompCulture':    return { tile: [0.16, 0.20], density: 0.94, marginX: 0.22, marginY: 0.22 };
      case 'DocResearch':    return { tile: [0.44, 0.36], density: 0.42, marginX: 0.22, marginY: 0.22 };
      case 'LeadershipEdu':  return { tile: [0.34, 0.40], density: 0.42, marginX: 0.22, marginY: 0.22 };
      default:               return { tile: [0.34, 0.40], density: 0.42, marginX: 0.22, marginY: 0.22 };
    }
  }
  // JS replica of the shader's fhash21 — same noise so window placement matches.
  function fhash21(x, y) {
    const fract = (n) => n - Math.floor(n);
    let px = fract(x * 123.34);
    let py = fract(y * 456.21);
    const d = px * px + py * py + 45.32 * (px + py);
    px += d;
    py += d;
    return fract(px * py);
  }
  // For one building body, push every "on" window into outWindows + frames into outFrames + sills into outSills.
  function collectBuildingWindows(cx, baseY, cz, bodyW, bodyH, bodyD, bucketKey, hash, outWindows, outFrames, outSills) {
    const cfg = getPatternConfig(bucketKey);
    const tileW = cfg.tile[0];
    const tileH = cfg.tile[1];
    const winW = tileW * (1 - cfg.marginX * 2);
    const winH = tileH * (1 - cfg.marginY * 2);
    const frameW = tileW * 0.88;
    const frameH = tileH * 0.88;
    // Much shallower protrusion — windows now read as inset panes, not stuck-on blocks.
    const protrusion = 0.012;
    const framePro = 0.005;
    const faces = [
      { rotY: -Math.PI / 2, faceX: cx - bodyW / 2 - protrusion / 2,  faceZ: null,                          horizDim: bodyD },
      { rotY:  Math.PI / 2, faceX: cx + bodyW / 2 + protrusion / 2,  faceZ: null,                          horizDim: bodyD },
      { rotY:  0,           faceX: null,                              faceZ: cz - bodyD / 2 - protrusion / 2, horizDim: bodyW },
      { rotY:  Math.PI,     faceX: null,                              faceZ: cz + bodyD / 2 + protrusion / 2, horizDim: bodyW },
    ];
    const hashSeed = hash * 17.13;
    for (const f of faces) {
      const halfW = f.horizDim / 2;
      const halfH = bodyH / 2;
      const cellHStart = Math.ceil(-halfW / tileW);
      const cellHEnd = Math.floor(halfW / tileW);
      const cellVStart = Math.ceil(-halfH / tileH);
      const cellVEnd = Math.floor(halfH / tileH);
      for (let ch = cellHStart; ch < cellHEnd; ch++) {
        const hLocal = (ch + 0.5) * tileW;
        if (Math.abs(hLocal) > halfW - winW * 0.5) continue;
        for (let cv = cellVStart; cv < cellVEnd; cv++) {
          const vLocal = (cv + 0.5) * tileH;
          if (Math.abs(vLocal) > halfH - winH * 0.5) continue;
          // Ground-floor skip (matches shader)
          const yFrac = vLocal / Math.max(0.001, bodyH) + 0.5;
          if (yFrac < 0.06) continue;
          const h = fhash21(ch + hashSeed, cv + hashSeed);
          if (h >= cfg.density) continue;
          let xWorld, zWorld;
          if (f.faceX !== null) {
            xWorld = f.faceX;
            zWorld = cz + hLocal;
          } else {
            xWorld = cx + hLocal;
            zWorld = f.faceZ;
          }
          const yWorld = baseY + vLocal;
          // Window pane (warm glow)
          outWindows.push({ x: xWorld, y: yWorld, z: zWorld, rotY: f.rotY,
                            sw: winW, sh: winH, sd: protrusion });
          // Outer frame (dark surround)
          outFrames.push({ x: xWorld, y: yWorld, z: zWorld, rotY: f.rotY,
                           sw: frameW, sh: frameH, sd: framePro });
          // Sill removed — was contributing to "lego stacked" feel.
          // Frames + the warm window glow are enough to read as windows.
        }
      }
    }
  }

  function strongestEntry(weekEntries) {
    return [...weekEntries].sort((a, b) => {
      const m = Number(b.tags.includes("Milestone")) - Number(a.tags.includes("Milestone"));
      if (m) return m;
      return b.tags.length - a.tags.length;
    })[0];
  }

  // ─── BUILDING FACADE SHADER ────────────────────────────────────────
  // Procedural windows + per-role pattern. Injected into MeshStandardMaterial
  // via onBeforeCompile so we keep three.js lighting, shadows, env map.
  //
  // 5 role patterns:
  //   0 Photography → sparse irregular (~45% windows)
  //   1 Design      → dense regular grid (~85%)
  //   2 AV          → vertical cinema strips
  //   3 Branding    → wide spaced, fewer (~40%)
  //   4 IT          → uniform tight grid (~95%)
  const ROLE_PATTERN = {
    MovingImages: 2,     // vertical cinema strips
    VisualSystems: 1,    // dense regular grid
    CompCulture: 4,      // uniform tight grid
    DocResearch: 3,      // wide spaced
    LeadershipEdu: 0,    // sparse irregular
    Other: 0,
  };
  function makeFacadeMaterial(bucket, buildingHeight, hash) {
    // Pass 08: porcelain ceramic body (ported from Dimensions porcelain.mdl).
    // Walls render white-ish; the emissive WINDOW SHADER (preserved below)
    // is what gives the glowing-city signature. Role identity now lives in
    // the window pattern (sparse / dense / strips) instead of body colour.
    const baseColor = new THREE.Color("#FFFFFF");
    const mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: 0.73,          // MDL: roughness 0.73
      metalness: 0.0,
      ior: 1.4,                 // MDL: specular_ior 1.4
      clearcoat: 1.0,           // MDL: coat 1.0
      clearcoatRoughness: 0.03, // MDL: coat_roughness 0.03
      sheen: 0.4,               // fake subsurface — MDL had translucency 1 + scatter
      sheenColor: new THREE.Color("#D8D6D2"),
      sheenRoughness: 0.8,
      envMapIntensity: 1.0,
    });
    const roleColorVec = new THREE.Color(bucket.color).multiplyScalar(0.22);
    const accent = new THREE.Color("#FFE0A0");
    // Store originals so filter dimming can restore them.
    mat.userData.baseColor = baseColor.clone();
    mat.userData.baseEmissive = new THREE.Color(bucket.color);
    mat.userData.baseRoleColor = roleColorVec.clone();
    mat.userData.roleColorRef = roleColorVec; // live ref the shader uniform reads
    mat.userData.baseAccent = accent.clone();
    mat.userData.accentRef = accent;
    mat.userData.facadeUniforms = {
      uPattern: { value: ROLE_PATTERN[bucket.key] ?? 0 },
      uHeight: { value: buildingHeight },
      uHash: { value: hash },
      uAccent: { value: accent },
      uRoleColor: { value: roleColorVec },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.facadeUniforms);

      shader.vertexShader = shader.vertexShader
        .replace(`#include <common>`, `#include <common>
          varying vec3 vLocalPos;
          varying vec3 vLocalNormal;`)
        .replace(`#include <begin_vertex>`, `#include <begin_vertex>
          vLocalPos = position;
          vLocalNormal = normal;`);

      shader.fragmentShader = shader.fragmentShader
        .replace(`#include <common>`, `#include <common>
          uniform float uPattern;
          uniform float uHeight;
          uniform float uHash;
          uniform vec3 uAccent;
          uniform vec3 uRoleColor;
          varying vec3 vLocalPos;
          varying vec3 vLocalNormal;

          float fhash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }`)
        .replace(`#include <color_fragment>`, `#include <color_fragment>
          // Pass 08: porcelain walls. The role color tint is gone; identity
          // is now expressed only through the window pattern density (uPattern).
          vec3 _wallCol = vec3(1.0);
          vec3 _winCol = uAccent;
          float _winE = 0.0;

          vec3 _absN = abs(vLocalNormal);
          bool _isTop = _absN.y > 0.9;
          if (!_isTop) {
            // pick UV for vertical face (largest of x/z normal wins)
            vec2 _uv = _absN.x > _absN.z
              ? vec2(vLocalPos.z, vLocalPos.y)
              : vec2(vLocalPos.x, vLocalPos.y);

            vec2 _tile;
            float _density;
            if (uPattern < 0.5) {        // Photography
              _tile = vec2(0.34, 0.40); _density = 0.42;
            } else if (uPattern < 1.5) { // Design
              _tile = vec2(0.18, 0.22); _density = 0.82;
            } else if (uPattern < 2.5) { // AV
              _tile = vec2(0.16, 0.62); _density = 0.7;
            } else if (uPattern < 3.5) { // Branding
              _tile = vec2(0.44, 0.36); _density = 0.42;
            } else {                     // IT
              _tile = vec2(0.16, 0.20); _density = 0.94;
            }

            vec2 _cell = floor(_uv / _tile);
            vec2 _cellUv = fract(_uv / _tile);
            float _marginX = 0.22;
            float _marginY = uPattern > 1.5 && uPattern < 2.5 ? 0.08 : 0.22; // AV: tall windows
            bool _inWin = _cellUv.x > _marginX && _cellUv.x < (1.0 - _marginX)
                       && _cellUv.y > _marginY && _cellUv.y < (1.0 - _marginY);
            float _h = fhash21(_cell + uHash * 17.13);
            bool _on = _h < _density;
            // ground-floor podium: lower 1/N windows tend off (darker base)
            float _yFrac = vLocalPos.y / max(0.001, uHeight) + 0.5;
            if (_yFrac < 0.04) _on = false;

            if (_inWin && _on) {
              // window: warm light, faint per-cell variation
              float _warmth = 0.70 + 0.30 * fhash21(_cell + vec2(7.1, 13.7));
              vec3 _w = uAccent * _warmth;
              diffuseColor.rgb = _w;
              _winE = 1.30 + 0.55 * _warmth;
            } else {
              diffuseColor.rgb = _wallCol;
            }
          } else {
            // building top: also porcelain white
            diffuseColor.rgb = vec3(1.0);
          }`)
        .replace(`#include <emissivemap_fragment>`, `#include <emissivemap_fragment>
          // Pass 09: emissive scaled by material opacity so the role/year
          // filter dim cascade actually fades the bright windows out.
          // Without this multiplication the windows stayed full-bright even
          // when the material's opacity was tweened toward 0.
          totalEmissiveRadiance += uAccent * _winE * opacity;`);
    };
    return mat;
  }

  // Decide a building's architectural personality from its dominant role + signals.
  function buildingArchetype(bucketKey, hasMilestone, totalCount, hash) {
    const r = hash;
    let footprint = "square"; // default
    let setback = false;
    let spire = false;
    let podiumOversized = false;
    let scaleY = 1.0;

    switch (bucketKey) {
      case "MovingImages":
        footprint = r < 0.45 ? "rectangle" : (r < 0.7 ? "wide" : "square");
        setback = r < 0.55;
        podiumOversized = true;
        scaleY = 1.05;
        break;
      case "VisualSystems":
        footprint = r < 0.5 ? "tower" : "square";
        spire = r < 0.55;
        scaleY = 1.15;
        break;
      case "CompCulture":
        footprint = "square";
        scaleY = 1.0;
        break;
      case "DocResearch":
        footprint = r < 0.65 ? "tower" : "square";
        spire = r < 0.8;
        podiumOversized = r < 0.4;
        scaleY = 1.22;
        break;
      case "LeadershipEdu":
        footprint = r < 0.6 ? "wide" : "square";
        podiumOversized = true;
        setback = r < 0.4;
        scaleY = 0.88;
        break;
      default:
        footprint = "square";
    }
    if (hasMilestone) { setback = true; spire = spire || hash > 0.5; scaleY += 0.12; }
    if (totalCount >= 4) scaleY += 0.08;
    return { footprint, setback, spire, podiumOversized, scaleY };
  }

  // Stable hash for a cell key (string) → [0,1)
  function strHash01(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  // ─── CLUSTER LAYOUT ──────────────────────────────────────────────
  // Pass 05: replaces the year×month grid with a sculptural phyllotaxis
  // cluster. Three tiers ranked by importance — milestones in the center,
  // significant entries in the mid-ring, routine entries on the perimeter.
  // Heights still encode entry weight; tier adds a multiplier so the cluster
  // has a clear pyramid silhouette.
  const HEAVY_TAGS = new Set([
    "Founder", "Co-founder", "Strategy", "Leadership",
    "Earnings", "Grant", "ThroughLine",
    "Director", "DOP", "Cinematographer",
  ]);
  function classifyTier(group) {
    const tags = new Set();
    for (const e of group.entries) {
      for (const t of (e.tags || [])) tags.add(t);
      for (const t of (e.roleTags || [])) tags.add(t);
    }
    if (tags.has("Milestone")) return 1;
    for (const t of HEAVY_TAGS) if (tags.has(t)) return 2;
    if (group.entries.length >= 3) return 2;
    return 3;
  }
  function clusterLayout(groups) {
    for (const g of groups) g.tier = classifyTier(g);
    // Sort: tier 1 first (innermost), then tier 2, then tier 3. Within tier,
    // denser groups (more entries) go closer to center.
    const sorted = [...groups].sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.entries.length - a.entries.length;
    });
    // Phyllotaxis (golden-angle) spiral packing.
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const cellRadius = 1.10;
    sorted.forEach((g, i) => {
      const baseR = cellRadius * Math.sqrt(i + 0.5);
      const angle = i * goldenAngle;
      // Tiny per-cell jitter so it doesn't look mathematically perfect.
      const jr = (strHash01(g.key + ":r") - 0.5) * 0.3;
      const ja = (strHash01(g.key + ":a") - 0.5) * 0.08;
      g.x = Math.cos(angle + ja) * (baseR + jr);
      g.z = Math.sin(angle + ja) * (baseR + jr);
      g.tierHeightMult = g.tier === 1 ? 1.55 : g.tier === 2 ? 1.18 : 1.0;
    });
    return sorted;
  }

  function buildEntryPrismsForLOD(_lod) {
    clearEntryPrisms();
    const rows = 12; // month is the unit, always
    const cellW = (yearStride - cellPad * 2);
    const cellD = (gridDepth / rows) - cellPad * 2;
    const clampRow = (idx, max) => Math.max(0, Math.min(max - 1, idx));
    // Collectors for per-building details that get baked into shared InstancedMeshes.
    const windowData = [];   // {x,y,z,rotY,sw,sh,sd}
    const frameData = [];
    const sillData = [];
    const rooftopAcData = []; // {x,y,z,sw,sh,sd}
    const rooftopTankData = []; // {x,y,z,radius,height}

    const groups = [];
    for (const [key, ents] of entriesByMonth) {
      const [yStr, mStr] = key.split("-");
      const y = Number(yStr);
      const m = Number(mStr) || 1;
      const yi = years.indexOf(y);
      if (yi < 0) continue;
      if (CLUSTER_MODE) {
        // Cluster mode: x/z assigned by clusterLayout after the loop.
        // cellW/cellD become a uniform "building footprint slot" because
        // there's no grid cell to fill — just a sculptural element.
        groups.push({
          x: 0, z: 0,
          cellW: 1.55, cellD: 1.55,
          entries: ents,
          key,
          year: y, month: m,
        });
      } else {
        groups.push({
          x: xForYearIndex(yi),
          z: zForRow(clampRow(m - 1, rows), rows),
          cellW, cellD,
          entries: ents,
          key,
          year: y, month: m,
        });
      }
    }
    if (CLUSTER_MODE) clusterLayout(groups);

    for (const g of groups) {
      const bucketCounts = new Map();
      for (const entry of g.entries) {
        const entryTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
        const seenBuckets = new Set();
        for (const t of entryTags) {
          if (!t) continue;
          const b = bucketForTag(t);
          if (seenBuckets.has(b.key)) continue;
          seenBuckets.add(b.key);
          bucketCounts.set(b.key, (bucketCounts.get(b.key) || 0) + 1);
        }
        if (!seenBuckets.size) bucketCounts.set("Other", (bucketCounts.get("Other") || 0) + 1);
      }

      const allTags = [...new Set(g.entries.flatMap(e => e.tags || []))];
      const hasMilestone = allTags.includes("Milestone");
      const totalCount = g.entries.length;

      const stackOrder = ROLE_BUCKETS.filter((b) => bucketCounts.has(b.key));
      const dominantBucket = stackOrder[0] || ROLE_BUCKETS.find((b) => b.key === "Other");

      // Log-scaled height — keeps dramatic silhouettes without runaway outliers
      const heightScore = Math.log2(1 + totalCount * 1.8) + (hasMilestone ? 1.2 : 0);
      const baseHeight = Math.max(1.4, heightScore * 1.9);
      const importance = Math.min(1, heightScore / 5);

      const hash = strHash01(g.key);
      const arch = buildingArchetype(dominantBucket.key, hasMilestone, totalCount, hash);
      // Cluster mode multiplies height by tier so the cluster has a real
      // pyramid silhouette (milestones tower; routine entries are slabs).
      const tierMult = g.tierHeightMult || 1.0;
      const buildingHeight = baseHeight * arch.scaleY * tierMult;

      // Footprint dimensions per archetype
      const footW = g.cellW * 0.84;
      const footD = g.cellD * 0.84;
      let bodyW, bodyD;
      switch (arch.footprint) {
        case "tower":     bodyW = footW * 0.48; bodyD = footD * 0.48; break;
        case "wide":      bodyW = footW * 0.95; bodyD = footD * 0.72; break;
        case "rectangle": bodyW = footW * 0.78; bodyD = footD * 0.52; break;
        default:          bodyW = footW * 0.72; bodyD = footD * 0.72;
      }

      const group = new THREE.Group();
      const segments = [];

      // PODIUM — wider ground floor that grounds the building on the platform
      const podiumH = 0.32 + (arch.podiumOversized ? 0.12 : 0);
      const podiumW = arch.podiumOversized ? footW * 1.02 : Math.min(footW, bodyW * 1.22);
      const podiumD = arch.podiumOversized ? footD * 0.92 : Math.min(footD, bodyD * 1.22);
      // Slightly bigger corner radius for ceramic-looking edges.
      const podiumGeom = new RoundedBoxGeometry(podiumW, podiumH, podiumD, 3, 0.07);
      const podiumMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(dominantBucket.color).multiplyScalar(0.06),
        roughness: 0.80,
        metalness: 0.02,
        clearcoat: 0.04,
        clearcoatRoughness: 0.60,
        envMapIntensity: 0.04,
      });
      const podiumMesh = new THREE.Mesh(podiumGeom, podiumMat);
      podiumMesh.position.set(g.x, podiumH / 2, g.z);
      podiumMesh.castShadow = true;
      podiumMesh.receiveShadow = true;
      group.add(podiumMesh);

      // BODY — the main mass. Procedural window facade.
      // BoxGeometry (not Rounded) — the facade shader uses face normals which
      // only work cleanly on flat faces. We kill the lego feel via dramatic
      // lighting + edge cylinders, not via geometric bevels.
      const bodyH = buildingHeight - podiumH - (arch.setback ? 0.7 : 0);
      const bodyGeom = new THREE.BoxGeometry(bodyW, bodyH, bodyD, 5, 14, 5);
      const bodyMat = makeFacadeMaterial(dominantBucket, bodyH, hash);
      const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
      bodyMesh.position.set(g.x, podiumH + bodyH / 2, g.z);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      group.add(bodyMesh);

      // Window protrusion geometry skipped — the dark frame checker was reading as
      // "lego". Building bodies use the procedural shader-painted windows only.
      const windowStartIdx = windowData.length;
      const frameStartIdx = frameData.length;
      const sillStartIdx = sillData.length;

      // Podium entry: door + 2 steps on one side
      const entrySide = hash > 0.5 ? 1 : -1; // -Z or +Z facing
      const doorMat = new THREE.MeshStandardMaterial({
        color: "#0E0C0A", roughness: 0.65, metalness: 0.15,
      });
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(podiumW * 0.16, podiumH * 0.78, 0.025), doorMat,
      );
      door.position.set(g.x, podiumH * 0.4, g.z + entrySide * (podiumD / 2 + 0.014));
      door.castShadow = true;
      group.add(door);
      // Step
      const stepMat = new THREE.MeshStandardMaterial({
        color: "#1A1610", roughness: 0.85, metalness: 0.04,
      });
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(podiumW * 0.34, 0.04, 0.18), stepMat,
      );
      step.position.set(g.x, 0.02, g.z + entrySide * (podiumD / 2 + 0.1));
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
      const step2 = new THREE.Mesh(
        new THREE.BoxGeometry(podiumW * 0.28, 0.04, 0.12), stepMat,
      );
      step2.position.set(g.x, 0.06, g.z + entrySide * (podiumD / 2 + 0.06));
      step2.castShadow = true;
      group.add(step2);

      // Awning over the entry on some buildings
      if (hash > 0.45) {
        const awningMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(dominantBucket.color).multiplyScalar(0.12),
          roughness: 0.7,
        });
        const awning = new THREE.Mesh(
          new THREE.BoxGeometry(podiumW * 0.42, 0.04, 0.22), awningMat,
        );
        awning.position.set(g.x, podiumH * 0.85,
                            g.z + entrySide * (podiumD / 2 + 0.1));
        awning.castShadow = true;
        group.add(awning);
      }

      // CORNICE — only on taller buildings, much subtler overhang. Skips the
      // "stacked slab" feel that thin overhanging caps create on short buildings.
      let corniceH = 0;
      let corniceMat;
      if (bodyH > 2.4) {
        corniceH = 0.04;
        corniceMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(dominantBucket.color).multiplyScalar(0.12),
          roughness: 0.65,
          metalness: 0.12,
        });
        const corniceGeom = new THREE.BoxGeometry(
          bodyW * 1.02, corniceH, bodyD * 1.02
        );
        const corniceMesh = new THREE.Mesh(corniceGeom, corniceMat);
        corniceMesh.position.set(g.x, podiumH + bodyH + corniceH / 2, g.z);
        corniceMesh.castShadow = true;
        group.add(corniceMesh);
      }

      // SETBACK — smaller upper mass for stepped silhouette
      if (arch.setback) {
        const sbH = 0.7 + importance * 0.4;
        const sbW = bodyW * 0.66;
        const sbD = bodyD * 0.66;
        const sbGeom = new THREE.BoxGeometry(sbW, sbH, sbD, 3, 4, 3);
        const sbMat = makeFacadeMaterial(dominantBucket, sbH, hash + 0.13);
        const sbMesh = new THREE.Mesh(sbGeom, sbMat);
        sbMesh.position.set(g.x, podiumH + bodyH + corniceH + sbH / 2, g.z);
        sbMesh.castShadow = true;
        sbMesh.receiveShadow = true;
        group.add(sbMesh);
        // Setback windows also use shader-only — no protrusion geometry.
      }
      const windowEndIdx = windowData.length;
      const frameEndIdx = frameData.length;
      const sillEndIdx = sillData.length;
      const acStartIdx = rooftopAcData.length;
      const tankStartIdx = rooftopTankData.length;

      // ROOFTOP MECHANICAL — small penthouse + AC units + water tanks on bigger buildings
      const roofTopY = podiumH + bodyH + corniceH + (arch.setback ? 0.7 + importance * 0.4 : 0);
      if (bodyH > 3.0) {
        const mechH = 0.16 + hash * 0.12;
        const mechW = bodyW * 0.28;
        const mechD = bodyD * 0.28;
        const mechGeom = new THREE.BoxGeometry(mechW, mechH, mechD);
        const mechMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(dominantBucket.color).multiplyScalar(0.10),
          roughness: 0.82,
          metalness: 0.12,
        });
        const mechMesh = new THREE.Mesh(mechGeom, mechMat);
        mechMesh.position.set(g.x + bodyW * 0.15, roofTopY + mechH / 2, g.z - bodyD * 0.12);
        mechMesh.castShadow = true;
        group.add(mechMesh);
      }
      // 1 small AC unit per ~half the buildings (was 1-3 per ALL — too cluttered).
      if (hash > 0.55) {
        const ax = g.x + (hash - 0.5) * bodyW * 0.4;
        const az = g.z + (strHash01(g.key + ":az") - 0.5) * bodyD * 0.4;
        rooftopAcData.push({ x: ax, y: roofTopY + 0.05, z: az, sw: 0.13, sh: 0.10, sd: 0.10 });
      }
      // Water tank only on the tallest buildings — rarer, more impactful.
      if (bodyH > 3.5 && hash > 0.55) {
        const tx = g.x + (hash - 0.5) * bodyW * 0.4;
        const tz = g.z + (strHash01(g.key + ":tank") - 0.5) * bodyD * 0.4;
        rooftopTankData.push({ x: tx, y: roofTopY + 0.13, z: tz, radius: 0.11, height: 0.26 });
      }

      // SPIRE / ANTENNA — skyline punctuation with higher poly
      if (arch.spire) {
        const totalTop = podiumH + bodyH + corniceH + (arch.setback ? 0.7 + importance * 0.4 : 0);
        const spireH = 0.6 + heightScore * 0.18;
        const spireGeom = new THREE.CylinderGeometry(0.03, 0.065, spireH, 12);
        const spireMat = new THREE.MeshStandardMaterial({
          color: "#0A0908",
          roughness: 0.60,
          metalness: 0.55,
          emissive: "#FFD080",
          emissiveIntensity: 0.08,
        });
        const spireMesh = new THREE.Mesh(spireGeom, spireMat);
        spireMesh.position.set(g.x, totalTop + spireH / 2, g.z);
        spireMesh.castShadow = true;
        group.add(spireMesh);
      }

      // Ledge band removed — was adding "stacked slab" feel without much visual payoff.

      // Subtle edge definition on the body (helps it read at distance)
      const edgeGeo = new THREE.EdgesGeometry(bodyGeom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: "#FFD898",
        transparent: true,
        opacity: 0.06,
      });
      const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLines.position.copy(bodyMesh.position);
      group.add(edgeLines);

      // The "segments" array is preserved for compat with filter/focus/select code,
      // but for month-buildings it's just the body. Picking uses bodyMesh.
      segments.push({ mesh: bodyMesh, edge: edgeLines, bucket: dominantBucket.key, height: bodyH });

      // Name the group + main meshes so they're identifiable in GLB exports
      // and in the shift-click picker (debug panel).
      const _safeTag = String(dominantBucket.key || 'mixed').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const _safeKey = String(g.key || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
      group.name = `building_${g.year ?? 'na'}_${_safeTag}_tier${g.tier ?? 'na'}_${_safeKey}`;
      bodyMesh.name = `${group.name}__body`;
      podiumMesh.name = `${group.name}__podium`;

      root.add(group);

      const primary = strongestEntry(g.entries);
      entryPrisms.push({
        group,
        mesh: bodyMesh,
        glow: bodyMesh,
        segments,
        cellKey: g.key,
        entries: g.entries,
        dominantTag: dominantBucket.key,
        bucket: dominantBucket,
        primaryEntryId: primary?.id,
        baseHeight: buildingHeight,
        baseColor: dominantBucket.color,
        baseEmissive: 0.06 + importance * 0.08,
        bodyW, bodyD, bodyH,
        archetype: arch,
        // Year stored on the prism so the Year Window slider can fade/blur
        // out-of-window buildings via applyYearWindow() (Pass 05).
        year: g.year,
        month: g.month,
        tier: g.tier,
        // Per-building ranges into the global window/frame/sill/AC/tank InstancedMeshes.
        // applyFocusDim uses these to zero out matrices when the building is hidden.
        windowRange: { start: windowStartIdx, end: windowEndIdx },
        frameRange:  { start: frameStartIdx,  end: frameEndIdx  },
        sillRange:   { start: sillStartIdx,   end: sillEndIdx   },
        acRange:     { start: acStartIdx,     end: rooftopAcData.length   },
        tankRange:   { start: tankStartIdx,   end: rooftopTankData.length },
      });
    }

    // ─── BAKE WINDOW PROTRUSIONS ───────────────────────────────────
    // All windows across all buildings → one InstancedMesh per type.
    if (windowData.length) {
      const winGeom = new THREE.BoxGeometry(1, 1, 1);
      const winMat = new THREE.MeshStandardMaterial({
        color: "#FFD898",
        emissive: "#FFBB60",
        emissiveIntensity: 0.40,
        roughness: 0.45,
        metalness: 0.02,
      });
      windowsInst = new THREE.InstancedMesh(winGeom, winMat, windowData.length);
      windowsInst.castShadow = true;
      const wd = new THREE.Object3D();
      for (let i = 0; i < windowData.length; i++) {
        const w = windowData[i];
        wd.position.set(w.x, w.y, w.z);
        wd.rotation.set(0, w.rotY, 0);
        wd.scale.set(w.sw, w.sh, w.sd);
        wd.updateMatrix();
        windowsInst.setMatrixAt(i, wd.matrix);
      }
      windowsInst.instanceMatrix.needsUpdate = true;
      root.add(windowsInst);
    }
    if (frameData.length) {
      const fgeom = new THREE.BoxGeometry(1, 1, 1);
      const fmat = new THREE.MeshStandardMaterial({
        color: "#23201C",
        roughness: 0.78,
        metalness: 0.2,
      });
      windowFramesInst = new THREE.InstancedMesh(fgeom, fmat, frameData.length);
      windowFramesInst.castShadow = true;
      const fd = new THREE.Object3D();
      for (let i = 0; i < frameData.length; i++) {
        const f = frameData[i];
        fd.position.set(f.x, f.y, f.z);
        fd.rotation.set(0, f.rotY, 0);
        fd.scale.set(f.sw, f.sh, f.sd);
        fd.updateMatrix();
        windowFramesInst.setMatrixAt(i, fd.matrix);
      }
      windowFramesInst.instanceMatrix.needsUpdate = true;
      root.add(windowFramesInst);
    }
    if (sillData.length) {
      const sgeom = new THREE.BoxGeometry(1, 1, 1);
      const smat = new THREE.MeshStandardMaterial({
        color: "#6E665A",
        roughness: 0.7,
        metalness: 0.18,
      });
      windowSillsInst = new THREE.InstancedMesh(sgeom, smat, sillData.length);
      windowSillsInst.castShadow = true;
      windowSillsInst.receiveShadow = true;
      const sd = new THREE.Object3D();
      for (let i = 0; i < sillData.length; i++) {
        const s = sillData[i];
        sd.position.set(s.x, s.y, s.z);
        sd.rotation.set(0, s.rotY, 0);
        sd.scale.set(s.sw, s.sh, s.sd);
        sd.updateMatrix();
        windowSillsInst.setMatrixAt(i, sd.matrix);
      }
      windowSillsInst.instanceMatrix.needsUpdate = true;
      root.add(windowSillsInst);
    }
    // Rooftop AC units
    if (rooftopAcData.length) {
      const acGeom = new RoundedBoxGeometry(1, 1, 1, 1, 0.04);
      const acMat = new THREE.MeshStandardMaterial({
        color: "#9C988C",
        roughness: 0.78,
        metalness: 0.4,
      });
      rooftopAcInst = new THREE.InstancedMesh(acGeom, acMat, rooftopAcData.length);
      rooftopAcInst.castShadow = true;
      const ad = new THREE.Object3D();
      for (let i = 0; i < rooftopAcData.length; i++) {
        const a = rooftopAcData[i];
        ad.position.set(a.x, a.y, a.z);
        ad.scale.set(a.sw, a.sh, a.sd);
        ad.updateMatrix();
        rooftopAcInst.setMatrixAt(i, ad.matrix);
      }
      rooftopAcInst.instanceMatrix.needsUpdate = true;
      if (SHOW_SCENE_EXTRAS) root.add(rooftopAcInst);
    }
    // Rooftop water tanks (cylindrical)
    if (rooftopTankData.length) {
      const tankGeom = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
      const tankMat = new THREE.MeshStandardMaterial({
        color: "#C7B89A",
        roughness: 0.72,
        metalness: 0.32,
      });
      rooftopTankInst = new THREE.InstancedMesh(tankGeom, tankMat, rooftopTankData.length);
      rooftopTankInst.castShadow = true;
      const td = new THREE.Object3D();
      for (let i = 0; i < rooftopTankData.length; i++) {
        const t = rooftopTankData[i];
        td.position.set(t.x, t.y, t.z);
        td.scale.set(t.radius, t.height, t.radius);
        td.updateMatrix();
        rooftopTankInst.setMatrixAt(i, td.matrix);
      }
      rooftopTankInst.instanceMatrix.needsUpdate = true;
      if (SHOW_SCENE_EXTRAS) root.add(rooftopTankInst);
    }

    // Snapshot the original matrices into each prism so applyFocusDim can
    // restore them when un-hiding. We do this AFTER all InstancedMeshes exist
    // because that's when their matrix data is finalized.
    const tmp = new THREE.Matrix4();
    for (const p of entryPrisms) {
      if (windowsInst && p.windowRange) {
        p.windowOriginalMatrices = [];
        for (let i = p.windowRange.start; i < p.windowRange.end; i++) {
          windowsInst.getMatrixAt(i, tmp);
          p.windowOriginalMatrices.push(tmp.clone());
        }
      }
      if (windowFramesInst && p.frameRange) {
        p.frameOriginalMatrices = [];
        for (let i = p.frameRange.start; i < p.frameRange.end; i++) {
          windowFramesInst.getMatrixAt(i, tmp);
          p.frameOriginalMatrices.push(tmp.clone());
        }
      }
      if (windowSillsInst && p.sillRange) {
        p.sillOriginalMatrices = [];
        for (let i = p.sillRange.start; i < p.sillRange.end; i++) {
          windowSillsInst.getMatrixAt(i, tmp);
          p.sillOriginalMatrices.push(tmp.clone());
        }
      }
      if (rooftopAcInst && p.acRange) {
        p.acOriginalMatrices = [];
        for (let i = p.acRange.start; i < p.acRange.end; i++) {
          rooftopAcInst.getMatrixAt(i, tmp);
          p.acOriginalMatrices.push(tmp.clone());
        }
      }
      if (rooftopTankInst && p.tankRange) {
        p.tankOriginalMatrices = [];
        for (let i = p.tankRange.start; i < p.tankRange.end; i++) {
          rooftopTankInst.getMatrixAt(i, tmp);
          p.tankOriginalMatrices.push(tmp.clone());
        }
      }
    }
  }

  // ─── YEAR LABELS (sprites -> flat meshes) ────────────────────────────────────────
  function makeTextSprite(text, opts = {}) {
    const fontSize = opts.fontSize || 56;
    const padding = 10;
    const font = opts.font || `"Cascadia Code","Inter","Helvetica Neue",sans-serif`;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = `600 ${fontSize}px ${font}`;
    const tw = ctx.measureText(text).width;
    canvas.width = Math.ceil(tw + padding * 2);
    canvas.height = Math.ceil(fontSize + padding * 2);
    ctx.font = `600 ${fontSize}px ${font}`;
    ctx.fillStyle = opts.color || TOKENS.ink;
    ctx.textBaseline = "top";
    ctx.fillText(text, padding, padding);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const scale = opts.scale || 0.012;
    const geom = new THREE.PlaneGeometry(canvas.width * scale, canvas.height * scale);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2; // Lie flat on the ground
    return mesh;
  }

  // Year + month labels skipped in cluster mode — there's no chronological
  // axis to label. The Year Window slider in the HUD is the time anchor.
  const yearLabels = new THREE.Group();
  if (!CLUSTER_MODE) {
    for (let i = 0; i < yearCount; i++) {
      const s = makeTextSprite(String(years[i]), {
        fontSize: 46,
        scale: 0.0062,
        color: i === yearCount - 1 ? TOKENS.signal : TOKENS.ink,
        font: `"Climate Crisis","Cascadia Code",sans-serif`,
      });
      s.position.set(xForYearIndex(i), 0.02, gridDepth / 2 + 1.15);
      yearLabels.add(s);
    }
    root.add(yearLabels);
  }

  // Month labels (left side) — rebuilt per LOD with appropriate granularity
  let rowLabels = new THREE.Group();
  if (!CLUSTER_MODE) root.add(rowLabels);
  function rebuildRowLabels(lod) {
    if (CLUSTER_MODE) return;
    root.remove(rowLabels);
    rowLabels.children.forEach(c => { c.material.map.dispose(); c.material.dispose(); });
    rowLabels = new THREE.Group();
    const x = -gridWidth / 2 - 1.4;
    if (lod === LOD.MONTH) {
      for (let m = 0; m < 12; m++) {
        const s = makeTextSprite(MONTH_LABELS[m], { fontSize: 44, scale: 0.012, color: "rgba(26,23,20,0.64)" });
        s.position.set(x, 0.02, zForRow(m, 12));
        rowLabels.add(s);
      }
    } else if (lod === LOD.WEEK) {
      // sparse: every 4 weeks
      for (let w = 0; w < 53; w += 4) {
        const s = makeTextSprite(`W${w + 1}`, { fontSize: 36, scale: 0.012, color: "rgba(26,23,20,0.52)" });
        s.position.set(x, 0.02, zForRow(w, 53));
        rowLabels.add(s);
      }
    } else {
      // months as anchor labels at day-rows
      for (let m = 0; m < 12; m++) {
        const doyAtMonthStart = Math.floor((m * 365) / 12);
        const s = makeTextSprite(MONTH_LABELS[m], { fontSize: 36, scale: 0.012, color: "rgba(26,23,20,0.48)" });
        s.position.set(x, 0.02, zForRow(doyAtMonthStart, 366));
        rowLabels.add(s);
      }
    }
    root.add(rowLabels);
  }

  // ─── CAMERA + MANUAL CONTROLS ─────────────────────────────────────
  // Pass 05 cluster mode: frame the circular plinth with a top-down 3/4
  // isometric view. Radius derived from plinth radius so framing works
  // regardless of how many entries pack into the cluster.
  // Pass 08 camera anchor — values lifted from the user's Adobe Dimensions
  // composition. Camera at (-0.17m, 2.09m, 123.2m), 120mm focal length,
  // looking at the cluster centre. Converted to our spherical orbit system:
  //   radius ≈ 123.5  (distance from target to camera)
  //   polar  ≈ 0.516π (slightly below horizontal — camera at Y=2 looking at Y=8)
  //   azimuth ≈ 0
  const camTarget = new THREE.Vector3(0, 8.3, 0);
  const camState = CLUSTER_MODE
    ? {
        radius: 123.5,
        polar: Math.PI * 0.516,
        azimuth: -0.001,
        minRadius: PLINTH_RADIUS * 0.6,
        maxRadius: 260,
      }
    : {
        radius: gridWidth * 1.65,
        polar: Math.PI * 0.34,
        azimuth: 0.22,
        minRadius: gridWidth * 0.4,
        maxRadius: gridWidth * 2.6,
      };
  function applyCamera() {
    const r = camState.radius;
    const sp = Math.sin(camState.polar);
    const cp = Math.cos(camState.polar);
    const sa = Math.sin(camState.azimuth);
    const ca = Math.cos(camState.azimuth);
    camera.position.set(
      camTarget.x + r * sp * sa,
      camTarget.y + r * cp,
      camTarget.z + r * sp * ca,
    );
    camera.lookAt(camTarget);
  }
  applyCamera();

  // GSAP smooth camera animation — animates camTarget + camState then calls applyCamera each tick
  function animateCameraTo(target, opts = {}) {
    const gsap = window.gsap;
    if (!gsap) {
      if (target.x != null) camTarget.x = target.x;
      if (target.y != null) camTarget.y = target.y;
      if (target.z != null) camTarget.z = target.z;
      if (target.radius != null) camState.radius = target.radius;
      if (target.polar != null) camState.polar = target.polar;
      if (target.azimuth != null) camState.azimuth = target.azimuth;
      applyCamera();
      ensureLOD();
      scheduleRender();
      return;
    }
    const tweenTarget = {};
    const tweenState = {};
    if (target.x != null) tweenTarget.x = target.x;
    if (target.y != null) tweenTarget.y = target.y;
    if (target.z != null) tweenTarget.z = target.z;
    if (target.radius != null) tweenState.radius = target.radius;
    if (target.polar != null) tweenState.polar = target.polar;
    if (target.azimuth != null) tweenState.azimuth = target.azimuth;
    const dur = opts.duration || 0.8;
    const ease = opts.ease || "power2.inOut";
    const tl = gsap.timeline({
      onUpdate: () => { applyCamera(); ensureLOD(); scheduleRender(); },
    });
    if (Object.keys(tweenTarget).length) tl.to(camTarget, { ...tweenTarget, duration: dur, ease }, 0);
    if (Object.keys(tweenState).length) tl.to(camState, { ...tweenState, duration: dur, ease }, 0);
  }

  // Drag damping state
  let dragVelocity = { az: 0, pol: 0 };
  let dampingRaf = null;
  function startDamping() {
    if (dampingRaf) return;
    function tick() {
      const friction = 0.88;
      dragVelocity.az *= friction;
      dragVelocity.pol *= friction;
      if (Math.abs(dragVelocity.az) < 0.00005 && Math.abs(dragVelocity.pol) < 0.00005) {
        dampingRaf = null;
        return;
      }
      camState.azimuth += dragVelocity.az;
      camState.polar = Math.max(Math.PI * 0.12, Math.min(Math.PI * 0.55, camState.polar + dragVelocity.pol));
      applyCamera();
      scheduleRender();
      dampingRaf = requestAnimationFrame(tick);
    }
    dampingRaf = requestAnimationFrame(tick);
  }

  // ─── LOD MANAGEMENT ──────────────────────────────────────────────
  // Filter / selection state must be declared before ensureLOD() runs
  let filterState = { hasFilter: false, matchingWeekKeys: new Set() };
  let selectedEntryId = null;

  let currentLOD = null;
  function lodForRadius(_r) {
    // Pass 03: month is the primary unit; weeks/days live inside the modal,
    // not the 3D scene. One building per month, always.
    return LOD.MONTH;
  }
  function ensureLOD() {
    const next = lodForRadius(camState.radius);
    if (next === currentLOD) return;
    currentLOD = next;
    const rows = next === LOD.MONTH ? 12 : next === LOD.WEEK ? 53 : 366;
    buildGhostGrid(rows);
    buildEntryPrismsForLOD(next);
    rebuildRowLabels(next);
    applyFiltersToPrisms();
    applySelectionToPrisms();
  }

  // ─── INTERACTION: pointer ────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoveredPrism = null;
  let isDragging = false;
  let dragStart = { x: 0, y: 0, az: 0, pol: 0 };
  let dragMoved = false;

  function pickPrism(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    // Procedural prism segments (visible cluster buildings).
    const procMeshes = entryPrisms
      .filter(p => p.group?.visible !== false)
      .flatMap(p => (p.segments || []).map(s => s.mesh));
    // Custom model meshes (hospital + future hero buildings). The hidden
    // prism that owns the model stores a `customModelObj` reference, so
    // a hit on any descendant mesh maps back to the prism whose entries
    // the tooltip should show.
    const customMeshes = [];
    for (const p of entryPrisms) {
      if (!p.customModelObj) continue;
      p.customModelObj.traverse(n => { if (n.isMesh && n.visible) customMeshes.push(n); });
    }
    const hits = raycaster.intersectObjects([...procMeshes, ...customMeshes], false);
    if (!hits.length) return null;
    const hitMesh = hits[0].object;
    // Direct segment hit?
    const procPrism = entryPrisms.find(p => (p.segments || []).some(s => s.mesh === hitMesh));
    if (procPrism) return procPrism;
    // Custom-model hit — walk up to find which prism owns it.
    let node = hitMesh;
    while (node) {
      const owner = entryPrisms.find(p => p.customModelObj === node);
      if (owner) return owner;
      node = node.parent;
    }
    return null;
  }

  function setHovered(prism, event) {
    if (hoveredPrism === prism) return;
    if (hoveredPrism) {
      // No scale change — only edge + emissive
      for (const seg of hoveredPrism.segments || []) {
        seg.mesh.material.emissiveIntensity = hoveredPrism.baseEmissive || 0.02;
        if (seg.edge) seg.edge.material.opacity = 0.32;
      }
    }
    hoveredPrism = prism;
    if (hoveredPrism) {
      // Glow edges + bump emissive only — no transform, no jump
      for (const seg of hoveredPrism.segments || []) {
        seg.mesh.material.emissiveIntensity = 0.08;
        if (seg.edge) seg.edge.material.opacity = 0.95;
      }
      showTerrainTooltip(hoveredPrism, event);
      const wk = hoveredPrism.entries[0]?.weekKey || hoveredPrism.cellKey;
      if (onHover) onHover(event, wk);
      renderer.domElement.style.cursor = "pointer";
      scheduleRender();
    } else {
      hideTerrainTooltip();
      renderer.domElement.style.cursor = "grab";
      if (onLeave) onLeave();
      scheduleRender();
    }
  }

  let lastDragEvent = { x: 0, y: 0, time: 0 };
  let dragMode = "orbit"; // "orbit" | "pan"
  const _panRight = new THREE.Vector3();
  const _panUp = new THREE.Vector3();
  const _panForward = new THREE.Vector3();

  renderer.domElement.addEventListener("pointerdown", (e) => {
    isDragging = true;
    dragMoved = false;
    // Left-drag = ORBIT (3D-tool standard). Pan requires explicit intent:
    // middle-click, right-click, Alt+drag, or Shift+drag. Left-click pan
    // was sending users into empty void by accident.
    const isPanGesture = e.button === 1 || e.button === 2 || e.shiftKey || e.altKey;
    dragMode = isPanGesture ? "pan" : "orbit";
    dragStart = {
      x: e.clientX,
      y: e.clientY,
      az: camState.azimuth,
      pol: camState.polar,
      tx: camTarget.x,
      ty: camTarget.y,
      tz: camTarget.z,
    };
    lastDragEvent = { x: e.clientX, y: e.clientY, time: performance.now() };
    dragVelocity = { az: 0, pol: 0 };
    if (dampingRaf) { cancelAnimationFrame(dampingRaf); dampingRaf = null; }
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = dragMode === "pan" ? "move" : "grabbing";
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;

      if (dragMode === "pan") {
        // Pan along the horizontal (XZ) plane: drag right pans content right (target moves left),
        // drag down pans into the scene (target moves forward along camera's projected forward).
        // Slowed for telephoto: small mouse motion shouldn't fling the model.
        // Radius is ~3× larger than old wide-angle setup, so coefficient gets ~10× smaller.
        const panScale = camState.radius * 0.00035;
        camera.getWorldDirection(_panForward);
        _panForward.y = 0;
        if (_panForward.lengthSq() < 1e-6) _panForward.set(0, 0, -1);
        _panForward.normalize();
        _panRight.crossVectors(_panForward, new THREE.Vector3(0, 1, 0)).normalize();

        // Tight pan limits: keep the cluster footprint within view at all times.
        // In CLUSTER_MODE the entire scene lives inside the plinth, so panning
        // beyond PLINTH_RADIUS makes no sense and leaves the user in black void.
        const panLimit = CLUSTER_MODE ? PLINTH_RADIUS * 0.8 : gridWidth * 0.8;
        const panLimitZ = CLUSTER_MODE ? PLINTH_RADIUS * 0.8 : gridDepth * 1.2;
        camTarget.x = clamp(
          dragStart.tx - _panRight.x * dx * panScale + _panForward.x * dy * panScale,
          -panLimit, panLimit,
        );
        camTarget.z = clamp(
          dragStart.tz - _panRight.z * dx * panScale + _panForward.z * dy * panScale,
          -panLimitZ, panLimitZ,
        );
        camTarget.y = 1.8; // keep target at near-ground level
        applyCamera();
        scheduleRender();
        return;
      }

      // Telephoto-friendly orbit speed: slow enough to feel weighty
      const newAz = dragStart.az - dx * 0.0016;
      const newPol = Math.max(Math.PI * 0.12, Math.min(Math.PI * 0.55, dragStart.pol - dy * 0.0013));
      const now = performance.now();
      const dt = Math.max(1, now - lastDragEvent.time);
      dragVelocity.az = -(e.clientX - lastDragEvent.x) * 0.0016 / (dt / 16);
      dragVelocity.pol = -(e.clientY - lastDragEvent.y) * 0.0013 / (dt / 16);
      lastDragEvent = { x: e.clientX, y: e.clientY, time: now };
      camState.azimuth = newAz;
      camState.polar = newPol;
      applyCamera();
      scheduleRender();
    } else {
      const p = pickPrism(e);
      setHovered(p, e);
      if (p && onMove) onMove(e);
      scheduleRender();
    }
  });

  // Disable browser context menu so right-drag works as pan
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  renderer.domElement.addEventListener("pointerup", (e) => {
    isDragging = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
    renderer.domElement.style.cursor = hoveredPrism ? "pointer" : "grab";
    if (!dragMoved) {
      // Check year label click first
      const yearHit = pickYearLabel(e);
      if (yearHit != null) {
        zoomToYear(yearHit);
      } else {
        const p = pickPrism(e);
        if (p && onSelectEntry && p.primaryEntryId != null) {
          onSelectEntry(p.primaryEntryId);
        }
      }
    } else {
      startDamping();
    }
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    setHovered(null);
    scheduleRender();
  });

  // Scroll-wheel zoom
  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    camState.radius = Math.max(camState.minRadius, Math.min(camState.maxRadius, camState.radius * factor));
    applyCamera();
    ensureLOD();
    scheduleRender();
  }, { passive: false });

  // ─── YEAR LABEL CLICK → ZOOM TO YEAR ──────────────────────────────
  function pickYearLabel(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(yearLabels.children, false);
    if (!hits.length) return null;
    const sprite = hits[0].object;
    const idx = yearLabels.children.indexOf(sprite);
    return idx >= 0 ? idx : null;
  }
  function zoomToYear(yearIndex) {
    const targetX = xForYearIndex(yearIndex);
    const fitRadius = gridDepth * 2.5; // Telephoto compensation
    animateCameraTo({ x: targetX, y: 0, z: 0, radius: fitRadius, azimuth: 0 }, { duration: 1.0 });
  }

  // ─── PREZI-STYLE FOCUS MODE ──────────────────────────────────────
  // True anchor zoom: hide other prisms, spawn a 3D title billboard
  // next to the focused prism, drop a glowing ground halo beneath it,
  // and shift the scene environment. Restoring removes the anchor content.
  const ENV_MASTER = { fogDensity: 0.0012, fogColor: new THREE.Color(0x050404), exposure: 0.88 };
  const ENV_FOCUS  = { fogDensity: 0.004, fogColor: new THREE.Color(0x0a0908), exposure: 0.98 };
  let focusedPrism = null;
  let envTween = null;
  let anchorGroup = null; // Holds the in-scene anchor content (title plane + ground halo)

  /**
   * makeBackdropPlane — large accent-colored plane with title + subtitle text.
   * Used as a vertical backdrop wall behind the focused building.
   * @param {string} title    — entry title
   * @param {string} subtitle — year · role line
   * @param {string} bgHex    — bucket accent colour (plane background)
   * @param {string} inkHex   — text colour for contrast on the accent
   * @param {number} worldH   — desired height in 3D world units
   */
  function makeBackdropPlane(title, subtitle, bgHex, inkHex, worldH) {
    const w = 4096, h = 2048;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d");

    // Solid accent background
    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, w, h);

    // Title — large, centred, multi-line word-wrap
    ctx.fillStyle = inkHex;
    ctx.font = `700 280px "Inthacity","Instrument Serif", Georgia, serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const maxW = w - 200;
    const words = String(title || "Untitled").split(/\s+/);
    const lines = [];
    let cur = "";
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lineH = 320;
    const titleBlockH = lines.length * lineH;
    // Push title block upward in the canvas so subtitle sits below
    const titleStartY = h * 0.42 - titleBlockH / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], w / 2, titleStartY + i * lineH + lineH / 2);
    }

    // Subtitle — smaller, below title block
    if (subtitle) {
      ctx.font = `400 120px "Cascadia Code","Courier New", monospace`;
      ctx.globalAlpha = 0.7;
      ctx.fillText(subtitle, w / 2, titleStartY + titleBlockH + 120);
      ctx.globalAlpha = 1.0;
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    const aspect = w / h;
    const geom = new THREE.PlaneGeometry(worldH * aspect, worldH);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      depthWrite: true,
      toneMapped: false,   // keep accent colours punchy, bypass ACES
    });
    return new THREE.Mesh(geom, mat);
  }

  function clearAnchorContent() {
    if (anchorGroup) {
      anchorGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      root.remove(anchorGroup);
      anchorGroup = null;
    }
  }

  function buildAnchorContent(prism, selectedEntry) {
    clearAnchorContent();
    if (!prism) return;
    const baseSeg = prism.segments?.[0]?.mesh;
    if (!baseSeg) return;

    const px = baseSeg.position.x;
    const pz = baseSeg.position.z;
    const topY = prism.baseHeight;
    // Use the selected entry's bucket for accent colour so the backdrop
    // matches the category shown in the modal, not just the prism's dominant.
    const entry = selectedEntry || prism.entries[0];
    const entryBucket = entry
      ? bucketForTag(entry.role || (entry.roleTags && entry.roleTags[0]) || "")
      : null;
    const bucket = entryBucket || prism.bucket || ROLE_BUCKETS[ROLE_BUCKETS.length - 1];

    anchorGroup = new THREE.Group();

    // Ground halo — glowing ring on the floor under the prism
    const haloGeom = new THREE.RingGeometry(1.4, 2.6, 64);
    const haloMat = new THREE.MeshBasicMaterial({
      color: bucket.accent || prism.baseColor || "#ffffff",
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(px, 0.05, pz);
    anchorGroup.add(halo);

    // Inner solid disc — bright pad
    const padGeom = new THREE.CircleGeometry(1.3, 48);
    const padMat = new THREE.MeshBasicMaterial({
      color: bucket.accent || prism.baseColor || "#ffffff",
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pad = new THREE.Mesh(padGeom, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(px, 0.06, pz);
    anchorGroup.add(pad);

    // ── Accent backdrop plane — vertical wall behind the building ──
    // Positioned in -Z (behind building from camera at azimuth 0).
    // Height sized to ~1.8× building height so it frames the building
    // like a studio backdrop. Uses the vibrant ROLE_PILLS accent colour.
    const title = entry?.title || "Untitled moment";
    const subtitle = `${entry?.year || ""} · ${entry?.role || "Anchor"}`;
    const backdropH = Math.max(topY * 1.8, 8); // world units tall
    const backdrop = makeBackdropPlane(
      title, subtitle,
      bucket.accent || prism.baseColor,
      bucket.ink || "#FFFFFF",
      backdropH,
    );
    // Place behind building: offset in -Z so camera (at +Z) sees building in front
    const backdropOffset = Math.max(prism.bodyD || 2, 2) * 0.8 + 1.5;
    backdrop.position.set(px, backdropH / 2, pz - backdropOffset);
    backdrop.scale.setScalar(0.001); // start tiny, animate in
    anchorGroup.add(backdrop);

    root.add(anchorGroup);

    // Animate in
    const gsap = window.gsap;
    if (gsap) {
      gsap.to(backdrop.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.8, ease: "power3.out", delay: 0.1,
        onUpdate: () => scheduleRender(),
      });
      gsap.from(halo.scale, { x: 0.1, y: 0.1, z: 0.1, duration: 0.6, ease: "power2.out" });
    } else {
      backdrop.scale.setScalar(1);
    }
  }

  function setSceneFocus(prism, selectedEntry) {
    const gsap = window.gsap;
    focusedPrism = prism;
    const target = prism ? ENV_FOCUS : ENV_MASTER;
    const proxy = { density: scene.fog.density, exposure: renderer.toneMappingExposure };
    if (envTween) envTween.kill();
    if (gsap) {
      envTween = gsap.to(proxy, {
        density: target.fogDensity,
        exposure: target.exposure,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => {
          scene.fog.density = proxy.density;
          renderer.toneMappingExposure = proxy.exposure;
          scene.fog.color.lerp(target.fogColor, 0.08);
          scheduleRender();
        },
      });
    } else {
      scene.fog.density = target.fogDensity;
      scene.fog.color.copy(target.fogColor);
      renderer.toneMappingExposure = target.exposure;
    }

    if (prism) {
      buildAnchorContent(prism, selectedEntry);
    } else {
      clearAnchorContent();
    }

    applyFocusDim();
    scheduleRender();
  }

  function applyFocusDim() {
    const isFocusing = !!focusedPrism;
    // Per-building details (windows/frames/sills/rooftop equipment) live in
    // ROOT-LEVEL InstancedMeshes — not in any prism.group. So toggling group
    // visibility alone leaves these floating in space when buildings hide.
    // Use the per-prism window-range index ranges to selectively zero out
    // matrices for non-focused buildings.
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of entryPrisms) {
      const isFocused = !focusedPrism || focusedPrism === p;
      p.group.visible = isFocusing ? isFocused : true;
      // Custom model objects (hospital, future hero buildings) live on the
      // root, not inside p.group — hide them alongside the procedural prism.
      if (p.customModelObj) {
        p.customModelObj.visible = isFocusing ? isFocused : true;
      }
      const targetEdgeOp = isFocused ? 1.0 : 0.04;
      for (const seg of p.segments || []) {
        if (seg.edge) seg.edge.material.opacity = targetEdgeOp;
      }
      // Toggle the building's window/frame/sill instance matrices.
      if (p.windowRange && windowsInst) {
        for (let i = p.windowRange.start; i < p.windowRange.end; i++) {
          if (isFocused) windowsInst.setMatrixAt(i, p.windowOriginalMatrices[i - p.windowRange.start]);
          else windowsInst.setMatrixAt(i, hiddenMatrix);
        }
        windowsInst.instanceMatrix.needsUpdate = true;
      }
      if (p.frameRange && windowFramesInst) {
        for (let i = p.frameRange.start; i < p.frameRange.end; i++) {
          if (isFocused) windowFramesInst.setMatrixAt(i, p.frameOriginalMatrices[i - p.frameRange.start]);
          else windowFramesInst.setMatrixAt(i, hiddenMatrix);
        }
        windowFramesInst.instanceMatrix.needsUpdate = true;
      }
      if (p.sillRange && windowSillsInst) {
        for (let i = p.sillRange.start; i < p.sillRange.end; i++) {
          if (isFocused) windowSillsInst.setMatrixAt(i, p.sillOriginalMatrices[i - p.sillRange.start]);
          else windowSillsInst.setMatrixAt(i, hiddenMatrix);
        }
        windowSillsInst.instanceMatrix.needsUpdate = true;
      }
      if (p.acRange && rooftopAcInst) {
        for (let i = p.acRange.start; i < p.acRange.end; i++) {
          if (isFocused) rooftopAcInst.setMatrixAt(i, p.acOriginalMatrices[i - p.acRange.start]);
          else rooftopAcInst.setMatrixAt(i, hiddenMatrix);
        }
        rooftopAcInst.instanceMatrix.needsUpdate = true;
      }
      if (p.tankRange && rooftopTankInst) {
        for (let i = p.tankRange.start; i < p.tankRange.end; i++) {
          if (isFocused) rooftopTankInst.setMatrixAt(i, p.tankOriginalMatrices[i - p.tankRange.start]);
          else rooftopTankInst.setMatrixAt(i, hiddenMatrix);
        }
        rooftopTankInst.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ─── SELECTION WIREFRAME RING + TOP LIGHT ────────────────────────
  let selectionRing = null;
  let selectionLight = null;
  function clearSelectionVisuals() {
    if (selectionRing) { selectionRing.parent?.remove(selectionRing); selectionRing.geometry.dispose(); selectionRing.material.dispose(); selectionRing = null; }
    if (selectionLight) { selectionLight.parent?.remove(selectionLight); selectionLight = null; }
  }
  function showSelectionVisuals(prism) {
    clearSelectionVisuals();
    // Bright wireframe wrap
    const cellW = prism.segments[0]?.mesh.geometry.parameters?.width || 1.2;
    const cellD = prism.segments[0]?.mesh.geometry.parameters?.depth || 0.4;
    const totalH = prism.baseHeight;
    const baseSeg = prism.segments[0]?.mesh;
    const px = baseSeg ? baseSeg.position.x : 0;
    const pz = baseSeg ? baseSeg.position.z : 0;

    const wrapGeom = new RoundedBoxGeometry(cellW * 1.12, totalH * 1.04, cellD * 1.12, 1, 0.1);
    const edges = new THREE.EdgesGeometry(wrapGeom);
    selectionRing = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: TOKENS.ink,
      transparent: true,
      opacity: 0.92,
      linewidth: 2,
    }));
    selectionRing.position.set(px, totalH / 2, pz);
    root.add(selectionRing);
    wrapGeom.dispose();

    // Vertical beacon — bright cylinder shooting up from the prism top
    const beaconGeom = new THREE.CylinderGeometry(0.05, 0.05, 25, 8, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: prism.baseColor || "#ffffff",
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    selectionLight = new THREE.Mesh(beaconGeom, beaconMat);
    selectionLight.position.set(px, totalH + 12.5, pz);
    root.add(selectionLight);
  }

  // ─── HTML HOVER TOOLTIP (screen-space projection) ────────────────
  const tooltipEl = document.getElementById("tooltip");
  const projVec = new THREE.Vector3();
  function showTerrainTooltip(prism, event) {
    if (!tooltipEl || !prism) return;
    const entry = prism.entries[0];
    if (!entry) return;
    const tags = prism.entries.flatMap(e => e.tags || []).slice(0, 4);
    const tagPills = tags.map(t => `<span class="pill" style="font-size:11px">${t}</span>`).join(" ");
    const dateStr = entry.date || `${entry.year || ""}${entry.month ? "-" + String(entry.month).padStart(2, "0") : ""}`;
    tooltipEl.innerHTML = `<strong>${entry.title || "Untitled"}</strong>
      <span>${dateStr} · ${prism.entries.length} moment${prism.entries.length === 1 ? "" : "s"}</span><br>${tagPills}`;
    // Project prism top to screen coords. If a custom model has replaced
    // this prism, project the model's bounding-box top instead so the
    // tooltip floats above the actual visible building.
    if (prism.customModelObj) {
      const box = new THREE.Box3().setFromObject(prism.customModelObj);
      const center = new THREE.Vector3(); box.getCenter(center);
      projVec.set(center.x, box.max.y + 0.4, center.z);
    } else {
      const baseSeg = prism.segments?.[0]?.mesh;
      const px = baseSeg ? baseSeg.position.x : 0;
      const pz = baseSeg ? baseSeg.position.z : 0;
      projVec.set(px, prism.baseHeight + 0.5, pz);
    }
    projVec.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const sx = (projVec.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-projVec.y * 0.5 + 0.5) * rect.height + rect.top;
    tooltipEl.style.left = `${Math.min(window.innerWidth - 300, sx + 14)}px`;
    tooltipEl.style.top = `${Math.min(window.innerHeight - 130, sy - 40)}px`;
    tooltipEl.style.display = "block";
  }
  function hideTerrainTooltip() {
    if (tooltipEl) tooltipEl.style.display = "none";
  }

  // ─── FILTER / SELECTION STATE ─────────────────────────────────────
  // Pass 09: GSAP tweens were unreliable on MeshPhysicalMaterial.opacity
  // in this scene (the tween created but never advanced — likely the
  // many parallel tweens from the year-window cascade interfered with
  // gsap's internal property table). Replaced with a tiny RAF-driven
  // tween helper that just walks a value from current → target over
  // `duration` ms with easeOutCubic. Keys are weak-ref'd by object
  // identity in `_matTweens` so a fresh call kills the in-flight tween.
  // Per-property tween table on each material — opacity + emissive tweens
  // on the same material don't kill each other (each property has its own
  // id slot).
  const TWEEN_BAG = Symbol('matTweens');
  function tweenMatProp(m, prop, target, duration = 600) {
    const startVal = m[prop];
    if (Math.abs(startVal - target) < 0.001) return;
    if (!m[TWEEN_BAG]) m[TWEEN_BAG] = {};
    const id = (Math.random() * 1e9) | 0;
    m[TWEEN_BAG][prop] = id;
    const startT = performance.now();
    function step() {
      if (m[TWEEN_BAG][prop] !== id) return; // killed by newer tween on SAME prop
      const t = Math.min(1, (performance.now() - startT) / duration);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      m[prop] = startVal + (target - startVal) * ease;
      scheduleRender();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function applyFiltersToPrisms() {
    // Tint lane markings to the active role color (only meaningful when
    // chronological road exists — null in CLUSTER_MODE).
    if (laneMat) {
      if (filterState.roleKey && filterState.roleKey !== "all") {
        const sanitizedKey = filterState.roleKey.toLowerCase().replace(/[^a-z]/g, "");
        const bucket = ROLE_BUCKETS.find(b => b.key.toLowerCase().replace(/[^a-z]/g, "") === sanitizedKey);
        if (bucket) {
          laneMat.color.set(bucket.color);
          laneMat.emissive.set(bucket.color);
          laneMat.emissiveIntensity = 0.5;
        }
      } else {
        laneMat.color.set("#FFD66B");
        laneMat.emissive.set("#FFB85C");
        laneMat.emissiveIntensity = 0.18;
      }
    }

    const gsap = window.gsap;

    // Custom models — fade them in lock-step with the role/search filter
    // by checking if their representative entry's weekKey matches.
    for (const child of root.children) {
      const cfg = child.userData?.customModelCfg;
      if (!cfg) continue;
      // For custom models, derive a synthetic weekKey from year so it
      // can match against filterState.matchingWeekKeys. Fall back to "matches"
      // if no filter is active.
      const cmMatches = !filterState.hasFilter ||
        [...(filterState.matchingWeekKeys || new Set())].some(wk => wk?.startsWith(String(cfg.year)));
      const cmTarget = cmMatches ? 1.0 : 0.10;
      child.traverse((obj) => {
        if (!obj.material) return;
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of list) {
          if (!m.transparent) {
            m.transparent = true;
            m.needsUpdate = true;
          }
          m.depthWrite = cmMatches;
          tweenMatProp(m, 'opacity', cmTarget, 600);
        }
      });
    }

    for (const p of entryPrisms) {
      const wk = p.entries[0]?.weekKey;
      const matches = !filterState.hasFilter || filterState.matchingWeekKeys.has(wk);
      // Search isolates: hide non-matching prisms entirely
      if (filterState.isolate && !matches) {
        p.group.visible = false;
        continue;
      }
      p.group.visible = true;

      // Same opacity-fade animation as the Year Window slider:
      // matching = full opacity + emissive; non-matching = ghosted out.
      const targetOpacity = matches ? 1.0 : 0.08;
      const targetEmissive = matches ? (p.baseEmissive || 0.04) : 0.0;
      const mats = [];
      p.group.traverse((obj) => {
        if (obj.material) {
          const list = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of list) {
            if (!m.transparent) {
              m.transparent = true;
              m.needsUpdate = true;
            }
            m.depthWrite = matches;
            mats.push(m);
          }
        }
      });
      for (const m of mats) {
        tweenMatProp(m, 'opacity', targetOpacity, 600);
        if (m.emissive && p.baseEmissive !== undefined) {
          tweenMatProp(m, 'emissiveIntensity', targetEmissive, 600);
        }
      }
      for (const seg of p.segments || []) {
        if (seg.edge) {
          tweenMatProp(seg.edge.material, 'opacity', matches ? 0.32 : 0.02, 600);
        }
      }
    }
  }
  function applySelectionToPrisms() {
    clearSelectionVisuals();
    for (const p of entryPrisms) {
      const sel = selectedEntryId != null && p.entries.some(e => e.id === selectedEntryId);
      if (sel) {
        for (const seg of p.segments || []) {
          seg.mesh.material.emissiveIntensity = 0.12;
          if (seg.edge) seg.edge.material.opacity = 1.0;
        }
        showSelectionVisuals(p);
      } else {
        for (const seg of p.segments || []) {
          seg.mesh.material.emissiveIntensity = p.baseEmissive || 0.02;
          if (seg.edge) seg.edge.material.opacity = 0.32;
        }
      }
    }
  }

  // ─── RENDER LOOP (on demand) ─────────────────────────────────────
  // Note: `needsRender` and `scheduleRender` are hoisted earlier in this
  // function (right after composer init) so cached-EXR sync callbacks
  // don't TDZ-throw when calling scheduleRender.
  let running = true;
  let animTime = 0;
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);

    animTime += 0.016;

    for (const photon of photons) {
      const d = photon.userData;
      // Photons flow along the main path spline
      // T oscillates between 0 and 1 slowly
      const t = (Math.sin(animTime * d.speed * 0.1 + d.phase) * 0.5 + 0.5);
      const pt = mainPathCurve.getPointAt(t);
      // Add local noise/drift
      photon.position.set(
        pt.x + Math.sin(animTime * d.speed + d.phase) * d.drift,
        d.lift + pt.y + Math.sin(animTime * d.speed * 1.7 + d.phase) * 0.15,
        pt.z + Math.cos(animTime * d.speed * 1.25 + d.phase) * d.drift,
      );
    }

    vegetation.rotation.y = Math.sin(animTime * 0.12) * 0.003;

    // Anchor backdrop is a fixed vertical plane — no billboard face-camera needed.

    // Render every frame while the user is dragging — otherwise pointermove
    // events that fall between RAF frames leave stale framebuffer content
    // and the user sees visible flicker. This was the "click-and-drag flicker"
    // bug: scheduleRender() only fires on pointermove, but the browser
    // composites at 60Hz regardless, so any frame without an event = visible jitter.
    if (needsRender || isDragging || window.gsap?.isTweening(camTarget) || window.gsap?.isTweening(camState) || dampingRaf) {
      composer.render();
      needsRender = false;
    }
  }
  requestAnimationFrame(loop);

  // ─── RESIZE ──────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  function resize() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    scheduleRender();
  }
  resize();
  ensureLOD();

  // Debug-only: expose scene to window for inspection
  if (new URLSearchParams(window.location.search).has('cam')) {
    window.__scene = scene;
    window.__root = root;
    window.__camera = camera;
    window.__THREE = THREE;
    window.__entryPrisms = entryPrisms;
  }

  // ─── CUSTOM MODELS (Pass 07) ──────────────────────────────────────
  // Hero buildings supplied as OBJ/GLB files, placed at specific cluster
  // positions to showcase actual work (movie billboards, brand signage, etc.)
  // Each entry hides the procedural prism it's replacing (by entryId).
  const customModels = [
    {
      id: 'hospital-1991',
      year: 1991,
      objPath: '/public/models/hospital-1991/Hospital_Building.obj',
      mtlPath: '/public/models/hospital-1991/Hospital_Building.mtl',
      // Transform from Adobe Dimensions session.
      // Dimensions cm → Three.js m (÷100). OBJ vertices are in cm, so scale
      // 0.15 in Dimensions = scale 0.0015 in Three.js metres.
      // Pivot is Bottom in Dimensions — we'll compute a Y offset from the
      // model's bounding box after load so the bottom sits at position.y.
      position: [1.632, 0, 9.184],
      rotation: [Math.PI / 2, -Math.PI, -Math.PI / 2],
      scale: 0.0015,
      pivotBottom: true,
      // Signage illumination (emissive boost for night scene)
      illuminateMaterials: ['Hospital_buildings_signboard'],
      illuminateGroups:   [/signboard/i],
      illuminateColor: '#FFD080',
      illuminateIntensity: 1.8,
      // Optional: hide the procedural prism for this entry.
      replaceEntryId: 1,
    },
  ];

  async function loadCustomModels() {
    if (!customModels.length) return;
    if (new URLSearchParams(window.location.search).has('nohospital')) return;
    let OBJLoader, MTLLoader;
    try {
      ({ OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js"));
      ({ MTLLoader } = await import("three/examples/jsm/loaders/MTLLoader.js"));
    } catch (e) {
      console.error("Custom model loaders unavailable:", e);
      return;
    }
    for (const cfg of customModels) {
      try {
        const mtlLoader = new MTLLoader();
        const dir = cfg.mtlPath.replace(/[^/]*$/, '');
        mtlLoader.setPath(dir);
        const mtlFile = cfg.mtlPath.split('/').pop();
        const materials = await new Promise((res, rej) =>
          mtlLoader.load(mtlFile, res, undefined, rej)
        );
        materials.preload();

        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        const obj = await new Promise((res, rej) =>
          objLoader.load(cfg.objPath, res, undefined, rej)
        );

        obj.name = `custom_${cfg.id}`;
        // Stash config on the object so applyYearWindow can find + filter it
        // by year (matches the entry-level behaviour of procedural prisms).
        obj.userData.customModelCfg = cfg;
        obj.userData.year = cfg.year;
        obj.userData.replaceEntryId = cfg.replaceEntryId;
        obj.rotation.set(...cfg.rotation);
        obj.scale.setScalar(cfg.scale);
        // Apply rotation/scale first, then compute bounding box for pivot.
        obj.updateMatrixWorld(true);
        const preBox = new THREE.Box3().setFromObject(obj);
        const preSize = new THREE.Vector3(); preBox.getSize(preSize);
        const preCenter = new THREE.Vector3(); preBox.getCenter(preCenter);
        console.log(`[custom-model] ${cfg.id} pre-position size:`, preSize, 'center:', preCenter, 'min:', preBox.min, 'max:', preBox.max);

        // Position the model. If pivotBottom, offset Y so the model's bottom
        // (after rotation+scale) sits at position.y.
        if (cfg.pivotBottom) {
          obj.position.set(
            cfg.position[0] - preCenter.x,
            cfg.position[1] - preBox.min.y,
            cfg.position[2] - preCenter.z,
          );
        } else {
          obj.position.set(...cfg.position);
        }

        // Walk the loaded model: convert to MeshStandardMaterial so it responds
        // to the night-scene PBR lighting (softbox, ambient, env map), enable
        // shadows, and boost emissive on signage.
        const illumColor = new THREE.Color(cfg.illuminateColor || '#FFE0A0');
        const illumIntensity = cfg.illuminateIntensity ?? 1.5;
        obj.traverse((node) => {
          if (!node.isMesh) return;
          // Pass 08h: re-enable shadows. With the tightened shadow camera
          // frustum + sharper radius, the old jitter issue is resolved and
          // the hospital needs to cast a defined shadow on the plinth to
          // ground it visually (matching Dimensions ray-trace output).
          node.castShadow = true;
          node.receiveShadow = true;
          // Force-render geometry without depth-sorting artifacts
          node.renderOrder = 2;
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          const newMats = mats.map((m) => {
            if (!m) return m;
            // Only treat as transparent if opacity is meaningfully below 1 —
            // MTL files often set d=0.69 for glass but Three.js treats anything
            // <0.99 as transparent, which causes ugly sorting flicker on
            // dense building interiors. We'd rather render glass as solid.
            const isTrueGlass = m.opacity != null && m.opacity < 0.5;
            // Baseline emissive prevents the hospital from rendering as a
            // black silhouette when facing away from the softbox light.
            // The night scene's ambient is too low to lift plain diffuse —
            // we add a tiny self-glow proportional to the material's diffuse
            // colour so walls always have at least some visible value.
            const baseColor = m.color ? m.color.clone() : new THREE.Color(0xCCCCCC);
            const std = new THREE.MeshStandardMaterial({
              name: m.name,
              color: baseColor,
              roughness: 0.78,
              metalness: 0.04,
              transparent: isTrueGlass,
              opacity: isTrueGlass ? m.opacity : 1.0,
              depthWrite: !isTrueGlass,
              // Pass 08b: DoubleSide so Kitbash arch models with thin walls
              // and back-facing geometry don't render hollow. With HDRI
              // lighting + low ambient, interior surfaces stay subtle and
              // give the model proper visual mass.
              side: THREE.DoubleSide,
              // ALWAYS drop the .map — the MTL file references JPG textures
              // that aren't shipped with the model. Three.js creates Texture
              // objects but their images never load, so the sampler returns
              // (0,0,0,0) and multiplies the diffuse to pure BLACK. This was
              // the "black mask" bug the user reported. Plain diffuse colour
              // works fine for the night scene.
              map: null,
              polygonOffset: true,
              polygonOffsetFactor: 1,
              polygonOffsetUnits: 1,
              // Pass 08: HDRI handles all illumination. No more emissive
              // baseline hack — pure PBR response.
              emissiveIntensity: 0,
            });
            // Signage illumination: by source MTL material name OR parent group regex.
            const matMatch = (cfg.illuminateMaterials || []).some(n =>
              std.name && std.name.toLowerCase().includes(n.toLowerCase())
            );
            const groupMatch = (cfg.illuminateGroups || []).some(rx =>
              rx.test(node.name || '') || rx.test(node.parent?.name || '')
            );
            if (matMatch || groupMatch) {
              std.emissive = illumColor.clone();
              std.emissiveIntensity = illumIntensity;
              std.color.copy(illumColor).multiplyScalar(0.85);
              console.log(`[custom-model] illuminated mat="${std.name}" on mesh="${node.name}"`);
            }
            return std;
          });
          node.material = Array.isArray(node.material) ? newMats : newMats[0];
        });

        root.add(obj);

        // Final bounding box after positioning
        obj.updateMatrixWorld(true);
        const finalBox = new THREE.Box3().setFromObject(obj);
        const finalSize = new THREE.Vector3(); finalBox.getSize(finalSize);
        console.log(`[custom-model] ${cfg.id} FINAL world bounds: min`, finalBox.min, 'max', finalBox.max, 'size', finalSize);

        // Hide the procedural prism for the replaced entry, if specified.
        if (cfg.replaceEntryId != null) {
          const replaced = entryPrisms.find(p =>
            (p.entries || []).some(e => e.id === cfg.replaceEntryId)
          );
          if (replaced?.group) {
            replaced.group.visible = false;
            // Pass 08l: stash a reference to the custom model on the hidden
            // prism so the picker can hover-hit the model AND surface the
            // replaced entry's tooltip data.
            replaced.customModelObj = obj;
            console.log(`[custom-model] hid procedural prism for entry ${cfg.replaceEntryId} (${replaced.group.name})`);
          }
        }

        console.log(`[custom-model] loaded ${cfg.id}`);
      } catch (e) {
        console.error(`[custom-model] failed to load ${cfg.id}:`, e);
      }
    }
    scheduleRender();
  }
  loadCustomModels();

  // ─── CAMERA DEBUG PANEL ───────────────────────────────────────────
  // Activate with ?cam=1 in the URL. Sliders control all camera params
  // in real-time. Read the values you like, then tell Claude to hardcode them.
  if (new URLSearchParams(window.location.search).has('cam')) {
    const panel = document.createElement('div');
    panel.id = 'camDebug';
    panel.innerHTML = `
      <style>
        #camDebug{position:fixed;bottom:16px;right:16px;z-index:9999;
          background:rgba(10,9,8,0.92);border:1px solid rgba(255,220,140,0.25);
          border-radius:8px;padding:14px 18px;font:12px/1.6 "Cascadia Code",monospace;
          color:#ffe0a0;min-width:280px;backdrop-filter:blur(12px);
          box-shadow:0 4px 24px rgba(0,0,0,0.5)}
        #camDebug label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:4px 0}
        #camDebug input[type=range]{flex:1;accent-color:#FFD080;height:4px}
        #camDebug .val{min-width:58px;text-align:right;color:#fff;font-weight:600}
        #camDebug h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;
          color:rgba(255,220,140,0.5);border-bottom:1px solid rgba(255,220,140,0.15);padding-bottom:6px}
        #camDebug .copy-btn{margin-top:10px;width:100%;padding:6px;background:rgba(255,220,140,0.12);
          border:1px solid rgba(255,220,140,0.3);border-radius:4px;color:#ffe0a0;cursor:pointer;
          font:11px "Cascadia Code",monospace;text-transform:uppercase;letter-spacing:0.05em}
        #camDebug .copy-btn:hover{background:rgba(255,220,140,0.22)}
      </style>
      <h3>Lighting Debug</h3>
      <label>Key Intensity <input type="range" id="dbgKI" min="0" max="8" step="0.05"> <span class="val" id="dbgKIv"></span></label>
      <label>Env Intensity <input type="range" id="dbgEI" min="0" max="2" step="0.02"> <span class="val" id="dbgEIv"></span></label>
      <label>Exposure <input type="range" id="dbgEX" min="0.3" max="2.0" step="0.02"> <span class="val" id="dbgEXv"></span></label>
      <label>Shadow Radius <input type="range" id="dbgSR" min="0" max="12" step="0.5"> <span class="val" id="dbgSRv"></span></label>
      <label>Key X <input type="range" id="dbgKX" min="-50" max="50" step="1"> <span class="val" id="dbgKXv"></span></label>
      <label>Key Y <input type="range" id="dbgKY" min="3" max="80" step="1"> <span class="val" id="dbgKYv"></span></label>
      <label>Key Z <input type="range" id="dbgKZ" min="-50" max="50" step="1"> <span class="val" id="dbgKZv"></span></label>
      <button class="copy-btn" id="dbgCopy">Copy values to clipboard</button>
      <button class="copy-btn" id="dbgExport" style="margin-top:6px">Export cluster as GLB</button>
      <div id="dbgPickInfo" style="margin-top:10px;padding:8px;background:rgba(255,220,140,0.06);border:1px solid rgba(255,220,140,0.15);font-size:10px;color:rgba(255,220,160,0.75);min-height:34px;line-height:1.5">Shift-click a building → name + coords</div>
    `;
    document.body.appendChild(panel);
    const $ki = document.getElementById('dbgKI'), $kiv = document.getElementById('dbgKIv');
    const $ei = document.getElementById('dbgEI'), $eiv = document.getElementById('dbgEIv');
    const $ex = document.getElementById('dbgEX'), $exv = document.getElementById('dbgEXv');
    const $sr = document.getElementById('dbgSR'), $srv = document.getElementById('dbgSRv');
    const $kx = document.getElementById('dbgKX'), $kxv = document.getElementById('dbgKXv');
    const $ky = document.getElementById('dbgKY'), $kyv = document.getElementById('dbgKYv');
    const $kz = document.getElementById('dbgKZ'), $kzv = document.getElementById('dbgKZv');

    function syncFromLights() {
      $ki.value = key.intensity; $kiv.textContent = key.intensity.toFixed(2);
      $ei.value = scene.environmentIntensity; $eiv.textContent = scene.environmentIntensity.toFixed(2);
      $ex.value = renderer.toneMappingExposure; $exv.textContent = renderer.toneMappingExposure.toFixed(2);
      $sr.value = key.shadow.radius; $srv.textContent = key.shadow.radius.toFixed(1);
      $kx.value = key.position.x; $kxv.textContent = key.position.x.toFixed(0);
      $ky.value = key.position.y; $kyv.textContent = key.position.y.toFixed(0);
      $kz.value = key.position.z; $kzv.textContent = key.position.z.toFixed(0);
    }
    syncFromLights();

    $ki.addEventListener('input', () => { key.intensity = +$ki.value; $kiv.textContent = (+$ki.value).toFixed(2); scheduleRender(); });
    $ei.addEventListener('input', () => { scene.environmentIntensity = +$ei.value; $eiv.textContent = (+$ei.value).toFixed(2); scheduleRender(); });
    $ex.addEventListener('input', () => { renderer.toneMappingExposure = +$ex.value; $exv.textContent = (+$ex.value).toFixed(2); scheduleRender(); });
    $sr.addEventListener('input', () => { key.shadow.radius = +$sr.value; $srv.textContent = (+$sr.value).toFixed(1); key.shadow.map?.dispose(); key.shadow.map = null; scheduleRender(); });
    $kx.addEventListener('input', () => { key.position.x = +$kx.value; $kxv.textContent = (+$kx.value).toFixed(0); scheduleRender(); });
    $ky.addEventListener('input', () => { key.position.y = +$ky.value; $kyv.textContent = (+$ky.value).toFixed(0); scheduleRender(); });
    $kz.addEventListener('input', () => { key.position.z = +$kz.value; $kzv.textContent = (+$kz.value).toFixed(0); scheduleRender(); });

    document.getElementById('dbgCopy').addEventListener('click', () => {
      const txt = `keyIntensity: ${key.intensity.toFixed(2)}, envIntensity: ${scene.environmentIntensity.toFixed(2)}, exposure: ${renderer.toneMappingExposure.toFixed(2)}, shadowRadius: ${key.shadow.radius.toFixed(1)}, keyPos: (${key.position.x.toFixed(0)}, ${key.position.y.toFixed(0)}, ${key.position.z.toFixed(0)})`;
      navigator.clipboard.writeText(txt).then(() => {
        document.getElementById('dbgCopy').textContent = 'Copied!';
        setTimeout(() => { document.getElementById('dbgCopy').textContent = 'Copy values to clipboard'; }, 1500);
      });
    });

    document.getElementById('dbgExport').addEventListener('click', async () => {
      const btn = document.getElementById('dbgExport');
      btn.textContent = 'Exporting…';
      try {
        // Name every prism + part so the GLB is readable in Blender / Dimensions.
        // Pattern: building_<year>_<month>_<role>_<cellKey> — sanitised for path safety.
        const safe = (s) => String(s ?? '').replace(/[^a-zA-Z0-9_\-]/g, '_');
        for (const p of entryPrisms) {
          if (!p?.group) continue;
          const yr = p.year ?? 'na';
          const tag = safe(p.dominantTag || 'mixed');
          const key = safe(p.cellKey || '');
          const tier = p.tier ?? 'na';
          const baseName = `building_${yr}_${tag}_tier${tier}_${key}`;
          p.group.name = baseName;
          (p.segments || []).forEach((seg, i) => {
            if (seg?.mesh) seg.mesh.name = `${baseName}__seg${i}`;
          });
          if (p.mesh) p.mesh.name = `${baseName}__main`;
          if (p.glow) p.glow.name = `${baseName}__glow`;
        }
        const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
        const exporter = new GLTFExporter();
        exporter.parse(
          root,
          (result) => {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cluster-${Date.now()}.glb`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            btn.textContent = 'Exported!';
            setTimeout(() => { btn.textContent = 'Export cluster as GLB'; }, 1500);
          },
          (err) => {
            console.error('GLB export failed:', err);
            btn.textContent = 'Export failed (see console)';
            setTimeout(() => { btn.textContent = 'Export cluster as GLB'; }, 2500);
          },
          { binary: true, onlyVisible: true, embedImages: true }
        );
      } catch (e) {
        console.error('Loading GLTFExporter failed:', e);
        btn.textContent = 'Loader failed';
        setTimeout(() => { btn.textContent = 'Export cluster as GLB'; }, 2500);
      }
    });

    // Shift-click a building → show its name + world coordinates + scale
    // so the user can place a matching GLB in Dimensions / Blender at the same spot.
    const pickRay = new THREE.Raycaster();
    const pickMouse = new THREE.Vector2();
    const info = document.getElementById('dbgPickInfo');
    renderer.domElement.addEventListener('pointerdown', (ev) => {
      if (!ev.shiftKey) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pickMouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pickMouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      pickRay.setFromCamera(pickMouse, camera);
      const meshes = entryPrisms.flatMap(p => (p.segments || []).map(s => s.mesh).filter(Boolean));
      const hits = pickRay.intersectObjects(meshes, false);
      if (!hits.length) { info.textContent = 'No building hit — try shift-clicking a window'; return; }
      const hit = hits[0].object;
      const prism = entryPrisms.find(p => (p.segments || []).some(s => s.mesh === hit));
      if (!prism) { info.textContent = 'Hit untagged mesh'; return; }
      const box = new THREE.Box3().setFromObject(prism.group);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      const footPos = new THREE.Vector3(center.x, box.min.y, center.z);
      const payload = `name: ${prism.group.name || '(unnamed)'}\nyear: ${prism.year}  tier: ${prism.tier}  role: ${prism.dominantTag}\nfoot pos: (${footPos.x.toFixed(2)}, ${footPos.y.toFixed(2)}, ${footPos.z.toFixed(2)})\ncenter: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})\nsize: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}\nentries: ${prism.entries?.length || 0}  primary: ${prism.primaryEntryId ?? '—'}`;
      info.textContent = payload;
      info.style.whiteSpace = 'pre';
      info.style.fontFamily = '"Cascadia Code", monospace';
      navigator.clipboard.writeText(payload).catch(() => {});
    });
  }

  return {
    selectEntry(entry, opts = {}) {
      const wasSelected = selectedEntryId != null;
      selectedEntryId = entry?.id ?? null;
      if (entry == null) {
        setSceneFocus(null);
        applySelectionToPrisms();
        scheduleRender();
        return;
      }
      if (opts.focus && entry?.year) {
        const yi = years.indexOf(Number(entry.year));
        if (yi >= 0) {
          const prism = entryPrisms.find((p) => p.entries.some((e) => e.id === entry.id));
          const baseX = prism ? (prism.segments[0]?.mesh.position.x ?? xForYearIndex(yi)) : xForYearIndex(yi);
          const baseZ = prism ? (prism.segments[0]?.mesh.position.z ?? 0) : 0;
          // ── Dynamic camera tilt ──────────────────────────────────
          // Map building height → tilt angle (9°–45° from horizontal).
          // Tall buildings → shallower tilt; short → steeper.
          const bh = prism ? prism.baseHeight : 5;
          const minH = 3, maxH = 14;
          const MIN_TILT = 12, MAX_TILT = 32; // degrees from horizontal
          const ht = Math.max(0, Math.min(1, (bh - minH) / (maxH - minH)));
          const tiltDeg = MAX_TILT - ht * (MAX_TILT - MIN_TILT);
          const dynamicPolar = Math.PI * (0.5 - tiltDeg / 180);

          // Target Y aims at the lower-middle of the combined composition
          // (building + accent backdrop behind it).
          const backdropH = Math.max(bh * 1.8, 8);
          const targetY = backdropH * 0.30;
          const focusRadius = 65 + bh * 1.2;
          // Shift camTarget right so the building lands in the LEFT third of
          // viewport (modal occupies the right 67%).
          const lateralShift = focusRadius * 0.12;
          animateCameraTo({
            x: baseX + lateralShift, y: targetY, z: baseZ,
            radius: focusRadius,
            polar: dynamicPolar,
            azimuth: 0,
          }, { duration: wasSelected ? 0.8 : 1.1, ease: "power3.inOut" });
          setSceneFocus(prism, entry);
        }
      }
      applySelectionToPrisms();
      scheduleRender();
    },
    resetView() {
      selectedEntryId = null;
      setSceneFocus(null);
      applySelectionToPrisms();
      const gsap = window.gsap;
      // Reset matches the cluster-mode default camera in Pass 05.
      const targetY = CLUSTER_MODE ? 8.3 : 0.5;
      const targetR = CLUSTER_MODE ? 123.5 : gridWidth * 1.65;
      const targetPolar = CLUSTER_MODE ? Math.PI * 0.516 : Math.PI * 0.34;
      if (gsap) {
        animateCameraTo({
          x: 0, y: targetY, z: 0,
          radius: targetR,
          azimuth: 0.30,
          polar: targetPolar,
        }, { duration: 0.9, ease: "power3.inOut" });
      } else {
        camState.radius = targetR;
        camState.azimuth = 0.30;
        camState.polar = targetPolar;
        camTarget.set(0, targetY, 0);
        applyCamera();
        ensureLOD();
      }
      scheduleRender();
    },
    selectWeek(weekKey, opts = {}) {
      const y = Number(weekKey?.slice(0, 4));
      if (opts.focus && !Number.isNaN(y)) {
        const yi = years.indexOf(y);
        if (yi >= 0) {
          animateCameraTo({ x: xForYearIndex(yi) }, { duration: 0.7 });
        }
      }
    },
    updateFilters(next) {
      filterState = {
        hasFilter: Boolean(next?.hasFilter),
        matchingWeekKeys: next?.matchingWeekKeys || new Set(),
        isolate: Boolean(next?.isolate),
        roleKey: next?.roleKey || null,
      };
      applyFiltersToPrisms();
      scheduleRender();
    },
    setZoom(value) {
      const minZoom = 50;
      const maxZoom = 200;
      const t = Math.max(0, Math.min(1, (value - minZoom) / (maxZoom - minZoom)));
      if (CLUSTER_MODE) {
        // Cluster mode: zoom maps to a tight range around the plinth
        const farR  = 240;
        const nearR = PLINTH_RADIUS * 1.0;
        camState.radius = farR - t * (farR - nearR);
      } else {
        camState.radius = camState.maxRadius - t * (camState.maxRadius - camState.minRadius);
      }
      applyCamera();
      ensureLOD();
      scheduleRender();
    },
    dispose() {
      running = false;
      ro.disconnect();
      if (dampingRaf) cancelAnimationFrame(dampingRaf);
      clearSelectionVisuals();
      hideTerrainTooltip();
      renderer.dispose();
    },
    // Debug: expose prism summary so the slider behavior can be inspected.
    getPrismSummary() {
      return entryPrisms.map(p => ({
        year: p.year, tier: p.tier, key: p.cellKey,
        scaleY: p.group?.scale?.y,
        bodyOpacity: p.segments?.[0]?.mesh?.material?.opacity,
        bodyTrans: p.segments?.[0]?.mesh?.material?.transparent,
      }));
    },
    // ─── Year Window filter (Pass 05) ─────────────────────────────────
    // Out-of-window prisms slow-fade opacity, scale slightly down, and
    // lose their emissive glow. In-window prisms get a small emissive lift.
    // Animation is GSAP-tweened so slider drags feel weighty, not poppy.
    applyYearWindow(startYear, endYear) {
      const gsap = window.gsap;
      const start = Math.min(startYear, endYear);
      const end = Math.max(startYear, endYear);
      // Custom models — fade with the year window the same way procedural
      // prisms do, so the hospital fades when 1991 is outside the window.
      for (const child of root.children) {
        const cfg = child.userData?.customModelCfg;
        if (!cfg) continue;
        const y = cfg.year ?? 0;
        const inWindow = y >= start && y <= end;
        const targetOpacity = inWindow ? 1.0 : 0.10;
        child.traverse((obj) => {
          if (!obj.material) return;
          const list = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of list) {
            if (!m.transparent) {
              m.transparent = true;
              m.needsUpdate = true;
            }
            m.depthWrite = inWindow;
            if (gsap) {
              gsap.to(m, { opacity: targetOpacity, duration: 0.6, ease: "power2.out", overwrite: true, onUpdate: scheduleRender });
            } else {
              m.opacity = targetOpacity;
            }
          }
        });
      }
      for (const p of entryPrisms) {
        const y = p.year ?? 0;
        const inWindow = y >= start && y <= end;
        const targetOpacity = inWindow ? 1.0 : 0.08;
        const targetEmissive = inWindow ? p.baseEmissive : 0.0;
        const mats = [];
        p.group.traverse((obj) => {
          if (obj.material) {
            const list = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of list) {
              if (!m.transparent) {
                m.transparent = true;
                m.needsUpdate = true;
              }
              m.depthWrite = inWindow;
              mats.push(m);
            }
          }
        });
        for (const m of mats) {
          if (gsap) {
            gsap.to(m, {
              opacity: targetOpacity, duration: 0.6, ease: "power2.out", overwrite: true,
              onUpdate: scheduleRender,
            });
            if (m.emissive && p.baseEmissive !== undefined) {
              gsap.to(m, {
                emissiveIntensity: targetEmissive, duration: 0.6, ease: "power2.out", overwrite: true,
                onUpdate: scheduleRender,
              });
            }
          } else {
            m.opacity = targetOpacity;
            if (m.emissive && p.baseEmissive !== undefined) m.emissiveIntensity = targetEmissive;
          }
        }
      }
      scheduleRender();
    },
    // Debug: returns scene-graph stats (geometry tris, rendered tris, instance counts).
    getStats() {
      let geomTris = 0;          // unique geometry triangles (memory footprint)
      let renderedTris = 0;      // tris actually drawn this frame (incl. instances)
      let meshCount = 0;
      let instancedCount = 0;
      let instanceTotal = 0;
      scene.traverse((obj) => {
        if (!obj.isMesh && !obj.isInstancedMesh && !obj.isLineSegments) return;
        const geo = obj.geometry;
        if (!geo) return;
        const tri = geo.index
          ? geo.index.count / 3
          : (geo.attributes.position ? geo.attributes.position.count / 3 : 0);
        geomTris += tri;
        if (obj.isInstancedMesh) {
          instancedCount++;
          instanceTotal += obj.count;
          renderedTris += tri * obj.count;
        } else {
          meshCount++;
          renderedTris += tri;
        }
      });
      return {
        geomTris: Math.round(geomTris),
        renderedTris: Math.round(renderedTris),
        meshCount,
        instancedCount,
        instanceTotal,
        rendererInfo: {
          triangles: renderer.info.render.triangles,
          calls: renderer.info.render.calls,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
      };
    },
  };
}
