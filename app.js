window.ARCHIVE_APP_DEBUG = window.ARCHIVE_APP_DEBUG || {};
window.ARCHIVE_APP_DEBUG.version = "story-pass-04";
window.ARCHIVE_APP_DEBUG.loadedAt = new Date().toISOString();

// Debug logging is opt-in: append ?debug=1 to the URL (or set
// ARCHIVE_APP_DEBUG.verbose = true). Production loads stay quiet.
// console.warn / console.error are intentionally NOT gated.
const DEBUG = /[?&]debug=1/.test(location.search) || !!window.ARCHIVE_APP_DEBUG.verbose;
const log = DEBUG ? console.log.bind(console) : () => {};

// Respect the OS "reduce motion" setting (accessibility / vestibular safety).
// Ambient, infinite JS animations check this; CSS transitions are handled by
// the prefers-reduced-motion media query in styles.css.
const PREFERS_REDUCED_MOTION =
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
window.ARCHIVE_APP_DEBUG.reducedMotion = PREFERS_REDUCED_MOTION;

log("Archive app module loaded", window.ARCHIVE_APP_DEBUG);

let data = {};
let entries = [];
let caseStudies = [];
let years = [];
let weeks = [];
const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
let weekCells = new Map();    // kept for any week-keyed legacy hooks
let monthCells = new Map();   // primary 2D cell map in Pass 04
let entriesByWeek = new Map();
let entriesByMonth = new Map();
let maxEmailCount = 1;
let terrain = null;
const state = window.ARCHIVE_APP_STATE || {
  activeTags: new Set(),
  search: "",
  activeTagInputs: new Set(), // tags added via search chips
  selectedEntryId: null,
  zoom: 100,
  // Pass 05: Year Window filter. Inclusive range. Out-of-window prisms fade
  // and dim via terrain.applyYearWindow().
  yearWindow: { start: 1991, end: 2026 },
  // Pass 10: when an entry was opened by drilling into a cluster building's
  // list, this holds that cluster so the modal back button returns to the
  // list instead of closing. modalView tracks which view is showing.
  clusterContext: null,   // { label, entryIds, buildingName } | null
  modalView: null,        // 'cluster' | 'entry' | null
};
window.ARCHIVE_APP_STATE = state;

// Pass 04: ?edit=1 turns on local editor mode. The brutalist side modal
// grows EDIT / SAVE / CANCEL controls and field-level inputs. Saves go to
// PUT /api/entries/:id and the page reloads ledger.json from the server.
state.editMode = new URLSearchParams(window.location.search).get("edit") === "1";
state.editingEntryId = null; // currently-being-edited entry id (drives modal render)
if (state.editMode) {
  document.documentElement.classList.add("edit-mode");
  log("Editor mode active — appending data-editor=on to modal renders");
}

const priorityKinds = ["Founder", "Designer", "Film", "AIESEC", "Web3", "Strategy", "Milestone"];

const LOADER_COPY = [
  {
    at: 0,
    title: "Film + design",
    subtitle: "ANIRUDH VENKATESAN",
    status: ({ entryCount }) => entryCount
      ? `Reading ${entryCount} documented moments`
      : "Reading the work archive",
  },
  {
    at: 20,
    title: "Brand systems",
    subtitle: "CREATIVE SYSTEMS",
    status: () => "Mapping 15+ roles",
  },
  {
    at: 40,
    title: "One operator",
    subtitle: "STUDIO RANGE",
    status: () => "Loading the work city",
  },
  {
    at: 60,
    title: "Real proof",
    subtitle: "WORK, NOT CLAIMS",
    status: ({ proofBacked }) => proofBacked
      ? `Connecting ${proofBacked} backed entries`
      : "Connecting proof to projects",
  },
  {
    at: 80,
    title: "Work city",
    subtitle: "1991 TO 2026",
    status: ({ yearStart, yearEnd }) => `Assembling ${yearStart} to ${yearEnd}`,
  },
  {
    at: 95,
    title: "Look around",
    subtitle: "ARCHIVE READY",
    status: () => "Ready",
  },
];

const loaderMetrics = {
  entryCount: 0,
  proofBacked: 0,
  yearStart: 1991,
  yearEnd: 2026,
};

function updateLoaderProgress(progress) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const phase = [...LOADER_COPY].reverse().find((item) => pct >= item.at) || LOADER_COPY[0];
  const loaderTitle = document.getElementById("loaderTitle");
  const loaderSubtitle = document.getElementById("loaderSubtitle");
  const loaderStatus = document.getElementById("loaderStatus");
  const loaderFill = document.getElementById("loaderFill");
  if (loaderTitle) loaderTitle.textContent = phase.title;
  if (loaderSubtitle) loaderSubtitle.textContent = phase.subtitle;
  if (loaderStatus) loaderStatus.textContent = phase.status(loaderMetrics);
  if (loaderFill) loaderFill.style.width = `${pct}%`;

  // Notify parent landing page if running in iframe
  try {
    if (window.parent && window.parent !== window && window.parent.onCityProgress) {
      window.parent.onCityProgress(pct);
    }
  } catch (err) {
    // ignore
  }
}

async function loadLedgerData() {
  updateLoaderProgress(4);
  const fallbackUrl = "./data/ledger-data-static.js";

  function loadFallback() {
    return new Promise((resolve) => {
      if (window.LEDGER_DATA && Array.isArray(window.LEDGER_DATA.entries) && window.LEDGER_DATA.entries.length) {
        return resolve(window.LEDGER_DATA);
      }
      const script = document.createElement("script");
      script.src = fallbackUrl;
      script.onload = () => resolve(window.LEDGER_DATA || {});
      script.onerror = () => resolve(window.LEDGER_DATA || {});
      document.head.appendChild(script);
    });
  }

  try {
    const data = await (window.LEDGER_DATA_PROMISE || Promise.resolve(window.LEDGER_DATA || {}));
    if (Array.isArray(data.entries) && data.entries.length) {
      return data;
    }
    console.warn("Ledger data promise resolved without entries, loading fallback data.");
    return await loadFallback();
  } catch (error) {
    console.error("Ledger data failed to load:", error);
    return await loadFallback();
  }
}

async function initApp() {
  data = await loadLedgerData();
  
  try {
    const csResponse = await fetch(`data/case-studies.json?_t=${Date.now()}`);
    if (csResponse.ok) {
      const csData = await csResponse.json();
      caseStudies = csData.caseStudies || [];
    }
  } catch (csErr) {
    console.warn("Failed to load case-studies.json", csErr);
  }

  entries = (data.entries || [])
    .map((entry) => ({
      ...entry,
      tags: toArray(entry.tags),
      roleTags: toArray(entry.roleTags),
    }))
    .sort((a, b) => dateNumber(a) - dateNumber(b));

  loaderMetrics.entryCount = entries.length;
  loaderMetrics.proofBacked = entries.filter((entry) => (entry.evidence || []).length > 0).length;
  loaderMetrics.yearStart = Number(data.yearStart) || entries[0]?.year || 1991;
  loaderMetrics.yearEnd = Number(data.yearEnd) || entries.at(-1)?.year || new Date().getFullYear();
  updateLoaderProgress(14);

  // Deduplicate data.tags by case-insensitive merge (e.g. "Leadership" + "leadership")
  // Keeps the casing of the higher-count variant, sums counts.
  if (data.tags) {
    const merged = new Map(); // lowercased key → { name, count }
    for (const t of data.tags) {
      const key = t.name.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.count += t.count;
        // Keep the casing with higher original count
        if (t.count > existing._origCount) {
          existing.name = t.name;
          existing._origCount = t.count;
        }
      } else {
        merged.set(key, { name: t.name, count: t.count, _origCount: t.count });
      }
    }
    data.tags = [...merged.values()]
      .map(({ name, count }) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  years = range(data.yearStart || 2009, data.yearEnd || new Date().getFullYear());
  weeks = range(1, 53);
  weekCells = new Map();
  monthCells = new Map();
  entriesByWeek = groupBy(entries, (entry) => entry.weekKey);
  entriesByMonth = groupBy(entries, (entry) => `${entry.year}-${String(entry.month || 1).padStart(2, "0")}`);
  maxEmailCount = Math.max(1, ...Object.values(data.weeklyEmailCounts || {}));

  log("Archive initialized:", {
    entryCount: entries.length,
    yearRange: [years[0], years[years.length - 1]],
    weekKeys: entriesByWeek.size,
    source: data.sourceWorkbook || "static fallback",
  });

  showModeSelect();
}

async function showModeSelect() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('story')) {
    window.__storyMode = true;
    const terrainOk = await initTerrain().then(() => true).catch(() => false);
    if (terrainOk) { startStory(); } else { init(); }
    return;
  }
  init();
}

async function startStory() {
  log("[story] startStory() called");
  if (!window.__storyRefs) {
    console.warn("[story] __storyRefs not set, falling back to archive");
    init();
    return;
  }
  // Wait for city GLB to finish loading
  if (!window.__storyRefs.cityReady) {
    log("[story] waiting for city GLB...");
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (window.__storyRefs?.cityReady) break;
    }
  }
  log("[story] cityReady:", !!window.__storyRefs.cityReady);

  // Expose entry lookup for story modules (T0)
  window.__storyRefs.getEntryById = (id) => entries.find(e => e.id === id);
  window.__storyRefs.entries = entries;

  try {
    const { StoryEngine } = await import("./story/story-engine.js?v=story-pass-04");
    const engine = new StoryEngine();
    document.body.classList.add("story-active");
    engine.init(window.__storyRefs, {
      onComplete: () => {
        window.__storyMode = false;
        document.body.classList.remove("story-active");
        document.body.classList.add("has-terrain");
        if (els.terrainEmpty) els.terrainEmpty.hidden = true;
        init();
      },
    });
    // Unlock audio — user already gestured by clicking "Play Film"
    if (engine.audio) engine.audio.unlock();
    log("[story] engine initialized");
  } catch (e) {
    console.error("[story] failed to start story mode:", e);
    window.__storyMode = false;
    init();
  }
}

const els = {
  statEntries: document.getElementById("statEntries"),
  statYears: document.getElementById("statYears"),
  statTags: document.getElementById("statTags"),
  tagFilters: document.getElementById("tagFilters"),
  weekHeader: document.getElementById("weekHeader"),
  yearGrid: document.getElementById("yearGrid"),
  mapScale: document.getElementById("mapScale"),
  mapScroll: document.getElementById("mapScroll"),
  terrainStage: document.getElementById("terrainStage"),
  terrainCanvas: document.getElementById("terrainCanvas"),
  terrainEmpty: document.getElementById("terrainEmpty"),
  detailPanel: document.getElementById("detailPanel"),
  searchInput: document.getElementById("searchInput"),
  zoomControl: document.getElementById("zoomControl"),
  zoomOutput: document.getElementById("zoomOutput"),
  yearWindowStart: document.getElementById("yearWindowStart"),
  yearWindowEnd:   document.getElementById("yearWindowEnd"),
  yearWindowOutput: document.getElementById("yearWindowOutput"),
  yearRange: document.getElementById("yearRange"),
  yearRangeFill: document.getElementById("yearRangeFill"),
  clearFilters: document.getElementById("clearFilters"),
  resetView: document.getElementById("resetView"),
  activeSummary: document.getElementById("activeSummary"),
  visibleSummary: document.getElementById("visibleSummary"),
  tooltip: document.getElementById("tooltip"),
  prevEntry: document.getElementById("prevEntry"),
  nextEntry: document.getElementById("nextEntry"),
  firstsList: document.getElementById("firstsList"),
  peopleList: document.getElementById("peopleList"),
  watermarkText: document.getElementById("watermarkText"),
  toggleView: document.getElementById("toggleView"),
  rolePills: document.getElementById("rolePills"),
  detailClose: document.getElementById("detailClose"),
  navLinks: document.querySelectorAll(".navlink"),
  projectPage: document.getElementById("projectPage"),
  projectPageInner: document.getElementById("projectPageInner"),
  projectBack: document.getElementById("projectBack"),
  projectPageClose: document.getElementById("projectPageClose"),
  navPage: document.getElementById("navPage"),
  navPageInner: document.getElementById("navPageInner"),
  navPageClose: document.getElementById("navPageClose"),
  galleryOverlay: document.getElementById("galleryOverlay"),
  galleryGridView: document.getElementById("galleryGridView"),
  galleryCodexView: document.getElementById("galleryCodexView"),
  galleryClose: document.getElementById("galleryClose"),
  galleryArtifact: document.getElementById("galleryArtifact"),
  artifactContainer: document.getElementById("artifactContainer"),
  artifactBack: document.getElementById("artifactBack"),
  artifactClose: document.getElementById("artifactClose"),
  // galleryCursor + galleryFloatingPreview removed — custom cursors banned per taste-skill
  searchChips: document.getElementById("searchChips"),
  activeFiltersBadge: document.getElementById("activeFiltersBadge"),
  themeToggle: document.getElementById("themeToggle"),
  navBrandSub: document.getElementById("navBrandSub"),
  navRoleCount: document.getElementById("navRoleCount"),
  navClientCount: document.getElementById("navClientCount"),
  navCaseStudiesCount: document.getElementById("navCaseStudiesCount"),
  yearWindowNav: document.getElementById("yearWindowNav"),
  yearWindowNavLabel: document.getElementById("yearWindowNavLabel"),
};

// SPATIAL_FILTERS: shown as right-side filter pills for 3D scene filtering.
// ROLE_PILLS: top-level theme categories on the Roles page.
// `match`     — legacy keyword matcher (still used by 3D spatial filter pills).
// `themeRoles` — canonical individual roles that bucket into this theme. Source of truth
//               for the Roles page bucketing; reads entry.roleGroups[] + entry.roles[].
const SPATIAL_FILTERS = [
  { key: "MovingImages",   label: "Moving Images",            icon: "▶", color: "#F23B21", modalBg: "#F23B21", ink: "#FFFFFF",
    match: ["Photographer", "Photography", "Film", "Cinematographer", "DOP", "Producer", "Animation", "MusicVideo", "Documentary", "BTS", "Filmmaker", "Editor", "Unit Still", "Wedding Photographer"],
    themeRoles: ["Cinematographer","Director","Editor","Photographer","Unit Still Photographer","Art Director","Producer","Animator","Filmmaker","DOP","Visual Designer"] },
  { key: "VisualSystems",  label: "Visual Systems",           icon: "◆", color: "#E1FA3C", modalBg: "#E1FA3C", ink: "#1A1714",
    match: ["Designer", "Design", "Graphic", "Art Director", "Visual", "Animator", "Branding", "Studio"],
    themeRoles: ["Designer","Visual Designer","Art Director","GenAI Expert"] },
  { key: "CompCulture",    label: "Computational Culture",    icon: "⬢", color: "#8A9AA0", modalBg: "#8A9AA0", ink: "#FFFFFF",
    match: ["Tech", "Web3", "Blockchain", "AI", "Engineer", "IT", "Pixel Explorer", "Maker", "Kind Health", "Computational"],
    themeRoles: ["Blockchain Expert","GenAI Expert","Tech contractor"] },
  { key: "DocResearch",    label: "Documentation & Research", icon: "❡", color: "#C8923B", modalBg: "#C8923B", ink: "#FFFFFF",
    match: ["Research", "Blogger", "Consultant", "Strategy", "Observer", "Documentation"],
    themeRoles: ["Researcher","Research Associate","Promotor"] },
  { key: "LeadershipEdu",  label: "Leadership & Education",   icon: "★", color: "#9AA878", modalBg: "#9AA878", ink: "#FFFFFF",
    match: ["Lecturer", "Faculty", "Teacher", "Education", "VP", "Team Lead", "Founder", "Co-founder", "Leadership", "Student", "Member", "Mentor"],
    themeRoles: ["Co-founder","Founder","Visiting Faculty","Student","Volunteer","VP Communications","Team Lead Design","Aspirant"] },
];

// Full ROLE_PILLS = themes + Life. AIESEC + Volunteer are NOT themes — they live as
// sub-folders under Leadership & Education (per spec).
const ROLE_PILLS = [
  ...SPATIAL_FILTERS,
  { key: "Life",           label: "Life",                     icon: "○", color: "#c8c0e0", modalBg: "#c8c0e0", ink: "#1A1714",
    match: ["Life", "Dog", "Personal"],
    themeRoles: ["Life"] },
];

function getKnownRoles() {
  const set = new Set(entries.map((e) => e.role).filter(Boolean));
  return [...set].sort();
}

// Word-boundary tag matching. Prevents "IT" from matching "visiting", etc.
// Match tokens like "Co-founder" or "Pixel Explorer" still match as whole phrases.
function tagMatchesTerm(tag, term) {
  const t = String(tag || "").toLowerCase();
  const m = String(term || "").toLowerCase();
  if (!t || !m) return false;
  // Escape regex special chars, then bound with \b on both sides
  const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(t);
}

function findBucketForTags(tags) {
  for (const bucket of ROLE_PILLS) {
    for (const tag of tags) {
      if (!tag) continue;
      for (const term of bucket.match) {
        if (tagMatchesTerm(tag, term)) return bucket;
      }
    }
  }
  return null;
}

// Active role filter (single-select; "all" means no filter)
state.activeRoleKey = state.activeRoleKey || "all";
// Track which nav page (roles/clients) the user came from when opening an editor.
// Used to return them to the nav page on cancel/close instead of the archive view.
state.editOriginNavView = null;

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

initApp().catch((error) => {
  console.error("Failed to initialize archive app:", error);
  const errorBanner = document.createElement("div");
  errorBanner.style.background = "#f8d7da";
  errorBanner.style.color = "#842029";
  errorBanner.style.padding = "1rem";
  errorBanner.style.margin = "1rem";
  errorBanner.style.borderRadius = "0.5rem";
  errorBanner.style.border = "1px solid #f5c2c7";
  errorBanner.textContent = "Archive initialization failed. Check the browser console for details.";
  document.body.prepend(errorBanner);
});

// ─── Theme toggle ────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem("archive-theme");
  const isLight = saved === "light" || (!saved && window.matchMedia("(prefers-color-scheme: light)").matches);
  if (isLight) {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  updateThemeToggleUI(isLight);
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  if (isLight) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("archive-theme", "dark");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("archive-theme", "light");
  }
  updateThemeToggleUI(!isLight);
  // isLight is the PRE-toggle state; after toggling, the new light-state is its
  // inverse. Passing isLight made the 3D scene background invert vs the page
  // (dark page -> light city). Pass !isLight so the scene matches the chrome.
  terrain?.setTheme?.(!isLight);
}

function updateThemeToggleUI(isLight) {
  if (!els.themeToggle) return;
  els.themeToggle.checked = isLight;
}

// ─── Search tag chips ────────────────────────────────────────
function renderSearchChips() {
  if (!els.searchChips) return;
  els.searchChips.replaceChildren();
  if (!state.activeTagInputs.size) return;
  for (const tag of state.activeTagInputs) {
    const chip = document.createElement("span");
    chip.className = "search-chip";
    chip.innerHTML = `${escapeHtml(tag)} <span class="chip-remove" data-chip-tag="${escapeHtml(tag)}">✕</span>`;
    chip.querySelector(".chip-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      state.activeTagInputs.delete(tag);
      state.activeTags.delete(tag);
      renderSearchChips();
      applyFilters();
    });
    els.searchChips.append(chip);
  }
}

let _uiReady = false;

function isMobile() {
  return window.innerWidth < 700 || matchMedia('(pointer: coarse)').matches;
}

function animateCount(el, targetVal, duration = 1200) {
  if (!el) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const currentVal = Math.floor(easeProgress * targetVal);
    el.textContent = currentVal.toLocaleString("en-IN");
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      el.textContent = targetVal.toLocaleString("en-IN");
    }
  };
  window.requestAnimationFrame(step);
}

// ─── USER ONBOARDING TUTORIAL WIZARD ────────────────────────────────
const Onboarding = {
  active: false,
  currentStep: 0,
  steps: [
    {
      title: "Welcome to the Archive",
      text: "This cinematic workspace mapping Anirudh's 15-year career contains 3D buildings representing key projects and work clusters. Let's take a quick 30-second tour of how to explore it!",
      target: null,
      position: "center"
    },
    {
      title: "3D Navigation Controls",
      text: "Use this D-pad panel to pan, zoom, and rotate the scene. You can also drag the city directly with your mouse/touch, or navigate using **WASD / Q / E / Z / C** on your keyboard.",
      target: "#navWidget",
      position: "left"
    },
    {
      title: "Role Filter Sidebar",
      text: "Hover over the icons on the right edge to slide out the role filters. Click to focus the city and highlight only specific domains (like Moving Images or Visual Systems).",
      target: ".filter-bar",
      position: "left",
      action: () => {
        const bar = document.querySelector(".filter-bar");
        if (bar) bar.classList.add("expanded-tour");
      },
      cleanup: () => {
        const bar = document.querySelector(".filter-bar");
        if (bar) bar.classList.remove("expanded-tour");
      }
    },
    {
      title: "Search & Year Window",
      text: "Filter work by tags, tech stacks, or clients using search, or adjust the Year Window slider to display specific eras. Click 'Clear Filters' to restore the full skyline.",
      target: ".topnav-actions",
      position: "bottom"
    },
    {
      title: "You're All Set!",
      text: "Click any building to inspect detailed case studies, client groups, and media proof. Click the <strong>?</strong> button anytime to replay this tour. Enjoy exploring!",
      target: null,
      position: "center"
    }
  ],

  init() {
    const skipBtn = document.getElementById("onboardSkip");
    const nextBtn = document.getElementById("onboardNext");
    const triggerBtns = document.querySelectorAll(".tour-trigger");

    if (skipBtn) skipBtn.addEventListener("click", () => this.end(false));
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (this.currentStep < this.steps.length - 1) {
          this.next();
        } else {
          this.end(true);
        }
      });
    }

    triggerBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.start();
      });
    });

    // Auto-trigger on first load
    if (!localStorage.getItem("portfolio_onboarded")) {
      setTimeout(() => {
        this.start();
      }, 1800);
    }

    window.addEventListener("resize", () => {
      if (this.active) this.render();
    });
  },

  start() {
    this.active = true;
    this.currentStep = 0;
    
    // Close overlays/modals to reveal the city fully
    closeNavPage();
    closeProjectPage();
    hideDetail();
    
    // Force show D-Pad during onboarding tour, save user preference temporarily
    this.originalWidgetClosed = localStorage.getItem("nav_widget_closed") === "true";
    const widget = document.getElementById("navWidget");
    const toggle = document.getElementById("navWidgetToggle");
    if (widget) widget.style.display = "";
    if (toggle) toggle.setAttribute("hidden", "true");

    const tooltip = document.getElementById("onboardTooltip");
    const highlight = document.getElementById("onboardHighlight");
    if (tooltip) tooltip.removeAttribute("hidden");
    if (highlight) highlight.removeAttribute("hidden");

    this.render();
  },

  next() {
    const step = this.steps[this.currentStep];
    if (step && step.cleanup) step.cleanup();

    this.currentStep++;
    this.render();
  },

  end(completed) {
    const step = this.steps[this.currentStep];
    if (step && step.cleanup) step.cleanup();

    this.active = false;
    const tooltip = document.getElementById("onboardTooltip");
    const highlight = document.getElementById("onboardHighlight");
    if (tooltip) tooltip.setAttribute("hidden", "true");
    if (highlight) highlight.setAttribute("hidden", "true");

    // Restore D-pad widget close state preference
    const widget = document.getElementById("navWidget");
    const toggle = document.getElementById("navWidgetToggle");
    if (widget && toggle) {
      if (this.originalWidgetClosed) {
        widget.style.display = "none";
        toggle.removeAttribute("hidden");
      } else {
        widget.style.display = "";
        toggle.setAttribute("hidden", "true");
      }
    }

    if (completed) {
      localStorage.setItem("portfolio_onboarded", "true");
    }
  },

  render() {
    const step = this.steps[this.currentStep];
    if (!step) return;

    const titleEl = document.getElementById("onboardTitle");
    const textEl = document.getElementById("onboardText");
    const stepsEl = document.getElementById("onboardSteps");
    const nextEl = document.getElementById("onboardNext");

    if (titleEl) titleEl.textContent = step.title;
    if (textEl) textEl.innerHTML = step.text;
    if (stepsEl) stepsEl.textContent = `${this.currentStep + 1}/${this.steps.length}`;
    if (nextEl) nextEl.textContent = this.currentStep === this.steps.length - 1 ? "Finish" : "Next";

    if (step.action) step.action();

    const tooltip = document.getElementById("onboardTooltip");
    const highlight = document.getElementById("onboardHighlight");
    if (!tooltip || !highlight) return;

    let targetEl = null;
    if (step.target) {
      targetEl = document.querySelector(step.target);
    }

    if (!targetEl) {
      highlight.style.display = "none";
      tooltip.style.position = "fixed";
      tooltip.style.top = "50%";
      tooltip.style.left = "50%";
      tooltip.style.transform = "translate(-50%, -50%)";
      tooltip.removeAttribute("data-pos");
      
      const arrow = tooltip.querySelector(".onboard-tooltip-arrow");
      if (arrow) arrow.style.display = "none";
    } else {
      highlight.style.display = "block";
      const rect = targetEl.getBoundingClientRect();
      const pad = 6;
      
      highlight.style.top = `${rect.top - pad}px`;
      highlight.style.left = `${rect.left - pad}px`;
      highlight.style.width = `${rect.width + pad * 2}px`;
      highlight.style.height = `${rect.height + pad * 2}px`;

      tooltip.style.position = "fixed";
      tooltip.style.transform = "none";
      const arrow = tooltip.querySelector(".onboard-tooltip-arrow");
      if (arrow) arrow.style.display = "block";
      
      const pos = step.position || "bottom";
      tooltip.setAttribute("data-pos", pos);

      const margin = 14;
      let left = 0;
      let top = 0;

      // Make sure we calculate layout values accurately
      tooltip.style.visibility = "hidden";
      tooltip.style.display = "flex";
      const tRect = tooltip.getBoundingClientRect();
      tooltip.style.display = "";
      tooltip.style.visibility = "";

      if (pos === "bottom") {
        left = rect.left + rect.width / 2 - tRect.width / 2;
        top = rect.bottom + margin;
      } else if (pos === "top") {
        left = rect.left + rect.width / 2 - tRect.width / 2;
        top = rect.top - tRect.height - margin;
      } else if (pos === "left") {
        left = rect.left - tRect.width - margin;
        top = rect.top + rect.height / 2 - tRect.height / 2;
      } else if (pos === "right") {
        left = rect.right + margin;
        top = rect.top + rect.height / 2 - tRect.height / 2;
      }

      left = Math.max(margin, Math.min(window.innerWidth - tRect.width - margin, left));
      top = Math.max(margin, Math.min(window.innerHeight - tRect.height - margin, top));

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }
  }
};

function init() {
  if (_uiReady) return;
  _uiReady = true;
  animateCount(els.statEntries, entries.length);
  animateCount(els.statYears, computeAge("1991-09-23"));
  animateCount(els.statTags, (data.tags || []).length);

  // Nav enrichment
  const yearRange = computeYearRange();
  if (els.navBrandSub) setText(els.navBrandSub, `${yearRange[0]}–now · ${entries.length} projects`);
  const uniqueRoles = computeUniqueRoleCount(entries);
  if (els.navRoleCount) setText(els.navRoleCount, String(uniqueRoles));
  const uniqueClients = computeUniqueClientCount(entries);
  if (els.navClientCount) setText(els.navClientCount, String(uniqueClients));
  if (els.navCaseStudiesCount) setText(els.navCaseStudiesCount, String(caseStudies.length));

  initTheme();
  renderRolePills();
  renderSearchChips();

  if (isMobile()) {
    document.body.classList.add("mobile-mode");
    renderMobileList();
    bindEvents();
    bindNavLinks();
    return;
  }

  renderWeekHeader();
  renderGrid();
  renderSupportingSections();
  applyFilters();
  bindEvents();
  bindNavLinks();

  // Do NOT auto-select an entry — detail panel stays hidden until user clicks
  initTerrain();
  Onboarding.init();
}

let _mobileListContainer = null;

function renderMobileList() {
  const stage = els.terrainStage;
  if (!stage) return;
  stage.innerHTML = "";
  stage.style.overflow = "auto";

  const list = document.createElement("div");
  list.className = "mobile-list";
  _mobileListContainer = list;

  entries.forEach((entry, i) => {
    if (!entryMatchesActiveRole(entry)) return;
    const year = entry.year || "";
    const title = entry.title || "Untitled";
    const role = entry.role || (entry.roles && entry.roles[0]) || "";
    const tags = (entry.tags || []).slice(0, 3);
    const tagStr = tags.length ? tags.map((t) => `<span class="mobile-tag">${escapeHtml(t)}</span>`).join("") : "";

    const card = document.createElement("button");
    card.className = "mobile-card";
    card.type = "button";
    card.setAttribute("data-entry-id", entry.id);
    card.addEventListener("click", () => selectEntry(entry.id, { zoom: true, scroll: false }));
    card.innerHTML = `
      <span class="mobile-card-year">${escapeHtml(year)}</span>
      <span class="mobile-card-title">${escapeHtml(title)}</span>
      <span class="mobile-card-role">${escapeHtml(role)}</span>
      <span class="mobile-card-tags">${tagStr}</span>
    `;
    list.appendChild(card);
  });

  stage.appendChild(list);
}

function refreshMobileList() {
  if (!_mobileListContainer) return;
  const stage = els.terrainStage;
  if (!stage) return;
  stage.innerHTML = "";
  _mobileListContainer = null;
  renderMobileList();
}

function renderRolePills() {
  if (!els.rolePills) return;
  // Reset list — but rebuild "All" as a card now too instead of relying on
  // the static HTML markup which doesn't carry our colour vars.
  els.rolePills.innerHTML = "";

  const roleStickers = {
    MovingImages: "public/stickers/sticker_moving_images.png",
    VisualSystems: "public/stickers/sticker_visual_systems.png",
    CompCulture: "public/stickers/sticker_comp_culture.png",
    DocResearch: "public/stickers/sticker_doc_research.png",
    LeadershipEdu: "public/stickers/sticker_leadership_edu.png",
    Life: "public/stickers/sticker_life.png",
  };

  const cards = [
    { key: "all", label: "All work", icon: "○", color: "var(--ink)", ink: "var(--page-bg)" },
    ...SPATIAL_FILTERS.map((r) => ({ key: r.key, label: r.label, icon: r.icon, color: r.color, ink: r.ink })),
  ];

  for (const role of cards) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `rolepill${state.activeRoleKey === role.key ? " active" : ""}`;
    btn.dataset.role = role.key;
    btn.title = role.label;
    // Per-role CSS vars drive the card's accent + ink colour
    btn.style.setProperty("--pill-color", role.color);
    btn.style.setProperty("--pill-ink", role.ink);

    const stickerSrc = roleStickers[role.key];
    const iconHtml = stickerSrc
      ? `<img class="rolepill-sticker" src="${stickerSrc}" alt="" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;filter:drop-shadow(0 0 0 1px #ffffff) drop-shadow(0 0 0 1.5px #1a1714) drop-shadow(1px 1px 0px rgba(0,0,0,0.15));" onerror="this.remove()">`
      : (FOLIO_ICONS[role.key] || `<span aria-hidden="true" style="font-size:14px">${role.icon}</span>`);

    btn.innerHTML = `
      <span class="rolepill-icon" aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;">${iconHtml}</span>
      <span class="rolepill-label">${role.label}</span>
    `;
    btn.addEventListener("click", () => setActiveRole(role.key));
    // Pass 09: hover → live preview filter (no commit). Mouse leave snaps
    // back to whatever was last clicked. Smooth GSAP transition handled in
    // terrain.js applyFiltersToPrisms.
    btn.addEventListener("pointerenter", () => previewRole(role.key));
    btn.addEventListener("pointerleave", () => previewRole(null));
    els.rolePills.append(btn);
  }
}

