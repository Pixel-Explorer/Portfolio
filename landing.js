/* =====================================================================
   LANDING SCROLL-PITCH — Seamless 3D Visual Redesign (Seb R / Loket Style)
   - persistent WebGL iframe bg-stage (index.html?landing=1)
   - viewport-locked CSS 3D scroll flythrough
   - dynamic scattered evidence tease polaroids
   - loader HUD and wait-period logic (finished smoothly on scroll)
   - custom trailing cursor (difference mode)
   - magnetic spring hovers
   - kicker scramble text decodes
   ===================================================================== */

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const log = DEBUG ? console.log.bind(console, '[landing]') : () => {};
const PREFERS_REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches || window.innerWidth < 800;

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Lenis = window.Lenis;

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+-/=[]{}';

// Global variables for scroll/animation control
let lenis = null;
let lenisRaf = null;
window.mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.ctaExploded = false;

window.addEventListener('mousemove', (e) => {
  window.mousePos.x = e.clientX;
  window.mousePos.y = e.clientY;
});

// Custom 3D transparent floating objects
const FLOATING_OBJECTS = [
  { type: 'slate', tag: 'FILM', caption: 'CHHELLO DIVAS', z: -800 },
  { type: 'book', tag: 'DESIGN', caption: 'TARIKSHIR COVER', z: -2000 },
  { type: 'token', tag: 'WEB3', caption: 'NEAR FAST GRANT', z: -3500 },
  { type: 'pdf', tag: 'SYSTEMS', caption: 'PORTFOLIO.PDF', z: -4800 },
  { type: 'lens', tag: 'PHOTO', caption: 'EXIF CAPTURE', z: -6200 }
];

function getFloatingObjectHTML(type, caption) {
  if (type === 'slate') {
    return `
      <div class="obj-slate">
        <div class="slate-top"><div class="stripes"></div></div>
        <div class="slate-body">
          <div class="slate-title">${caption}</div>
          <div class="slate-meta"><span>SCENE</span><span>ROLL</span><span>TAKE</span></div>
          <div class="slate-numbers"><span>04</span><span>12</span><span>02</span></div>
        </div>
      </div>
    `;
  }
  if (type === 'book') {
    return `
      <div class="obj-book">
        <div class="book-spine"></div>
        <div class="book-cover">
          <div class="book-title">Tarikshir</div>
          <div class="book-author">A. Venkatesan</div>
          <div class="book-seal"></div>
        </div>
      </div>
    `;
  }
  if (type === 'token') {
    return `
      <div class="obj-token">
        <div class="token-glow"></div>
        <div class="token-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7l9-4 9 4M3 17l9 4 9-4M3 12l9 4 9-4" />
          </svg>
        </div>
      </div>
    `;
  }
  if (type === 'pdf') {
    return `
      <div class="obj-pdf">
        <div class="pdf-header">
          <span class="pdf-dot"></span>
          <span class="pdf-title">${caption}</span>
        </div>
        <div class="pdf-lines">
          <div class="pdf-line" style="width: 80%"></div>
          <div class="pdf-line" style="width: 60%"></div>
          <div class="pdf-line" style="width: 90%"></div>
          <div class="pdf-line" style="width: 40%"></div>
        </div>
        <div class="pdf-stamp">VERIFIED</div>
      </div>
    `;
  }
  if (type === 'lens') {
    return `
      <div class="obj-lens">
        <div class="lens-outer">
          <div class="lens-inner">
            <div class="lens-glass"></div>
            <div class="lens-aperture"></div>
          </div>
        </div>
      </div>
    `;
  }
  return '';
}


