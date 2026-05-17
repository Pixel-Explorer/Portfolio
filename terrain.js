// Spatial archive view — v3 (transposed grid + semantic zoom)
// Years on X-axis (columns), time-units on Z-axis (rows): months -> weeks -> days
// Glass prism aesthetic per Design doc.txt

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const TAG_COLORS = {
  Milestone:       "#00cc66",
  Designer:        "#4488ff",
  Film:            "#cc44ff",
  Founder:         "#ff8800",
  Studio:          "#00bbcc",
  Photographer:    "#ff4466",
  AIESEC:          "#ffdd00",
  Job:             "#88cc44",
  Web3:            "#8855ff",
  Education:       "#44ccff",
  Personal:        "#ff6688",
  Earnings:        "#00ff88",
  Travel:          "#ff9944",
  Strategy:        "#aabbcc",
  ThroughLine:     "#cc0022",
  Leadership:      "#ffaa00",
  Cinematographer: "#dd22ff",
  Teacher:         "#66ff88",
  Volunteer:       "#ff6622",
  Animation:       "#ff44aa",
  MusicVideo:      "#cc88ff",
  Documentary:     "#44ffdd",
  Corporate:       "#778899",
  Tech:            "#00ffff",
};

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
  scene.background = new THREE.Color("#060a10");
  scene.fog = new THREE.FogExp2("#060a10", 0.006);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, gridWidth * 4);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  // Post-processing: bloom for neon glow bleed
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2,   // strength — cranked for neon bleed
    0.6,   // radius — wider glow spread
    0.3,   // threshold — catch more emissive surfaces
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

  // Neon green center glow — the signature SaaSAssetLab look
  const fillNeon = new THREE.PointLight("#00ff88", 120, 120, 1.8);
  fillNeon.position.set(0, 12, 0);
  scene.add(fillNeon);

  // Cool blue rim from behind-left
  const fillCool = new THREE.PointLight("#4488ff", 80, 140, 1.8);
  fillCool.position.set(-gridWidth * 0.5, 18, -gridDepth * 0.6);
  scene.add(fillCool);

  // Warm accent from right
  const fillWarm = new THREE.PointLight("#ff6622", 50, 100, 1.8);
  fillWarm.position.set(gridWidth * 0.4, 14, gridDepth * 0.3);
  scene.add(fillWarm);

  // Violet back-fill for depth
  const fillViolet = new THREE.PointLight("#8844ff", 40, 100, 1.8);
  fillViolet.position.set(-gridWidth * 0.2, 22, gridDepth * 0.4);
  scene.add(fillViolet);

  // Cyan underlight for floor reflections
  const fillCyan = new THREE.PointLight("#00ccff", 30, 80, 2);
  fillCyan.position.set(gridWidth * 0.2, 1, -gridDepth * 0.3);
  scene.add(fillCyan);

  // ─── GROUPS ───────────────────────────────────────────────────────
  const root = new THREE.Group();
  scene.add(root);

  // Reflective ground plane — glossy dark mirror (Kaspersky/NAVER reference)
  const basePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth * 3, gridDepth * 3),
    new THREE.MeshPhysicalMaterial({
      color: "#080c14",
      roughness: 0.18,
      metalness: 0.85,
      envMapIntensity: 0.6,
      clearcoat: 0.3,
      clearcoatRoughness: 0.15,
    }),
  );
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = -0.01;
  basePlane.receiveShadow = true;
  root.add(basePlane);

  // Glowing grid lines on floor
  const floorGrid = new THREE.GridHelper(
    Math.max(gridWidth, gridDepth) * 1.5, 60,
    new THREE.Color("#1a4060"), new THREE.Color("#0e1e30"),
  );
  floorGrid.position.y = 0.02;
  floorGrid.material.opacity = 0.6;
  floorGrid.material.transparent = true;
  root.add(floorGrid);

  // Radial gradient ground glow (fake volumetric base)
  const glowPlaneGeo = new THREE.PlaneGeometry(gridWidth * 1.5, gridDepth * 1.5);
  const glowPlaneMat = new THREE.MeshBasicMaterial({
    color: "#0a2030",
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowPlane = new THREE.Mesh(glowPlaneGeo, glowPlaneMat);
  glowPlane.rotation.x = -Math.PI / 2;
  glowPlane.position.y = 0.03;
  root.add(glowPlane);

  // ─── FLOATING PARTICLES (atmospheric dust/data motes) ──────────
  const particleCount = 400;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSpeeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3]     = (Math.random() - 0.5) * gridWidth * 2;
    particlePositions[i * 3 + 1] = Math.random() * 25 + 1;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * gridDepth * 2;
    particleSpeeds[i] = 0.002 + Math.random() * 0.008;
  }
  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: "#88ddff",
    size: 0.12,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  root.add(particles);

  // Second particle layer — warm accent motes
  const particle2Count = 150;
  const particle2Geo = new THREE.BufferGeometry();
  const p2Pos = new Float32Array(particle2Count * 3);
  for (let i = 0; i < particle2Count; i++) {
    p2Pos[i * 3]     = (Math.random() - 0.5) * gridWidth * 1.5;
    p2Pos[i * 3 + 1] = Math.random() * 20 + 2;
    p2Pos[i * 3 + 2] = (Math.random() - 0.5) * gridDepth * 1.5;
  }
  particle2Geo.setAttribute("position", new THREE.BufferAttribute(p2Pos, 3));
  const particle2Mat = new THREE.PointsMaterial({
    color: "#00ff88",
    size: 0.06,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles2 = new THREE.Points(particle2Geo, particle2Mat);
  root.add(particles2);

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
  let entryPrisms = []; // {mesh, glow, cellKey, entries, dominantTag, primaryEntryId}
  function clearEntryPrisms() {
    for (const p of entryPrisms) {
      root.remove(p.group);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      if (p.glow) { p.glow.geometry.dispose(); p.glow.material.dispose(); }
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

    // Iterate aggregated groups for this LOD
    let groups; // [{x, z, cellW, cellD, entries, key}]
    if (lod === LOD.MONTH) {
      const rows = 12;
      const cellD = (gridDepth / rows) - cellPad * 2;
      groups = [];
      for (const [key, ents] of entriesByMonth) {
        const [yStr, mStr] = key.split("-");
        const y = Number(yStr);
        const m = Number(mStr);
        const yi = years.indexOf(y);
        if (yi < 0) continue;
        groups.push({
          x: xForYearIndex(yi),
          z: zForRow(m - 1, rows),
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
          z: zForRow(w - 1, rows),
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
        groups.push({
          x: xForYearIndex(yi),
          z: zForRow(doy - 1, rows),
          cellW: Math.max(cellW, 0.02),
          cellD: Math.max(cellD, 0.02),
          entries: ents,
          key,
        });
      }
    }

    const heightUnit = 3.5;
    for (const g of groups) {
      const tags = [...new Set(g.entries.flatMap(e => e.tags || []))];
      const dominant = pickDominantTag(tags);
      const color = TAG_COLORS[dominant] || "#00cc66";
      const count = g.entries.length;
      const hasMilestone = tags.includes("Milestone");
      const hasThrough = tags.includes("ThroughLine");
      const heightScore = Math.min(10, count * 1.2 + (hasMilestone ? 4 : 0) + (hasThrough ? 2 : 0));
      const height = Math.max(1.4, heightScore) * heightUnit;
      const importance = heightScore / 10; // 0..1, drives visual intensity

      // Rounded glass prism — beveled edges like Artem Kazakov cubes
      const bevelRadius = Math.min(g.cellW * 0.12, g.cellD * 0.12, height * 0.06);
      const geom = new RoundedBoxGeometry(g.cellW * 0.88, height, g.cellD * 0.88, 2, bevelRadius);
      const col = new THREE.Color(color);
      const mat = new THREE.MeshPhysicalMaterial({
        color: col,
        transparent: true,
        opacity: 0.55,
        roughness: 0.02,
        metalness: 0.05,
        transmission: 0.85,
        thickness: 3.0,
        ior: 1.45,
        envMapIntensity: 3.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        attenuationColor: col,
        attenuationDistance: 2.0,
        specularIntensity: 1.5,
        specularColor: new THREE.Color("#ffffff"),
        emissive: col,
        emissiveIntensity: 0.15 + importance * 0.3,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(g.x, height / 2, g.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Inner glow core — bright emissive visible through glass shell
      const glowGeom = new RoundedBoxGeometry(
        g.cellW * 0.4, height * 0.82, g.cellD * 0.4,
        2, bevelRadius * 0.6,
      );
      const emissiveStrength = 2.5 + importance * 5.0;
      const glowMat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: emissiveStrength,
        transparent: true,
        opacity: 0.65,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.position.set(g.x, height / 2, g.z);

      // Glowing edge wireframe on glass shell
      const edgeGeo = new THREE.EdgesGeometry(geom);
      const edgeMat = new THREE.LineBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.25 + importance * 0.35,
        linewidth: 1,
      });
      const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLines.position.copy(mesh.position);

      const group = new THREE.Group();
      group.add(mesh);
      group.add(glow);
      group.add(edgeLines);

      // Per-prism point light for important entries — "lit from within"
      if (importance > 0.25) {
        const prismLight = new THREE.PointLight(color, 8 + importance * 25, 10 + importance * 10, 1.8);
        prismLight.position.set(g.x, height * 0.6, g.z);
        group.add(prismLight);
      }

      root.add(group);

      const primary = strongestEntry(g.entries);
      entryPrisms.push({
        group, mesh, glow,
        cellKey: g.key,
        entries: g.entries,
        dominantTag: dominant,
        primaryEntryId: primary?.id,
        baseHeight: height,
        baseColor: color,
        baseEmissive: emissiveStrength,
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
    const meshes = entryPrisms.map(p => p.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hitMesh = hits[0].object;
    return entryPrisms.find(p => p.mesh === hitMesh) || null;
  }

  function setHovered(prism, event) {
    if (hoveredPrism === prism) return;
    if (hoveredPrism) {
      hoveredPrism.mesh.scale.set(1, 1, 1);
      hoveredPrism.glow.material.emissiveIntensity = hoveredPrism.baseEmissive;
    }
    hoveredPrism = prism;
    if (hoveredPrism) {
      hoveredPrism.mesh.scale.set(1.06, 1.04, 1.06);
      hoveredPrism.glow.material.emissiveIntensity = 1.6;
      showTerrainTooltip(hoveredPrism, event);
      const wk = hoveredPrism.entries[0]?.weekKey || hoveredPrism.cellKey;
      if (onHover) onHover(event, wk);
      renderer.domElement.style.cursor = "pointer";
    } else {
      hideTerrainTooltip();
      renderer.domElement.style.cursor = "grab";
      if (onLeave) onLeave();
    }
  }

  let lastDragEvent = { x: 0, y: 0, time: 0 };
  renderer.domElement.addEventListener("pointerdown", (e) => {
    isDragging = true;
    dragMoved = false;
    dragStart = { x: e.clientX, y: e.clientY, az: camState.azimuth, pol: camState.polar };
    lastDragEvent = { x: e.clientX, y: e.clientY, time: performance.now() };
    dragVelocity = { az: 0, pol: 0 };
    if (dampingRaf) { cancelAnimationFrame(dampingRaf); dampingRaf = null; }
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = "grabbing";
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
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

  // ─── SELECTION WIREFRAME RING + TOP LIGHT ────────────────────────
  let selectionRing = null;
  let selectionLight = null;
  function clearSelectionVisuals() {
    if (selectionRing) { selectionRing.parent?.remove(selectionRing); selectionRing.geometry.dispose(); selectionRing.material.dispose(); selectionRing = null; }
    if (selectionLight) { selectionLight.parent?.remove(selectionLight); selectionLight = null; }
  }
  function showSelectionVisuals(prism) {
    clearSelectionVisuals();
    const edges = new THREE.EdgesGeometry(prism.mesh.geometry);
    selectionRing = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 }));
    selectionRing.position.copy(prism.mesh.position);
    selectionRing.scale.setScalar(1.01);
    root.add(selectionRing);
    selectionLight = new THREE.PointLight(prism.baseColor, 15, 12, 2);
    selectionLight.position.set(prism.mesh.position.x, prism.mesh.position.y + prism.baseHeight / 2 + 1.5, prism.mesh.position.z);
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
    projVec.set(prism.mesh.position.x, prism.mesh.position.y + prism.baseHeight / 2 + 0.5, prism.mesh.position.z);
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
      p.mesh.material.opacity = matches ? 0.55 : 0.12;
      p.glow.material.opacity = matches ? 0.5 : 0.08;
      p.glow.material.emissiveIntensity = matches ? p.baseEmissive : 0.15;
    }
  }
  function applySelectionToPrisms() {
    clearSelectionVisuals();
    for (const p of entryPrisms) {
      const sel = selectedEntryId != null && p.entries.some(e => e.id === selectedEntryId);
      p.group.scale.setScalar(sel ? 1.04 : 1.0);
      if (sel) {
        p.glow.material.emissiveIntensity = 2.0;
        showSelectionVisuals(p);
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

    // Subtle idle auto-rotation when not interacting
    if (!isDragging && !dampingRaf) {
      camState.azimuth += 0.0003;
      applyCamera();
    }

    // Breathing pulse on glow cores
    const breathe = Math.sin(animTime * 1.2) * 0.15 + 1.0;
    for (const p of entryPrisms) {
      p.glow.material.emissiveIntensity = p.baseEmissive * breathe;
      p.glow.scale.y = 0.98 + Math.sin(animTime * 0.8 + p.mesh.position.x * 0.3) * 0.02;
    }

    // Animate particles
    const posArr = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      posArr[i * 3 + 1] += particleSpeeds[i];
      if (posArr[i * 3 + 1] > 28) {
        posArr[i * 3 + 1] = 0.5;
        posArr[i * 3] = (Math.random() - 0.5) * gridWidth * 2;
        posArr[i * 3 + 2] = (Math.random() - 0.5) * gridDepth * 2;
      }
      posArr[i * 3] += Math.sin(animTime * 0.5 + i) * 0.003;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    // Animate green accent particles — gentle drift
    const p2Arr = particles2.geometry.attributes.position.array;
    for (let i = 0; i < particle2Count; i++) {
      p2Arr[i * 3 + 1] += 0.003 + Math.sin(animTime + i * 0.7) * 0.002;
      p2Arr[i * 3] += Math.cos(animTime * 0.3 + i) * 0.004;
      if (p2Arr[i * 3 + 1] > 24) {
        p2Arr[i * 3 + 1] = 1;
        p2Arr[i * 3] = (Math.random() - 0.5) * gridWidth * 1.5;
        p2Arr[i * 3 + 2] = (Math.random() - 0.5) * gridDepth * 1.5;
      }
    }
    particles2.geometry.attributes.position.needsUpdate = true;

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
      camState.radius = gridWidth * 0.65;
      camState.azimuth = 0.15;
      camState.polar = Math.PI * 0.28;
      camTarget.set(0, 0, 0);
      applyCamera();
      ensureLOD();
      scheduleRender();
    },
    selectEntry(entry, opts = {}) {
      selectedEntryId = entry?.id ?? null;
      if (opts.focus && entry?.year) {
        const yi = years.indexOf(Number(entry.year));
        if (yi >= 0) {
          animateCameraTo({ x: xForYearIndex(yi) }, { duration: 0.7 });
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