function setActiveRole(key) {
  state.activeRoleKey = key;
  state.previewRoleKey = null;
  // Update pill UI
  els.rolePills?.querySelectorAll(".rolepill").forEach((p) => {
    p.classList.toggle("active", p.dataset.role === key);
    p.classList.remove("preview");
  });
  applyFilters();
  // Folio: the "all" pill doubles as Reset (the standalone Reset button is gone).
  if (key === "all") terrain?.resetView?.();
  if (document.body.classList.contains("mobile-mode")) refreshMobileList();
}

function previewRole(key) {
  state.previewRoleKey = key;
  els.rolePills?.querySelectorAll(".rolepill").forEach((p) => {
    p.classList.toggle("preview", key != null && p.dataset.role === key);
  });
  applyFilters();
}

function entryMatchesActiveRole(entry) {
  // Hover preview wins over the locked filter while the cursor is on a pill.
  const effectiveKey = state.previewRoleKey ?? state.activeRoleKey;
  if (effectiveKey === "all" || effectiveKey == null) return true;
  const role = SPATIAL_FILTERS.find((r) => r.key === effectiveKey);
  if (!role) return true;
  const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
  return allTags.some((t) => role.match.some((m) => tagMatchesTerm(t, m)));
}

function bindNavLinks() {
  els.navLinks?.forEach((link) => {
    link.addEventListener("click", () => {
      els.navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      const view = link.dataset.view;
      if (view === "archive") {
        closeNavPage();
        closeProjectPage();
        hideDetail();
        state.activeTags.clear();
        state.activeTagInputs.clear();
        els.searchInput.value = "";
        renderSearchChips();
        setActiveRole("all");
        applyFilters();
      } else if (view === "contact") {
        closeNavPage();
        selectEntry(132, { zoom: true });
        els.navLinks.forEach((l) => l.classList.toggle("active", l.dataset.view === "archive"));
      } else {
        openNavPage(view);
      }
    });
  });
}

function bindEvents() {
  // Search: Enter/comma adds a tag chip
  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const val = event.target.value.trim();
      if (val) {
        state.activeTagInputs.add(val);
        state.activeTags.add(val);
        event.target.value = "";
        state.search = "";
        renderSearchChips();
        applyFilters();
      }
    }
  });
  // Search: live text filter with 150ms debounce (M2)
  let _searchDebounce = null;
  els.searchInput.addEventListener("input", (event) => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => {
      state.search = event.target.value.trim().toLowerCase();
      applyFilters();
      updateActiveFiltersBadge();
    }, 150);
  });

  // Legacy zoom slider is gone (replaced by Year Window in Pass 05). Keep
  // the listener guard so older HTML/markup variants don't crash.
  if (els.zoomControl) {
    els.zoomControl.addEventListener("input", (event) => {
      setZoom(Number(event.target.value));
    });
  }

  // ─── Year Window dual-handle range slider (Pass 05) ────────────────
  if (els.yearWindowStart && els.yearWindowEnd) {
    const MIN_YEAR_GAP = 1;
    // M4: Year labels on slider handles — display current value on each thumb.
    // Label elements are created lazily and positioned via CSS custom props.
    const startLabel = document.createElement("span");
    startLabel.className = "year-handle-label year-handle-label--start";
    startLabel.setAttribute("aria-hidden", "true");
    const endLabel = document.createElement("span");
    endLabel.className = "year-handle-label year-handle-label--end";
    endLabel.setAttribute("aria-hidden", "true");
    els.yearRange?.append(startLabel, endLabel);

    const onYearWindowChange = () => {
      let start = Number(els.yearWindowStart.value);
      let end = Number(els.yearWindowEnd.value);
      if (start > end - MIN_YEAR_GAP) {
        // Resolve crossover: snap whichever handle the user is dragging.
        if (document.activeElement === els.yearWindowStart) {
          start = end - MIN_YEAR_GAP;
          els.yearWindowStart.value = String(start);
        } else {
          end = start + MIN_YEAR_GAP;
          els.yearWindowEnd.value = String(end);
        }
      }
      state.yearWindow = { start, end };
      if (els.yearWindowOutput) els.yearWindowOutput.textContent = `${start} – ${end}`;
      if (els.yearWindowNav && els.yearWindowNavLabel) {
        els.yearWindowNav.hidden = false;
        els.yearWindowNavLabel.textContent = `${start}–${end}`;
      }
      // Update the fill bar position (CSS custom props).
      const min = Number(els.yearWindowStart.min);
      const max = Number(els.yearWindowStart.max);
      const range = max - min || 1;
      if (els.yearRange) {
        els.yearRange.style.setProperty("--start-pct", `${((start - min) / range) * 100}%`);
        els.yearRange.style.setProperty("--end-pct",   `${((end   - min) / range) * 100}%`);
        els.yearRange.style.setProperty("--start-year", String(start));
        els.yearRange.style.setProperty("--end-year", String(end));
      }
      startLabel.textContent = String(start);
      endLabel.textContent = String(end);
      terrain?.applyYearWindow?.(start, end);
      if (document.body.classList.contains("mobile-mode")) refreshMobileList();
      updateActiveFiltersBadge();
    };
    els.yearWindowStart.addEventListener("input", onYearWindowChange);
    els.yearWindowEnd.addEventListener("input", onYearWindowChange);
    // Initial paint so the fill bar matches the default values.
    onYearWindowChange();
  }

  if (els.clearFilters) {
    els.clearFilters.addEventListener("click", clearAllFilters);
  }
  // M3: Global clear-all-filters handler (extended to reset role + year window)
  function clearAllFilters() {
    state.activeTags.clear();
    state.activeTagInputs.clear();
    state.search = "";
    els.searchInput.value = "";
    setActiveRole("all");
    if (els.yearWindowStart) els.yearWindowStart.value = "1991";
    if (els.yearWindowEnd) els.yearWindowEnd.value = "2026";
    state.yearWindow = { start: 1991, end: 2026 };
    // Trigger year window update
    if (els.yearWindowStart && els.yearWindowEnd) {
      const ev = new Event("input", { bubbles: true });
      els.yearWindowStart.dispatchEvent(ev);
      els.yearWindowEnd.dispatchEvent(ev);
    }
    renderSearchChips();
    applyFilters();
    updateActiveFiltersBadge();
  }

  if (els.themeToggle) {
    // The Fluent <fluent-switch> `change` event proved unreliable across the
    // CSS layers (the host receives the click but doesn't always emit change).
    // toggleTheme() flips data-theme from the CURRENT DOM state, so a plain
    // click handler is reliable and idempotent. Guard against the switch ALSO
    // firing change (double-toggle) by debouncing within one tick.
    let _themeTick = false;
    const onThemeToggle = () => {
      if (_themeTick) return;
      _themeTick = true;
      toggleTheme();
      requestAnimationFrame(() => { _themeTick = false; });
    };
    els.themeToggle.addEventListener("click", onThemeToggle);
    els.themeToggle.addEventListener("change", onThemeToggle);
  }

  // Filter bar is collapse-on-hover styled via CSS now

  // c3: Edit mode footer link
  const editFooter = document.createElement("div");
  editFooter.className = "edit-footer-link";
  editFooter.innerHTML = `<a href="?edit=1" class="textbtn" style="position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:20;opacity:0.3;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-faint);text-decoration:none;transition:opacity 0.3s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'">edit mode</a>`;
  if (!state.editMode) document.body.appendChild(editFooter);

  // c1: Transient HUD hint — show on first visit only
  if (!localStorage.getItem("hud-hint-seen")) {
    const hud = document.querySelector(".hud-hint");
    if (hud) {
      hud.style.display = "block";
      hud.style.transition = "opacity 0.8s ease";
      setTimeout(() => { hud.style.opacity = "0"; }, 5000);
      setTimeout(() => {
        hud.style.display = "none";
        hud.style.opacity = "1";
        localStorage.setItem("hud-hint-seen", "1");
      }, 5800);
    }
  }

  // c2: Story Mode "Play Film" — disable with coming-soon badge
  const playBtn = document.getElementById("storyPlayFilm");
  if (playBtn) {
    playBtn.setAttribute("disabled", "disabled");
    const badge = document.createElement("span");
    badge.className = "story-coming-badge";
    badge.textContent = "coming soon";
    badge.style.cssText = "display:block;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.4;margin-top:4px";
    playBtn.parentNode?.insertBefore(badge, playBtn.nextSibling);
  }

  els.resetView.addEventListener("click", () => {
    setZoom(100);
    terrain?.resetView();
    els.mapScroll.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  });

  // 3D / 2D toggle
  let is3D = true;
  if (els.toggleView) {
    els.toggleView.addEventListener("click", () => {
      is3D = !is3D;
      const label = els.toggleView.querySelector("span:last-child");
      if (label) label.textContent = is3D ? "2D view" : "3D view";
      document.body.classList.toggle("view-2d", !is3D);
      // Re-apply zoom transform appropriately for the active view
      setZoom(state.zoom);
    });
  }

  // Detail panel close (legacy side panel — kept for backward compat)
  if (els.detailClose) {
    els.detailClose.addEventListener("click", hideDetail);
  }

  // Project page close + back to archive
  if (els.projectPageClose) {
    els.projectPageClose.addEventListener("click", () => {
      // Single control, two steps: from an entry opened via a cluster, the
      // first press returns to that cluster's list (stays in the modal, keeps
      // the building framed). From the list (or a directly-opened entry) it
      // exits to the portfolio. The glyph reflects this (← vs ×).
      if (state.modalView === "entry" && state.clusterContext) {
        const ctx = state.clusterContext;
        closeProjectPage();
        openClusterPage(ctx);
      } else {
        closeProjectPage();
        terrain?.selectEntry(null, { focus: false });
        terrain?.restoreCamera();
        terrain?.resetView();  // return camera to full skyline
      }
    });
  }
  if (els.projectBack) {
    els.projectBack.addEventListener("click", () => {
      closeProjectPage();
      terrain?.restoreCamera();
      terrain?.resetView();
      state.selectedEntryId = null;
    });
  }

  // Nav page close
  if (els.navPageClose) {
    els.navPageClose.addEventListener("click", closeNavPage);
  }

  // Gallery events
  if (els.galleryClose) {
    els.galleryClose.addEventListener("click", closeGalleryOverlay);
  }
  document.querySelectorAll("[data-gallery-tab]").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const tab = tabBtn.dataset.galleryTab;
      switchGalleryTab(tab);
    });
  });
  // The × on the artifact is the back button (one level → gallery). The
  // gallery's own × exits to the portfolio. No separate back button.
  if (els.artifactClose) {
    els.artifactClose.addEventListener("click", closeArtifactView);
  }

  // m5: Global error handler for broken evidence images. For a HERO image,
  // auto-advance to the next thumbnail that's an image (so a single broken
  // first-evidence file doesn't strand the whole artifact on "no preview").
  // Otherwise hide the broken img and show a clean placeholder.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || img.closest(".ev-lightbox")) return;
    if (img.dataset.evErrorHandled) return;
    img.dataset.evErrorHandled = "1";

    // Hero image failed → try the next IMAGE evidence via the thumb strip.
    const hero = img.closest(".artifact-hero");
    if (hero) {
      const root = hero.closest(".artifact-container, .gallery-artifact, .fx-single, .ms-body-inner") || document;
      const thumbs = [...root.querySelectorAll(".artifact-thumb[data-thumb-hero]")];
      const active = root.querySelector(".artifact-thumb.is-active");
      const startIdx = active ? thumbs.indexOf(active) : 0;
      const order = [...thumbs.slice(startIdx + 1), ...thumbs.slice(0, startIdx)];
      const nextImg = order.find((t) => /^\s*<img/i.test(t.dataset.thumbHero || ""));
      if (nextImg) { nextImg.click(); return; }   // swap hero to a loadable image
    }

    img.style.display = "none";
    const parent = img.closest(".ms-ev, .ev-figure, .gallery-item, .artifact-hero");
    if (parent && !parent.querySelector(".ev-error-fallback")) {
      const fallback = document.createElement("span");
      fallback.className = "ev-error-fallback";
      fallback.style.cssText = "display:flex;align-items:center;justify-content:center;min-height:80px;color:var(--ink-mute);font-size:11px;letter-spacing:0.04em;text-transform:uppercase;padding:16px;text-align:center";
      fallback.textContent = "No preview";
      parent.appendChild(fallback);
    }
  }, true);

  // App-wide "expand to full screen": any [data-expand-id] button opens that
  // entry in the canonical full-screen artifact view. Back = close the artifact
  // (z-index 110) → reveals whatever overlay it was expanded from underneath.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-expand-id]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const ent = entries.find((x) => x.id === Number(btn.dataset.expandId));
    if (ent) openEntryArtifact(ent);
  });

  if (els.prevEntry) els.prevEntry.addEventListener("click", () => stepEntry(-1));
  if (els.nextEntry) els.nextEntry.addEventListener("click", () => stepEntry(1));

  document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    const isInputFocused = tag === "input" || tag === "textarea" || tag === "select";
    const overlayOpen = els.galleryArtifact?.classList.contains("visible")
      || els.galleryOverlay?.classList.contains("visible")
      || els.navPage?.classList.contains("visible");
    if (!isInputFocused && !overlayOpen) {
      if (event.key === "ArrowRight") { event.preventDefault(); stepEntry(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); stepEntry(-1); }
    }
    if (event.key === "Escape") {
      hideTooltip();
      if (els.galleryArtifact?.classList.contains("visible")) {
        closeArtifactView();
      } else if (els.galleryOverlay?.classList.contains("visible")) {
        closeGalleryOverlay();
      } else if (els.projectPage?.classList.contains("visible")) {
        closeProjectPage();
        terrain?.restoreCamera();
        terrain?.resetView();
        state.selectedEntryId = null;
      } else if (els.navPage?.classList.contains("visible")) {
        closeNavPage();
      } else {
        // m6: Esc key feedback — visual pulse when nothing to close
        const overlay = document.querySelector(".topnav");
        if (overlay) {
          overlay.style.transition = "box-shadow 0.15s ease";
          overlay.style.boxShadow = "0 0 0 2px var(--accent)";
          setTimeout(() => { overlay.style.boxShadow = ""; }, 300);
        }
        hideDetail();
      }
    }
  });
}

function hideDetail() {
  if (els.detailPanel) {
    els.detailPanel.classList.remove("visible");
    els.detailPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-open");
  }
  closeProjectPage();
  state.selectedEntryId = null;
  document.querySelectorAll(".cell.active").forEach((cell) => cell.classList.remove("active"));
  terrain?.restoreCamera();
  terrain?.selectEntry(null, { focus: false });
}

// ─── Brutalist side modal (Pass 03) ──────────────────────────────
// Right-side split-screen panel: ledger sidebar (30%) + display mainboard (70%).
// Camera positions the building in the LEFT third of the viewport.
//
// Pass 04: in edit mode (`?edit=1`), pressing EDIT swaps the rendered modal
// into renderEditView(entry) — all metadata fields become brutalist inputs,
// plus a media block for image/video uploads + YouTube URLs. SAVE PUTs the
// merged entry back to /api/entries/:id and reloads ledger.json.

function openProjectPage(entry) {
  if (!els.projectPage || !els.projectPageInner) return;
  if (state.editMode && state.editingEntryId === entry.id) {
    leaveProjectArtifactMode();
    renderEditView(entry);
    return;
  }

  // Canonical single-entry view = the clean full-screen artifact. The manila
  // folder body below forced dark ink (#1A1714) on a bucket-coloured fill that
  // is dark for several buckets → dark-on-dark, and floated awkwardly over the
  // 3D scene. Route every read-open to the one readable artifact view instead.
  openEntryArtifact(entry);
  return;

  // ── legacy manila single-entry sheet (unreachable; kept for reference) ──
  // Gather "same month" siblings (matches the LOD: each building is a month).
  const monthKey = `${entry.year}-${String(entry.month || 1).padStart(2, "0")}`;
  const monthEntries = entries.filter((item) => {
    const mk = `${item.year}-${String(item.month || 1).padStart(2, "0")}`;
    return mk === monthKey;
  });

  const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
  const bucket = findBucketForTags(allTags);
  const bucketColor = bucket?.modalBg || bucket?.color || "#c8c0e0";
  const bucketLabel = bucket?.label || "Other";
  // Contrasting text colour for the role fill (white on dark roles, ink on light).
  const bucketInk = bucket?.ink || "#1A1714";

  const tagsHTML = (entry.tags || []).slice(0, 10)
    .map((tag) => `<span class="folder-tag">${escapeHtml(tag)}</span>`).join("");

  const sameBucket = entries.filter((e) => {
    const b = findBucketForTags([...(e.tags || []), ...(e.roleTags || []), e.role || ""]);
    return b?.key === bucket?.key;
  });
  const bIdx = sameBucket.findIndex((e) => e.id === entry.id);
  const prev = bIdx > 0 ? sameBucket[bIdx - 1] : null;
  const next = bIdx < sameBucket.length - 1 ? sameBucket[bIdx + 1] : null;

  const relatedHTML = monthEntries
    .filter((item) => item.id !== entry.id)
    .slice(0, 6)
    .map((item) => `
      <button type="button" class="artifact-related-row" data-related-id="${item.id}">
        <span class="ar-title">${escapeHtml(item.title || "Untitled")}</span>
        <span class="ar-meta">${escapeHtml(item.role || "")}${item.org ? " · " + escapeHtml(item.org) : ""}</span>
      </button>`).join("");

  const metaRow = (label, val) => val
    ? `<div class="artifact-metadata-row"><span class="artifact-meta-label">${escapeHtml(label)}</span><span class="artifact-meta-val">${escapeHtml(String(val))}</span></div>`
    : "";

  // Single-entry view renders the SAME manila sheet body the cluster
  // cascade uses (renderEntrySheetBody) — one canonical look for a project
  // no matter which path opened it. Evidence shows as a scrollable gallery;
  // captions live in a side notes column (no hero carousel here anymore).
  const sheetBody = renderEntrySheetBody(entry);

  // Manila folder: colour lives on the TAB; the body is cream paper.
  els.projectPage.style.setProperty("--fill", bucketColor);
  els.projectPage.style.setProperty("--ink", "#1A1714");
  // Reflow fix: commit folder-sheet + innerHTML BEFORE adding .visible,
  // so the browser paints translateY(100%) as the start state and
  // transitions from there, not from the old translateX(100%).
  els.projectPage.classList.add("folder-sheet");

  // Manila single-entry sheet: colored tab grip + cream body carrying the
  // canonical sheet content. Same-month + prev/next nav append below the
  // shared body (these are single-view affordances the cluster doesn't need).
  const relatedBlock = relatedHTML
    ? `<div class="ms-extra"><h3 class="ms-extra-head">Same month</h3><div class="ms-related">${relatedHTML}</div></div>`
    : "";
  const prevNextBlock = (prev || next)
    ? `<div class="ms-extra ms-prevnext">
        ${prev ? `<button type="button" data-nav-id="${prev.id}"><span class="ar-nav-label">← Prev</span><span class="ar-nav-title">${escapeHtml(prev.title || "Untitled")}</span></button>` : `<span></span>`}
        ${next ? `<button type="button" data-nav-id="${next.id}"><span class="ar-nav-label">Next →</span><span class="ar-nav-title">${escapeHtml(next.title || "Untitled")}</span></button>` : `<span></span>`}
      </div>`
    : "";

  els.projectPageInner.innerHTML = `
    <div class="folder-tab" data-folder-grip>
      <span class="folder-handle" aria-hidden="true"></span>
      <span class="folder-tab-label">${escapeHtml(bucketLabel)}</span>
      ${state.editMode ? `<button type="button" class="folder-edit-btn" data-action="edit">EDIT</button>` : ""}
    </div>
    <div class="folder-body">
      <div class="ms-body-inner ms-body-inner--single">
        ${sheetBody}
        ${relatedBlock}
        ${prevNextBlock}
      </div>
    </div>
  `;

  // Evidence images: clickable — open in a lightbox overlay
  els.projectPageInner.querySelectorAll(".ms-ev--img[data-ev-src]").forEach((fig) => {
    fig.addEventListener("click", () => {
      const src = fig.dataset.evSrc;
      if (!src) return;
      openLightbox(src, fig.querySelector("img")?.alt || "");
    });
  });

  loadSocialEmbeds(els.projectPageInner);

  els.projectPageInner.querySelectorAll("[data-related-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectEntry(Number(btn.dataset.relatedId), { zoom: true }));
  });
  els.projectPageInner.querySelectorAll("[data-nav-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectEntry(Number(btn.dataset.navId), { zoom: true }));
  });
  els.projectPageInner.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      leaveProjectArtifactMode();
      state.editingEntryId = entry.id;
      renderEditView(entry);
    });
  });

  state.modalView = "entry";
  refreshProjectBack();

  // Force reflow to commit translateY(100%) baseline, then show in next frame
  els.projectPage.setAttribute("aria-hidden", "false");
  void els.projectPage.offsetHeight;
  document.body.classList.add("project-open");
  els.projectPage.classList.add("entry-mode");
  requestAnimationFrame(() => {
    els.projectPage.classList.add("visible");
  });
}

// Drop the folder-sheet styling (used when switching to the brutalist edit
// form, or on close) and tear down the drag controller.
function leaveProjectArtifactMode() {
  els.projectPage?.classList.remove("folder-sheet", "artifact-mode", "entry-mode");
  els.projectPageInner?.classList.remove("artifact-mode");
}

// ── Manila folder drawer (cluster view — manila v4 cascade) ──────
// Big folder sheets cascading in depth from the bottom edge — each
// folder is one flat shape (small tab + full-width sheet), always
// visible, tucked one behind the other with tabs staggered at
// different x positions like file dividers. Click a folder → the
// whole sheet slides up to reading position; the rest duck + dim.
// GSAP SAFETY: opacity is CSS-owned via classes; JS writes only
// layout (top / z-index / --tabX / --sheetW) and motion props
// (--enter / --rise / --duck) consumed inside calc() transforms.

let clusterCameraPushed = false;

// Visual hero media for a folder sheet — same rules as the artifact
// view's hero: image / muted video / YouTube embed. Shared by the
// sheet builder and the carousel handler so they never drift.
function folderHeroMedia(entry) {
  return (Array.isArray(entry.evidence) ? entry.evidence : []).map((m) => {
    if (m.type === "image" && m.src) return `<img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.caption || entry.title || "")}" loading="lazy">`;
    if (m.type === "video" && m.src) return `<video src="${escapeHtml(m.src)}" autoplay muted loop playsinline controls></video>`;
    if (m.type === "youtube" && m.url) {
      const id = extractYouTubeId(m.url);
      if (id) return `<iframe src="https://www.youtube.com/embed/${id}?mute=1&rel=0" title="${escapeHtml(m.caption || entry.title || "")}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>`;
    }
    // PDF — browser-native viewer via iframe, scoped to the first page so
    // multi-page decks read as a hero rather than infinite scroll.
    if ((m.type === "pdf" || (m.src && /\.pdf($|\?)/i.test(m.src))) && m.src) {
      return `<iframe src="${escapeHtml(m.src)}#view=FitH&toolbar=0" title="${escapeHtml(m.caption || entry.title || "PDF")}" loading="lazy" class="ev-pdf-frame"></iframe>`;
    }
    return null;
  }).filter(Boolean);
}

function buildFolderSheet(entry) {
  // Canonical manila sheet — same body the single-entry slide-up view uses.
  return `<div class="ms-body-inner">${renderEntrySheetBody(entry)}</div>`;
}

// Cluster labels that collapse to a single merged folder (see openClusterPage).
// Orgs that appear so often across the ledger (multiple roles, years, projects)
// that listing them as N separate folders bloats the cluster + clients view.
// Collapse to ONE merged folder per org — evidence + milestones are unioned.
const MERGE_CLUSTER_LABELS = new Set([
  "Pixelate",
  "KindHealth",
  "AIESEC",
  "SEMCOM College",
  "Letsarc Media",
  "Arahantas",
  "Krishnadev Yagnik",
  "Haus of Pixels",
  "Shivanata",
  "Rabble Labs / BuidlersTribe",
]);

const MERGE_CLUSTER_COPY = {
  AIESEC: {
    role: "Designer / Volunteer Leader",
    description: "Joined AIESEC Vidyanagar on 14 October 2010, then moved from first commercial poster and T-shirt briefs into VP Communications and Local Committee Coordinator. The 2010 to 2012 run combined hands-on design, volunteer leadership, conference branding and chapter operations.",
  },
  Pixelate: {
    role: "Co-founder",
    description: "Co-founded Pixelate in 2017 with Ronak P Amin and Pranav Burnwal to explore blockchain ownership for camera-sensor photographs. The venture won a 54-hour Startup Weekend challenge, produced a technical whitepaper, joined the NEAR accelerator and received a $15,000 Fast Grant before closing on 25 July 2024.",
  },
  KindHealth: {
    role: "Co-founder",
    description: "Co-founded KindHealth in 2024 and developed the initial product concept and financial model. The venture stalled before launch.",
  },
  "SEMCOM College": {
    role: "Student / Visiting Faculty",
    description: "Studied Information Technology at SEMCOM from 2009 to 2013, then returned as visiting faculty in 2016 to teach advertising, film, editing and emerging technology. The relationship spans student work, early films and classroom leadership.",
  },
  "Letsarc Media": {
    role: "Director / Cinematographer",
    description: "Directed or shot commercial and corporate films through Letsarc Media across two periods: Abad Bread and Armoise Hotel in 2017, followed by three Surat Municipal Corporation films in 2026.",
  },
  Arahantas: {
    role: "Designer / Photographer / Volunteer",
    description: "Worked with Arahantas first as a volunteer event promoter in Himachal Pradesh, then returned for brand identity and photography. The relationship connects grassroots event work, social content, visual identity and documentary images.",
  },
  "Krishnadev Yagnik": {
    role: "Unit Still Photographer / BTS",
    description: "Shot unit stills and behind-the-scenes video for director Krishnadev Yagnik's Chhello Divas, released on 20 November 2015. The BTS coverage reached 539,000+ combined YouTube views, making it the most-viewed early film credit in this archive.",
  },
};

// Fold a cluster's member entries into ONE synthetic entry: union of evidence
// (deduped by src/url), union of tags, and a story that lists the milestones.
// Keeps the earliest entry's id so folder/lightbox wiring stays valid.
function mergeClusterEntries(list, label) {
  const chrono = [...list].sort((a, b) => (a.year || 0) - (b.year || 0) || (a.month || 0) - (b.month || 0));
  const primary = chrono[0];
  const evidence = [];
  const seen = new Set();
  for (const e of chrono) {
    for (const m of (e.evidence || [])) {
      const key = m.src || m.url || "";
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      evidence.push(m);
    }
  }
  const tags = [...new Set(chrono.flatMap((e) => [...(e.tags || []), ...(e.roleTags || [])]))];
  const milestones = chrono.map((e) => e.title).filter(Boolean);
  const groupCopy = MERGE_CLUSTER_COPY[label];
  const story = (groupCopy?.description || primary.description || "").trim();
  const description = milestones.length > 1
    ? `${story}${story ? "\n\n" : ""}Milestones: ${milestones.join("; ")}.`
    : story;
  return {
    ...primary,
    title: label,
    role: groupCopy?.role || primary.role || "Co-founder",
    description,
    evidence,
    tags,
    roleTags: tags,
    _merged: true,
  };
}

// Collapse a listing so merge-group members (Pixelate / KindHealth) show as ONE
// synthetic merged entry — same idea as the archive cluster, applied to the
// Roles/Clients lists so a project isn't listed multiple times. Keyed on
// clientCanonical so it only folds entries that truly belong to the same client
// (e.g. the NEAR grant, clientCanonical "NEAR Foundation", stays its own row).
function collapseMergedEntries(list) {
  const merges = new Map();
  const out = [];
  for (const e of list) {
    const cc = e.clientCanonical;
    if (cc && MERGE_CLUSTER_LABELS.has(cc)) {
      if (!merges.has(cc)) merges.set(cc, []);
      merges.get(cc).push(e);
    } else {
      out.push(e);
    }
  }
  for (const [label, members] of merges) {
    out.push(members.length > 1 ? mergeClusterEntries(members, label) : members[0]);
  }
  return out;
}

