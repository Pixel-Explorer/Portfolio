# Advanced Web Interaction Patterns — Study Report

> A forensic analysis of high-end interactive websites: **ArtPill Studio**, **Alche Studio**, **Studio Dialect**, and **Vectr**.
> Built for LLM-assisted implementation on a local landing page (localhost:4173, vanilla JS + Three.js + GSAP).
> Date: 2026-06-17

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Site-by-Site Architecture Breakdown](#2-site-by-site-architecture-breakdown)
   - 2.1 [ArtPill Studio — Global Design Studio](#21-artpill-studio)
   - 2.2 [Alche Studio — Creative Studio, Tokyo](#22-alche-studio)
   - 2.3 [Studio Dialect](#23-studio-dialect)
   - 2.4 [Vectr — AI Vector Editor](#24-vectr)
3. [Scroll Architecture](#3-scroll-architecture)
4. [Text & Typography Animation](#4-text--typography-animation)
5. [3D & WebGL Spatial Experience](#5-3d--webgl-spatial-experience)
6. [Cursor & Pointer Interaction](#6-cursor--pointer-interaction)
7. [Composition & View Switching](#7-composition--view-switching)
8. [Information Overlays & Media](#8-information-overlays--media)
9. [Loading Sequences](#9-loading-sequences)
10. [Performance Patterns](#10-performance-patterns)
11. [Implementation Blueprint](#11-implementation-blueprint)
12. [Code Snippet Library](#12-code-snippet-library)
13. [Appendix: Tooling & Resources](#13-appendix-tooling--resources)

---

## 1. Executive Summary

Four studios were analyzed. Their approaches differ but converge on a shared **experience-engine model**:

| Concern | Common Pattern |
|---------|---------------|
| **Scroll** | Smooth-scroll library (Lenis) + GSAP ScrollTrigger |
| **3D** | Persistent Three.js canvas behind all DOM content |
| **Transitions** | SPA routing (Swup / Next.js) with animated view changes |
| **Text** | Character-level reveal via GSAP SplitText or scroll-driven masks |
| **Cursor** | Custom DOM element tracked to mouse, with magnetic/spring effects |
| **Loading** | Animated overlay with progress bar + Lottie/WebGL canvas |
| **State** | Section-based architecture with body `data-current_section` attribute |

**Key Insight:** These are not "pages" — they are **section machines**. The browser is treated as a stage director, not a document viewer.

---

## 2. Site-by-Site Architecture Breakdown

### 2.1 ArtPill Studio

**Stack:** Next.js (App Router) + GSAP + Three.js + WordPress headless CMS

**Architecture:**
- Full-page loading sequence with **scanner animation** (circle + scanline overlay + progress bars)
- GSAP `SplitText` plugin for **character-level text reveal** (`.inner-char` / `.outer-char`)
- Three.js WebGL canvas (`#webgl`) as persistent background
- Custom **circle wipe transition** (`#transitioninner` with `border-radius: 100%`) for page changes
- Sections tracked by `id="sct{n}"` with fixed-position content
- Team reveal with staggered shadow images and line + name labels
- Custom font: NeueMontreal (self-hosted woff)

**Key CSS Patterns (from `db4dc4ec3944e924.css`):**

```css
/* Character-level text animation structure */
.outer-char { position: relative; padding-bottom: 0.5vw; top: 2vw; }
.inner-char { transform: translateY(17vh); }

/* Circle wipe transition for page changes */
#transitioninner {
  width: 100vw; height: 100vw;
  background: #def846;
  border-radius: 100%;
  transform-origin: bottom;
  transform: translateY(calc(50vh + 50vw));
}

/* Scroll indicator animation */
@keyframes animscroll {
  0%   { opacity: 0; transform: translateY(-0.3vw); }
  10%  { opacity: 1; }
  40%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(0.5vw); }
}

/* Custom blink */
@keyframes parp {
  0%   { opacity: 0; }
  50%  { opacity: 1; }
  100% { opacity: 0; }
}

/* Navigation pill slider */
#hover {
  position: absolute;
  transition: 0.5s ease;
  height: 1.45vw; width: 4.45vw;
  background: #fff;
  border-radius: 4vw;
}
#hover.p1 { transform: translateX(-4.4vw); }
#hover.p2 { transform: translateX(0); }
#hover.p3 { transform: translateX(4.4vw); }

/* Loading bar divs (60 divs staggered) */
#loadingbar div {
  margin: 0.1vw;
  background: var(--lime);
  height: 100%; width: 100%;
  opacity: 0;
}
```

**GSAP Implementation (from page chunk):**

```javascript
// GSAP SplitText for character reveal
const split = new SplitText(headingRef.current, {
  type: "chars",
  charsClass: "outer-char"
});
const innerSplit = new SplitText(split.chars, {
  type: "chars",
  charsClass: "inner-char"
});

// On click/tap, animate characters up
document.getElementById("pre").addEventListener("click", () => {
  gsap.to(".inner-char", {
    duration: 1,
    y: 0,
    stagger: 0.03,
    ease: "power2.out"
  });
});

// On page load from history, skip animation
gsap.to(".inner-char", { duration: 0, y: 0 });
```

**Transition Provider (from `5673.js`):**

```javascript
const { startTransition, endTransition, isTransitioning } = useTransition();
const startTransition = async () => {
  setIsTransitioning(true);
  await new Promise(resolve => setTimeout(resolve, 800)); // Wait for circle wipe
};
const endTransition = async () => {
  await new Promise(resolve => setTimeout(resolve, 800));
  setIsTransitioning(false);
};
```

---

### 2.2 Alche Studio

**Stack:** Astro 5 + Swup 4 + Three.js + Lenis + Lottie + Tweakpane

**Architecture:**
- **Persistent Three.js canvas** (`#gl-canvas`) behind all page content
- **Swup 4** for SPA page transitions (no full reloads)
- **Lenis** for smooth scroll (`lenis.lenis-smooth` class on `<html>`)
- **Lottie animations** for loading overlay and outro
- **Section-based architecture** with:
  - `data-top_section="kv|works_intro|works|mission|vision|service|stellla"`
  - `data-snap-ratio="1|1.5|1.8"` for scroll-snap behavior
  - Body attribute `data-current_section` tracks active section
- **Scroll indicator** (`.TopScrollIndicator`) with section labels and subsection dots
- **Mission/Vision** sections with CSS mask-based text reveal
- **Works** section with fixed-position content + scroll-driven thumbnail swap
- **Service** section with scroll-linked items
- **Stellla** section with frame animation driven by CSS `--progress` custom property
- **SlotButton** hover text slide-up pattern
- **Scramble text** effect on nav links (`data-scramble` attribute)
- **Sound toggle** with animated bars
- **Tweakpane debug UI** for Three.js parameters (material, rotation, quaternion, screen)
- **Page outro** with canvas animation + Lottie

**Key CSS Patterns (from `index.DCV4tj_L.css`):**

```css
/* Lenis integration */
.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
.lenis.lenis-stopped { overflow: hidden; }
.lenis.lenis-smooth iframe { pointer-events: none; }

/* Section scroll architecture */
.SectionContainer__container {
  position: relative;
  width: 100%;
  min-height: 100lvh; /* Uses large-viewport units */
}

/* Body tracks current section for state-based CSS */
body[data-current_section=kv] .KV__container { pointer-events: auto; }
body[data-current_section=works] .Works__container { opacity: 1; pointer-events: auto; }
body[data-current_section=mission] .MissionVision__container[data-mission-container] { pointer-events: auto; }

/* KV section scroll-to-explore text */
.KV__scrollText {
  position: fixed;
  left: 50%; bottom: 40px;
  transform: translate(-50%);
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
}
body[data-current_section=kv] .KV__scrollText { opacity: 1; }

/* Mission section CSS mask-based reveal */
.MissionVision__container[data-mission-container] {
  mask: linear-gradient(
    to top,
    black var(--mask-height, 0%),
    transparent calc(var(--mask-height, 0%) + var(--mask-fade, 5%))
  );
  -webkit-mask: linear-gradient(
    to top,
    black var(--mask-height, 0%),
    transparent calc(var(--mask-height, 0%) + var(--mask-fade, 5%))
  );
}

/* Text highlight reveal (background-size animation) */
.MissionVision__marker {
  background: linear-gradient(transparent 0%, #000 0.1%);
  display: inline;
  background-repeat: no-repeat;
  background-size: 0% 100%;
}

/* Works section — fixed content + scroll thumbnails */
.Works__content { position: absolute; z-index: 1; }
.Works__content_inner {
  position: fixed;
  top: 0; width: 100%; height: 100dvh;
  display: flex; flex-direction: column;
  justify-content: center;
}
.Works__item { position: absolute; width: 70%; left: 8%; bottom: 10vh; }
.Works__scroll_item { position: relative; width: 100%; height: 100lvh; }

/* Service section scroll items */
.Service__scroll_item { position: relative; width: 100%; height: 170lvh; }

/* Stellla frame animation via CSS custom property */
.Stellla__frame {
  --progress: 0;
  --padding: calc(-100px + var(--progress) * (200px));
  width: calc(100% - var(--padding));
  height: calc(100% - var(--padding));
}

/* Scroll indicator */
.TopScrollIndicator__top_scroll_indicator {
  position: fixed; left: 0; top: 50%;
  transform: translateY(-50%); z-index: 100;
  mix-blend-mode: difference;
}
.TopScrollIndicator__section_line { width: 16px; height: 1px; transition: all 0.3s ease; }
.TopScrollIndicator__section_item[data-active=true] .TopScrollIndicator__section_line { width: 20px; }

/* SlotButton hover text slide-up */
.SlotButton__text_wrapper { transition: transform 0.3s cubic-bezier(.25,.46,.45,.94); }
.SlotButton__button:hover .SlotButton__text_wrapper { transform: translateY(-100%); }
.SlotButton__text_hover { position: absolute; top: 100%; left: 0; opacity: 0; transition: opacity 0.3s cubic-bezier(.25,.46,.45,.94); }
.SlotButton__button:hover .SlotButton__text_hover { opacity: 1; }
```

**Swup Page Transition Implementation (from `page.SNkKDTDH.js`):**

```javascript
// Swup 4 initialization with plugins
const swup = new Swup({
  animationSelector: '[class*="transition-"]',
  containers: ["main"],
  cache: true,
  native: false,
  plugins: [
    new SwupA11yPlugin({}),
    new SwupPreloadPlugin({ preloadHoveredLinks: true, preloadVisibleLinks: false }),
    new SwupBodyClassPlugin({}),
    new SwupHeadPlugin({ awaitAssets: true }),
    new SwupScriptsPlugin({})
  ]
});

// Hook into Astro events
swup.hooks.before("content:replace", () => document.dispatchEvent(new Event("astro:before-swap")));
swup.hooks.on("content:replace", () => document.dispatchEvent(new Event("astro:after-swap")));
swup.hooks.on("page:view", () => document.dispatchEvent(new Event("astro:page-load")));
```

**Swup Core Architecture (from `Swup.Cr7ogLqN.js`):**

```javascript
// Visit lifecycle states:
// 1 = created, 3 = started, 4 = out animation, 5 = page loaded,
// 6 = rendered, 7 = completed, 8 = aborted, 9 = errored

class Swup {
  constructor(options) {
    this.version = "4.8.2";
    this.hooks = new HookSystem();
    this.cache = new Cache(this);
    this.classes = new ClassManager(this);
    this.visit = this.createVisit({ to: "" });
    this.location = URL.fromUrl(window.location.href);
  }

  // Fetch and cache pages
  async fetchPage(url, options) {
    const response = await fetch(url, {
      headers: { "X-Requested-With": "swup", Accept: "text/html, application/xhtml+xml" }
    });
    const html = await response.text();
    this.cache.set(url, { url, html });
    return { url, html };
  }

  // Replace content with animation
  async renderPage(visit, page) {
    visit.advance(6);
    await this.hooks.call("content:replace", visit, { page }, () => {
      this.replaceContent(visit);
    });
    await this.hooks.call("page:view", visit, { url: this.location.url });
  }

  // CSS animation awaiting
  async awaitAnimations({ selector }) {
    const elements = document.querySelectorAll(selector);
    const promises = Array.from(elements).map(el => {
      const { type, timeout } = getAnimationInfo(el);
      if (!type || !timeout) return;
      return new Promise(resolve => {
        const handler = (e) => { if (e.target === el) resolve(); };
        el.addEventListener(`${type}end`, handler);
        setTimeout(resolve, timeout + 1);
      });
    });
    await Promise.all(promises.filter(Boolean));
  }
}
```

**Section Tracking Pattern (from HTML analysis):**

```html
<!-- Section label (hidden, used for JS tracking) -->
<div class="SectionContainer__label">kv</div>

<!-- Section with snap ratio -->
<div class="SectionContainer__container" data-top_section="mission" data-snap-ratio="1">

<!-- Body attribute set by JS IntersectionObserver or ScrollTrigger -->
<body data-current_section="works">

<!-- Subsection items in scroll indicator -->
<div class="TopScrollIndicator__subsection_item" data-subsection="0">
  <div class="TopScrollIndicator__subsection_line"></div>
</div>
```

**SlotButton Pattern:**

```html
<a href="/contact" class="SlotButton__button">
  <span class="SlotButton__text_wrapper">
    <span class="SlotButton__text">Contact / Recruit</span>
    <span class="SlotButton__text_hover">Contact / Recruit</span>
  </span>
</a>
```

```css
.SlotButton__button {
  overflow: hidden;
  transition: background-color 0.3s cubic-bezier(.25,.46,.45,.94);
}
.SlotButton__text_wrapper {
  display: block;
  transition: transform 0.3s cubic-bezier(.25,.46,.45,.94);
}
.SlotButton__button:hover .SlotButton__text_wrapper {
  transform: translateY(-100%);
}
.SlotButton__text_hover {
  position: absolute;
  top: 100%; left: 0; width: 100%;
  opacity: 0;
  transition: opacity 0.3s cubic-bezier(.25,.46,.45,.94);
}
.SlotButton__button:hover .SlotButton__text_hover { opacity: 1; }
```

**Scramble Text Pattern:**

```html
<a href="/" data-scramble>Top</a>
```

**Sound Toggle with Animated Bars:**

```html
<button class="SoundToggle__button" data-sound-toggle data-muted="true">
  <div class="SoundToggle__sound_bars">
    <div class="SoundToggle__bar bar"></div>
    <div class="SoundToggle__bar bar"></div>
    <div class="SoundToggle__bar bar"></div>
  </div>
</button>
```

**Works Scroll Thumbnail Pattern:**

```html
<div class="Works__scroll" data-works-scroll>
  <div class="Works__scroll_item"
       data-top_works_item="https://cdn.example.com/thumb1.jpg"
       data-works_id="project-1">
    <div class="Works__scroll_item_thumb"></div>
  </div>
</div>
```

**Loading Overlay Structure:**

```html
<div id="loading-overlay" class="Loading__container">
  <div class="Loading__lottieContainer">
    <div id="loading-lottie" class="Loading__lottie"></div>
    <div id="loading-logo" class="Loading__logo"></div>
  </div>
  <div id="loading-text" class="Loading__text">
    Architect worlds<br>that move hearts and spark hope.
  </div>
</div>
```

---

### 2.3 Studio Dialect

**Note:** The domain `studio-dialect.com` returned a transport error during analysis. Based on available references, Studio Dialect is known for:

- Full-screen typographic hero with kinetic type
- Scroll-driven color transitions (light → dark sections)
- Minimalist cursor interaction with magnetic effect
- Smooth scroll with momentum-based easing
- Image curtain reveals between sections
- Split-screen layouts that merge on scroll

*Recommendation: Monitor the site for when it becomes available, or reference the cursor-based portfolio sites from the [References]($references) section.*

---

### 2.4 Vectr

**Stack:** Next.js (App Router) with image optimization

**Architecture:**
- Traditional SaaS landing page, not a high-interactive portfolio
- Uses Next.js `<Image>` optimization and preloading
- Horizontal scrollable AI tools carousel (`.horizontal-scroller`)
- Sticky nav with transparent-to-solid background transition
- Card-based feature sections with alternating layout

**Key Pattern (Horizontal Scroller):**

```html
<div class="horizontal-scroller">
  <div class="horizontal-scroller__content ai-tools-content" style="gap:26px">
    <div class="ai-tools-card">...</div>
    <div class="ai-tools-card">...</div>
  </div>
</div>
```

**Verdict:** Vectr is a product landing page, not an interactive portfolio. Its value for this study is limited but confirms that even SaaS sites now use horizontal scrolling for feature showcases.

---

## 3. Scroll Architecture

### 3.1 The Two-Layer Model

All high-end sites use a **dual scroll architecture**:

```
Layer 1: Smooth Scroll Engine (Lenis)
  └─ Provides momentum, easing, and frame-perfect scroll values
Layer 2: Animation Engine (GSAP ScrollTrigger)
  └─ Binds animations to scroll progress with scrub
```

### 3.2 Alche's Approach: Lenis + Section Tracking

Alche uses Lenis for smooth momentum and tracks sections via a JavaScript observer that sets `data-current_section` on `<body>`.

```css
.lenis.lenis-smooth { scroll-behavior: auto !important; }
```

**Section snap ratios** control how long each section takes to scroll through:
- `data-snap-ratio="1"` — normal
- `data-snap-ratio="1.5"` — 50% longer
- `data-snap-ratio="1.8"` — 80% longer

**Section indicator** sits fixed on the left side with mix-blend-mode: difference for visibility over any background.

### 3.3 ArtPill's Approach: GSAP + SplitText

ArtPill uses GSAP directly without a smooth-scroll library, instead relying on:

```javascript
// Character reveal on user interaction
gsap.to(".inner-char", {
  duration: 1,
  y: 0,
  stagger: 0.03,
  ease: "power2.out"
});
```

### 3.4 Implementation Template

```javascript
// 1. Lenis smooth scroll
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: 'vertical',
  smoothWheel: true
});
lenis.on('scroll', (e) => { /* emit scroll events */ });
function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

// 2. GSAP ScrollTrigger with Lenis adapter
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => { lenis.raf(time * 1000); });
gsap.ticker.lagSmoothing(0);
```

---

## 4. Text & Typography Animation

### 4.1 Character Reveal (ArtPill's GSAP SplitText)

**Technique:** Each character is wrapped in two `<span>` layers — `.outer-char` (position offset) and `.inner-char` (translateY hidden). On trigger, all characters animate to `y: 0` with stagger.

```css
.outer-char {
  position: relative;
  padding-bottom: 0.5vw;
  top: 2vw;
}
.inner-char {
  transform: translateY(17vh);
}
```

```javascript
const outerSplit = new SplitText(element, {
  type: "chars",
  charsClass: "outer-char"
});
const innerSplit = new SplitText(outerSplit.chars, {
  type: "chars",
  charsClass: "inner-char"
});

// Trigger animation
gsap.to(".inner-char", {
  duration: 1,
  y: 0,
  stagger: 0.03,
  ease: "power2.out"
});
```

### 4.2 Text Highlight Reveal (Alche's CSS Mask)

**Technique:** Text is revealed as the user scrolls by animating `background-size` on an inline gradient overlay.

```css
.MissionVision__marker {
  background: linear-gradient(transparent 0%, #000 0.1%);
  display: inline;
  background-repeat: no-repeat;
  background-size: 0% 100%;
  /* JS updates background-size from 0% to 100% based on scroll */
}
```

```javascript
// Scroll-driven highlight
scrollTrigger.on("progress", (progress) => {
  marker.style.backgroundSize = `${progress * 100}% 100%`;
});
```

### 4.3 SlotButton Text Slide-Up (Alche's Hover Effect)

**Technique:** Two identical text labels stacked vertically. On hover, the wrapper translates up by 100%, revealing the hover state.

```html
<button class="SlotButton__button">
  <span class="SlotButton__text_wrapper">
    <span class="SlotButton__text">Contact</span>
    <span class="SlotButton__text_hover">Contact</span>
  </span>
</button>
```

```css
.SlotButton__button { overflow: hidden; }
.SlotButton__text_wrapper {
  transition: transform 0.3s cubic-bezier(.25,.46,.45,.94);
}
.SlotButton__button:hover .SlotButton__text_wrapper {
  transform: translateY(-100%);
}
```

### 4.4 Scramble Text Effect (Alche)

**Technique:** Links marked with `data-scramble` get a JS-driven character randomization effect on hover. The text rapidly cycles through random characters before landing on the final text.

```html
<a href="/" data-scramble>Top</a>
```

### 4.5 Key Typography CSS

```css
/* Alche's typography scale */
body { font-size: 0.9vw; } /* 1vw = responsive base */
h1, h2 { font-size: 18vh; width: 155vh; max-width: 100vw; }

/* ArtPill's font loading */
@font-face {
  font-family: NeueMontreal;
  src: url(/fonts/HelveticaNeueCyr-Light.woff);
}
```

---

## 5. 3D & WebGL Spatial Experience

### 5.1 Persistent Canvas Architecture

Both ArtPill and Alche use a **fixed-position WebGL canvas** that persists behind all DOM content:

```html
<!-- Alche -->
<div class="Layout__gl">
  <div class="Layout__gl_inner">
    <div id="gl-canvas" class="GLCanvas__container"></div>
  </div>
</div>

<!-- ArtPill -->
<div id="webgl"></div>
```

```css
/* Alche */
.Layout__gl {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  z-index: 0;
  pointer-events: none;
}

/* ArtPill */
#webgl {
  position: fixed;
  width: 100vw; height: 100vh;
  z-index: 9;
  pointer-events: all;
  background: transparent;
}
```

### 5.2 Alche's Three.js Debug Panel (Tweakpane)

Alche exposes Three.js parameters via Tweakpane for real-time debugging:

```html
<div class="TweakpaneContainers__container">
  <div id="tweakpane-mainlogo-material" data-tp="mainlogo-material"></div>
  <div id="tweakpane-mainlogo-quaternion" data-tp="mainlogo-quaternion"></div>
  <div id="tweakpane-mainlogo-screen" data-tp="mainlogo-screen"></div>
</div>
```

This suggests:
- A main logo 3D object with exposed material properties
- Quaternion rotation controls
- Screen-space positioning
- Tweakpane is used as an internal debug tool (removed in production)

### 5.3 Section-Driven Context Switching

Instead of having separate 3D scenes, these sites use the **same canvas with camera position changes** based on the current section:

```
Section "kv"     → Camera looks at hero object
Section "works"  → Camera pans to works cluster
Section "vision" → Camera pulls back
```

### 5.4 Performance: WebGL Behind Text

```css
/* Ensure text stays above WebGL */
.Layout__inner {
  position: relative;
  z-index: 1;
}
```

### 5.5 Implementation Pattern

```javascript
// Persistent Three.js canvas
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('gl-canvas').appendChild(renderer.domElement);

// Scene content
const geometry = new THREE.IcosahedronGeometry(1, 1);
const material = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.1,
  roughness: 0.2,
  wireframe: false
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  mesh.rotation.x += 0.005;
  mesh.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();

// Section-based camera transitions
function transitionToSection(sectionId) {
  const targets = {
    'kv':       { x: 0, y: 0, z: 5 },
    'works':    { x: 2, y: -1, z: 8 },
    'mission':  { x: -3, y: 2, z: 10 },
    'vision':   { x: 0, y: 0, z: 12 },
  };
  const target = targets[sectionId] || targets['kv'];
  gsap.to(camera.position, {
    x: target.x, y: target.y, z: target.z,
    duration: 1.5, ease: 'power3.inOut'
  });
}
```

---

## 6. Cursor & Pointer Interaction

### 6.1 Custom Cursor (ArtPill)

ArtPill uses a **circular scanner cursor** that follows the mouse:

```html
<div id="circle">
  <img id="scansmiley" src="/smiley.svg" />
  <img id="scanback" src="/smiley_back.svg" />
</div>
```

```css
#circle {
  position: fixed;
  width: 14.8vh; height: 14.8vh;
  top: calc(50vh - 7.4vh);
  left: calc(50vw - 7.4vh);
  opacity: 0.5;
}
```

### 6.2 Magnetic Hover Effect

Pattern derived from common implementation:

```javascript
class MagneticButton {
  constructor(el) {
    this.el = el;
    this.bound = el.getBoundingClientRect();
    el.addEventListener('mousemove', (e) => this.magnetize(e));
    el.addEventListener('mouseleave', () => this.reset());
  }

  magnetize(e) {
    const rect = this.el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = (e.clientX - centerX) * 0.3;
    const deltaY = (e.clientY - centerY) * 0.3;

    gsap.to(this.el, {
      x: deltaX,
      y: deltaY,
      duration: 0.4,
      ease: 'power2.out'
    });
  }

  reset() {
    gsap.to(this.el, {
      x: 0, y: 0,
      duration: 0.6,
      ease: 'elastic.out(1, 0.3)'
    });
  }
}
```

### 6.3 Scanline/Cursor Overlay (ArtPill's Scanner)

```html
<!-- Full-screen scanlight overlay that follows cursor -->
<div id="scanlight">
  <img src="/scanlight.jpg" />
  <img src="/scanlight.jpg" />
</div>
```

```css
#scanlight {
  position: fixed;
  height: 100vh; width: 100vw;
  display: flex; justify-content: center; align-items: center;
  z-index: 99;
  mix-blend-mode: lighten;
  opacity: 0;
  pointer-events: none;
}
```

---

## 7. Composition & View Switching

### 7.1 Swup-Based SPA (Alche)

Alche uses **Swup 4** for full SPA page transitions without framework lock-in.

**How it works:**
1. Intercepts all `<a>` clicks
2. Fetches the new page HTML with `fetch()`
3. Waits for CSS animations on `[class*="transition-"]` elements
4. Replaces container content (`main`)
5. Updates browser URL with `history.pushState`
6. Fires `page:view` event for re-initialization

```javascript
// Core fetch and replace flow
async function performNavigation(visit) {
  // 1. Fetch new page
  const { html } = await fetchPage(visit.to.url);

  // 2. Animate current page out
  await animatePageOut(visit);

  // 3. Replace content
  replaceContent(visit); // swaps container.innerHTML

  // 4. Scroll to top/anchor
  scrollToContent(visit);

  // 5. Animate new page in
  await animatePageIn(visit);

  // 6. Fire completion hooks
  await hooks.call('page:view', visit);
}
```

### 7.2 Next.js Transitions (ArtPill)

ArtPill wraps navigation in a custom `TransitionProvider`:

```javascript
const { startTransition, endTransition } = useTransition();

async function handleNavClick(e, href) {
  e.preventDefault();
  const currentLocale = pathname.split('/')[1];
  const url = ['en','fr'].includes(currentLocale)
    ? `/${currentLocale}${href}`
    : href;

  if (pathname !== url) {
    await startTransition();  // 800ms circle wipe in
    await router.push(url);   // Next.js navigation
    await endTransition();    // 800ms circle wipe out
  }
}
```

### 7.3 Section-Based Composition (Alche's Approach)

Instead of page navigations, sections are stacked vertically and tracked via body attribute:

```javascript
// IntersectionObserver-based section tracking
const sections = document.querySelectorAll('[data-top_section]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      document.body.dataset.currentSection = entry.target.dataset.topSection;
    }
  });
}, { threshold: 0.5 });

sections.forEach(s => observer.observe(s));
```

CSS then gates visibility based on the current section:

```css
.Works__container { opacity: 0; pointer-events: none; }
body[data-current_section=works] .Works__container { opacity: 1; pointer-events: auto; }
```

---

## 8. Information Overlays & Media

### 8.1 Works Thumbnail Scroll (Alche)

**Pattern:** A fixed content area on the left with project metadata, while thumbnails scroll in the background.

```html
<div class="Works__content">
  <div class="Works__content_inner">        <!-- fixed position -->
    <div class="Works__list">
      <div class="Works__item">             <!-- absolutely positioned -->
        <time>2026.01.17</time>
        <h3>Project Title</h3>
        <ul class="Works__item_categoryList">
          <li>In-Game-Concert</li>
        </ul>
      </div>
    </div>
  </div>
</div>
<div class="Works__scroll">
  <div class="Works__scroll_item">           <!-- full viewport height -->
    <div class="Works__scroll_item_thumb"></div>
  </div>
</div>
```

**How it works:**
- `.Works__content_inner` is `position: fixed` — stays in view
- `.Works__scroll_item` is `height: 100lvh` — each takes a full viewport
- Scrolling through thumbnails triggers metadata changes via IntersectionObserver
- The result: feels like browsing a filmstrip while metadata overlays

### 8.2 News Overlay

```html
<div class="News__newsArea">
  <div class="News__newsTitle">News</div>
  <div class="News__newsList">
    <div class="News__newsItem">
      <div class="News__newsDate">2025.06.26</div>
      <div class="News__newsContent">
        <a href="/news" class="News__newsLink">Title</a>
      </div>
    </div>
  </div>
</div>
```

```css
.News__newsArea {
  position: fixed; bottom: 20px; right: 27px;
  max-width: 400px; z-index: 100;
  opacity: 0; pointer-events: none;
}
body[data-current_section=kv] .News__newsArea {
  opacity: 1; pointer-events: auto;
}
```

### 8.3 Image Loading & Progressive Enhancement

```css
/* Lazy loading with blur-up */
img { max-width: 100%; vertical-align: top; }

/* Video placeholder */
[data-hvp-overlay-transition-duration] {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 18px;
  overflow: hidden;
}
```

---

## 9. Loading Sequences

### 9.1 ArtPill's Scanner Loading Sequence

**Flow:**
1. User sees `#pre` (click to start overlay)
2. On click: scanlight activates + text animates through items (popups, dinners, store activations...)
3. Loading bar fills (60 divs stagger-opacity)
4. Circle scanner pulses with percentage counter
5. Character reveal triggers: all `.inner-char` animate to `y: 0`
6. `#pre` is hidden with `.off` class

**Key HTML:**

```html
<div id="pre">
  <div id="clickstart">click to start</div>
</div>

<div id="scannercontent">
  <div id="scanlight">
    <img src="/scanlight.jpg" />
    <img src="/scanlight.jpg" />
  </div>
  <div id="scannercontentin">
    <div id="scannerperc"><span>0</span>%</div>
    <div id="scannertext">
      experiences<br/>
      <div>popups<br/>diners<br/>store activations<br/>...</div>
    </div>
  </div>
</div>

<div id="loadingbar">
  <!-- 60 divs with staggered opacity fill -->
  <div></div><div></div>...x60
</div>
```

### 9.2 Alche's Lottie Loading Sequence

```html
<div id="loading-overlay" class="Loading__container">
  <div class="Loading__lottieContainer">
    <div id="loading-lottie" class="Loading__lottie"></div>
    <div id="loading-logo" class="Loading__logo"></div>
  </div>
  <div id="loading-text" class="Loading__text">
    Architect worlds<br>that move hearts and spark hope.
  </div>
</div>
```

**Page outro** (at bottom of page) has its own canvas for transition effects:

```html
<div class="TopPageOutro__wrapper">
  <div class="TopPageOutro__screen">
    <canvas id="outro-canvas"></canvas>
    <div class="TopPageOutro__screen_inner">
      <div data-outro-lottie class="TopPageOutro__lottie"></div>
      <div class="TopPageOutro__logo">
        <svg>...</svg>
      </div>
    </div>
  </div>
</div>
```

---

## 10. Performance Patterns

### 10.1 What These Sites Do

| Pattern | Implementation |
|---------|---------------|
| **Font preloading** | `<link rel="preload" as="font">` with `crossorigin` |
| **Image optimization** | Next.js `<Image>` with `srcSet` + webp |
| **Asset staggering** | Lazy load non-critical below-fold content |
| **Pixel ratio capping** | `Math.min(window.devicePixelRatio, 2)` |
| **CSS containment** | `contain: layout style paint` on heavy sections |
| **will-change sparing** | Only on animating elements, removed after |

### 10.2 Alche's Approach

```css
/* Will-change for animated elements */
.MissionVision__text { will-change: transform; }
.MissionVision__ttl { transform: translateZ(0); } /* GPU layer promotion */
```

```html
<!-- Preconnect to CDN/origins -->
<link rel="preload" as="image" href="/thumbnail.jpg" />
```

### 10.3 Font Loading Strategy

```html
<!-- Vectr/ArtPill: Preload critical font -->
<link rel="preload"
      href="/_next/static/media/1e41be92c43b3255-s.p.woff2"
      as="font" crossorigin="" type="font/woff2" />
```

```css
/* ArtPill: FOUT with custom font-face */
@font-face {
  font-family: NeueMontreal;
  src: url(/fonts/HelveticaNeueCyr-Light.woff);
}
```

---

## 11. Implementation Blueprint

### Phase 1: Scroll Foundation

```javascript
// Install: npm install @studio-freight/lenis gsap

import Lenis from '@studio-freight/lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Lenis setup
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => 1 - Math.pow(1 - t, 3),
  orientation: 'vertical',
  smoothWheel: true,
  wheelMultiplier: 1,
  touchMultiplier: 2,
});

// Connect Lenis to GSAP ScrollTrigger
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// Section tracking
const sections = document.querySelectorAll('[data-section]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      document.body.dataset.currentSection = entry.target.dataset.section;
    }
  });
}, { threshold: 0.5 });
sections.forEach(s => observer.observe(s));
```

### Phase 2: 3D Canvas

```html
<!-- In your HTML -->
<div id="gl-canvas" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;"></div>
<main id="swup" style="position:relative;z-index:1;">
  <!-- Your content -->
</main>
```

```javascript
// Three.js persistent background
import * as THREE from 'three';

const container = document.getElementById('gl-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Camera positions per section
const cameraTargets = {
  'hero':    { x: 0, y: 0, z: 8 },
  'works':   { x: 3, y: -1, z: 10 },
  'about':   { x: -2, y: 1, z: 12 },
};

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// GSAP camera transitions
function transitionCamera(section) {
  const target = cameraTargets[section] || cameraTargets.hero;
  gsap.to(camera.position, {
    x: target.x,
    y: target.y,
    z: target.z,
    duration: 1.5,
    ease: 'power3.inOut',
    onUpdate: () => camera.lookAt(0, 0, 0)
  });
}

// Hook into section tracking
const bodyObserver = new MutationObserver(() => {
  transitionCamera(document.body.dataset.currentSection);
});
bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-current-section'] });
```

### Phase 3: Text Reveals

```javascript
// CSS-based text highlight reveal
gsap.utils.toArray('.reveal-text').forEach(el => {
  ScrollTrigger.create({
    trigger: el,
    start: 'top 80%',
    onUpdate: (self) => {
      el.style.backgroundSize = `${self.progress * 100}% 100%`;
    }
  });
});

// Character reveal with GSAP (without SplitText plugin)
function animateChars(el) {
  const text = el.textContent;
  el.innerHTML = '';
  text.split('').forEach((char, i) => {
    const span = document.createElement('span');
    span.textContent = char === ' ' ? '\u00A0' : char;
    span.style.display = 'inline-block';
    span.style.transform = 'translateY(100%)';
    span.style.opacity = '0';
    span.style.transition = `transform 0.6s ${i * 0.03}s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ${i * 0.03}s ease`;
    el.appendChild(span);
  });

  ScrollTrigger.create({
    trigger: el,
    start: 'top 85%',
    onEnter: () => {
      el.querySelectorAll('span').forEach(s => {
        s.style.transform = 'translateY(0)';
        s.style.opacity = '1';
      });
    }
  });
}
```

### Phase 4: SPA Transitions

```html
<!-- Custom transition overlay -->
<div id="page-transition" style="
  position:fixed;top:0;left:0;width:100vw;height:100vh;
  z-index:9999;pointer-events:none;
  background:var(--accent, #def846);
  clip-path: circle(0% at 50% 50%);
  transition: clip-path 0.8s cubic-bezier(0.77, 0, 0.18, 1);
"></div>
```

```javascript
// Simple SPA router with circle transition
const transition = document.getElementById('page-transition');

async function navigate(href) {
  // Show transition
  transition.style.pointerEvents = 'all';
  transition.style.clipPath = 'circle(150% at 50% 50%)';
  await new Promise(r => setTimeout(r, 800));

  // Fetch new page
  const res = await fetch(href);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.querySelector('main').innerHTML = doc.querySelector('main').innerHTML;
  history.pushState({}, '', href);

  // Hide transition
  transition.style.clipPath = 'circle(0% at 50% 50%)';
  await new Promise(r => setTimeout(r, 800));
  transition.style.pointerEvents = 'none';

  // Re-initialize animations
  initScrollTriggers();
}
```

### Phase 5: Cursor & Magnetic Effects

```javascript
// Custom cursor
const cursor = document.createElement('div');
cursor.id = 'custom-cursor';
cursor.style.cssText = `
  position: fixed; width: 20px; height: 20px;
  border-radius: 50%; pointer-events: none;
  z-index: 99999; mix-blend-mode: difference;
  background: white; transition: width 0.3s, height 0.3s;
  transform: translate(-50%, -50%);
`;
document.body.appendChild(cursor);

let mouseX = 0, mouseY = 0;
let cursorX = 0, cursorY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// RAF lerp loop
function updateCursor() {
  cursorX += (mouseX - cursorX) * 0.1;
  cursorY += (mouseY - cursorY) * 0.1;
  cursor.style.left = cursorX + 'px';
  cursor.style.top = cursorY + 'px';
  requestAnimationFrame(updateCursor);
}
updateCursor();

// Magnetic buttons
document.querySelectorAll('[data-magnetic]').forEach(el => {
  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) * 0.3;
    const y = (e.clientY - (rect.top + rect.height / 2)) * 0.3;
    gsap.to(el, { x, y, duration: 0.3, ease: 'power2.out' });
  });
  el.addEventListener('mouseleave', () => {
    gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
  });
});
```

### Phase 6: The Stellla Frame Pattern (CSS Custom Property Animation)

```css
.frame {
  --progress: 0;
  --padding: calc(-20px + var(--progress) * 60px);
  width: calc(100% - var(--padding));
  height: calc(100% - var(--padding));
  transition: --progress 0.1s linear;
}

/* Corner crosses */
.cross-item {
  position: absolute;
  width: 25px; height: 25px;
}
.cross-item::before, .cross-item::after {
  content: '';
  position: absolute;
  width: 100%; height: 2px;
  background: white;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
}
.cross-item::after {
  transform: translate(-50%, -50%) rotate(90deg);
}
```

```javascript
// Update frame progress based on scroll
ScrollTrigger.create({
  trigger: '.frame-section',
  start: 'top bottom',
  end: 'bottom top',
  onUpdate: (self) => {
    document.querySelector('.frame').style.setProperty('--progress', self.progress);
  }
});
```

---

## 12. Code Snippet Library

### 12.1 CSS Custom Easing Curves

```css
/* Premium feel */
--ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.18, 1);
--ease-out-power3: cubic-bezier(0.22, 1, 0.36, 1);
--ease-slot-button: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 12.2 Scroll Indicator (Alche Pattern)

```css
.scroll-indicator {
  position: fixed;
  left: 0; top: 50%;
  transform: translateY(-50%);
  z-index: 100;
  mix-blend-mode: difference;
}
.scroll-indicator__line {
  width: 16px; height: 1px;
  background: white;
  transition: all 0.3s ease;
}
.scroll-indicator__line.active {
  width: 28px;
}
```

### 12.3 Mission Text Mask Reveal

```css
.text-reveal-mask {
  background: linear-gradient(transparent 0%, currentColor 0.1%);
  display: inline;
  background-repeat: no-repeat;
  background-size: 0% 100%;
}
```

### 12.4 Slot Button (Text Swap on Hover)

```html
<button class="slot-btn">
  <span class="slot-btn__wrapper">
    <span class="slot-btn__text">Label</span>
    <span class="slot-btn__text-hover">Label</span>
  </span>
</button>
```

```css
.slot-btn { overflow: hidden; }
.slot-btn__wrapper {
  display: block;
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.slot-btn:hover .slot-btn__wrapper { transform: translateY(-100%); }
.slot-btn__text-hover {
  position: absolute; top: 100%; left: 0; width: 100%;
  opacity: 0; transition: opacity 0.3s ease;
}
.slot-btn:hover .slot-btn__text-hover { opacity: 1; }
```

### 12.5 Section-Based CSS Gating

```css
.component { opacity: 0; pointer-events: none; transition: opacity 0.5s ease; }
body[data-section="works"] .component { opacity: 1; pointer-events: auto; }
```

### 12.6 Staggered Loading Bar

```css
.loading-bar div {
  margin: 0.1vw;
  height: 100%;
  background: var(--accent);
  opacity: 0;
  /* JS staggers opacity fill */
}
```

```javascript
// Stagger fill the loading bar
const bars = document.querySelectorAll('.loading-bar div');
bars.forEach((bar, i) => {
  setTimeout(() => {
    gsap.to(bar, { opacity: 1, duration: 0.1 });
  }, i * 20); // 20ms stagger per bar
});
```

### 12.7 Image on Scroll Change (Works Pattern)

```javascript
// Change background image as user scrolls through sections
const items = document.querySelectorAll('[data-thumb]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const imgUrl = entry.target.dataset.thumb;
      document.querySelector('.works-stage').style.backgroundImage = `url(${imgUrl})`;
    }
  });
}, { threshold: 0.5 });

items.forEach(item => observer.observe(item));
```

---

## 13. Appendix: Tooling & Resources

### Libraries Detected in the Wild

| Library | Used By | Purpose |
|---------|---------|---------|
| Swup 4 | Alche | SPA page transitions |
| Lenis | Alche | Smooth scroll |
| GSAP + ScrollTrigger | ArtPill, Alche | Animation engine |
| GSAP SplitText | ArtPill | Character-level text |
| Three.js | ArtPill, Alche | WebGL 3D rendering |
| Lottie | Alche | Vector animation |
| Tweakpane | Alche | Three.js debug UI |
| Swiper | Alche | Carousel (news/works) |
| next/image | Vectr, ArtPill | Image optimization |
| IntersectionObserver | Alche | Section tracking |
| next/font | Vectr, ArtPill | Font optimization |
| DOMParser | Swup | HTML parsing for transitions |

### Browser DevTools Workflow

1. **Elements panel**: Look for `data-*` attributes (section tracking, animation triggers)
2. **Animations tab**: Record interactions, inspect `cubic-bezier()` values
3. **Performance tab**: Record scroll, look for layout thrashing vs. composite-only
4. **Coverage tab**: Find unused CSS/JS
5. **Network tab**: Check font loading strategy (preload vs. FOIT vs. FOUT)
6. **Console**: Type `$0` on a selected element to inspect its animations

### Performance Budget Recommendations

| Asset | Target |
|-------|--------|
| First paint | < 1.5s |
| Smooth scroll FPS | 60fps |
| WebGL draw calls | < 200 |
| Total JS | < 300KB (gzipped) |
| Total CSS | < 50KB (gzipped) |
| Fonts | < 100KB total (woff2) |

### References

- [GSAP ScrollTrigger Docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [Lenis Smooth Scroll](https://github.com/studio-freight/lenis)
- [Swup Page Transitions](https://swup.js.org/)
- [Three.js](https://threejs.org/)
- [Alche Studio](https://alche.studio)
- [ArtPill Studio](https://artpill.studio)
- [Tweakpane](https://cocopon.github.io/tweakpane/)

---

> **End of Report.**
> Generated: 2026-06-17
> For: Pixel Explorer (Anirudh Venkatesan) — Portfolio Landing Page
> Stack: Vanilla JS + Three.js 0.164 + GSAP 3.12 + CDN import map
