// Spatial archive view — v3 (transposed grid + semantic zoom)
// Years on X-axis (columns), time-units on Z-axis (rows): months -> weeks -> days
// Glass prism aesthetic per Design doc.txt

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Tilt-shift: sharp horizontal band in screen middle, gaussian blur above/below.
// This is the "miniature" illusion — what makes telephoto refs read as a model.
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    bandCenter: { value: 0.58 },   // 0=top, 1=bottom of viewport
    bandWidth: { value: 0.32 },    // sharp zone height (in UV units)
    blurStrength: { value: 2.4 },  // max blur radius in pixels at extremes
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float bandCenter;
    uniform float bandWidth;
    uniform float blurStrength;
    varying vec2 vUv;

    void main() {
      float dist = abs(vUv.y - bandCenter) - bandWidth * 0.5;
      float t = clamp(dist / max(0.0001, 1.0 - bandWidth * 0.5), 0.0, 1.0);
      t = pow(t, 1.35);
      vec2 px = vec2(blurStrength * t) / resolution;

      vec4 sum = vec4(0.0);
      sum += texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px) * 0.0625;
      sum += texture2D(tDiffuse, vUv + vec2( 0.0, -1.0) * px) * 0.125;
      sum += texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * px) * 0.0625;
      sum += texture2D(tDiffuse, vUv + vec2(-1.0,  0.0) * px) * 0.125;
      sum += texture2D(tDiffuse, vUv + vec2( 0.0,  0.0) * px) * 0.25;
      sum += texture2D(tDiffuse, vUv + vec2( 1.0,  0.0) * px) * 0.125;
      sum += texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * px) * 0.0625;
      sum += texture2D(tDiffuse, vUv + vec2( 0.0,  1.0) * px) * 0.125;
      sum += texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * px) * 0.0625;
      gl_FragColor = sum;
    }
  `,
};

const TOKENS = {
  room: "#F7F4EC",
  paper: "#EDE4CE",
  ink: "#1A1714",
  acid: "#E1FA3C",
  signal: "#F23B21",
  gold: "#C8923B",
  leaf: "#5B8C3E",
  leafHi: "#7FB04A",
  sun: "#FFF3D6",
  glassWhite: "#FFFDF6",
  graphite: "#4A514A",
};

// Role category buckets — match the filter pills (Photography, Design, AV, Branding, IT)
// All tags map into one of these 5 buckets + "Other"
const ROLE_BUCKETS = [
  { key: "Photography", color: TOKENS.glassWhite, tags: ["Photographer", "Photography"] },
  { key: "Design",      color: TOKENS.acid, tags: ["Designer", "Design", "Graphic", "Animation"] },
  { key: "AV",          color: TOKENS.signal, tags: ["Film", "Cinematographer", "MusicVideo", "Documentary"] },
  { key: "Branding",    color: TOKENS.gold, tags: ["Studio", "Strategy", "Founder", "Leadership", "Corporate", "Earnings", "Grant", "Job", "Milestone"] },
  { key: "IT",          color: TOKENS.graphite, tags: ["Tech", "Web3"] },
  { key: "Other",       color: "#D8D0BE", tags: [] },
];

function bucketForTag(tag) {
  const t = String(tag || "").toLowerCase();
  for (const b of ROLE_BUCKETS) {
    if (b.tags.some((m) => t.includes(m.toLowerCase()))) return b;
  }
  return ROLE_BUCKETS[ROLE_BUCKETS.length - 1];
}

// Legacy single-color lookup retained for selection/hover (returns bucket color)
const TAG_COLORS = ROLE_BUCKETS.reduce((acc, b) => {
  b.tags.forEach((t) => { acc[t] = b.color; });
  return acc;
}, { Milestone: TOKENS.gold, ThroughLine: TOKENS.signal });

const PRIORITY_TAGS = [
  "Milestone", "ThroughLine", "Founder", "Film", "Cinematographer",
  "Designer", "Photographer", "Web3", "Studio", "AIESEC",
  "Strategy", "Leadership", "Animation", "Documentary", "MusicVideo",
  "Corporate", "Tech", "Travel", "Earnings", "Job",
  "Education", "Teacher", "Volunteer", "Personal",
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
  scene.background = new THREE.Color(TOKENS.room);
  scene.fog = new THREE.FogExp2(0xf7f4ec, 0.006);

  // Telephoto Tilt-Shift focal view (12 FOV)
  const camera = new THREE.PerspectiveCamera(12, 1, 0.1, gridWidth * 16);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color(TOKENS.room), 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  // Post-processing: subtle bloom (toned down from neon-blast)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom: gentle, threshold high so only emissives (windows, roads) bloom —
  // not the whole bright cream environment.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.14,   // strength
    0.32,   // radius
    0.92,   // threshold — only very bright pixels bloom
  );
  composer.addPass(bloomPass);

  const tiltShiftPass = new ShaderPass(TiltShiftShader);
  tiltShiftPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  composer.addPass(tiltShiftPass);

  // Environment map for glass reflections — RoomEnvironment per design doc
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;

  // ─── LIGHTS ───────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(TOKENS.room, 0.5));
  scene.add(new THREE.HemisphereLight("#fff8e8", "#d7ceb8", 0.48));

  const key = new THREE.DirectionalLight(TOKENS.sun, 1.22);
  key.position.set(-gridWidth * 0.34, 46, 26);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -gridWidth;
  key.shadow.camera.right = gridWidth;
  key.shadow.camera.top = gridDepth;
  key.shadow.camera.bottom = -gridDepth;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 120;
  scene.add(key);

  const fillWarm = new THREE.DirectionalLight("#ffffff", 0.18);
  fillWarm.position.set(gridWidth * 0.5, 24, gridDepth * 0.7);
  scene.add(fillWarm);

  const fillCool = new THREE.DirectionalLight("#d6e0dc", 0.14);
  fillCool.position.set(gridWidth * 0.5, 20, -gridDepth * 0.4);
  scene.add(fillCool);

  // ─── GROUPS ───────────────────────────────────────────────────────
  const root = new THREE.Group();
  scene.add(root);

  const room = new THREE.Group();
  scene.add(room);

  // Outer floor reads as "void / water" — darker so the cream island plinth
  // pops above it. Stays in the warm palette (no blue), just lower lightness.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth * 4.2, gridDepth * 6.0),
    new THREE.MeshStandardMaterial({
      color: "#BDB39D",
      roughness: 0.94,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.62;
  floor.receiveShadow = true;
  room.add(floor);

  // Subtle "shore" ring — slightly lighter band hugging the plinth so the
  // island feels grounded instead of stamped onto the void.
  const shore = new THREE.Mesh(
    new THREE.RingGeometry(gridDepth * 0.62, gridDepth * 1.05, 64),
    new THREE.MeshStandardMaterial({
      color: "#D6CDB7",
      roughness: 0.95,
      transparent: true,
      opacity: 0.72,
    }),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = -0.44;
  shore.scale.set(gridWidth / gridDepth * 0.95, 1, 1); // stretch along X to match grid
  shore.receiveShadow = true;
  room.add(shore);

  function makeLandscapeTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#eef6f3");
    sky.addColorStop(0.55, TOKENS.room);
    sky.addColorStop(1, "#d9dfc8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = "#cfdac5";
    ctx.beginPath();
    ctx.moveTo(0, 330);
    ctx.bezierCurveTo(180, 250, 280, 350, 430, 292);
    ctx.bezierCurveTo(600, 224, 710, 342, 1024, 252);
    ctx.lineTo(1024, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a8bd96";
    ctx.beginPath();
    ctx.moveTo(0, 410);
    ctx.bezierCurveTo(250, 328, 470, 428, 680, 356);
    ctx.bezierCurveTo(820, 308, 930, 378, 1024, 340);
    ctx.lineTo(1024, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const landscape = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth * 2.3, gridDepth * 1.25),
    new THREE.MeshBasicMaterial({
      map: makeLandscapeTexture(),
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  landscape.position.set(0, 5.1, -gridDepth * 1.36);
  room.add(landscape);

  function makeArchFrame(width, height, thickness, depth, material) {
    const legHeight = height - width * 0.5;
    const outer = new THREE.Shape();
    outer.moveTo(-width / 2, 0);
    outer.lineTo(-width / 2, legHeight);
    outer.absarc(0, legHeight, width / 2, Math.PI, 0, true);
    outer.lineTo(width / 2, 0);
    outer.lineTo(-width / 2, 0);
    const innerW = width - thickness * 2;
    const innerLeg = legHeight - thickness * 0.55;
    const hole = new THREE.Path();
    hole.moveTo(-innerW / 2, 0);
    hole.lineTo(-innerW / 2, innerLeg);
    hole.absarc(0, innerLeg, innerW / 2, Math.PI, 0, true);
    hole.lineTo(innerW / 2, 0);
    hole.lineTo(-innerW / 2, 0);
    outer.holes.push(hole);
    return new THREE.Mesh(
      new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false }),
      material,
    );
  }

  const archMat = new THREE.MeshPhysicalMaterial({
    color: "#fbf8f0",
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.12,
  });
  [-gridWidth * 0.34, 0, gridWidth * 0.34].forEach((x) => {
    const arch = makeArchFrame(gridWidth * 0.36, 7.8, 0.42, 0.36, archMat);
    arch.position.set(x, -0.42, -gridDepth * 1.12);
    arch.castShadow = true;
    arch.receiveShadow = true;
    room.add(arch);
  });

  // The island plinth — slightly larger and a touch taller in Pass 03 so the
  // city reads as sitting on raised landmass rather than a thin sheet.
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(gridWidth * 1.24, 0.52, gridDepth * 1.22),
    new THREE.MeshPhysicalMaterial({
      color: TOKENS.paper,
      roughness: 0.82,
      metalness: 0.02,
      envMapIntensity: 0.16,
    }),
  );
  plinth.position.y = -0.21;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);

  function seeded(index) {
    const n = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // ─── PATHS: timeline spine + era cross-roads ─────────────────────
  // Single straight white road runs the full grid (time = horizontal axis).
  // Perpendicular roads mark unique era boundaries (design.md §6, 11 eras).
  const SPINE_WIDTH = 0.78;
  const SPINE_THICKNESS = 0.04;
  const ERA_START_YEARS = [1991, 2009, 2013, 2015, 2016, 2018, 2022, 2024, 2025, 2026];

  // Glowing emissive road — gentle (over-bright pixels get hard-coded
  // bloomed by the post pass, so emissiveIntensity stays modest).
  const pathMat = new THREE.MeshStandardMaterial({
    color: "#FFF3C8",
    roughness: 0.46,
    metalness: 0.05,
    emissive: "#FFB85C",
    emissiveIntensity: 0.4,
  });
  const crossRoadMat = pathMat.clone();
  crossRoadMat.emissive = new THREE.Color("#FFB85C");
  crossRoadMat.emissiveIntensity = 0.25;

  const spineGeom = new THREE.BoxGeometry(gridWidth * 1.04, SPINE_THICKNESS, SPINE_WIDTH);
  const pathMesh = new THREE.Mesh(spineGeom, pathMat);
  pathMesh.position.set(0, 0.025, 0);
  pathMesh.receiveShadow = true;
  root.add(pathMesh);

  for (const y of ERA_START_YEARS) {
    const yi = years.indexOf(y);
    if (yi < 0) continue;
    const cx = (yi - (yearCount - 1) / 2) * yearStride;
    const crossGeom = new THREE.BoxGeometry(0.38, SPINE_THICKNESS, gridDepth * 0.94);
    const cross = new THREE.Mesh(crossGeom, crossRoadMat);
    cross.position.set(cx, 0.022, 0);
    cross.receiveShadow = true;
    root.add(cross);
  }

  // Photons still need a curve to flow along — straight line, edge to edge.
  const mainPathCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-gridWidth * 0.52, 0.05, 0),
    new THREE.Vector3( 0,                0.05, 0),
    new THREE.Vector3( gridWidth * 0.52, 0.05, 0),
  ]);

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

  const vegetation = new THREE.Group();

  // ─── TREES: 4 archetypes × varied palettes, cluster placement ─────
  // Each archetype is a shape+color pairing baked into its own InstancedMesh.
  // Combined with scale variation and red berry instances on ~30% of trees,
  // the grove reads organic without per-instance vertex colors.
  const TREE_COUNT = 130;
  const treeArchetypes = [
    { geom: new THREE.DodecahedronGeometry(0.24, 1), color: TOKENS.leaf,   yScale: 1.0, rough: 0.86 }, // rounded broadleaf
    { geom: new THREE.IcosahedronGeometry(0.22, 1),  color: TOKENS.leafHi, yScale: 0.92, rough: 0.78 }, // light irregular
    { geom: new THREE.SphereGeometry(0.22, 8, 6),    color: "#7A9D43",     yScale: 0.86, rough: 0.84 }, // oblate olive
    { geom: new THREE.ConeGeometry(0.18, 0.56, 8),   color: "#5E7E38",     yScale: 1.18, rough: 0.82 }, // tall conifer
  ];
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#3B2E22", roughness: 0.92 });
  const trunkGeom = new THREE.CylinderGeometry(0.035, 0.055, 0.34, 5);
  const berryMat = new THREE.MeshStandardMaterial({
    color: "#C7423B",
    roughness: 0.55,
    emissive: "#C7423B",
    emissiveIntensity: 0.05,
  });
  const berryGeom = new THREE.IcosahedronGeometry(0.028, 0);

  // First pass: pick archetype + placement per tree, bucket into groups
  const treeBuckets = treeArchetypes.map(() => []);
  const dummy = new THREE.Object3D();
  const SPINE_CORRIDOR = SPINE_WIDTH * 0.5 + 0.55;
  const cellGrid = new Map(); // crude poisson-ish: at most ~2 trees per ~1×1 cell
  for (let i = 0; i < TREE_COUNT; i++) {
    let x, z, tries = 0, ok = false;
    while (tries++ < 8) {
      const rx = seeded(i * 3 + tries) - 0.5;
      const rz = seeded(i * 5 + tries + 41) - 0.5;
      x = rx * gridWidth * 1.04;
      z = rz * gridDepth * 1.05;
      // Push out of spine corridor (clear the road)
      if (Math.abs(z) < SPINE_CORRIDOR) z = Math.sign(z || 1) * (SPINE_CORRIDOR + seeded(i * 7) * 0.6);
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
      const canopyY = (arch.geom.type === "ConeGeometry" ? 0.5 : 0.38) * t.s;
      dummy.position.set(t.x, canopyY, t.z);
      dummy.scale.set(t.s * 1.18, t.s * arch.yScale * 1.18, t.s * 1.18);
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
    dummy.position.set(t.x, 0.17 * t.s, t.z);
    dummy.scale.set(t.s, t.s, t.s);
    dummy.rotation.set(0, t.rot, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  vegetation.add(trunks);

  // Berries — sprinkle 1–4 on ~30% of trees
  const maxBerries = Math.floor(allTrees.length * 2.4);
  const berries = new THREE.InstancedMesh(berryGeom, berryMat, maxBerries);
  let berryIdx = 0;
  for (let i = 0; i < allTrees.length && berryIdx < maxBerries; i++) {
    if (seeded(i + 511) < 0.7) continue;
    const t = allTrees[i];
    const n = 1 + Math.floor(seeded(i + 611) * 3);
    for (let b = 0; b < n && berryIdx < maxBerries; b++) {
      const bx = t.x + (seeded(i * 7 + b) - 0.5) * 0.34 * t.s;
      const bz = t.z + (seeded(i * 11 + b) - 0.5) * 0.34 * t.s;
      const by = 0.38 * t.s + (seeded(i * 13 + b) - 0.3) * 0.22 * t.s;
      dummy.position.set(bx, by, bz);
      dummy.scale.setScalar(0.7 + seeded(i + b) * 0.6);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      berries.setMatrixAt(berryIdx++, dummy.matrix);
    }
  }
  berries.count = berryIdx;
  berries.instanceMatrix.needsUpdate = true;
  berries.castShadow = false;
  vegetation.add(berries);

  root.add(vegetation);

  const photons = [];
  const photonGeom = new THREE.SphereGeometry(0.055, 16, 12);
  const photonMats = [
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.22,
      roughness: 0.18,
      metalness: 0,
      transmission: 0.8,
      thickness: 0.4,
      ior: 1.3,
      emissive: new THREE.Color(TOKENS.acid),
      emissiveIntensity: 0.018,
    }),
    new THREE.MeshPhysicalMaterial({
      color: TOKENS.acid,
      transparent: true,
      opacity: 0.16,
      roughness: 0.22,
      transmission: 0.72,
      thickness: 0.35,
      emissive: new THREE.Color(TOKENS.acid),
      emissiveIntensity: 0.026,
    }),
    new THREE.MeshPhysicalMaterial({
      color: TOKENS.signal,
      transparent: true,
      opacity: 0.12,
      roughness: 0.26,
      transmission: 0.65,
      thickness: 0.3,
      emissive: new THREE.Color(TOKENS.signal),
      emissiveIntensity: 0.014,
    }),
  ];
  for (let i = 0; i < 84; i++) {
    const mesh = new THREE.Mesh(photonGeom, photonMats[i % photonMats.length]);
    const lane = (seeded(i + 131) - 0.5) * gridDepth * 0.72;
    mesh.userData = {
      phase: seeded(i + 211) * Math.PI * 2,
      speed: 0.08 + seeded(i + 313) * 0.16,
      x0: (seeded(i + 419) - 0.5) * gridWidth * 1.1,
      z0: lane,
      lift: 0.6 + seeded(i + 521) * 2.8,
      drift: 0.25 + seeded(i + 619) * 0.75,
    };
    photons.push(mesh);
    root.add(mesh);
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
    return (rowIndex - (totalRows - 1) / 2) * (gridDepth / totalRows);
  }

  // ─── ENTRY PRISMS ─────────────────────────────────────────────────
  let entryPrisms = []; // {group, mesh, glow, segments[{mesh,edge,bucket}], cellKey, entries, dominantTag, primaryEntryId}
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
    Photography: 0, Design: 1, AV: 2, Branding: 3, IT: 4, Other: 0,
  };
  function makeFacadeMaterial(bucket, buildingHeight, hash) {
    const baseColor = new THREE.Color(bucket.color).multiplyScalar(0.72);
    const mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.58,
      metalness: bucket.key === "Branding" ? 0.18 : 0.06,
      transparent: true,
      opacity: 0.97,
    });
    const roleColorVec = new THREE.Color(bucket.color);
    const accent = new THREE.Color("#FFD9A0"); // warm window glow
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
          vec3 _wallCol = uRoleColor * 0.42;
          vec3 _winCol = uRoleColor;
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
              float _warmth = 0.65 + 0.35 * fhash21(_cell + vec2(7.1, 13.7));
              vec3 _w = uAccent * _warmth;
              diffuseColor.rgb = mix(_w, uRoleColor, 0.22);
              _winE = 0.22 + 0.18 * _warmth;
            } else {
              diffuseColor.rgb = _wallCol;
            }
          } else {
            // top face: solid darker cap
            diffuseColor.rgb = uRoleColor * 0.32;
          }`)
        .replace(`#include <emissivemap_fragment>`, `#include <emissivemap_fragment>
          totalEmissiveRadiance += uAccent * _winE;`);
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
      case "Photography":
        footprint = r < 0.6 ? "wide" : "square";
        podiumOversized = true;
        scaleY = 0.78;
        break;
      case "Design":
        footprint = r < 0.5 ? "tower" : "square";
        spire = r < 0.55;
        scaleY = 1.15;
        break;
      case "AV":
        footprint = r < 0.45 ? "rectangle" : "square";
        setback = r < 0.55;
        scaleY = 1.05;
        break;
      case "Branding":
        footprint = r < 0.65 ? "tower" : "square";
        spire = r < 0.8;
        podiumOversized = r < 0.4;
        scaleY = 1.22;
        break;
      case "IT":
        footprint = "square";
        scaleY = 1.0;
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

  function buildEntryPrismsForLOD(_lod) {
    clearEntryPrisms();
    const rows = 12; // month is the unit, always
    const cellW = (yearStride - cellPad * 2);
    const cellD = (gridDepth / rows) - cellPad * 2;
    const clampRow = (idx, max) => Math.max(0, Math.min(max - 1, idx));

    const groups = [];
    for (const [key, ents] of entriesByMonth) {
      const [yStr, mStr] = key.split("-");
      const y = Number(yStr);
      const m = Number(mStr) || 1;
      const yi = years.indexOf(y);
      if (yi < 0) continue;
      groups.push({
        x: xForYearIndex(yi),
        z: zForRow(clampRow(m - 1, rows), rows),
        cellW, cellD,
        entries: ents,
        key,
      });
    }

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
      const buildingHeight = baseHeight * arch.scaleY;

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
      const podiumGeom = new RoundedBoxGeometry(podiumW, podiumH, podiumD, 1, 0.04);
      const podiumMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(dominantBucket.color).multiplyScalar(0.55),
        roughness: 0.72,
        metalness: 0.05,
      });
      const podiumMesh = new THREE.Mesh(podiumGeom, podiumMat);
      podiumMesh.position.set(g.x, podiumH / 2, g.z);
      podiumMesh.castShadow = true;
      podiumMesh.receiveShadow = true;
      group.add(podiumMesh);

      // BODY — the main mass. Procedural window facade.
      const bodyH = buildingHeight - podiumH - (arch.setback ? 0.7 : 0);
      const bodyGeom = new THREE.BoxGeometry(bodyW, bodyH, bodyD);
      const bodyMat = makeFacadeMaterial(dominantBucket, bodyH, hash);
      const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
      bodyMesh.position.set(g.x, podiumH + bodyH / 2, g.z);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      group.add(bodyMesh);

      // SETBACK — smaller upper mass for stepped silhouette
      if (arch.setback) {
        const sbH = 0.7 + importance * 0.4;
        const sbW = bodyW * 0.66;
        const sbD = bodyD * 0.66;
        const sbGeom = new THREE.BoxGeometry(sbW, sbH, sbD);
        const sbMat = makeFacadeMaterial(dominantBucket, sbH, hash + 0.13);
        const sbMesh = new THREE.Mesh(sbGeom, sbMat);
        sbMesh.position.set(g.x, podiumH + bodyH + sbH / 2, g.z);
        sbMesh.castShadow = true;
        sbMesh.receiveShadow = true;
        group.add(sbMesh);
      }

      // SPIRE / ANTENNA — telephoto skyline punctuation
      if (arch.spire) {
        const totalTop = podiumH + bodyH + (arch.setback ? 0.7 + importance * 0.4 : 0);
        const spireH = 0.6 + heightScore * 0.18;
        const spireGeom = new THREE.CylinderGeometry(0.035, 0.06, spireH, 6);
        const spireMat = new THREE.MeshStandardMaterial({
          color: TOKENS.ink,
          roughness: 0.78,
          metalness: 0.4,
        });
        const spireMesh = new THREE.Mesh(spireGeom, spireMat);
        spireMesh.position.set(g.x, totalTop + spireH / 2, g.z);
        spireMesh.castShadow = true;
        group.add(spireMesh);
      }

      // Subtle edge definition on the body (helps it read at distance)
      const edgeGeo = new THREE.EdgesGeometry(bodyGeom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: TOKENS.ink,
        transparent: true,
        opacity: 0.22,
      });
      const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLines.position.copy(bodyMesh.position);
      group.add(edgeLines);

      // The "segments" array is preserved for compat with filter/focus/select code,
      // but for month-buildings it's just the body. Picking uses bodyMesh.
      segments.push({ mesh: bodyMesh, edge: edgeLines, bucket: dominantBucket.key, height: bodyH });

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
        primaryEntryId: primary?.id,
        baseHeight: buildingHeight,
        baseColor: dominantBucket.color,
        baseEmissive: 0.04 + importance * 0.05,
        bodyW, bodyD, bodyH,
        archetype: arch,
      });
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

  const yearLabels = new THREE.Group();
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

  // Month labels (left side) — rebuilt per LOD with appropriate granularity
  let rowLabels = new THREE.Group();
  root.add(rowLabels);
  function rebuildRowLabels(lod) {
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
  const camTarget = new THREE.Vector3(0, 0, 0);
  // Spherical-ish camera: radius, polar (down from +Y), azimuth (around Y from +Z)
  const camState = {
    // Scaled up for telephoto 12 FOV compression
    radius: gridWidth * 1.9,
    polar: Math.PI * 0.35,    // tilt-shift isometric angle
    azimuth: 0.15,              
    minRadius: gridWidth * 0.5,
    maxRadius: gridWidth * 2.8,
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
      camState.polar = Math.max(Math.PI * 0.12, Math.min(Math.PI * 0.48, camState.polar + dragVelocity.pol));
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
    // Raycast against all segment meshes from all prisms
    const meshes = entryPrisms.flatMap(p => (p.segments || []).map(s => s.mesh));
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hitMesh = hits[0].object;
    return entryPrisms.find(p => (p.segments || []).some(s => s.mesh === hitMesh)) || null;
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
    // Left-drag = pan (Figma/Maps convention). Right-drag or Shift+left = orbit.
    const isOrbitGesture = e.button === 2 || e.button === 1 || e.shiftKey || e.altKey;
    dragMode = isOrbitGesture ? "orbit" : "pan";
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

        const panLimit = gridWidth * 0.8;
        camTarget.x = clamp(
          dragStart.tx - _panRight.x * dx * panScale + _panForward.x * dy * panScale,
          -panLimit, panLimit,
        );
        camTarget.z = clamp(
          dragStart.tz - _panRight.z * dx * panScale + _panForward.z * dy * panScale,
          -gridDepth * 1.2, gridDepth * 1.2,
        );
        camTarget.y = 0; // keep target on ground plane
        applyCamera();
        scheduleRender();
        return;
      }

      // Telephoto-friendly orbit speed: slow enough to feel weighty
      const newAz = dragStart.az - dx * 0.0016;
      const newPol = Math.max(Math.PI * 0.12, Math.min(Math.PI * 0.48, dragStart.pol - dy * 0.0013));
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
  const ENV_MASTER = { fogDensity: 0.006, fogColor: new THREE.Color(0xf7f4ec), exposure: 0.86 };
  const ENV_FOCUS  = { fogDensity: 0.014, fogColor: new THREE.Color(0xede4ce), exposure: 0.98 };
  let focusedPrism = null;
  let envTween = null;
  let anchorGroup = null; // Holds the in-scene anchor content (title plane + ground halo)

  function makeTitlePlane(text, hexColor) {
    const w = 2048, h = 512;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d");
    // Subtle backdrop tint
    ctx.fillStyle = "rgba(247, 244, 236, 0.0)";
    ctx.fillRect(0, 0, w, h);
    // Render multi-line title centered
    ctx.fillStyle = TOKENS.ink;
    ctx.font = `400 204px "Inthacity","Instrument Serif", Georgia, serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const maxWidth = w - 80;
    const words = String(text || "Untitled").split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const lineH = 230;
    const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], w / 2, startY + i * lineH);
    }
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    const aspect = w / h;
    const planeHeight = 1.4; // 3D world units — much smaller, readable at focus distance
    const geom = new THREE.PlaneGeometry(planeHeight * aspect, planeHeight);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    return mesh;
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

  function buildAnchorContent(prism) {
    clearAnchorContent();
    if (!prism) return;
    const baseSeg = prism.segments?.[0]?.mesh;
    if (!baseSeg) return;

    const px = baseSeg.position.x;
    const pz = baseSeg.position.z;
    const topY = prism.baseHeight;

    anchorGroup = new THREE.Group();

    // Ground halo — glowing ring on the floor under the prism
    const haloGeom = new THREE.RingGeometry(1.4, 2.6, 64);
    const haloMat = new THREE.MeshBasicMaterial({
      color: prism.baseColor || "#ffffff",
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
      color: prism.baseColor || "#ffffff",
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pad = new THREE.Mesh(padGeom, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(px, 0.06, pz);
    anchorGroup.add(pad);

    // 3D title billboard floating ABOVE the prism (clearly anchored to it)
    const entry = prism.entries[0];
    const title = entry?.title || "Untitled moment";
    const titlePlane = makeTitlePlane(title, prism.baseColor);
    titlePlane.position.set(px, topY + 1.6, pz);
    titlePlane.lookAt(camera.position);
    titlePlane.userData.isBillboard = true;
    titlePlane.scale.setScalar(0.001); // start tiny, animate in
    anchorGroup.add(titlePlane);

    // Subtitle: year/role — smaller, below the title
    const subtitle = `${entry?.year || ""} · ${entry?.role || "Anchor"}`;
    const subPlane = makeTitlePlane(subtitle, prism.baseColor);
    subPlane.position.set(px, topY + 0.7, pz);
    subPlane.scale.setScalar(0.0005);
    subPlane.userData.isBillboard = true;
    subPlane.userData.isSubtitle = true;
    anchorGroup.add(subPlane);

    root.add(anchorGroup);

    // Animate title in
    const gsap = window.gsap;
    if (gsap) {
      gsap.to(titlePlane.scale, { x: 1, y: 1, z: 1, duration: 0.72, ease: "power3.out", delay: 0.18 });
      gsap.to(subPlane.scale, { x: 0.45, y: 0.45, z: 0.45, duration: 0.45, ease: "power2.out", delay: 0.45 });
      gsap.from(halo.scale, { x: 0.1, y: 0.1, z: 0.1, duration: 0.6, ease: "power2.out" });
    } else {
      titlePlane.scale.setScalar(1);
      subPlane.scale.setScalar(0.45);
    }
  }

  function setSceneFocus(prism) {
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
      buildAnchorContent(prism);
    } else {
      clearAnchorContent();
    }

    applyFocusDim();
    scheduleRender();
  }

  function applyFocusDim() {
    for (const p of entryPrisms) {
      const isFocused = !focusedPrism || focusedPrism === p;
      // True anchor zoom: HIDE non-focused prisms entirely when focusing
      p.group.visible = focusedPrism ? isFocused : true;
      const targetOpacity = isFocused ? 0.86 : 0.10;
      const targetEdgeOp = isFocused ? 1.0 : 0.04;
      for (const seg of p.segments || []) {
        seg.mesh.material.opacity = targetOpacity;
        if (seg.edge) seg.edge.material.opacity = targetEdgeOp;
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
    tooltipEl.innerHTML = `<strong>${entry.weekKey || prism.cellKey} | ${prism.entries.length} moment${prism.entries.length === 1 ? "" : "s"}</strong>
      <span>${entry.title || "Untitled"}</span><br>${tagPills}`;
    // Project prism top to screen coords
    const baseSeg = prism.segments?.[0]?.mesh;
    const px = baseSeg ? baseSeg.position.x : 0;
    const pz = baseSeg ? baseSeg.position.z : 0;
    projVec.set(px, prism.baseHeight + 0.5, pz);
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
  function applyFiltersToPrisms() {
    // Color path based on role
    if (filterState.roleKey && filterState.roleKey !== "all") {
      // Find matching bucket (case and space insensitive)
      const sanitizedKey = filterState.roleKey.toLowerCase().replace(/[^a-z]/g, "");
      const bucket = ROLE_BUCKETS.find(b => b.key.toLowerCase().replace(/[^a-z]/g, "") === sanitizedKey);
      if (bucket) {
        pathMesh.material.color.set(bucket.color);
        pathMesh.material.emissive.set(bucket.color);
        pathMesh.material.emissiveIntensity = 1.4;
      }
    } else {
      pathMesh.material.color.set("#FFF3C8");
      pathMesh.material.emissive.set("#FFD58C");
      pathMesh.material.emissiveIntensity = 0.95;
    }

    for (const p of entryPrisms) {
      const wk = p.entries[0]?.weekKey;
      const matches = !filterState.hasFilter || filterState.matchingWeekKeys.has(wk);
      // Search isolates: hide non-matching prisms entirely
      if (filterState.isolate) {
        p.group.visible = matches;
      } else {
        p.group.visible = true;
      }
      for (const seg of p.segments || []) {
        seg.mesh.material.opacity = matches ? 0.86 : 0.14;
        seg.mesh.material.emissiveIntensity = matches ? (p.baseEmissive || 0.04) : 0.006;
        if (seg.edge) seg.edge.material.opacity = matches ? 0.32 : 0.06;
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
  let needsRender = true;
  let running = true;
  let animTime = 0;
  function scheduleRender() { needsRender = true; }
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

    if (anchorGroup) {
      anchorGroup.children.forEach((child) => {
        if (child.userData?.isBillboard) child.lookAt(camera.position);
      });
    }

    if (needsRender || window.gsap?.isTweening(camTarget) || window.gsap?.isTweening(camState) || dampingRaf) {
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
    bloomPass.resolution.set(w, h);
    tiltShiftPass.uniforms.resolution.value.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    scheduleRender();
  }
  resize();
  ensureLOD();

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
          const baseY = prism ? prism.baseHeight * 0.55 : 2;
          const targetY = baseY + 0.3;
          const focusRadius = 26;
          // Shift camTarget right so the building lands in the LEFT third of
          // viewport (modal occupies the right 67%). Coefficient calibrated
          // for the 12° telephoto FOV.
          const lateralShift = focusRadius * 0.14;
          animateCameraTo({
            x: baseX + lateralShift, y: targetY, z: baseZ,
            radius: focusRadius,
            polar: Math.PI * 0.40,
            azimuth: 0,
          }, { duration: wasSelected ? 0.8 : 1.1, ease: "power3.inOut" });
          setSceneFocus(prism);
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
      if (gsap) {
        animateCameraTo({
          x: 0, y: 0, z: 0,
          radius: gridWidth * 1.9,
          azimuth: 0.15,
          polar: Math.PI * 0.35,
        }, { duration: 0.9, ease: "power3.inOut" });
      } else {
        camState.radius = gridWidth * 1.9;
        camState.azimuth = 0.15;
        camState.polar = Math.PI * 0.35;
        camTarget.set(0, 0, 0);
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
      // 2D UI calls this; map value (e.g. 100) to camState.radius if desired, or let 3D native wheel handle it
      // Let's at least ensure the function exists to prevent crash
      const minZoom = 50;
      const maxZoom = 200;
      const t = Math.max(0, Math.min(1, (value - minZoom) / (maxZoom - minZoom)));
      camState.radius = camState.maxRadius - t * (camState.maxRadius - camState.minRadius);
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
  };
}