// Clean cluster list — a readable Fluent card grid for a building that maps to
// several entries. Replaces the manila cascade. Each card opens the canonical
// full-screen artifact; the × closes back to the archive.
function openClusterList(label, clusterEntries) {
  if (!els.projectPage || !els.projectPageInner) return;
  els.projectPage.classList.remove("folder-sheet");
  els.projectPage.style.removeProperty("--fill");
  els.projectPage.style.removeProperty("--ink");

  const cards = clusterEntries.map((e) => {
    const src = evidencePreviewSrc(e);
    const meta = [e.year, e.role, e.org].filter(Boolean).join(" · ");
    return `<button type="button" class="cl-card" data-entry-id="${e.id}">
      <span class="cl-card-thumb">${src
        ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">`
        : `<span class="cl-card-ph"></span>`}</span>
      <span class="cl-card-body">
        <span class="cl-card-title">${escapeHtml(e.title || "Untitled")}</span>
        <span class="cl-card-meta">${escapeHtml(meta)}</span>
      </span>
    </button>`;
  }).join("");

  els.projectPageInner.innerHTML = `
    <div class="cl-page">
      <header class="cl-head">
        <h2 class="cl-title">${escapeHtml(label)}</h2>
        <span class="cl-count">${clusterEntries.length} projects</span>
      </header>
      <div class="cl-grid">${cards}</div>
    </div>`;

  els.projectPageInner.querySelectorAll(".cl-card").forEach((card) => {
    card.addEventListener("click", () => {
      const ent = entries.find((e) => e.id === Number(card.dataset.entryId));
      if (ent) openEntryArtifact(ent);
    });
  });

  els.projectPage.classList.add("visible");
  els.projectPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("project-open");
  state.clusterContext = { label, entryIds: clusterEntries.map((e) => e.id) };
  state.modalView = "cluster";
  refreshProjectBack?.();
}

function openClusterPage(clusterInfo) {
  const { label, entryIds } = clusterInfo;

  if (label === "Travel & Gallery") {
    openGalleryOverlay();
    return;
  }

  if (!els.projectPage || !els.projectPageInner) return;

  closeProjectPage();

  let clusterEntries = entryIds
    .map((id) => entries.find((e) => e.id === id))
    .filter(Boolean)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0));

  // A building cluster (Haus of Pixels, Pixelate, …) is a *studio of brands /
  // projects* — listing every member tells the recruiter what was actually
  // worked on. Folding them into one merged folder hid the breadth (and buried
  // each project's own evidence), so the archive view NO LONGER merges. The
  // Roles/Clients lists still collapse duplicate-client rows via
  // collapseMergedEntries — that's a different surface where one row per client
  // is correct.

  // Clean cluster view replaces the old manila cascade (low contrast, awkward
  // float over the 3D scene). One entry → straight to the artifact; many → a
  // readable Fluent card list, each card → the artifact.
  if (clusterEntries.length === 1) { openEntryArtifact(clusterEntries[0]); return; }
  openClusterList(label, clusterEntries);
  return;

  // ── legacy manila cascade (unreachable; kept until the clean path is proven) ──
  // Master bucket = most common across entries (colors the chrome)
  const bucketCounts = {};
  let dominantBucket = null;
  clusterEntries.forEach((entry) => {
    const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
    const bucket = findBucketForTags(allTags);
    if (bucket) {
      bucketCounts[bucket.key] = (bucketCounts[bucket.key] || 0) + 1;
      if (!dominantBucket || bucketCounts[bucket.key] > bucketCounts[dominantBucket.key]) {
        dominantBucket = bucket;
      }
    }
  });
  const masterBucket = dominantBucket || findBucketForTags([label]) || null;
  els.projectPage.style.setProperty("--fill", masterBucket?.modalBg || "#f5f5f5");
  els.projectPage.style.setProperty("--ink", masterBucket?.ink || "#1A1714");
  els.projectPage.classList.add("folder-sheet");

  const folderHTML = clusterEntries.map((entry, i) => {
    const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
    const eb = findBucketForTags(allTags);
    const fill = eb?.modalBg || eb?.color || "#f5f5f5";
    const ink = eb?.ink || "#1A1714";
    return `<div class="mf-folder" data-entry-id="${entry.id}" style="--i:${i};--fill:${fill};--ink:${ink}">
      <button type="button" class="mf-tab" title="${escapeHtml(entry.title || "")}">${escapeHtml(entry.title || "Untitled")}</button>
      <div class="mf-body"><div class="mf-body-scroll"></div></div>
    </div>`;
  }).join("");

  const codexRows = clusterEntries.map((e) => {
    const fiSrc = evidencePreviewSrc(e);
    return `<div class="mf-codex-row" data-entry-id="${e.id}">
      <div class="mf-codex-row-type">${escapeHtml(e.title || "Untitled")}</div>
      <div class="mf-codex-row-meta">${escapeHtml([e.year, e.role, e.org].filter(Boolean).join(" · "))}</div>
      ${fiSrc ? `<span class="mf-codex-row-img" data-src="${escapeHtml(fiSrc)}"></span>` : ""}
    </div>`;
  }).join("");

  els.projectPageInner.innerHTML = `<div class="mf-drawer">
    <div class="mf-drawer-inner">${folderHTML}</div>
    <div class="mf-menubar">
      <span class="mf-menubar-label">${escapeHtml(label)} <em>· ${clusterEntries.length} filed</em></span>
      <span class="mf-menubar-right"><button type="button" class="mf-menubar-codex-btn" data-codex-btn>List →</button></span>
    </div>
    <div class="mf-codex" aria-hidden="true">
      <header class="mf-codex-header">
        <button type="button" class="mf-codex-back" data-codex-back>← Folders</button>
        <span class="mf-codex-label">${escapeHtml(label)}</span>
      </header>
      <div class="mf-codex-view">
        <div class="mf-codex-track">${codexRows}</div>
        <img class="mf-codex-stage" alt="" aria-hidden="true">
      </div>
    </div>
  </div>`;

  const drawer = els.projectPageInner.querySelector(".mf-drawer");
  const drawerInner = drawer.querySelector(".mf-drawer-inner");
  const folders = Array.from(drawer.querySelectorAll(".mf-folder"));
  let openId = null;

  // Sheets render lazily — decoding every entry's full-res evidence
  // up front janks the entrance (the WebGL city is already heavy).
  // Only the front folder and opened folders get content.
  function ensureSheet(folder) {
    if (!folder || folder.dataset.rendered) return;
    const entry = clusterEntries.find((e) => e.id === Number(folder.dataset.entryId));
    if (!entry) return;
    folder.dataset.rendered = "1";
    folder.querySelector(".mf-body-scroll").innerHTML = buildFolderSheet(entry);
    loadSocialEmbeds(folder); // instagram / x blockquote placeholders
  }

  // ── Cascade layout: a compact Win98-tight stack in the bottom-RIGHT
  // corner so the focused building stays visible on the left. Newest
  // in front (lowest); each folder behind peeks its edge + tab above
  // the one in front; tabs cycle staggered x slots. ──
  function layoutStack() {
    const N = folders.length;
    const vw = innerWidth;
    const vh = innerHeight;
    const mobile = vw < 700;
    const menuH = mobile ? 40 : 44;
    const sheetW = mobile ? Math.round(vw * 0.94) : Math.min(Math.round(vw * 0.46), 680);
    const mfRight = mobile ? Math.round(vw * 0.03) : 24;
    const frontBand = 112;
    const step = Math.max(22, Math.min(40, Math.round((vh * 0.5 - frontBand) / Math.max(1, N - 1))));
    // Tab grid — pick slot count + uniform tab width together so every tab is
    // the same size and the cycling stagger reads as a clean grid (no jagged
    // content-sized widths colliding across the cascade).
    const tabIdeal = mobile ? 150 : 200;
    const tabGap = 14;
    const innerPad = 18;
    const usable = sheetW - innerPad * 2;
    const slots = Math.max(2, Math.min(4, Math.floor((usable + tabGap) / (tabIdeal + tabGap))));
    const tabW = Math.floor((usable - (slots - 1) * tabGap) / slots);
    const slotSpan = tabW + tabGap;
    drawerInner.style.setProperty("--sheetW", sheetW + "px");
    drawerInner.style.setProperty("--mf-right", mfRight + "px");
    folders.forEach((f, i) => {
      const top = vh - menuH - frontBand - i * step;
      f.style.top = top + "px";
      f.dataset.stackTop = top;
      f.dataset.zBase = N - i;
      if (!f.classList.contains("is-open")) f.style.zIndex = String(N - i);
      f.style.setProperty("--tabX", Math.round(innerPad + (i % slots) * slotSpan) + "px");
      f.style.setProperty("--tabW", tabW + "px");
      f.classList.toggle("is-front", i === 0);
    });
    ensureSheet(folders[0]);
  }
  layoutStack();

  function applyRise(folder) {
    const targetTop = Math.max(56, Math.round(innerHeight * 0.10));
    const rise = Math.max(0, (parseFloat(folder.dataset.stackTop) || 0) - targetTop);
    folder.style.setProperty("--rise", `-${rise}px`);
    folder.style.zIndex = String(folders.length + 10);
  }

  function openFolder(id) {
    if (openId === id) { closeFolder(); return; }
    if (openId !== null) closeFolder(openId, true);
    const folder = drawer.querySelector(`.mf-folder[data-entry-id="${id}"]`);
    if (!folder) return;
    openId = id;
    ensureSheet(folder);
    applyRise(folder);
    folder.classList.add("is-open");
    drawer.classList.add("has-open");
    folders.forEach((f) => { if (f !== folder) f.classList.add("is-receded"); });
    if (!clusterCameraPushed) {
      clusterCameraPushed = true;
      terrain?.makeSpaceForBody?.();
    }
  }

  function closeFolder(id, switching = false) {
    const target = id ?? openId;
    if (target == null) return;
    const f = drawer.querySelector(`.mf-folder[data-entry-id="${target}"]`);
    if (f) {
      f.classList.remove("is-open");
      f.style.setProperty("--rise", "0px");
      f.style.zIndex = f.dataset.zBase || "";
      const scroll = f.querySelector(".mf-body-scroll");
      if (scroll) scroll.scrollTop = 0;
    }
    if (!switching) {
      folders.forEach((fl) => fl.classList.remove("is-receded"));
      drawer.classList.remove("has-open");
      openId = null;
      if (clusterCameraPushed) {
        clusterCameraPushed = false;
        terrain?.restoreCamera?.();
      }
    }
  }

  const onResize = () => {
    if (!drawer.isConnected) {
      window.removeEventListener("resize", onResize);
      return;
    }
    layoutStack();
    if (openId !== null) {
      const f = drawer.querySelector(`.mf-folder[data-entry-id="${openId}"]`);
      if (f) applyRise(f);
    }
  };
  window.addEventListener("resize", onResize);

  // Click anywhere on a closed folder opens it; the tab of an open
  // folder closes it. Content clicks inside an open folder pass through.
  drawerInner.addEventListener("click", (e) => {
    const folder = e.target.closest(".mf-folder");
    if (!folder) return;
    if (folder.classList.contains("is-open")) {
      if (e.target.closest(".mf-tab")) closeFolder();
      return;
    }
    openFolder(Number(folder.dataset.entryId));
  });

  // Evidence lightbox (only inside the open folder). Captions now live in
  // the side notes column, so the lightbox caption comes from alt text.
  drawer.addEventListener("click", (e) => {
    if (!e.target.closest(".mf-folder.is-open")) return;
    const evFig = e.target.closest(".ms-ev--img[data-ev-src]");
    if (evFig) {
      openLightbox(evFig.dataset.evSrc, evFig.querySelector("img")?.alt || "");
    }
  });

  // ── Codex (indrajaal big-type list) ──
  const codexEl = drawer.querySelector(".mf-codex");
  const stage = codexEl.querySelector(".mf-codex-stage");
  let codexActive = false;
  let codexCleanup = null;

  function showCodex() {
    if (codexActive) return;
    codexActive = true;
    codexEl.setAttribute("aria-hidden", "false");
    codexEl.classList.add("is-active");
    drawerInner.classList.add("is-hidden");
    startCodexScroller();
  }
  function hideCodex() {
    if (!codexActive) return;
    codexActive = false;
    codexEl.setAttribute("aria-hidden", "true");
    codexEl.classList.remove("is-active");
    drawerInner.classList.remove("is-hidden");
    if (codexCleanup) { codexCleanup(); codexCleanup = null; }
  }
  function startCodexScroller() {
    if (codexCleanup) codexCleanup();
    const track = codexEl.querySelector(".mf-codex-track");
    const view = codexEl.querySelector(".mf-codex-view");
    if (!track || !view) return;
    let y = 0, ty = 0, vy = 0, dragging = false, lastY = 0, lastT = 0, moved = 0, raf = null;
    const clampT = () => {
      const max = Math.max(0, track.scrollHeight - view.clientHeight);
      ty = Math.max(-max, Math.min(0, ty));
    };
    const tick = () => {
      if (!dragging) { ty += vy; vy *= 0.88; if (Math.abs(vy) < 0.05) vy = 0; clampT(); }
      y += (ty - y) * 0.16;
      if (Math.abs(ty - y) < 0.1) y = ty;
      track.style.transform = `translate3d(0,${y}px,0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onDown = (e) => {
      if (e.target.closest("[data-codex-back],.mf-codex-header")) return;
      dragging = true; vy = 0; lastY = e.clientY; lastT = performance.now(); moved = 0;
    };
    const onMove = (e) => {
      if (dragging) {
        const dy = e.clientY - lastY;
        ty += dy; clampT(); moved += Math.abs(dy);
        const now = performance.now();
        vy = (dy / ((now - lastT) || 16)) * 16;
        lastY = e.clientY; lastT = now;
      }
      // Stage image follows the hovered row — elementFromPoint so it
      // keeps tracking while the list scrolls under a still cursor
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".mf-codex-row");
      const src = row?.querySelector(".mf-codex-row-img")?.dataset.src;
      if (src) {
        if (stage.src !== src) stage.src = src;
        stage.style.left = e.clientX + "px";   // follow the cursor
        stage.style.top = e.clientY + "px";
        stage.classList.add("is-on");
      } else {
        stage.classList.remove("is-on");
      }
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e) => { e.preventDefault(); ty -= e.deltaY * 1.1; vy = 0; clampT(); };
    const onRow = (e) => {
      if (moved > 6) { moved = 0; return; }
      const row = e.target.closest(".mf-codex-row[data-entry-id]");
      if (!row) return;
      hideCodex();
      openFolder(Number(row.dataset.entryId));
    };
    codexEl.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    codexEl.addEventListener("wheel", onWheel, { passive: false });
    track.addEventListener("click", onRow);
    codexCleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      codexEl.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      codexEl.removeEventListener("wheel", onWheel);
      track.removeEventListener("click", onRow);
      stage.classList.remove("is-on");
    };
  }
  drawer.querySelector("[data-codex-btn]")?.addEventListener("click", () => {
    if (codexActive) hideCodex(); else showCodex();
  });
  codexEl.querySelector("[data-codex-back]")?.addEventListener("click", hideCodex);

  state.modalView = "cluster";
  refreshProjectBack();

  els.projectPage.setAttribute("aria-hidden", "false");
  void els.projectPage.offsetHeight;
  document.body.classList.add("project-open");
  requestAnimationFrame(() => {
    els.projectPage.classList.add("visible");
    // Entrance: back folders first, front folder lands last. Writing
    // the custom prop lets the CSS transform transition do the easing.
    const N = folders.length;
    folders.forEach((f, i) => {
      setTimeout(() => f.style.setProperty("--enter", "0px"), 60 + (N - 1 - i) * 30);
    });
  });
}

// Console/test hook: ARCHIVE_APP_DEBUG.openCluster("Label", [ids])
window.ARCHIVE_APP_DEBUG.openCluster = (label, entryIds) =>
  openClusterPage({ label, entryIds });

// ── Gallery State & Functions ──────────────────────────────────
let galleryData = null;
let galleryMotion = null;
let galleryContext = null; // { mode:"photos" } | { mode:"cluster", clusterInfo, items, label }

const noopMotion = { start() {}, stop() {}, hoverItem() {}, hoverRow() {}, leave() {} };
function initGalleryMotion() { return noopMotion; }

async function openGalleryOverlay(config) {
  if (!els.galleryOverlay) return;
  if (!galleryMotion) galleryMotion = initGalleryMotion();
  config = config || { mode: "photos" };
  galleryContext = config;

  const brandText = els.galleryOverlay.querySelector(".gallery-brand-text");
  if (brandText) brandText.textContent = config.label || "TRAVEL & GALLERY";
  const extLinks = els.galleryOverlay.querySelector(".gallery-extlinks");
  if (extLinks) extLinks.style.display = config.mode === "photos" ? "" : "none";

  if (config.mode === "photos") {
    if (!galleryData) {
      try {
        const resp = await fetch("./data/gallery.json");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        galleryData = await resp.json();
        // Clear any previous error state
        els.galleryGridView?.querySelector(".gallery-error")?.remove();
      } catch (err) {
        console.error("Failed to load gallery metadata:", err);
        galleryData = [];
        // Show user-facing error in gallery grid
        const errorDiv = document.createElement("div");
        errorDiv.className = "gallery-error";
        errorDiv.style.cssText = "grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 24px;color:var(--ink-mute);text-align:center";
        errorDiv.innerHTML = `<strong style="font-size:18px;font-weight:600">Couldn't load gallery</strong><span style="font-size:13px;opacity:0.7">The photo archive is temporarily unavailable. Please try again.</span><button type="button" class="textbtn" onclick="this.closest('.gallery-overlay')?.querySelector('.gallery-close')?.click()" style="margin-top:8px;padding:8px 16px;border:1px solid var(--glass-border);border-radius:4px;cursor:pointer">Close</button>`;
        if (els.galleryGridView) {
          els.galleryGridView.innerHTML = "";
          els.galleryGridView.style.display = "flex";
          els.galleryGridView.appendChild(errorDiv);
        }
      }
    }
    renderGallery();
  } else {
    renderGallery(config.items);
  }

  switchGalleryTab("grid");
  initGridCanvas();
  els.galleryOverlay.classList.add("visible");
  els.galleryOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("project-open");
  galleryMotion.start();

  // Graceful cinematic open + staggered header/items reveal. (Transform/opacity
  // rather than clip-path: clip-path tweens are unreliable in this app — see
  // the tweenMatProp note in terrain.js — and could leave the overlay clipped.)
  const gsap = window.gsap;
  if (gsap) {
    gsap.killTweensOf(els.galleryOverlay);
    gsap.set(els.galleryOverlay, { clearProps: "clipPath" });
    const tl = gsap.timeline();
    // Everything animates TRANSFORM ONLY — never opacity. CSS `.visible` owns
    // the overlay's opacity (so a stalled GSAP tween can't leave it see-through
    // or the grid invisible). GSAP opacity is unreliable in this app — see the
    // tweenMatProp note in terrain.js. Worst case now: a few px offset.
    tl.fromTo(els.galleryOverlay, { scale: 1.04 }, { scale: 1, duration: 0.6, ease: "power3.out" });
    tl.from(".gallery-header > *", { y: -18, stagger: 0.06, duration: 0.4, clearProps: "transform" }, "-=0.35");
    const items = els.galleryGridView?.querySelectorAll(".gallery-item");
    if (items?.length) {
      tl.from(Array.from(items).slice(0, 28),
        { y: 28, duration: 0.5, ease: "power3.out", stagger: { amount: 0.5 }, clearProps: "transform" }, "-=0.3");
    }
  }
}

function closeGalleryOverlay() {
  if (!els.galleryOverlay) return;
  if (window.gsap) window.gsap.killTweensOf(els.galleryOverlay);
  els.galleryOverlay.style.transform = "";
  els.galleryOverlay.classList.remove("visible");
  els.galleryOverlay.setAttribute("aria-hidden", "true");
  els.galleryOverlay.classList.remove("codex-active");
  document.body.classList.remove("project-open");
  if (_codexScrollerCleanup) { _codexScrollerCleanup(); _codexScrollerCleanup = null; }
  if (_gridDragCleanup) { _gridDragCleanup(); _gridDragCleanup = null; }
  galleryMotion?.stop();
  galleryContext = null;
  terrain?.resetView();
}

let _codexScrollerCleanup = null;
let codexJustDragged = false;

function switchGalleryTab(tab) {
  document.querySelectorAll("[data-gallery-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.galleryTab === tab);
  });
  if (els.galleryGridView) els.galleryGridView.classList.toggle("active", tab === "grid");
  if (els.galleryCodexView) els.galleryCodexView.classList.toggle("active", tab === "codex");
  els.galleryOverlay?.classList.toggle("codex-active", tab === "codex");
  if (tab === "codex") initCodexScroller();
  else if (_codexScrollerCleanup) { _codexScrollerCleanup(); _codexScrollerCleanup = null; }
}

// Indrajaal-style codex: a custom transform scroller with drag + wheel +
// momentum, looping seamlessly because the rows are rendered twice (translate
// is wrapped by one list-height). Native scroll can't loop, so we drive it.
function initCodexScroller() {
  if (_codexScrollerCleanup) { _codexScrollerCleanup(); _codexScrollerCleanup = null; }
  const view = els.galleryCodexView;
  const track = view?.querySelector(".codex-track");
  const stage = view?.querySelector("#codexStageImg");
  if (!track) return;
  // Smooth-scroll model: input updates targetY; y eases toward it each frame
  // (the lag = indrajaal-style fluidity). Momentum decays targetY after a drag.
  const firstSet = track.querySelector(".codex-set");
  let y = 0, targetY = 0, vy = 0, half = firstSet ? firstSet.offsetHeight : track.scrollHeight / 2;
  let dragging = false, lastY = 0, lastT = 0, moved = 0, raf = null;
  let mx = innerWidth / 2, my = innerHeight / 2, curId = null, rowEls = [];
  const measure = () => { half = firstSet ? firstSet.offsetHeight : track.scrollHeight / 2; rowEls = [...track.querySelectorAll(".codex-row")]; };
  measure();
  // Wrap y AND targetY by the same amount (content is duplicated, so a shift of
  // exactly one list-height is invisible) — keeps the easing delta intact.
  const wrap = () => {
    if (half <= 0) return;
    while (y <= -half) { y += half; targetY += half; }
    while (y > 0) { y -= half; targetY -= half; }
  };
  // Real-time hover: hit-test the row under the cursor every frame, so the
  // active row + centered image update even while the list scrolls beneath a
  // stationary pointer (the previous mouseenter/leave only fired on mouse move).
  const updateHover = () => {
    const hit = document.elementFromPoint(mx, my);
    const row = hit && hit.closest ? hit.closest(".codex-row[data-gallery-id]") : null;
    const id = row ? row.dataset.galleryId : null;
    if (id === curId) return;
    rowEls.forEach((r) => r.classList.remove("is-active"));
    curId = id;
    if (id) {
      rowEls.forEach((r) => { if (r.dataset.galleryId === id) r.classList.add("is-active"); });
      const activeData = galleryContext?.mode === "cluster" ? galleryContext.items : galleryData;
      const item = activeData?.find((x) => x.id === id);
      // Float the preview at the cursor (replaces the fixed centred stage that
      // stayed in one spot regardless of pointer position).
      if (item?.src) galleryMotion?.hoverRow(true, item.src);
      else galleryMotion?.hoverRow(false);
      if (stage) stage.classList.remove("show");
    } else {
      if (stage) stage.classList.remove("show");
      galleryMotion?.hoverRow(false);
    }
  };
  let hoverT = 0;
  const tick = () => {
    if (!dragging) { targetY += vy; vy *= 0.90; if (Math.abs(vy) < 0.05) vy = 0; }
    y += (targetY - y) * 0.16;
    if (Math.abs(targetY - y) < 0.1) y = targetY;
    wrap();
    track.style.transform = `translate3d(0, ${y}px, 0)`;
    // Hit-test ~10fps max (avoid elementFromPoint every frame)
    const now = performance.now();
    if (now - hoverT > 100) { hoverT = now; updateHover(); }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const onMouse = (e) => { mx = e.clientX; my = e.clientY; };
  // No setPointerCapture — it would steal the row's click (artifact won't open).
  const onDown = (e) => { dragging = true; vy = 0; lastY = e.clientY; lastT = performance.now(); moved = 0; };
  const onMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - lastY; targetY += dy; moved += Math.abs(dy);
    const now = performance.now(); const dt = now - lastT || 16;
    vy = (dy / dt) * 16; lastY = e.clientY; lastT = now;
  };
  const onUp = () => {
    if (!dragging) return; dragging = false;
    if (moved > 6) { codexJustDragged = true; setTimeout(() => { codexJustDragged = false; }, 60); }
  };
  const onWheel = (e) => { e.preventDefault(); targetY -= e.deltaY * 1.1; vy = 0; };
  window.addEventListener("mousemove", onMouse);
  view.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  view.addEventListener("wheel", onWheel, { passive: false });
  const reMeasure = setTimeout(measure, 350);
  _codexScrollerCleanup = () => {
    cancelAnimationFrame(raf); clearTimeout(reMeasure);
    window.removeEventListener("mousemove", onMouse);
    view.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    view.removeEventListener("wheel", onWheel);
    if (stage) stage.classList.remove("show");
  };
}

// Free 2D draggable canvas for the GRID (indrajaal homepage). Pans #gridCanvas
// in x + y with eased momentum, clamped to the plane bounds. Wheel pans
// vertically (shift+wheel horizontally). Eased target/lerp = the same silky
// feel as the codex.
let _gridDragCleanup = null;
let gridJustDragged = false;
function initGridCanvas() {
  if (_gridDragCleanup) { _gridDragCleanup(); _gridDragCleanup = null; }
  const vp = els.galleryGridView;
  const canvas = vp?.querySelector(".grid-canvas");
  if (!canvas) return;
  let tx = 0, ty = 0, targetX = 0, targetY = 0, vx = 0, vy = 0;
  let dragging = false, lastX = 0, lastY = 0, lastT = 0, moved = 0, raf = null;
  const bounds = () => {
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const cw = canvas.scrollWidth, ch = canvas.scrollHeight;
    return { minX: Math.min(0, vw - cw), maxX: 0, minY: Math.min(0, vh - ch), maxY: 0 };
  };
  let b = bounds();
  const clampT = () => {
    targetX = Math.max(b.minX, Math.min(b.maxX, targetX));
    targetY = Math.max(b.minY, Math.min(b.maxY, targetY));
  };
  const tick = () => {
    if (!dragging) { targetX += vx; targetY += vy; vx *= 0.9; vy *= 0.9; if (Math.abs(vx) < 0.05) vx = 0; if (Math.abs(vy) < 0.05) vy = 0; clampT(); }
    tx += (targetX - tx) * 0.16; ty += (targetY - ty) * 0.16;
    canvas.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const onDown = (e) => { e.preventDefault(); dragging = true; vx = vy = 0; lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); moved = 0; b = bounds(); };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    targetX += dx; targetY += dy; clampT(); moved += Math.abs(dx) + Math.abs(dy);
    const now = performance.now(); const dt = now - lastT || 16;
    vx = (dx / dt) * 16; vy = (dy / dt) * 16; lastX = e.clientX; lastY = e.clientY; lastT = now;
  };
  const onUp = () => { if (!dragging) return; dragging = false; if (moved > 6) { gridJustDragged = true; setTimeout(() => { gridJustDragged = false; }, 60); } };
  const onWheel = (e) => { e.preventDefault(); b = bounds(); if (e.shiftKey) targetX -= e.deltaY; else { targetY -= e.deltaY; targetX -= e.deltaX; } vx = vy = 0; clampT(); };
  vp.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  vp.addEventListener("wheel", onWheel, { passive: false });
  _gridDragCleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    vp.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    vp.removeEventListener("wheel", onWheel);
  };
}

function renderGallery(items) {
  const data = items || galleryData;
  if (!data) return;
  const isCluster = galleryContext?.mode === "cluster";
  const clusterRef = galleryContext?.clusterInfo || null;

  if (els.galleryGridView) {
    const cols = Math.max(4, Math.round(Math.sqrt(data.length) * 1.15));
    els.galleryGridView.style.setProperty("--grid-cols", cols);
    els.galleryGridView.innerHTML = `<div class="grid-canvas" id="gridCanvas">${data.map((item) => {
      const hasSrc = item.thumb || item.src;
      if (hasSrc) return `
      <div class="gallery-item" data-gallery-id="${item.id}">
        <img src="${hasSrc}" alt="${escapeHtml(item.title)}" loading="lazy">
        <div class="gallery-item-info">
          <h3 class="gallery-item-title">${escapeHtml(item.title)}</h3>
          <span class="gallery-item-meta">${escapeHtml(item.genre || item.timeOfDay || "")}${item.year ? " · " + item.year : ""}</span>
        </div>
      </div>`;
      return `
      <div class="gallery-item gallery-item--placeholder" data-gallery-id="${item.id}" style="--placeholder-color:${item._bucketColor || '#1a1a2a'}">
        <div class="gallery-item-info">
          <h3 class="gallery-item-title">${escapeHtml(item.title)}</h3>
          <span class="gallery-item-meta">${escapeHtml(item.genre || "")}${item.year ? " · " + item.year : ""}</span>
        </div>
      </div>`;
    }).join("")}</div>`;

    els.galleryGridView.querySelectorAll(".gallery-item").forEach((el) => {
      el.addEventListener("click", () => {
        if (gridJustDragged) return;
        const id = el.dataset.galleryId;
        const item = data.find((x) => x.id === id);
        if (!item) return;
        if (isCluster && item._entryId != null) {
          closeGalleryOverlay();
          selectEntry(item._entryId, { zoom: false, skipDelay: true, fromCluster: clusterRef });
        } else {
          openArtifactView(item);
        }
      });
      el.addEventListener("mouseenter", () => galleryMotion?.hoverItem(true));
      el.addEventListener("mouseleave", () => galleryMotion?.hoverItem(false));
    });
  }

  if (els.galleryCodexView) {
    const codexRow = (item) => {
      const loc = item.location && item.location !== "Unknown Location" ? item.location : null;
      const meta = [loc, item.year, item.camera].filter(Boolean).join(" · ");
      return `
      <button type="button" class="codex-row" data-gallery-id="${item.id}">
        <span class="codex-row-title">${escapeHtml(item.genre || item.title || "Frame")}</span>
        <span class="codex-row-meta">${escapeHtml(meta)}</span>
      </button>`;
    };
    const rows = data.map(codexRow).join("");
    els.galleryCodexView.innerHTML = `
      <img class="codex-stage-img" id="codexStageImg" alt="" aria-hidden="true">
      <div class="codex-track"><div class="codex-set">${rows}</div><div class="codex-set">${rows}</div></div>`;

    els.galleryCodexView.querySelectorAll(".codex-row[data-gallery-id]").forEach((el) => {
      const id = el.dataset.galleryId;
      const item = data.find((x) => x.id === id);
      el.addEventListener("click", () => {
        if (codexJustDragged || !item) return;
        if (isCluster && item._entryId != null) {
          closeGalleryOverlay();
          selectEntry(item._entryId, { zoom: false, skipDelay: true, fromCluster: clusterRef });
        } else {
          openArtifactView(item);
        }
      });
    });
  }
}

function openArtifactView(item) {
  if (!els.galleryArtifact || !els.artifactContainer) return;

  const externalLinkHtml = item.externalUrl 
    ? `<div class="artifact-metadata-row">
        <span class="artifact-meta-label">External Gallery</span>
        <span class="artifact-meta-val">
          <a href="${escapeHtml(item.externalUrl)}" target="_blank" rel="noopener" style="color: #C5E03A; text-decoration: underline;">
            View on ${item.externalUrl.includes("flickr") ? "Flickr" : "500px"}
          </a>
        </span>
       </div>`
    : "";

  const metaRow = (label, val) => val
    ? `<div class="artifact-metadata-row"><span class="artifact-meta-label">${label}</span><span class="artifact-meta-val">${escapeHtml(String(val))}</span></div>`
    : "";
  const geo = item.coordinates && item.coordinates !== "N/A" ? item.coordinates : null;

  // Centered hero (indrajaal-style): title left, image centered over an ambient
  // blurred backdrop, story + technical metadata right.
  els.artifactContainer.innerHTML = `
    <div class="artifact-bg" style="background-image:url('${item.src}')"></div>
    <div class="artifact-stage">
      <aside class="artifact-left">
        <h2 class="artifact-title">${escapeHtml(item.title)}</h2>
        <div class="artifact-origin">
          ${metaRow("When", item.date || item.year)}
          ${metaRow("Light", item.timeOfDay && item.timeOfDay !== "Untimed" ? item.timeOfDay : null)}
          ${metaRow("Location", item.location && item.location !== "Unknown Location" ? item.location : null)}
          ${geo ? metaRow("Coordinates", geo) : ""}
        </div>
      </aside>

      <figure class="artifact-hero">
        <img src="${item.src}" alt="${escapeHtml(item.title)}">
      </figure>

      <aside class="artifact-right">
        <p class="artifact-story">${escapeHtml(item.story || "")}</p>
        <div class="artifact-metadata-grid">
          ${metaRow("Camera", item.camera)}
          ${metaRow("Lens", item.lens)}
          ${metaRow("Exposure", item.exif)}
          ${externalLinkHtml}
        </div>
      </aside>
    </div>
  `;

  els.galleryArtifact.classList.add("visible");
  els.galleryArtifact.setAttribute("aria-hidden", "false");
  galleryMotion?.hoverRow(false); // clear any lingering codex hover preview
  galleryMotion?.start();          // custom cursor works over the artifact too

  setupArtifactCinematics();
}