// Brand and logo evidence assets to tease in 3D space
const EVIDENCE_FILES = [
  { src: '/public/proof/78/5034-1-round-porcelain-plate-mockup.webp', tag: 'DESIGN', caption: 'SILVER DRAGON' },
  { src: '/public/proof/78/ClearGlassJarMockup077.webp', tag: 'BRAND', caption: 'SILVER DRAGON' },
  { src: '/public/proof/78/Mockup sticker.webp', tag: 'LOGO', caption: 'SILVER DRAGON' },
  { src: '/public/proof/78/apron Mockup.webp', tag: 'BRAND', caption: 'SILVER DRAGON' },
  { src: '/public/proof/78/1-Wrapping Paper Mockup.webp', tag: 'DESIGN', caption: 'SILVER DRAGON' },
  { src: '/public/proof/82/23-cardboard-box-mockup-03.webp', tag: 'BRAND', caption: 'CROSS.PET' },
  { src: '/public/proof/82/bulbfish-free-craft-bag-mockup.webp', tag: 'DESIGN', caption: 'CROSS.PET' },
  { src: '/public/proof/82/Group_91.webp', tag: 'IDENTITY', caption: 'CROSS.PET' },
  { src: '/public/proof/82/Group_92.webp', tag: 'LOGO', caption: 'CROSS.PET' },
  { src: '/public/proof/82/Parcel_Mockup_by_Webandcat.webp', tag: 'BRAND', caption: 'CROSS.PET' },
  { src: '/public/proof/25/profile_picture.webp', tag: 'LOGO', caption: 'GREENOPIA' },
  { src: '/public/proof/25/fb_cover.webp', tag: 'BRAND', caption: 'GREENOPIA' },
  { src: '/public/proof/My village tea branding/My village tea logo-05.webp', tag: 'LOGO', caption: 'VILLAGE TEA' },
  { src: '/public/proof/My village tea branding/Artboard 2 copy 21.webp', tag: 'DESIGN', caption: 'VILLAGE TEA' },
  { src: '/public/proof/WOW/logo 23.webp', tag: 'LOGO', caption: 'WOW BRAND' },
  { src: '/public/proof/WOW/IMG_1500.webp', tag: 'DESIGN', caption: 'WOW BRAND' }
];

const cityLoad = { pct: 0, done: false };
if (COARSE) {
  cityLoad.done = true;
  cityLoad.pct = 100;
}

const BEAT_TIMINGS = [
  { fadeInStart: 0, fadeInEnd: 0, fadeOutStart: 0.04, fadeOutEnd: 0.10 }, // Beat 1
  { fadeInStart: 0.04, fadeInEnd: 0.10, fadeOutStart: 0.18, fadeOutEnd: 0.24 }, // Beat 2
  { fadeInStart: 0.18, fadeInEnd: 0.24, fadeOutStart: 0.34, fadeOutEnd: 0.40 }, // Beat 3
  { fadeInStart: 0.34, fadeInEnd: 0.40, fadeOutStart: 0.49, fadeOutEnd: 0.55 }, // Beat 4
  { fadeInStart: 0.49, fadeInEnd: 0.55, fadeOutStart: 0.64, fadeOutEnd: 0.70 }, // Beat 5
  { fadeInStart: 0.64, fadeInEnd: 0.70, fadeOutStart: 0.80, fadeOutEnd: 0.86 }, // Beat 6
  { fadeInStart: 0.80, fadeInEnd: 0.86, fadeOutStart: 1.0, fadeOutEnd: 1.0 }, // Beat 7
];

const CAMERA_KEYFRAMES = [
  { radius: 45, polar: 0.49 * Math.PI, azimuth: 0.9, targetX: 12, targetY: 4, targetZ: 3 },      // Beat 1
  { radius: 55, polar: 0.45 * Math.PI, azimuth: 0.4, targetX: -8, targetY: 6, targetZ: -5 },     // Beat 2
  { radius: 50, polar: 0.42 * Math.PI, azimuth: -0.4, targetX: 6, targetY: 5, targetZ: 8 },      // Beat 3
  { radius: 70, polar: 0.38 * Math.PI, azimuth: -1.2, targetX: -5, targetY: 6, targetZ: 2 },     // Beat 4
  { radius: 60, polar: 0.48 * Math.PI, azimuth: -0.8, targetX: 8, targetY: 4, targetZ: -10 },    // Beat 5
  { radius: 52, polar: 0.45 * Math.PI, azimuth: 0.1, targetX: -6, targetY: 5, targetZ: 12 },     // Beat 6
  { radius: 123.5, polar: 0.516 * Math.PI, azimuth: -0.001, targetX: 0, targetY: 8.3, targetZ: 0 } // Beat 7
];

