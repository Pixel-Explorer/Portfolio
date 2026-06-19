/* =====================================================================
   LANDING SCROLL-PITCH — Pass 3: Alche bg-stage + Studio Dialect comp
   - persistent fixed bg-stage with image crossfades per beat
   - always-on Ken Burns (CSS-driven)
   - char-level type reveals with slow stagger
   - editorial grid composition (CSS-driven, no JS layout)
   - slower pacing, no procedural 3D
   ===================================================================== */

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const log = DEBUG ? console.log.bind(console, '[landing]') : () => {};
const PREFERS_REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Lenis = window.Lenis;

const SPEED = {
  lenisDuration: 1.2,
  wheelMultiplier: 0.85,
  enterDur: 0.42,
  enterStagger: 0.012,
  exitAt: 0.78,
  exitDur: 0.22,
};

/* ---- char-level splitter (preserves child elements like .lede-highlight) ---- */
function splitCharsInNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const frag = document.createDocumentFragment();
    [...node.textContent].forEach((ch) => {
      const span = document.createElement('span');
      span.textContent = ch === ' ' ? ' ' : ch;
      span.className = 'char';
      span.style.display = 'inline-block';
      frag.appendChild(span);
    });
    node.parentNode.replaceChild(frag, node);
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    [...node.childNodes].forEach(splitCharsInNode);
  }
}
function splitIntoChars(beat) {
  beat.querySelectorAll('.line-in').forEach((line) => splitCharsInNode(line));
}

/* ---- ensure exactly one bg-slide is active at a time ---- */
function setActiveBg(beatNum) {
  document.querySelectorAll('#bg-stage .bg-slide').forEach((s) => {
    s.classList.toggle('is-active', s.dataset.bg === String(beatNum));
  });
  document.body.dataset.activeBeat = String(beatNum);
}

function init() {
  /* ---- Lenis smooth scroll ---- */
  let lenis = null;
  if (!PREFERS_REDUCED_MOTION && Lenis) {
    lenis = new Lenis({
      duration: SPEED.lenisDuration,
      smoothWheel: true,
      wheelMultiplier: SPEED.wheelMultiplier,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    log('lenis on');
  }

  const beats = gsap.utils.toArray('.beat');
  const progressFill = document.getElementById('progressFill');
  const chromeBeat = document.getElementById('chromeBeat');
  const hud = document.getElementById('debugHud');
  if (DEBUG && hud) hud.hidden = false;

  const totalBeats = beats.length;
  const padBeat = (n) => String(n).padStart(2, '0');
  const formatBeat = (n) => `${padBeat(n)} / ${padBeat(totalBeats)}`;

  /* ---- split headlines into chars for letter-level reveal ---- */
  beats.forEach((b) => splitIntoChars(b));

  let activeBeat = 1;
  setActiveBg(1);
  if (chromeBeat) chromeBeat.textContent = formatBeat(1);
  const setBeat = (n) => {
    if (n === activeBeat) return;
    activeBeat = n;
    setActiveBg(n);
    if (chromeBeat) chromeBeat.textContent = formatBeat(n);
  };

  /* ---- global progress rail (transform-only) + debug HUD ---- */
  if (progressFill) gsap.set(progressFill, { scaleX: 0, transformOrigin: 'left center' });
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      if (progressFill) gsap.set(progressFill, { scaleX: self.progress });
      if (DEBUG && hud) {
        hud.textContent =
          `beat   ${activeBeat} / ${totalBeats}\n` +
          `scroll ${(self.progress * 100).toFixed(1)}%\n` +
          `range  ${Math.round(ScrollTrigger.maxScroll(window))}px`;
      }
    },
  });

  /* ---- per-beat reveal ---- */
  beats.forEach((beat) => {
    const n = parseInt(beat.dataset.beat, 10);
    const chars = beat.querySelectorAll('.char');

    if (PREFERS_REDUCED_MOTION) {
      gsap.set(chars, { yPercent: 0, opacity: 1 });
      revealExtrasStatic(beat);
      ScrollTrigger.create({
        trigger: beat,
        start: 'top center',
        onToggle: (self) => self.isActive && setBeat(n),
      });
      return;
    }

    // initial char state: hidden below the line mask
    gsap.set(chars, { yPercent: 105, opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: beat,
        start: 'top top',
        end: () => '+=' + (parseFloat(beat.dataset.len) || 1) * window.innerHeight,
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        onEnter: () => setBeat(n),
        onEnterBack: () => setBeat(n),
      },
    });

    // char reveal: slow stagger, deep ease, big read window
    tl.to(chars, {
      yPercent: 0,
      opacity: 1,
      duration: SPEED.enterDur,
      stagger: SPEED.enterStagger,
      ease: 'power3.out',
    }, 0);

    // per-beat secondary reveals
    buildBeat(n, beat, tl);

    // generic exit (beat 7 keeps its own)
    if (n !== 7) {
      tl.to(chars, {
        yPercent: -85,
        opacity: 0,
        duration: SPEED.exitDur,
        stagger: 0.006,
        ease: 'power2.in',
      }, SPEED.exitAt);
    }
  });

  /* ---- interaction polish ---- */
  initMagnetic();

  /* ---- refresh after fonts settle + on resize ---- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener('resize', debounce(() => ScrollTrigger.refresh(), 200));

  window.LANDING_DEBUG = { ScrollTrigger, lenis, SPEED, refresh: () => ScrollTrigger.refresh() };
  log('init done,', beats.length, 'beats');
}

/* ===================================================================
   per-beat secondary choreography (extras beyond the char reveal)
   =================================================================== */