// Reusable artifact-style cinematics for ANY container with the .artifact-stage
// / .artifact-hero structure (gallery photo OR project detail). Entrance reveal
// + ambient Ken Burns on the hero <img> (skipped for a text "plate") + cursor
// 3D tilt under the stage's CSS perspective. Returns a teardown function. All
// queries are scoped to `root` so two artifacts never animate each other.
function init3DPlane(root) {
  const gsap = window.gsap;
  if (!root) return () => {};
  const media = root.querySelector(".artifact-hero");
  const stage = root.querySelector(".artifact-stage") || media;
  const img = root.querySelector(".artifact-hero img");
  if (!gsap || !media) return () => {};

  const left = root.querySelector(".artifact-left");
  const right = root.querySelector(".artifact-right");
  const reveals = root.querySelectorAll(
    ".artifact-title, .artifact-origin, .artifact-story, .artifact-metadata-row, .artifact-tags, .artifact-extra");

  // Entrance — transform only (CSS `.visible` owns opacity; a stalled opacity
  // tween could otherwise strand the view see-through).
  gsap.killTweensOf([media, left, right].filter(Boolean));
  const tl = gsap.timeline();
  tl.fromTo(media, { scale: 1.06 }, { scale: 1, duration: 0.8, ease: "power3.out" }, 0);
  if (left)  tl.from(left,  { x: -40, duration: 0.7, ease: "power4.out", clearProps: "transform" }, 0.05);
  if (right) tl.from(right, { x: 40, duration: 0.7, ease: "power4.out", clearProps: "transform" }, 0.05);
  if (reveals.length) tl.from(reveals, { y: 22, stagger: 0.05, duration: 0.45, ease: "power3.out", clearProps: "transform" }, "-=0.4");

  // Ambient Ken Burns — subtle breathing zoom (only when there's a real image
  // and the user hasn't asked the OS to reduce motion).
  const ken = (img && !PREFERS_REDUCED_MOTION) ? gsap.fromTo(img, { scale: 1.0 }, {
    scale: 1.045, duration: 16, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.6,
  }) : null;

  // Interactive 3D tilt — rotate the FIGURE under the stage perspective so the
  // whole framed plane + shadow swing toward the cursor (indrajaal).
  const MAX_TILT = 11; // degrees at the edge
  const rotY = gsap.quickTo(media, "rotationY", { duration: 0.7, ease: "power3.out" });
  const rotX = gsap.quickTo(media, "rotationX", { duration: 0.7, ease: "power3.out" });
  const liftZ = gsap.quickTo(media, "z", { duration: 0.7, ease: "power3.out" });
  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
    const ny = (e.clientY - r.top) / r.height - 0.5;
    rotY(nx * MAX_TILT * 2);                            // left/right swing
    rotX(-ny * MAX_TILT * 2);                           // up/down swing
    liftZ(40);                                          // float toward viewer
  };
  const onLeave = () => { rotY(0); rotX(0); liftZ(0); };
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);

  return () => {
    ken?.kill();
    gsap.set(media, { clearProps: "rotationX,rotationY,z" });
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerleave", onLeave);
  };
}

// Gallery photo artifact uses the shared plane engine on its own container.
let _artifactFx = null;
function setupArtifactCinematics() {
  if (_artifactFx) { _artifactFx(); _artifactFx = null; }
  _artifactFx = init3DPlane(els.artifactContainer);
}

function closeArtifactView() {
  if (!els.galleryArtifact) return;
  if (_artifactFx) { _artifactFx(); _artifactFx = null; }
  // CSS-driven close (see closeGalleryOverlay) — removing `.visible` fades it
  // out reliably; no GSAP opacity tween that could stall and strand the view.
  if (window.gsap) window.gsap.killTweensOf(els.galleryArtifact);
  els.galleryArtifact.style.opacity = "";
  els.galleryArtifact.classList.remove("visible", "entry-sheet");
  els.galleryArtifact.setAttribute("aria-hidden", "true");
  // If the gallery overlay is gone too, retire the custom cursor.
  if (!els.galleryOverlay?.classList.contains("visible")) galleryMotion?.stop();
}

// Map ONE evidence item → a hero/thumb slot. The single source of truth for
// how each evidence type renders in the artifact view, so NO type is silently
// dropped (the long-standing bug: only image/video/youtube/pdf were handled,
// so behance/instagram/x/link evidence vanished from the full-page view).
// Returns { kind, thumbSrc, hero, bg, glyph } or null when there's nothing to show.
function evidenceToSlot(m, entry) {
  if (!m) return null;
  const cap = escapeHtml(m.caption || entry?.title || "");
  if (m.type === "image" && m.src) {
    return { kind: "image", thumbSrc: m.src, bg: m.src,
      hero: `<img src="${escapeHtml(m.src)}" alt="${cap}" loading="lazy">` };
  }
  if (m.type === "video" && m.src) {
    return { kind: "video", thumbSrc: m.src, bg: null, glyph: "▶",
      hero: `<video src="${escapeHtml(m.src)}" autoplay muted loop playsinline controls></video>` };
  }
  if (m.type === "youtube" && m.url) {
    const id = extractYouTubeId(m.url);
    if (id) return { kind: "youtube", thumbSrc: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, bg: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      hero: `<iframe src="https://www.youtube.com/embed/${id}?mute=1&rel=0" title="${cap}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>` };
    // No YouTube id (e.g. a Drive link mislabeled "youtube") → fall through to
    // the Drive/generic handling below instead of dropping the item.
  }
  if ((m.type === "pdf" || (m.src && /\.pdf($|\?)/i.test(m.src))) && m.src) {
    return { kind: "pdf", thumbSrc: m.src, bg: null, glyph: "PDF",
      hero: `<iframe src="${escapeHtml(m.src)}#view=FitH&toolbar=0" title="${escapeHtml(m.caption || entry?.title || "PDF")}" loading="lazy" class="ev-pdf-frame"></iframe>` };
  }
  if (m.type === "behance" && m.url) {
    const id = extractBehanceId(m.url);
    if (id) return { kind: "behance", thumbSrc: null, bg: null, glyph: "Bē",
      hero: `<iframe src="https://www.behance.net/embed/project/${id}?ilo0=1" title="${cap || "Behance project"}" allowfullscreen loading="lazy" class="ev-behance-frame"></iframe>` };
  }
  if (m.type === "instagram" && m.url && extractInstagramPath(m.url)) {
    return { kind: "instagram", thumbSrc: null, bg: null, glyph: "IG",
      hero: `<blockquote class="ev-embed-placeholder" data-embed-type="instagram" data-embed-url="${escapeHtml(m.url)}"><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View post on Instagram</a></blockquote>` };
  }
  if (m.type === "x" && m.url && extractXPostPath(m.url)) {
    return { kind: "x", thumbSrc: null, bg: null, glyph: "𝕏",
      hero: `<blockquote class="ev-embed-placeholder" data-embed-type="x" data-embed-url="${escapeHtml(m.url)}"><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View post on X</a></blockquote>` };
  }
  // Drive videos + any remaining URL → embed / clean link card.
  if (m.url) {
    const driveId = extractGoogleDriveId(m.url);
    if (driveId) return { kind: "drive", thumbSrc: null, bg: null, glyph: "▶",
      hero: `<iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${cap || "Google Drive"}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>` };
    return { kind: "link", thumbSrc: null, bg: null, glyph: "↗", hero: renderLinkCard(m) };
  }
  return null;
}

// An entry's primary theme pill (colour + glyph + label) for the editorial
// feature header. Falls back to a neutral Life-ish pill when unthemed.
function getEntryThemePill(entry) {
  const keys = getEntryThemes(entry);
  for (const pill of ROLE_PILLS) if (keys.has(pill.key)) return pill;
  return { key: "Life", label: entry.eraName || "Archive", icon: "○", color: "#C8923B", ink: "#1A1714" };
}

// 3D "stickle" sticker icons (icons8 CDN) used as the editorial-feature rebus
// graphic — a picture-for-a-word stand-in themed to each entry. Catalog scraped
// to data/icons8_stickle.json; any id serves as a PNG via the ?id= CDN form.
const STICKLE = {
  trophy: "sZgnoSRZgOsZ", aiDashboard: "IX6T33VmzOFZ", designTools: "7WmqLlsozGBw",
  diagramTools: "gvQEVycoJDOM", robot: "WC0vQTAiqiCy", notebookAi: "oygLWT4wpiyn",
  stackPapers: "yt7o2dIs5IcB", memoPad: "SxACkOfB1em7", document: "HsYLoBQ51aE7",
  journal: "nEEU4ZXou1qX", megaphone: "xgzolxyag2dH", suitcase: "vbesnbH8cDHa",
  boxFolders: "8uxcDrRXiu7F", folderAi: "taV1WOm43xYR", oldComputer: "szA4KC9AQEFA",
  retroComputer: "P0xOYQhMll76", ipod: "tGf4SoKxEg3F", headphones: "ZOp90goIfael",
  skateboard: "2k10ALuc4Jyl", apple: "Ddqn4By1wSqN", cherry: "Cx2VthSMozMi",
  banana: "3mRzBtKhYE0y", soda: "HmxnCdOkooNv", smartphone: "gqcL8tR6on6Q",
  chatgptCrown: "5ZwMh4j8y0vr", browserChart: "YnEoJQ1TJfoP", clover: "517SqvLCHk5s",
  chartsBox: "9h49JhJE6eQg", analyticsBox: "xVtNEBhqZRf5", handUp: "uYi0QpODTeQu",
  stylus: "b7EmZGsKGmMa", pencilPyramid: "IOOnPMKzxzI8", folderSearch: "si97Y20Dacut",
  calendar: "OyizcpjdbiZu", instagram: "wjjLUEjPVg9w", laptopMock: "Hx1G9fwMM9Ro",
  suitcaseSun: "7wKa6EW5Qu1k",
};
const stickleUrl = (id, size = 480) => `https://img.icons8.com/?id=${id}&format=png&size=${size}`;

// Per-theme fallback sticker (used when an entry's roles don't map directly).
const THEME_STICKLE = {
  MovingImages: STICKLE.laptopMock, VisualSystems: STICKLE.designTools,
  CompCulture: STICKLE.aiDashboard, DocResearch: STICKLE.folderSearch,
  LeadershipEdu: STICKLE.suitcase, Life: STICKLE.apple,
};

// ROLE → sticker id. The authoritative mapping: each individual role (the same
// role names SPATIAL_FILTERS buckets) gets its own 3D sticker, so the rebus and
// the file-card icons read the actual role, and a multi-role entry fans several.
const ROLE_STICKLE = {
  "Cinematographer": STICKLE.laptopMock, "DOP": STICKLE.laptopMock,
  "Director": STICKLE.megaphone, "Editor": STICKLE.laptopMock, "Filmmaker": STICKLE.laptopMock,
  "Photographer": STICKLE.smartphone, "Unit Still Photographer": STICKLE.smartphone,
  "Wedding Photographer": STICKLE.smartphone,
  "Art Director": STICKLE.stylus, "Producer": STICKLE.suitcase, "Animator": STICKLE.robot,
  "Designer": STICKLE.designTools, "Visual Designer": STICKLE.designTools,
  "GenAI Expert": STICKLE.chatgptCrown, "Blockchain Expert": STICKLE.robot,
  "Tech contractor": STICKLE.browserChart, "Engineer": STICKLE.browserChart,
  "Researcher": STICKLE.folderSearch, "Research Associate": STICKLE.folderSearch,
  "Promotor": STICKLE.megaphone, "Consultant": STICKLE.analyticsBox,
  "Co-founder": STICKLE.suitcase, "Founder": STICKLE.suitcase,
  "Visiting Faculty": STICKLE.memoPad, "Guest Lecturer": STICKLE.memoPad,
  "Student": STICKLE.notebookAi, "Aspirant": STICKLE.notebookAi,
  "Volunteer": STICKLE.handUp, "VP Communications": STICKLE.megaphone,
  "Team Lead Design": STICKLE.stylus, "Life": STICKLE.apple,
};

// The distinct sticker ids for an entry's role(s) — role-first, theme fallback,
// neutral default. Order preserves entry.roles[] so the primary role leads.
function entryStickleIds(entry) {
  const roles = (entry.roles && entry.roles.length) ? entry.roles : (entry.role ? [entry.role] : []);
  const ids = [];
  for (const r of roles) {
    const id = ROLE_STICKLE[r];
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (!ids.length) {
    const id = THEME_STICKLE[getEntryThemePill(entry).key];
    if (id) ids.push(id);
  }
  return ids.length ? ids : [STICKLE.boxFolders];
}

// Distinct stickers across all of a client/folder's entries (for the folder
// card when there's no client logo) — the roles that client engaged.
function clientStickleIds(list) {
  const ids = [];
  for (const e of (list || [])) for (const id of entryStickleIds(e)) if (!ids.includes(id)) ids.push(id);
  return ids.slice(0, 3);
}

// Render up to 3 stickers fanned like a hand of cards (multi-role → a stack).
// Each item carries inline --rot/--tx/--ty so one CSS rule lays out any count.
function renderStickleFan(ids, { size = 360, extraClass = "" } = {}) {
  const list = (ids || []).slice(0, 3);
  if (!list.length) return "";
  const n = list.length;
  const items = list.map((id, i) => {
    const s = n > 1 ? i - (n - 1) / 2 : 0;           // spread −..0..+
    const rot = (s * 13).toFixed(1), tx = (s * 18).toFixed(0), ty = (Math.abs(s) * 7).toFixed(0);
    return `<img class="stickle-item" style="--rot:${rot}deg;--tx:${tx}px;--ty:${ty}px;z-index:${10 - Math.round(Math.abs(s))}" src="${stickleUrl(id, size)}" alt="" loading="lazy" onerror="this.remove()">`;
  }).join("");
  return `<span class="stickle-fan ${extraClass}" data-n="${n}">${items}</span>`;
}

// Back-compat single-icon picker (rebus primary role). Role-driven now.
function pickStickleIcon(entry) { return entryStickleIds(entry)[0]; }

// ── Editorial feature page (text-heavy, evidence-light entries) ───────
// Entries with 0–1 evidence items read as a magazine feature, not a bare
// quote: display headline, drop-cap lede, body column, a themed 3D "stickle"
// sticker icon (icons8) floating over a faint year numeral as the "rebus"
// graphic anchor, the single evidence woven inline, and a provenance margin
// rail. Anything with 2+ media keeps the image-led hero+thumb gallery.
function buildEditorialFeatureHTML(entry) {
  const pill = getEntryThemePill(entry);
  const role = entry.role || (entry.roles && entry.roles[0]) || "Project";
  const dateStr = entry.date || [entry.month, entry.year].filter(Boolean).join("/") || (entry.year ? String(entry.year) : "");
  const story = (entry.description || "").trim();

  // Split the description: first sentence becomes a drop-cap lede, the rest a
  // body column. A long body also surfaces a pulled sentence as a display quote.
  const sentences = story.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).filter(Boolean);
  const lede = sentences[0] || story;
  const bodyParts = sentences.slice(1);
  const body = bodyParts.join(" ");
  const dropCap = (lede.match(/[A-Za-z0-9]/) || [""])[0];
  const ledeRest = dropCap ? lede.replace(dropCap, "") : lede;
  // Pull the longest remaining sentence as a magazine pull-quote (only when the
  // body is substantial enough that a repeated highlight reads as intentional).
  let pullQuote = "";
  if (body.length > 180 && bodyParts.length > 1) {
    pullQuote = bodyParts.slice().sort((a, b) => b.length - a.length)[0] || "";
    if (pullQuote.length < 40 || pullQuote.length > 170) pullQuote = "";
  }

  // The single evidence item (if any) → an inline figure.
  const firstEv = (Array.isArray(entry.evidence) ? entry.evidence : [])[0];
  const slot = firstEv ? evidenceToSlot(firstEv, entry) : null;
  const inlineFigure = slot
    ? `<figure class="feature-figure feature-figure--${slot.kind}">
         ${slot.hero}
         ${firstEv.caption ? `<figcaption>${escapeHtml(firstEv.caption)}</figcaption>` : ""}
       </figure>`
    : "";

  const logoSticker = getClientLogoSticker(entry.org || entry.clientCanonical);
  const tags = [...new Set([...(entry.tags || []), ...(entry.roleTags || [])])].slice(0, 8);
  const fact = (l, v) => v
    ? `<div class="feature-fact"><dt>${escapeHtml(l)}</dt><dd>${escapeHtml(String(v))}</dd></div>`
    : "";
  const provenance = [entry.evidenceSource, entry.evidenceDetail].filter(Boolean).join(" — ");

  return `<div class="artifact-stage artifact-stage--feature" style="--feat-accent:${pill.color}; --feat-ink:${pill.ink || "#1A1714"}">
    <article class="feature">
      <div class="feature-rebus" aria-hidden="true">
        ${entry.year ? `<span class="feature-rebus-year">${escapeHtml(String(entry.year))}</span>` : ""}
        ${renderStickleFan(entryStickleIds(entry), { size: 480, extraClass: "feature-rebus-fan" })}
      </div>
      <header class="feature-head">
        <div class="feature-kicker">
          <span class="feature-glyph" aria-hidden="true">${pill.icon || "○"}</span>
          <span>${escapeHtml([pill.label, dateStr].filter(Boolean).join("  ·  "))}</span>
        </div>
        <h1 class="feature-title">${escapeHtml(entry.title || "Untitled")}</h1>
        <p class="feature-byline">${escapeHtml([role, entry.org || entry.clientCanonical, entry.location].filter(Boolean).join(", "))}</p>
      </header>
      <div class="feature-grid">
        <div class="feature-column">
          <p class="feature-lede">${dropCap ? `<span class="feature-dropcap">${escapeHtml(dropCap)}</span>` : ""}${escapeHtml(ledeRest)}</p>
          ${inlineFigure}
          ${body ? `<p class="feature-body">${escapeHtml(body)}</p>` : ""}
          ${pullQuote ? `<blockquote class="feature-pull">${escapeHtml(pullQuote)}</blockquote>` : ""}
          ${entry.notes ? `<p class="feature-note">${escapeHtml(entry.notes)}</p>` : ""}
        </div>
        <aside class="feature-margin">
          <dl class="feature-facts">
            ${fact("When", dateStr)}
            ${fact("Role", role)}
            ${fact("Org / Client", entry.org || entry.clientCanonical)}
            ${fact("Location", entry.location)}
            ${fact("Era", entry.eraName)}
          </dl>
          ${tags.length ? `<div class="feature-tags">${tags.map((t) => `<span class="feature-tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
          ${logoSticker ? `<img src="${escapeHtml(logoSticker)}" alt="" class="feature-logo" onerror="this.remove()">` : ""}
          ${provenance ? `<p class="feature-provenance"><span>Evidence</span>${escapeHtml(provenance)}</p>` : ""}
        </aside>
      </div>
    </article>
  </div>`;
}

// ── Full-screen single-entry artifact view (app-wide "expand") ────────
// The canonical full-screen single-page look — same as the gallery photo
// artifact: ambient backdrop + centred hero + metadata rail. ANY ledger
// entry opens into it via the app-wide expand affordance. It renders into
// the shared `.gallery-artifact` overlay (z-index 110), which sits ABOVE
// the project-page (60) and nav-page (55), so closing it simply reveals
// whatever the user expanded from — back-wiring is automatic via stacking.
function buildEntryArtifactHTML(entry) {
  // Contact + GenAI toolstack are special "directory" entries: a centred card of
  // icon + hyperlink rows reads far better than the artifact's media-hero layout
  // (which would otherwise dump the raw link/tool text into a prose column).
  if (isContactEntry(entry)) {
    return `<div class="artifact-stage artifact-stage--directory">
      <section class="directory-card">
        <h2 class="directory-title">Get in touch</h2>
        <p class="directory-lede">One operator, a studio's range. Reach me directly.</p>
        ${renderContactBlock(entry)}
      </section>
    </div>`;
  }
  if (isToolstackEntry(entry)) {
    const tools = renderToolstackBlock(entry);
    if (tools) return `<div class="artifact-stage artifact-stage--directory">
      <section class="directory-card directory-card--wide">
        <h2 class="directory-title">${escapeHtml(entry.title || "Generative AI Toolstack")}</h2>
        <p class="directory-lede">Current and hands-on across the production GenAI stack.</p>
        ${tools}
      </section>
    </div>`;
  }
  // Evidence-light entries (0–1 media) read as an editorial feature instead of
  // the image-led hero. Scoped by COUNT so a single behance/instagram entry
  // still gets its evidence woven inline (no type is dropped).
  if ((Array.isArray(entry.evidence) ? entry.evidence : []).length <= 1) {
    return buildEditorialFeatureHTML(entry);
  }
  const role = entry.role || (entry.roles && entry.roles[0]) || "Project";
  const metaRow = (l, v) => v
    ? `<div class="artifact-metadata-row"><span class="artifact-meta-label">${escapeHtml(l)}</span><span class="artifact-meta-val">${escapeHtml(String(v))}</span></div>`
    : "";
  const dateStr = entry.date || [entry.month, entry.year].filter(Boolean).join("/") || entry.year || "";
  const logoSticker = getClientLogoSticker(entry.org || entry.clientCanonical);
  const logoHTML = logoSticker 
    ? `<div style="margin-top:14px;"><img src="${escapeHtml(logoSticker)}" alt="" class="artifact-logo-sticker" style="height:24px;max-width:100%;object-fit:contain;filter:drop-shadow(0 0 0 2px #ffffff) drop-shadow(0 0 0 3px #1a1714);"></div>`
    : "";
  const tags = [...new Set([...(entry.tags || []), ...(entry.roleTags || [])])].slice(0, 8).join("   ·   ");
  const story = (entry.description || "").trim();

  // ── Hero + thumbs across ALL evidence types ───────────────────────
  // Build a unified slot list so videos/YouTube show alongside images;
  // each thumb carries the full hero markup it should swap to.
  const slots = (Array.isArray(entry.evidence) ? entry.evidence : [])
    .map((m) => evidenceToSlot(m, entry))
    .filter(Boolean);

  // Text-only entries → the DESCRIPTION becomes the hero: large display
  // typography, no two-letter plate, no metadata column duplication.
  const isProse = slots.length === 0 && story.length > 0;
  // Prefer a visual slot for the hero so a leading PDF/doc/embed doesn't become
  // the centrepiece. Broken-image recovery (a leading image whose file 404s) is
  // handled by the global error handler.
  const heroIdx = (() => {
    for (const k of ["image", "youtube", "video", "behance", "drive"]) {
      const i = slots.findIndex((s) => s.kind === k);
      if (i >= 0) return i;
    }
    return slots.length ? 0 : -1;
  })();
  const heroSlot = heroIdx >= 0 ? slots[heroIdx] : null;
  const heroInner = heroSlot?.hero
    || (isProse
      ? `<blockquote class="artifact-prose">${escapeHtml(story)}</blockquote>`
      : `<div class="fx-plate">${escapeHtml((entry.title || "·").trim().slice(0, 2).toUpperCase())}</div>`);
  const heroClass = isProse ? "artifact-hero artifact-hero--prose" : "artifact-hero";
  const heroHTML = `<figure class="${heroClass}">${heroInner}</figure>`;
  const bgSrc = heroSlot?.bg || (heroSlot?.kind === "image" ? heroSlot.thumbSrc : evidencePreviewSrc(entry));

  const thumbs = slots.length > 1
    ? `<div class="artifact-thumbs">${slots.slice(0, 10).map((s, i) => `
        <button type="button" class="artifact-thumb artifact-thumb--${s.kind} ${i === heroIdx ? "is-active" : ""}"
                data-thumb-hero="${escapeHtml(s.hero)}"
                ${s.bg ? `data-thumb-bg="${escapeHtml(s.bg)}"` : ""}>
          ${(s.kind === "image" || s.kind === "youtube") && s.thumbSrc
            ? `<img src="${escapeHtml(s.thumbSrc)}" alt="" loading="lazy">`
            : `<span class="artifact-thumb-glyph" aria-hidden="true">${escapeHtml(s.glyph || "▶")}</span>`}
        </button>`).join("")}</div>`
    : "";

  // Right column story: hide when prose hero already shows it.
  const rightStory = isProse ? "" : `<p class="artifact-story">${escapeHtml(story)}</p>`;
  return `
    ${bgSrc ? `<div class="artifact-bg" style="background-image:url('${escapeHtml(bgSrc)}')"></div>` : ""}
    <div class="artifact-stage">
      <aside class="artifact-left">
        <h2 class="artifact-title">${escapeHtml(entry.title || "Untitled")}</h2>
        <div class="artifact-origin">
          ${metaRow("When", dateStr)}
          ${metaRow("Org / Client", entry.org || entry.clientCanonical)}
          ${metaRow("Location", entry.location)}
          ${logoHTML}
        </div>
      </aside>
      ${heroHTML}
      <aside class="artifact-right">
        ${rightStory}
        <div class="artifact-metadata-grid">
          ${metaRow("Role", role)}
          ${metaRow("Tags", tags)}
        </div>
        ${thumbs}
      </aside>
    </div>`;
}

// Shared thumb-strip handler — swaps both the centred hero (image/video/embed
// markup, lifted from data-thumb-hero) and the ambient backdrop. Reused by
// openEntryArtifact AND the folio explorer's single view so they never drift.
function wireArtifactThumbs(root) {
  if (!root) return;
  const fig = root.querySelector(".artifact-hero");
  const bg = root.querySelector(".artifact-bg");
  root.querySelectorAll(".artifact-thumb[data-thumb-hero]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const html = btn.dataset.thumbHero;
      const bgSrc = btn.dataset.thumbBg;
      if (fig && html) {
        fig.innerHTML = html;
        // Instagram/X heroes are placeholder blockquotes — activate them.
        if (html.includes("ev-embed-placeholder")) loadSocialEmbeds(fig);
      }
      if (bg && bgSrc) bg.style.backgroundImage = `url('${bgSrc}')`;
      root.querySelectorAll(".artifact-thumb").forEach((t) => t.classList.toggle("is-active", t === btn));
    });
  });
}

function openEntryArtifact(entry) {
  if (!els.galleryArtifact || !els.artifactContainer || !entry) return;
  // Indrajaal single-page look — same as the photo gallery's artifact view:
  // ambient blurred backdrop, centred hero, title + metadata in side rails.
  // This is the canonical full-screen single-page across the app (manila
  // folder expand → here too), so every "view one thing" surface reads the
  // same way.
  els.galleryArtifact.classList.remove("entry-sheet");
  els.galleryArtifact.style.removeProperty("--fill");
  els.galleryArtifact.style.removeProperty("--ink");
  els.artifactContainer.innerHTML = buildEntryArtifactHTML(entry);
  wireArtifactThumbs(els.artifactContainer);
  // Activate any Instagram/X embeds (artifact hero or editorial inline figure).
  loadSocialEmbeds(els.artifactContainer);
  // Back arrow returns to whatever is open underneath (project/nav page).
  els.artifactClose?.setAttribute("aria-label", "Back");
  els.galleryArtifact.classList.add("visible");
  els.galleryArtifact.setAttribute("aria-hidden", "false");
  setupArtifactCinematics();
}

