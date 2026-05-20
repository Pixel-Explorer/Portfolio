// Spatial archive view — v3 (transposed grid + semantic zoom)
// Years on X-axis (columns), time-units on Z-axis (rows): months -> weeks -> days
// Glass prism aesthetic per Design doc.txt

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
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
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.045,
    0.28,
    0.88,
  );
  composer.addPass(bloomPass);

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

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth * 3.2, gridDepth * 4.6),
    new THREE.MeshPhysicalMaterial({
      color: TOKENS.room,
      roughness: 0.92,
      metalness: 0,
      envMapIntensity: 0.08,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.42;
  floor.receiveShadow = true;
  room.add(floor);

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

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(gridWidth * 1.18, 0.46, gridDepth * 1.16),
    new THREE.MeshPhysicalMaterial({
      color: TOKENS.paper,
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: 0.16,
    }),
  );
  plinth.position.y = -0.24;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);

  function seeded(index) {
    const n = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // Flowing curved path based on timeline
  const pathPoints = [];
  for (let i = 0; i < yearCount; i++) {
    // Generate organic wave for path
    const xBase = (i - (yearCount - 1) / 2) * yearStride;
    pathPoints.push(new THREE.Vector3(xBase, 0.03, Math.sin(i * 0.4) * (gridDepth * 0.25)));
  }
  const mainPathCurve = new THREE.CatmullRomCurve3(pathPoints);
  
  // Floor details / path line
  const pathGeom = new THREE.TubeGeometry(mainPathCurve, 128, 0.25, 8, false);
  const pathMat = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.65,
    roughness: 0.12,
    transmission: 0.9,
    ior: 1.3,
  });
  const pathMesh = new THREE.Mesh(pathGeom, pathMat);
  root.add(pathMesh);

  // Organic landscape mounds (Hills)
  const moundMat = new THREE.MeshStandardMaterial({
    color: "#d9e2ce",
    roughness: 0.9,
  });
  for (let i = 0; i < 12; i++) {
    const rx = (seeded(i + 700) - 0.5) * gridWidth * 0.9;
    const rz = (seeded(i + 800) - 0.5) * gridDepth * 0.9;
    if (Math.abs(rz) < 2) continue; // Keep clear of center path
    const mGeom = new THREE.SphereGeometry(1.5 + seeded(i+900) * 1.8, 32, 16);
    const mMesh = new THREE.Mesh(mGeom, moundMat);
    mMesh.scale.set(1, 0.2 + seeded(i)*0.1, 1);
    mMesh.position.set(rx, -0.15, rz);
    mMesh.castShadow = true;
    mMesh.receiveShadow = true;
    root.add(mMesh);
  }

  const vegetation = new THREE.Group();
  
  // Organic Trees (Compound Instancing)
  const treeCount = 160;
  const canopyGeom = new THREE.DodecahedronGeometry(0.2, 1);
  const trunkGeom = new THREE.CylinderGeometry(0.04, 0.06, 0.3, 5);
  
  const leafMat = new THREE.MeshStandardMaterial({ color: TOKENS.leaf, roughness: 0.85 });
  const leafHiMat = new THREE.MeshStandardMaterial({ color: TOKENS.leafHi, roughness: 0.75 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: TOKENS.ink, roughness: 0.9 });
  
  const canopies = new THREE.InstancedMesh(canopyGeom, leafMat, treeCount * 2);
  const canopyHi = new THREE.InstancedMesh(canopyGeom, leafHiMat, treeCount);
  const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, treeCount);
  
  const dummy = new THREE.Object3D();
  let cIdx = 0;
  for (let i = 0; i < treeCount; i++) {
    const rx = seeded(i) - 0.5;
    const rz = seeded(i + 41) - 0.5;
    // Bias away from exact center
    const sideBias = Math.abs(rz) < 0.15 ? Math.sign(rz || 0.5) * 0.25 : rz;
    const x = rx * gridWidth * 1.05;
    const z = sideBias * gridDepth * 0.95;
    const s = 0.7 + seeded(i + 83) * 1.2;
    
    // Trunk
    dummy.position.set(x, 0.15 * s, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(0, seeded(i)*Math.PI, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    
    // Canopy 1
    dummy.position.set(x, 0.3 * s, z);
    dummy.scale.set(s * 1.4, s * 1.2, s * 1.4);
    dummy.updateMatrix();
    canopies.setMatrixAt(cIdx++, dummy.matrix);
    
    // Canopy 2
    dummy.position.set(x + 0.1*s, 0.4 * s, z + 0.1*s);
    dummy.scale.set(s * 1.1, s * 1.1, s * 1.1);
    dummy.updateMatrix();
    canopies.setMatrixAt(cIdx++, dummy.matrix);
    
    // Canopy High
    dummy.position.set(x - 0.05*s, 0.45 * s, z - 0.05*s);
    dummy.scale.set(s * 0.9, s * 0.8, s * 0.9);
    dummy.updateMatrix();
    canopyHi.setMatrixAt(i, dummy.matrix);
  }
  canopies.instanceMatrix.needsUpdate = true;
  canopyHi.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.castShadow = true; canopies.receiveShadow = true;
  canopyHi.castShadow = true; canopyHi.receiveShadow = true;
  trunks.castShadow = true; trunks.receiveShadow = true;
  
  vegetation.add(trunks, canopies, canopyHi);
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

  function buildEntryPrismsForLOD(lod) {
    clearEntryPrisms();
    const cellW = yearStride - cellPad * 2;

    const clampRow = (idx, max) => Math.max(0, Math.min(max - 1, idx));
    // Iterate aggregated groups for this LOD
    let groups; // [{x, z, cellW, cellD, entries, key}]
    if (lod === LOD.MONTH) {
      const rows = 12;
      const cellD = (gridDepth / rows) - cellPad * 2;
      groups = [];
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
    } else if (lod === LOD.WEEK) {
      const rows = 53;
      const cellD = (gridDepth / rows) - cellPad * 2;
      groups = [];
      for (const [key, ents] of entriesByWeek) {
        if (!key) continue;
        const [yStr, wStr] = key.split("-W");
        const y = Number(yStr);
        const w = Number(wStr);
        const yi = years.indexOf(y);
        if (yi < 0 || !w) continue;
        groups.push({
          x: xForYearIndex(yi),
          z: zForRow(clampRow(w - 1, rows), rows),
          cellW, cellD,
          entries: ents,
          key,
        });
      }
    } else {
      const rows = 366;
      const cellD = (gridDepth / rows);
      groups = [];
      for (const [key, ents] of entriesByDay) {
        const y = Number(key.slice(0, 4));
        const yi = years.indexOf(y);
        if (yi < 0) continue;
        const doy = dayOfYearFromEntry(ents[0]);
        if (!Number.isFinite(doy) || doy < 1) continue;
        groups.push({
          x: xForYearIndex(yi),
          z: zForRow(clampRow(doy - 1, rows), rows),
          cellW: Math.max(cellW, 0.02),
          cellD: Math.max(cellD, 0.02),
          entries: ents,
          key,
        });
      }
    }

    const heightUnit = 2.4;
    for (const g of groups) {
      // Group entries by role bucket; tally counts to size each stack segment
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
        if (!seenBuckets.size) {
          bucketCounts.set("Other", (bucketCounts.get("Other") || 0) + 1);
        }
      }

      // Compute total height — proportional to entry count with milestone bonuses
      const allTags = [...new Set(g.entries.flatMap(e => e.tags || []))];
      const hasMilestone = allTags.includes("Milestone");
      const hasThrough = allTags.includes("ThroughLine");
      const totalCount = g.entries.length;
      const heightScore = Math.min(8, totalCount * 0.8 + (hasMilestone ? 2 : 0) + (hasThrough ? 1 : 0));
      const totalHeight = Math.max(1.0, heightScore) * heightUnit;
      const importance = heightScore / 8;

      // Build stacked segments, ordered by bucket priority
      const stackOrder = ROLE_BUCKETS.filter((b) => bucketCounts.has(b.key));
      const totalBucketUnits = [...bucketCounts.values()].reduce((a, b) => a + b, 0) || 1;

      const bevelRadius = Math.min(g.cellW * 0.1, g.cellD * 0.1, 0.08);
      const cellW = g.cellW * 0.86;
      const cellD = g.cellD * 0.86;

      const group = new THREE.Group();
      let yCursor = 0;
      let primaryGlow = null;
      const segments = [];

      for (const bucket of stackOrder) {
        const segCount = bucketCounts.get(bucket.key);
        const segHeight = (segCount / totalBucketUnits) * totalHeight;
        if (segHeight < 0.01) continue;

        const col = new THREE.Color(bucket.color);
        const segGeom = new RoundedBoxGeometry(cellW, segHeight, cellD, 1, bevelRadius);
        const segMat = new THREE.MeshPhysicalMaterial({
          color: col,
          transparent: true,
          opacity: bucket.key === "IT" ? 0.54 : 0.58,
          roughness: 0.52,
          metalness: bucket.key === "Branding" ? 0.18 : 0.02,
          transmission: bucket.key === "Branding" ? 0.38 : 0.88,
          thickness: Math.max(0.8, segHeight * 0.38),
          ior: 1.3,
          envMapIntensity: 0.78,
          clearcoat: 0.2,
          clearcoatRoughness: 0.5,
          attenuationColor: col,
          attenuationDistance: Math.max(1.6, 5.4 - importance * 1.8),
          emissive: col,
          emissiveIntensity: 0.008 + importance * 0.022,
        });
        const segMesh = new THREE.Mesh(segGeom, segMat);
        segMesh.position.set(g.x, yCursor + segHeight / 2, g.z);
        segMesh.castShadow = true;
        segMesh.receiveShadow = true;
        group.add(segMesh);

        // Subtle edge definition
        const edgeGeo = new THREE.EdgesGeometry(segGeom);
        const edgeMat = new THREE.LineBasicMaterial({
          color: bucket.key === "Photography" ? new THREE.Color(TOKENS.ink) : col,
          transparent: true,
          opacity: 0.32,
        });
        const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLines.position.copy(segMesh.position);
        group.add(edgeLines);

        segments.push({ mesh: segMesh, edge: edgeLines, bucket: bucket.key, height: segHeight });
        if (!primaryGlow) primaryGlow = segMesh;
        yCursor += segHeight;
      }

      root.add(group);

      const primary = strongestEntry(g.entries);
      const dominantBucket = stackOrder[0]?.key || "Other";
      const dominantColor = ROLE_BUCKETS.find((b) => b.key === dominantBucket)?.color || "#D8D0BE";

      entryPrisms.push({
        group,
        mesh: primaryGlow || group, // used for raycasting via pickPrism
        glow: primaryGlow,
        segments,
        cellKey: g.key,
        entries: g.entries,
        dominantTag: dominantBucket,
        primaryEntryId: primary?.id,
        baseHeight: totalHeight,
        baseColor: dominantColor,
        baseEmissive: 0.008 + importance * 0.022,
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
      const friction = 0.92;
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
  function lodForRadius(r) {
    const span = gridWidth;
    if (r > span * 0.55) return LOD.MONTH;
    if (r > span * 0.22) return LOD.WEEK;
    return LOD.DAY;
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
        const panScale = camState.radius * 0.003;
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

      const newAz = dragStart.az - dx * 0.005;
      const newPol = Math.max(Math.PI * 0.12, Math.min(Math.PI * 0.48, dragStart.pol - dy * 0.004));
      const now = performance.now();
      const dt = Math.max(1, now - lastDragEvent.time);
      dragVelocity.az = -(e.clientX - lastDragEvent.x) * 0.005 / (dt / 16);
      dragVelocity.pol = -(e.clientY - lastDragEvent.y) * 0.004 / (dt / 16);
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
      const targetOpacity = isFocused ? 0.58 : 0.10;
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
        pathMesh.material.opacity = 0.9;
        pathMesh.material.emissive = new THREE.Color(bucket.color);
        pathMesh.material.emissiveIntensity = 0.2;
      }
    } else {
      pathMesh.material.color.set("#ffffff");
      pathMesh.material.opacity = 0.65;
      pathMesh.material.emissiveIntensity = 0;
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
        seg.mesh.material.opacity = matches ? 0.5 : 0.12;
        seg.mesh.material.emissiveIntensity = matches ? (p.baseEmissive || 0.02) : 0.004;
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
    
    if (needsRender || window.gsap?.isTweening(camTarget) || window.gsap?.isTweening(camState) || dampingRaf) {
      composer.render();
      needsRender = false;
    }
  }
  requestAnimationFrame(loop);

  ensureLOD();

  return {
    selectEntry(entry, opts = {}) {
      selectedEntryId = entry?.id || null;
      applySelectionToPrisms();
      if (!entry) return;
      const targetX = xForYearIndex(years.indexOf(entry.year));
      const r = Math.max(0, Math.min(365, dayOfYearFromEntry(entry) - 1));
      const targetZ = zForRow(r, 366);
      const baseY = 2.4; // rough height estimate
      if (opts.focus) {
        const gsap = window.gsap;
        if (gsap) {
          const targetY = baseY + 0.5;
          // Pull camera back to comfortably see prism + title above it within the top 60% of screen
          const focusRadius = 22;
          animateCameraTo({
            x: targetX, y: targetY, z: targetZ,
            radius: focusRadius,
            polar: Math.PI * 0.42,
            azimuth: 0,
          }, { duration: 1.1, ease: "power3.inOut" });
        }
      }
    },
    resetView() {
      selectedEntryId = null;
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
