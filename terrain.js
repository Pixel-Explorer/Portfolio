import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const categoryColors = {
  Founder: "#2f6fa3",
  Designer: "#b4892f",
  Film: "#b45149",
  AIESEC: "#7558a6",
  Web3: "#29746d",
  Strategy: "#6d8547",
  Milestone: "#1f7a4a",
};

const densityColors = ["#e7dfcf", "#cfe2a5", "#96cf6f", "#48a866", "#17754a"];

export function createArchiveTerrain(options) {
  const {
    container,
    years,
    weeks,
    entries,
    weeklyEmailCounts,
    maxEmailCount,
    getWeekEntries,
    getTone,
    getDominantKind,
    getStrongestEntry,
    onHover,
    onMove,
    onLeave,
    onSelectEntry,
    onSelectWeek,
  } = options;

  if (!container) throw new Error("Terrain container missing.");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f0e7");
  scene.fog = new THREE.Fog("#f4f0e7", 34, 72);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.replaceChildren(renderer.domElement);

  const mapGroup = new THREE.Group();
  scene.add(mapGroup);

  const ambient = new THREE.HemisphereLight("#fff8ed", "#e2d5c0", 2.35);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight("#fff3df", 1.55);
  keyLight.position.set(-18, 24, 16);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight("#d6e8ff", 1.55);
  rimLight.position.set(24, 14, -26);
  scene.add(rimLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 30),
    new THREE.MeshStandardMaterial({
      color: "#eee7d9",
      roughness: 0.94,
      metalness: 0.02,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  mapGroup.add(floor);

  const grid = new THREE.GridHelper(62, 53, "#d2cabc", "#e8dfd0");
  grid.position.y = 0.01;
  grid.scale.z = 0.42;
  mapGroup.add(grid);

  const lineGroup = new THREE.Group();
  mapGroup.add(lineGroup);

  const lineMaterial = new THREE.LineBasicMaterial({ 
    color: 0x9ccd75, 
    transparent: true, 
    opacity: 0.8, 
    linewidth: 2 
  });

  const weekMeta = [];
  const weekIndex = new Map();
  const geometry = new THREE.BoxGeometry(0.68, 1, 0.68);
  const blockMeshes = [];
  const materialCache = new Map();

  let instance = 0;
  const centerWeek = 27;
  const centerYear = (years.length - 1) / 2;
  for (let y = 0; y < years.length; y += 1) {
    for (let w = 0; w < weeks.length; w += 1) {
      const year = years[y];
      const week = weeks[w];
      const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
      const meta = {
        instance,
        weekKey,
        year,
        week,
        x: (week - centerWeek) * 0.86,
        z: (y - centerYear) * 1.06,
        baseZ: (y - centerYear) * 1.06,
        elasticZ: 0,
        targetElasticZ: 0,
        weight: 1
      };
      weekMeta[instance] = meta;
      weekIndex.set(weekKey, meta);
      const block = new THREE.Mesh(geometry, getMaterial("#e7dfcf"));
      block.userData.meta = meta;
      block.castShadow = false;
      block.receiveShadow = false;
      blockMeshes[instance] = block;
      mapGroup.add(block);
      instance += 1;
    }
  }

  const selectedMarker = makeMarker("#111820", 0.9);
  const hoverMarker = makeMarker("#ffffff", 0.78);
  selectedMarker.visible = false;
  hoverMarker.visible = false;
  mapGroup.add(selectedMarker, hoverMarker);

  for (const year of years.filter((year) => year % 2 === 0 || year === years[0] || year === years[years.length - 1])) {
    const index = years.indexOf(year);
    const sprite = makeTextSprite(String(year), "#586069");
    sprite.position.set(-25.8, 0.22, (index - centerYear) * 1.06);
    sprite.scale.set(1.8, 0.54, 1);
    mapGroup.add(sprite);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const look = new THREE.Vector3(0, 0, 0);
  const lookTarget = new THREE.Vector3(0, 0, 0);
  const cameraTarget = new THREE.Vector3(20, 17, 25);
  const baseCamera = new THREE.Vector3(20, 17, 25);

  let selectedWeek = "";
  let hoverWeek = "";
  let hasFilter = false;
  let matchingWeekKeys = new Set();
  let dragStart = null;
  let rotationTarget = -0.16;
  let rotationCurrent = -0.16;
  let zoomValue = 100;
  let disposed = false;

  refreshInstances();
  resize();
  animate();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);
  renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

  function refreshInstances() {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (const meta of weekMeta) {
      const weekEntries = getWeekEntries(meta.weekKey);
      const emailCount = Number(weeklyEmailCounts[meta.weekKey] || 0);
      const tone = getTone(weekEntries.length, emailCount);
      meta.weight = 1 + tone; // heavier weight for more entries/emails
      
      const hasEntry = weekEntries.length > 0;
      const dimmed = hasFilter && hasEntry && !matchingWeekKeys.has(meta.weekKey);
      const selected = meta.weekKey === selectedWeek;
      const hovered = meta.weekKey === hoverWeek;
      const emailLift = (emailCount / Math.max(1, maxEmailCount)) * 0.34;
      const height = dimmed ? 0.08 : 0.12 + tone * 0.2 + weekEntries.length * 0.14 + emailLift + (selected ? 0.34 : 0) + (hovered ? 0.18 : 0);

      position.set(meta.x, height / 2, meta.baseZ + meta.elasticZ);
      scale.set(1, Math.max(0.05, height), 1);
      const block = blockMeshes[meta.instance];
      block.position.copy(position);
      block.quaternion.copy(quaternion);
      block.scale.copy(scale);
      block.material = getMaterial(makeBlockColor(meta.weekKey, tone, dimmed, selected, hovered));
    }

    updateMarker(selectedMarker, selectedWeek, 0.42);
    updateMarker(hoverMarker, hoverWeek, 0.32);
    
    // Jungheonlee: Draw Spatial Constellation Lines
    lineGroup.clear();
    if (hasFilter && matchingWeekKeys.size > 1) {
      const sortedKeys = Array.from(matchingWeekKeys).sort();
      const points = [];
      for (const key of sortedKeys) {
        const m = weekIndex.get(key);
        if (m) {
          points.push(new THREE.Vector3(m.x, 0.5, m.baseZ + m.elasticZ));
        }
      }
      if (points.length > 1) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeo, lineMaterial);
        lineGroup.add(line);
      }
    }
  }

  function makeBlockColor(weekKey, tone, dimmed, selected, hovered) {
    if (dimmed) return "#d9d2c3";
    if (selected) return "#223040";
    if (hovered) return "#f8f4ea";
    const kind = getDominantKind(getWeekEntries(weekKey));
    if (kind && categoryColors[kind]) return categoryColors[kind];
    return densityColors[tone] || densityColors[0];
  }

  function getMaterial(color) {
    if (!materialCache.has(color)) {
      materialCache.set(color, new THREE.MeshBasicMaterial({ color }));
    }
    return materialCache.get(color);
  }

  function updateMarker(marker, weekKey, lift) {
    const meta = weekIndex.get(weekKey);
    if (!meta) {
      marker.visible = false;
      return;
    }
    const weekEntries = getWeekEntries(meta.weekKey);
    const emailCount = Number(weeklyEmailCounts[meta.weekKey] || 0);
    const tone = getTone(weekEntries.length, emailCount);
    const height = 0.12 + tone * 0.2 + weekEntries.length * 0.14 + lift;
    marker.position.set(meta.x, height, meta.baseZ + meta.elasticZ);
    marker.visible = true;
  }

  function focusWeek(weekKey) {
    const meta = weekIndex.get(weekKey);
    if (!meta) return;
    lookTarget.set(meta.x, 0.7, meta.z);
    const depth = 1 - Math.min(0.52, Math.max(0, zoomValue - 100) / 220);
    cameraTarget.set(meta.x + 8 * depth, 8.8 * depth + 2.2, meta.z + 9 * depth);
  }

  function resetView() {
    lookTarget.set(0, 0, 0);
    const factor = zoomFactor();
    cameraTarget.copy(baseCamera).multiplyScalar(factor);
    rotationTarget = -0.16;
  }

  function setZoom(value) {
    zoomValue = Number(value);
    if (selectedWeek) focusWeek(selectedWeek);
    else {
      const factor = zoomFactor();
      cameraTarget.copy(baseCamera).multiplyScalar(factor);
    }
  }

  function zoomFactor() {
    return 1.12 - (Math.max(80, Math.min(210, zoomValue)) - 80) / 230;
  }

  function handlePointerMove(event) {
    if (dragStart) {
      const dx = event.clientX - dragStart.x;
      rotationTarget = dragStart.rotation + dx * 0.004;
      onMove?.(event);
      return;
    }

    const hit = pick(event);
    if (hit) {
      const meta = hit.object.userData.meta;
      renderer.domElement.style.cursor = "pointer";
      if (meta.weekKey !== hoverWeek) {
        hoverWeek = meta.weekKey;
        refreshInstances();
        onHover?.(event, meta.weekKey);
      } else {
        onMove?.(event);
      }
    } else {
      renderer.domElement.style.cursor = "grab";
      handlePointerLeave();
    }
  }

  function handlePointerLeave() {
    if (!hoverWeek) return;
    hoverWeek = "";
    refreshInstances();
    onLeave?.();
  }

  function handlePointerDown(event) {
    dragStart = { x: event.clientX, rotation: rotationTarget };
    renderer.domElement.setPointerCapture?.(event.pointerId);
    renderer.domElement.style.cursor = "grabbing";
  }

  function handlePointerUp(event) {
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    const moved = dragStart ? Math.abs(event.clientX - dragStart.x) : 0;
    dragStart = null;
    renderer.domElement.style.cursor = "grab";
    if (moved > 6) return;

    const hit = pick(event);
    if (!hit) return;
    const meta = hit.object.userData.meta;
    const weekEntries = getWeekEntries(meta.weekKey);
    if (weekEntries.length) onSelectEntry?.(getStrongestEntry(weekEntries).id);
    else onSelectWeek?.(meta.weekKey);
  }

  let scrollVelocity = 0;

  function handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY * -0.08;
    const nextZoom = Math.max(80, Math.min(210, zoomValue + delta));
    setZoom(nextZoom);
    
    // Morten Stig Christensen Elastic Physics
    scrollVelocity = Math.min(2, Math.max(-2, scrollVelocity + event.deltaY * 0.02));
  }

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(blockMeshes, false)[0];
  }

  function resize() {
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(360, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    camera.position.lerp(cameraTarget, 0.075);
    look.lerp(lookTarget, 0.09);
    rotationCurrent += (rotationTarget - rotationCurrent) * 0.08;
    mapGroup.rotation.y = rotationCurrent;
    camera.lookAt(look);
    
    // Apply Elastic Physics
    scrollVelocity *= 0.85; // dampening
    let needsRefresh = false;
    for (const meta of weekMeta) {
      // items react elastically based on weight
      meta.targetElasticZ = scrollVelocity * (5 / meta.weight);
      const diff = meta.targetElasticZ - meta.elasticZ;
      if (Math.abs(diff) > 0.01) {
        meta.elasticZ += diff * 0.15; // rubber banding
        needsRefresh = true;
      } else if (meta.elasticZ !== 0 && Math.abs(meta.elasticZ) < 0.01) {
        meta.elasticZ = 0;
        needsRefresh = true;
      }
    }
    
    if (needsRefresh) refreshInstances();

    renderer.render(scene, camera);
  }

  return {
    updateFilters(next) {
      hasFilter = next.hasFilter;
      matchingWeekKeys = next.matchingWeekKeys || new Set();
      refreshInstances();
    },
    selectEntry(entry, config = {}) {
      selectedWeek = entry.weekKey;
      refreshInstances();
      if (config.focus) focusWeek(entry.weekKey);
    },
    selectWeek(weekKey, config = {}) {
      selectedWeek = weekKey;
      refreshInstances();
      if (config.focus) focusWeek(weekKey);
    },
    setZoom,
    resetView,
    dispose() {
      disposed = true;
      resizeObserver.disconnect();
      renderer.dispose();
      geometry.dispose();
      for (const cachedMaterial of materialCache.values()) cachedMaterial.dispose();
    },
  };
}

function makeMarker(color, opacity) {
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.08, 0.94),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      wireframe: true,
    }),
  );
  return marker;
}

function makeTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = "700 38px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  return new THREE.Sprite(material);
}
