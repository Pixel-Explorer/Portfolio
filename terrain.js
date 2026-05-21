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

// Role category buckets — synced with app.js ROLE_PILLS (5 CV categories + Other)
const ROLE_BUCKETS = [
  { key: "MovingImages",  color: TOKENS.signal,   tags: ["Photographer", "Photography", "Film", "Cinematographer", "Director", "DOP", "Producer", "Animation", "MusicVideo", "Documentary", "Wedding Photographer", "Unit Still", "BTS", "Filmmaker", "Editor"] },
  { key: "VisualSystems", color: TOKENS.acid,      tags: ["Designer", "Design", "Graphic", "Art Director", "Visual", "Animator", "Branding", "Studio"] },
  { key: "CompCulture",   color: TOKENS.graphite,  tags: ["Tech", "Web3", "Blockchain", "AI", "Engineer", "IT", "Pixel Explorer", "Maker"] },
  { key: "DocResearch",   color: TOKENS.gold,      tags: ["Research", "Blogger", "Consultant", "Strategy", "Observer", "Documentation"] },
  { key: "LeadershipEdu", color: TOKENS.leaf,      tags: ["Lecturer", "Faculty", "Teacher", "AIESEC", "LCC", "VP", "Team Lead", "Founder", "Co-founder", "Leadership", "Education", "Student", "Graduate", "Member", "Mentor"] },
  { key: "Other",         color: "#D8D0BE",        tags: [] },
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
  const SKY_HEX = "#D7C49C";
  scene.background = new THREE.Color(SKY_HEX);
  scene.fog = new THREE.FogExp2(new THREE.Color(SKY_HEX).getHex(), 0.0010);

  // Telephoto-ish camera. Slightly wider FOV than the old tilt-shift 12°
  // so the cinematic ground-level angle reads with more depth.
  const camera = new THREE.PerspectiveCamera(16, 1, 0.1, gridWidth * 16);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color(SKY_HEX), 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Mid exposure — keeps saturation in floor/plinth/buildings while still
  // reading bright. Shadows are softened via ambient, not by burning exposure.
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  // PCFSoft + larger blur kernel = soft ceramic shadows, not harsh sun.
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  // Post-processing: bloom + tilt-shift miniature + vignette
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom retuned for cinematic miniature: stronger glow, lower threshold so
  // emissive windows + lamp heads pick up the halo seen in reference imagery.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.22,   // strength — picked-up emissives read at distance
    0.55,   // radius — softer falloff
    0.84,   // threshold — emissives only, not the cream environment
  );
  composer.addPass(bloomPass);

  // ─── TILT-SHIFT + VIGNETTE PASS ──────────────────────────────────
  // Cheap single-tap approximation of a separable blur whose radius grows
  // with vertical distance from a focus band. Vignette baked in.
  const TiltShiftShader = {
    uniforms: {
      tDiffuse:     { value: null },
      uResolution:  { value: new THREE.Vector2(1, 1) },
      uFocusY:      { value: 0.55 },
      uFocusWidth:  { value: 0.22 },
      uFalloff:     { value: 0.55 },
      uBlurStrength:{ value: 3.0 },
      uVignette:    { value: 0.45 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      uniform float uFocusY;
      uniform float uFocusWidth;
      uniform float uFalloff;
      uniform float uBlurStrength;
      uniform float uVignette;
      varying vec2 vUv;

      void main() {
        float dist = abs(vUv.y - uFocusY);
        float blur = smoothstep(uFocusWidth, uFocusWidth + uFalloff, dist) * uBlurStrength;

        vec2 px = blur / uResolution;
        vec4 col = vec4(0.0);
        col += texture2D(tDiffuse, vUv)                                 * 0.196;
        col += texture2D(tDiffuse, vUv + vec2( px.x,      0.0))         * 0.118;
        col += texture2D(tDiffuse, vUv + vec2(-px.x,      0.0))         * 0.118;
        col += texture2D(tDiffuse, vUv + vec2( 0.0,       px.y))        * 0.118;
        col += texture2D(tDiffuse, vUv + vec2( 0.0,      -px.y))        * 0.118;
        col += texture2D(tDiffuse, vUv + vec2( px.x*0.71, px.y*0.71))   * 0.083;
        col += texture2D(tDiffuse, vUv + vec2(-px.x*0.71, px.y*0.71))   * 0.083;
        col += texture2D(tDiffuse, vUv + vec2( px.x*0.71,-px.y*0.71))   * 0.083;
        col += texture2D(tDiffuse, vUv + vec2(-px.x*0.71,-px.y*0.71))   * 0.083;

        vec2 vc = vUv - vec2(0.5);
        float v = smoothstep(0.78, 0.20, length(vc) * 1.25);
        col.rgb *= mix(1.0 - 0.35 * uVignette, 1.0, v);

        gl_FragColor = col;
      }
    `,
  };
  const tiltShiftPass = new ShaderPass(TiltShiftShader);
  composer.addPass(tiltShiftPass);

  // Environment map for glass reflections — RoomEnvironment per design doc
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;

  // ─── LIGHTS ───────────────────────────────────────────────────────
  // Pass 04b lighting: moderate ambient (was 0.55, too washing) + active key
  // + lifted hemisphere. Shadows present and gentle — ceramic minis, not
  // golden-hour photography but not flat overcast either.
  scene.add(new THREE.AmbientLight("#F0E5CC", 0.32));
  scene.add(new THREE.HemisphereLight("#FFEED0", "#8E8A78", 0.45));

  // KEY — softer warm sun from a higher angle. Lower intensity than Pass 03
  // because ambient is doing more work; shadows softened via larger radius.
  const key = new THREE.DirectionalLight("#FFDFA8", 2.4);
  key.position.set(-gridWidth * 0.45, 34, 22);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.camera.left = -gridWidth * 1.0;
  key.shadow.camera.right = gridWidth * 1.0;
  key.shadow.camera.top = gridDepth * 1.3;
  key.shadow.camera.bottom = -gridDepth * 1.3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 160;
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.022;
  // Soft shadow radius — miniature ceramic look.
  key.shadow.radius = 6;
  key.shadow.blurSamples = 18;
  scene.add(key);

  // FILL — cool sky bounce from camera-right. Lifts shadow bodies.
  const fillWarm = new THREE.DirectionalLight("#BCD0DE", 0.42);
  fillWarm.position.set(gridWidth * 0.5, 14, gridDepth * 0.6);
  scene.add(fillWarm);

  // RIM — warm back-light from behind to outline silhouettes.
  const rim = new THREE.DirectionalLight("#FFC487", 0.7);
  rim.position.set(gridWidth * 0.3, 18, -gridDepth * 1.0);
  scene.add(rim);

  // ─── GROUPS ───────────────────────────────────────────────────────
  const root = new THREE.Group();
  scene.add(root);

  const room = new THREE.Group();
  scene.add(room);

  // Warm sandstone ground — re-saturated so the plinth + crops + buildings
  // have a real value contrast to sit on. Was washed cream; now reads as land.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth * 12, gridDepth * 16, 24, 24),
    new THREE.MeshStandardMaterial({
      color: "#C7B187",
      roughness: 0.85,
      metalness: 0.03,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.62;
  floor.receiveShadow = true;
  room.add(floor);

  // Shore ring removed — white infinite ground reads clean without it.

  // Landscape backdrop removed — white infinite ground replaces it.

  // The island plinth — elevated platform the city sits on.
  // Light warm tone reads against the white ground. Expanded depth to fit the
  // rows that got pushed outward by the road corridor.
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(gridWidth * 1.24, 0.52, gridDepth * 1.55),
    new THREE.MeshPhysicalMaterial({
      color: "#EEE3C6",
      roughness: 0.42,
      metalness: 0.02,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.75,
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
    emissiveIntensity: 0.7,
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

  // ─── BUSHES + HEDGES + FLOWER CLUSTERS ─────────────────────────────
  // Dense ground-level vegetation in instanced meshes.
  const BUSH_COUNT = 180;
  const bushGeom = new THREE.SphereGeometry(1, 18, 14);
  const bushMat = new THREE.MeshStandardMaterial({
    color: "#6A8E3F", roughness: 0.86,
  });
  const bushInst = new THREE.InstancedMesh(bushGeom, bushMat, BUSH_COUNT);
  bushInst.castShadow = true;
  bushInst.receiveShadow = true;
  const bushD = new THREE.Object3D();
  for (let i = 0; i < BUSH_COUNT; i++) {
    let bx = (seeded(i + 6101) - 0.5) * gridWidth * 1.0;
    let bz = (seeded(i + 6201) - 0.5) * gridDepth * 0.98;
    if (Math.abs(bz) < SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.4) {
      bz = Math.sign(bz || 1) * (SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.4 + seeded(i + 6301) * 0.6);
    }
    const s = 0.08 + seeded(i + 6401) * 0.14;
    bushD.position.set(bx, s * 0.6, bz);
    bushD.scale.set(s, s * 0.7, s);
    bushD.rotation.y = seeded(i + 6501) * Math.PI;
    bushD.updateMatrix();
    bushInst.setMatrixAt(i, bushD.matrix);
  }
  bushInst.instanceMatrix.needsUpdate = true;
  root.add(bushInst);

  // Hedges — narrow stretched cuboid strips
  const HEDGE_COUNT = 22;
  const hedgeGeom = new THREE.BoxGeometry(1, 1, 1);
  const hedgeMat = new THREE.MeshStandardMaterial({
    color: "#557637", roughness: 0.9,
  });
  const hedgeInst = new THREE.InstancedMesh(hedgeGeom, hedgeMat, HEDGE_COUNT);
  hedgeInst.castShadow = true;
  hedgeInst.receiveShadow = true;
  const hD = new THREE.Object3D();
  for (let i = 0; i < HEDGE_COUNT; i++) {
    const hx = (seeded(i + 7101) - 0.5) * gridWidth * 0.95;
    let hz = (seeded(i + 7201) - 0.5) * gridDepth * 0.85;
    if (Math.abs(hz) < SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.6) {
      hz = Math.sign(hz || 1) * (SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.7 + seeded(i + 7301) * 0.4);
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
  root.add(hedgeInst);

  // Flower bed clusters — colored micro-spheres in patches
  const FLOWER_PATCH_COUNT = 28;
  const FLOWERS_PER_PATCH = 12;
  const flowerGeom = new THREE.IcosahedronGeometry(1, 0);
  const flowerColors = ["#E64A4A", "#F4B637", "#E76FA1", "#A05BD6", "#3F8FD8"];
  const flowerInstByColor = flowerColors.map((c) => {
    const m = new THREE.MeshStandardMaterial({
      color: c, roughness: 0.55, emissive: c, emissiveIntensity: 0.1,
    });
    return new THREE.InstancedMesh(flowerGeom, m, FLOWER_PATCH_COUNT * FLOWERS_PER_PATCH);
  });
  const flowerCounts = flowerColors.map(() => 0);
  const fD = new THREE.Object3D();
  for (let p = 0; p < FLOWER_PATCH_COUNT; p++) {
    const px = (seeded(p + 8101) - 0.5) * gridWidth * 0.95;
    let pz = (seeded(p + 8201) - 0.5) * gridDepth * 0.85;
    if (Math.abs(pz) < SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.5) {
      pz = Math.sign(pz || 1) * (SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.5 + seeded(p + 8301) * 0.4);
    }
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
    new THREE.Color("#3D7531"),
    new THREE.Color("#6BA53D"),
    new THREE.Color("#2E5A23"),
    new THREE.Color("#82B842"),
  ];
  // 4 instanced meshes (one per color band) → all crop cuboids in 4 draws.
  const cropGeom = new RoundedBoxGeometry(0.06, 0.07, 0.06, 1, 0.012);
  const cropMats = cropColors.map((c) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.78, metalness: 0,
  }));
  const cropPatches = [];
  // Pre-plan patches so we know counts per color.
  for (let p = 0; p < cropPatchCount; p++) {
    const px = (seeded(p + 5101) - 0.5) * gridWidth * 0.95;
    let pz = (seeded(p + 5201) - 0.5) * gridDepth * 0.92;
    if (Math.abs(pz) < SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.7) {
      pz = Math.sign(pz || 1) * (SPINE_WIDTH * 0.5 + CURB_WIDTH + 0.8 + seeded(p + 5301) * 0.6);
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

  // ─── PLAZA WITH FOUNTAIN at 2021 anchor (NEAR grant year) ─────────
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
    // 8 benches around the plaza perimeter
    for (let b = 0; b < 8; b++) {
      const ang = (b / 8) * Math.PI * 2 + Math.PI / 16;
      const bx = px + Math.cos(ang) * 1.42;
      const bz = pz + Math.sin(ang) * 1.42;
      const benchSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.05, 0.14), benchMat,
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
  const TREE_COUNT = 160;
  // Smaller, tighter foliage. Smooth spheres + one conifer cone.
  // Foliage geometries: lower-poly icosahedrons read as stylized chunky blobs
  // rather than smooth spheres — matches the "miniature ceramic" reference look.
  // Detail variety achieved via 6 archetypes incl. dome and pill shapes.
  const treeArchetypes = [
    { geom: new THREE.IcosahedronGeometry(0.19, 1),                       color: "#36632A", yScale: 1.05, rough: 0.7  }, // dark blob
    { geom: new THREE.IcosahedronGeometry(0.16, 1),                       color: "#558637", yScale: 1.0,  rough: 0.68 }, // mid blob
    { geom: new THREE.IcosahedronGeometry(0.17, 1),                       color: "#78A848", yScale: 0.92, rough: 0.64 }, // bright blob
    { geom: new THREE.ConeGeometry(0.13, 0.50, 14),                       color: "#2F4E1B", yScale: 1.25, rough: 0.7  }, // tall conifer
    { geom: new THREE.CylinderGeometry(0.12, 0.15, 0.36, 14, 1, false),   color: "#6A9A3E", yScale: 1.0,  rough: 0.68 }, // pill bush
    { geom: new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI*2, 0, Math.PI*0.65), color: "#46763B", yScale: 0.85, rough: 0.7 }, // dome cluster
  ];
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#3B2E22", roughness: 0.88 });
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

  root.add(vegetation);

  // Glass photon bubbles — small translucent spheres drifting in slow arcs
  // along the spine. They thread through the city like camera-following
  // signals; subtle but a key part of the cinematic miniature feel.
  const photonMat = new THREE.MeshPhysicalMaterial({
    color: "#FFE8B0",
    roughness: 0.18,
    transmission: 0.7,
    thickness: 0.15,
    ior: 1.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    emissive: "#FFC979",
    emissiveIntensity: 0.25,
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
    root.add(p);
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
    // Brighter base color so building reads as the same color as the modal.
    const baseColor = new THREE.Color(bucket.color).multiplyScalar(0.92);
    // MeshPhysicalMaterial: same shader-injection support as Standard plus
    // a clearcoat layer that gives every building a unified porcelain sheen.
    const mat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: 0.36,
      metalness: bucket.key === "DocResearch" ? 0.22 : 0.07,
      emissive: new THREE.Color(bucket.color),
      emissiveIntensity: 0.04,
      clearcoat: 0.4,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.85,
    });
    const roleColorVec = new THREE.Color(bucket.color);
    const accent = new THREE.Color("#FFD9A0"); // warm window glow
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
          vec3 _wallCol = uRoleColor * 0.78;
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
            // top face: solid mid-tone cap (matches surrounding wall tone)
            diffuseColor.rgb = uRoleColor * 0.6;
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
      // Slightly bigger corner radius for ceramic-looking edges.
      const podiumGeom = new RoundedBoxGeometry(podiumW, podiumH, podiumD, 3, 0.07);
      const podiumMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(dominantBucket.color).multiplyScalar(0.7),
        roughness: 0.38,
        metalness: 0.04,
        clearcoat: 0.42,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.7,
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
        color: "#1F1B17", roughness: 0.62, metalness: 0.2,
      });
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(podiumW * 0.16, podiumH * 0.78, 0.025), doorMat,
      );
      door.position.set(g.x, podiumH * 0.4, g.z + entrySide * (podiumD / 2 + 0.014));
      door.castShadow = true;
      group.add(door);
      // Step
      const stepMat = new THREE.MeshStandardMaterial({
        color: "#7E7868", roughness: 0.8, metalness: 0.04,
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
          color: new THREE.Color(dominantBucket.color).multiplyScalar(0.75),
          roughness: 0.6,
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
          color: new THREE.Color(dominantBucket.color).multiplyScalar(0.55),
          roughness: 0.6,
          metalness: 0.1,
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
          color: new THREE.Color(dominantBucket.color).multiplyScalar(0.36),
          roughness: 0.8,
          metalness: 0.1,
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
          color: TOKENS.ink,
          roughness: 0.78,
          metalness: 0.4,
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
        color: TOKENS.ink,
        transparent: true,
        opacity: 0.18,
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
        color: "#FFE0A8",
        emissive: "#FFC979",
        emissiveIntensity: 0.65,
        roughness: 0.34,
        metalness: 0.08,
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
      root.add(rooftopAcInst);
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
      root.add(rooftopTankInst);
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
  // Top-down isometric "miniature city on a plinth" view — matches image 1 reference.
  // Camera looks down from ~30° above horizontal, showing the platform underneath.
  const camTarget = new THREE.Vector3(0, 0.5, 0);
  const camState = {
    radius: gridWidth * 1.65,
    polar: Math.PI * 0.34,    // ~61° from top = ~29° above horizon (top-down isometric)
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
    // Tint lane markings to the active role color (more subtle than coloring the asphalt).
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

    for (const p of entryPrisms) {
      const wk = p.entries[0]?.weekKey;
      const matches = !filterState.hasFilter || filterState.matchingWeekKeys.has(wk);
      // Search isolates: hide non-matching prisms entirely
      if (filterState.isolate) {
        p.group.visible = matches;
      } else {
        p.group.visible = true;
      }
      // Off-state target: very desaturated, near-white. Reads as "muted" against the
      // city without going transparent (kept materials opaque for color fidelity).
      const dimGrey = new THREE.Color("#E8E2D6");
      const dimBlack = new THREE.Color("#000000");
      const dimAccent = new THREE.Color("#EDE4CE");
      for (const seg of p.segments || []) {
        const ud = seg.mesh.material.userData;
        if (matches) {
          if (ud.baseColor)     seg.mesh.material.color.copy(ud.baseColor);
          if (ud.baseEmissive)  seg.mesh.material.emissive.copy(ud.baseEmissive);
          // Also restore the shader uniform refs so windows show in role color.
          if (ud.roleColorRef && ud.baseRoleColor) ud.roleColorRef.copy(ud.baseRoleColor);
          if (ud.accentRef && ud.baseAccent)       ud.accentRef.copy(ud.baseAccent);
          seg.mesh.material.emissiveIntensity = p.baseEmissive || 0.04;
        } else {
          // Lerp color toward grey, emissive toward black — building reads as "off".
          if (ud.baseColor)     seg.mesh.material.color.copy(ud.baseColor).lerp(dimGrey, 0.82);
          if (ud.baseEmissive)  seg.mesh.material.emissive.copy(ud.baseEmissive).lerp(dimBlack, 0.95);
          // Desaturate the shader's window pattern color too.
          if (ud.roleColorRef && ud.baseRoleColor) ud.roleColorRef.copy(ud.baseRoleColor).lerp(dimGrey, 0.85);
          if (ud.accentRef && ud.baseAccent)       ud.accentRef.copy(ud.baseAccent).lerp(dimAccent, 0.85);
          seg.mesh.material.emissiveIntensity = 0.002;
        }
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
    tiltShiftPass.uniforms.uResolution.value.set(w, h);
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
          const focusRadius = 32;
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
          x: 0, y: 0.5, z: 0,
          radius: gridWidth * 1.65,
          azimuth: 0.22,
          polar: Math.PI * 0.34,
        }, { duration: 0.9, ease: "power3.inOut" });
      } else {
        camState.radius = gridWidth * 1.65;
        camState.azimuth = 0.22;
        camState.polar = Math.PI * 0.34;
        camTarget.set(0, 0.5, 0);
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