// First previewable still for an entry's evidence — used by all LIST views so
// non-image evidence (YouTube, video posters) still shows a preview, not blank.
function evidencePreviewSrc(entry) {
  const ev = (entry && entry.evidence) || [];
  const img = ev.find((m) => m.type === "image" && m.src);
  if (img) return img.src;
  const yt = ev.find((m) => m.type === "youtube" && m.url);
  if (yt) { const id = extractYouTubeId(yt.url); if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`; }
  const vid = ev.find((m) => m.type === "video" && (m.poster || m.thumb));
  if (vid) return vid.poster || vid.thumb;
  const anySrc = ev.find((m) => m.src);
  return anySrc ? anySrc.src : "";
}

// Point the persistent modal back button at the right destination:
// an entry reached from a cluster → back to that cluster's list; otherwise
// (cluster list itself, or a directly-opened entry) → back to the archive.
function refreshProjectBack() {
  // The close control doubles as a back button: when viewing an entry that was
  // opened from a cluster, the × becomes ← (first press → cluster list, second
  // press → exit). Everywhere else it's a plain ×.
  if (!els.projectPageClose) return;
  const backToCluster = state.modalView === "entry" && state.clusterContext;
  els.projectPageClose.textContent = backToCluster ? "←" : "×";
  els.projectPageClose.setAttribute(
    "aria-label",
    backToCluster ? `Back to ${state.clusterContext.label}` : "Close project",
  );
}

function closeProjectPage() {
  leaveProjectArtifactMode();
  if (clusterCameraPushed) {
    clusterCameraPushed = false;
    terrain?.restoreCamera?.();
  }
  if (els.projectPage) {
    els.projectPage.classList.remove("visible");
    els.projectPage.setAttribute("aria-hidden", "true");
    document.body.classList.remove("project-open");
  }
  state.clusterContext = null;
  state.modalView = null;
  state.editingEntryId = null;
  // If we came from a nav page (Roles/Clients), return to it
  if (state.editOriginNavView) {
    const returnView = state.editOriginNavView;
    state.editOriginNavView = null;
    openNavPage(returnView);
  }
}

// ─── Lightbox for evidence images ────────────────────────────────
function openLightbox(src, caption) {
  // Remove any existing lightbox
  document.querySelector(".ev-lightbox")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "ev-lightbox";
  overlay.innerHTML = `
    <div class="ev-lightbox-backdrop"></div>
    <div class="ev-lightbox-content">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}">
      ${caption ? `<p class="ev-lightbox-caption">${escapeHtml(caption)}</p>` : ""}
    </div>
    <button class="ev-lightbox-close" type="button" aria-label="Close">×</button>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.classList.contains("ev-lightbox-backdrop") || e.target.classList.contains("ev-lightbox-close")) {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

// ─── Pass 04: editor view + media + save ─────────────────────────

function renderEvidenceReadOnly(entry) {
  const media = Array.isArray(entry.evidence) ? entry.evidence : [];
  if (!media.length) return "";

  const imageCount = media.filter((m) => m.type === "image").length;
  let imgIdx = 0;

  const items = media.map((m, idx) => {
    if (m.type === "image" && m.src) {
      const bentoSize = bentoImageSize(imgIdx, imageCount);
      const lazy = imgIdx > 0 ? ' loading="lazy"' : '';
      imgIdx++;
      return `<figure class="ev-figure ev-figure--clickable ${bentoSize}" data-ev-idx="${idx}" data-ev-src="${escapeHtml(m.src)}">
        <img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.caption || "")}"${lazy} style="background:#1a1714">
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    if (m.type === "video" && m.src) {
      return `<figure class="ev-figure bento-wide">
        <video src="${escapeHtml(m.src)}" autoplay muted loop playsinline controls preload="metadata"></video>
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    if (m.type === "pdf" && m.src) {
      return `<figure class="ev-figure ev-figure--pdf bento-tall">
        <iframe src="${escapeHtml(m.src)}" title="${escapeHtml(m.caption || "PDF document")}"></iframe>
        <figcaption>
          ${m.caption ? escapeHtml(m.caption) + " · " : ""}<a href="${escapeHtml(m.src)}" target="_blank" rel="noopener">Open PDF</a>
        </figcaption>
      </figure>`;
    }
    if ((m.type === "youtube" || m.type === "behance") && m.url) {
      const behanceId = extractBehanceId(m.url);
      if (behanceId) {
        return `<figure class="ev-figure ev-figure--behance bento-tall">
          <iframe src="https://www.behance.net/embed/project/${behanceId}?ilo0=1" title="${escapeHtml(m.caption || "Behance project")}" allowfullscreen loading="lazy"></iframe>
          <figcaption>
            ${m.caption ? escapeHtml(m.caption) + " · " : ""}<a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View on Behance</a>
          </figcaption>
        </figure>`;
      }
      const driveId = extractGoogleDriveId(m.url);
      if (driveId) {
        return `<figure class="ev-figure bento-wide">
          <iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${escapeHtml(m.caption || "Google Drive video")}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>
          ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
        </figure>`;
      }
      const rendered = tryRenderGenericUrl(m);
      if (rendered) return rendered;
      const id = extractYouTubeId(m.url);
      if (!id) return renderLinkCard(m);
      return `<figure class="ev-figure bento-wide">
        <iframe src="https://www.youtube.com/embed/${id}" title="${escapeHtml(m.caption || "YouTube")}" allowfullscreen loading="lazy"></iframe>
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    if (m.type === "x" && m.url) {
      const tweetPath = extractXPostPath(m.url);
      if (!tweetPath) return `<a class="ev-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${escapeHtml(m.url)}</a>`;
      return `<figure class="ev-figure ev-figure--embed bento-single">
        <blockquote class="ev-embed-placeholder" data-embed-type="x" data-embed-url="${escapeHtml(m.url)}">
          <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View post on X</a>
        </blockquote>
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    if (m.type === "instagram" && m.url) {
      const igPath = extractInstagramPath(m.url);
      if (!igPath) return `<a class="ev-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${escapeHtml(m.url)}</a>`;
      return `<figure class="ev-figure ev-figure--embed bento-single">
        <blockquote class="ev-embed-placeholder" data-embed-type="instagram" data-embed-url="${escapeHtml(m.url)}">
          <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View post on Instagram</a>
        </blockquote>
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    if (m.url) {
      const rendered = tryRenderGenericUrl(m);
      if (rendered) return rendered;
      return renderLinkCard(m);
    }
    return "";
  }).join("");
  return `<section class="section-block">
    <h3 class="section-head">Evidence</h3>
    <div class="evidence-grid">${items}</div>
  </section>`;
}

// ── Unified evidence gallery (canonical manila sheet) ───────────────
// Every evidence item becomes a CLEAN card — no caption baked onto the
// media. Captions/descriptions are collected into a numbered side
// "notes" column instead (decision: captions read in a side notes
// column, not overlaid on the card). All media is visible at once in a
// scrollable bento grid — no one-at-a-time hero carousel.
// Returns { galleryHTML, notesHTML, count }.
function renderEvidenceGallery(entry) {
  const media = Array.isArray(entry.evidence) ? entry.evidence : [];
  if (!media.length) return { galleryHTML: "", notesHTML: "", count: 0 };

  const notes = [];
  const imageCount = media.filter((m) => m.type === "image" && m.src).length;
  let imgIdx = 0;

  // A caption pushes a numbered note + returns the matching badge for the card.
  const noteBadge = (m) => {
    if (!m.caption) return "";
    notes.push({ no: notes.length + 1, text: m.caption });
    return `<span class="ms-ev-no">${String(notes.length).padStart(2, "0")}</span>`;
  };

  const cards = media.map((m, idx) => {
    if (m.type === "image" && m.src) {
      const size = bentoImageSize(imgIdx, imageCount);
      const lazy = imgIdx > 0 ? ' loading="lazy"' : "";
      imgIdx++;
      const badge = noteBadge(m);
      return `<figure class="ms-ev ms-ev--img ${size}" data-ev-idx="${idx}" data-ev-src="${escapeHtml(m.src)}">
        <img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.caption || entry.title || "")}"${lazy}>${badge}
      </figure>`;
    }
    if (m.type === "video" && m.src) {
      return `<figure class="ms-ev ms-ev--video bento-wide">
        <video src="${escapeHtml(m.src)}" muted loop playsinline controls preload="metadata"></video>${noteBadge(m)}
      </figure>`;
    }
    if (m.type === "youtube" && m.url) {
      const id = extractYouTubeId(m.url);
      if (id) return `<figure class="ms-ev ms-ev--embed bento-wide">
        <iframe src="https://www.youtube.com/embed/${id}?rel=0" title="${escapeHtml(m.caption || "YouTube")}" allowfullscreen loading="lazy"></iframe>${noteBadge(m)}
      </figure>`;
    }
    if (m.type === "pdf" && m.src) {
      return `<figure class="ms-ev ms-ev--pdf bento-tall">
        <iframe src="${escapeHtml(m.src)}" title="${escapeHtml(m.caption || "PDF document")}"></iframe>
        <a class="ms-ev-open" href="${escapeHtml(m.src)}" target="_blank" rel="noopener">Open PDF ↗</a>${noteBadge(m)}
      </figure>`;
    }
    if (m.type === "behance" && m.url) {
      const behanceId = extractBehanceId(m.url);
      if (behanceId) return `<figure class="ms-ev ms-ev--embed bento-tall">
        <iframe src="https://www.behance.net/embed/project/${behanceId}?ilo0=1" title="${escapeHtml(m.caption || "Behance project")}" allowfullscreen loading="lazy"></iframe>${noteBadge(m)}
      </figure>`;
    }
    if (m.type === "x" && m.url && extractXPostPath(m.url)) {
      return `<figure class="ms-ev ms-ev--embed bento-single">
        <blockquote class="ev-embed-placeholder" data-embed-type="x" data-embed-url="${escapeHtml(m.url)}"><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View post on X</a></blockquote>${noteBadge(m)}
      </figure>`;
    }
    if (m.type === "instagram" && m.url && extractInstagramPath(m.url)) {
      return `<figure class="ms-ev ms-ev--embed bento-single">
        <blockquote class="ev-embed-placeholder" data-embed-type="instagram" data-embed-url="${escapeHtml(m.url)}"><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener">View post on Instagram</a></blockquote>${noteBadge(m)}
      </figure>`;
    }
    // Drive videos, generic embeds (LinkedIn / Docs / accredible), and any
    // remaining URL (incl. non-post social links) → clean link/embed card.
    if (m.url) {
      const driveId = extractGoogleDriveId(m.url);
      if (driveId) return `<figure class="ms-ev ms-ev--embed bento-wide">
        <iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${escapeHtml(m.caption || "Google Drive video")}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>${noteBadge(m)}
      </figure>`;
      const generic = tryRenderGenericUrl(m);
      if (generic) return generic;
      return renderLinkCard(m);
    }
    return "";
  }).filter(Boolean).join("");

  const galleryHTML = `<div class="ms-gallery">${cards}</div>`;
  const notesHTML = notes.length
    ? `<aside class="ms-notes"><h3 class="ms-notes-head">Notes</h3><ol class="ms-notes-list">${notes
        .map((n) => `<li class="ms-note"><span class="ms-note-no">${String(n.no).padStart(2, "0")}</span><span class="ms-note-text">${escapeHtml(n.text)}</span></li>`)
        .join("")}</ol></aside>`
    : "";
  return { galleryHTML, notesHTML, count: media.length };
}

// Contact entry detection + a dedicated card with icons + live hyperlinks
// (the raw "Phone : … Email : … Instagram : …" text reads poorly).
const CONTACT_ICONS = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"/></svg>',
  email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z"/><path d="M3 7l9 6l9 -6"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4m0 4a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z"/><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M16.5 7.5l0 .01"/></svg>',
  behance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-12h4.5a3 3 0 0 1 0 6a3 3 0 0 1 0 6h-4.5"/><path d="M3 12l4.5 0"/><path d="M14 13h7a3.5 3.5 0 0 0 -7 0v2a3.5 3.5 0 0 0 6.64 1"/><path d="M16 6l3 0"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8z"/><path d="M10 9l5 3l-5 3z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/></svg>',
};

function isContactEntry(entry) {
  // Title is "Contact: Anirudh Venkatesan" — match a leading "contact" word, not
  // just the exact string, so the dedicated icon/hyperlink card actually fires.
  return entry.activityType === "Contact" || /^\s*contact\b/i.test(entry.title || "");
}

// The GenAI toolstack entry is a comma-separated dump of 15+ tools. Detect it so
// the artifact view can render real chips with logos + links instead of prose.
function isToolstackEntry(entry) {
  return /genai|generative ai/i.test(entry.role || "") &&
    /toolstack|tool ?stack|production (gen ?ai|tools)/i.test(entry.title || "");
}

// Curated GenAI tools → official site (for the chip link). Order = how they read
// in the description; matching is by substring so "ChatGPT (GPT, Image…)" hits.
const GENAI_TOOLS = [
  { name: "ChatGPT", match: ["chatgpt", "gpt", "codex"], url: "https://chatgpt.com", note: "GPT, Image, Codex" },
  { name: "Claude", match: ["claude"], url: "https://claude.ai", note: "LLM, Claude Code, Design" },
  { name: "Freepik", match: ["freepik", "magnific"], url: "https://www.freepik.com", note: "Image, video, audio gen" },
  { name: "ElevenLabs", match: ["elevenlabs", "eleven labs"], url: "https://elevenlabs.io", note: "TTS, voice cloning" },
  { name: "Suno", match: ["suno"], url: "https://suno.com", note: "Music and SFX" },
  { name: "Higgsfield", match: ["higgsfield"], url: "https://higgsfield.ai", note: "Video, cinema, UGC" },
  { name: "ComfyUI", match: ["comfyui", "comfy ui"], url: "https://www.comfy.org", note: "Self-hosted pipelines" },
  { name: "OpenCode", match: ["opencode"], url: "https://opencode.ai", note: "Self-hosted code gen" },
  { name: "LM Studio", match: ["lm studio", "lmstudio"], url: "https://lmstudio.ai", note: "Self-hosted LLMs" },
];

function renderToolstackBlock(entry) {
  const text = `${entry.description || ""} ${entry.notes || ""}`.toLowerCase();
  const found = GENAI_TOOLS.filter((t) => t.match.some((m) => text.includes(m)));
  if (!found.length) return "";
  const rows = found.map((t) => `
    <a class="tool-chip" href="${escapeHtml(t.url)}" target="_blank" rel="noopener">
      <span class="tool-chip-mark">${escapeHtml(t.name[0])}</span>
      <span class="tool-chip-meta">
        <span class="tool-chip-name">${escapeHtml(t.name)}</span>
        <span class="tool-chip-note">${escapeHtml(t.note)}</span>
      </span>
      <span class="tool-chip-arrow" aria-hidden="true">↗</span>
    </a>`).join("");
  return `<div class="tool-grid">${rows}</div>`;
}

function renderContactBlock(entry) {
  const text = `${entry.description || ""} ${entry.notes || ""}`;
  const channels = [];
  const seen = new Set();
  // Dedup on a normalized key (drop scheme / www / trailing slash) so the
  // https:// and bare-domain matches of the same link don't both show.
  const keyOf = (c) => c.type + ":" + c.href.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/$/, "").toLowerCase();
  const push = (c) => { const k = keyOf(c); if (!seen.has(k)) { seen.add(k); channels.push(c); } };

  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
  if (email) push({ type: "email", label: "Email", value: email, href: "mailto:" + email });

  const phone = (text.match(/\+\d[\d\s-]{7,}\d/) || [])[0];
  if (phone) {
    const clean = phone.replace(/[^\d+]/g, "");
    const wa = /whatsapp/i.test(text);
    push({ type: "phone", label: wa ? "WhatsApp" : "Phone", value: phone.trim(), href: (wa ? "https://wa.me/" + clean.replace(/^\+/, "") : "tel:" + clean) });
  }

  const urlList = [
    ...(text.match(/https?:\/\/[^\s)]+/g) || []),
    ...(text.match(/(?<![/\w])(?:www\.)?(?:instagram\.com|behance\.net|youtube\.com|youtu\.be)\/[^\s)]+/g) || []),
  ];
  for (const u of urlList) {
    const href = /^https?:/.test(u) ? u : "https://" + u;
    let type = "link", label = "Link";
    if (/instagram\.com/i.test(u)) { type = "instagram"; label = "Instagram"; }
    else if (/behance\.net/i.test(u)) { type = "behance"; label = "Behance"; }
    else if (/youtu/i.test(u)) { type = "youtube"; label = "YouTube"; }
    push({ type, label, value: href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href });
  }

  if (!channels.length) return "";
  const rows = channels.map((c) => `
    <a class="contact-row" href="${escapeHtml(c.href)}" target="_blank" rel="noopener">
      <span class="contact-icon">${CONTACT_ICONS[c.type] || CONTACT_ICONS.link}</span>
      <span class="contact-meta">
        <span class="contact-label">${escapeHtml(c.label)}</span>
        <span class="contact-value">${escapeHtml(c.value)}</span>
      </span>
      <span class="contact-arrow" aria-hidden="true">↗</span>
    </a>`).join("");
  return `<div class="contact-block">${rows}</div>`;
}

// Canonical single-entry sheet body (manila). Shared by BOTH the cluster
// cascade folders and the single-entry slide-up view, so a project looks
// identical no matter which path opened it (building / 2D grid / Roles /
// Clients / codex / cluster row). Returns inner HTML (no .ms-body-inner wrap).
function renderEntrySheetBody(entry) {
  // Contact entry → icons + live hyperlinks instead of the raw link dump.
  if (isContactEntry(entry)) {
    return `
      <h2 class="ms-title">Get in touch</h2>
      <p class="contact-lede">One operator, a studio's range. Reach me directly —</p>
      ${renderContactBlock(entry)}`;
  }
  const { galleryHTML, notesHTML } = renderEvidenceGallery(entry);
  const dateStr = entry.year
    ? `${entry.year}${entry.month ? "-" + String(entry.month).padStart(2, "0") : ""}`
    : "";
  const metaChips = [
    ["Role", entry.role],
    ["Org / Client", entry.org],
    ["Location", entry.location],
    ["Date", dateStr],
  ]
    .filter(([, v]) => v)
    .map(([l, v]) => `<span class="ms-chip"><i>${escapeHtml(l)}</i>${escapeHtml(String(v))}</span>`)
    .join("");
  const tags = [...new Set([...(entry.tags || []), ...(entry.roleTags || [])])].slice(0, 10);
  const tagsHTML = tags.map((t) => `<span class="ms-tag">${escapeHtml(t)}</span>`).join("");
  const notes = entry.description || entry.notes || "";

  let mediaBlock = "";
  if (galleryHTML) {
    mediaBlock = `<div class="ms-layout ms-layout--gallery ${notesHTML ? "has-notes" : ""}">
      ${galleryHTML}
      ${notesHTML}
    </div>`;
  } else if (!notes) {
    mediaBlock = `<div class="ms-filed">
      <p class="ms-filed-quote">${escapeHtml((entry.title || "").slice(0, 220))}</p>
    </div>`;
  }

  return `
    <button type="button" class="ms-expand" data-expand-id="${entry.id}" aria-label="Expand to full screen" title="Expand to full screen">⤢ <span>Full screen</span></button>
    <h2 class="ms-title">${escapeHtml(entry.title || "Untitled")}</h2>
    ${metaChips ? `<div class="ms-chips">${metaChips}</div>` : ""}
    ${tagsHTML ? `<div class="ms-tags">${tagsHTML}</div>` : ""}
    ${notes ? `<div class="ms-story"><p>${escapeHtml(notes)}</p></div>` : ""}
    ${mediaBlock}`;
}

function bentoImageSize(imgIdx, total) {
  if (total === 1) return "bento-wide";
  if (total === 2) return "bento-single";
  if (total === 3) return imgIdx === 0 ? "bento-wide" : "bento-single";
  if (imgIdx === 0) return "bento-featured";
  if (total >= 7 && imgIdx === 3) return "bento-wide";
  return "bento-single";
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Google Drive file embed — extracts file ID from various Drive URL formats
function extractGoogleDriveId(url) {
  if (!url) return null;
  const m = String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  return m ? m[1] : null;
}

function extractXPostPath(url) {
  if (!url) return null;
  const m = String(url).match(/(?:x\.com|twitter\.com)\/([\w]+)\/status\/(\d+)/);
  return m ? `/${m[1]}/status/${m[2]}` : null;
}

function extractInstagramPath(url) {
  if (!url) return null;
  const m = String(url).match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/);
  return m ? m[1] : null;
}

function extractBehanceId(url) {
  if (!url) return null;
  const m = String(url).match(/behance\.net\/gallery\/(\d+)/);
  return m ? m[1] : null;
}

function extractLinkedInEmbedUrl(url) {
  if (!url) return null;
  const m = String(url).match(/linkedin\.com\/(?:feed\/update\/urn:li:activity:(\d+)|posts\/[\w-]+-(\d+)|embed\/feed\/update\/urn:li:activity:(\d+))/);
  const activityId = m ? (m[1] || m[2] || m[3]) : null;
  if (!activityId) return null;
  return `https://www.linkedin.com/embed/feed/update/urn:li:activity:${activityId}`;
}

function tryRenderGenericUrl(m) {
  const url = m.url || "";
  const linkedinEmbed = extractLinkedInEmbedUrl(url);
  if (linkedinEmbed) {
    return `<figure class="ev-figure ev-figure--embed bento-wide">
      <iframe src="${escapeHtml(linkedinEmbed)}" title="${escapeHtml(m.caption || "LinkedIn post")}" allowfullscreen loading="lazy" frameborder="0"></iframe>
      <figcaption>
        ${m.caption ? escapeHtml(m.caption) + " · " : ""}<a href="${escapeHtml(url)}" target="_blank" rel="noopener">View on LinkedIn</a>
      </figcaption>
    </figure>`;
  }
  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
  if (docsMatch) {
    return `<figure class="ev-figure ev-figure--embed bento-wide">
      <iframe src="https://docs.google.com/document/d/${docsMatch[1]}/preview" title="${escapeHtml(m.caption || "Google Doc")}" loading="lazy" frameborder="0"></iframe>
      <figcaption>
        ${m.caption ? escapeHtml(m.caption) + " · " : ""}<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open in Google Docs</a>
      </figcaption>
    </figure>`;
  }
  if (/accredible\.com.*embed_image/i.test(url)) {
    return `<figure class="ev-figure ev-figure--clickable bento-single" data-ev-src="${escapeHtml(url)}">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(m.caption || "Certificate")}" loading="lazy" style="background:#1a1714">
      ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
    </figure>`;
  }
  return null;
}

function renderLinkCard(m) {
  const url = m.url || m.src || "";
  let domain;
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { domain = url; }
  const label = m.caption || domain;
  const icon = /linkedin/i.test(url) ? "in" : /google/i.test(url) ? "G" : /accredible/i.test(url) ? "✦" : "↗";
  return `<figure class="ev-figure ev-figure--link bento-single">
    <a class="ev-link-card" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      <span class="ev-link-icon">${icon}</span>
      <span class="ev-link-meta">
        <span class="ev-link-label">${escapeHtml(label)}</span>
        <span class="ev-link-domain">${escapeHtml(domain)}</span>
      </span>
    </a>
  </figure>`;
}

function detectLinkType(url) {
  if (extractYouTubeId(url)) return "youtube";
  if (extractGoogleDriveId(url)) return "youtube";
  if (extractBehanceId(url)) return "behance";
  if (extractXPostPath(url)) return "x";
  if (extractInstagramPath(url)) return "instagram";
  if (/linkedin\.com/i.test(url)) return "linkedin";
  if (/docs\.google\.com/i.test(url)) return "link";
  if (/accredible\.com/i.test(url)) return "link";
  return "link";
}

function loadSocialEmbeds(container) {
  const placeholders = container.querySelectorAll("[data-embed-type]");
  if (!placeholders.length) return;

  let needsXScript = false;
  let needsIGScript = false;

  placeholders.forEach((el) => {
    const type = el.dataset.embedType;
    const url = el.dataset.embedUrl;
    if (type === "x") {
      needsXScript = true;
      el.innerHTML = "";
      const bq = document.createElement("blockquote");
      bq.className = "twitter-tweet";
      bq.setAttribute("data-theme", "dark");
      const a = document.createElement("a");
      a.href = url;
      bq.appendChild(a);
      el.appendChild(bq);
    }
    if (type === "instagram") {
      needsIGScript = true;
      el.innerHTML = "";
      const bq = document.createElement("blockquote");
      bq.className = "instagram-media";
      bq.dataset.instgrmPermalink = url;
      bq.dataset.instgrmVersion = "14";
      const a = document.createElement("a");
      a.href = url;
      a.textContent = "View on Instagram";
      bq.appendChild(a);
      el.appendChild(bq);
    }
  });

  if (needsXScript) {
    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load(container);
    } else if (!document.querySelector('script[src*="platform.twitter.com"]')) {
      const s = document.createElement("script");
      s.src = "https://platform.twitter.com/widgets.js";
      s.async = true;
      s.charset = "utf-8";
      document.head.appendChild(s);
    }
  }

  if (needsIGScript) {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process();
    } else if (!document.querySelector('script[src*="instagram.com/embed"]')) {
      const s = document.createElement("script");
      s.src = "https://www.instagram.com/embed.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }
}

// In-flight working copy of the entry being edited. Survives re-renders
// triggered by media uploads etc.
let editDraft = null;

function renderEditView(entry) {
  if (!els.projectPage || !els.projectPageInner) return;
  if (!editDraft || editDraft.__id !== entry.id) {
    editDraft = JSON.parse(JSON.stringify(entry));
    editDraft.__id = entry.id;
    editDraft.evidence = Array.isArray(editDraft.evidence) ? editDraft.evidence : [];
    editDraft.tags = Array.isArray(editDraft.tags) ? editDraft.tags : [];
    editDraft.roleTags = Array.isArray(editDraft.roleTags) ? editDraft.roleTags : [];
  }

  const bucket = findBucketForTags([
    ...(editDraft.tags || []),
    ...(editDraft.roleTags || []),
    editDraft.role || "",
  ]);
  const bucketColor = bucket?.color || "#c8c0e0";
  els.projectPageInner.style.setProperty("--accent-bucket", bucketColor);
  els.projectPageInner.style.setProperty("--modal-bg", bucket?.modalBg || "var(--paper)");
  els.projectPageInner.style.setProperty("--modal-ink", bucket?.ink || "var(--ink)");

  const num = (v) => (v === null || v === undefined ? "" : v);

  const editRow = (label, name, value, opts = {}) => `
    <label class="edit-row">
      <span class="edit-label">${escapeHtml(label)}</span>
      <input type="${opts.type || "text"}" name="${name}" value="${escapeHtml(num(value))}" data-edit-field="${name}" ${opts.attrs || ""}>
    </label>`;

  const editArea = (label, name, value) => `
    <label class="edit-row edit-row--block">
      <span class="edit-label">${escapeHtml(label)}</span>
      <textarea name="${name}" rows="4" data-edit-field="${name}">${escapeHtml(num(value))}</textarea>
    </label>`;

  const mediaListHTML = editDraft.evidence.map((m, i) => {
    let preview = "";
    if (m.type === "image" && m.src) preview = `<img src="${escapeHtml(m.src)}" alt="" loading="lazy">`;
    else if (m.type === "video" && m.src) preview = `<video src="${escapeHtml(m.src)}" preload="metadata" muted></video>`;
    else if (m.type === "pdf" && m.src) preview = `<iframe src="${escapeHtml(m.src)}" loading="lazy"></iframe>`;
    else if ((m.type === "youtube" || m.type === "behance") && m.url) {
      const behanceId = extractBehanceId(m.url);
      if (behanceId) {
        preview = `<a class="ev-edit-social-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">Behance Project</a>`;
      } else {
        const driveId = extractGoogleDriveId(m.url);
        if (driveId) {
          preview = `<iframe src="https://drive.google.com/file/d/${driveId}/preview" loading="lazy"></iframe>`;
        } else {
          const id = extractYouTubeId(m.url);
          preview = id
            ? `<iframe src="https://www.youtube.com/embed/${id}" loading="lazy"></iframe>`
            : `<span class="ev-edit-fallback">${escapeHtml(m.url)}</span>`;
        }
      }
    }
    else if (m.type === "x" && m.url) {
      preview = `<a class="ev-edit-social-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">𝕏 Post</a>`;
    }
    else if (m.type === "instagram" && m.url) {
      preview = `<a class="ev-edit-social-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">Instagram Post</a>`;
    }
    else if (m.type === "linkedin" && m.url) {
      preview = `<a class="ev-edit-social-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">LinkedIn Post</a>`;
    }
    else if (m.type === "link" && m.url) {
      let domain;
      try { domain = new URL(m.url).hostname.replace(/^www\./, ""); } catch { domain = m.url; }
      preview = `<a class="ev-edit-social-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${escapeHtml(domain)}</a>`;
    }
    return `<div class="ev-edit-item">
      <div class="ev-edit-preview">${preview}</div>
      <div class="ev-edit-meta">
        <small>${escapeHtml(m.type.toUpperCase())}</small>
        <input type="text" placeholder="caption" value="${escapeHtml(m.caption || "")}" data-media-caption="${i}">
      </div>
      <button type="button" class="ev-edit-remove" data-media-remove="${i}" aria-label="Remove">×</button>
    </div>`;
  }).join("");

  els.projectPageInner.innerHTML = `
    <aside class="project-ledger project-ledger--edit">
      <div class="ledger-row">
        <span class="ledger-label">Editing entry #${escapeHtml(String(entry.id))}</span>
        <span class="ledger-value">${escapeHtml(entry.title || "Untitled")}</span>
      </div>
      ${editRow("Date (YYYY-MM-DD)", "date", editDraft.date, { type: "date" })}
      <label class="edit-row">
        <span class="edit-label">Role</span>
        <input type="text" list="role-datalist" name="role" value="${escapeHtml(num(editDraft.role))}" data-edit-field="role">
        <datalist id="role-datalist">${getKnownRoles().map((r) => `<option value="${escapeHtml(r)}">`).join("")}</datalist>
      </label>
      ${editRow("Org / Client", "org", editDraft.org)}
      ${editRow("Location", "location", editDraft.location)}
      ${editRow("Activity type", "activityType", editDraft.activityType)}
      ${editRow("Evidence source", "evidenceSource", editDraft.evidenceSource)}
      ${editRow("Tags (comma-sep)", "tags", (editDraft.tags || []).join(", "))}
      ${editRow("Role tags (comma-sep)", "roleTags", (editDraft.roleTags || []).join(", "))}
    </aside>

    <main class="project-mainboard project-mainboard--edit">
      <div class="mainboard-topbar">
        <span class="display-eyebrow">EDIT MODE · #${escapeHtml(String(entry.id))}</span>
        <div class="edit-controls">
          <button type="button" class="modal-action-btn" data-action="save">SAVE</button>
          <button type="button" class="modal-action-btn modal-action-btn--ghost" data-action="cancel">CANCEL</button>
          <button type="button" class="modal-action-btn modal-action-btn--danger" data-action="delete">DELETE</button>
        </div>
      </div>

      <label class="edit-row edit-row--title">
        <span class="edit-label">Title</span>
        <input type="text" value="${escapeHtml(editDraft.title || "")}" data-edit-field="title" class="edit-title-input">
      </label>

      ${editArea("Description", "description", editDraft.description)}
      ${editArea("Notes", "notes", editDraft.notes)}

      <section class="section-block">
        <h3 class="section-head">Evidence (${editDraft.evidence.length})</h3>
        <div class="ev-edit-list">${mediaListHTML || `<p class="body-copy" style="opacity:.6">No media attached.</p>`}</div>

        <div class="ev-edit-controls">
          <label class="ev-upload-btn">
            <input type="file" accept="image/*,video/*,application/pdf" data-media-upload hidden multiple>
            <span>+ UPLOAD FILE</span>
          </label>

          <form class="ev-link-form" data-media-link-form>
            <input type="url" placeholder="Paste any link: YouTube, Behance, X, Instagram, Drive..." data-media-link-url required>
            <button type="submit">+ ADD LINK</button>
          </form>
        </div>
      </section>

      <section class="section-block">
        <h3 class="section-head">3D Model</h3>
        ${editDraft.model?.src
          ? `<div class="model-status">
               <span class="model-status-icon">◆</span>
               <span class="model-status-text">${escapeHtml(editDraft.model.src.split('/').pop())}</span>
               <button type="button" class="ev-edit-remove" data-model-remove aria-label="Remove model">×</button>
             </div>
             <label class="model-toggle">
               <input type="checkbox" data-model-preserve ${editDraft.model.preserveMaterials ? "checked" : ""}>
               <span>Real textures <em>(keep GLB materials, off = porcelain)</em></span>
             </label>`
          : `<p class="body-copy" style="opacity:.6">No 3D model. Upload a GLB to replace the procedural building.</p>`}
        <label class="ev-upload-btn" style="margin-top:8px">
          <input type="file" accept=".glb" data-model-upload hidden>
          <span>${editDraft.model?.src ? "REPLACE GLB" : "+ UPLOAD GLB"}</span>
        </label>
      </section>
    </main>
  `;

  // ── Wire field bindings ──
  els.projectPageInner.querySelectorAll("[data-edit-field]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const field = inp.dataset.editField;
      let val = inp.value;
      if (inp.type === "number") val = val === "" ? "" : Number(val);
      if (field === "tags" || field === "roleTags") {
        val = String(val).split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      }
      editDraft[field] = val;
    });
  });

  // ── Media controls ──
  els.projectPageInner.querySelectorAll("[data-media-caption]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.mediaCaption);
      if (editDraft.evidence[i]) editDraft.evidence[i].caption = inp.value;
    });
  });
  els.projectPageInner.querySelectorAll("[data-media-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.mediaRemove);
      editDraft.evidence.splice(i, 1);
      renderEditView(entry);
    });
  });

  // File upload
  const fileInput = els.projectPageInner.querySelector("[data-media-upload]");
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      for (const file of fileInput.files) {
        try {
          const url = await uploadFile(entry.id, file);
          const type = file.type === "application/pdf" ? "pdf" : file.type.startsWith("video/") ? "video" : "image";
          editDraft.evidence.push({ type, src: url, caption: "" });
        } catch (err) {
          console.error("Upload failed:", err);
          alert(`Upload failed: ${err.message || err}`);
        }
      }
      renderEditView(entry);
    });
  }

  // GLB model upload
  const modelInput = els.projectPageInner.querySelector("[data-model-upload]");
  if (modelInput) {
    modelInput.addEventListener("change", async () => {
      const file = modelInput.files[0];
      if (!file) return;
      try {
        const params = new URLSearchParams({ entryId: String(entry.id) });
        const resp = await fetch(`/api/upload-model?${params}`, {
          method: "POST",
          headers: { "Content-Type": "model/gltf-binary" },
          body: file,
        });
        if (!resp.ok) throw new Error(`upload ${resp.status}`);
        const j = await resp.json();
        // Keep any existing transform (position/scale/rotation) on re-upload;
        // default new models to real textures since that's the chosen look.
        editDraft.model = {
          preserveMaterials: true,
          ...(editDraft.model || {}),
          src: j.url,
        };
      } catch (err) {
        console.error("Model upload failed:", err);
        alert(`Model upload failed: ${err.message || err}`);
      }
      renderEditView(entry);
    });
  }
  const modelPreserve = els.projectPageInner.querySelector("[data-model-preserve]");
  if (modelPreserve) {
    modelPreserve.addEventListener("change", () => {
      if (editDraft.model) editDraft.model.preserveMaterials = modelPreserve.checked;
    });
  }
  const modelRemove = els.projectPageInner.querySelector("[data-model-remove]");
  if (modelRemove) {
    modelRemove.addEventListener("click", () => {
      editDraft.model = null;
      renderEditView(entry);
    });
  }

  // Universal link input
  const linkForm = els.projectPageInner.querySelector("[data-media-link-form]");
  if (linkForm) {
    linkForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const inp = linkForm.querySelector("[data-media-link-url]");
      const url = inp.value.trim();
      if (!url) return;
      const type = detectLinkType(url);
      editDraft.evidence.push({ type, url, caption: "" });
      renderEditView(entry);
    });
  }

  // SAVE / CANCEL
  els.projectPageInner.querySelectorAll('[data-action="save"]').forEach((btn) => {
    btn.addEventListener("click", () => saveDraft(entry));
  });
  els.projectPageInner.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      editDraft = null;
      state.editingEntryId = null;
      // If we came from a nav page, return there instead of showing read view
      if (state.editOriginNavView) {
        closeProjectPage();
        return;
      }
      openProjectPage(entry); // back to read view
    });
  });
  els.projectPageInner.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => deleteEntry(entry));
  });

  // Ensure the panel is actually visible — renderEditView is called both
  // as an early-return inside openProjectPage AND directly from the Roles
  // master page EDIT button, so it has to own its own visibility toggle.
  els.projectPage.classList.add("visible");
  els.projectPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("project-open");
}

