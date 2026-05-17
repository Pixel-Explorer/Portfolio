// Spatial archive view — v3 (transposed grid + semantic zoom)
// Years on X-axis (columns), time-units on Z-axis (rows): months -> weeks -> days
// Glass prism aesthetic per Design doc.txt

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

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
  scene.background = new THREE.Color("#0e1218");
  scene.fog = new THREE.Fog("#0e1218", gridWidth * 0.7, gridWidth * 2.2);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, gridWidth * 4);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  // Environment map for glass reflections — RoomEnvironment per design doc
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;

  // ─── LIGHTS ───────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight("#f5f0e8", 0.5));
  const key = new THREE.DirectionalLight("#ffffff", 1.4);
  key.position.set(gridWidth * 0.5, 40, 24);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -gridWidth;
  key.shadow.camera.right = gridWidth;
  key.shadow.camera.top = gridDepth;
  key.shadow.camera.bottom = -gridDepth;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 120;
  scene.add(key);

  const fillNeon = new THREE.PointLight("#00ff88", 30, 60, 2);
  fillNeon.position.set(0, 12, 0);
  scene.add(fillNeon);

  const fillCool = new THREE.PointLight("#4488ff", 18, 80, 2);
  fillCool.position.set(-gridWidth * 0.4, 18, -gridDepth * 0.4);
  scene.add(fillCool);

  // ─── GROUPS ───────────────────────────────────────────────────────
  const root = new THREE.Group();
  scene.add(root);

  const basePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth + 4, gridDepth + 4),
    new THREE.MeshStandardMaterial({
      color: "#161c25",
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  basePlane.rotation.x = -Math.PI / 2;
  basePlane.position.y = -0.01;
  basePlane.receiveShadow = true;
  root.add(basePlane);

  // Subtle floor grid
  const floorGrid = new THREE.GridHelper(Math.max(gridWidth, gridDepth) + 4, 36, "#2a3140", "#1a1f28");
  floorGrid.position.y = 0.005;
  root.add(floorGrid);

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
    const geom = new THREE.BoxGeometry(Math.max(cellW, 0.02), 0.3, Math.max(cellD, 0.02));
    const mat = new THREE.MeshPhysicalMaterial({
      color: "#3a4150",
      transparent: true,
      opacity: 0.18,
      roughness: 0.4,
      metalness: 0.1,
      transmission: 0.0,
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

    const heightUnit = 1.6;
    for (const g of groups) {
      const tags = [...new Set(g.entries.flatMap(e => e.tags || []))];
      const dominant = pickDominantTag(tags);
      const color = TAG_COLORS[dominant] || "#00cc66";
      const count = g.entries.length;
      const hasMilestone = tags.includes("Milestone");
      const hasThrough = tags.includes("ThroughLine");
      const heightScore = Math.min(10, count * 1.2 + (hasMilestone ? 4 : 0) + (hasThrough ? 2 : 0));
      const height = Math.max(1.2, heightScore) * heightUnit;

      const geom = new THREE.BoxGeometry(g.cellW * 0.9, height, g.cellD * 0.9);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.55,
        roughness: 0.08,
        metalness: 0.18,
        transmission: 0.55,
        thickness: 1.2,
        ior: 1.45,
        envMapIntensity: 1.4,
        clearcoat: 0.6,
        clearcoatRoughness: 0.15,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(g.x, height / 2, g.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Inner glow core
      const glowGeom = new THREE.BoxGeometry(g.cellW * 0.45, height * 0.86, g.cellD * 0.45);
      const glowMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.85,
        transparent: true,
        opacity: 0.5,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.position.set(g.x, height / 2, g.z);

      const group = new THREE.Group();
      group.add(mesh);
      group.add(glow);
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
        baseEmissive: 0.85,
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
    radius: gridWidth * 0.9,
    polar: Math.PI * 0.32,    // ~57° down from +Y => isometric-ish
    azimuth: 0,                 // looking along -Z
    minRadius: 6,
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
  function scheduleRender() { needsRender = true; }
  function loop() {
    if (!running) return;
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    requestAnimationFrame(loop);
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
      camState.radius = gridWidth * 0.9;
      camState.azimuth = 0;
      camState.polar = Math.PI * 0.32;
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
