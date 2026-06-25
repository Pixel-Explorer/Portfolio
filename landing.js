import * as THREE from 'three';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const log = DEBUG ? console.log.bind(console, '[landing]') : () => {};
const PREFERS_REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches || window.innerWidth < 800;

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Lenis = window.Lenis;

// Scroll control variables
let lenis = null;
let lenisRaf = null;
window.mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.ctaExploded = false;

window.addEventListener('mousemove', (e) => {
  window.mousePos.x = e.clientX;
  window.mousePos.y = e.clientY;
});

// Three.js scene variables
let scene, camera, renderer;
let gridFloor, gridCeiling;
let keyLight, ambientLight, spotLight, spotLightTarget, rimLight, cameraLight;
let webglObjects = [];

// Media textures and captions for 3D placard planes
const MEDIA_PLACARDS = [
  { src: '/public/landing/film.png', tag: 'FILM', caption: 'DIRECTOR / CAMERA' },
  { src: '/public/landing/design.png', tag: 'DESIGN', caption: 'BRAND IDENTITY' },
  { src: '/public/landing/photo.png', tag: 'PHOTO', caption: 'EXIF STREET WORK' },
  { src: '/public/landing/systems.png', tag: 'SYSTEMS', caption: 'CREATIVE PIPELINES' },
  { src: '/public/landing/frontier.png', tag: 'FRONTIER', caption: 'BLOCKCHAIN & AI' },
  { src: '/public/landing/hero.png', tag: 'PORTRAIT', caption: 'A. VENTKATESAN' },
  { src: '/public/gallery/thumb/_mg_1309.webp', tag: 'SKETCH', caption: 'HAUS OF PIXELS' },
  { src: '/public/gallery/thumb/_mg_1314.webp', tag: 'CAPTURE', caption: 'STREET PROOF' }
];

const cityLoad = { pct: 0, done: false };
if (COARSE) {
  cityLoad.done = true;
  cityLoad.pct = 100;
}

