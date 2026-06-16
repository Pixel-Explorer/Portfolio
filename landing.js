/* =====================================================================
   LANDING SCROLL-PITCH PROTOTYPE  —  motion engine
   LANDING_BUILD.md §6/§8/§12. Lenis (smooth) + GSAP ScrollTrigger
   (pin + scrub per beat). Vanilla — no React.

   TUNING: the ~30s scan-feel is set by per-beat `data-len` in
   landing.html (scroll length as a multiple of viewport height) and
   the SPEED knobs just below. Open `landing.html?debug=1` for the HUD.
   ===================================================================== */

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const log = DEBUG ? console.log.bind(console, '[landing]') : () => {};
const PREFERS_REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Lenis = window.Lenis;

/* ---- tuning knobs ------------------------------------------------ */
const SPEED = {
  lenisDuration: 1.05,   // smooth-scroll inertia (higher = floatier)
  wheelMultiplier: 1.0,  // raw wheel sensitivity
  enterDur: 0.34,        // headline reveal (timeline units, 0..1 per beat)
  enterStagger: 0.06,
  exitAt: 0.72,          // when type starts leaving (0..1 through the pin)
  exitDur: 0.28,
};

function init() {
  /* ---- Lenis smooth scroll (skipped under reduced-motion) -------- */
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
  } else {
    log('lenis off (reduced-motion or unavailable)');
  }

  const beats = gsap.utils.toArray('.beat');
  const beatNumEl = document.getElementById('beatNum');
  const progressFill = document.getElementById('progressFill');
  const hud = document.getElementById('debugHud');
  if (DEBUG && hud) hud.hidden = false;

  let activeBeat = 1;
  const setBeat = (n) => {
    if (n === activeBeat) return;
    activeBeat = n;
    if (beatNumEl) beatNumEl.textContent = String(n).padStart(2, '0');
  };

  /* ---- global progress rail + debug HUD -------------------------- */
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      if (progressFill) progressFill.style.width = (self.progress * 100).toFixed(2) + '%';
      if (DEBUG && hud) {
        hud.textContent =
          `beat   ${activeBeat} / ${beats.length}\n` +
          `scroll ${(self.progress * 100).toFixed(1)}%\n` +
          `range  ${Math.round(ScrollTrigger.maxScroll(window))}px\n` +
          `lenis  ${lenis ? 'on' : 'off'}`;
      }
    },
  });

  /* ---- per-beat reveal + pin ------------------------------------- */
  beats.forEach((beat) => {
    const n = parseInt(beat.dataset.beat, 10);
    const lines = beat.querySelectorAll('.line-in');

    // ----- reduced motion: reveal statically, no pin, no scrub -----
    if (PREFERS_REDUCED_MOTION) {
      gsap.set(lines, { yPercent: 0 });
      revealExtrasStatic(beat);
      ScrollTrigger.create({
        trigger: beat,
        start: 'top center',
        onToggle: (self) => self.isActive && setBeat(n),
      });
      return;
    }

    // initial hidden state
    gsap.set(lines, { yPercent: 110 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: beat,
        start: 'top top',
        end: () => '+=' + (parseFloat(beat.dataset.len) || 1) * window.innerHeight,
        pin: true,
        scrub: true,
        anticipatePin: 1,
        onEnter: () => setBeat(n),
        onEnterBack: () => setBeat(n),
      },
    });

    // headline mask-reveal (enter) — beat 7 keeps its own exit
    tl.to(lines, {
      yPercent: 0,
      duration: SPEED.enterDur,
      stagger: SPEED.enterStagger,
      ease: 'power3.out',
    }, 0);

    // per-beat extras
    buildBeat(n, beat, tl);

    // generic headline exit (the climax beat clears its own type)
    if (n !== 7) {
      tl.to(lines, {
        yPercent: -110,
        duration: SPEED.exitDur,
        stagger: 0.04,
        ease: 'power2.in',
      }, SPEED.exitAt);
    }

    // ambient float on stickers (guarded; pauses off-screen)
    ambientFloat(beat);
  });

  /* ---- refresh after fonts settle + on resize -------------------- */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener('resize', debounce(() => ScrollTrigger.refresh(), 200));

  // debug handle
  window.LANDING_DEBUG = { ScrollTrigger, lenis, SPEED, refresh: () => ScrollTrigger.refresh() };
  log('init done —', beats.length, 'beats');
}

