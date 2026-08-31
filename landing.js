import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const log = DEBUG ? console.log.bind(console, '[landing]') : () => {};
const PREFERS_REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches || window.innerWidth < 800;

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

// Global interactive state
window.mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.ctaExploded = false;

window.addEventListener('mousemove', (e) => {
  window.mousePos.x = e.clientX;
  window.mousePos.y = e.clientY;
});

// Three.js & Post-Processing Variables
let scene, camera, renderer, composer;
let bloomPass, renderPass;
let obsidianFloor, gridOverlay;
let ambientLight, keyLight, fillLight, cursorPointLight;
let buildingGroups = [];
let magneticArtifacts = [];
let particleSystem = null;
let cityModel = null;

// Background city preloader state
const cityLoad = { pct: 0, done: false };
if (COARSE) {
  cityLoad.done = true;
  cityLoad.pct = 100;
}

// ---------------------------------------------------------------------
// 1. Initialize AAA Three.js Scene, PBR Lighting & Bloom Post-Processing
// ---------------------------------------------------------------------
function initThree() {
  const canvas = document.getElementById('landingCanvas');
  if (!canvas || COARSE || PREFERS_REDUCED_MOTION) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x040507, 0.0003);

  camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 25000);
  camera.position.set(0, 24, 60);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(0x040507, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  // Post-Processing EffectComposer (UnrealBloomPass)
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.65, // strength
    0.4,  // radius
    0.82  // threshold
  );
  composer.addPass(bloomPass);

  // Dark Obsidian Reflective Ground Plane
  const floorGeom = new THREE.PlaneGeometry(40000, 40000);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x030406,
    roughness: 0.08,
    metalness: 0.96
  });
  obsidianFloor = new THREE.Mesh(floorGeom, floorMat);
  obsidianFloor.rotation.x = -Math.PI / 2;
  obsidianFloor.position.set(0, -2, -12000);
  scene.add(obsidianFloor);

  // Subtle Wireframe Grid Overlay on Obsidian Floor
  const gridGeom = new THREE.PlaneGeometry(40000, 40000);
  const gridMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPosition;
      uniform vec3 uGridColor;
      uniform float uSpacing;
      
      void main() {
        vec2 coord = vWorldPosition.xz / uSpacing;
        vec2 derivative = fwidth(coord);
        vec2 grid = abs(fract(coord - 0.5) - 0.5) / derivative;
        float line = min(grid.x, grid.y);
        float lineIntensity = 1.0 - min(line, 1.0);
        
        float dist = length(vWorldPosition - cameraPosition);
        float fade = 1.0 - smoothstep(200.0, 3200.0, dist);
        
        float alpha = lineIntensity * 0.22 * fade;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(uGridColor, alpha);
      }
    `,
    uniforms: {
      uGridColor: { value: new THREE.Color(0x3b82f6) },
      uSpacing: { value: 40.0 }
    },
    transparent: true
  });

  gridOverlay = new THREE.Mesh(gridGeom, gridMat);
  gridOverlay.rotation.x = -Math.PI / 2;
  gridOverlay.position.set(0, -1.9, -12000);
  scene.add(gridOverlay);

  // Studio Lighting
  ambientLight = new THREE.AmbientLight(0x101422, 2.2);
  scene.add(ambientLight);

  keyLight = new THREE.DirectionalLight(0xfff5ea, 3.2);
  keyLight.position.set(-90, 160, 80);
  scene.add(keyLight);

  fillLight = new THREE.DirectionalLight(0x3b82f6, 2.4);
  fillLight.position.set(90, 120, -180);
  scene.add(fillLight);

  cursorPointLight = new THREE.PointLight(0x3b82f6, 9, 320);
  cursorPointLight.position.set(0, 15, 0);
  scene.add(cursorPointLight);

  // Load Real 3D City Model & Magnetic Micro-Artifacts
  loadCityModel();
  spawnHDBuildingsAndArtifacts();
  spawnParticleDust();

  window.__scene = scene;
  window.__camera = camera;
  window.__renderer = renderer;

  window.addEventListener('resize', onResize);
}

function loadCityModel() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  gltfLoader.load('/public/city/city.glb', (gltf) => {
    cityModel = gltf.scene;
    // Position cityModel along flight path so camera passes directly through its avenues
    cityModel.position.set(-150, -10, -5000);
    cityModel.scale.set(12, 12, 12);

    cityModel.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.envMapIntensity = 1.5;
      }
    });

    scene.add(cityModel);
    console.log('[landing] Real 3D City (city.glb) loaded into flight corridor!');
  }, null, (err) => {
    console.warn('[landing] Failed to load city.glb in flight scene:', err);
  });
}

function onResize() {
  if (!camera || !renderer || !composer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------
// 2. Spawn Architectural Buildings & Magnetic Micro-Artifacts
// ---------------------------------------------------------------------
function spawnHDBuildingsAndArtifacts() {
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b82f6,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.9,
    ior: 1.5,
    transparent: true,
    opacity: 0.85,
    clearcoat: 1.0
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x0f121d,
    metalness: 0.95,
    roughness: 0.15
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 0.95,
    roughness: 0.08,
    emissive: 0x332200
  });

  const neonAccentMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    emissive: 0x3b82f6,
    emissiveIntensity: 0.6,
    metalness: 0.4,
    roughness: 0.2
  });

  // BEAT 2 — 4 Discipline Towers (Film, Brand, Photo, Systems)
  const disciplineDefs = [
    { title: 'FILM', color: 0xec4899, x: -110, z: -1800 },
    { title: 'BRAND', color: 0x06b6d4, x: 110, z: -2700 },
    { title: 'PHOTO', color: 0xf59e0b, x: -130, z: -3600 },
    { title: 'SYSTEMS', color: 0x10b981, x: 130, z: -4500 }
  ];

  disciplineDefs.forEach((def, i) => {
    const towerGroup = new THREE.Group();
    towerGroup.position.set(def.x, 0, def.z);

    const mainTower = new THREE.Mesh(
      new THREE.BoxGeometry(28, 130, 28),
      new THREE.MeshPhysicalMaterial({
        color: def.color,
        transmission: 0.85,
        opacity: 0.85,
        transparent: true,
        roughness: 0.1,
        metalness: 0.2
      })
    );
    mainTower.position.y = 65;
    towerGroup.add(mainTower);

    const edges = new THREE.EdgesGeometry(mainTower.geometry);
    const wireframe = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: def.color, linewidth: 2 })
    );
    wireframe.position.y = 65;
    towerGroup.add(wireframe);

    towerGroup.userData = { beat: 2, index: i, height: 130 };
    scene.add(towerGroup);
    buildingGroups.push(towerGroup);
  });

  // BEAT 3 — Glass Lattice Pavilion
  const pavilionGroup = new THREE.Group();
  pavilionGroup.position.set(0, 0, -5400);
  
  for (let r = 0; r < 4; r++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(50 + r * 20, 1.8, 16, 64),
      glassMat
    );
    ring.rotation.x = Math.PI / 2;
    pavilionGroup.add(ring);
  }
  pavilionGroup.userData = { beat: 3, index: 0 };
  scene.add(pavilionGroup);
  buildingGroups.push(pavilionGroup);

  // BEAT 4 — Stat Glass Monoliths & Gold NEAR Grant Coin
  const statGroup = new THREE.Group();
  statGroup.position.set(-50, 0, -7200);

  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 18, 3.0, 32),
    goldMat
  );
  coin.rotation.x = Math.PI / 3;
  coin.position.set(110, 45, 0);
  statGroup.add(coin);

  for (let m = 0; m < 4; m++) {
    const monolith = new THREE.Mesh(
      new THREE.BoxGeometry(18, 70 + m * 15, 18),
      glassMat
    );
    monolith.position.set(m * 32 - 35, (70 + m * 15) / 2, 0);
    statGroup.add(monolith);
  }
  statGroup.userData = { beat: 4, index: 0 };
  scene.add(statGroup);
  buildingGroups.push(statGroup);

  // BEAT 5 — 4 Flagship Landmark Buildings
  const flagshipDefs = [
    { name: 'Rabble Labs Tower', x: -130, z: -8800, h: 170, color: 0x06b6d4 },
    { name: 'Haus of Pixels Studio', x: 130, z: -9600, h: 150, color: 0xec4899 },
    { name: 'Pixelate Hub', x: -120, z: -10400, h: 130, color: 0x10b981 },
    { name: 'Cinema Marquee', x: 120, z: -11200, h: 110, color: 0xf59e0b }
  ];

  flagshipDefs.forEach((f, i) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(f.x, 0, f.z);

    const bMesh = new THREE.Mesh(
      new THREE.BoxGeometry(42, f.h, 42),
      darkMetalMat
    );
    bMesh.position.y = f.h / 2;
    bGroup.add(bMesh);

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(44, 5, 44),
      new THREE.MeshStandardMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 0.7 })
    );
    crown.position.y = f.h + 2.5;
    bGroup.add(crown);

    bGroup.userData = { beat: 5, index: i, height: f.h };
    scene.add(bGroup);
    buildingGroups.push(bGroup);
  });

  // Lusion 3D Floating Micro-Artifacts (Magnetic Collector)
  const artifactTypes = [
    { geom: new THREE.TorusKnotGeometry(4.5, 1.3, 64, 16), mat: goldMat, z: -1800 },
    { geom: new THREE.CylinderGeometry(5, 5, 8, 24), mat: darkMetalMat, z: -2700 },
    { geom: new THREE.OctahedronGeometry(6), mat: glassMat, z: -3600 },
    { geom: new THREE.IcosahedronGeometry(7), mat: neonAccentMat, z: -5400 },
    { geom: new THREE.TorusGeometry(8, 2.0, 16, 32), mat: goldMat, z: -7200 },
    { geom: new THREE.DodecahedronGeometry(6), mat: glassMat, z: -9200 }
  ];

  artifactTypes.forEach((art, idx) => {
    const mesh = new THREE.Mesh(art.geom, art.mat);
    const side = idx % 2 === 0 ? 1 : -1;
    mesh.position.set(side * (30 + Math.random() * 12), 16 + Math.random() * 12, art.z);

    mesh.userData = {
      initialX: mesh.position.x,
      initialY: mesh.position.y,
      initialZ: mesh.position.z,
      rotSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 0.012,
        (Math.random() - 0.5) * 0.018,
        (Math.random() - 0.5) * 0.012
      )
    };

    scene.add(mesh);
    magneticArtifacts.push(mesh);
  });
}

// ---------------------------------------------------------------------
// 3. Spawn Soft Particle Dust
// ---------------------------------------------------------------------
function spawnParticleDust() {
  const particleCount = 200;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 140;
    positions[i * 3 + 1] = Math.random() * 50;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.4)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);

  const mat = new THREE.PointsMaterial({
    size: 1.5,
    map: texture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  particleSystem = new THREE.Points(geom, mat);
  scene.add(particleSystem);
}

// ---------------------------------------------------------------------
// 4. WebGL Render Loop with Post-Processing (60FPS)
// ---------------------------------------------------------------------
function webglTick() {
  if (!renderer || !scene || !camera) return;

  const trigger = ScrollTrigger.getById('landingScroll');
  const p = trigger ? trigger.progress : 0;

  // DIAGONAL TIMELINE CAMERA MOTION THROUGH CITY MONUMENTS
  const targetCamX = p * 120 - 30;
  const targetCamY = 24 + Math.sin(p * Math.PI) * 6;
  const targetCamZ = -p * 11500;

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.1);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.1);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.1);

  const lookTarget = new THREE.Vector3(
    camera.position.x + 25,
    8,
    camera.position.z - 400
  );
  camera.lookAt(lookTarget);

  // Rotate City Model slowly
  if (cityModel) {
    cityModel.rotation.y = p * Math.PI * 0.12;
  }

  // Sync Cursor PointLight to Mouse Coordinates
  const mouse3D = new THREE.Vector3(
    (window.mousePos.x / window.innerWidth) * 2 - 1,
    -(window.mousePos.y / window.innerHeight) * 2 + 1,
    0.5
  );
  mouse3D.unproject(camera);
  const dir = mouse3D.sub(camera.position).normalize();
  const groundIntersect = camera.position.clone().add(dir.multiplyScalar(90));

  if (cursorPointLight) {
    cursorPointLight.position.copy(groundIntersect);
  }

  // Dynamic Building Construction on Scroll
  buildingGroups.forEach((group) => {
    const relZ = group.position.z - camera.position.z;
    if (relZ < 200 && relZ > -1200) {
      const buildProgress = THREE.MathUtils.clamp((relZ + 1200) / 1400, 0.2, 1.0);
      group.scale.y = THREE.MathUtils.lerp(group.scale.y, buildProgress, 0.1);
    }
  });

  // Lusion Magnetic Micro-Artifact Attraction
  magneticArtifacts.forEach((art) => {
    art.rotation.x += art.userData.rotSpeed.x;
    art.rotation.y += art.userData.rotSpeed.y;
    art.rotation.z += art.userData.rotSpeed.z;

    const distToCursor = art.position.distanceTo(groundIntersect);
    if (distToCursor < 180) {
      const pullForce = (1 - distToCursor / 180) * 1.4;
      art.position.x = THREE.MathUtils.lerp(art.position.x, groundIntersect.x, pullForce * 0.04);
      art.position.y = THREE.MathUtils.lerp(art.position.y, groundIntersect.y + 8, pullForce * 0.04);
    } else {
      art.position.x = THREE.MathUtils.lerp(art.position.x, art.userData.initialX, 0.04);
      art.position.y = THREE.MathUtils.lerp(art.position.y, art.userData.initialY, 0.04);
    }
  });

  if (particleSystem) {
    particleSystem.position.set(camera.position.x, camera.position.y - 10, camera.position.z - 70);
    particleSystem.rotation.y += 0.0012;
  }

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(webglTick);
}

// ---------------------------------------------------------------------
// 5. Contiguous Isolated Beat Synchronization & GSAP Kinetic Word Animation
// ---------------------------------------------------------------------
function syncLoaderHUD() {
  const trigger = ScrollTrigger.getById('landingScroll');
  const p = trigger ? trigger.progress : 0;
  let displayedPct = p * 100;
  const showCTA = (PREFERS_REDUCED_MOTION || COARSE || p >= 0.92);

  if (showCTA) {
    displayedPct = 100;
  } else if (displayedPct > 95 && cityLoad.pct < 100) {
    displayedPct = Math.min(displayedPct, cityLoad.pct);
  }

  const hudPct = document.getElementById('hudPct');
  const hudBar = document.getElementById('hudBar');
  const hudStatus = document.getElementById('hudStatus');
  const ctaPct = document.getElementById('ctaPct');
  const ctaLoader = document.getElementById('ctaLoader');
  const ctaButton = document.getElementById('ctaButton');

  const pString = Math.round(displayedPct).toString().padStart(2, '0') + '%';
  const statusMsg = getStatusMsg(displayedPct);

  if (hudPct) hudPct.textContent = pString;
  if (hudBar) hudBar.style.width = displayedPct + '%';
  if (hudStatus) hudStatus.textContent = statusMsg;
  if (ctaPct) ctaPct.textContent = pString;

  if (showCTA) {
    if (ctaLoader) ctaLoader.style.display = 'none';
    if (ctaButton) {
      ctaButton.style.display = 'inline-block';
      if (cityLoad.done) {
        ctaButton.classList.remove('loading');
        ctaButton.style.pointerEvents = 'auto';
        ctaButton.innerHTML = 'Explore the City &rarr;';
      } else {
        ctaButton.classList.add('loading');
        ctaButton.style.pointerEvents = 'none';
        ctaButton.textContent = `Compiling City... ${Math.round(cityLoad.pct)}%`;
      }
    }
  } else {
    if (ctaLoader) ctaLoader.style.display = 'flex';
    if (ctaButton) ctaButton.style.display = 'none';
  }
}

function animateKineticWords(group, beatProgress) {
  const words = group.querySelectorAll('.kinetic-word');
  if (!words.length) return;

  words.forEach((word, idx) => {
    const delay = idx * 0.06;
    const wordP = THREE.MathUtils.clamp((beatProgress - delay) / 0.35, 0, 1);
    
    gsap.set(word, {
      opacity: wordP,
      y: (1 - wordP) * 40,
      rotateX: (1 - wordP) * -25,
      filter: `blur(${(1 - wordP) * 8}px)`
    });
  });
}

function init() {
  const groups = document.querySelectorAll('.beat-group');
  const progressFill = document.getElementById('progressFill');
  const chromeBeat = document.getElementById('chromeBeat');

  const totalBeats = groups.length;
  const padBeat = (n) => String(n).padStart(2, '0');
  const formatBeat = (n) => `${padBeat(n)} / ${padBeat(totalBeats)}`;

  let activeBeat = 1;
  if (chromeBeat) chromeBeat.textContent = formatBeat(1);

  // Position text groups in 3D space
  groups.forEach((group, index) => {
    const zVal = parseFloat(group.dataset.z) || 0;
    gsap.set(group, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      xPercent: -50,
      yPercent: -50,
      z: zVal,
      transformStyle: 'preserve-3d',
    });
  });

  // Strict Contiguous Beat Active Switcher with GSAP Word Kinetic Scrubbing
  const tl = gsap.timeline({
    scrollTrigger: {
      id: 'landingScroll',
      trigger: '.scroll-container',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        const p = self.progress;
        if (progressFill) gsap.set(progressFill, { scaleX: p });

        let beatIdx = 0;
        let beatMin = 0;
        let beatMax = 0.12;

        if (p < 0.12) { beatIdx = 0; beatMin = 0; beatMax = 0.12; }
        else if (p < 0.28) { beatIdx = 1; beatMin = 0.12; beatMax = 0.28; }
        else if (p < 0.44) { beatIdx = 2; beatMin = 0.28; beatMax = 0.44; }
        else if (p < 0.60) { beatIdx = 3; beatMin = 0.44; beatMax = 0.60; }
        else if (p < 0.76) { beatIdx = 4; beatMin = 0.60; beatMax = 0.76; }
        else if (p < 0.90) { beatIdx = 5; beatMin = 0.76; beatMax = 0.90; }
        else { beatIdx = 6; beatMin = 0.90; beatMax = 1.00; }

        const beatLocalP = (p - beatMin) / (beatMax - beatMin);

        groups.forEach((g, i) => {
          if (i === beatIdx) {
            g.classList.add('active');
            animateKineticWords(g, beatLocalP);
          } else {
            g.classList.remove('active');
          }
        });

        const beatNum = beatIdx + 1;
        if (beatNum !== activeBeat) {
          activeBeat = beatNum;
          if (chromeBeat) chromeBeat.textContent = formatBeat(beatNum);
        }
        syncLoaderHUD();
      }
    }
  });

  tl.to('.scene3d', {
    x: 240,
    y: -30,
    z: 7500,
    ease: 'none',
    duration: 1.0
  }, 0);

  initCursor();
  initMagnetic();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
}

// ---------------------------------------------------------------------
// 6. Trailing Cursor & Magnetic Elements
// ---------------------------------------------------------------------
function initCursor() {
  const cursor = document.getElementById('cursor');
  if (!cursor || PREFERS_REDUCED_MOTION || matchMedia('(pointer: coarse)').matches) return;

  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const pos = { x: mouse.x, y: mouse.y };

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function tick() {
    pos.x += (mouse.x - pos.x) * 0.2;
    pos.y += (mouse.y - pos.y) * 0.2;
    gsap.set(cursor, { x: pos.x, y: pos.y });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  document.querySelectorAll('a, button, .receipt-card, .handoff-btn, .skip-archive').forEach((el) => {
    el.addEventListener('mouseenter', () => cursor.classList.add('expand'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('expand'));
  });
}

function initMagnetic() {
  if (PREFERS_REDUCED_MOTION || matchMedia('(pointer: coarse)').matches) return;
  document.querySelectorAll('.receipt-card, .handoff-btn, .skip-archive').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - (rect.left + rect.width / 2)) * 0.2;
      const y = (e.clientY - (rect.top + rect.height / 2)) * 0.2;
      gsap.to(el, { x, y, duration: 0.4, ease: 'power2.out' });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.35)' });
    });
  });
}

// ---------------------------------------------------------------------
// 7. Background Preloader & Instant Handoff Transition
// ---------------------------------------------------------------------
function markCityReady() {
  cityLoad.done = true;
  cityLoad.pct = 100;
  syncLoaderHUD();
}

function initArchiveFrame() {
  const frame = document.getElementById('archiveFrame');
  if (!frame || COARSE) return;
  frame.src = '/index.html?archive=1&landing=1';
  const started = Date.now();
  const poll = setInterval(() => {
    let ready = false;
    try {
      if (frame.contentWindow && frame.contentWindow.__terrain) ready = true;
    } catch {}
    if (ready || cityLoad.done) {
      clearInterval(poll);
      markCityReady();
    } else if (Date.now() - started > 120000) {
      clearInterval(poll);
      markCityReady();
    } else {
      syncLoaderHUD();
    }
  }, 400);
}

function revealArchive() {
  const frame = document.getElementById('archiveFrame');
  if (!frame || COARSE || !frame.src) { window.location.href = '/?archive=1'; return; }

  window.ctaExploded = true;
  document.body.classList.remove('landing');
  document.body.classList.add('archive-revealed');

  gsap.timeline()
    .to('#landingCanvas', { opacity: 0, duration: 0.8, onComplete: () => {
      const canvas = document.getElementById('landingCanvas');
      if (canvas) canvas.style.display = 'none';
    }})
    .to(frame, { opacity: 1, duration: 1.0, pointerEvents: 'auto' }, 0.2);

  frame.removeAttribute('aria-hidden');
  ScrollTrigger.getAll().forEach(t => t.disable());

  const terrain = frame.contentWindow?.__terrain;
  if (terrain && terrain.animateCameraTo) {
    terrain.animateCameraTo(
      { x: 0, y: 8.3, z: 0, radius: 123.5, polar: 0.516 * Math.PI, azimuth: -0.001 },
      { duration: 2.0, ease: 'power3.inOut' }
    );
  }

  sessionStorage.setItem('archiveEntered', '1');
  try { frame.focus(); } catch {}
}

function getStatusMsg(pct) {
  if (pct >= 100) return 'SYSTEM_READY';
  if (pct > 75) return 'CALIBRATING_LIGHTS';
  if (pct > 50) return 'DECOMPRESSING_MESHES';
  if (pct > 25) return 'PARSING_TEXTURES';
  return 'COMPILING_GEOMETRY';
}

function initHandoffGate() {
  const btn = document.getElementById('ctaButton');
  if (btn) {
    const reveal = (e) => {
      if (COARSE) return;
      if (e) e.preventDefault();
      revealArchive();
    };
    btn.addEventListener('click', reveal);
    document.querySelectorAll('.skip-archive').forEach((a) => a.addEventListener('click', reveal));
  }
  syncLoaderHUD();
}

window.onCityProgress = (pct) => {
  cityLoad.pct = pct;
  syncLoaderHUD();
};

window.onCityReady = () => {
  markCityReady();
};

/* ---- Boot ---- */
if (!gsap || !ScrollTrigger) {
  console.error('[landing] GSAP / ScrollTrigger failed to load');
} else {
  gsap.registerPlugin(ScrollTrigger);
  initThree();
  init();
  webglTick();
  initArchiveFrame();
  initHandoffGate();
}
