/* =====================================================================
   LANDING 3D BACKGROUND — persistent Three.js canvas behind landing DOM
   Loaded via import map (same CDN version as archive app).
   Exports: createLandingScene(container) => { update(t), dispose() }
   ===================================================================== */

import * as THREE from 'three';

const CAMERA_FOV = 45;
const NEAR = 0.1;
const FAR = 500;

/* camera keyframes per beat — the city glides past as user scrolls */
const BEAT_CAMS = [
  // beat 1 — low & close, looking up at the towers
  { x: 0, y: -4, z: 18, tx: 0, ty: 4, tz: 0 },
  // beat 2 — rise a bit, pan right
  { x: 6, y: 2, z: 22, tx: 0, ty: 2, tz: 0 },
  // beat 3 — pull back, center
  { x: 0, y: 6, z: 28, tx: 0, ty: 0, tz: 0 },
  // beat 4 — ascend, look down
  { x: -2, y: 14, z: 24, tx: 0, ty: -4, tz: 0 },
  // beat 5 — slide left, orbit
  { x: -10, y: 4, z: 26, tx: 0, ty: 2, tz: 0 },
  // beat 6 — push in tight
  { x: 2, y: 8, z: 16, tx: 0, ty: 2, tz: 0 },
  // beat 7 — pull way back, full city
  { x: 0, y: 12, z: 40, tx: 0, ty: 0, tz: 0 },
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpVec(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

export async function createLandingScene(container) {
  if (!container) return null;

  /* ---- scene ---- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  scene.fog = new THREE.FogExp2(0x0a0a0a, 0.012);

  /* ---- camera ---- */
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    container.clientWidth / container.clientHeight,
    NEAR,
    FAR
  );

  /* ---- renderer ---- */
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  container.appendChild(renderer.domElement);

  /* ---- lights ---- */
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffeedd, 1.8);
  key.position.set(20, 30, 10);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
  fill.position.set(-10, 10, -20);
  scene.add(fill);

  /* ---- atmosphere particles ---- */
  const particleGeo = new THREE.BufferGeometry();
  const particleCount = 800;
  const pos = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount * 3; i++) {
    pos[i] = (Math.random() - 0.5) * 120;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0x6666aa,
    size: 0.15,
    transparent: true,
    opacity: 0.4,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.position.y = -10;
  scene.add(particles);

  /* ---- ground grid (subtle depth cue) ---- */
  const grid = new THREE.GridHelper(80, 40, 0x444488, 0x222244);
  grid.position.y = -6;
  scene.add(grid);

  /* ---- procedural city blocks ---- */
  const blockGroup = new THREE.Group();
  const blockMat = new THREE.MeshPhysicalMaterial({
    color: 0x222244,
    metalness: 0.3,
    roughness: 0.7,
    transparent: true,
    opacity: 0.7,
  });
  const blockMatHighlight = new THREE.MeshPhysicalMaterial({
    color: 0x4444aa,
    metalness: 0.5,
    roughness: 0.4,
    transparent: true,
    opacity: 0.9,
  });

  for (let i = 0; i < 120; i++) {
    const w = 0.3 + Math.random() * 1.2;
    const d = 0.3 + Math.random() * 1.2;
    const h = 0.3 + Math.random() * 6;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = i % 7 === 0 ? blockMatHighlight : blockMat;
    const mesh = new THREE.Mesh(geo, mat);
    const angle = Math.random() * Math.PI * 2;
    const radius = 4 + Math.random() * 28;
    mesh.position.set(
      Math.cos(angle) * radius,
      -6 + h / 2,
      Math.sin(angle) * radius
    );
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    blockGroup.add(mesh);
  }
  scene.add(blockGroup);

  /* ---- glowing accent points (like lit windows) ---- */
  const glowGeo = new THREE.BufferGeometry();
  const glowCount = 400;
  const glowPos = new Float32Array(glowCount * 3);
  for (let i = 0; i < glowCount * 3; i += 3) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2 + Math.random() * 30;
    glowPos[i] = Math.cos(angle) * radius;
    glowPos[i + 1] = -5 + Math.random() * 10;
    glowPos[i + 2] = Math.sin(angle) * radius;
  }
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  const glowMat = new THREE.PointsMaterial({
    color: 0xffdd44,
    size: 0.08,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });
  const glowPoints = new THREE.Points(glowGeo, glowMat);
  scene.add(glowPoints);

  /* ---- initial camera ---- */
  const c0 = BEAT_CAMS[0];
  camera.position.set(c0.x, c0.y, c0.z);
  camera.lookAt(c0.tx, c0.ty, c0.tz);

  /* ---- resize ---- */
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  /* ---- render loop (on-demand via tick) ---- */
  let needsRender = true;
  function render() {
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
  }

  /* ---- public: update scroll progress 0..1 ---- */
  let currentProgress = 0;
  function update(progress) {
    currentProgress = progress;
    needsRender = true;

    // Beat-to-beat camera interpolation
    const totalBeats = BEAT_CAMS.length;
    const rawBeat = progress * totalBeats;
    const beatIdx = Math.min(Math.floor(rawBeat), totalBeats - 2);
    const t = Math.min(rawBeat - beatIdx, 1);

    const a = BEAT_CAMS[Math.max(0, beatIdx)];
    const b = BEAT_CAMS[Math.min(totalBeats - 1, beatIdx + 1)];

    const pos = lerpVec(a, b, t);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(
      lerp(a.tx, b.tx, t),
      lerp(a.ty, b.ty, t),
      lerp(a.tz, b.tz, t)
    );

    // Atmosphere shift: fog density changes with progress
    scene.fog.density = 0.008 + progress * 0.01;

    // Particles drift
    particles.position.y = -10 - progress * 4;

    render();
  }

  /* ---- force one initial render ---- */
  update(0);

  /* ---- cleanup ---- */
  function dispose() {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  }

  return { update, dispose };
}
