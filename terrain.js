// Spatial archive view — v3 (transposed grid + semantic zoom)
// Years on X-axis (columns), time-units on Z-axis (rows): months -> weeks -> days
// Glass prism aesthetic per Design doc.txt

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Role category buckets — match the filter pills (Photography, Design, AV, Branding, IT)
// All tags map into one of these 5 buckets + "Other"
const ROLE_BUCKETS = [
  { key: "Photography", color: "#ff6ec7", tags: ["Photographer", "Photography"] },
  { key: "Design",      color: "#6ed1ff", tags: ["Designer", "Design", "Graphic", "Animation"] },
  { key: "AV",          color: "#b48cff", tags: ["Film", "Cinematographer", "MusicVideo", "Documentary"] },
  { key: "Branding",    color: "#ffb18c", tags: ["Studio", "Strategy", "Founder", "Leadership", "Corporate"] },
  { key: "IT",          color: "#8cffb4", tags: ["Tech", "Web3"] },
  { key: "Other",       color: "#c8c0e0", tags: [] },
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
}, { Milestone: "#fff5d2", ThroughLine: "#ff6ec7" });

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
  // Transparent background so the body's ambient gradient shows through
  scene.background = null;
  scene.fog = new THREE.FogExp2(0x1a1430, 0.008);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, gridWidth * 4);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  // Post-processing: subtle bloom (toned down from neon-blast)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45,  // strength — subtle bleed
    0.5,   // radius
    0.6,   // threshold — only catch strongest emissive
  );
  composer.addPass(bloomPass);

  // Environment map for glass reflections — RoomEnvironment per design doc
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;

  // ─── LIGHTS ───────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight("#1a1e2e", 0.35));
  scene.add(new THREE.HemisphereLight("#1a2244", "#0a0a0a", 0.3));

  const key = new THREE.DirectionalLight("#c8d0e8", 1.8);
  key.position.set(gridWidth * 0.4, 50, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -gridWidth;
  key.shadow.camera.right = gridWidth;
  key.shadow.camera.top = gridDepth;
  key.shadow.camera.bottom = -gridDepth;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 120;
  scene.add(key);

  // Soft directional fills — much more subtle, no neon explosion
  const fillViolet = new THREE.DirectionalLight("#b48cff", 0.6);
  fillViolet.position.set(-gridWidth * 0.4, 30, gridDepth * 0.3);
  scene.add(fillViolet);

  const fillCool = new THREE.DirectionalLight("#6ed1ff", 0.4);
  fillCool.position.set(gridWidth * 0.5, 20, -gridDepth * 0.4);
  scene.add(fillCool);

  // ─── GROUPS ───────────────────────────────────────────────────────
  const root = new THREE.Group();
  scene.add(root);

  // Soft frosted ground — subtle backdrop, no harsh reflections
  const basePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth * 2, gridDepth * 2),
    new THREE.MeshPhysicalMaterial({
      color: "#1a1430",
      roughness: 0.85,
      metalness: 0.1,
      envMapIntensity: 0.2,
      transparent: true,
      opacity: 0.4,
    }),
  );
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = -0.01;
  basePlane.receiveShadow = true;
  root.add(basePlane);

  // Subtle floor grid — guides without screaming for attention
  const floorGrid = new THREE.GridHelper(
    Math.max(gridWidth, gridDepth) * 1.4, 36,
    new THREE.Color("#3d2a5c"), new THREE.Color("#241636"),
  );
  floorGrid.position.y = 0.02;
  floorGrid.material.opacity = 0.35;
  floorGrid.material.transparent = true;
  root.add(floorGrid);

  // Volumetric ground glow removed — clean modern aesthetic

  // Center the grid so (0,0) is middle of years × middle of rows
  function xForYearIndex(i) {
    return (i - (yearCount - 1) / 2) * yearStride;
  }
  function zForRow(rowIndex, totalRows) {
    return (rowIndex - (totalRows - 1) / 2) * (gridDepth / totalRows);
  }

  // ─── GHOST GRID (InstancedMesh) ───────────────────────────────────
  // Rebuilt per LOD so cell counts change
  let ghostMesh = null;
  function buildGhostGrid(rowsPerYear) {
    if (ghostMesh) {
      ghostMesh.geometry.dispose();
      ghostMesh.material.dispose();
      root.remove(ghostMesh);
    }
    const cellW = yearStride - cellPad * 2;
    const cellD = (gridDepth / rowsPerYear) - cellPad * 2;
    const geom = new THREE.BoxGeometry(Math.max(cellW, 0.02), 0.25, Math.max(cellD, 0.02));
    const mat = new THREE.MeshPhysicalMaterial({
      color: "#1a2840",
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      metalness: 0.3,
      transmission: 0.5,
      thickness: 0.3,
      ior: 1.35,
      envMapIntensity: 0.8,
      emissive: new THREE.Color("#0a1520"),
      emissiveIntensity: 0.3,
    });
    const count = yearCount * rowsPerYear;
    const mesh = new THREE.InstancedMesh(geom, mat, count);
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let yi = 0; yi < yearCount; yi++) {
      for (let ri = 0; ri < rowsPerYear; ri++) {
        dummy.position.set(xForYearIndex(yi), 0.15, zForRow(ri, rowsPerYear));
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    ghostMesh = mesh;
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
          opacity: 0.7,
          roughness: 0.1,
          metalness: 0.05,
          transmission: 0.5,
          thickness: 1.5,
          ior: 1.4,
          envMapIntensity: 1.2,
          clearcoat: 0.8,
          clearcoatRoughness: 0.1,
          attenuationColor: col,
          attenuationDistance: 4.0,
          emissive: col,
          emissiveIntensity: 0.12 + importance * 0.15,
        });
        const segMesh = new THREE.Mesh(segGeom, segMat);
        segMesh.position.set(g.x, yCursor + segHeight / 2, g.z);
        segMesh.castShadow = true;
        segMesh.receiveShadow = true;
        group.add(segMesh);

        // Subtle edge definition
        const edgeGeo = new THREE.EdgesGeometry(segGeom);
        const edgeMat = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.25,
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
      const dominantColor = ROLE_BUCKETS.find((b) => b.key === dominantBucket)?.color || "#c8c0e0";

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
        baseEmissive: 0.12 + importance * 0.15,
      });
    }
  }

  // ─── YEAR LABELS (sprites) ────────────────────────────────────────
  function makeTextSprite(text, opts = {}) {
    const fontSize = opts.fontSize || 56;
    const padding = 10;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = `600 ${fontSize}px "Inter","Helvetica Neue",sans-serif`;
    const tw = ctx.measureText(text).width;
    canvas.width = Math.ceil(tw + padding * 2);
    canvas.height = Math.ceil(fontSize + padding * 2);
    ctx.font = `600 ${fontSize}px "Inter","Helvetica Neue",sans-serif`;
    ctx.fillStyle = opts.color || "rgba(245,240,232,0.85)";
    ctx.textBaseline = "top";
    ctx.fillText(text, padding, padding);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const scale = opts.scale || 0.012;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    return sprite;
  }

  const yearLabels = new THREE.Group();
  for (let i = 0; i < yearCount; i++) {
    const s = makeTextSprite(String(years[i]), { fontSize: 56, scale: 0.012 });
    s.position.set(xForYearIndex(i), 0.4, gridDepth / 2 + 1.2);
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
        const s = makeTextSprite(MONTH_LABELS[m], { fontSize: 44, scale: 0.012, color: "rgba(200,210,225,0.75)" });
        s.position.set(x, 0.4, zForRow(m, 12));
        rowLabels.add(s);
      }
    } else if (lod === LOD.WEEK) {
      // sparse: every 4 weeks
      for (let w = 0; w < 53; w += 4) {
        const s = makeTextSprite(`W${w + 1}`, { fontSize: 36, scale: 0.012, color: "rgba(200,210,225,0.6)" });
        s.position.set(x, 0.4, zForRow(w, 53));
        rowLabels.add(s);
      }
    } else {
      // months as anchor labels at day-rows
      for (let m = 0; m < 12; m++) {
        const doyAtMonthStart = Math.floor((m * 365) / 12);
        const s = makeTextSprite(MONTH_LABELS[m], { fontSize: 36, scale: 0.012, color: "rgba(200,210,225,0.55)" });
        s.position.set(x, 0.4, zForRow(doyAtMonthStart, 366));
        rowLabels.add(s);
      }
    }
    root.add(rowLabels);
  }

  // ─── CAMERA + MANUAL CONTROLS ─────────────────────────────────────
  const camTarget = new THREE.Vector3(0, 0, 0);
  // Spherical-ish camera: radius, polar (down from +Y), azimuth (around Y from +Z)
  const camState = {
    radius: gridWidth * 0.65,
    polar: Math.PI * 0.28,    // slightly lower angle — more dramatic
    azimuth: 0.15,              // slight angle offset for depth
    minRadius: 4,
    maxRadius: gridWidth * 2.0,
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
        seg.mesh.material.emissiveIntensity = hoveredPrism.baseEmissive || 0.15;
        if (seg.edge) seg.edge.material.opacity = 0.25;
      }
    }
    hoveredPrism = prism;
    if (hoveredPrism) {
      // Glow edges + bump emissive only — no transform, no jump
      for (const seg of hoveredPrism.segments || []) {
        seg.mesh.material.emissiveIntensity = 0.6;
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
    const fitRadius = gridDepth * 0.7;
    animateCameraTo({ x: targetX, y: 0, z: 0, radius: fitRadius, azimuth: 0 }, { duration: 1.0 });
  }

  // ─── PREZI-STYLE FOCUS MODE ──────────────────────────────────────
  // True anchor zoom: hide other prisms, spawn a 3D title billboard
  // next to the focused prism, drop a glowing ground halo beneath it,
  // and shift the scene environment. Restoring removes the anchor content.
  const ENV_MASTER = { fogDensity: 0.008, fogColor: new THREE.Color(0x1a1430), exposure: 1.3 };
  const ENV_FOCUS  = { fogDensity: 0.025, fogColor: new THREE.Color(0x080418), exposure: 1.7 };
  let focusedPrism = null;
  let envTween = null;
  let anchorGroup = null; // Holds the in-scene anchor content (title plane + ground halo)

  function makeTitlePlane(text, hexColor) {
    const w = 2048, h = 512;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d");
    // Subtle backdrop tint
    ctx.fillStyle = "rgba(10, 8, 24, 0.0)";
    ctx.fillRect(0, 0, w, h);
    // Render multi-line title centered
    ctx.fillStyle = "#f6f4ff";
    ctx.font = `400 220px "Instrument Serif", Georgia, serif`;
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
      gsap.to(titlePlane.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: "back.out(1.6)", delay: 0.25 });
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
      const targetOpacity = isFocused ? 0.85 : 0.10;
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
      color: "#ffffff",
      transparent: true,
      opacity: 1.0,
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
      opacity: 0.45,
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
        seg.mesh.material.opacity = matches ? 0.7 : 0.10;
        seg.mesh.material.emissiveIntensity = matches ? (p.baseEmissive || 0.15) : 0.02;
        if (seg.edge) seg.edge.material.opacity = matches ? 0.25 : 0.04;
      }
    }
  }
  function applySelectionToPrisms() {
    clearSelectionVisuals();
    for (const p of entryPrisms) {
      const sel = selectedEntryId != null && p.entries.some(e => e.id === selectedEntryId);
      if (sel) {
        for (const seg of p.segments || []) {
          seg.mesh.material.emissiveIntensity = 1.2;
          if (seg.edge) seg.edge.material.opacity = 1.0;
        }
        showSelectionVisuals(p);
      } else {
        for (const seg of p.segments || []) {
          seg.mesh.material.emissiveIntensity = p.baseEmissive || 0.15;
          if (seg.edge) seg.edge.material.opacity = 0.25;
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

    // Auto-rotation disabled — user controls camera explicitly

    // Billboard title text always faces the camera
    if (anchorGroup) {
      anchorGroup.children.forEach((child) => {
        if (child.userData?.isBillboard) child.lookAt(camera.position);
      });
    }

    composer.render();
    needsRender = false;
  }
  loop();

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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    scheduleRender();
  }
  resize();
  ensureLOD();

  // ─── API ─────────────────────────────────────────────────────────
  return {
    setZoom(percent) {
      // slider 80..210 -> radius mapped inverse (bigger % => closer)
      const t = (percent - 80) / (210 - 80);
      const clamped = Math.max(0, Math.min(1, t));
      camState.radius = camState.maxRadius - clamped * (camState.maxRadius - camState.minRadius);
      applyCamera();
      ensureLOD();
      scheduleRender();
    },
    resetView() {
      // Animate back to master view with environment reset
      const gsap = window.gsap;
      selectedEntryId = null;
      setSceneFocus(null);
      if (gsap) {
        animateCameraTo({
          x: 0, y: 0, z: 0,
          radius: gridWidth * 0.65,
          azimuth: 0.15,
          polar: Math.PI * 0.28,
        }, { duration: 0.9, ease: "power3.inOut" });
      } else {
        camState.radius = gridWidth * 0.65;
        camState.azimuth = 0.15;
        camState.polar = Math.PI * 0.28;
        camTarget.set(0, 0, 0);
        applyCamera();
        ensureLOD();
        scheduleRender();
      }
      applySelectionToPrisms();
    },
    selectEntry(entry, opts = {}) {
      const wasSelected = selectedEntryId != null;
      selectedEntryId = entry?.id ?? null;
      if (entry == null) {
        // Zoom-out: restore master view + environment
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
          const baseY = prism ? prism.baseHeight * 0.65 : 2;
          // Center on the prism+title stack (title is at top + 1.6)
          const targetX = baseX;
          const targetZ = baseZ;
          // Aim slightly above prism's center so the title billboard is in the upper third of the view
          const targetY = baseY + 0.5;
          // Pull camera back to comfortably see prism + title above it within the top 60% of screen
          const focusRadius = 6;
          animateCameraTo({
            x: targetX, y: targetY, z: targetZ,
            radius: focusRadius,
            polar: Math.PI * 0.42,
            azimuth: 0,
          }, { duration: wasSelected ? 0.8 : 1.4, ease: "power3.inOut" });
          setSceneFocus(prism);
        }
      }
      applySelectionToPrisms();
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
      };
      applyFiltersToPrisms();
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