// ---------------------------------------------------------------------
// Initialize Three.js WebGL Scene
// ---------------------------------------------------------------------
function initThree() {
  const canvas = document.getElementById('landingCanvas');
  if (!canvas || COARSE || PREFERS_REDUCED_MOTION) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0c0b, 0.0035);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(0x0c0c0b, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;

  // Brutalist Floor & Ceiling Grids (Anti-aliased Shader Grid)
  const gridGeom = new THREE.PlaneGeometry(20000, 20000);
  const gridMat = new THREE.ShaderMaterial({
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vWorldPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying vec3 vWorldPosition;
      
      uniform vec3 uGridColor;
      uniform float uSpacing;
      uniform float uOpacity;
      uniform float uFadeStart;
      uniform float uFadeEnd;

      void main() {
        vec2 coord = vWorldPosition.xz / uSpacing;
        vec2 derivative = fwidth(coord);
        vec2 grid = abs(fract(coord - 0.5) - 0.5) / derivative;
        float line = min(grid.x, grid.y);
        float lineIntensity = 1.0 - min(line, 1.0);
        
        float dist = length(vWorldPosition - cameraPosition);
        float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
        
        float alpha = lineIntensity * uOpacity * fade;
        if (alpha < 0.001) discard;
        
        vec4 diffuseColor = vec4(uGridColor, alpha);
        #include <fog_fragment>
        gl_FragColor = diffuseColor;
      }
    `,
    uniforms: {
      uGridColor: { value: new THREE.Color(0xC5E03A) },
      uSpacing: { value: 10.0 },
      uOpacity: { value: 0.25 },
      uFadeStart: { value: 150.0 },
      uFadeEnd: { value: 900.0 },
      ...THREE.UniformsLib['fog']
    },
    transparent: true,
    fog: true
  });

  gridFloor = new THREE.Mesh(gridGeom, gridMat);
  gridFloor.rotation.x = -Math.PI / 2;
  gridFloor.position.set(0, -8, -4000);
  scene.add(gridFloor);

  gridCeiling = new THREE.Mesh(gridGeom, gridMat.clone());
  gridCeiling.rotation.x = Math.PI / 2;
  gridCeiling.position.set(0, 8, -4000);
  scene.add(gridCeiling);

  // Studio Lighting Setup
  ambientLight = new THREE.AmbientLight(0x222233, 1.8);
  scene.add(ambientLight);

  keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
  keyLight.position.set(-15, 30, 20);
  keyLight.castShadow = true;
  scene.add(keyLight);

  // Dynamic Spotlight that follows cursor target
  spotLight = new THREE.SpotLight(0xC5E03A, 30, 100, Math.PI / 5, 0.6, 1.2);
  spotLight.position.set(0, 0, 0);
  spotLight.castShadow = true;
  scene.add(spotLight);

  spotLightTarget = new THREE.Object3D();
  scene.add(spotLightTarget);
  spotLight.target = spotLightTarget;

  // Dynamic Camera Headlight that travels with view
  cameraLight = new THREE.PointLight(0xffffff, 15, 60);
  cameraLight.position.set(0, 0, 0);
  scene.add(cameraLight);

  // Gold Rim Highlight
  rimLight = new THREE.PointLight(0xFFD080, 5, 45);
  rimLight.position.set(0, 0, -50);
  scene.add(rimLight);

  // Spawn 3D Media Placards & Procedural Models
  spawn3DObjects();

  window.__scene = scene;
  window.__camera = camera;
  window.__renderer = renderer;
  window.__webglObjects = webglObjects;

  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------
// Spawn 3D Elements (Procedural Models + Transparent PNG Planes)
// ---------------------------------------------------------------------
function spawn3DObjects() {
  const textureLoader = new THREE.TextureLoader();

  const placardZ = [
    -1400, // 0. Film
    -1800, // 1. Design
    -2200, // 2. Photo
    -3100, // 3. Systems
    -6700, // 4. Frontier
    -800,  // 5. Portrait
    -4400, // 6. Sketch
    -5100  // 7. Capture
  ];

  // 1. Transparent PNG placards
  MEDIA_PLACARDS.forEach((item, index) => {
    textureLoader.load(item.src, (texture) => {
      // Use clean uncropped aspect ratio
      const aspect = texture.image ? texture.image.width / texture.image.height : 1.0;
      const h = 4.0;
      const w = h * aspect;

      const geometry = new THREE.PlaneGeometry(w, h);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.2
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Position along the depth (Z-axis) - closer to center so they stay in frame!
      const side = index % 2 === 0 ? 1 : -1;
      const zPos = placardZ[index] || (-1000 - index * 600);
      mesh.position.set(
        side * (4.2 + Math.random() * 1.5),
        -1.5 + Math.random() * 3,
        zPos
      );

      mesh.userData = {
        initialX: mesh.position.x,
        initialY: mesh.position.y,
        initialZ: mesh.position.z,
        isPlacard: true,
        index
      };

      scene.add(mesh);
      webglObjects.push(mesh);
    });
  });

  // 2. Procedural brutalist models representing domains
  const objectsDef = [
    { type: 'slate', z: -400 },
    { type: 'book', z: -2600 },
    { type: 'token', z: -3900 },
    { type: 'pdf', z: -5600 },
    { type: 'lens', z: -6200 }
  ];

  objectsDef.forEach((def, index) => {
    let group = new THREE.Group();

    if (def.type === 'slate') {
      // Film Slate Clapperboard
      const slateBody = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.6, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.8 })
      );
      slateBody.castShadow = true;
      group.add(slateBody);

      const clapper = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.3, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.5 })
      );
      clapper.position.set(0, 0.95, 0);
      clapper.rotation.z = 0.15;
      clapper.castShadow = true;
      group.add(clapper);
    } 
    else if (def.type === 'book') {
      // Tarikshir book cover
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 2.0, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x5c1a1a, roughness: 0.7, metalness: 0.1 })
      );
      book.castShadow = true;
      group.add(book);

      const spine = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 2.0, 0.25),
        new THREE.MeshStandardMaterial({ color: 0xFFD080, roughness: 0.4 })
      );
      spine.position.set(-0.7, 0, 0);
      group.add(spine);
    } 
    else if (def.type === 'token') {
      // Web3 Torus Knot Token
      const token = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.7, 0.22, 64, 8),
        new THREE.MeshStandardMaterial({ color: 0xFFD080, metalness: 1.0, roughness: 0.05, emissive: 0x221100 })
      );
      token.castShadow = true;
      group.add(token);
    } 
    else if (def.type === 'pdf') {
      // PDF document sheet
      const doc = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 2.0),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f5, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x111111 })
      );
      doc.castShadow = true;
      group.add(doc);
    } 
    else if (def.type === 'lens') {
      // Camera Lens Cylinders
      const outerLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 1.6, 16),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.95, roughness: 0.15 })
      );
      outerLens.rotation.x = Math.PI / 2;
      outerLens.castShadow = true;
      group.add(outerLens);

      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 0.15, 16),
        new THREE.MeshStandardMaterial({ color: 0xC5E03A, metalness: 0.95, roughness: 0.05 })
      );
      ring.position.set(0, 0, 0.4);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      // Glass cap cap for reflection
      const glassCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.75, 0.05, 16),
        new THREE.MeshStandardMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.4, metalness: 1.0, roughness: 0.01 })
      );
      glassCap.position.set(0, 0, 0.78);
      glassCap.rotation.x = Math.PI / 2;
      group.add(glassCap);
    }

    const side = index % 2 === 0 ? -1 : 1;
    group.position.set(
      side * (3.8 + Math.random() * 1.5),
      -1 + Math.random() * 2,
      def.z
    );

    group.userData = {
      initialX: group.position.x,
      initialY: group.position.y,
      initialZ: group.position.z,
      type: def.type,
      index: index + 10
    };

    scene.add(group);
    webglObjects.push(group);
  });
}

// ---------------------------------------------------------------------
// WebGL Render & Magnet Loop
// ---------------------------------------------------------------------
function webglTick() {
  if (!renderer || !scene || !camera) return;

  const trigger = ScrollTrigger.getById('landingScroll');
  const p = trigger ? trigger.progress : 0;
  
  // Camera Z follows the scroll depth smoothly
  camera.position.z = -p * 8000;

  // Dynamically resolve theme colors from CSS transitions
  const bodyStyle = window.getComputedStyle(document.body);
  const bgColorStr = bodyStyle.getPropertyValue('--bg').trim() || '#0c0c0b';
  const accentColorStr = bodyStyle.getPropertyValue('--accent').trim() || '#C5E03A';
  
  const bgColor = new THREE.Color(bgColorStr);
  const accentColor = new THREE.Color(accentColorStr);

  // Sync background, fog, and light colors
  if (scene.fog) scene.fog.color.copy(bgColor);
  renderer.setClearColor(bgColor, 1);

  if (gridFloor && gridCeiling) {
    if (gridFloor.material.uniforms && gridFloor.material.uniforms.uGridColor) {
      gridFloor.material.uniforms.uGridColor.value.copy(accentColor);
    }
    if (gridCeiling.material.uniforms && gridCeiling.material.uniforms.uGridColor) {
      gridCeiling.material.uniforms.uGridColor.value.copy(accentColor);
    }
  }

  if (cameraLight) {
    cameraLight.position.copy(camera.position);
    cameraLight.color.copy(accentColor);
  }

  if (spotLight) {
    spotLight.color.copy(accentColor);
  }

  // Unproject mouse positions to obtain a 3D target coordinates in front of the camera
  const mouse3D = new THREE.Vector3(
    (window.mousePos.x / window.innerWidth) * 2 - 1,
    -(window.mousePos.y / window.innerHeight) * 2 + 1,
    0.5
  );
  mouse3D.unproject(camera);
  const dir = mouse3D.sub(camera.position).normalize();
  const magnetPos = camera.position.clone().add(dir.multiplyScalar(10)); // 10 units in front of camera

  // Spotlight follows target
  spotLight.position.copy(camera.position);
  spotLightTarget.position.copy(magnetPos);

  if (window.ctaExploded) {
    // Explode particles outwards on CTA click
    webglObjects.forEach((obj) => {
      if (!obj.vel) {
        obj.vel = new THREE.Vector3(
          (Math.random() - 0.5) * 5.0,
          (Math.random() - 0.5) * 5.0,
          (Math.random() - 0.5) * 4.0 + 4.0
        );
        obj.rotVel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4
        );
      }
      obj.position.add(obj.vel);
      obj.rotation.x += obj.rotVel.x;
      obj.rotation.y += obj.rotVel.y;
      obj.rotation.z += obj.rotVel.z;
    });
  } else {
    // Standard logic: float or stack onto cursor like a magnet (proximity-blended)
    webglObjects.forEach((obj) => {
      const relZ = obj.position.z - camera.position.z;
      const idx = obj.userData.index;

      let magnetWeight = 0;
      if (relZ > -350) {
        magnetWeight = Math.min(1.0, (relZ + 350) / 230);
        // Smoothstep interpolation curve
        magnetWeight = magnetWeight * magnetWeight * (3 - 2 * magnetWeight);
      }

      const idleY = obj.userData.initialY + Math.sin(Date.now() * 0.0012 + idx) * 0.15;
      const idlePos = new THREE.Vector3(obj.userData.initialX, idleY, obj.userData.initialZ);

      const stackOffset = new THREE.Vector3(
        (idx % 3 - 1) * 0.7,
        (Math.floor(idx / 3) % 3 - 1) * 0.7,
        -4 - (idx * 0.12) // stack offset depth
      );
      const targetPos = magnetPos.clone().add(stackOffset);

      // Interpolate position based on proximity weight
      const blendedTargetPos = new THREE.Vector3().lerpVectors(idlePos, targetPos, magnetWeight);
      obj.position.lerp(blendedTargetPos, 0.1);

      // Blend rotation increments smoothly to avoid wrapping spins
      const idleDeltaX = 0.003;
      const idleDeltaY = 0.006;
      const stackDeltaX = (0.01 - obj.rotation.x) * 0.08;
      const stackDeltaY = (0.01 - obj.rotation.y) * 0.08;

      obj.rotation.x += THREE.MathUtils.lerp(idleDeltaX, stackDeltaX, magnetWeight);
      obj.rotation.y += THREE.MathUtils.lerp(idleDeltaY, stackDeltaY, magnetWeight);
    });
  }

  renderer.render(scene, camera);
  requestAnimationFrame(webglTick);
}

// ---------------------------------------------------------------------
// Sequential "Lyrical Video" Typography Setup
// ---------------------------------------------------------------------
function setupLyricTypographyTimeline(tl, groups) {
  groups.forEach((group, index) => {
    const lines = group.querySelectorAll('.lyric-line');
    if (!lines.length) return;

    // Define the fully-visible ranges for each beat
    let visibleStart, visibleEnd;
    if (index === 0) {
      visibleStart = 0.0;
      visibleEnd = 0.12;
    } else if (index === 6) {
      visibleStart = 0.92;
      visibleEnd = 1.0;
    } else {
      visibleStart = index * 0.15 + 0.02;
      visibleEnd = (index + 1) * 0.15 - 0.03;
    }

    const interval = (visibleEnd - visibleStart) / lines.length;

    lines.forEach((line, j) => {
      const lineStart = visibleStart + j * interval;
      
      // Fade in & slide up phrase
      tl.fromTo(line,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: interval * 0.6, ease: 'power2.out' },
        lineStart
      );
    });

    // Special case for Beat 3: text highlight sweep
    if (index === 2) {
      const highlights = group.querySelectorAll('.lede-highlight');
      if (highlights.length) {
        highlights.forEach((h, j) => {
          // Stagger highlight sweep after its line fades in
          const baseStart = visibleStart + 1 * interval;
          const hStart = baseStart + j * (interval * 0.5);
          tl.to(h, {
            backgroundSize: '100% 100%',
            duration: interval * 0.5,
            ease: 'none',
          }, hStart);
        });
      }
    }
  });
}

function setActiveBg(beatNum) {
  document.body.dataset.activeBeat = String(beatNum);
}

// ---------------------------------------------------------------------
// Synchronize Loader Progress Tickers
// ---------------------------------------------------------------------
function syncLoaderHUD() {
  const trigger = ScrollTrigger.getById('landingScroll');
  const p = trigger ? trigger.progress : 0;
  
  let displayedPct = p * 100;
  const showCTA = (PREFERS_REDUCED_MOTION || COARSE || p >= 0.95);

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
      const t = ctaButton.querySelector('.tooltip-text');
      const th = ctaButton.querySelector('.tooltip-hover');
      
      if (cityLoad.done) {
        ctaButton.classList.remove('loading');
        ctaButton.style.pointerEvents = 'auto';
        if (t) t.innerHTML = 'Explore the City &rarr;';
        if (th) th.innerHTML = 'Explore the City &rarr;';
      } else {
        ctaButton.classList.add('loading');
        ctaButton.style.pointerEvents = 'none';
        const label = `Compiling City... ${Math.round(cityLoad.pct)}%`;
        if (t) t.textContent = label;
        if (th) th.textContent = label;
      }
    }
  } else {
    if (ctaLoader) ctaLoader.style.display = 'flex';
    if (ctaButton) ctaButton.style.display = 'none';
  }
}

function init() {
  if (!PREFERS_REDUCED_MOTION && Lenis && !COARSE) {
    lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      wheelMultiplier: 0.85,
    });
    lenis.on('scroll', ScrollTrigger.update);
    lenisRaf = (t) => { if (lenis) lenis.raf(t * 1000); };
    gsap.ticker.add(lenisRaf);
    gsap.ticker.lagSmoothing(0);
  }

  const beats = gsap.utils.toArray('.beat-group');
  const progressFill = document.getElementById('progressFill');
  const chromeBeat = document.getElementById('chromeBeat');
  const hud = document.getElementById('debugHud');
  if (DEBUG && hud) hud.hidden = false;

  const totalBeats = beats.length;
  const padBeat = (n) => String(n).padStart(2, '0');
  const formatBeat = (n) => `${padBeat(n)} / ${padBeat(totalBeats)}`;

  let activeBeat = 1;
  setActiveBg(1);
  if (chromeBeat) chromeBeat.textContent = formatBeat(1);

  const setBeat = (n) => {
    if (n === activeBeat) return;
    activeBeat = n;
    setActiveBg(n);
    if (chromeBeat) chromeBeat.textContent = formatBeat(n);
  };

  const groups = document.querySelectorAll('.beat-group');

  if (PREFERS_REDUCED_MOTION || COARSE) {
    groups.forEach((g) => gsap.set(g, { opacity: 1, clearProps: 'all' }));
    groups.forEach((g, index) => {
      ScrollTrigger.create({
        trigger: g,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => self.isActive && setBeat(index + 1),
      });
    });
    initCursor();
    initMagnetic();
    return;
  }

  // Initial group position setup
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
      autoAlpha: index === 0 ? 1 : 0,
      scale: index === 0 ? 1 : 0.8,
    });
  });

  const tl = gsap.timeline({
    scrollTrigger: {
      id: 'landingScroll',
      trigger: '.scroll-container',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => {
        const p = self.progress;
        if (progressFill) gsap.set(progressFill, { scaleX: p });

        const beatNum = Math.min(totalBeats, Math.floor(p / 0.15) + 1);
        setBeat(beatNum);

        syncLoaderHUD();

        if (DEBUG && hud) {
          hud.textContent =
            `beat   ${activeBeat} / 07\n` +
            `scroll ${(p * 100).toFixed(1)}%\n` +
            `range  ${Math.round(ScrollTrigger.maxScroll(window))}px`;
        }
      }
    }
  });

  // Camera scroll timelines
  tl.to('.scene3d', {
    z: 7000,
    ease: 'none',
    duration: 1.0
  }, 0);

  // Bind the lyric typography transitions to the timeline
  setupLyricTypographyTimeline(tl, groups);

  // Group fade transitions (aligned contiguously with Z-depth progress values)
  groups.forEach((group, index) => {
    const zVal = parseFloat(group.dataset.z) || 0;
    const center = index * 0.15;

    if (index === 0) {
      // Beat 1 starts visible, and flies past when Beat 2 fades in
      tl.to(group, {
        autoAlpha: 0,
        scale: 1.6,
        z: zVal + 650,
        ease: 'power2.in',
        duration: 0.05
      }, 0.12);
    } else if (index < 6) {
      // Beats 2-6: fade in at transition start, then fade out/fly past at next transition
      const fadeInStart = center - 0.03;
      tl.to(group, {
        autoAlpha: 1,
        scale: 1,
        ease: 'power2.out',
        duration: 0.05
      }, fadeInStart);

      const fadeOutStart = (index + 1) * 0.15 - 0.03;
      tl.to(group, {
        autoAlpha: 0,
        scale: 1.6,
        z: zVal + 650,
        ease: 'power2.in',
        duration: 0.05
      }, fadeOutStart);
    } else {
      // Beat 7: fade in and stay visible at the end
      tl.to(group, {
        autoAlpha: 1,
        scale: 1,
        ease: 'power2.out',
        duration: 0.05
      }, 0.87);
    }
  });

  initCursor();
  initMagnetic();
  initKickerScramble();
  
  // Page entrance animate Beat 1 lyric lines
  const beat1Lyrics = document.querySelectorAll('[data-beat="1"] .lyric-line');
  if (beat1Lyrics.length) {
    gsap.fromTo(beat1Lyrics, 
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: 'power2.out', delay: 0.2 }
    );
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
}

// ---------------------------------------------------------------------
// Trailing Difference Cursor
// ---------------------------------------------------------------------
function initCursor() {
  const cursor = document.getElementById('cursor');
  if (!cursor || PREFERS_REDUCED_MOTION) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const pos = { x: mouse.x, y: mouse.y };
  const ratio = 0.16;

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function tick() {
    pos.x += (mouse.x - pos.x) * ratio;
    pos.y += (mouse.y - pos.y) * ratio;
    gsap.set(cursor, { x: pos.x, y: pos.y });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const interactives = document.querySelectorAll('a, button, .receipt-card, .handoff-btn, .skip-archive');
  interactives.forEach((el) => {
    el.addEventListener('mouseenter', () => cursor.classList.add('expand'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('expand'));
  });
}

// ---------------------------------------------------------------------
// Magnetic Spring hovers for UI
// ---------------------------------------------------------------------
function initMagnetic() {
  if (PREFERS_REDUCED_MOTION) return;
  if (matchMedia('(pointer: coarse)').matches) return;
  
  const selectors = '.receipt-card, .handoff-btn, .skip-archive';
  document.querySelectorAll(selectors).forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - (rect.left + rect.width / 2)) * 0.18;
      const y = (e.clientY - (rect.top + rect.height / 2)) * 0.18;
      gsap.to(el, { x, y, duration: 0.5, ease: 'power2.out' });
    });
    el.addEventListener('mouseleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.32)' });
    });
  });
}

// ---------------------------------------------------------------------
// Text Scrambler
// ---------------------------------------------------------------------
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+-/=[]{}';

function scrambleText(element, duration = 0.8) {
  if (element._scrambling) return;
  element._scrambling = true;

  const originalText = element.textContent;
  const length = originalText.length;
  const proxy = { progress: 0 };

  gsap.to(proxy, {
    progress: 1,
    duration: duration,
    ease: 'none',
    onUpdate: () => {
      let result = '';
      for (let i = 0; i < length; i++) {
        if (originalText[i] === ' ' || originalText[i] === '/' || originalText[i] === '-') {
          result += originalText[i];
        } else if (i < Math.floor(proxy.progress * length)) {
          result += originalText[i];
        } else {
          result += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      element.textContent = result;
    },
    onComplete: () => {
      element.textContent = originalText;
      element._scrambling = false;
    }
  });
}

function initKickerScramble() {
  if (PREFERS_REDUCED_MOTION) return;
  document.querySelectorAll('.kicker').forEach((kicker) => {
    ScrollTrigger.create({
      trigger: kicker,
      start: 'top 85%',
      onEnter: () => scrambleText(kicker, 0.8),
    });
  });
}

// ---------------------------------------------------------------------
// Background Archive Preloader & Handoff Transitions
// ---------------------------------------------------------------------
function markCityReady() {
  cityLoad.done = true;
  cityLoad.pct = 100;
  updateGate();
  
  const frame = document.getElementById('archiveFrame');
  if (frame) {
    // Background iframe is completely invisible (opacity 0) during scrolling!
    try {
      const terrain = frame.contentWindow?.__terrain;
      if (terrain) {
        if (terrain.updateLandingCamera) {
          terrain.updateLandingCamera(
            { radius: 45, polar: 0.49 * Math.PI, azimuth: 0.9 },
            { x: 12, y: 4, z: 3 }
          );
        }
        if (terrain.setThemeBlend) {
          terrain.setThemeBlend(1);
        }
      }
    } catch {
      // ignore
    }
  }
}

function initArchiveFrame() {
  const frame = document.getElementById('archiveFrame');
  if (!frame || COARSE) return;
  frame.src = '/index.html?archive=1&landing=1';
  const started = Date.now();
  const poll = setInterval(() => {
    let ready = false;
    try {
      const doc = frame.contentDocument;
      if (doc) {
        const fill = doc.getElementById('loaderFill');
        if (fill) {
          const p = parseFloat(fill.style.width);
          if (!Number.isNaN(p)) cityLoad.pct = p;
        }
        const loader = doc.getElementById('loader');
        if (loader && loader.classList.contains('done')) ready = true;
      }
      if (frame.contentWindow && frame.contentWindow.__terrain) ready = true;
    } catch {
      // ignore
    }
    if (ready || cityLoad.done) {
      clearInterval(poll);
      markCityReady();
    } else if (Date.now() - started > 120000) {
      clearInterval(poll);
      markCityReady();
    } else {
      updateGate();
    }
  }, 400);
  log('archive booting in background iframe');
}

function revealArchive() {
  const frame = document.getElementById('archiveFrame');
  if (!frame || COARSE || !frame.src) { window.location.href = '/?archive=1'; return; }

  window.ctaExploded = true;

  // Fade out landing DOM (Remove landing class to restore cursor)
  document.body.classList.remove('landing');
  document.body.classList.add('archive-revealed');

  // Fade in background iframe and disable local WebGL canvas
  gsap.timeline()
    .to('#landingCanvas', { opacity: 0, duration: 1.0, onComplete: () => {
      const canvas = document.getElementById('landingCanvas');
      if (canvas) canvas.style.display = 'none';
    }})
    .to(frame, { opacity: 1, duration: 1.2, pointerEvents: 'auto' }, 0.2);

  frame.removeAttribute('aria-hidden');

  if (lenis) {
    lenis.destroy();
    if (lenisRaf) gsap.ticker.remove(lenisRaf);
    lenis = null;
  }
  ScrollTrigger.getAll().forEach(t => t.disable());

  const terrain = frame.contentWindow?.__terrain;
  if (terrain) {
    if (terrain.animateCameraTo) {
      terrain.animateCameraTo(
        {
          x: 0,
          y: 8.3,
          z: 0,
          radius: 123.5,
          polar: 0.516 * Math.PI,
          azimuth: -0.001
        },
        {
          duration: 2.2,
          ease: 'power3.inOut'
        }
      );
    }
    try {
      frame.contentDocument.body.classList.remove('landing-bg-mode');
      const isLight = frame.contentDocument.documentElement.getAttribute("data-theme") === "light";
      if (terrain.setTheme) terrain.setTheme(isLight);
    } catch {
      // ignore
    }
  }

  sessionStorage.setItem('archiveEntered', '1');
  try { frame.focus(); } catch {}
  log('archive revealed with smooth camera transition');
}

function getStatusMsg(pct) {
  if (pct >= 100) return 'SYSTEM_READY';
  if (pct > 75) return 'CALIBRATING_LIGHTS';
  if (pct > 50) return 'DECOMPRESSING_MESHES';
  if (pct > 25) return 'PARSING_TEXTURES';
  return 'COMPILING_GEOMETRY';
}

function updateGate() {
  syncLoaderHUD();
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
  updateGate();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

window.onCityProgress = (pct) => {
  cityLoad.pct = pct;
  updateGate();
  
  const frame = document.getElementById('archiveFrame');
  if (frame && !COARSE) {
    frame.style.opacity = '0'; // Keep it completely hidden while loading
  }
};

window.onCityReady = () => {
  markCityReady();
  
  const frame = document.getElementById('archiveFrame');
  if (frame && !COARSE) {
    frame.style.opacity = '0'; // Keep it completely hidden when ready
  }
};

/* ---- boot ---- */
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