async function uploadFile(entryId, file) {
  const sanitized = String(file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
  const params = new URLSearchParams({ entryId: String(entryId), filename: sanitized });
  const resp = await fetch(`/api/upload?${params}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!resp.ok) throw new Error(`upload ${resp.status}`);
  const j = await resp.json();
  return j.url;
}

async function saveDraft(originalEntry) {
  if (!editDraft) return;
  // Auto-derive year/month/day from date string so nav + 3D scene stay correct
  if (editDraft.date) {
    const parts = String(editDraft.date).split("-");
    if (parts[0]) editDraft.year = Number(parts[0]);
    if (parts[1]) editDraft.month = Number(parts[1]);
    if (parts[2]) editDraft.day = Number(parts[2]);
  }
  // Strip the __id helper field before sending
  const payload = { ...editDraft };
  delete payload.__id;
  try {
    const resp = await fetch(`/api/entries/${encodeURIComponent(originalEntry.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j.error || `save ${resp.status}`);
    }
    const j = await resp.json();
    // Merge the server's authoritative entry back into our in-memory cache
    const idx = entries.findIndex((e) => e.id === originalEntry.id);
    if (idx >= 0) entries[idx] = j.entry;
    state.editingEntryId = null;
    editDraft = null;
    // If we came from a nav page, return there after save
    if (state.editOriginNavView) {
      closeProjectPage();
      return;
    }
    // Re-render in read mode with the saved entry
    openProjectPage(j.entry);
  } catch (err) {
    console.error("Save failed:", err);
    alert(`Save failed: ${err.message || err}`);
  }
}

async function deleteEntry(entry) {
  if (!confirm(`Delete entry #${entry.id} "${entry.title || "Untitled"}"?\n\nThis cannot be undone.`)) return;
  try {
    const resp = await fetch(`/api/entries/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
    if (!resp.ok) {
      const j = await resp.json().catch(() => ({}));
      throw new Error(j.error || `delete ${resp.status}`);
    }
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) entries.splice(idx, 1);
    editDraft = null;
    state.editingEntryId = null;
    closeProjectPage();
    applyFilters();
  } catch (err) {
    console.error("Delete failed:", err);
    alert(`Delete failed: ${err.message || err}`);
  }
}

// ─── Nav-tab overlay pages (Roles / Firsts / Throughlines) ──────
// ─── Pass 04: Brutalist master pages ─────────────────────────────
// Roles / Clients are dense bordered lists grouping every entry by
// role (or org) field. Click a group to expand the moments inside.
// In edit mode, an EDIT button on each row opens the side modal;
// an ADD NEW ENTRY button at the top creates a fresh entry via API.
const navPageState = { view: null, expanded: new Set() };

function groupEntriesBy(field, fallback) {
  const map = new Map();
  for (const e of entries) {
    const key = (e[field] && String(e[field]).trim()) || fallback;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

// Get the set of theme keys an entry belongs to. Reads:
//   1) entry.roleGroups[] explicit theme labels ("Moving Images", "Computational Culture", …)
//   2) inferred from entry.roles[] via ROLE_PILLS[].themeRoles
// An entry whose roleGroups is explicitly an empty array is excluded from ALL themes
// (used for "former cofounder / cofounder deported" entries that should stay in the
// timeline but not appear on the Roles page).
function getEntryThemes(entry) {
  const themes = new Set();
  if (Array.isArray(entry.roleGroups) && entry.roleGroups.length === 0) return themes;
  const groups = entry.roleGroups || [];
  const roles  = entry.roles || (entry.role ? [entry.role] : []);
  for (const g of groups) {
    const t = ROLE_PILLS.find((p) => p.label === g);
    if (t) themes.add(t.key);
  }
  for (const r of roles) {
    for (const pill of ROLE_PILLS) {
      if ((pill.themeRoles || []).includes(r)) themes.add(pill.key);
    }
  }
  return themes;
}

// Group entries by theme bucket (Moving Images, Visual Systems, Computational Culture,
// Documentation & Research, Leadership & Education, Life). An entry can appear in
// multiple themes (e.g. Rabble work → Visual Systems + Moving Images).
// Returns [[bucketLabel, entries[], bucketObj], ...] in ROLE_PILLS order.
function groupEntriesByBucket() {
  const buckets = new Map();
  const filtered = entries.filter((e) => matchesEntry(e, { ignoreRoleFilter: true }));
  for (const e of filtered) {
    const themes = getEntryThemes(e);
    for (const key of themes) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(e);
    }
  }
  const result = [];
  for (const pill of ROLE_PILLS) {
    const list = buckets.get(pill.key);
    if (!list || !list.length) continue;
    result.push([pill.label, collapseMergedEntries(list), pill]);
  }
  return result;
}

// ── Folio icon set (extracted from the Figma "Folio" file; inlined so we
// don't depend on the short-lived Figma asset URLs). Line icons use
// currentColor; the folder is filled with a passed color. ──
const FOLIO_ICONS = {
  // Fluent System Icons (filled, 24×24, currentColor). Filled marks read bolder
  // and clearer than thin line icons at both the small pill size and the large
  // folder-glyph size — fixes the "ugly / too small" icon complaint.
  home: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.7 3.3a2 2 0 0 1 2.6 0l7 6.1c.44.38.7.94.7 1.52V19a2 2 0 0 1-2 2h-3.4a1 1 0 0 1-1-1v-4.5a1.1 1.1 0 0 0-1.1-1.1h-1.6a1.1 1.1 0 0 0-1.1 1.1V20a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-8.07c0-.58.26-1.14.7-1.52z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3a7 7 0 1 0 4.2 12.6l4.1 4.1a1 1 0 0 0 1.4-1.4l-4.1-4.1A7 7 0 0 0 10 3m-5 7a5 5 0 1 1 10 0a5 5 0 0 1-10 0"/></svg>',
  // Moving Images — filled clapperboard + play.
  MovingImages: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.2 6.8 2.4 9.3a1 1 0 0 0 .67 1.25l16.1 4.8V8a2 2 0 0 0-1.43-1.92L6.07 2.74a2 2 0 0 0-2.5 1.35zM9.9 5.2l2.6.78-1 2.86-2.6-.78zm5.3 1.58 2.2.65a.5.5 0 0 1 .34.62l-.78 2.6-2.95-.88zM3 12.5V18a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-5.5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1m6.5 1.7 3.6 2a.6.6 0 0 1 0 1.05l-3.6 2a.6.6 0 0 1-.9-.52v-4a.6.6 0 0 1 .9-.53"/></svg>',
  // Visual Systems — filled design shapes (square + circle).
  VisualSystems: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h5A2.5 2.5 0 0 1 13 5.5v5a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 3 10.5zM16.5 12a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9M14 4a1 1 0 0 0-.87.5l-3.2 5.5A1 1 0 0 0 10.8 11.5h6.4a1 1 0 0 0 .87-1.5l-3.2-5.5A1 1 0 0 0 14 4" opacity=".55"/><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h5A2.5 2.5 0 0 1 13 5.5v5a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 3 10.5z"/></svg>',
  // Computational Culture — filled code brackets.
  CompCulture: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.7 6.3a1 1 0 0 0-1.4-1.4l-5 5a1 1 0 0 0 0 1.4l5 5a1 1 0 0 0 1.4-1.42L4.42 10zM16.7 4.9a1 1 0 0 0-1.4 1.4L19.58 10l-4.3 4.3a1 1 0 0 0 1.42 1.4l5-5a1 1 0 0 0 0-1.4zM14.2 3.04a1 1 0 0 0-1.16.81l-2 11.5a1 1 0 0 0 1.97.34l2-11.5a1 1 0 0 0-.81-1.15"/></svg>',
  // Documentation & Research — filled document + magnifier.
  DocResearch: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7.5a5.5 5.5 0 0 1-1.9-3.1A4 4 0 0 1 14 13.5a4 4 0 0 1 4 4q0 .26-.03.5H18V8.83a2 2 0 0 0-.6-1.42l-3.8-3.82A2 2 0 0 0 12.16 3H6zm7 1.5L17.5 8H14a1 1 0 0 1-1-1zM14 15a2.5 2.5 0 1 0 1.4 4.57l1.9 1.9a1 1 0 0 0 1.4-1.42l-1.9-1.9A2.5 2.5 0 0 0 14 15"/></svg>',
  // Leadership & Education — filled mortarboard.
  LeadershipEdu: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.3 3.13a2 2 0 0 1 1.4 0l8.5 3.2a1 1 0 0 1 0 1.87l-8.5 3.2a2 2 0 0 1-1.4 0L6 9.4v3.1c0 .3.13.57.36.7C7.7 14 9.7 14.75 12 14.75s4.3-.74 5.64-1.54c.23-.13.36-.4.36-.7V9.4l1 .38v3.1a2 2 0 0 1-.07.51A8 8 0 0 1 19 15v3.5a1 1 0 0 1-2 0V16a10 10 0 0 1-1 .35V14a13 13 0 0 1-4 .75 13 13 0 0 1-4-.75v-.6l-2.7-1.02a1 1 0 0 1 0-1.87z"/></svg>',
  // Clients — filled briefcase.
  clients: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3a2 2 0 0 0-2 2v1H5a3 3 0 0 0-3 3v2h20V9a3 3 0 0 0-3-3h-2V5a2 2 0 0 0-2-2zm6 3H9V5h6zM2 13v4a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-4h-9v1a1 1 0 0 1-2 0v-1z"/></svg>',
  // All / overview — filled apps grid.
  all: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 3A2.5 2.5 0 0 0 3 5.5v2A2.5 2.5 0 0 0 5.5 10h2A2.5 2.5 0 0 0 10 7.5v-2A2.5 2.5 0 0 0 7.5 3zm11 0A2.5 2.5 0 0 0 14 5.5v2A2.5 2.5 0 0 0 16.5 10h2A2.5 2.5 0 0 0 21 7.5v-2A2.5 2.5 0 0 0 18.5 3zM3 16.5A2.5 2.5 0 0 1 5.5 14h2A2.5 2.5 0 0 1 10 16.5v2A2.5 2.5 0 0 1 7.5 21h-2A2.5 2.5 0 0 1 3 18.5zm13.5-2.5A2.5 2.5 0 0 0 14 16.5v2A2.5 2.5 0 0 0 16.5 21h2a2.5 2.5 0 0 0 2.5-2.5v-2a2.5 2.5 0 0 0-2.5-2.5z"/></svg>',
  Life: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.3 4.2 12.5a4.8 4.8 0 0 1 6.8-6.8l1 1 1-1a4.8 4.8 0 0 1 6.8 6.8z"/></svg>',
};
function folioFolderSVG(color) {
  return `<svg class="fx-folder-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" fill="${color}" stroke="none"/></svg>`;
}

// ─── Case-study infographic helpers ──────────────────────────────────
// The case-study pages read as full editorial infographics: stat medallions,
// a numbered process flow, a chronological timeline, outcome chips, a pulled
// retrospective, and an evidence bento — all driven by the entry's accent.

// A leading numeric token: optional currency, optional ~, digits, optional
// scale/unit (MB/hr/K/M). Longer units listed first so "41MB" → "41MB", not "41M".
const CS_NUM_RE = /[$₹]?~?\d[\d,]*(?:\.\d+)?(?:MB|mb|hr|Hr|K|M|k|m)?/;
// Numeric magnitude for dedup so "$15K" and "$15,000" (or "311K"/"~311K") collapse.
function csMagnitude(v) {
  let n = parseFloat(String(v).replace(/[^\d.]/g, "")) || 0;
  if (/k/i.test(v)) n *= 1e3;
  if (/m(?!b)/i.test(v)) n *= 1e6;   // "M" = million, but not "MB"
  return Math.round(n);
}
const csCleanLabel = (l) => String(l)
  .replace(/[-–—/]/g, " ").replace(/[^A-Za-z0-9 ]/g, " ")
  .replace(/\b\d[\d.,]*\b/g, " ")                                    // drop bare numbers (value carries it)
  .replace(/\b(of|the|a|in|code|total)\b/gi, " ").replace(/\s+/g, " ").trim()
  .split(" ").slice(0, 4).join(" ");

// Parse a real quantity from `text` → { value, label, mag } or null. Rejects
// numbers glued to letters ("2D", "E2E", "v2") and IDs, so only genuine figures
// surface. Label prefers the words right after the number, else fallbackLabel.
function csParseFig(text, fallbackLabel) {
  const t = String(text).trim();
  const m = t.match(CS_NUM_RE);
  if (!m) return null;
  const idx = t.indexOf(m[0]);
  if (idx > 0 && /[A-Za-z0-9]/.test(t[idx - 1])) return null;        // E2E, v2
  if (/[A-Za-z]/.test(t[idx + m[0].length] || "")) return null;      // 2D, 3D
  const value = m[0].replace(/~/g, "").trim();
  const mag = csMagnitude(value);
  if (!mag || value.replace(/[^\d]/g, "").length > 6) return null;   // CIN / ids
  const rem = csCleanLabel(t.slice(idx + m[0].length));
  const fb = csCleanLabel(fallbackLabel);
  const label = (rem && rem.split(" ").length <= 3) ? rem : (fb || rem);
  return { value, label, mag };
}

// Featured numbers → medallion figures. Stats first (clean labels), then metrics
// fill any new numbers. Honest: only digits already present in the data.
function csFigures(cs) {
  const figs = [], seen = new Set();
  const add = (f) => { if (f && !seen.has(f.mag)) { seen.add(f.mag); figs.push({ value: f.value, label: f.label || cs.role || "" }); } };
  for (const s of cs.stats || []) add(csParseFig(s.val, s.label));
  for (const t of (cs.outcomes && cs.outcomes.metrics) || [])
    for (const piece of String(t).split(/\s*[\/·]\s*/)) add(csParseFig(piece, piece));
  return figs.slice(0, 6);
}

// Identity spec rows = stats that did NOT yield a figure (Structure, CIN, Stack…).
function csSpecRows(cs) {
  return (cs.stats || []).filter((s) => !csParseFig(s.val, s.label));
}

const CS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function csDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return { year: String(iso).slice(0, 4), month: "" };
  return { year: String(d.getFullYear()), month: CS_MONTHS[d.getMonth()] };
}

// A decorative ring + big number medallion.
function csMedallion(fig, i) {
  return `<figure class="cs-fig" style="--i:${i}">
    <svg class="cs-fig-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="cs-fig-track" cx="50" cy="50" r="45"/>
      <circle class="cs-fig-arc" cx="50" cy="50" r="45"/>
    </svg>
    <span class="cs-fig-num">${escapeHtml(fig.value)}</span>
    <figcaption class="cs-fig-label">${escapeHtml(fig.label)}</figcaption>
  </figure>`;
}

// Numbered process flow with connectors (01 → 02 → 03 …).
function csFlow(cs) {
  const steps = (cs.pipeline && cs.pipeline.steps) || [];
  return steps.map((s, i) => `
    <li class="cs-flow-step" style="--i:${i}">
      <span class="cs-flow-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="cs-flow-body">
        <span class="cs-flow-title">${escapeHtml(s.title)}</span>
        <span class="cs-flow-desc">${escapeHtml(s.desc)}</span>
      </span>
    </li>`).join("");
}

// Chronological timeline — accent spine, dated nodes, ledger-proof jumps.
function csTimeline(cs) {
  return (cs.milestones || []).map((m, i) => {
    const d = csDate(m.date);
    const jump = m.ledgerEntryId
      ? `<button type="button" class="cs-tl-jump" data-ledger-jump="${m.ledgerEntryId}">view ledger proof →</button>`
      : "";
    return `<li class="cs-tl-item" style="--i:${i}">
      <span class="cs-tl-node" aria-hidden="true"></span>
      <span class="cs-tl-when"><b>${escapeHtml(d.year)}</b>${d.month ? `<i>${escapeHtml(d.month)}</i>` : ""}</span>
      <span class="cs-tl-card">
        <span class="cs-tl-title">${escapeHtml(m.title)}</span>
        <span class="cs-tl-desc">${escapeHtml(m.desc)}</span>
        ${jump}
      </span>
    </li>`;
  }).join("");
}

// Evidence bento (clickable → lightbox). Caps the count so the page stays tight.
function csEvidence(cs) {
  const imgs = (cs.evidence || []).filter((e) => e.type === "image" && e.src).slice(0, 12);
  if (!imgs.length) return "";
  const tiles = imgs.map((e, i) => `
    <button type="button" class="cs-ev2 ${i % 6 === 0 ? "cs-ev2--wide" : ""}" data-cs-lightbox="${escapeHtml(e.src)}" data-cs-cap="${escapeHtml(e.caption || "")}">
      <img src="${escapeHtml(e.src)}" alt="${escapeHtml(e.caption || "")}" loading="lazy" onerror="this.closest('.cs-ev2').remove()">
    </button>`).join("");
  return `<section class="cs-block cs-block--evidence">
    <h2 class="cs-h2"><span>Evidence</span><i>${imgs.length} artifacts</i></h2>
    <div class="cs-ev2-grid">${tiles}</div>
  </section>`;
}

function renderCaseStudiesExplorer() {
  const root = els.navPageInner;
  let activeId = null; // null = grid, or case study id (e.g. "pixelate")

  const CS_STICKERS = {
    "haus-of-pixels": "public/stickers/haus logo.webp",
    "pixelate": "public/stickers/pixelateit_logo.jpg",
    "rabble-labs": "public/stickers/client_rabble.png",
    "buddy-tales": "public/stickers/client_buddy.png",
    "anirudh-website": "public/stickers/client_anirudh.png",
  };

  function render() {
    if (!activeId) {
      renderCSGrid();
    } else {
      renderCSDetail(activeId);
    }
  }

  function renderCSGrid() {
    // Left sidebar: list of case studies.
    const sidebarHTML = caseStudies.map((cs) => `
      <button type="button" class="fx-srow fx-srow--cs" data-cs-srow="${cs.id}">
        <span class="fx-srow-label">${escapeHtml(cs.title.toLowerCase())}</span>
        <span class="fx-srow-count">${escapeHtml(cs.years)}</span>
      </button>
    `).join("");

    // Grid of folders
    const foldersHTML = caseStudies.map((cs) => {
      const thumb = CS_STICKERS[cs.id];
      const inner = thumb
        ? `<img class="fx-folder-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" style="object-fit:contain;padding:12px;box-sizing:border-box;" onerror="this.remove()">`
        : `<span class="fx-folder-glyph">${cs.glyph}</span>`;
      return `
        <button type="button" class="fx-folder" data-cs-folder="${cs.id}" style="--fc:${cs.accentColor}">
          <span class="fx-folder-art">${inner}</span>
          <span class="fx-folder-label">${escapeHtml(cs.title.toLowerCase())}</span>
          <span class="fx-folder-count">${escapeHtml(cs.status.toLowerCase())}</span>
        </button>
      `;
    }).join("");

    root.innerHTML = `
      <div class="fx" data-view="case-studies">
        <div class="fx-tabrow">
          <button type="button" class="fx-ftab fx-ftab--home" data-fx-home title="Home">${FOLIO_ICONS.home}</button>
          <button type="button" class="fx-ftab fx-ftab--roles" data-fx-tab="roles">roles</button>
          <button type="button" class="fx-ftab fx-ftab--clients" data-fx-tab="clients">clients</button>
          <button type="button" class="fx-ftab fx-ftab--case-studies is-active" data-fx-tab="case-studies">case studies</button>
        </div>
        <div class="fx-sheet">
          <header class="fx-chrome">
            <div class="fx-heading">
              <span class="fx-heading-icon">📁</span>
              <span>case studies</span>
            </div>
            <div class="fx-meta">
              <span>total <b>${caseStudies.length}</b></span>
            </div>
          </header>
          <div class="fx-body">
            <aside class="fx-sidebar">${sidebarHTML}</aside>
            <main class="fx-main">
              <div class="fx-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 188px)) !important; gap: clamp(16px, 1.7vw, 32px) !important;">
                ${foldersHTML}
              </div>
            </main>
          </div>
        </div>
      </div>
    `;

    // Bind event listeners
    const container = root.querySelector(".fx");
    container.addEventListener("click", handleClicks);
  }

  function renderCSDetail(id) {
    const cs = caseStudies.find(x => x.id === id);
    if (!cs) { activeId = null; renderCSGrid(); return; }
    const thumb = CS_STICKERS[cs.id];

    // Sidebar: show list of case studies for quick hopping, active highlighted
    const sidebarHTML = caseStudies.map((item) => `
      <button type="button" class="fx-srow fx-srow--cs ${item.id === id ? "is-active" : ""}" data-cs-srow="${item.id}">
        <span class="fx-srow-label">${escapeHtml(item.title.toLowerCase())}</span>
        <span class="fx-srow-count">${escapeHtml(item.years)}</span>
      </button>
    `).join("");

    // ── Infographic pieces ──
    const figs = csFigures(cs);
    const figuresHTML = figs.length
      ? `<section class="cs-block cs-block--figures"><div class="cs-figs">${figs.map((f, i) => csMedallion(f, i)).join("")}</div></section>`
      : "";
    const specRows = csSpecRows(cs);
    const specHTML = specRows.map((s) => `
      <div class="cs-spec"><span class="cs-spec-label">${escapeHtml(s.label.toUpperCase())}</span><span class="cs-spec-val">${escapeHtml(s.val)}</span></div>`).join("");

    let mediaHTML = "";
    if (cs.heroMedia) {
      mediaHTML = cs.heroMedia.type === "pdf"
        ? `<div class="cs-hero-media cs-hero-media--pdf"><iframe src="${escapeHtml(cs.heroMedia.src)}#view=FitH&toolbar=0" title="${escapeHtml(cs.title)} PDF" loading="lazy" class="ev-pdf-frame"></iframe></div>`
        : `<div class="cs-hero-media"><img src="${escapeHtml(cs.heroMedia.src)}" alt="${escapeHtml(cs.title)}" loading="lazy" onerror="this.closest('.cs-hero-media').remove()"></div>`;
    }

    // Split the retrospective: first paragraph as a big pulled lede, rest as body.
    const retro = (cs.outcomes.retrospective || "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const retroLede = retro[0] || "";
    const retroBody = retro.slice(1);

    root.innerHTML = `
      <div class="fx is-single cs-info" data-view="case-studies" style="--cs-accent:${cs.accentColor}">
        <div class="fx-tabrow">
          <button type="button" class="fx-ftab fx-ftab--home" data-fx-home title="Home">${FOLIO_ICONS.home}</button>
          <button type="button" class="fx-ftab fx-ftab--roles" data-fx-tab="roles">roles</button>
          <button type="button" class="fx-ftab fx-ftab--clients" data-fx-tab="clients">clients</button>
          <button type="button" class="fx-ftab fx-ftab--case-studies is-active" data-fx-tab="case-studies">case studies</button>
        </div>
        <div class="fx-sheet">
          <header class="fx-chrome">
            <div class="fx-heading">
              <span class="fx-crumb"><button type="button" class="fx-crumb-btn" data-cs-back>case studies</button></span>
              <span class="fx-crumb-sep">/</span>
              <span class="fx-crumb fx-crumb--current">${escapeHtml(cs.title.toLowerCase())}</span>
            </div>
            <div class="fx-meta"></div>
          </header>
          <div class="fx-body">
            <aside class="fx-sidebar">${sidebarHTML}</aside>
            <main class="fx-main cs-info-scroll" style="--cs-accent:${cs.accentColor}">

              <!-- HERO BANNER -->
              <header class="cs-hero">
                <span class="cs-hero-corner cs-hero-corner--tl" aria-hidden="true"></span>
                <span class="cs-hero-corner cs-hero-corner--br" aria-hidden="true"></span>
                <div class="cs-hero-head">
                  <div class="cs-hero-mark">${thumb
                    ? `<img src="${escapeHtml(thumb)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'cs-hero-glyph',textContent:'${cs.glyph}'}))">`
                    : `<span class="cs-hero-glyph">${cs.glyph}</span>`}</div>
                  <div class="cs-hero-titles">
                    <p class="cs-kicker">Case Study · ${escapeHtml(cs.status)}</p>
                    <h1 class="cs-title">${escapeHtml(cs.title.toUpperCase())}</h1>
                    <ul class="cs-ficha">
                      <li><b>Role</b>${escapeHtml(cs.role)}</li>
                      <li><b>Span</b>${escapeHtml(cs.years)}</li>
                      ${specRows[0] ? `<li><b>${escapeHtml(specRows[0].label)}</b>${escapeHtml(specRows[0].val)}</li>` : ""}
                    </ul>
                  </div>
                </div>
                ${mediaHTML}
              </header>

              <!-- KEY FIGURES -->
              ${figuresHTML}

              <!-- SPECS + PIPELINE -->
              <div class="cs-split">
                ${specHTML ? `<aside class="cs-block cs-block--specs"><h2 class="cs-h2"><span>Profile</span></h2><div class="cs-specs">${specHTML}</div></aside>` : ""}
                <section class="cs-block cs-block--flow">
                  <h2 class="cs-h2"><span>Pipeline</span><i>how it ran</i></h2>
                  <p class="cs-lede">${escapeHtml(cs.pipeline.description)}</p>
                  <ol class="cs-flow">${csFlow(cs)}</ol>
                </section>
              </div>

              <!-- TIMELINE -->
              <section class="cs-block cs-block--timeline">
                <h2 class="cs-h2"><span>Chronology</span><i>${cs.milestones.length} milestones</i></h2>
                <ol class="cs-tl">${csTimeline(cs)}</ol>
              </section>

              <!-- OUTCOMES -->
              <section class="cs-block cs-block--outcomes">
                <h2 class="cs-h2"><span>Outcomes</span></h2>
                <div class="cs-chips">${cs.outcomes.metrics.map((m) => `<span class="cs-chip">${escapeHtml(m)}</span>`).join("")}</div>
                ${retroLede ? `<blockquote class="cs-pull">${escapeHtml(retroLede)}</blockquote>` : ""}
                ${retroBody.map((p) => `<p class="cs-body">${escapeHtml(p)}</p>`).join("")}
                <div class="cs-status">
                  <span class="cs-status-tag">Current Status</span>
                  <p>${escapeHtml(cs.outcomes.status)}</p>
                </div>
              </section>

              <!-- EVIDENCE -->
              ${csEvidence(cs)}

            </main>
          </div>
        </div>
      </div>
    `;

    // Bind event listeners
    const container = root.querySelector(".fx");
    container.addEventListener("click", handleClicks);
  }

  function handleClicks(e) {
    // 1. Home / other tabs
    const homeBtn = e.target.closest("[data-fx-home]");
    if (homeBtn) { closeNavPage(); return; }
    
    const tab = e.target.closest("[data-fx-tab]");
    if (tab) { openNavPage(tab.dataset.fxTab); return; }

    // 2. Folder click (landing -> detail)
    const folder = e.target.closest("[data-cs-folder]");
    if (folder) {
      activeId = folder.dataset.csFolder;
      render();
      return;
    }

    // 3. Sidebar row click (grid or detailed view)
    const srow = e.target.closest("[data-cs-srow]");
    if (srow) {
      activeId = srow.dataset.csSrow;
      render();
      return;
    }

    // 4. Back button
    const backBtn = e.target.closest("[data-cs-back]");
    if (backBtn) {
      activeId = null;
      render();
      return;
    }

    // 5. Ledger jump milestone click
    const jump = e.target.closest("[data-ledger-jump]");
    if (jump) {
      const entryId = Number(jump.dataset.ledgerJump);
      if (entryId) {
        state.editOriginNavView = "case-studies";
        closeNavPage();
        selectEntry(entryId, { zoom: true });
      }
      return;
    }

    // 6. Evidence tile → lightbox
    const lb = e.target.closest("[data-cs-lightbox]");
    if (lb) { openLightbox(lb.dataset.csLightbox, lb.dataset.csCap || ""); return; }
  }

  render();
}

// —— Client Logo Sticker Helper ——
function getClientLogoSticker(label) {
  const norm = String(label || "").toLowerCase().trim();
  if (norm.includes("aiesec")) return "public/stickers/client_aiesec.png";
  if (norm.includes("near")) return "public/stickers/client_near.png";
  if (norm.includes("semcom")) return "public/stickers/client_semcom.png";
  if (norm.includes("rabble")) return "public/stickers/client_rabble.png";
  if (norm.includes("shivanata") || norm.includes("buddy")) return "public/stickers/client_buddy.png";
  if (norm.includes("cross.pet") || norm.includes("crosspet")) return "public/stickers/client_crosspet.png";
  if (norm.includes("kindhealth")) return "public/stickers/client_kindhealth.png";
  if (norm.includes("mk engineering") || norm.endsWith("mke") || norm.includes("mk eng")) return "public/stickers/client_mke.png";
  if (norm.includes("village tea") || norm.includes("myvillagetea")) return "public/stickers/client_myvillagetea.png";
  if (norm.includes("silver dragon")) return "public/stickers/client_silver_dragon.png";
  if (norm.includes("wow")) return "public/stickers/client_wow.png";
  if (norm.includes("glam")) return "public/stickers/House of Glam All Logo.png";
  if (norm.includes("arahantas")) return "public/stickers/arahantas logo.svg";
  if (norm.includes("yogesh khaman")) return "public/stickers/yogesh khaman logo.webp";
  if (norm.includes("haus of pixels") || norm.includes("haus logo")) return "public/stickers/haus logo.webp";
  if (norm.includes("self") || norm.includes("independent") || norm.includes("anirudh")) return "public/stickers/client_anirudh.png";
  return null;
}

// ── Folio finder/explorer (Figma "Folio" redesign) ──────────────────────
// Master-detail: folder grid (buckets) → click a folder → that bucket's
// entries become the left sidebar; the selected entry's single page renders
// in the right "bento" box. A selection rectangle tracks the active folder.
// Used by BOTH the Roles and Clients tabs. Fades grid↔bento; back reverses.
function renderFolioExplorer({ view, title, eyebrow, groups, totalEntries, totalGroups, editing }) {
  const folderColor = (g, i) => g[2]?.color || ["#F23B21", "#E1FA3C", "#8A9AA0", "#C8923B", "#9AA878", "#c8c0e0"][i % 6];
  const folderIcon = (g) => FOLIO_ICONS[g[2]?.key] || "";
  const lower = (s) => String(s || "").toLowerCase();

  // Each folder previews its first evidence image (a logo / still) when it has
  // one, so a client/role folder reads as the work it holds — not a blank tab.
  const foldersHTML = groups.map((g, i) => {
    const [label, list] = g;
    const color = folderColor(g, i);
    
    let thumb;
    if (view === "roles" && g[2]?.key) {
      const roleStickers = {
        MovingImages: "public/stickers/sticker_moving_images.png",
        VisualSystems: "public/stickers/sticker_visual_systems.png",
        CompCulture: "public/stickers/sticker_comp_culture.png",
        DocResearch: "public/stickers/sticker_doc_research.png",
        LeadershipEdu: "public/stickers/sticker_leadership_edu.png",
        Life: "public/stickers/sticker_life.png",
      };
      thumb = roleStickers[g[2].key] || getFirstImage(list);
    } else if (view === "clients") {
      thumb = getClientLogoSticker(label) || getFirstImage(list);
    } else {
      thumb = getFirstImage(list);
    }

    const isSticker = thumb && (thumb.includes("/stickers/") || thumb.includes("logo") || thumb.includes("Logo") || thumb.includes("img.icons8.com"));
    // No logo/preview → fan the roles this folder's work covers (per-role
    // stickers) over the glyph, so an unbranded client still reads as its craft.
    const inner = thumb
      ? `<img class="fx-folder-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" style="${isSticker ? "object-fit:contain;padding:12px;box-sizing:border-box;" : ""}" onerror="this.remove()">`
      : `<span class="fx-folder-glyph">${folderIcon(g)}</span>${renderStickleFan(clientStickleIds(list), { size: 200, extraClass: "fx-folder-fan" })}`;
    return `<button type="button" class="fx-folder" data-fx-folder="${i}" style="--fc:${color}">
      <span class="fx-folder-art">${inner}</span>
      <span class="fx-folder-label">${escapeHtml(lower(label))}</span>
      <span class="fx-folder-count">${list.length}</span>
    </button>`;
  }).join("");

  const sidebarGrid = groups.map((g, i) => {
    const [label, list] = g;
    return `<button type="button" class="fx-srow" data-fx-srow="${i}">
      <span class="fx-srow-label">${escapeHtml(lower(label))}</span>
      <span class="fx-srow-count">${list.length}</span>
    </button>`;
  }).join("");

  // Clients grid: the left rail is a role-THEME index (a different cut than the
  // A–Z client folders on the right), so the two panes no longer duplicate. Each
  // theme filters the visible client folders. Roles keeps the folder-nav rail.
  const groupThemes = groups.map((g) => {
    const t = new Set();
    for (const e of g[1]) for (const k of getEntryThemes(e)) t.add(k);
    return t;
  });
  let gridSidebarHTML = sidebarGrid;
  if (view === "clients") {
    const themeCount = new Map();
    groupThemes.forEach((t) => t.forEach((k) => themeCount.set(k, (themeCount.get(k) || 0) + 1)));
    const themeRows = ROLE_PILLS.filter((p) => themeCount.has(p.key)).map((p) => `
      <button type="button" class="fx-srow fx-srow--theme" data-fx-theme="${p.key}">
        <span class="fx-srow-dot" style="background:${p.color}"></span>
        <span class="fx-srow-label">${escapeHtml(lower(p.label))}</span>
        <span class="fx-srow-count">${themeCount.get(p.key)}</span>
      </button>`).join("");
    gridSidebarHTML = `
      <button type="button" class="fx-srow fx-srow--theme is-active" data-fx-theme="all">
        <span class="fx-srow-dot fx-srow-dot--all"></span>
        <span class="fx-srow-label">all clients</span>
        <span class="fx-srow-count">${groups.length}</span>
      </button>${themeRows}`;
  }

  els.navPageInner.innerHTML = `
    <div class="fx" data-view="${view}">
      <div class="fx-tabrow">
        <button type="button" class="fx-ftab fx-ftab--home" data-fx-home title="Home">${FOLIO_ICONS.home}</button>
        <button type="button" class="fx-ftab fx-ftab--roles ${view === "roles" ? "is-active" : ""}" data-fx-tab="roles">roles</button>
        <button type="button" class="fx-ftab fx-ftab--clients ${view === "clients" ? "is-active" : ""}" data-fx-tab="clients">clients</button>
        <button type="button" class="fx-ftab fx-ftab--case-studies" data-fx-tab="case-studies">case studies</button>
      </div>
      <div class="fx-sheet">
        <header class="fx-chrome">
          <div class="fx-heading"><span class="fx-heading-icon" data-fx-heading-icon></span><span data-fx-heading-text>${escapeHtml(title)}</span></div>
          <div class="fx-meta">
            <span>projects <b data-fx-meta-projects>${totalEntries}</b></span>
            <span>${view === "roles" ? "roles" : "clients"} <b data-fx-meta-groups>${totalGroups}</b></span>
            <button type="button" class="fx-codex-btn" data-action="toggle-codex">list</button>
            ${editing ? `<button type="button" class="fx-codex-btn" data-action="add-entry">+ add</button>` : ""}
          </div>
        </header>
        <div class="fx-body">
          <aside class="fx-sidebar" data-fx-sidebar>${gridSidebarHTML}</aside>
          <main class="fx-main">
            <div class="fx-grid" data-fx-grid>
              <span class="fx-selrect" data-fx-selrect></span>
              ${foldersHTML}
            </div>
            <div class="fx-files" data-fx-files aria-hidden="true"></div>
            <div class="fx-codex" data-fx-codex aria-hidden="true">
              <img class="fx-codex-stage" data-fx-codex-stage alt="">
              <div class="fx-codex-track" data-fx-codex-track></div>
            </div>
            <section class="fx-single" data-fx-single aria-hidden="true"></section>
          </main>
        </div>
      </div>
    </div>`;

  const root = els.navPageInner.querySelector(".fx");
  const grid = root.querySelector("[data-fx-grid]");
  const selrect = root.querySelector("[data-fx-selrect]");
  const sidebar = root.querySelector("[data-fx-sidebar]");
  const codexEl = root.querySelector("[data-fx-codex]");
  const codexTrack = root.querySelector("[data-fx-codex-track]");
  const codexStage = root.querySelector("[data-fx-codex-stage]");
  const filesEl = root.querySelector("[data-fx-files]");
  const codexBtn = root.querySelector('[data-action="toggle-codex"]');
  const single = root.querySelector("[data-fx-single]");
  const headingText = root.querySelector("[data-fx-heading-text]");
  const headingIcon = root.querySelector("[data-fx-heading-icon]");
  const metaProjects = root.querySelector("[data-fx-meta-projects]");
  const metaGroups = root.querySelector("[data-fx-meta-groups]");
  const folderEls = Array.from(grid.querySelectorAll(".fx-folder"));
  let activeBucket = -1;   // -1 = grid mode
  let selFolderIdx = 0;
  let mode = "grid";       // grid | codex | single
  let singleFx = null;     // artifact cinematics teardown

  // Move the tracking rectangle behind a folder (fluid; CSS transition).
  function moveSelTo(idx) {
    const el = folderEls[idx];
    if (!el) { selrect.style.opacity = "0"; return; }
    const pad = 12;
    const w = el.offsetWidth + pad * 2;
    const h = el.offsetHeight + pad * 2;
    const x = el.offsetLeft - pad;
    const y = el.offsetTop - pad;
    selrect.style.opacity = "1";
    selrect.style.width = w + "px";
    selrect.style.height = h + "px";
    selrect.style.transform = `translate(${x}px, ${y}px)`;
    // Only the folder-nav rail (roles view) mirrors the folder index; the clients
    // theme rail (data-fx-theme) must not light up by positional index.
    sidebar.querySelectorAll(".fx-srow[data-fx-srow]").forEach((r, i) => r.classList.toggle("is-peek", i === idx));
  }

  // Clients role-theme filter: dim client folders that don't touch the theme.
  let activeTheme = "all";
  function applyThemeFilter(key) {
    activeTheme = key;
    sidebar.querySelectorAll(".fx-srow--theme").forEach((r) => r.classList.toggle("is-active", r.dataset.fxTheme === key));
    folderEls.forEach((el, i) => {
      el.style.display = (key === "all" || groupThemes[i]?.has(key)) ? "" : "none";
    });
    const firstVisible = folderEls.findIndex((el) => el.style.display !== "none");
    if (firstVisible >= 0) { selFolderIdx = firstVisible; requestAnimationFrame(() => moveSelTo(firstVisible)); }
    else selrect.style.opacity = "0";
  }

  const entryHero = (entry) => evidencePreviewSrc(entry);

  // Codex — indrajaal big-type list of the bucket's entries + centred stage img.
  function buildCodex(list) {
    codexTrack.innerHTML = list.map((e) => {
      const hero = entryHero(e);
      return `<button type="button" class="fx-codex-row" data-fx-entry="${e.id}"${hero ? ` data-hero="${escapeHtml(hero)}"` : ""}>
        <span class="fx-codex-row-title">${escapeHtml(e.title || "Untitled")}</span>
        <span class="fx-codex-row-meta">${escapeHtml([e.year, e.role, e.org].filter(Boolean).join("   ·   "))}</span>
      </button>`;
    }).join("");
    codexStage.classList.remove("is-on");
    codexTrack.querySelectorAll(".fx-codex-row").forEach((row) => {
      row.addEventListener("mouseenter", () => {
        codexTrack.querySelectorAll(".fx-codex-row").forEach((r) => r.classList.remove("is-hot"));
        row.classList.add("is-hot");
        const h = row.dataset.hero;
        if (h) { if (codexStage.getAttribute("src") !== h) codexStage.src = h; codexStage.classList.add("is-on"); }
        else codexStage.classList.remove("is-on");
      });
    });
  }
  codexEl.addEventListener("mousemove", (e) => {   // preview follows the cursor
    codexStage.style.left = e.clientX + "px";
    codexStage.style.top = e.clientY + "px";
  });
  codexEl.addEventListener("mouseleave", () => {
    codexStage.classList.remove("is-on");
    codexTrack.querySelectorAll(".fx-codex-row").forEach((r) => r.classList.remove("is-hot"));
  });

  // File cards — Windows-Explorer "icons" view of a folder's entries. Each card
  // = evidence thumbnail (or the bucket's role glyph) + title + meta. This is the
  // DEFAULT bucket view; the big-type codex survives behind the `list` toggle.
  function buildFiles(list, glyph) {
    filesEl.innerHTML = list.map((e) => {
      const hero = entryHero(e);
      const meta = [e.year, e.role].filter(Boolean).join("  ·  ");
      // Base = the role glyph; thumbnail-less cards get a fanned stack of the
      // entry's ROLE stickers (one per role) instead of the bare glyph. A
      // present evidence thumb overlays the lot (onerror reveals what's beneath).
      const art = `<span class="fx-file-ico">${glyph || ""}</span>${
        hero ? "" : renderStickleFan(entryStickleIds(e), { size: 200, extraClass: "fx-file-fan" })
      }${
        hero ? `<img class="fx-file-thumb" src="${escapeHtml(hero)}" alt="" loading="lazy" onerror="this.remove()">` : ""
      }`;
      return `<button type="button" class="fx-file" data-fx-entry="${e.id}">
        <span class="fx-file-art">${art}</span>
        <span class="fx-file-title">${escapeHtml(e.title || "Untitled")}</span>
        <span class="fx-file-meta">${escapeHtml(meta)}</span>
      </button>`;
    }).join("");
  }

  // Single page — gallery-artifact style. Delegates to the shared top-level
  // builder so the nav-page detail and the full-screen expand never drift.
  function buildEntryArtifact(entry) {
    return buildEntryArtifactHTML(entry);
  }

  function setActiveEntry(id) {
    sidebar.querySelectorAll(".fx-srow--entry").forEach((r) => r.classList.toggle("is-active", Number(r.dataset.fxEntry) === id));
    codexTrack.querySelectorAll(".fx-codex-row").forEach((r) => r.classList.toggle("is-active", Number(r.dataset.fxEntry) === id));
  }

  // Breadcrumb in the chrome: roles / moving images / Entry — earlier crumbs
  // are clickable to jump up two levels.
  function setCrumb(level, bucketLabel, entryTitle) {
    const crumbs = [{ label: title, target: "grid", current: level === "grid" }];
    if (level === "codex" || level === "single") crumbs.push({ label: String(bucketLabel || "").toLowerCase(), target: "codex", current: level === "codex" });
    if (level === "single") crumbs.push({ label: entryTitle || "", target: null, current: true });
    headingText.innerHTML = crumbs.map((c) => c.current
      ? `<span class="fx-crumb fx-crumb--current">${escapeHtml(c.label)}</span>`
      : `<button type="button" class="fx-crumb" data-crumb="${c.target}">${escapeHtml(c.label)}</button>`
    ).join('<span class="fx-crumb-sep">/</span>');
  }

  function showSingle(entry) {
    if (!entry) return;
    mode = "single";
    root.classList.add("is-single");
    root.classList.remove("is-list");
    // In the detail view the sidebar becomes the bucket's entry list, so you can
    // hop between projects without going back (Explorer preview-pane behaviour).
    const siblings = groups[activeBucket]?.[1] || [];
    sidebar.innerHTML = siblings.map((e) => `<button type="button" class="fx-srow fx-srow--entry" data-fx-entry="${e.id}">
      <span class="fx-srow-label">${escapeHtml(e.title || "Untitled")}</span>
      <span class="fx-srow-meta">${escapeHtml([e.year, e.role].filter(Boolean).join(" · "))}</span>
    </button>`).join("");
    setActiveEntry(entry.id);
    setCrumb("single", groups[activeBucket]?.[0], entry.title || "Untitled");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    single.scrollTop = 0;
    // Indrajaal artifact layout — same builder as the full-screen expand so the
    // inline detail and the fullscreen view stay one visual language. The
    // fx-expand button is the affordance to promote it to full screen.
    single.style.removeProperty("--fill");
    single.style.removeProperty("--ink");
    single.innerHTML = `<button type="button" class="fx-expand" data-expand-id="${entry.id}" aria-label="Expand to full screen" title="Expand to full screen">⤢ <span>Full screen</span></button>${buildEntryArtifactHTML(entry)}`;
    wireArtifactThumbs(single);
    if (typeof init3DPlane === "function") singleFx = init3DPlane(single);
  }

  function openBucket(idx) {
    const g = groups[idx];
    if (!g) return;
    activeBucket = idx;
    selFolderIdx = idx;
    mode = "codex";
    const [label, list] = g;
    root.classList.add("is-codex");
    root.classList.remove("is-single", "is-list");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    setCrumb("codex", label);
    
    // Use the same sticker logic as the grid folders for the heading icon
    let headingThumb;
    if (view === "roles" && g[2]?.key) {
      const roleStickers = {
        MovingImages: "public/stickers/sticker_moving_images.png",
        VisualSystems: "public/stickers/sticker_visual_systems.png",
        CompCulture: "public/stickers/sticker_comp_culture.png",
        DocResearch: "public/stickers/sticker_doc_research.png",
        LeadershipEdu: "public/stickers/sticker_leadership_edu.png",
        Life: "public/stickers/sticker_life.png",
      };
      headingThumb = roleStickers[g[2].key] || getFirstImage(list);
    } else if (view === "clients") {
      headingThumb = getClientLogoSticker(label) || getFirstImage(list);
    } else {
      headingThumb = getFirstImage(list);
    }
    
    const isSticker = headingThumb && (headingThumb.includes("/stickers/") || headingThumb.includes("logo") || headingThumb.includes("Logo") || headingThumb.includes("img.icons8.com"));
    headingIcon.innerHTML = headingThumb
      ? `<img src="${escapeHtml(headingThumb)}" alt="" loading="lazy" style="${isSticker ? "object-fit:contain;width:36px;height:36px;" : "width:36px;height:36px;"}" onerror="this.remove()">`
      : `<span class="fx-folder-glyph">${folderIcon(g)}</span>`;
    headingIcon.style.color = folderColor(g, idx);
    const distinctRoles = new Set();
    list.forEach((e) => (e.roles || (e.role ? [e.role] : [])).forEach((r) => distinctRoles.add(r)));
    metaProjects.textContent = list.length;
    metaGroups.textContent = distinctRoles.size;
    // Sidebar stays the FOLDER nav (Explorer left pane) so you can hop folders;
    // the entries live in the right pane as file cards (no duplicate list).
    sidebar.innerHTML = sidebarGrid;
    sidebar.querySelector(`[data-fx-srow="${idx}"]`)?.classList.add("is-active");
    if (codexBtn) codexBtn.textContent = "list";
    buildFiles(list, folderIcon(g));
  }

  function goGrid() {
    root.classList.remove("is-single", "is-codex", "is-list");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    activeBucket = -1;
    mode = "grid";
    headingIcon.innerHTML = "";
    if (codexBtn) codexBtn.textContent = "list";
    setCrumb("grid");
    metaProjects.textContent = totalEntries;
    metaGroups.textContent = totalGroups;
    sidebar.innerHTML = gridSidebarHTML;
    // Restore the clients theme filter if one was active before drilling in.
    if (view === "clients" && activeTheme !== "all") applyThemeFilter(activeTheme);
    else requestAnimationFrame(() => moveSelTo(selFolderIdx));
  }

  function goCodex() {
    root.classList.remove("is-single");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    mode = "codex";
    const g = groups[activeBucket];
    if (g) setCrumb("codex", g[0]);
  }

  // Hover (grid mode) → rectangle tracks the folder; leave → return to selected.
  folderEls.forEach((el, i) => {
    el.addEventListener("mouseenter", () => { if (mode === "grid") moveSelTo(i); });
  });
  grid.addEventListener("mouseleave", () => { if (mode === "grid") moveSelTo(selFolderIdx); });

  // Clicks (delegated).
  root.addEventListener("click", (e) => {
    const homeBtn = e.target.closest("[data-fx-home]");
    if (homeBtn) { closeNavPage(); return; }
    const tab = e.target.closest("[data-fx-tab]");
    if (tab) { openNavPage(tab.dataset.fxTab); return; }
    // NOTE: the `list` button (data-action="toggle-codex") is handled by the
    // nav-level handler in renderNavPage (it swaps to the .np-codex list view).
    // Don't intercept it here, or the two fight and the re-render wipes .fx.
    const crumb = e.target.closest("[data-crumb]");
    if (crumb) { crumb.dataset.crumb === "grid" ? goGrid() : openBucket(activeBucket); return; }
    const themeRow = e.target.closest("[data-fx-theme]");
    if (themeRow) { applyThemeFilter(themeRow.dataset.fxTheme); return; }
    const folder = e.target.closest("[data-fx-folder]");
    if (folder) { 
      selFolderIdx = Number(folder.dataset.fxFolder);
      // Clients with single project: open directly to the project view
      if (view === "clients") {
        const g = groups[selFolderIdx];
        if (g && g[1].length === 1) {
          showSingle(g[1][0]);
          return;
        }
      }
      openBucket(selFolderIdx); 
      return; 
    }
    const srowBucket = e.target.closest("[data-fx-srow]:not([data-fx-theme])");
    if (srowBucket) { 
      selFolderIdx = Number(srowBucket.dataset.fxSrow);
      // Clients with single project: open directly to the project view
      if (view === "clients") {
        const g = groups[selFolderIdx];
        if (g && g[1].length === 1) {
          showSingle(g[1][0]);
          return;
        }
      }
      openBucket(selFolderIdx); 
      return; 
    }
    const entryRow = e.target.closest("[data-fx-entry]");
    if (entryRow) {
      const id = Number(entryRow.dataset.fxEntry);
      // Prefer the active bucket's list so a merged synthetic (Pixelate /
      // KindHealth) opens with its combined evidence, not the bare primary entry.
      const ent = (groups[activeBucket]?.[1] || []).find((x) => x.id === id) || entries.find((x) => x.id === id);
      if (ent) showSingle(ent);
      return;
    }
  });

  requestAnimationFrame(() => moveSelTo(selFolderIdx));
  const onResize = () => {
    if (!root.isConnected) { window.removeEventListener("resize", onResize); return; }
    if (activeBucket < 0) moveSelTo(selFolderIdx);
  };
  window.addEventListener("resize", onResize);
}

function openNavPage(view) {
  if (!els.navPage || !els.navPageInner) return;
  navCodexActive = false;
  navPageState.view = view;
  renderNavPage();
  els.navPage.classList.add("visible");
  els.navPage.setAttribute("aria-hidden", "false");
  
  // Sync top navigation active link
  els.navLinks?.forEach((l) => {
    l.classList.toggle("active", l.dataset.view === view);
  });
}

// Track codex view state for roles/clients
let navCodexActive = false;

let _navCodexCleanup = null;

function renderNavPage() {
  const view = navPageState.view;
  if (!view) return;

  // Clean up previous codex scroller
  if (_navCodexCleanup) { _navCodexCleanup(); _navCodexCleanup = null; }
  els.navPage?.classList.remove("codex-mode");

  let title;
  let eyebrow;
  let groups;      // [[groupLabel, entries[], bucketObj?], ...]
  let groupedByBucket = false;

  if (view === "case-studies") {
    renderCaseStudiesExplorer();
    return;
  }

  if (view === "roles") {
    title = "ROLES";
    eyebrow = `Master · ${ROLE_PILLS.length} CV categories`;
    groups = groupEntriesByBucket();
    groupedByBucket = true;
  } else if (view === "clients") {
    title = "CLIENTS";
    eyebrow = "Master · orgs & clients";
    groups = buildClientGroups();
  } else {
    return;
  }

  // Count UNIQUE entries that actually appear in this view's groups. Entries
  // can be themed under multiple role buckets (e.g. a film with both Director
  // and Editor); a flat entries.length over-counts (header says fewer than the
  // sum of folder counts) AND mis-reports the view (entries with no theme or
  // no client don't appear here, so they shouldn't be totalled).
  const uniqueIds = new Set();
  for (const g of groups) for (const e of g[1] || []) uniqueIds.add(e.id);
  const totalEntries = uniqueIds.size;
  const totalGroups = groups.length;
  const editing = Boolean(state.editMode);

  if (navCodexActive) {
    // ── CODEX VIEW — indrajaal big-type scroller ────────────────────
    // Build combined shuffled evidence
    const allEvidence = [];
    for (const g of groups) {
      const list = g[1];
      for (const e of list) {
        if (Array.isArray(e.evidence)) {
          for (const ev of e.evidence) {
            allEvidence.push({ ...ev, entryTitle: e.title, entryId: e.id, groupLabel: g[0] });
          }
        }
      }
    }
    // Shuffle
    for (let i = allEvidence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allEvidence[i], allEvidence[j]] = [allEvidence[j], allEvidence[i]];
    }

    const codexRowsHTML = allEvidence.slice(0, 120).map((ev) => `
      <div class="np-codex-row" data-entry-id="${ev.entryId}" data-ev-src="${escapeHtml(ev.src || "")}">
        <div class="np-codex-row-type">${escapeHtml(ev.caption || ev.entryTitle || "Untitled")}</div>
        <div class="np-codex-row-meta">${escapeHtml(ev.type)} · ${escapeHtml(ev.groupLabel || "")} · ${escapeHtml(ev.entryTitle || "")}</div>
      </div>`).join("");

    els.navPage.classList.add("codex-mode");
    els.navPageInner.innerHTML = `
      <div class="np-codex">
        <div class="np-codex-header">
          <span class="np-codex-label">${escapeHtml(title)} · LIST</span>
          <button type="button" class="np-codex-back" data-action="toggle-codex">FOLDER VIEW</button>
        </div>
        <div class="np-codex-view" id="navCodexView">
          <img class="np-codex-stage" id="navCodexStage" src="" alt="">
          <div class="np-codex-track" id="navCodexTrack">
            <div class="np-codex-set">${codexRowsHTML}</div>
            <div class="np-codex-set">${codexRowsHTML}</div>
          </div>
        </div>
      </div>`;

    // Init indrajaal scroller (trimmed copy of gallery initCodexScroller)
    const codexView = document.getElementById("navCodexView");
    const track = document.getElementById("navCodexTrack");
    const stage = document.getElementById("navCodexStage");
    if (codexView && track) {
      const firstSet = track.querySelector(".np-codex-set");
      let y = 0, targetY = 0, vy = 0;
      let half = firstSet ? firstSet.offsetHeight : 0;
      let dragging = false, lastY = 0, lastT = 0, moved = 0;
      let mx = innerWidth / 2, my = innerHeight / 2, curId = null;
      let rowEls = [], raf = null, justDragged = false;

      const measure = () => {
        half = firstSet ? firstSet.offsetHeight : 0;
        rowEls = [...track.querySelectorAll(".np-codex-row[data-entry-id]")];
      };
      measure();

      const wrap = () => {
        if (half <= 0) return;
        while (y <= -half) { y += half; targetY += half; }
        while (y > 0) { y -= half; targetY -= half; }
      };

      const updateHover = () => {
        const hit = document.elementFromPoint(mx, my);
        const row = hit && hit.closest ? hit.closest(".np-codex-row[data-entry-id]") : null;
        const id = row ? row.dataset.entryId : null;
        if (id === curId) return;
        rowEls.forEach((r) => r.classList.remove("is-active"));
        curId = id;
        if (id && stage) {
          rowEls.forEach((r) => { if (r.dataset.entryId === id) r.classList.add("is-active"); });
          const src = row ? row.dataset.evSrc : "";
          if (src && stage.getAttribute("src") !== src) { stage.src = src; stage.classList.add("is-on"); }
          else { stage.classList.remove("is-on"); }
        } else {
          if (stage) stage.classList.remove("is-on");
        }
      };

      let hoverT = 0;
      const tick = () => {
        if (!dragging) { targetY += vy; vy *= 0.90; if (Math.abs(vy) < 0.05) vy = 0; }
        y += (targetY - y) * 0.16;
        if (Math.abs(targetY - y) < 0.1) y = targetY;
        wrap();
        track.style.transform = `translate3d(0, ${y}px, 0)`;
        const now = performance.now();
        if (now - hoverT > 100) { hoverT = now; updateHover(); }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      // Row clicks
      const clickRow = (e) => {
        if (justDragged) return;
        const row = e.target.closest(".np-codex-row[data-entry-id]");
        if (!row) return;
        const id = Number(row.dataset.entryId);
        if (!id) return;
        navCodexActive = false;
        els.navPage.classList.remove("codex-mode");
        state.editOriginNavView = navPageState.view;
        closeNavPage();
        selectEntry(id, { zoom: true });
      };

      const onMouse = (e) => { mx = e.clientX; my = e.clientY; };
      const onDown = (e) => { dragging = true; vy = 0; lastY = e.clientY; lastT = performance.now(); moved = 0; };
      const onMove = (e) => {
        if (!dragging) return;
        const dy = e.clientY - lastY; targetY += dy; moved += Math.abs(dy);
        const now = performance.now(); const dt = now - lastT || 16;
        vy = (dy / dt) * 16; lastY = e.clientY; lastT = now;
      };
      const onUp = () => {
        if (!dragging) return; dragging = false;
        if (moved > 6) { justDragged = true; setTimeout(() => { justDragged = false; }, 60); }
      };
      const onWheel = (e) => { e.preventDefault(); targetY -= e.deltaY * 1.1; vy = 0; };

      codexView.addEventListener("click", clickRow);
      window.addEventListener("mousemove", onMouse);
      codexView.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      codexView.addEventListener("wheel", onWheel, { passive: false });

      // Re-measure after images/contents settle
      setTimeout(measure, 350);

      _navCodexCleanup = () => {
        cancelAnimationFrame(raf);
        codexView.removeEventListener("click", clickRow);
        window.removeEventListener("mousemove", onMouse);
        codexView.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        codexView.removeEventListener("wheel", onWheel);
        if (stage) stage.classList.remove("is-on");
      };
    }
  } else {
    // ── MANILA FOLDER VIEW (default) ───────────────────────────────
    const projectRow = (entry) => {
      const meta = [entry.role, entry.org, formatDate(entry)].filter(Boolean).join(" · ");
      return `
        <li class="np-project">
          <button type="button" class="np-project-jump" data-entry-jump="${entry.id}">
            <span class="np-project-title">${escapeHtml(entry.title || "Untitled project")}</span>
            <span class="np-project-meta">${escapeHtml(meta)}</span>
          </button>
          ${editing ? `<button type="button" class="nav-entry-edit" data-entry-edit="${entry.id}">EDIT</button>` : ""}
        </li>`;
    };
    const projectList = (list) =>
      `<ul class="np-projects">${[...list].sort((a, b) => dateNumber(b) - dateNumber(a)).map(projectRow).join("")}</ul>`;

    // Roles drill one level deeper — uses entry.roles[] (canonical split) so each
    // compound entry adds +1 to each individual role bucket. Only roles relevant to
    // the current theme are shown.
    const roleSubgrid = (list, bucketObj) => {
      const allowed = new Set(bucketObj?.themeRoles || []);
      const byRole = new Map();
      for (const e of list) {
        const roles = e.roles || (e.role ? [e.role] : []);
        for (const r of roles) {
          if (allowed.size && !allowed.has(r)) continue;
          if (!byRole.has(r)) byRole.set(r, []);
          byRole.get(r).push(e);
        }
      }
      const subs = [...byRole.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
      return `<div class="np-subgrid">${subs.map(([role, rl]) => `
        <div class="np-subfolder">
          <button type="button" class="np-subtab" data-subbox-toggle>
            <span class="np-subtab-title">${escapeHtml(role)}</span>
            <span class="np-subtab-count">${rl.length}</span>
          </button>
          <div class="np-subbody">${projectList(rl)}</div>
        </div>`).join("")}</div>`;
    };

    const groupRows = groups.map((g) => {
      const groupLabel = g[0];
      const list = g[1];
      const bucketObj = g[2];
      const color = bucketObj ? bucketObj.color : "#A89878";
      const ink = bucketObj ? bucketObj.ink : "#1A1714";
      const children = groupedByBucket ? roleSubgrid(list, bucketObj) : projectList(list);
      // Count distinct individual roles (from roles[]), filtered to this theme's allowed roles.
      let subCount = "";
      if (bucketObj) {
        const allowed = new Set(bucketObj.themeRoles || []);
        const distinctRoles = new Set();
        for (const e of list) {
          const rs = e.roles || (e.role ? [e.role] : []);
          for (const r of rs) {
            if (!allowed.size || allowed.has(r)) distinctRoles.add(r);
          }
        }
        subCount = `${distinctRoles.size} role${distinctRoles.size === 1 ? "" : "s"} · `;
      }
      return `
        <div class="np-folder" style="--box-color:${color};--box-ink:${ink}">
          <button type="button" class="np-tab" data-box-toggle>
            <span class="np-swatch" style="background:${color}"></span>
            <span class="np-tab-title">${escapeHtml(groupLabel)}</span>
            <span class="np-tab-count">${subCount}${list.length} project${list.length === 1 ? "" : "s"}</span>
          </button>
          <div class="np-body">${children}</div>
        </div>`;
    }).join("");

    // Folio finder/explorer (replaces the old np-grid folder list).
    renderFolioExplorer({ view, title, eyebrow, groups, totalEntries, totalGroups, editing });
  }

  // Wire entry jumps (common to both views)
  els.navPageInner.querySelectorAll("[data-entry-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.entryJump);
      state.editOriginNavView = navPageState.view;
      closeNavPage();
      selectEntry(id, { zoom: true });
    });
  });

  // Wire codex/folder toggle
  els.navPageInner.querySelector('[data-action="toggle-codex"]')?.addEventListener("click", () => {
    navCodexActive = !navCodexActive;
    renderNavPage();
  });

  const addBtn = els.navPageInner.querySelector('[data-action="add-entry"]');
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const seed = {};
      if (view === "roles") seed.role = "";
      if (view === "clients") seed.org = "";
      try {
        const resp = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(seed),
        });
        if (!resp.ok) throw new Error(`create ${resp.status}`);
        const j = await resp.json();
        entries.push(j.entry);
        entries.sort((a, b) => dateNumber(a) - dateNumber(b));
        const mk = `${j.entry.year}-${String(j.entry.month || 1).padStart(2, "0")}`;
        if (!entriesByMonth.has(mk)) entriesByMonth.set(mk, []);
        entriesByMonth.get(mk).push(j.entry);
        state.editingEntryId = j.entry.id;
        state.selectedEntryId = j.entry.id;
        closeNavPage();
        terrain?.selectEntry(j.entry, { focus: true });
        setTimeout(() => openProjectPage(j.entry), 220);
      } catch (err) {
        alert(`Couldn't create new project: ${err.message || err}`);
      }
    });
  }
}