/* ---- char-level splitter for kinetic reveals ---- */
function splitNodeIntoWords(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    // Split by spaces, preserving the spaces in the array
    const tokens = text.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    
    tokens.forEach((token) => {
      if (/^\s+$/.test(token)) {
        // It's a space or spaces. Just create a text node.
        frag.appendChild(document.createTextNode(token));
      } else if (token.length > 0) {
        // It's a word. Create a .word span.
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.style.display = 'inline-block';
        wordSpan.style.whiteSpace = 'nowrap';
        
        // Wrap each character of the word in a .char span
        [...token].forEach((char) => {
          const charSpan = document.createElement('span');
          charSpan.className = 'char';
          charSpan.style.display = 'inline-block';
          charSpan.textContent = char;
          wordSpan.appendChild(charSpan);
        });
        
        frag.appendChild(wordSpan);
      }
    });
    
    node.parentNode.replaceChild(frag, node);
  } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('word') && !node.classList.contains('char')) {
    // Recursively process child nodes, converting to array to avoid live list mutation issues
    [...node.childNodes].forEach(splitNodeIntoWords);
  }
}
function splitIntoChars(beat) {
  beat.querySelectorAll('.display, .lede').forEach((element) => {
    splitNodeIntoWords(element);
  });
}

function setActiveBg(beatNum) {
  document.body.dataset.activeBeat = String(beatNum);
}

/* ---- dynamic spawning of scattered evidence polaroids ---- */
function spawnEvidenceTeases() {
  const scene = document.querySelector('.scene3d');
  if (!scene || COARSE || PREFERS_REDUCED_MOTION) return;

  const combined = [];
  EVIDENCE_FILES.forEach((item, i) => {
    combined.push({
      type: 'image',
      src: item.src,
      tag: item.tag,
      caption: item.caption,
      z: -400 - i * 380,
    });
  });
  
  FLOATING_OBJECTS.forEach((item) => {
    combined.push({
      type: item.type,
      tag: item.tag,
      caption: item.caption,
      z: item.z,
    });
  });
  
  combined.sort((a, b) => b.z - a.z);

  combined.forEach((item, _index) => {
    const card = document.createElement('div');
    card.className = item.type === 'image' ? 'evidence-card' : 'evidence-card floating-obj';
    card.dataset.z = item.z;
    
    // Position randomly on left or right margin, keeping center 920px clean
    const side = Math.random() > 0.5 ? 1 : -1;
    const x_screen = side * (440 + Math.random() * 180); // screen target
    const y_screen = -220 + Math.random() * 440; // screen target vertical spread
    
    // Perspective correction: scale coordinates out at distance so they project to target screen positions
    const scale = (1000 - item.z) / 1000;
    const x = x_screen * scale;
    const y = y_screen * scale;
    const rotate = (Math.random() - 0.5) * 22; // rotation angle
    
    card.dataset.ox = x;
    card.dataset.oy = y;
    card.dataset.orot = rotate;
    
    card.style.transform = `translate3d(${x}px, ${y}px, ${item.z}px) rotate(${rotate}deg)`;
    card.style.opacity = '0'; // start hidden, faded in dynamically
    card.style.visibility = 'hidden';
    
    if (item.type === 'image') {
      card.innerHTML = `
        <div class="card-inner">
          <img src="${item.src}" alt="Evidence ${item.caption}" loading="lazy" />
          <div class="card-caption">
            <span class="card-tag">${item.tag}</span>
            <span class="card-id">${item.caption}</span>
          </div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="card-inner">
          ${getFloatingObjectHTML(item.type, item.caption)}
          <div class="card-caption">
            <span class="card-tag">${item.tag}</span>
            <span class="card-id">${item.caption}</span>
          </div>
        </div>
      `;
    }
    scene.appendChild(card);
  });
}