function buildBeat(n, beat, tl) {
  const q = (sel) => beat.querySelector(sel);
  const qa = (sel) => beat.querySelectorAll(sel);

  // beat 1: headline alone — no extras after dropping scroll cue + locale strip

  if (n === 2) {
    const caps = qa('.beat-cap .cap');
    gsap.set(caps, { x: 24, autoAlpha: 0 });
    tl.to(caps, { x: 0, autoAlpha: 1, duration: 0.3, stagger: 0.12, ease: 'power3.out' }, 0.22);
  }

  if (n === 3) {
    // lede sits in first; title-lock locks in after, like a logo settling
    const words = qa('.title-lock-word');
    gsap.set(words, { y: 80, autoAlpha: 0, scale: 0.86, transformOrigin: 'left center' });
    tl.to(words, { y: 0, autoAlpha: 1, scale: 1, duration: 0.45, stagger: 0.16, ease: 'expo.out' }, 0.32);

    const highlights = qa('.lede-highlight');
    if (highlights.length) {
      highlights.forEach((h, i) => {
        gsap.set(h, { '--hl': 0 });
        tl.to(h, { '--hl': 1, duration: 0.18, ease: 'none' }, 0.1 + i * 0.08);
      });
    }
  }

  if (n === 4) {
    const stats = qa('.proof-stat');
    gsap.set(stats, { y: 70, autoAlpha: 0, rotateX: 30 });
    tl.to(stats, { y: 0, autoAlpha: 1, rotateX: 0, duration: 0.4, stagger: 0.1, ease: 'back.out(1.4)' }, 0.18);
    tl.to(q('.proof-grid'), { y: -40, autoAlpha: 0, duration: 0.24, ease: 'power2.in' }, SPEED.exitAt);
  }

  if (n === 5) {
    const cards = qa('.receipt');
    gsap.set(cards, { y: 80, autoAlpha: 0 });
    tl.to(cards, { y: 0, autoAlpha: 1, duration: 0.42, stagger: 0.11, ease: 'expo.out' }, 0.24);
    // parallax depth: cards drift up at different rates
    cards.forEach((c) => {
      const d = parseFloat(c.dataset.depth) || 0.4;
      tl.to(c, { y: -(d * 50), ease: 'none', duration: 1 }, 0);
    });
    tl.to(q('.receipts'), { autoAlpha: 0, y: -30, duration: 0.22, ease: 'power2.in' }, SPEED.exitAt + 0.02);
  }

  if (n === 6) {
    const caps = qa('.beat-cap .cap');
    gsap.set(caps, { x: -24, autoAlpha: 0 });
    tl.to(caps, { x: 0, autoAlpha: 1, duration: 0.3, stagger: 0.14, ease: 'power3.out' }, 0.24);
  }

  if (n === 7) {
    const cta = q('.handoff-cta');
    gsap.set(cta, { y: 40, autoAlpha: 0 });
    tl.to(cta, { y: 0, autoAlpha: 1, duration: 0.4, ease: 'power3.out' }, 0.5);
  }
}

/* reduced-motion: surface everything */
function revealExtrasStatic(beat) {
  beat.querySelectorAll(
    '.title-lock-word, .proof-stat, .receipt, .handoff-cta, .beat-cap, .beat-cap .cap, .lede-highlight'
  ).forEach((el) => gsap.set(el, { clearProps: 'all' }));
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ===================================================================
   magnetic hover
   =================================================================== */
function initMagnetic() {
  if (PREFERS_REDUCED_MOTION) return;
  if (matchMedia('(pointer: coarse)').matches) return;
  document.querySelectorAll('.receipt, .handoff-btn').forEach((el) => {
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

/* ---- boot ---- */
if (!gsap || !ScrollTrigger) {
  console.error('[landing] GSAP / ScrollTrigger failed to load');
} else {
  gsap.registerPlugin(ScrollTrigger);
  init();
}