function buildRoleSubfolders(list) {
  const byRole = new Map();
  for (const e of list) {
    const r = (e.role && String(e.role).trim()) || "Other";
    if (!byRole.has(r)) byRole.set(r, []);
    byRole.get(r).push(e);
  }
  const sorted = [...byRole.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const merged = new Map();
  for (const [role, elist] of sorted) {
    const rl = role.toLowerCase();
    if (rl.includes("photographer") && !rl.includes("unit still")) {
      const existing = merged.get("Photographer") || [];
      merged.set("Photographer", [...existing, ...elist]);
    } else {
      const existing = merged.get(role) || [];
      merged.set(role, [...existing, ...elist]);
    }
  }
  return [...merged.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([label, entries]) => ({ label, entries }));
}

function buildClientGroups() {
  // Reads the canonical fields written by scripts/normalize-roles-clients.mjs:
  //   clientCanonical     normalized client name (Self/Independent merged, AIESEC unified, Letsarc case-deduped)
  //   clientGroup         optional theme group; "Education" → green pill
  //   clientOutcome       optional label for green-pill entries (BBA-IT / Faculty / Design / Schooling / Certified Expert)
  //   excludeFromClients  true for Diana, Haus of Pixels, Life-only entries
  const grouped = new Map();
  const filtered = entries.filter((e) => matchesEntry(e, { ignoreRoleFilter: true }));
  for (const e of filtered) {
    if (e.excludeFromClients) continue;
    const name = (e.clientCanonical && String(e.clientCanonical).trim()) || "";
    if (!name) continue;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(e);
  }
  
  const pinnedOrder = ["Self", "Rabble", "Pixelate"];
  const pinned = [];
  const rest = [];
  
  for (const [label, list] of grouped.entries()) {
    const isPinned = pinnedOrder.some(p => label.toLowerCase().includes(p.toLowerCase()));
    if (isPinned) {
      pinned.push([label, list]);
    } else {
      rest.push([label, list]);
    }
  }
  
  // Sort pinned by the pinnedOrder
  pinned.sort((a, b) => {
    const aIdx = pinnedOrder.findIndex(p => a[0].toLowerCase().includes(p.toLowerCase()));
    const bIdx = pinnedOrder.findIndex(p => b[0].toLowerCase().includes(p.toLowerCase()));
    return aIdx - bIdx;
  });
  
  // Sort rest by latest work first (most recent entry date)
  rest.sort((a, b) => {
    const aLatest = Math.max(...a[1].map(e => dateNumber(e)));
    const bLatest = Math.max(...b[1].map(e => dateNumber(e)));
    return bLatest - aLatest;
  });
  
  const sorted = [...pinned, ...rest];
  
  return sorted.map(([label, list]) => {
    const isEdu = list.some((e) => e.clientGroup === "Education");
    const outcomes = isEdu ? [...new Set(list.map((e) => e.clientOutcome).filter(Boolean))] : [];
    const labelOut = isEdu && outcomes.length ? `${label} — ${outcomes.join(" / ")}` : label;
    const color = isEdu ? "#5B8C3E" : "#8A9AA0";
    // Pixelate / KindHealth collapse to one merged row here too.
    return [labelOut, collapseMergedEntries(list), { color, modalBg: color, ink: "#FFFFFF", clientGroup: isEdu ? "Education" : null }];
  });
}

function getFirstImage(entries) {
  for (const e of entries) {
    if (Array.isArray(e.evidence)) {
      for (const ev of e.evidence) {
        if (ev.type === "image" && ev.src) return ev.src;
      }
    }
  }
  return null;
}

function closeNavPage() {
  if (els.navPage) {
    els.navPage.classList.remove("visible");
    els.navPage.classList.remove("codex-mode");
    els.navPage.setAttribute("aria-hidden", "true");
  }
  if (_navCodexCleanup) { _navCodexCleanup(); _navCodexCleanup = null; }
  els.navLinks?.forEach((l) => {
    l.classList.toggle("active", l.dataset.view === "archive");
  });
}

function renderTags() {
  // Replaced by renderSearchChips() — search bar tag chips now handle filtering
}

// Pass 10: 2D view is a month × year calendar matrix.
// Rows = 12 months, columns = years (horizontal-scrolling), from 2009 on.
const MONTH_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
// The flat grid starts at the first working year (2009); earlier life events
// (1991 birth, schooling) live only in the 3D portfolio + nav lists.
const GRID_YEAR_START = 2009;
function gridYears() {
  return years.filter((y) => y >= GRID_YEAR_START);
}

function renderWeekHeader() {
  const cols = gridYears();
  document.documentElement.style.setProperty("--year-count", cols.length);
  els.weekHeader.replaceChildren();
  const corner = document.createElement("span");
  corner.className = "grid-corner";
  els.weekHeader.append(corner);
  for (const y of cols) {
    const label = document.createElement("span");
    label.className = "year-col-label";
    label.textContent = String(y);
    label.title = String(y);
    els.weekHeader.append(label);
  }
}

function renderGrid() {
  els.yearGrid.replaceChildren();
  monthCells.clear();
  const cols = gridYears();

  // Rows = months, columns = years (swapped axis, horizontal scroll).
  for (const month of months) {
    const row = document.createElement("div");
    row.className = "year-row";

    const label = document.createElement("div");
    label.className = "year-row-label";
    label.textContent = MONTH_ABBR[month - 1];
    row.append(label);

    for (const year of cols) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const monthEntries = entriesByMonth.get(monthKey) || [];
      // Sum weekly email counts that fall in this month for the tone heuristic.
      let emailCount = 0;
      for (const [wk, n] of Object.entries(data.weeklyEmailCounts || {})) {
        if (!wk.startsWith(`${year}-W`)) continue;
        const w = Number(wk.slice(6));
        // Rough month-of-week mapping — week × 7 / ~30
        const approxMonth = Math.min(12, Math.max(1, Math.ceil((w * 7) / 30.44)));
        if (approxMonth === month) emailCount += Number(n) || 0;
      }
      const tone = getTone(monthEntries.length, emailCount);
      const bucketKey = getDominantBucketKey(monthEntries);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cell${monthEntries.length ? " has-entry" : ""}`;
      cell.dataset.monthKey = monthKey;
      cell.dataset.tone = tone;
      if (bucketKey) cell.dataset.bucket = bucketKey;
      cell.setAttribute(
        "aria-label",
        `${year} ${MONTH_ABBR[month - 1]}: ${monthEntries.length} projects`,
      );

      cell.addEventListener("mouseenter", (event) => {
        showTooltip(event, monthKey, monthEntries, emailCount);
      });
      cell.addEventListener("mousemove", moveTooltip);
      cell.addEventListener("mouseleave", hideTooltip);
      cell.addEventListener("click", () => {
        if (monthEntries.length) selectEntry(getStrongestEntry(monthEntries).id, { zoom: true, scroll: true });
        else selectEmptyMonth(monthKey, emailCount, cell);
      });

      row.append(cell);
      monthCells.set(monthKey, cell);
    }

    els.yearGrid.append(row);
  }
}

// Click an empty month cell — same UX as the legacy selectEmptyWeek but
// keyed by YYYY-MM. Mostly cosmetic since the 3D scene already shows month buildings.
function selectEmptyMonth(monthKey, emailCount, cell) {
  document.querySelectorAll(".cell.active").forEach((c) => c.classList.remove("active"));
  if (cell) cell.classList.add("active");
  const [y, m] = monthKey.split("-").map(Number);
  // Show a friendly tooltip-style detail panel
  if (els.detailPanel) {
    els.detailPanel.classList.add("visible");
    els.detailPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
    els.detailPanel.innerHTML = `
      <button class="detail-close" id="detailCloseInner" type="button" aria-label="Close">×</button>
      <div class="detail-content">
        <h2>${escapeHtml(monthKey)}</h2>
        <p class="detail-description">No ledger entry attached to ${MONTH_ABBR[m - 1]} ${y} yet. Approximate email volume this month: ${emailCount.toLocaleString("en-IN")}.</p>
      </div>`;
    const closeBtn = els.detailPanel.querySelector("#detailCloseInner");
    if (closeBtn) closeBtn.addEventListener("click", hideDetail);
  }
}

function applyFilters() {
  const matching = new Set();         // weekKeys (terrain still uses weekKey internally)
  const matchingMonths = new Set();   // monthKeys (used to dim 2D cells)
  const filteredEntries = entries.filter((entry) => matchesEntry(entry));
  for (const entry of filteredEntries) {
    matching.add(entry.weekKey);
    matchingMonths.add(`${entry.year}-${String(entry.month || 1).padStart(2, "0")}`);
  }

  for (const [monthKey, cell] of monthCells.entries()) {
    const hasEntries = (entriesByMonth.get(monthKey) || []).length > 0;
    const shouldDim = (state.activeTags.size || state.search) && hasEntries && !matchingMonths.has(monthKey);
    cell.classList.toggle("filtered-out", Boolean(shouldDim));
  }

  const allActiveTags = new Set([...state.activeTags, ...state.activeTagInputs]);
  const filterText = [];
  if (allActiveTags.size) filterText.push([...allActiveTags].join(", "));
  if (state.search) filterText.push(`"${state.search}"`);
  
  if (els.activeSummary) {
    els.activeSummary.textContent = filterText.length ? "Filtered" : "All years";
  }
  if (els.visibleSummary) {
    els.visibleSummary.textContent = `${filteredEntries.length} of ${entries.length} projects visible`;
  }
  
  // Watermark text shows active tag chips
  if (els.watermarkText) {
    if (allActiveTags.size) {
      els.watermarkText.textContent = [...allActiveTags].join(" ");
      els.watermarkText.style.opacity = 1;
      if (window.gsap) gsap.fromTo(els.watermarkText, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.2, ease: "power3.out" });
    } else {
      els.watermarkText.style.opacity = 0;
    }
  }
  // Pass 09: hover preview key wins over the locked filter while a pill
  // is being hovered. effectiveRole drives the dim/highlight cascade.
  const effectiveRole = state.previewRoleKey ?? state.activeRoleKey;
  terrain?.updateFilters({
    hasFilter: Boolean(allActiveTags.size || state.search || effectiveRole !== "all"),
    matchingWeekKeys: matching,
    // Search isolates results entirely (hide non-matches); pills/tags just dim
    isolate: Boolean(state.search),
    roleKey: effectiveRole,
  });
  updateActiveFiltersBadge();
  // No auto-selection — detail panel only opens when user clicks a prism
  if (els.navPage?.classList.contains("visible")) {
    renderNavPage();
  }
}

function selectEntry(entryId, options = {}) {
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) return;

  // Track cluster origin so the modal back button can return to the cluster
  // list. Only cluster-row clicks pass options.fromCluster; every other entry
  // open (single building, prev/next, related, 2D grid) clears it.
  state.clusterContext = options.fromCluster || null;
  state.selectedEntryId = entry.id;
  document.querySelectorAll(".cell.active").forEach((cell) => cell.classList.remove("active"));
  const monthKey = `${entry.year}-${String(entry.month || 1).padStart(2, "0")}`;
  const cell = monthCells.get(monthKey);
  if (cell) {
    cell.classList.add("active");
    if (options.scroll) cell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
  terrain?.selectEntry(entry, { focus: Boolean(options.zoom || options.scroll) });
  if (options.zoom && state.zoom < 145) setZoom(155);
  // Modal slides in alongside the camera motion (~280ms slide + 250ms ease).
  // The 200ms lead-time lets the camera start its arc before the panel arrives.
  const delay = options.skipDelay ? 0 : 200;
  setTimeout(() => {
    if (state.selectedEntryId === entry.id) openProjectPage(entry);
  }, delay);
}

function selectEmptyWeek(weekKey, emailCount, cell) {
  document.querySelectorAll(".cell.active").forEach((item) => item.classList.remove("active"));
  if (cell) cell.classList.add("active");
  terrain?.selectWeek(weekKey, { focus: true });
  if (state.zoom < 130) setZoom(130);
  if (cell) cell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  if (els.detailPanel) {
    els.detailPanel.classList.add("visible");
    els.detailPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
    els.detailPanel.innerHTML = `
    <button class="detail-close" id="detailCloseInner" type="button" aria-label="Close detail">×</button>
    <div class="detail-content">
      <h2>${escapeHtml(weekKey)}</h2>
      <p class="detail-description">No ledger entry is attached to this week yet. The email layer shows ${emailCount.toLocaleString("en-IN")} substantive sent email${emailCount === 1 ? "" : "s"} here.</p>
      <div class="detail-grid">
        <div class="fact"><span>Status</span><strong>Available for future annotation</strong></div>
      </div>
    </div>
  `;
    const closeBtn = els.detailPanel.querySelector("#detailCloseInner");
    if (closeBtn) closeBtn.addEventListener("click", hideDetail);
  }
}

function renderDetail(entry) {
  const weekEntries = entriesByWeek.get(entry.weekKey) || [];
  const emailCount = Number((data.weeklyEmailCounts || {})[entry.weekKey] || 0);

  // Find this entry's dominant role bucket for the hero accent color
  const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
  const bucket = findBucketForTags(allTags);
  const bucketColor = bucket?.color || "#c8c0e0";
  const bucketLabel = bucket?.label || "Other";

  const tags = entry.tags.slice(0, 10).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("");
  const siblingButtons = weekEntries
    .filter((item) => item.id !== entry.id)
    .slice(0, 6)
    .map((item) => `<button type="button" data-entry-id="${item.id}">${escapeHtml(item.title)}</button>`)
    .join("");

  if (els.detailPanel) {
    els.detailPanel.classList.add("visible");
    els.detailPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-open");
    els.detailPanel.style.setProperty("--accent-bucket", bucketColor);

    const logoSticker = getClientLogoSticker(entry.org || entry.clientCanonical);
    const logoHTML = logoSticker 
      ? `<img src="${escapeHtml(logoSticker)}" alt="" class="fact-logo-sticker" style="height:18px;margin-left:8px;vertical-align:middle;object-fit:contain;filter:drop-shadow(0 0 0 1px #ffffff) drop-shadow(0 0 0 1.5px #1a1714);">`
      : "";

    els.detailPanel.innerHTML = `
    <button class="detail-back" id="detailBackInner" type="button">
      <span aria-hidden="true">←</span> Back to portfolio
    </button>
    <button class="detail-close" id="detailCloseInner" type="button" aria-label="Close detail">×</button>
    <img class="detail-verified-sticker" src="public/stickers/sticker_verified.png" alt="Verified" onerror="this.remove()">

    <div class="detail-hero" style="background: linear-gradient(135deg, ${bucketColor}28, transparent 70%);">
      <div class="detail-hero-tag">
        <span class="hero-dot" style="background:${bucketColor};"></span>
        ${escapeHtml(bucketLabel)}
      </div>
      <h2>${escapeHtml(entry.title || "Untitled project")}</h2>
      ${tags ? `<div class="detail-meta">${tags}</div>` : ""}
    </div>

    <div class="detail-content">
      <p class="detail-description">${escapeHtml(entry.description || entry.notes || "No description yet.")}</p>

      <div class="detail-grid">
        ${fact("Role", entry.role)}
        ${fact("Org / Client", entry.org, logoHTML)}
        ${fact("Location", entry.location)}
        ${fact("Era", entry.era)}
        ${fact("Evidence", [entry.evidenceSource, entry.evidenceDetail].filter(Boolean).join(" · "))}
        ${fact("Productivity", `${emailCount.toLocaleString("en-IN")} sent email${emailCount === 1 ? "" : "s"} this week`)}
        ${entry.earningsAmount ? fact("Money", `${entry.currency || ""} ${Number(entry.earningsAmount).toLocaleString("en-IN")}`) : ""}
        ${entry.notes && entry.notes !== entry.description ? fact("Notes", entry.notes) : ""}
      </div>

      ${siblingButtons ? `<div class="week-stack"><h3>Same week</h3>${siblingButtons}</div>` : ""}
    </div>
  `;

    els.detailPanel.querySelectorAll("[data-entry-id]").forEach((button) => {
      button.addEventListener("click", () => selectEntry(Number(button.dataset.entryId), { zoom: true, scroll: true }));
    });
    const closeBtn = els.detailPanel.querySelector("#detailCloseInner");
    if (closeBtn) closeBtn.addEventListener("click", hideDetail);
    const backBtn = els.detailPanel.querySelector("#detailBackInner");
    if (backBtn) backBtn.addEventListener("click", () => {
      hideDetail();
      terrain?.resetView();
    });
  }
}

function renderSupportingSections() {
  if (els.roleTimeline) {
    els.roleTimeline.replaceChildren(...(data.roles || []).map((role) => {
      const card = document.createElement("article");
      card.className = "role-card";
      card.innerHTML = `
        <strong>${escapeHtml(role.Role || "Role")}</strong>
        <span>${escapeHtml([role.Start, role.End].filter(Boolean).join(" to "))}</span>
        <p>${escapeHtml([role["Org/Self"], role.Type, role.Notes].filter(Boolean).join(" | "))}</p>
      `;
      // UNFOUND Studio: Split-screen link interaction
      card.addEventListener("mouseenter", () => {
        const evScroller = document.getElementById("evidenceScroller");
        if (evScroller) {
          evScroller.innerHTML = `<div style="padding: 20px;"><h3>Evidence for ${escapeHtml(role.Role)}</h3><p>Extracting archival files...</p></div>`;
          if (window.gsap) gsap.fromTo(evScroller, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });
        }
      });
      return card;
    }));
  }

  if (els.firstsList) {
    els.firstsList.replaceChildren(...(data.firsts || []).map((first) => {
      const card = document.createElement("article");
      card.className = "first-card";
      card.innerHTML = `
        <strong>${escapeHtml(first.First || "First")}</strong>
        <span>${escapeHtml(first.Date || "")}</span>
        <p>${escapeHtml([first.Context, first.Evidence].filter(Boolean).join(" | "))}</p>
      `;
      return card;
    }));
  }

  if (els.peopleList) {
    els.peopleList.replaceChildren(...(data.people || []).map((person) => {
      const card = document.createElement("article");
      card.className = "person-card";
      card.innerHTML = `
        <strong>${escapeHtml(person.Person || "Person")}</strong>
        <span>${escapeHtml([person["First Contact"], person.Type].filter(Boolean).join(" | "))}</span>
        <p>${escapeHtml([person["Recurring Role"], person.Notes].filter(Boolean).join(" | "))}</p>
      `;
      return card;
    }));
  }
}

function showTooltip(event, weekKey, weekEntries, emailCount) {
  const title = weekEntries.length ? getStrongestEntry(weekEntries).title : "Open week";
  const tags = weekEntries.flatMap((entry) => entry.roleTags).slice(0, 4).join(", ");
  els.tooltip.innerHTML = `
    <strong>${escapeHtml(weekKey)} | ${weekEntries.length} project${weekEntries.length === 1 ? "" : "s"}</strong>
    <span>${escapeHtml(title || "No entry yet")}</span>
    ${tags ? `<br><span>${escapeHtml(tags)}</span>` : ""}
  `;
  els.tooltip.style.display = "block";
  moveTooltip(event);
}

function moveTooltip(event) {
  els.tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`;
  els.tooltip.style.top = `${Math.min(window.innerHeight - 130, event.clientY + 14)}px`;
}

function hideTooltip() {
  els.tooltip.style.display = "none";
}

function stepEntry(direction) {
  const visibleEntries = getVisibleEntries();
  if (!visibleEntries.length) return;
  const currentIndex = Math.max(0, visibleEntries.findIndex((entry) => entry.id === state.selectedEntryId));
  const nextIndex = (currentIndex + direction + visibleEntries.length) % visibleEntries.length;
  selectEntry(visibleEntries[nextIndex].id, { zoom: true, scroll: true });
}

function setZoom(value) {
  state.zoom = value;
  if (els.zoomControl) els.zoomControl.value = String(value);
  if (els.zoomOutput) els.zoomOutput.textContent = `${value}%`;
  // Skip transform in 2D mode (it breaks sticky positioning); 3D camera handles its own zoom
  if (document.body.classList.contains("view-2d")) {
    els.mapScale.style.transform = "";
  } else {
    els.mapScale.style.transform = `scale(${value / 100})`;
  }
  terrain?.setZoom(value);
}

let _terrainReady = false; // guards against double-init (story mode → archive)

async function initTerrain() {
  if (_terrainReady) return;
  _terrainReady = true;
  if (!els.terrainCanvas) return;
  try {
    const module = await import("./terrain.js?v=fluent2-20");
    const loaderEl = document.getElementById("loader");
    const isLandingBg = new URLSearchParams(window.location.search).has('landing');
    if (isLandingBg) {
      document.body.classList.add("landing-bg-mode");
      if (loaderEl) loaderEl.style.display = "none";
    }
    updateLoaderProgress(20);

    terrain = module.createArchiveTerrain({
      container: els.terrainCanvas,
      years,
      weeks,
      entries,
      weeklyEmailCounts: data.weeklyEmailCounts || {},
      maxEmailCount,
      getWeekEntries: (weekKey) => entriesByWeek.get(weekKey) || [],
      getTone,
      getDominantKind,
      getStrongestEntry,
      matchesEntry,
      onLoadProgress(phase, pct) {
        log("Terrain load:", phase, pct);
        updateLoaderProgress(20 + pct * 0.8);
      },
      onLoadComplete() {
        updateLoaderProgress(100);
        setTimeout(() => {
          loaderEl?.classList.add("done");
          try {
            if (window.parent && window.parent !== window && window.parent.onCityReady) {
              window.parent.onCityReady();
            }
          } catch (err) {
            // ignore
          }
        }, 400);
      },
      onHover: (event, weekKey) => {
        const weekEntries = entriesByWeek.get(weekKey) || [];
        const emailCount = Number((data.weeklyEmailCounts || {})[weekKey] || 0);
        showTooltip(event, weekKey, weekEntries, emailCount);
      },
      onMove: moveTooltip,
      onLeave: hideTooltip,
      onSelectEntry: (entryId) => selectEntry(entryId, { zoom: true, scroll: false }),
      onSelectCluster: (clusterInfo) => openClusterPage(clusterInfo),
      onSelectWeek: (weekKey) => selectEmptyWeek(weekKey, Number((data.weeklyEmailCounts || {})[weekKey] || 0), weekCells.get(weekKey)),
    });
    terrain.updateFilters({
      hasFilter: Boolean(state.activeTags.size || state.search),
      matchingWeekKeys: new Set(getVisibleEntries().map((entry) => entry.weekKey)),
    });
    const selectedEntry = entries.find((entry) => entry.id === state.selectedEntryId);
    if (selectedEntry) terrain.selectEntry(selectedEntry, { focus: false });
    terrain.setZoom(state.zoom);
    document.body.classList.add("has-terrain");
    if (els.terrainEmpty) els.terrainEmpty.hidden = true;
    terrain.setTheme?.(document.documentElement.getAttribute("data-theme") === "light");
    window.__terrain = terrain; // debug exposure for poly count queries
  } catch (error) {
    console.warn("Three.js terrain enhancement unavailable.", error);
    document.body.classList.add("terrain-fallback");
    if (els.terrainEmpty) {
      els.terrainEmpty.innerHTML = "<strong>Spatial portfolio unavailable</strong><span>The flat chronology is still ready below.</span>";
    }
  }
}

function matchesEntry(entry, options = {}) {
  if (!options.ignoreRoleFilter && !entryMatchesActiveRole(entry)) return false;
  const { start, end } = state.yearWindow;
  const ey = entry.year || 0;
  if (ey < start || ey > end) return false;
  const allActiveTags = new Set([...state.activeTags, ...state.activeTagInputs]);
  const tagMatch = !allActiveTags.size || entry.tags.some((tag) => allActiveTags.has(tag));
  if (!tagMatch) return false;
  if (!state.search) return true;
  const haystack = [
    entry.title,
    entry.description,
    entry.role,
    entry.org,
    entry.location,
    entry.era,
    entry.notes,
    entry.tags.join(" "),
  ].join(" ").toLowerCase();
  return haystack.includes(state.search);
}

function getVisibleEntries() {
  return entries.filter((entry) => matchesEntry(entry));
}

// m3: Active filters summary badge — count and display active filter dimensions
function updateActiveFiltersBadge() {
  if (!els.activeFiltersBadge) return;
  let count = 0;
  if (state.activeRoleKey !== "all") count++;
  if (state.search) count++;
  if (state.activeTagInputs.size) count++;
  if (state.yearWindow.start !== 1991 || state.yearWindow.end !== 2026) count++;
  if (count > 0) {
    els.activeFiltersBadge.textContent = `${count} filter${count > 1 ? "s" : ""} active`;
    els.activeFiltersBadge.hidden = false;
  } else {
    els.activeFiltersBadge.hidden = true;
  }
}

function getTone(entryCount, emailCount) {
  const entryScore = entryCount * 18;
  const emailScore = (emailCount / maxEmailCount) * 10;
  const score = entryScore + emailScore;
  if (score <= 0) return 0;
  if (score < 2) return 1;
  if (score < 10) return 2;
  if (score < 25) return 3;
  return 4;
}

function getDominantKind(weekEntries) {
  const tags = new Set(weekEntries.flatMap((entry) => entry.tags));
  return priorityKinds.find((kind) => tags.has(kind)) || "";
}

// Maps a week's entries to their dominant role bucket (matches the 3D coloring)
function getDominantBucketKey(weekEntries) {
  if (!weekEntries.length) return "";
  // Tally by bucket
  const counts = new Map();
  for (const entry of weekEntries) {
    const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
    const seen = new Set();
    for (const t of allTags) {
      if (!t) continue;
      const bucket = findBucketForTags([t]);
      const key = bucket ? bucket.key : "Other";
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (!seen.size) counts.set("Other", (counts.get("Other") || 0) + 1);
  }
  let best = "", max = 0;
  for (const [k, n] of counts) {
    if (n > max) { max = n; best = k; }
  }
  return best;
}

function getStrongestEntry(weekEntries) {
  return [...weekEntries].sort((a, b) => {
    const milestone = Number(b.tags.includes("Milestone")) - Number(a.tags.includes("Milestone"));
    if (milestone) return milestone;
    return b.tags.length - a.tags.length;
  })[0];
}

function fact(label, value, extraHTML = "") {
  if (!value) return "";
  return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}${extraHTML}</strong></div>`;
}

function computeAge(dobIso) {
  const dob = new Date(dobIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function formatDate(entry) {
  if (entry.date) return entry.date;
  if (entry.precision === "year") return String(entry.year);
  if (entry.precision === "month") return `${entry.year}-${String(entry.month).padStart(2, "0")}`;
  return [entry.year, entry.month, entry.day].filter(Boolean).join("-");
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function dateNumber(entry) {
  return Number(`${entry.year}${String(entry.month || 1).padStart(2, "0")}${String(entry.day || 1).padStart(2, "0")}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function computeYearRange() {
  let min = Infinity, max = -Infinity;
  for (const e of entries) {
    const y = e.year || parseInt(e.date) || 0;
    if (y && y < min) min = y;
    if (y && y > max) max = y;
  }
  return [min === Infinity ? 2009 : min, max === -Infinity ? 2026 : max];
}

function computeUniqueRoleCount(entries) {
  const roles = new Set();
  for (const e of entries) {
    const r = e.role || e.roles || [];
    if (Array.isArray(r)) r.forEach(x => x && roles.add(x));
    else if (r) roles.add(r);
  }
  return roles.size;
}

function computeUniqueClientCount(entries) {
  const clients = new Set();
  for (const e of entries) {
    if (e.excludeFromClients) continue;
    const name = (e.clientCanonical && String(e.clientCanonical).trim()) || "";
    if (name) clients.add(name);
  }
  return clients.size;
}