/* ===================================================================
   per-beat choreography (scrub timeline, 0..1 through the pin)
   =================================================================== */
function buildBeat(n, beat, tl) {
  const q = (sel) => beat.querySelector(sel);
  const qa = (sel) => beat.querySelectorAll(sel);

  // shared parallax for any floating sticker/object
  const floats = qa('[data-float]');
  if (floats.length) tl.to(floats, { yPercent: -26, ease: 'none', duration: 1 }, 0);

  if (n === 1) {
    const cue = q('.scroll-cue');
    if (cue) tl.to(cue, { autoAlpha: 0, duration: 0.15 }, 0.08);
  }

  if (n === 2) {
    const orbit = qa('.orbit-obj');
    orbit.forEach((o, i) => {
      tl.to(o, { yPercent: -40 - i * 18, xPercent: (i % 2 ? 10 : -10), ease: 'none', duration: 1 }, 0);
    });
  }

  if (n === 3) {
    const words = qa('.title-lock-word');
    gsap.set(words, { scale: 0.72, autoAlpha: 0, transformOrigin: 'left center', y: 20 });
    tl.to(words, { scale: 1, autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.08, ease: 'back.out(1.5)' }, 0.4);
    tl.to([q('.lede'), q('.title-lock')], { y: -60, autoAlpha: 0, duration: 0.28, ease: 'power2.in' }, SPEED.exitAt);
  }

  if (n === 4) {
    const stats = qa('.proof-stat');
    gsap.set(stats, { y: 50, autoAlpha: 0, scale: 0.88 });
    tl.to(stats, { y: 0, autoAlpha: 1, scale: 1, duration: 0.28, stagger: 0.07, ease: 'back.out(1.6)' }, 0.06);
    tl.to(q('.proof-grid'), { y: -50, autoAlpha: 0, duration: 0.26, ease: 'power2.in' }, SPEED.exitAt);
  }

  if (n === 5) {
    const arts = qa('.artifact');
    gsap.set(arts, { y: 60, autoAlpha: 0 });
    tl.to(arts, { y: 0, autoAlpha: 1, duration: 0.26, stagger: 0.08, ease: 'power3.out' }, 0.4);
    tl.to(q('.artifacts'), { y: -50, autoAlpha: 0, duration: 0.26, ease: 'power2.in' }, SPEED.exitAt + 0.02);
  }

  if (n === 7) {
    const stage = q('.city-stage');
    const tips = qa('.tooltip');
    const lines = beat.querySelectorAll('.line-in');
    gsap.set(stage, { autoAlpha: 0, scale: 0.94, y: 30 });
    gsap.set(tips, { autoAlpha: 0, y: 12 });
    // type clears, THEN the city sheet resolves (the handoff move)
    tl.to(lines, { yPercent: -110, autoAlpha: 0, duration: 0.22, stagger: 0.03, ease: 'power2.in' }, 0.42);
    tl.to(stage, { autoAlpha: 1, scale: 1, y: 0, duration: 0.34, ease: 'power3.out' }, 0.5);
    tl.to(tips, { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.08, ease: 'power2.out' }, 0.74);
  }
}

/* reduced-motion: make every animated extra visible up front */
function revealExtrasStatic(beat) {
  beat.querySelectorAll(
    '.title-lock-word, .proof-stat, .artifact, .city-stage, .tooltip, [data-float], .orbit-obj'
  ).forEach((el) => gsap.set(el, { clearProps: 'all' }));
}

/* gentle ambient drift on stickers; pauses when the beat is off-screen */
function ambientFloat(beat) {
  beat.querySelectorAll('.sticker').forEach((s, i) => {
    const tw = gsap.to(s, {
      y: '+=10',
      rotation: '+=1.5',
      duration: 2.4 + i * 0.4,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      paused: true,
    });
    ScrollTrigger.create({
      trigger: beat,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (self) => (self.isActive ? tw.play() : tw.pause()),
    });
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---- boot (after all declarations are initialized) --------------- */
if (!gsap || !ScrollTrigger) {
  console.error('[landing] GSAP / ScrollTrigger failed to load');
} else {
  gsap.registerPlugin(ScrollTrigger);
  init();
}