/* ---- sync loader HUD with scroll progress and background city load ---- */
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

  // Reveal CTA button near the end or on mobile, dynamically showing compilation progress
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

/* ---- trigger real-time typography stagger reveals and highlight wipes ---- */
function revealBeatTypography(n) {
  const group = document.querySelector(`[data-beat="${n}"]`);
  if (!group) return;
  const qaInner = (sel) => group.querySelectorAll(sel);

  // 1. Reveal words one-by-one for reading flow
  const words = qaInner('.word');
  if (words.length) {
    gsap.killTweensOf(words);
    gsap.fromTo(words, 
      { yPercent: 35, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.5, stagger: 0.06, ease: 'power2.out', overwrite: 'auto' }
    );
  }

  // 2. Wipe highlights
  const highlights = qaInner('.highlight');
  highlights.forEach(h => {
    h.classList.remove('active');
    setTimeout(() => {
      h.classList.add('active');
    }, 150);
  });

  // 3. Beat-specific secondary elements (real-time entrance reveals)
  if (n === 3) {
    const titleWords = qaInner('.title-word');
    if (titleWords.length) {
      gsap.killTweensOf(titleWords);
      gsap.fromTo(titleWords,
        { y: 40, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.6, stagger: 0.1, ease: 'expo.out', overwrite: 'auto' }
      );
    }
  }

  if (n === 4) {
    const stats = qaInner('.stat-item');
    if (stats.length) {
      gsap.killTweensOf(stats);
      gsap.fromTo(stats,
        { y: 30, opacity: 0, rotateX: 20 },
        { y: 0, opacity: 1, rotateX: 0, duration: 0.6, stagger: 0.08, ease: 'back.out(1.2)', overwrite: 'auto' }
      );
    }
  }

  if (n === 5) {
    const cards = qaInner('.receipt-card');
    if (cards.length) {
      gsap.killTweensOf(cards);
      gsap.fromTo(cards,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, ease: 'expo.out', overwrite: 'auto' }
      );
    }
  }

  if (n === 6) {
    const notes = qaInner('.note-row');
    if (notes.length) {
      gsap.killTweensOf(notes);
      gsap.fromTo(notes,
        { x: -20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out', overwrite: 'auto' }
      );
    }
  }
}

function init() {
  /* ---- Lenis smooth scroll ---- */
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
    log('lenis on');
  }

  const beats = gsap.utils.toArray('.beat-group');
  const progressFill = document.getElementById('progressFill');
  const chromeBeat = document.getElementById('chromeBeat');
  const hud = document.getElementById('debugHud');
  if (DEBUG && hud) hud.hidden = false;

  const totalBeats = beats.length;
  const padBeat = (n) => String(n).padStart(2, '0');
  const formatBeat = (n) => `${padBeat(n)} / ${padBeat(totalBeats)}`;

  // Split headers for kinetic reveal
  beats.forEach((b) => splitIntoChars(b));

  let activeBeat = 1;
  setActiveBg(1);
  if (chromeBeat) chromeBeat.textContent = formatBeat(1);
  const setBeat = (n) => {
    if (n === activeBeat) return;
    activeBeat = n;
    setActiveBg(n);
    if (chromeBeat) chromeBeat.textContent = formatBeat(n);
    revealBeatTypography(n);
  };

  const groups = document.querySelectorAll('.beat-group');

  // Mobile or Reduced Motion static fallback
  if (PREFERS_REDUCED_MOTION || COARSE) {
    groups.forEach((g) => gsap.set(g, { opacity: 1, clearProps: 'all' }));
    
    // Set up standard 2D scroll trigger scene changes
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

  // Position beats in Z depth and set initial opacity/scale
  // Position beats in Z depth and set initial opacity/scale/element hidden states
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

    // Set initial state for elements inside beats 2 to 7
    if (index > 0) {
      const qaInner = (sel) => group.querySelectorAll(sel);
      const words = qaInner('.word');
      if (words.length) gsap.set(words, { yPercent: 35, opacity: 0 });

      const titleWords = qaInner('.title-word');
      if (titleWords.length) gsap.set(titleWords, { y: 40, opacity: 0, scale: 0.9 });

      const stats = qaInner('.stat-item');
      if (stats.length) gsap.set(stats, { y: 30, opacity: 0, rotateX: 20 });

      const cards = qaInner('.receipt-card');
      if (cards.length) gsap.set(cards, { y: 40, opacity: 0 });

      const notes = qaInner('.note-row');
      if (notes.length) gsap.set(notes, { x: -20, opacity: 0 });
    } else {
      // For Beat 1, activate highlight immediately
      const highlights = group.querySelectorAll('.highlight');
      highlights.forEach(h => h.classList.add('active'));
    }
  });

  /* ---- 3D Scroll Timeline ---- */
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

        // Divide total scroll progress cleanly into 7 beats
        const beatNum = Math.min(totalBeats, Math.floor(p * totalBeats) + 1);
        setBeat(beatNum);


        // Sync loader HUD percentage
        syncLoaderHUD();

        // Update background camera in iframe if loaded, using keyframed focus points for cinematic effect
        try {
          const frame = document.getElementById('archiveFrame');
          const terrain = frame?.contentWindow?.__terrain;
          if (terrain && terrain.updateLandingCamera) {
            const scaledP = p * (CAMERA_KEYFRAMES.length - 1);
            const index = Math.floor(scaledP);
            const nextIndex = Math.min(index + 1, CAMERA_KEYFRAMES.length - 1);
            const t = scaledP - index;

            const k1 = CAMERA_KEYFRAMES[index];
            const k2 = CAMERA_KEYFRAMES[nextIndex];

            // Smooth the transition between camera keyframes
            const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            const radius = k1.radius + (k2.radius - k1.radius) * easeT;
            const polar = k1.polar + (k2.polar - k1.polar) * easeT;
            const azimuth = k1.azimuth + (k2.azimuth - k1.azimuth) * easeT;
            const targetX = k1.targetX + (k2.targetX - k1.targetX) * easeT;
            const targetY = k1.targetY + (k2.targetY - k1.targetY) * easeT;
            const targetZ = k1.targetZ + (k2.targetZ - k1.targetZ) * easeT;
            
            terrain.updateLandingCamera(
              { radius, polar, azimuth },
              { x: targetX, y: targetY, z: targetZ }
            );
          }
        } catch {
          // ignore
        }

        if (DEBUG && hud) {
          hud.textContent =
            `beat   ${activeBeat} / 07\n` +
            `scroll ${(p * 100).toFixed(1)}%\n` +
            `range  ${Math.round(ScrollTrigger.maxScroll(window))}px`;
        }
      }
    }
  });

  // Moves the scene depth forward as we scroll
  tl.to('.scene3d', {
    z: 7000,
    ease: 'none',
    duration: 1.0
  }, 0);

  // Scroll-driven highlight on Beat 3 lede text
  const highlights = document.querySelectorAll('.lede-highlight');
  if (highlights.length) {
    highlights.forEach((h, i) => {
      tl.to(h, {
        backgroundSize: '100% 100%',
        color: '#0c0c0b',
        duration: 0.08,
        ease: 'none'
      }, 0.22 + i * 0.04);
    });
  }

  // Animate the opacity, scale, and positioning of each beat along the scroll
  groups.forEach((group, index) => {
    const zVal = parseFloat(group.dataset.z) || 0;
    const center = index / 6;
    const duration = 0.06;

    if (index === 0) {
      // Beat 1 just flies past and fades out
      tl.to(group, {
        autoAlpha: 0,
        scale: 1.6,
        z: zVal + 650,
        ease: 'power2.in',
        duration: duration,
      }, 0.05); // starts fading out at 5% scroll
    } else if (index < 6) {
      // Approach and fade in
      tl.to(group, {
        autoAlpha: 1,
        scale: 1,
        ease: 'power2.out',
        duration: duration,
      }, center - 0.08);

      // Fly past the camera and fade out
      tl.to(group, {
        autoAlpha: 0,
        scale: 1.6,
        z: zVal + 650,
        ease: 'power2.in',
        duration: duration,
      }, center + 0.04);
    } else {
      // Beat 7 (Handoff CTA) settles at the end
      tl.to(group, {
        autoAlpha: 1,
        scale: 1,
        ease: 'power2.out',
        duration: 0.08,
      }, 0.88);
    }
  });

  /* ---- interaction polish ---- */
  initCursor();
  initMagnetic();
  initKickerScramble();
  
  // Page load entrance animation for Beat 1
  const beat1Words = document.querySelectorAll('[data-beat="1"] .word');
  const beat1Card = document.querySelector('[data-beat="1"] .floating-card');
  const beat1Cue = document.querySelector('[data-beat="1"] .scroll-cue');
  if (beat1Words.length) {
    gsap.fromTo(beat1Words, {
      yPercent: 35,
      opacity: 0
    }, {
      yPercent: 0,
      opacity: 1,
      duration: 0.5,
      stagger: 0.06,
      ease: 'power2.out',
      delay: 0.2
    });
  }
  if (beat1Card) {
    gsap.fromTo(beat1Card, {
      opacity: 0,
      x: 60,
      rotateY: 10
    }, {
      opacity: 1,
      x: 0,
      rotateY: -15,
      duration: 1.2,
      ease: 'power3.out',
      delay: 0.4
    });
  }
  if (beat1Cue) {
    gsap.fromTo(beat1Cue, { opacity: 0 }, { opacity: 0.8, duration: 0.5, delay: 1.0 });
  }

  /* ---- refresh triggers ---- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener('resize', debounce(() => ScrollTrigger.refresh(), 200));

  window.LANDING_DEBUG = { ScrollTrigger, lenis, BEAT_TIMINGS, refresh: () => ScrollTrigger.refresh() };
  log('init done, scene compiled in 3D');
}

/* ===================================================================
   custom trailing cursor (difference mode)
   =================================================================== */
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

    if (!window.ctaExploded) {
      const trigger = ScrollTrigger.getById('landingScroll');
      const p = trigger ? trigger.progress : 0;
      const sceneZ = 7000 * p;
      const cards = document.querySelectorAll('.evidence-card');

      cards.forEach((card, index) => {
        const cardZ = parseFloat(card.dataset.z) || 0;
        const relZ = sceneZ + cardZ;
        
        let opacity;
        if (relZ < -1500) {
          opacity = 0;
        } else if (relZ >= -1500 && relZ < -1000) {
          opacity = (relZ - (-1500)) / 500;
        } else {
          opacity = 1.0;
        }

        card.style.opacity = opacity;
        card.style.visibility = opacity > 0 ? 'visible' : 'hidden';

        if (opacity > 0) {
          const ox = parseFloat(card.dataset.ox) || 0;
          const oy = parseFloat(card.dataset.oy) || 0;
          const orot = parseFloat(card.dataset.orot) || 0;

          // Pull factor
          let f = 0;
          if (relZ >= -1500 && relZ < -200) {
            f = (relZ - (-1500)) / 1300;
            f = f * f; // easeInQuad
          } else if (relZ >= -200) {
            f = 1.0;
          }

          const scaleFactor = (1000 - relZ) / 1000;
          const mx = pos.x - window.innerWidth / 2;
          const my = pos.y - window.innerHeight / 2;
          
          const targetX = mx * scaleFactor;
          const targetY = my * scaleFactor;
          
          const offsetAmount = 15; // pixel separation offset in deck stack
          const angleSpread = 6;  // angle fanning offset in deck stack
          const seed = index;
          
          const currentX = ox * (1 - f) + (targetX + (seed % 4 - 1.5) * offsetAmount) * f;
          const currentY = oy * (1 - f) + (targetY + (Math.floor(seed / 4) % 4 - 1.5) * offsetAmount) * f;
          const currentRot = orot * (1 - f) + ((seed % 7 - 3) * angleSpread) * f;
          
          card.style.transform = `translate3d(${currentX}px, ${currentY}px, ${cardZ}px) rotate(${currentRot}deg)`;
        }
      });
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const interactives = document.querySelectorAll('a, button, .receipt-card, .handoff-btn, .skip-archive, .evidence-card');
  interactives.forEach((el) => {
    el.addEventListener('mouseenter', () => cursor.classList.add('expand'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('expand'));
  });
}

/* ===================================================================
   magnetic hover
   =================================================================== */
function initMagnetic() {
  if (PREFERS_REDUCED_MOTION) return;
  if (matchMedia('(pointer: coarse)').matches) return;
  
  const selectors = '.receipt-card, .handoff-btn, .skip-archive, .evidence-card';
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

/* ===================================================================
   kicker scramble text decodes
   =================================================================== */
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

/* ===================================================================
   background archive boot & wait-period loading HUD logic
   =================================================================== */
function markCityReady() {
  cityLoad.done = true;
  cityLoad.pct = 100;
  updateGate();
  
  const frame = document.getElementById('archiveFrame');
  if (frame) {
    // Keep frame HIDDEN (opacity 0) in the background during scroll!
    // Initialize its WebGL camera to a dramatic starting low-angle zoom
    try {
      const terrain = frame.contentWindow?.__terrain;
      if (terrain) {
        if (terrain.updateLandingCamera) {
          // low-angle close-up frame view looking up at building models:
          terrain.updateLandingCamera(
            { radius: 45, polar: 0.49 * Math.PI, azimuth: 0.9 },
            { x: 12, y: 4, z: 3 }
          );
        }
        if (terrain.setThemeBlend) {
          // start the WebGL scene as dark mode matching the landing theme
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

  // 1. Set explosion state for cards
  window.ctaExploded = true;

  // 2. Explode the stacked cards
  const cards = document.querySelectorAll('.evidence-card');
  gsap.timeline()
    .to(cards, {
      x: () => (Math.random() - 0.5) * window.innerWidth * 1.5,
      y: () => (Math.random() - 0.5) * window.innerHeight * 1.5,
      z: -3000,
      opacity: 0,
      scale: 0.1,
      rotation: () => (Math.random() - 0.5) * 360,
      duration: 1.4,
      stagger: 0.02,
      ease: 'power3.in',
      onComplete: () => {
        cards.forEach(c => c.style.display = 'none');
      }
    });

  // 3. Fade out landing DOM (Remove landing class to restore cursor)
  document.body.classList.remove('landing');
  document.body.classList.add('archive-revealed');

  // 4. Fade in background iframe
  frame.style.opacity = '1';
  frame.style.pointerEvents = 'auto';
  frame.removeAttribute('aria-hidden');

  // 5. Clean up Lenis and ScrollTrigger to release wheel and scroll capture
  if (lenis) {
    lenis.destroy();
    if (lenisRaf) gsap.ticker.remove(lenisRaf);
    lenis = null;
  }
  ScrollTrigger.getAll().forEach(t => t.disable());

  // 6. Smoothly animate WebGL camera in background iframe to standard overview
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

    // 7. Sync Light/Dark theme settings and remove landing-bg-mode class
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

/* ===================================================================
   Loader HUD progress states
   =================================================================== */
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
      // If we are on mobile, let the standard link behavior take over
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
    frame.style.opacity = cityLoad.done ? '0.35' : '0';
  }
};

window.onCityReady = () => {
  markCityReady();
  
  const frame = document.getElementById('archiveFrame');
  if (frame && !COARSE) {
    frame.style.opacity = '0.35';
  }
};

/* ---- boot ---- */
if (!gsap || !ScrollTrigger) {
  console.error('[landing] GSAP / ScrollTrigger failed to load');
} else {
  gsap.registerPlugin(ScrollTrigger);
  spawnEvidenceTeases();
  init();
  initArchiveFrame();
  initHandoffGate();
}
