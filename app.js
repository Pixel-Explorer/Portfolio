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
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason && (String(event.reason).includes("403") || String(event.reason).includes("blob") || String(event.reason).includes("Failed to fetch"))) {
    event.preventDefault();
  }
});

let data = {};
let entries = [];
let caseStudies = [];

// ── Shareable-link routing state ──────────────────────────────────
// Seeds the case-studies explorer's local `activeId` on its next fresh
// render (deep link on load, or a back/forward reopen); consumed once.
let __pendingCSDeepLinkId = null;
// True only while a popstate-driven reopen is in flight, so the explorer's
// own initial render doesn't re-push the history entry we just navigated to.
let __pendingCSSkipHistorySync = false;

function slugifyTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Ledger entries don't carry a `slug` field, so this is derived from the
// title at read time (stable as long as the title doesn't change). Falls
// back to the numeric id if the title is empty.
function entrySlug(entry) {
  return entry.slug || slugifyTitle(entry.title) || String(entry.id);
}

function findEntryBySlugOrId(idOrSlug) {
  if (idOrSlug == null) return null;
  const needle = String(idOrSlug);
  return entries.find((e) => entrySlug(e) === needle) ||
         entries.find((e) => String(e.id) === needle) ||
         null;
}
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
  yearWindow: { start: 2009, end: 2026 },
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
state.editMode = new URLSearchParams(window.location.search).has("edit");
state.editingEntryId = null; // currently-being-edited entry id (drives modal render)
if (state.editMode) {
  document.documentElement.classList.add("edit-mode");
  log("Editor mode active — appending data-editor=on to modal renders");
}

const priorityKinds = ["Founder", "Designer", "Film", "AIESEC", "Web3", "Strategy", "Milestone"];

/* Loader heading: the landing-page hook line, held steady the whole boot.
   Subtitle + status carry the progress changes. */
const LOADER_TITLE = "Some briefs need more than one kind of creative.";
const LOADER_COPY = [
  {
    at: 0,
    title: LOADER_TITLE,
    subtitle: "ANIRUDH VENKATESAN",
    status: ({ entryCount }) => entryCount
      ? `Reading ${entryCount} documented moments`
      : "Reading the work archive",
  },
  {
    at: 20,
    title: LOADER_TITLE,
    subtitle: "CREATIVE SYSTEMS",
    status: () => "Mapping 15+ roles",
  },
  {
    at: 40,
    title: LOADER_TITLE,
    subtitle: "STUDIO RANGE",
    status: () => "Loading the work city",
  },
  {
    at: 60,
    title: LOADER_TITLE,
    subtitle: "WORK, NOT CLAIMS",
    status: ({ proofBacked }) => proofBacked
      ? `Connecting ${proofBacked} backed entries`
      : "Connecting proof to projects",
  },
  {
    at: 80,
    title: LOADER_TITLE,
    subtitle: "2009 TO 2026",
    status: ({ yearStart, yearEnd }) => `Assembling ${yearStart} to ${yearEnd}`,
  },
  {
    at: 95,
    title: LOADER_TITLE,
    subtitle: "ARCHIVE READY",
    status: () => "Ready",
  },
];

const loaderMetrics = {
  entryCount: 0,
  proofBacked: 0,
  yearStart: 2009,
  yearEnd: 2026,
};

function updateLoaderProgress(progress) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const phase = [...LOADER_COPY].reverse().find((item) => pct >= item.at) || LOADER_COPY[0];
  const loaderTitle = document.getElementById("loaderTitle");
  const loaderSubtitle = document.getElementById("loaderSubtitle");
  const loaderStatus = document.getElementById("loaderStatus");
  const loaderFill = document.getElementById("loaderFill");
  const loaderNum = document.getElementById("loaderNum");

  if (loaderTitle) loaderTitle.textContent = phase.title;
  if (loaderSubtitle) loaderSubtitle.textContent = phase.subtitle;
  if (loaderStatus) loaderStatus.textContent = phase.status(loaderMetrics);
  if (loaderFill) loaderFill.style.width = `${pct}%`;
  if (loaderNum) loaderNum.textContent = `${Math.round(pct)}%`;

  if (pct >= 100) {
    setTimeout(() => {
      const loader = document.getElementById("loader");
      if (loader) {
        loader.classList.add("done");
        loader.classList.add("fade-out");
        loader.setAttribute("hidden", "true");
      }
    }, 400);
  }

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

function sanitizeTag(rawTag) {
  if (!rawTag) return [];
  let tag = String(rawTag).trim();
  if (!tag) return [];

  // Known typos & raw variants
  if (/computaional/i.test(tag)) return ["Computational (Self-Taught)"];
  if (/phorography/i.test(tag)) return ["Documentary Photography"];
  if (tag.toLowerCase() === "documentaryphorography") return ["Documentary Photography"];

  // Split camelCase or PascalCase compound tags (e.g. DesignerStudiobranding, ArtDirectorAdfilmTVC)
  let splitStr = tag
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  const parts = splitStr
    .split(/[,/]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length ? parts : [tag];
}

function sanitizeTagsList(tagList) {
  const res = new Set();
  for (const t of toArray(tagList)) {
    for (const clean of sanitizeTag(t)) {
      if (clean) res.add(clean);
    }
  }
  return [...res];
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
      tags: sanitizeTagsList(entry.tags),
      roleTags: sanitizeTagsList(entry.roleTags),
    }))
    .sort((a, b) => dateNumber(a) - dateNumber(b));

  loaderMetrics.entryCount = entries.length;
  loaderMetrics.proofBacked = entries.filter((entry) => (entry.evidence || []).length > 0).length;
  loaderMetrics.yearStart = Number(data.yearStart) || entries[0]?.year || 2009;
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
    document.documentElement.setAttribute("data-theme", "dark");
  }
  updateThemeToggleUI(isLight);

  const btn = document.getElementById("themeToggleBtn");
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", toggleTheme);
  }
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const newLight = !isLight;
  if (newLight) {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("archive-theme", "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("archive-theme", "dark");
  }
  updateThemeToggleUI(newLight);
  terrain?.setTheme?.(newLight);
}

function updateThemeToggleUI(isLight) {
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.textContent = isLight ? "Light" : "Dark";
  }
  if (els.themeToggle) {
    els.themeToggle.checked = !isLight;
  }
}

// ─── Markdown Parser & Navigation State Helpers ──────────────
function parseMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(String(text));
  // Headings
  html = html.replace(/^### (.*?)$/gm, '<h4 class="csr-h4">$1</h4>');
  html = html.replace(/^## (.*?)$/gm, '<h3 class="csr-h3">$1</h3>');
  html = html.replace(/^# (.*?)$/gm, '<h2 class="csr-h2">$1</h2>');
  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="css-link-sweep">$1 ↗</a>');
  // Bullet lists
  html = html.replace(/^[•\-\*]\s+(.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(?:<li>.*?<\/li>(?:\n|$))+/g, '<ul class="csr-bullets">$&</ul>');
  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p class="csr-prose">');
  return html;
}

function getMonogram(name) {
  if (!name) return "AV";
  const words = name.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function setActiveNav(view) {
  document.querySelectorAll(".navlink, .mq-dock-item").forEach((link) => {
    const active = link.dataset.view === view;
    link.classList.toggle("active", active);
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

// ─── Background Audio / Video Auto-Pause on Modal Dismissal ───
function stopAllMediaPlayback() {
  document.querySelectorAll("video").forEach((video) => {
    try {
      video.pause();
      video.currentTime = 0;
    } catch {}
  });

  document.querySelectorAll("iframe").forEach((iframe) => {
    try {
      const src = iframe.src;
      if (src && !iframe.classList.contains("ambient-frame")) {
        iframe.src = "";
        iframe.src = src;
      }
    } catch {}
  });
}

// ─── Master Navigation Stack & ViewRouter Engine ─────────────
const ViewRouter = {
  stack: [],
  current: { view: "archive", id: null },

  navigate(view, id = null, replace = false) {
    if (!replace && (this.current.view !== view || this.current.id !== id)) {
      this.stack.push({ ...this.current });
    }
    this.current = { view, id };
    this.applyState();
  },

  back() {
    this.killActiveMedia();
    if (this.stack.length > 0) {
      this.current = this.stack.pop();
      this.applyState();
    } else {
      this.current = { view: "archive", id: null };
      this.applyState();
    }
  },

  closeAll() {
    this.killActiveMedia();
    this.stack = [];
    this.current = { view: "archive", id: null };
    this.applyState();
  },

  killActiveMedia() {
    stopAllMediaPlayback();
  },

  applyState() {
    this.killActiveMedia();

    if (!this.current.view || this.current.view === "archive") {
      this.current = { view: "archive", id: null };
      document.body.classList.remove("overlay-active");
      if (window.resume3DRenderLoop) window.resume3DRenderLoop();
      if (window.resume3DLoop) window.resume3DLoop();

      closeNavPageDirect();
      closeProjectPageDirect();
      closeGalleryOverlay();
      closeArtifactView();
      hideDetail();

      setActiveNav("archive");
      try {
        if (window.location.hash) {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch {}
      return;
    }

    if (window.pause3DRenderLoop) window.pause3DRenderLoop();
    if (window.pause3DLoop) window.pause3DLoop();
    document.body.classList.add("overlay-active");

    const view = this.current.view;
    const id = this.current.id;

    if (view === "case-study-detail" || view === "case-study") {
      closeProjectPageDirect();
      closeGalleryOverlay();
      closeArtifactView();
      openNavPageDirect("case-studies");
      if (id) {
        window.__csOpenDetail?.(id);
        window.location.hash = `case-study/${id}`;
      }
      setActiveNav("case-studies");
    } else if (view === "project-dossier" || view === "project") {
      closeNavPageDirect();
      closeGalleryOverlay();
      const entryId = Number(id) || id;
      const entry = (typeof entries !== "undefined" ? entries : []).find(
        (e) => e.id === entryId || entrySlug(e) === String(entryId)
      );
      if (entry) {
        openEntryArtifactDirect(entry);
        window.location.hash = `project/${entry.id}`;
      }
    } else {
      closeProjectPageDirect();
      closeGalleryOverlay();
      closeArtifactView();
      openNavPageDirect(view);
      setActiveNav(view);
      window.location.hash = view;
    }
  },
};

// NavStack alias for backward compatibility & direct pop integration
const NavStack = {
  get history() { return ViewRouter.stack; },
  set history(v) { ViewRouter.stack = v; },
  get currentView() { return ViewRouter.current.view; },
  set currentView(v) { ViewRouter.current.view = v; },
  get currentMeta() { return { id: ViewRouter.current.id, slug: ViewRouter.current.id }; },
  set currentMeta(v) { ViewRouter.current.id = v?.id || v?.slug || null; },

  push(viewId, metadata = {}) {
    ViewRouter.navigate(viewId, metadata.slug || metadata.id || null);
  },
  pop() {
    ViewRouter.back();
  },
  closeAll() {
    ViewRouter.closeAll();
  },
  render() {
    ViewRouter.applyState();
  },
};

window.ViewRouter = ViewRouter;
window.NavStack = NavStack;
window.pause3DLoop = () => window.pause3DRenderLoop?.();
window.resume3DLoop = () => window.resume3DRenderLoop?.();

function handleInitialHash() {
  const hash = (window.location.hash || "").replace(/^#/, "");
  if (!hash) return;
  if (hash.startsWith("case-study/")) {
    const slug = hash.split("/")[1];
    ViewRouter.navigate("case-studies");
    ViewRouter.navigate("case-study-detail", slug);
  } else if (hash.startsWith("project/")) {
    const id = hash.split("/")[1];
    ViewRouter.navigate("project-dossier", id);
  } else if (["roles", "clients", "case-studies", "contact"].includes(hash)) {
    ViewRouter.navigate(hash);
  }
}

// ─── Global Keyboard & Hash Routing Listeners ─────────────────
document.addEventListener("keydown", (e) => {
  // 1. Escape key handler
  if (e.key === "Escape" || e.key === "Esc") {
    // If a lightbox image is open, close lightbox first
    const activeLightbox = document.querySelector(".ev-lightbox");
    if (activeLightbox) {
      activeLightbox.remove();
      return;
    }

    // If search is focused, blur it
    if (els.searchInput && document.activeElement === els.searchInput) {
      els.searchInput.blur();
      return;
    }

    // Otherwise pop the navigation stack
    ViewRouter.back();
    return;
  }

  // 2. Cmd+K / Ctrl+K Global Shortcut
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (els.searchInput) {
      const wrap = els.searchInput.closest(".search-wrap");
      if (wrap) wrap.classList.add("is-open");
      els.searchInput.focus();
      els.searchInput.select();
    }
  }
});

window.addEventListener("hashchange", handleInitialHash);
window.addEventListener("popstate", () => {
  if (window.location.hash) {
    handleInitialHash();
  } else {
    ViewRouter.navigate("archive", null, true);
  }
});
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
  // The inline gate script in index.html stamps <html data-mobile="1"> (UA +
  // pointer/width sniff) before this module runs — treat it as the source of
  // truth so JS mobile-mode and the data-mobile-listmode CSS never disagree.
  // Bare `pointer: coarse` is NOT enough on its own: touch-screen laptops
  // match it and used to get the mobile JS without the mobile CSS.
  return document.documentElement.hasAttribute("data-mobile") || window.innerWidth < 700;
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
      title: "Menu, Search & Dark Mode",
      text: "Everything else lives in this menu: search to filter work by tags, tech stacks, or clients, the dark-mode switch, the section pages, and the downloadable folio.",
      target: "#navMenuToggle",
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
    tooltip.removeAttribute("hidden");
    highlight.removeAttribute("hidden");

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
  animateCount(els.statYears, new Set(entries.map(e => e.year).filter(Boolean)).size);
  animateCount(els.statTags, (data.tags || []).length);

  // Nav enrichment
  const uniqueRoles = computeUniqueRoleCount(entries);
  if (els.navRoleCount) setText(els.navRoleCount, String(uniqueRoles));
  const uniqueClients = computeUniqueClientCount(entries);
  if (els.navClientCount) setText(els.navClientCount, String(uniqueClients));
  if (els.navCaseStudiesCount) setText(els.navCaseStudiesCount, String(caseStudies.length));

  initTheme();
  renderRolePills();
  renderYearPills();
  bindArchiveSpecEvents();
  renderSearchChips();

  if (isMobile()) {
    // If only the width fallback fired (gate script's UA sniff missed),
    // stamp the html attrs so the listmode CSS still applies.
    document.documentElement.setAttribute("data-mobile", "1");
    document.documentElement.setAttribute("data-mobile-listmode", "1");
    document.body.classList.add("mobile-mode");
    bindEvents();
    bindNavLinks();
    // renderMobileList() is the mobile substitute for the 3D city, and
    // refreshMobileList() (bound to the filter/search paths) is a no-op until
    // it has run once. Nothing called it, so the Archive tab was a blank stage
    // behind a dead camera D-pad.
    renderMobileList();
    // The quick-nav and the filter-rail disclosure are mobile-only UI, so they
    // have to be bound on this branch — everything below the early return is
    // desktop-only.
    bindRailToggle();
    bindMobileHome();
    initMobileQuicknav();
    initStatusIsland();
    // Both of these used to sit below this early return, so mobile got neither.
    // Without the popstate listener, closeArtifact()'s history.back() popped the
    // URL and nothing closed — the back arrow and the system Back button both
    // looked dead. Without the deep-link pass, ?entry= links were dropped.
    bindGlobalHistoryRouting();
    applyDeepLinkFromURL({ delay: 300 }); // no terrain loader to wait on here
    handleInitialHash();
    // Mobile never calls initTerrain(), which is the only path that retires
    // the boot loader — finish it here or the quote screen blocks every tap.
    updateLoaderProgress(100);
    document.getElementById("loader")?.classList.add("done");
    // Land on the portrait, not on a list. The visitor moves on from here via
    // the bottom dock or the header menu; both route through bindNavLinks,
    // which retires the home screen.
    if (!window.location.hash) showMobileHome();
    return;
  }

  renderWeekHeader();
  renderGrid();
  renderSupportingSections();
  applyFilters();
  bindEvents();
  bindNavLinks();

  initTerrain();
  renderDefaultRightHud();
  initMagneticButtons();
  initSheenSweep();
  initCountUpObserver();
  initSlidingPillNavbar();
  initTikTikColorFlash(document.getElementById("rolePills"));
  initStatusIsland();
  initSpotlight();

  Onboarding.init();

  applyDeepLinkFromURL({ delay: 800 }); // let the terrain loader/onboarding settle
  bindGlobalHistoryRouting();
  handleInitialHash();
}

// Deep-linking for SEO/GEO/sharing: ?entry=<slug|id> opens the canonical
// full-screen artifact (the same view openEntryArtifact's URL points at);
// ?cs=<id> opens a case study inside the case-studies explorer. Both normalize
// the loaded entry to a clean base first, then push the deep-linked state on
// top, so browser Back always has a clean local entry to land on instead of
// leaving the site.
//
// This ran on the desktop branch ONLY, because it sat below init()'s mobile
// early return. On a phone every shared ?entry= link, and every reload of one,
// silently dropped its parameter and landed on the home screen — which read as
// "the page refreshed and threw me back".
function applyDeepLinkFromURL({ delay = 800 } = {}) {
  const urlParams = new URLSearchParams(window.location.search);
  const entryParam = urlParams.get("entry") || urlParams.get("entryId");
  const csParam = urlParams.get("cs");
  if (entryParam) {
    const ent = findEntryBySlugOrId(entryParam);
    if (ent) {
      history.replaceState(null, "", location.pathname);
      setTimeout(() => {
        if (isMobile()) hideMobileHome();
        openEntryArtifact(ent);
      }, delay);
    }
  } else if (csParam) {
    history.replaceState(null, "", location.pathname);
    __pendingCSDeepLinkId = csParam;
    setTimeout(() => {
      openNavPage("case-studies");
    }, delay);
  }
}

// Single popstate listener for both deep-link systems above. Dispatches on
// which key the pushed state carries; a state with neither key means we've
// navigated back past anything either system pushed, so close whichever
// overlay is still open.
function bindGlobalHistoryRouting() {
  window.addEventListener("popstate", (e) => {
    const st = e.state || {};
    if ("entry" in st) {
      const ent = st.entry ? findEntryBySlugOrId(st.entry) : null;
      if (ent) {
        openEntryArtifact(ent, { pushHistory: false });
      } else {
        closeArtifactView();
      }
      return;
    }
    if ("cs" in st) {
      __pendingCSDeepLinkId = st.cs || null;
      __pendingCSSkipHistorySync = true;
      openNavPage("case-studies", { pushHistory: false });
      return;
    }
    // Mobile section entry (see openNavPage). Landing back on it from an
    // artifact must NOT re-render: renderNavPage resets navPageState.railPicked,
    // which would throw the visitor from the role they were reading back out to
    // the role list. Only re-open when the view genuinely is not showing.
    if ("nav" in st) {
      if (els.galleryArtifact?.classList.contains("visible")) closeArtifactView();
      closeProjectPage();
      if (st.nav === "archive") {
        // Archive is the bare shell, not an overlay — reveal it by clearing.
        closeNavPage();
        hideMobileHome();
        navPageState.view = "archive";
        return;
      }
      const already = els.navPage?.classList.contains("visible") && navPageState.view === st.nav;
      if (!already) openNavPage(st.nav, { pushHistory: false });
      return;
    }
    if (els.galleryArtifact?.classList.contains("visible")) closeArtifactView();
    // Base state on mobile = the front door. Without this, Back from a section
    // had nothing to pop and walked the visitor straight off the site.
    if (isMobile()) {
      closeNavPage();
      closeProjectPage();
      showMobileHome();
      return;
    }
    if (navPageState.view === "case-studies" && els.navPage?.classList.contains("visible")) closeNavPage();
  });
}

let _mobileListContainer = null;

function renderMobileList() {
  const stage = els.terrainStage;
  if (!stage) return;
  stage.innerHTML = "";
  // No inline `overflow:auto` here. The stage is auto-height on mobile, so it
  // never became a scroll container — it just shadowed the stylesheet and made
  // the real scroller (the page) harder to reason about. carbon.css owns this.

  const list = document.createElement("div");
  list.className = "mobile-list";
  _mobileListContainer = list;

  // Newest work first. This list is the whole archive on a phone, and ledger
  // order is chronological — unsorted, a recruiter's first four rows were
  // school entries from 1997–2007. Every other view already uses byTimeDesc.
  const ordered = entries.filter(entryMatchesActiveRole).slice().sort(byTimeDesc);

  ordered.forEach((entry) => {
    const year = entry.year || "";
    const title = entry.title || "Untitled";
    const role = entry.role || (entry.roles && entry.roles[0]) || "";
    const tags = (entry.tags || []).slice(0, 3);
    const tagStr = tags.length ? tags.map((t) => `<span class="mobile-tag">${escapeHtml(t)}</span>`).join("") : "";

    const card = document.createElement("button");
    card.className = "mobile-card";
    card.type = "button";
    card.setAttribute("data-entry-id", entry.id);
    // selectEntry now routes to the artifact on mobile, so this goes through
    // the same single path as every other list in the app.
    card.addEventListener("click", () => selectEntry(entry.id));
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

// Mobile home screen. Only ever shown on the mobile branch — desktop has the
// 3D city as its front door and never calls these.
function showMobileHome() {
  const home = document.getElementById("mobileHome");
  if (home) home.hidden = false;
  document.body.classList.add("mobile-home-open");
  // Nothing in the nav is "current" while the home screen is up.
  document.querySelectorAll(".navlink").forEach((l) => l.classList.remove("active"));
}

function hideMobileHome() {
  const home = document.getElementById("mobileHome");
  if (home) home.hidden = true;
  document.body.classList.remove("mobile-home-open");
}

// The brand mark is the way back to the front door. It is an <a href="#archive">
// for desktop/no-JS, so the mobile handler has to preventDefault or the hash
// jump fights the overlay it just opened.
function bindMobileHome() {
  document.querySelectorAll(".brand-mark, .brand").forEach((el) => {
    if (el.dataset.homeBound === "1") return;
    el.dataset.homeBound = "1";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeNavPage();
      closeProjectPage();
      closeGalleryOverlay();
      closeArtifactView();
      showMobileHome();
    });
  });
}

// Mobile filter rail disclosure. The rail is 240px of chrome beside the 3D
// stage on desktop; restacked full-width on a phone it would bury the work
// list, so it collapses and reports its result count on the closed button.
function bindRailToggle() {
  const btn = document.getElementById("railToggle");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => {
    const open = document.body.classList.toggle("rail-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  updateRailToggleState();
}

function updateRailToggleState() {
  const out = document.getElementById("railToggleState");
  if (!out) return;
  const shown = entries.filter(entryMatchesActiveRole).length;
  setText(out, `${shown} of ${entries.length}`);
}

function renderRolePills() {
  const container = document.getElementById("rolePills");
  if (!container) return;
  container.innerHTML = "";

  const cards = [
    { key: "all", label: "All work", count: entries.length },
    ...SPATIAL_FILTERS.map((r) => ({
      key: r.key,
      label: r.label,
      count: entries.filter((e) => getEntryThemes(e).has(r.key)).length
    })),
  ];

  for (const item of cards) {
    const btn = document.createElement("button");
    btn.type = "button";
    const active = state.activeRoleKey === item.key;
    btn.className = `discipline-btn rolepill${active ? " active" : ""}`;
    btn.dataset.role = item.key;
    btn.style.cssText = `display:flex;justify-content:space-between;align-items:flex-start;font-family:'IBM Plex Sans';font-size:13px;font-weight:${active ? '500' : '400'};text-align:left;padding:9px 10px;border:none;border-left:3px solid ${active ? 'var(--cds-accent)' : 'transparent'};background:${active ? 'var(--cds-layer-01)' : 'transparent'};color:${active ? 'var(--cds-text-primary)' : 'var(--cds-text-secondary)'};cursor:pointer;transition:all 120ms;width:100%;box-sizing:border-box;`;
    btn.innerHTML = `
      <span style="white-space:normal;word-break:break-word;text-transform:uppercase;padding-right:6px;line-height:1.2;font-family:'IBM Plex Sans Condensed';font-weight:600;font-size:12px;letter-spacing:0.03em;">${escapeHtml(item.label)}</span>
      <span style="font-family:'IBM Plex Mono';font-size:11px;opacity:0.6;flex-shrink:0;margin-top:1px;">${item.count}</span>
    `;
    btn.addEventListener("click", () => setActiveRole(item.key));
    btn.addEventListener("pointerenter", () => previewRole(item.key));
    btn.addEventListener("pointerleave", () => previewRole(null));
    container.appendChild(btn);
  }
}

function renderYearPills() {
  const container = document.getElementById("yearPills");
  if (!container) return;
  container.innerHTML = "";

  const yearsList = ["All", ...[...new Set(entries.map((e) => e.year).filter(Boolean))].sort((a, b) => b - a)];
  const isAll = state.yearWindow.start <= 2009 && state.yearWindow.end >= 2026;

  for (const yr of yearsList) {
    const btn = document.createElement("button");
    btn.type = "button";
    const active = yr === "All" ? isAll : (state.yearWindow.start === Number(yr) && state.yearWindow.end === Number(yr));
    btn.className = `year-list-btn${active ? " active" : ""}`;
    btn.style.cssText = `display:flex;justify-content:space-between;align-items:center;font-family:'IBM Plex Sans';font-size:12px;font-weight:${active ? '500' : '400'};text-align:left;padding:6px 8px;border:none;border-left:2px solid ${active ? 'var(--cds-accent)' : 'transparent'};background:${active ? 'var(--cds-layer-01)' : 'transparent'};color:${active ? 'var(--cds-text-primary)' : 'var(--cds-text-secondary)'};cursor:pointer;transition:all 120ms;width:100%;box-sizing:border-box;`;
    
    const count = yr === "All" ? entries.length : entries.filter(e => String(e.year) === String(yr)).length;
    btn.innerHTML = `
      <span>${escapeHtml(String(yr))}</span>
      <span style="font-family:'IBM Plex Mono';font-size:10px;opacity:0.6;">${count}</span>
    `;

    btn.addEventListener("click", () => {
      if (yr === "All") {
        state.yearWindow = { start: 2009, end: 2026 };
      } else {
        const yNum = Number(yr);
        state.yearWindow = { start: yNum, end: yNum };
      }
      renderYearPills();
      applyFilters();
    });
    container.appendChild(btn);
  }
}

function bindArchiveSpecEvents() {

  // Helper to sync sliders to the actual Three.js camera state
  // D-Pad camera adjustments helper
  window.__adjustCam = function(prop, delta) {
    const refs = window.__storyRefs;
    if (!refs || !refs.camState || !refs.camTarget) return;

    if (prop === 'radius') {
      refs.camState.radius = Math.max(50, Math.min(350, refs.camState.radius + delta));
    } else if (prop === 'polar') {
      refs.camState.polar = Math.max(0.05, Math.min(1.57, refs.camState.polar + delta));
    } else if (prop === 'azimuth') {
      refs.camState.azimuth = refs.camState.azimuth + delta;
      if (refs.camState.azimuth > Math.PI) refs.camState.azimuth -= 2 * Math.PI;
      if (refs.camState.azimuth < -Math.PI) refs.camState.azimuth += 2 * Math.PI;
    } else if (prop === 'dutchAngle') {
      refs.camState.dutchAngle = Math.max(-0.5, Math.min(0.5, (refs.camState.dutchAngle || 0) + delta));
    } else if (prop === 'panX') {
      refs.camTarget.x = Math.max(-100, Math.min(100, refs.camTarget.x + delta));
    } else if (prop === 'panY') {
      refs.camTarget.y = Math.max(-20, Math.min(80, refs.camTarget.y + delta));
    } else if (prop === 'panZ') {
      refs.camTarget.z = Math.max(-100, Math.min(100, refs.camTarget.z + delta));
    }

    refs.applyCamera();
    refs.scheduleRender();
  };

  document.getElementById("camResetBtn")?.addEventListener("click", () => {
    terrain?.resetView?.();
  });

  document.getElementById("camTopBtn")?.addEventListener("click", () => {
    terrain?.animateCameraTo?.({
      x: 0, y: 16.0, z: 0,
      radius: 180,
      polar: 0.05 * Math.PI,
      azimuth: 0,
      dutchAngle: 0,
    }, { duration: 0.8, ease: "power2.inOut" });
  });

  // User input request: Arrow keys for Tilt / Rotate, W/S for Zoom, A/D for Horizon
  document.addEventListener("keydown", (e) => {
    // Only intercept when in 3D viewport mode
    if (document.body.classList.contains("view-2d")) return;
    const refs = window.__storyRefs;
    if (!refs) return;
    const { camState, camTarget } = refs;
    if (!camState || !camTarget) return;

    let handled = false;
    const speedPolar = 0.03;
    const speedAzimuth = 0.04;
    const zoomFactor = 1.03;
    const speedRoll = 0.02;

    if (e.key === "ArrowUp") {
      camState.polar = Math.max(0.05, camState.polar - speedPolar);
      handled = true;
    } else if (e.key === "ArrowDown") {
      camState.polar = Math.min(1.55, camState.polar + speedPolar);
      handled = true;
    } else if (e.key === "ArrowLeft") {
      camState.azimuth -= speedAzimuth;
      handled = true;
    } else if (e.key === "ArrowRight") {
      camState.azimuth += speedAzimuth;
      handled = true;
    } else if (e.key.toLowerCase() === "w") {
      // Zoom in
      camState.radius = Math.max(camState.minRadius || 40, camState.radius / zoomFactor);
      handled = true;
    } else if (e.key.toLowerCase() === "s") {
      // Zoom out
      camState.radius = Math.min(camState.maxRadius || 400, camState.radius * zoomFactor);
      handled = true;
    } else if (e.key.toLowerCase() === "a") {
      // Roll horizon left
      camState.dutchAngle = (camState.dutchAngle || 0) - speedRoll;
      handled = true;
    } else if (e.key.toLowerCase() === "d") {
      // Roll horizon right
      camState.dutchAngle = (camState.dutchAngle || 0) + speedRoll;
      handled = true;
    }

    if (handled) {
      refs.applyCamera();
      refs.scheduleRender();
    }
  });
}

function setActiveRole(key) {
  state.activeRoleKey = key;
  state.previewRoleKey = null;
  renderRolePills();
  applyFilters();
  if (key === "all") terrain?.resetView?.();
  if (document.body.classList.contains("mobile-mode")) { refreshMobileList(); updateRailToggleState(); }
}

function previewRole(key) {
  state.previewRoleKey = key;
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
  document.querySelectorAll(".navlink").forEach((link) => {
    link.addEventListener("click", (e) => {
      const btn = e.target.closest(".navlink") || link;
      const view = btn.dataset.view;
      if (!view) return;

      hideMobileHome();

      if (view === "archive") {
        pushMobileNavState("archive");
        state.activeTags.clear();
        state.activeTagInputs.clear();
        if (els.searchInput) els.searchInput.value = "";
        renderSearchChips();
        setActiveRole("all");
        applyFilters();
        NavStack.closeAll();
      } else {
        NavStack.push(view);
      }
    });
  });
  bindNavMenu();
}

// Hamburger menu: collapses the section tabs into a flyout so the visible
// chrome cluster is just Search · Dark-mode · Menu. Closes on item-select,
// outside click, or Escape. Guarded so repeated bindNavLinks() calls bind once.
function bindNavMenu() {
  const toggle = document.getElementById("navMenuToggle");
  const topnav = toggle?.closest(".topnav");
  const links = document.getElementById("topnavLinks");
  if (!toggle || !topnav || !links || toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";

  const setOpen = (open) => {
    topnav.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!topnav.classList.contains("nav-open"));
  });
  // Selecting any flyout item (tab or folio link) closes the menu.
  links.addEventListener("click", (e) => {
    if (e.target.closest(".navlink, .nav-folio-link")) setOpen(false);
  });
  // Outside click closes it (toggle's own click stops propagation above).
  document.addEventListener("click", (e) => {
    if (!topnav.classList.contains("nav-open")) return;
    if (e.target.closest("#topnavLinks, #navMenuToggle")) return;
    setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && topnav.classList.contains("nav-open")) setOpen(false);
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

  // Search: the bare icon is click-enabled — click opens + focuses the field
  // (hover also opens via CSS). It stays open while focused or non-empty.
  const _searchWrap = els.searchInput?.closest(".search-wrap");
  if (_searchWrap) {
    _searchWrap.addEventListener("click", () => {
      _searchWrap.classList.add("is-open");
      els.searchInput.focus();
    });
    els.searchInput.addEventListener("blur", () => {
      if (!els.searchInput.value) _searchWrap.classList.remove("is-open");
    });
  }

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
      if (document.body.classList.contains("mobile-mode")) { refreshMobileList(); updateRailToggleState(); }
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
    if (els.yearWindowStart) els.yearWindowStart.value = "2009";
    if (els.yearWindowEnd) els.yearWindowEnd.value = "2026";
    state.yearWindow = { start: 2009, end: 2026 };
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
  editFooter.innerHTML = `<a href="?edit=1" class="textbtn" style="position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:20;opacity:0.3;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--cds-text-helper);text-decoration:none;transition:opacity 0.3s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.3'">edit mode</a>`;
  // Editor API only exists on the local dev server — never show the link in prod
  const canEdit = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!state.editMode && canEdit) document.body.appendChild(editFooter);

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

  // Story Mode: "Explore Flagships" button routing
  const playBtn = document.getElementById("storyPlayFilm");
  if (playBtn) {
    playBtn.removeAttribute("disabled");
    playBtn.textContent = "Explore Flagships";
    playBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const modeSelect = document.getElementById("storyModeSelect");
      if (modeSelect) modeSelect.setAttribute("aria-hidden", "true");
      const csBtn = document.querySelector('[data-view="case-studies"]');
      if (csBtn) csBtn.click();
      else if (typeof openNavPage === "function") openNavPage("case-studies");
    });
  }

  els.resetView?.addEventListener("click", () => {
    setZoom(100);
    terrain?.resetView();
    els.mapScroll?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
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
    els.artifactClose.addEventListener("click", closeArtifact);
  }

  // m5: Global error handler for broken evidence images. For a HERO image,
  // auto-advance to the next thumbnail that's an image (so a single broken
  // first-evidence file doesn't strand the whole artifact on "no preview").
  // Otherwise hide the broken img and show a clean placeholder.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || img.closest(".ev-lightbox")) return;
    
    // Fallback: if Vercel Blob fails (e.g. 403 limit), attempt local proof_fallback copy.
    if (img.src && img.src.includes('vercel-storage.com/proof/') && !img.dataset.vFallbackTried) {
      img.dataset.vFallbackTried = "1";
      const match = img.src.match(/\/proof\/(.+)$/);
      if (match) {
        img.src = "public/proof_fallback/" + match[1];
        return;
      }
    }

    // Fallback: local URLs hardcode 'public/...'. On Vercel, 'public' is root, so it 404s.
    if (img.src && img.src.includes('/public/') && !img.dataset.pFallbackTried) {
      img.dataset.pFallbackTried = "1";
      img.src = img.src.replace('/public/', '/');
      return;
    }

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
      fallback.style.cssText = "display:flex;align-items:center;justify-content:center;min-height:80px;color:var(--cds-text-secondary);font-size:11px;letter-spacing:0.04em;text-transform:uppercase;padding:16px;text-align:center";
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

  // Top header navlink wiring (Archive, Roles, Clients, Case Studies, Contact)
  document.querySelectorAll(".navlink[data-view]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const view = btn.dataset.view;
      document.querySelectorAll(".navlink").forEach((l) => l.classList.toggle("active", l === btn));

      if (view === "archive") {
        closeNavPage();
        // closeEntryModal() never existed — the ReferenceError aborted this
        // handler, so the Archive tab never reset the 3D view. The entry
        // detail's own ✕ calls closeExpandedDetail; so does this.
        closeExpandedDetail();
        terrain?.resetView?.();
      } else if (view === "roles" || view === "clients") {
        openNavPage(view);
      } else if (view === "case-studies") {
        openNavPage("case-studies");
      } else if (view === "contact") {
        openNavPage("contact");
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    const isInputFocused = tag === "input" || tag === "textarea" || tag === "select";
    
    // Allow arrow key navigation when:
    // - No main overlay is open (normal 3D stage exploration)
    // - OR when ONLY the project artifact view is open (and a project is active)
    const navPageOpen = els.navPage?.classList.contains("visible");
    const galleryOpen = els.galleryOverlay?.classList.contains("visible");
    const artifactOpen = els.galleryArtifact?.classList.contains("visible");
    
    if (!isInputFocused) {
      const canNavigateLedger = (!navPageOpen && !galleryOpen && (!artifactOpen || state.selectedEntryId != null));
      if (canNavigateLedger) {
        if (event.key === "ArrowRight") { event.preventDefault(); stepEntry(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); stepEntry(-1); }
      }
    }
    if (event.key === "Escape") {
      hideTooltip();
      if (els.galleryArtifact?.classList.contains("visible")) {
        closeArtifact();
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
          overlay.style.boxShadow = "0 0 0 2px var(--cds-accent)";
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

  /* ── legacy manila single-entry sheet (unreachable; kept for reference) ──
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
  */
}

// Drop the folder-sheet styling (used when switching to the brutalist edit
// form, or on close) and tear down the drag controller.
function leaveProjectArtifactMode() {
  els.projectPage?.classList.remove("folder-sheet", "artifact-mode", "entry-mode");
  els.projectPageInner?.classList.remove("artifact-mode");
}

function resetPageSEO() {
  document.title = "Anirudh Venkatesan | Filmmaker, Cinematographer & Designer";
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    "Anirudh Venkatesan (Pixel Explorer) is a one-person creative studio across film, photography, brand identity, animation and web3. 15+ roles over 15 years, from Gujarat to Pondicherry. Open to consulting."
  );
  try {
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    // Preserve the state object. This used to write `{ path: cleanUrl }` over
    // whatever was there, and closeArtifactView() calls resetPageSEO() first
    // thing — so closing an artifact silently erased the {nav:…} marker on the
    // entry underneath it, and the next Back walked off the site instead of
    // returning to the section. Only the URL needs cleaning here.
    window.history.replaceState(window.history.state, "", cleanUrl);
  } catch (e) {}

  const schemaScript = document.getElementById("dynamic-project-schema");
  if (schemaScript) {
    schemaScript.remove();
  }
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
    const evSrc = evidencePreviewSrc(e);
    // No evidence photo → fall back to the company logo assigned in the
    // clients/case-studies tabs, so every card carries a brand, not a blank.
    const logo = getClientLogoSticker(e.org || e.clientCanonical);
    const src = evSrc || logo;
    const isLogo = !evSrc && !!logo;
    const meta = [e.year, e.role, e.org].filter(Boolean).join(" · ");
    return `<button type="button" class="cl-card" data-entry-id="${e.id}">
      <span class="cl-card-thumb">${src
        ? `<img class="${isLogo ? "cl-card-thumb--logo" : ""}" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.remove()">`
        : `<img class="cl-card-thumb--logo" src="${stickleUrl(entryStickleIds(e)[0], 220)}" alt="" loading="lazy" onerror="this.remove()">`}</span>
      <span class="cl-card-body">
        <span class="cl-card-title">${escapeHtml(e.title || "Untitled")}</span>
        <span class="cl-card-meta">${escapeHtml(meta)}</span>
      </span>
    </button>`;
  }).join("");

  els.projectPageInner.innerHTML = `
    <div class="cl-page">
      <header class="cl-head">
        <button class="cl-back-btn" id="clCloseBtn" type="button" title="Close" aria-label="Close">←</button>
        <div class="cl-head-text">
          <h2 class="cl-title">${escapeHtml(label)}</h2>
          <span class="cl-count">${clusterEntries.length} projects</span>
        </div>
      </header>
      <div class="cl-grid">${cards}</div>
    </div>`;

  const clCloseBtn = els.projectPageInner.querySelector("#clCloseBtn");
  if (clCloseBtn) {
    clCloseBtn.addEventListener("click", () => {
      closeProjectPage();
      terrain?.restoreCamera();
      terrain?.resetView();
      state.selectedEntryId = null;
    });
  }

  els.projectPageInner.querySelectorAll(".cl-card").forEach((card) => {
    card.addEventListener("click", () => {
      const ent = entries.find((e) => e.id === Number(card.dataset.entryId));
      if (ent) {
        closeProjectPage();
        selectEntry(ent.id, { zoom: true, scroll: false });
      }
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

  let clusterEntries = entryIds
    .map((id) => entries.find((e) => e.id === id))
    .filter(Boolean)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0));

  if (!clusterEntries.length) return;

  state.clusterContext = { label, entryIds: clusterEntries.map((e) => e.id) };

  // Panel expansion is owned by showClusterListInPanel, one line down.
  showClusterListInPanel(label, clusterEntries);
  return;

  /* ── legacy manila cascade (unreachable; kept until the clean path is proven) ──
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
  */
}

// Console/test hook: ARCHIVE_APP_DEBUG.openCluster("Label", [ids])
window.ARCHIVE_APP_DEBUG.openCluster = (label, entryIds) =>
  openClusterPage({ label, entryIds });
window.ARCHIVE_APP_DEBUG.selectEntry = (id, options) =>
  selectEntry(id, options);
// Opens the reader by seeding the same deep-link slot ?cs=<id> uses.
window.ARCHIVE_APP_DEBUG.openCaseStudy = (id) => {
  __pendingCSDeepLinkId = id;
  openNavPage("case-studies");
};
window.ARCHIVE_APP_DEBUG.openEntryArtifact = (entry) => openEntryArtifact(entry || (typeof entries !== "undefined" ? entries[0] : null));

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
      // 19 · Box-grid spinner while the photo archive loads
      if (els.galleryGridView) {
        // Spinner lives inside the grid view; visibility stays CSS-owned via .active.
        els.galleryGridView.innerHTML = boxSpinnerHTML("Loading photo archive");
      }
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
        errorDiv.style.cssText = "grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:60px 24px;color:var(--cds-text-secondary);text-align:center";
        errorDiv.innerHTML = `<strong style="font-size:18px;font-weight:600">Couldn't load gallery</strong><span style="font-size:13px;opacity:0.7">The photo archive is temporarily unavailable. Please try again.</span><button type="button" class="textbtn" onclick="this.closest('.gallery-overlay')?.querySelector('.gallery-close')?.click()" style="margin-top:8px;padding:8px 16px;border:1px solid var(--glass-border);border-radius:4px;cursor:pointer">Close</button>`;
        if (els.galleryGridView) {
          els.galleryGridView.innerHTML = "";
          // Error block lives inside the grid view; visibility stays CSS-owned.
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
  
  // Visibility is CSS-owned via .active (carbon.css §gallery views). Writing
  // display inline here is what let the coverflow view carry two conflicting
  // display values in its markup and rely on this function to fix it.
  const views = {
    grid: document.getElementById("galleryGridView"),
    codex: document.getElementById("galleryCodexView"),
    coverflow: document.getElementById("galleryCoverflowView"),
    "hover-expand": document.getElementById("galleryHoverExpandView"),
  };
  Object.entries(views).forEach(([name, el]) => {
    if (el) el.classList.toggle("active", name === tab);
  });

  els.galleryOverlay?.classList.toggle("codex-active", tab === "codex");
  
  if (tab === "codex") {
    initCodexScroller();
  } else {
    if (_codexScrollerCleanup) { _codexScrollerCleanup(); _codexScrollerCleanup = null; }
  }
  
  if (tab === "grid") {
    // Re-latticed on every entry to the tab: drilling in from PANELS calls
    // renderGallery with a filtered set, which replaces the tile, and without
    // this the new grid kept no pan handlers at all.
    initGridCanvas();
  }

  if (tab === "coverflow") {
    initCoverflowGallery();
  }
  
  if (tab === "hover-expand") {
    initHoverExpandGallery();
  }
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
      // Paint the hovered photo on the centred stage. This used to hand off to
      // galleryMotion.hoverRow() for a cursor-following preview, but
      // initGalleryMotion() returns a no-op stub — so hovering a row showed
      // nothing at all, and #codexStageImg sat in the markup never given a src.
      if (stage && item?.src) {
        if (stage.getAttribute("src") !== item.src) stage.setAttribute("src", item.src);
        stage.classList.add("show");
      } else if (stage) {
        stage.classList.remove("show");
      }
    } else {
      if (stage) stage.classList.remove("show");
    }
  };
  let hoverT = 0;
  const tick = () => {
    if (!dragging) {
      if (PREFERS_REDUCED_MOTION) {
        vy = 0;
      } else {
        targetY += vy; vy *= 0.90; if (Math.abs(vy) < 0.05) vy = 0;
      }
    }
    if (PREFERS_REDUCED_MOTION) {
      y = targetY;
    } else {
      y += (targetY - y) * 0.16;
      if (Math.abs(targetY - y) < 0.1) y = targetY;
    }
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

// Endless 2-D canvas for the GRID. The tile (#gridCanvas) is cloned into a
// lattice and the plane's translate is wrapped modulo the tile step, so panning
// never reaches an edge in any direction — drag far enough and the same photos
// come back around. Previously bounds() clamped the offset, which stopped the
// pan dead at the content edges.
//
// Only the plane's transform changes per frame (one composited style write);
// the clones are static. Clones are aria-hidden and carry no id, and item
// clicks are delegated on the viewport, so every copy is fully interactive.
let _gridDragCleanup = null;
let gridJustDragged = false;
let _gridCtx = null;
const GRID_MAX_TILES = 16; // guard: a tiny collection must not spawn a lattice

function initGridCanvas() {
  if (_gridDragCleanup) { _gridDragCleanup(); _gridDragCleanup = null; }
  const vp = els.galleryGridView;
  const tile = vp?.querySelector(".grid-canvas:not(.is-clone)");
  if (!tile) return;

  // Rebuild the lattice around the current tile.
  let plane = vp.querySelector(".grid-plane");
  if (!plane) {
    plane = document.createElement("div");
    plane.className = "grid-plane";
    tile.parentNode.insertBefore(plane, tile);
  }
  plane.querySelectorAll(".grid-canvas.is-clone").forEach((n) => n.remove());
  if (tile.parentNode !== plane) plane.appendChild(tile);
  tile.style.left = "0px";
  tile.style.top = "0px";

  const gap = parseFloat(getComputedStyle(tile).gap) || 16;
  const stepX = tile.offsetWidth + gap;
  const stepY = tile.offsetHeight + gap;
  if (!(stepX > gap && stepY > gap)) return; // not laid out yet

  // Cover the viewport plus one tile in each axis, so a wrapped offset always
  // has content under it.
  let copiesX = Math.min(6, Math.ceil(vp.clientWidth / stepX) + 1);
  let copiesY = Math.min(6, Math.ceil(vp.clientHeight / stepY) + 1);
  while (copiesX * copiesY > GRID_MAX_TILES && (copiesX > 1 || copiesY > 1)) {
    if (copiesX >= copiesY) copiesX--; else copiesY--;
  }
  for (let j = 0; j < copiesY; j++) {
    for (let i = 0; i < copiesX; i++) {
      if (i === 0 && j === 0) continue;
      const c = tile.cloneNode(true);
      c.removeAttribute("id");
      c.classList.add("is-clone");
      c.setAttribute("aria-hidden", "true");
      c.style.left = `${i * stepX}px`;
      c.style.top = `${j * stepY}px`;
      plane.appendChild(c);
    }
  }

  // Wrap into (-step, 0] so the lattice always covers the viewport.
  const wrap = (v, s) => (s > 0 ? (((v % s) + s) % s) - s : 0);

  let tx = 0, ty = 0, targetX = 0, targetY = 0, vx = 0, vy = 0;
  let dragging = false, lastX = 0, lastY = 0, lastT = 0, moved = 0, raf = null;

  const tick = () => {
    if (!dragging) {
      if (PREFERS_REDUCED_MOTION) {
        vx = vy = 0;
      } else {
        targetX += vx; targetY += vy; vx *= 0.9; vy *= 0.9;
        if (Math.abs(vx) < 0.05) vx = 0;
        if (Math.abs(vy) < 0.05) vy = 0;
      }
    }
    if (PREFERS_REDUCED_MOTION) { tx = targetX; ty = targetY; }
    else { tx += (targetX - tx) * 0.16; ty += (targetY - ty) * 0.16; }
    plane.style.transform = `translate3d(${wrap(tx, stepX)}px, ${wrap(ty, stepY)}px, 0)`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true; vx = vy = 0;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); moved = 0;
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    targetX += dx; targetY += dy; moved += Math.abs(dx) + Math.abs(dy);
    const now = performance.now(); const dt = now - lastT || 16;
    vx = (dx / dt) * 16; vy = (dy / dt) * 16;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    // Suppress the click that ends a drag, so panning never opens a photo.
    if (moved > 6) { gridJustDragged = true; setTimeout(() => { gridJustDragged = false; }, 60); }
  };
  const onWheel = (e) => {
    e.preventDefault();
    if (e.shiftKey) targetX -= e.deltaY;
    else { targetY -= e.deltaY; targetX -= e.deltaX; }
    vx = vy = 0;
  };

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

let currentCfIdx = 2;
// 04 · Coverflow — a recycled pool of CF_SLOTS cards, not one node per photo.
// Rendering all 416 put 416 <img> in the DOM to show 5, and rebuilding
// innerHTML on every step destroyed the nodes so the CSS transition never ran
// (it snapped instead of animating). Cards now persist and are re-pointed at
// new data as the window moves, so transforms actually tween.
const CF_SLOTS = 7;          // offsets -3..+3
const CF_VISIBLE = 2;        // |offset| beyond this is transparent

function initCoverflowGallery() {
  const stage = document.getElementById("cfStage");
  if (!stage) return;
  const data = galleryData || [];
  if (!data.length) return;

  if (currentCfIdx > data.length - 1) currentCfIdx = Math.min(2, data.length - 1);

  // Build the pool once per data set.
  if (stage.dataset.cfPool !== String(Math.min(CF_SLOTS, data.length))) {
    const n = Math.min(CF_SLOTS, data.length);
    stage.dataset.cfPool = String(n);
    stage.innerHTML = Array.from({ length: n }, () => `<button type="button" class="cf-item" data-idx="">
        <img alt="" loading="lazy">
        <span class="cf-item-meta">
          <span class="cf-item-genre"></span>
          <span class="cf-item-title"></span>
        </span>
      </button>`).join("");
    stage.querySelectorAll(".cf-item").forEach((el) => {
      el.addEventListener("click", () => {
        const i = Number(el.dataset.idx);
        if (Number.isNaN(i)) return;
        // Off-centre card steps the reel; the centre card opens the photo.
        if (i !== currentCfIdx) { currentCfIdx = i; paintCf(); }
        else if (galleryData?.[i]) openArtifactView(galleryData[i]);
      });
    });
  }

  paintCf();

  const prevBtn = document.getElementById("cfPrevBtn");
  const nextBtn = document.getElementById("cfNextBtn");
  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = "1";
    prevBtn.addEventListener("click", () => { if (currentCfIdx > 0) { currentCfIdx--; paintCf(); } });
  }
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = "1";
    nextBtn.addEventListener("click", () => {
      const d = galleryData || [];
      if (currentCfIdx < d.length - 1) { currentCfIdx++; paintCf(); }
    });
  }
}

// Re-point the existing cards at the current window. A card that keeps its
// data index transitions; one recycled onto a new index jumps (no transition)
// for a frame, which is what makes the middle of the stack look continuous.
function paintCf() {
  const stage = document.getElementById("cfStage");
  const data = galleryData || [];
  if (!stage || !data.length) return;
  const slots = [...stage.querySelectorAll(".cf-item")];
  if (!slots.length) return;

  const half = Math.floor(slots.length / 2);
  const wanted = [];
  for (let off = -half; off <= half; off++) {
    const i = currentCfIdx + off;
    if (i >= 0 && i < data.length) wanted.push(i);
  }

  const held = new Map();
  slots.forEach((el) => {
    const i = el.dataset.idx === "" ? NaN : Number(el.dataset.idx);
    if (wanted.includes(i) && !held.has(i)) held.set(i, el);
  });
  const free = slots.filter((el) => ![...held.values()].includes(el));
  wanted.forEach((i) => { if (!held.has(i)) held.set(i, free.shift()); });

  slots.forEach((el) => {
    if (![...held.values()].includes(el)) { el.classList.add("is-spare"); el.dataset.idx = ""; }
  });

  held.forEach((el, i) => {
    if (!el) return;
    const item = data[i];
    const recycled = el.dataset.idx !== String(i);
    if (recycled) {
      el.classList.add("cf-jump");
      el.dataset.idx = String(i);
      const img = el.querySelector("img");
      const src = item.thumb || item.src || "";
      if (img && img.getAttribute("src") !== src) img.setAttribute("src", src);
      el.querySelector(".cf-item-genre").textContent = item.genre || "STILL";
      el.querySelector(".cf-item-title").textContent = item.title || "";
    }
    const off = i - currentCfIdx;
    const abs = Math.abs(off);
    el.classList.remove("is-spare");
    el.classList.toggle("is-center", off === 0);
    el.style.setProperty("--cf-off", String(off));
    el.style.zIndex = String(100 - abs);
    el.style.opacity = abs > CF_VISIBLE ? "0" : "1";
    el.style.transform = `translateX(${off * 48}%) rotateY(${off * -42}deg) scale(${1 - abs * 0.1})`;
    el.setAttribute("aria-hidden", abs > CF_VISIBLE ? "true" : "false");
    if (recycled) requestAnimationFrame(() => el.classList.remove("cf-jump"));
  });
}

// 03 · Hover-expand panels — one panel per real photo collection. Hovering
// expands a panel; clicking drills the grid down to that collection. The
// collection field is path-derived ("Europe\Netherlands"), so it is split for
// display. Backgrounds are the collection's own newest thumbnail, never a
// flat swatch.
function galleryCollections(data) {
  const map = new Map();
  (data || []).forEach((item) => {
    const raw = String(item.collection || "").trim();
    if (!raw) return;
    if (!map.has(raw)) map.set(raw, []);
    map.get(raw).push(item);
  });
  return [...map.entries()]
    .map(([raw, items]) => {
      items.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      return {
        raw,
        label: raw.replace(/\\/g, " / "),
        items,
        count: items.length,
        cover: items.find((i) => i.thumb || i.src)
      };
    })
    .sort((a, b) => b.count - a.count);
}

function initHoverExpandGallery() {
  const container = document.getElementById("heContainer");
  if (!container) return;

  const groups = galleryCollections(galleryData).slice(0, 8);
  if (!groups.length) {
    container.innerHTML = `<p class="he-empty">No collections in this set.</p>`;
    return;
  }

  container.innerHTML = groups.map((g, i) => {
    const img = g.cover ? (g.cover.thumb || g.cover.src) : "";
    return `<button type="button" class="he-panel" data-he-collection="${escapeHtml(g.raw)}" style="--he-bg:url('${escapeHtml(encodeURI(img))}')" aria-label="${escapeHtml(g.label)}, ${g.count} photos">
      <span class="he-panel-label">
        <span class="he-panel-name">${escapeHtml(g.label)}</span>
        <span class="he-panel-count">${g.count}</span>
      </span>
    </button>`;
  }).join("");

  const panelsEls = [...container.querySelectorAll(".he-panel")];
  const setActive = (el) => panelsEls.forEach((p) => p.classList.toggle("is-open", p === el));
  panelsEls.forEach((el) => {
    el.addEventListener("pointerenter", () => setActive(el));
    el.addEventListener("focus", () => setActive(el));
    el.addEventListener("click", () => {
      const g = groups.find((x) => x.raw === el.dataset.heCollection);
      if (!g) return;
      renderGallery(g.items);
      switchGalleryTab("grid");
    });
  });
  container.addEventListener("pointerleave", () => setActive(null));
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

    // Delegated, not one listener per tile. The infinite canvas clones the
    // grid to wrap seamlessly, and cloneNode does not copy listeners — bound
    // per-item, every clone would have been dead to clicks and hover.
    _gridCtx = { data, isCluster, clusterRef };
    if (!els.galleryGridView.dataset.itemsBound) {
      els.galleryGridView.dataset.itemsBound = "1";
      els.galleryGridView.addEventListener("click", (e) => {
        const el = e.target.closest(".gallery-item");
        if (!el || gridJustDragged || !_gridCtx) return;
        const item = _gridCtx.data.find((x) => x.id === el.dataset.galleryId);
        if (!item) return;
        if (_gridCtx.isCluster && item._entryId != null) {
          closeGalleryOverlay();
          selectEntry(item._entryId, { zoom: false, skipDelay: true, fromCluster: _gridCtx.clusterRef });
        } else {
          openArtifactView(item);
        }
      });
      els.galleryGridView.addEventListener("pointerover", (e) => {
        if (e.target.closest(".gallery-item")) galleryMotion?.hoverItem(true);
      });
      els.galleryGridView.addEventListener("pointerout", (e) => {
        if (e.target.closest(".gallery-item")) galleryMotion?.hoverItem(false);
      });
    }

    // 12 · Image cursor trail across the gallery grid
    initCursorTrail(els.galleryGridView);
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

// Explicit close (X button, Escape): if openEntryArtifact() pushed a
// `?entry=` history entry to get here, step back through real browser
// history instead of closing directly, so the forward button can restore
// the artifact. popstate then calls closeArtifactView(). Section-switch
// cleanup (bindNavLinks) intentionally calls closeArtifactView() directly
// instead — that's a sideways navigation, not an undo.
function closeArtifact() {
  NavStack.pop();
}

let _scrollBeforeArtifact = 0;

function closeArtifactView() {
  resetPageSEO();
  if (!els.galleryArtifact) return;
  const wasOpen = els.galleryArtifact.classList.contains("visible");
  if (_artifactFx) { _artifactFx(); _artifactFx = null; }
  // CSS-driven close (see closeGalleryOverlay) — removing `.visible` fades it
  // out reliably; no GSAP opacity tween that could stall and strand the view.
  if (window.gsap) window.gsap.killTweensOf(els.galleryArtifact);
  els.galleryArtifact.style.opacity = "";
  els.galleryArtifact.classList.remove("visible", "entry-sheet");
  els.galleryArtifact.setAttribute("aria-hidden", "true");
  // If the gallery overlay is gone too, retire the custom cursor.
  if (!els.galleryOverlay?.classList.contains("visible")) galleryMotion?.stop();

  // Put the page back where the visitor left it (see openEntryArtifact). Only
  // on mobile, where the document is the scroller — desktop's body is frozen.
  if (wasOpen && isMobile() && _scrollBeforeArtifact > 0) {
    const y = _scrollBeforeArtifact;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }

  // Reset 3D camera and selected entry if we are returning directly to the 3D stage
  const navPageOpen = els.navPage?.classList.contains("visible");
  const projectPageOpen = els.projectPage?.classList.contains("visible");
  const galleryPageOpen = els.galleryOverlay?.classList.contains("visible");

  if (!navPageOpen && !projectPageOpen && !galleryPageOpen && state.selectedEntryId != null) {
    state.selectedEntryId = null;
    document.querySelectorAll(".cell.active").forEach((cell) => cell.classList.remove("active"));
    terrain?.restoreCamera?.();
    terrain?.selectEntry?.(null, { focus: false });
  }
}

// Map ONE evidence item → a hero/thumb slot. The single source of truth for
// how each evidence type renders in the artifact view, so NO type is silently
// dropped (the long-standing bug: only image/video/youtube/pdf were handled,
// so behance/instagram/x/link evidence vanished from the full-page view).
// Returns { kind, thumbSrc, hero, bg, glyph } or null when there's nothing to show.
function evidenceToSlot(m, entry) {
  if (!m) return null;
  const cap = escapeHtml(m.caption || entry?.title || "");
  const url = m.url || m.src || "";

  // Auto-detect type based on URL/domain
  let detectedType = m.type;
  if (url) {
    if (url.includes("accredible.com") && url.includes("embed_image")) {
      detectedType = "image";
    } else if (extractYouTubeId(url)) {
      detectedType = "youtube";
    } else if (extractGoogleDriveId(url)) {
      detectedType = "drive";
    } else if (googleDocPreview(url)) {
      detectedType = "gdoc";
    } else if (url.includes("linkedin.com") && (url.includes("/feed/update/") || url.includes("/embed/feed/update/"))) {
      detectedType = "linkedin";
    } else if (extractBehanceId(url)) {
      detectedType = "behance";
    } else if (extractInstagramPath(url)) {
      detectedType = "instagram";
    } else if (extractXPostPath(url)) {
      detectedType = "x";
    } else if (/\.pdf($|\?)/i.test(url)) {
      detectedType = "pdf";
    } else if (/\.(mp4|webm|mov|ogg)($|\?)/i.test(url)) {
      detectedType = "video";
    } else if (/\.(png|jpe?g|gif|webp|svg|avif)($|\?)/i.test(url)) {
      detectedType = "image";
    }
  }

  // Render the appropriate preview format
  if (detectedType === "image") {
    return { kind: "image", thumbSrc: url, bg: url,
      hero: `<img src="${escapeHtml(url)}" alt="${cap}" loading="lazy">` };
  }
  if (detectedType === "video") {
    return { kind: "video", thumbSrc: url, bg: null, glyph: "▶",
      hero: `<video src="${escapeHtml(url)}" autoplay muted loop playsinline controls></video>` };
  }
  if (detectedType === "youtube") {
    const id = extractYouTubeId(url);
    if (id) return { kind: "youtube", thumbSrc: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, bg: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      hero: `<iframe src="https://www.youtube.com/embed/${id}?mute=1&rel=0" title="${cap}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>` };
  }
  if (detectedType === "pdf") {
    return { kind: "pdf", thumbSrc: url, bg: null, glyph: "PDF",
      hero: `<iframe src="${escapeHtml(url)}#view=FitH&toolbar=0" title="${cap}" loading="lazy" class="ev-pdf-frame"></iframe>` };
  }
  if (detectedType === "behance") {
    const id = extractBehanceId(url);
    if (id) return { kind: "behance", thumbSrc: null, bg: null, glyph: "Bē",
      hero: `<iframe src="https://www.behance.net/embed/project/${id}?ilo0=1" title="${cap || "Behance project"}" allowfullscreen loading="lazy" class="ev-behance-frame"></iframe>` };
  }
  if (detectedType === "instagram") {
    return { kind: "instagram", thumbSrc: null, bg: null, glyph: "IG",
      hero: `<blockquote class="ev-embed-placeholder" data-embed-type="instagram" data-embed-url="${escapeHtml(url)}"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">View post on Instagram</a></blockquote>` };
  }
  if (detectedType === "x") {
    return { kind: "x", thumbSrc: null, bg: null, glyph: "𝕏",
      hero: `<blockquote class="ev-embed-placeholder" data-embed-type="x" data-embed-url="${escapeHtml(url)}"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">View post on X</a></blockquote>` };
  }
  if (detectedType === "drive") {
    const driveId = extractGoogleDriveId(url);
    if (driveId) return { kind: "drive", thumbSrc: null, bg: null, glyph: "▶",
      hero: `<iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${cap || "Google Drive"}" allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>` };
  }
  if (detectedType === "gdoc") {
    const gdoc = googleDocPreview(url);
    if (gdoc) return { kind: "pdf", thumbSrc: null, bg: null, glyph: "DOC",
      hero: `<iframe src="${gdoc}" title="${cap || "Document"}" allowfullscreen loading="lazy" class="ev-pdf-frame"></iframe>` };
  }
  if (detectedType === "linkedin") {
    const match = url.match(/(urn:li:(?:activity|share|ugcPost):\d+)/);
    const urn = match ? match[1] : "";
    if (urn) {
      return { kind: "linkedin", thumbSrc: null, bg: null, glyph: "in",
        hero: `<iframe src="https://www.linkedin.com/embed/feed/update/${urn}" title="${cap || "LinkedIn Post"}" allowfullscreen loading="lazy" class="ev-linkedin-frame" style="width:100%;height:100%;border:0;background:#fff;"></iframe>` };
    }
  }

  // Fallback to generic link preview iframe + footer link
  if (url) {
    return {
      kind: "link",
      thumbSrc: null,
      bg: null,
      glyph: "↗",
      hero: `
        <div class="ev-generic-preview" style="position:relative; width:100%; height:100%; display:flex; flex-direction:column;">
          <iframe src="${escapeHtml(url)}" title="${cap || "Preview"}" loading="lazy" class="ev-generic-frame" style="width:100%; height:calc(100% - 50px); border:0; background:#fff;"></iframe>
          <div class="ev-generic-footer" style="height:50px; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:space-between; padding:0 20px; border-top:1px solid rgba(255,255,255,0.1);">
            <span style="font-family:'IBM Plex Sans'; font-size:11px; color:#aaa; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${escapeHtml(url)}</span>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="ev-generic-btn" style="font-family:'IBM Plex Sans'; font-size:11px; color:#fff; text-decoration:none; background:rgba(255,255,255,0.15); padding:6px 12px; border-radius:3px; font-weight:bold; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">Open Link ↗</a>
          </div>
        </div>
      `
    };
  }

  return null;
}

// An entry's primary theme pill (colour + glyph + label) for the editorial
// feature header. Falls back to a neutral Life-ish pill when unthemed.
function getEntryThemePill(entry) {
  const keys = getEntryThemes(entry);
  for (const pill of ROLE_PILLS) if (keys.has(pill.key)) return pill;
  return { key: "Life", label: "Archive", icon: "○", color: "#C8923B", ink: "#1A1714" };
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
// graphic anchor, the single evidence woven inline, and a facts margin rail.
// Anything with 2+ media keeps the image-led hero+thumb gallery.
//
// The rail carries no research provenance and the body carries no notes:
// evidenceSource/evidenceDetail/notes are internal working fields (Gmail
// thread ids, "Inferred", "CORRECTED: …") and never render publicly.
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
        </div>
        <aside class="feature-margin">
          <dl class="feature-facts">
            ${fact("When", dateStr)}
            ${fact("Role", role)}
            ${fact("Org / Client", entry.org || entry.clientCanonical)}
            ${fact("Location", entry.location)}
          </dl>
          ${tags.length ? `<div class="feature-tags">${tags.map((t) => `<span class="feature-tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
          ${logoSticker ? `<img src="${escapeHtml(logoSticker)}" alt="" class="feature-logo" onerror="this.remove()">` : ""}
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
  // (The contact directory-card that used to live here is gone: the contact
  // entry never reaches the artifact now, it routes to the one contact modal.
  // The GenAI toolstack keeps its directory card — a centred grid of tool chips
  // reads far better than the artifact's media-hero layout, which would dump
  // the raw comma-separated tool list into a prose column.)
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

function openEntryArtifactDirect(entry, { pushHistory = true } = {}) {
  // Catches the paths that reach the artifact without going through
  // selectEntry — chiefly a ?entry=132 deep link. One contact surface.
  if (entry && isContactEntry(entry)) {
    openNavPage("contact");
    return;
  }
  if (!els.galleryArtifact) els.galleryArtifact = document.getElementById("galleryArtifact");
  if (!els.artifactContainer) els.artifactContainer = document.getElementById("artifactContainer");
  if (!els.artifactClose) els.artifactClose = document.getElementById("artifactClose");
  if (!els.galleryArtifact || !els.artifactContainer || !entry) return;

  // Dynamic Title, Meta description & URL parameters update for AI SEO / GEO
  document.title = `${entry.title} · ${entry.client || "Independent"} (${entry.year}) | Anirudh Venkatesan`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', entry.description || '');
  try {
    const slug = entrySlug(entry);
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?entry=" + slug;
    if (pushHistory) window.history.pushState({ entry: slug }, "", newUrl);
  } catch (e) {}

  if (!els.galleryArtifact.classList.contains("visible")) {
    _scrollBeforeArtifact = window.scrollY || document.documentElement.scrollTop || 0;
  }

  els.galleryArtifact.classList.remove("entry-sheet");
  els.galleryArtifact.style.removeProperty("--fill");
  els.galleryArtifact.style.removeProperty("--ink");
  els.artifactContainer.innerHTML = buildEntryArtifactHTML(entry);
  wireArtifactThumbs(els.artifactContainer);
  loadSocialEmbeds(els.artifactContainer);
  
  els.artifactClose?.setAttribute("aria-label", "Back");
  els.galleryArtifact.classList.add("visible");
  els.galleryArtifact.setAttribute("aria-hidden", "false");
  setupArtifactCinematics();
}

function openEntryArtifact(entry, opts = {}) {
  if (opts.fromNavStack) {
    openEntryArtifactDirect(entry, opts);
  } else {
    NavStack.push("project-dossier", { id: entry?.id });
  }
}


// The case-study reader now lives inside the nav page (renderCSDetail), so
// closing it is just closing that overlay. The old standalone #caseStudyPage
// surface and its closer are gone.

// First previewable still for an entry's evidence — used by all LIST views so
// non-image evidence (YouTube, video posters) still shows a preview, not blank.
function evidencePreviewSrc(entry) {
  const ev = (entry && entry.evidence) || [];
  for (const m of ev) {
    const url = m.url || m.src || "";
    if (!url) continue;

    // 1. Check if it's an image (direct static image or Accredible certificate badge/embed image)
    const isAccredibleImg = url.includes("accredible.com") && url.includes("embed_image");
    const isStaticImg = /\.(png|jpe?g|gif|webp|svg|avif)($|\?)/i.test(url);
    if (isAccredibleImg || isStaticImg || m.type === "image") {
      return url;
    }

    // 2. Check if it's a YouTube video
    const ytId = extractYouTubeId(url);
    if (ytId || m.type === "youtube") {
      const id = ytId || extractYouTubeId(m.url);
      if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }

    // 3. Check if it's a video poster
    if (m.type === "video" && (m.poster || m.thumb)) {
      return m.poster || m.thumb;
    }
  }

  // Last resort: find any img source
  const anyImg = ev.find((m) => m.src && /\.(webp|png|jpe?g|gif|avif|svg)(\?|$)/i.test(m.src));
  return anyImg ? anyImg.src : "";
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
  resetPageSEO();
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

// ─── Case Study Lightbox with Gallery Navigation ─────────────────
function openCSLightbox(images, startIdx) {
  let currentIdx = startIdx;

  function renderActiveImage() {
    const item = images[currentIdx];
    if (!item) return;

    // Remove any existing lightbox
    document.querySelector(".ev-lightbox")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "ev-lightbox ev-lightbox--gallery";
    
    const prevBtnHTML = images.length > 1 
      ? `<button class="ev-lightbox-nav ev-lightbox-nav--prev" type="button" aria-label="Previous">‹</button>`
      : "";
    const nextBtnHTML = images.length > 1
      ? `<button class="ev-lightbox-nav ev-lightbox-nav--next" type="button" aria-label="Next">›</button>`
      : "";
    const counterHTML = images.length > 1
      ? `<div class="ev-lightbox-counter">${currentIdx + 1} / ${images.length}</div>`
      : "";

    overlay.innerHTML = `
      <div class="ev-lightbox-backdrop"></div>
      <div class="ev-lightbox-content">
        <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.caption || '')}">
        ${item.caption ? `<p class="ev-lightbox-caption">${escapeHtml(item.caption)}</p>` : ""}
        ${counterHTML}
      </div>
      ${prevBtnHTML}
      ${nextBtnHTML}
      <button class="ev-lightbox-close" type="button" aria-label="Close">×</button>
    `;

    // Wire up events
    overlay.addEventListener("click", (e) => {
      if (e.target.classList.contains("ev-lightbox-backdrop") || e.target.classList.contains("ev-lightbox-close")) {
        closeCSLightbox();
      }
    });

    const prevBtn = overlay.querySelector(".ev-lightbox-nav--prev");
    const nextBtn = overlay.querySelector(".ev-lightbox-nav--next");

    if (prevBtn) {
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        currentIdx = (currentIdx - 1 + images.length) % images.length;
        renderActiveImage();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        currentIdx = (currentIdx + 1) % images.length;
        renderActiveImage();
      });
    }

    document.body.appendChild(overlay);
  }

  // Keyboard navigation
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      closeCSLightbox();
    } else if (e.key === "ArrowLeft" && images.length > 1) {
      currentIdx = (currentIdx - 1 + images.length) % images.length;
      renderActiveImage();
    } else if (e.key === "ArrowRight" && images.length > 1) {
      currentIdx = (currentIdx + 1) % images.length;
      renderActiveImage();
    }
  };

  function closeCSLightbox() {
    document.removeEventListener("keydown", onKeyDown);
    document.querySelector(".ev-lightbox")?.remove();
  }

  document.addEventListener("keydown", onKeyDown);
  renderActiveImage();
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

// Contact entry detection. The icon set that used to live here went with the
// artifact directory-card; the one contact modal renders key/value rows.
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

// Parses the contact ledger entry's description into typed channels. This is
// the ONLY place contact details are read: there used to be two contact
// surfaces — the building opened entry 132 as an artifact and parsed these,
// while the menu rendered its own hardcoded list — so the phone number and
// YouTube existed on one and the folio PDF on the other. One parser, one modal
// (renderContactForm), and the ledger stays the source of truth so updating a
// handle is a data edit, not a code edit.
function contactChannels(entry) {
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
  return channels;
}

// The contact ledger entry (id 132, "Contact: Anirudh Venkatesan"). Every
// contact route resolves through here.
function contactEntry() {
  return entries.find(isContactEntry) || null;
}

// Canonical single-entry sheet body (manila). Shared by BOTH the cluster
// cascade folders and the single-entry slide-up view, so a project looks
// identical no matter which path opened it (building / 2D grid / Roles /
// Clients / codex / cluster row). Returns inner HTML (no .ms-body-inner wrap).
function renderEntrySheetBody(entry) {
  // (Contact had a branch here too — a third rendering of the same details.
  // The contact entry is intercepted before any sheet or artifact is built.)
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
  const notes = entry.description || "";

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

// Google Docs / Sheets / Slides (docs.google.com editor URLs) → embeddable
// /preview iframe. Distinct from Drive files: an /edit link has no /file/d/ id
// so extractGoogleDriveId misses it, leaving the item to fall back to a plain
// link card. Returns the preview URL, or null for non-Docs URLs.
function googleDocPreview(url) {
  const m = String(url || "").match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
  return m ? `https://docs.google.com/${m[1]}/d/${m[2]}/preview` : null;
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
  els.projectPageInner.style.setProperty("--modal-bg", bucket?.modalBg || "var(--cds-bg)");
  els.projectPageInner.style.setProperty("--modal-ink", bucket?.ink || "var(--cds-text-primary)");

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
// railPicked: has the visitor chosen a role/client since this tab was opened?
// Drives the mobile explorer's initial state — see renderNavPage. Desktop
// ignores it (the rail is always beside the matrix there).
const navPageState = { view: null, expanded: new Set(), railPicked: false };

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


// Evidence bento (clickable → lightbox). Caps the count so the page stays tight.
function csEvidence(cs) {
  const items = (cs.evidence || []).slice(0, 36);
  if (!items.length) return "";

  const tiles = items.map((e, idx) => {
    const isWide = idx % 5 === 0 || e.type === "video";
    const wideClass = isWide ? "cs-ev2--wide" : "";
    
    if (e.type === "image") {
      return `
        <button type="button" class="cs-ev2 ${wideClass}" data-cs-lightbox="${escapeHtml(e.src)}" data-cs-cap="${escapeHtml(e.caption || "")}" data-cs-idx="${idx}">
          <img src="${escapeHtml(e.src)}" alt="${escapeHtml(e.caption || "")}" loading="lazy" onerror="this.closest('.cs-ev2').remove()">
          <span class="cs-ev2-overlay"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#fff;"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
        </button>`;
    } else if (e.type === "video") {
      return `
        <div class="cs-ev2 ${wideClass} cs-ev2--video">
          <video src="${escapeHtml(e.src)}" controls preload="metadata" playsinline style="width:100%; height:100%; object-fit:cover; background:#000;"></video>
          ${e.caption ? `<span class="cs-ev2-video-cap">${escapeHtml(e.caption)}</span>` : ""}
        </div>`;
    } else if (e.type === "pdf") {
      return `
        <div class="cs-ev2 ${wideClass} cs-ev2--pdf">
          <a href="${escapeHtml(e.src)}" target="_blank" rel="noopener" class="cs-ev2-pdf-link" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; width:100%; text-decoration:none; padding:12px; box-sizing:border-box;">
            <span class="cs-ev2-pdf-icon" style="font-size:32px; margin-bottom:6px;">📄</span>
            <span class="cs-ev2-pdf-label" style="font-size:11px; font-family:'IBM Plex Sans'; color:var(--cds-text-primary); text-align:center; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.3; font-weight:500;">${escapeHtml(e.caption || 'Open PDF')}</span>
          </a>
        </div>`;
    }
    return "";
  }).join("");

  return `<section class="cs-block cs-block--evidence">
    <h2 class="cs-h2"><span>Evidence</span><i>${items.length} artifacts</i></h2>
    <div class="cs-ev2-grid">${tiles}</div>
  </section>`;
}

function renderCaseStudiesExplorer() {
  if (!els.navPageInner) els.navPageInner = document.getElementById("navPageInner");
  const root = els.navPageInner;
  if (!root) return;
  // Seeded by a deep link (?cs=<id> on load) or a back/forward reopen;
  // consumed once so a later plain tab-click starts at the grid as usual.
  let activeId = __pendingCSDeepLinkId; // null = grid, or case study id (e.g. "pixelate")
  __pendingCSDeepLinkId = null;
  const skipInitialHistorySync = __pendingCSSkipHistorySync;
  __pendingCSSkipHistorySync = false;

  const CS_STICKERS = {
    "haus-of-pixels": "public/stickers/haus logo.webp",
    "pixelate": "public/stickers/pixelateit_logo.jpg",
    "rabble-labs": "public/stickers/client_rabble.png",
    "buddy-tales": "public/stickers/client_buddy.png",
    "anirudh-website": "public/stickers/client_anirudh.png",
  };

  // Helper to parse years (e.g. "2017 – 2024" -> start: 2017, end: 2024)
  function parseCSYears(yearsStr) {
    const parts = String(yearsStr || "").split(/[-–—]/).map(s => s.trim());
    let startYear = parseInt(parts[0]) || 2009;
    let endYear = parseInt(parts[1]) || startYear;
    if (parts[1] && parts[1].toLowerCase() === "now") {
      endYear = new Date().getFullYear();
    }
    if (startYear === endYear) {
      startYear = startYear - 1; // force at least 1 year span
    }
    return { startYear, endYear };
  }

  // Horizontal interactive timeline SVG helper

  // Interactive Metrics SVG Bar Chart helper

  // Draw D3 metrics chart with scales, transitions, and hover interactivity


  // Interactive Pipeline Flowchart helper
  function buildInteractivePipelineHTML(cs) {
    const steps = (cs.pipeline && cs.pipeline.steps) || [];
    if (!steps.length) return "";
    
    const tabs = steps.map((s, i) => `
      <button type="button" class="cs-flow-tab-btn ${i === 0 ? "is-active" : ""}" data-cs-flow-step="${i}">
        <span class="cs-flow-tab-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="cs-flow-tab-title">${escapeHtml(s.title.toLowerCase())}</span>
      </button>
    `).join("");
    
    const defaultStep = steps[0];
    
    return `
      <div class="cs-interactive-flow" id="cs-flow-${cs.id}">
        <div class="cs-flow-steps-column">
          ${tabs}
        </div>
        <div class="cs-flow-active-panel" id="cs-flow-panel-${cs.id}">
          <h3 class="cs-flow-active-title" id="cs-flow-title-${cs.id}">${escapeHtml(defaultStep.title)}</h3>
          <p class="cs-flow-active-desc" id="cs-flow-desc-${cs.id}">${escapeHtml(defaultStep.desc)}</p>
        </div>
      </div>
    `;
  }

  function render(opts = {}) {
    if (!activeId) {
      renderCSGrid();
    } else {
      renderCSDetail(activeId);
    }
    if (opts.syncHistory !== false) syncCSHistory();
  }

  window.__csOpenDetail = (id) => {
    activeId = id;
    render({ syncHistory: false });
  };
  window.__csCloseDetail = () => {
    activeId = null;
    render({ syncHistory: false });
  };
  window.__csGetActiveId = () => activeId;

  // Pushes a `?cs=<id>` entry whenever activeId actually changes (including
  // null, so first entering this tab lays down a grid baseline — see
  // exitCSViaHistory). No-ops on a no-change render so re-renders (e.g.
  // after an edit save) don't spam history.
  function syncCSHistory() {
    const st = history.state;
    const current = st && ("cs" in st) ? st.cs : undefined;
    const wanted = activeId || null;
    if (current === wanted) return;
    const url = activeId ? `${location.pathname}?cs=${encodeURIComponent(activeId)}` : location.pathname;
    // On mobile, openNavPage has already pushed a {nav:"case-studies"} entry —
    // that IS the grid baseline, so pushing {cs:null} on top of it made two
    // history entries for one screen and Back appeared to stick: the first
    // press moved between two states that render identically. Fold them.
    if (wanted === null && history.state && history.state.nav === "case-studies") {
      history.replaceState({ cs: null, nav: "case-studies" }, "", url);
      return;
    }
    history.pushState({ cs: wanted }, "", url);
  }

  // Used by the in-panel "Back" and "Home" controls: if we're on a history
  // entry this view pushed, step back through it (popstate reopens fresh at
  // the right activeId) so the forward button keeps working. Returns false
  // when there's nothing of ours to unwind, so the caller falls back to a
  // direct state change.
  function exitCSViaHistory() {
    if (history.state && ("cs" in history.state)) {
      history.back();
      return true;
    }
    return false;
  }

  function renderCSGrid() {
    // Grid of folders
    let foldersHTML = caseStudies.map((cs) => {
      const thumb = CS_STICKERS[cs.id];
      const inner = thumb
        ? `<img class="fx-folder-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" style="object-fit:contain;padding:12px;box-sizing:border-box;" onerror="this.remove()">`
        : `<span class="fx-folder-glyph">${cs.glyph}</span>`;
      return `
        <button type="button" class="fx-folder" data-cs-folder="${cs.id}" style="--fc:var(--cds-accent)">
          <span class="fx-folder-art">${inner}</span>
          <span class="fx-folder-label">${escapeHtml(cs.title.toLowerCase())}</span>
          <span class="fx-folder-count">${escapeHtml(cs.status.toLowerCase())}</span>
        </button>
      `;
    }).join("");

    if (state.editMode) {
      foldersHTML += `
        <button type="button" class="fx-folder new-cs-card" id="cs-new-btn">
          <span class="fx-folder-art"><span class="new-cs-plus">+</span></span>
          <span class="fx-folder-label">new case study</span>
          <span class="fx-folder-count">create template</span>
        </button>
      `;
    }

    const isRelations = (state.caseStudiesViewMode === "relations");

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
              <span class="fx-heading-icon">${isRelations ? "🔗" : "📁"}</span>
              <span>case studies${isRelations ? " / relations map" : ""}</span>
            </div>
            <div class="fx-meta">
              ${isRelations ? "" : `<span>total <b>${caseStudies.length}</b></span>`}
              <button type="button" class="fx-codex-btn ${isRelations ? "is-active" : ""}" id="cs-toggle-relations">${isRelations ? "grid" : "relations"}</button>
            </div>
          </header>
          <div class="fx-body">
            <main class="fx-main" style="${isRelations ? "padding:0;" : ""}">
              ${isRelations ? `
                <div id="cs-relations-container" class="cs-relations-map"></div>
              ` : `
                <div class="fx-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 188px)) !important; gap: clamp(16px, 1.7vw, 32px) !important; justify-content: center !important;">
                  ${foldersHTML}
                </div>
              `}
            </main>
          </div>
        </div>
      </div>
    `;

    // Bind event listeners
    const container = root.querySelector(".fx");
    container.addEventListener("click", handleClicks);

    if (isRelations) {
      drawD3RelationsMap();
    } else {
      const newCSBtn = container.querySelector("#cs-new-btn");
      if (newCSBtn) {
        newCSBtn.addEventListener("click", () => {
          renderCSEditor(null);
        });
      }
    }
  }

  function drawD3RelationsMap() {
    const container = d3.select("#cs-relations-container");
    if (container.empty()) return;

    container.selectAll("*").remove();

    const width = container.node().clientWidth || 700;
    const height = 440;

    const svg = container.append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("class", "cs-relations-svg");

    const csRolesMap = {
      "haus-of-pixels": ["founder", "designer", "consultant", "photographer"],
      "pixelate": ["founder", "engineer", "researcher"],
      "rabble-labs": ["designer", "consultant", "art-director"],
      "buddy-tales": ["filmmaker", "producer", "animator"],
      "anirudh-website": ["engineer", "designer", "researcher"]
    };

    const roleThemeColors = {
      "founder": "#9AA878",
      "designer": "#E1FA3C",
      "art-director": "#E1FA3C",
      "photographer": "#F23B21",
      "cinematographer": "#F23B21",
      "filmmaker": "#F23B21",
      "producer": "#F23B21",
      "animator": "#F23B21",
      "consultant": "#C8923B",
      "researcher": "#C8923B",
      "engineer": "#8A9AA0"
    };

    const nodes = [];
    const links = [];

    // Add Case Study Nodes
    caseStudies.forEach(cs => {
      nodes.push({
        id: cs.id,
        label: cs.title,
        type: "case-study",
        color: cs.accentColor || "var(--csa)",
        r: 16
      });
    });

    // Add Role Nodes
    const uniqueRoles = new Set();
    Object.values(csRolesMap).forEach(list => list.forEach(r => uniqueRoles.add(r)));
    uniqueRoles.forEach(role => {
      nodes.push({
        id: `role-${role}`,
        label: role,
        type: "role",
        color: roleThemeColors[role] || "var(--cds-border)",
        r: 8
      });
    });

    // Add Links
    caseStudies.forEach(cs => {
      const list = csRolesMap[cs.id] || [];
      list.forEach(role => {
        links.push({
          source: cs.id,
          target: `role-${role}`
        });
      });
    });

    // D3 Force Simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => d.r + 20));

    // Links lines
    const link = svg.append("g")
      .attr("class", "cs-rel-links")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", "cs-rel-link");

    // Node groups
    const node = svg.append("g")
      .attr("class", "cs-rel-nodes")
      .selectAll(".cs-rel-node-group")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "cs-rel-node-group")
      .style("cursor", "pointer")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Case Study circles
    node.filter(d => d.type === "case-study")
      .append("circle")
      .attr("class", "cs-rel-node-cs")
      .attr("r", d => d.r)
      .attr("fill", d => d.color);

    // Role circles
    node.filter(d => d.type === "role")
      .append("circle")
      .attr("class", "cs-rel-node-role")
      .attr("r", d => d.r)
      .style("stroke", d => d.color);

    // Labels
    node.append("text")
      .attr("class", d => `cs-rel-label ${d.type === "role" ? "cs-rel-label-role" : ""}`)
      .attr("dx", d => d.type === "case-study" ? 22 : 14)
      .attr("dy", 4)
      .text(d => d.label);

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("transform", d => {
          // Constrain coordinates within SVG bounds
          d.x = Math.max(d.r + 15, Math.min(width - d.r - 15, d.x));
          d.y = Math.max(d.r + 15, Math.min(height - d.r - 15, d.y));
          return `translate(${d.x},${d.y})`;
        });
    });

    node.on("mouseover", function(event, d) {
      svg.selectAll(".cs-rel-node-cs, .cs-rel-node-role").style("fill-opacity", 0.2).style("stroke-opacity", 0.2);
      svg.selectAll(".cs-rel-label").style("fill-opacity", 0.2);
      svg.selectAll(".cs-rel-link").style("stroke-opacity", 0.1);

      // Highlight active node
      d3.select(this).select("circle").style("fill-opacity", 1).style("stroke-opacity", 1);
      d3.select(this).select("text").style("fill-opacity", 1);

      const connectedIds = new Set();
      connectedIds.add(d.id);

      const activeColor = d.type === "case-study" ? d.color : "var(--csa)";

      link.filter(l => l.source.id === d.id || l.target.id === d.id)
        .style("stroke-opacity", 1)
        .style("stroke-width", "2px")
        .style("stroke-dasharray", "none")
        .style("stroke", activeColor)
        .each(l => {
          connectedIds.add(l.source.id);
          connectedIds.add(l.target.id);
        });

      node.filter(n => connectedIds.has(n.id))
        .each(function(n) {
          d3.select(this).select("circle").style("fill-opacity", 1).style("stroke-opacity", 1);
          d3.select(this).select("text").style("fill-opacity", 1);
        });
    })
    .on("mouseout", function() {
      svg.selectAll(".cs-rel-node-cs, .cs-rel-node-role").style("fill-opacity", 1).style("stroke-opacity", 1);
      svg.selectAll(".cs-rel-label").style("fill-opacity", 1);
      svg.selectAll(".cs-rel-link")
        .style("stroke-opacity", 1)
        .style("stroke-width", "")
        .style("stroke-dasharray", "")
        .style("stroke", "");
    })
    .on("click", function(event, d) {
      if (d.type === "case-study") {
        activeId = d.id;
        render();
      }
    });

    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  }

  // Case-study reader, rebuilt to "Case Study.dc.html": a fixed scroll-progress
  // bar, a 232px sticky rail that tracks the active section, and numbered
  // full-bleed sections. Every value comes from data/case-studies.json — the
  // previous single-page version was the Lab demo ("Neon Requiem", A24) with
  // hardcoded copy, and the old detail view was the pre-Carbon editorial
  // infographic (D3 timeline SVG, flow tabs, 3D graph). Both are gone.
  function renderCSDetail(id) {
    const cs = caseStudies.find(x => x.id === id);
    if (!cs) { activeId = null; renderCSGrid(); return; }

    const isImg = (e) => e && (e.type === "image" || /\.(png|jpe?g|gif|webp|avif|svg)($|\?)/i.test(e.src || ""));
    const frames = (cs.evidence || []).filter(isImg);
    const steps = (cs.pipeline && cs.pipeline.steps) || [];
    const caps = cs.capabilities || [];
    const miles = [...(cs.milestones || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const stats = cs.stats || [];
    const metrics = (cs.outcomes && cs.outcomes.metrics) || [];
    const retro = String((cs.outcomes && cs.outcomes.retrospective) || "")
      .split(/\n\n+/).map(s => s.trim()).filter(Boolean);

    // Bar widths are scaled off the largest parsed figure. Stats with no digits
    // (e.g. "Registered OPC") get the floor width and read as a label row.
    const figOf = (v) => { const m = String(v).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null; };
    const maxFig = Math.max(1, ...stats.map(s => figOf(s.val) || 0));
    const widthOf = (v) => { const f = figOf(v); return f ? `${Math.max(14, Math.round((f / maxFig) * 92))}%` : "10%"; };

    // Only sections with real data get built, so the rail never links to a void.
    const secs = [];
    const push = (key, label, html) => { if (html) secs.push({ key, label, html }); };

    const eyebrow = (n, label) => `<div class="csr-eyebrow">${n} — ${escapeHtml(label)}</div>`;

    push("overview", "Overview", `
      <div class="csr-facts">
        ${[["Role", cs.roleFull || cs.role], ["Span", cs.years], ["Status", cs.status], ["Focus", cs.tagline]]
          .filter(([, v]) => v).map(([k, v]) => `
          <div class="csr-fact"><div class="csr-fact-k">${escapeHtml(k)}</div><div class="csr-fact-v">${escapeHtml(v)}</div></div>`).join("")}
      </div>
      ${cs.summary ? `<div class="csr-prose csr-prose--lead">${parseMarkdown(cs.summary)}</div>` : ""}`);

    push("approach", "Approach", !steps.length ? "" : `
      ${cs.pipeline.description ? `<h2 class="csr-h2">${parseMarkdown(cs.pipeline.description.replace(/:$/, "."))}</h2>` : ""}
      <div class="csr-steps">
        ${steps.map((s, i) => `
          <div class="csr-step">
            <div class="csr-step-n">${String(i + 1).padStart(2, "0")}</div>
            <div>
              <div class="csr-step-t">${escapeHtml(s.title)}</div>
              <div class="csr-step-d">${parseMarkdown(s.desc)}</div>
            </div>
          </div>`).join("")}
      </div>`);

    push("numbers", "By the numbers", !stats.length ? "" : `
      <h2 class="csr-h2">What the work moved.</h2>
      <div class="csr-bars">
        ${stats.map(s => `
          <div class="csr-bar">
            <div class="csr-bar-head">
              <span class="csr-bar-label">${escapeHtml(s.label)}</span>
              <span class="csr-bar-value">${escapeHtml(String(s.val))}</span>
            </div>
            <div class="csr-bar-track"><div class="csr-bar-fill" data-w="${widthOf(s.val)}"></div></div>
          </div>`).join("")}
      </div>`);

    push("capabilities", "Capabilities", !caps.length ? "" : `
      <div class="csr-steps">
        ${caps.map((c, i) => `
          <div class="csr-step">
            <div class="csr-step-n">${String(i + 1).padStart(2, "0")}</div>
            <div>
              <div class="csr-step-t">${escapeHtml(c.title)}</div>
              <div class="csr-step-d">${parseMarkdown(c.desc || "")}</div>
            </div>
          </div>`).join("")}
      </div>`);

    push("timeline", "Timeline", !miles.length ? "" : `
      <div class="csr-steps csr-steps--time">
        ${miles.map(m => `
          <div class="csr-step">
            <div class="csr-step-n">${escapeHtml(String(m.date || "").slice(0, 7))}</div>
            <div>
              <div class="csr-step-t">${escapeHtml(m.title)}</div>
              <div class="csr-step-d">${parseMarkdown(m.desc || "")}</div>
              ${m.ledgerEntryId ? `<button type="button" class="csr-jump" data-ledger-jump="${m.ledgerEntryId}">Open ledger entry →</button>` : ""}
            </div>
          </div>`).join("")}
      </div>`);

    push("frames", "Selected frames", !frames.length ? "" : `
      <div class="csr-frames">
        ${frames.map((f, i) => `
          <button type="button" class="csr-frame" data-cs-lightbox="${escapeHtml(f.src)}" data-cs-cap="${escapeHtml(f.caption || "")}" data-cs-idx="${i}">
            <img src="${escapeHtml(f.src)}" alt="${escapeHtml(f.caption || cs.title)}" loading="lazy" onerror="this.closest('.csr-frame').remove()">
            <span class="csr-frame-ref">${escapeHtml(f.caption || `ST-${String(i + 1).padStart(2, "0")}`)}</span>
          </button>`).join("")}
      </div>`);

    push("outcome", "Outcome", (!metrics.length && !retro.length) ? "" : `
      ${cs.outcomes && cs.outcomes.status ? `<h2 class="csr-h2">${parseMarkdown(cs.outcomes.status)}</h2>` : ""}
      ${metrics.length ? `<div class="csr-chips">${metrics.map(m => `<span class="csr-chip">${escapeHtml(m)}</span>`).join("")}</div>` : ""}
      ${retro.map(pp => `<div class="csr-prose">${parseMarkdown(pp)}</div>`).join("")}
      <div class="csr-actions">
        <button type="button" class="csr-btn csr-btn--primary" data-cs-back>Back to case studies</button>
      </div>`);

    const editBtnHTML = state.editMode
      ? `<button type="button" class="csr-btn csr-btn--ghost" id="cs-edit-btn">Edit case study</button>`
      : "";

    const heroEyebrow = ["Case study", cs.status, cs.years].filter(Boolean).join(" · ");

    root.innerHTML = `
      <div class="csr" data-view="case-studies">
        <div class="csr-progress"><div class="csr-progress-fill" id="csrProgressFill"></div></div>

        <aside class="csr-rail">
          <div class="csr-rail-ref">${escapeHtml(cs.status || "Case study")}</div>
          <div class="csr-rail-title">${escapeHtml(cs.title)}</div>
          <nav class="csr-rail-nav">
            ${secs.map((s, i) => `
              <button type="button" class="csr-rail-link" data-csr-goto="${s.key}">
                <span class="csr-rail-num">${String(i).padStart(2, "0")}</span>
                <span class="csr-rail-label">${escapeHtml(s.label)}</span>
              </button>`).join("")}
          </nav>
          <div class="csr-rail-foot">
            <button type="button" class="csr-rail-back" data-cs-back>← case studies</button>
            <span class="csr-rail-read"><span id="csrReadPct">0</span>% read</span>
            ${editBtnHTML}
          </div>
        </aside>

        <div class="csr-col">
          <section class="csr-sec csr-hero" data-csr-sec="hero">
            <div class="csr-eyebrow">${escapeHtml(heroEyebrow)}</div>
            <h1 class="csr-h1">${escapeHtml(cs.title)}</h1>
            ${cs.tagline ? `<p class="csr-lede">${escapeHtml(cs.tagline)}</p>` : ""}
            <div class="csr-scroll-hint"><span class="csr-rule"></span> scroll</div>
          </section>

          ${cs.heroMedia && cs.heroMedia.type !== "pdf" ? `
            <section class="csr-sec csr-sec--media" data-csr-sec="hero-media">
              <img class="csr-hero-img" src="${escapeHtml(cs.heroMedia.src)}" alt="${escapeHtml(cs.title)}" loading="lazy" onerror="this.closest('.csr-sec').remove()">
            </section>` : ""}

          ${secs.map((s, i) => `
            <section class="csr-sec" data-csr-sec="${s.key}" id="csr-${s.key}">
              ${eyebrow(String(i).padStart(2, "0"), s.label)}
              ${s.html}
            </section>`).join("")}
        </div>
      </div>
    `;

    const container = root.querySelector(".csr");
    container.addEventListener("click", handleClicks);

    const editBtn = container.querySelector("#cs-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        const first = (cs.milestones || []).find(m => m.ledgerEntryId);
        if (first) { state.editOriginNavView = "case-studies"; if (!isMobile()) closeNavPage(); selectEntry(first.ledgerEntryId, { zoom: true }); }
      });
    }

    // Rail nav → smooth scroll the nav-page scroller (not the window).
    const scroller = root.closest(".nav-page-inner") || root.parentElement || root;
    container.querySelectorAll("[data-csr-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = container.querySelector(`#csr-${btn.dataset.csrGoto}`);
        if (target) scroller.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
      });
    });

    // Progress bar + active rail link + bar growth, all off one passive
    // listener. An IntersectionObserver was wrong here: jumping straight past
    // the numbers section (rail nav, deep link) means it never intersects, so
    // the bars stayed at 0 width until the reader happened to scroll back up.
    const fill = container.querySelector("#csrProgressFill");
    const pctEl = container.querySelector("#csrReadPct");
    const links = [...container.querySelectorAll(".csr-rail-link")];
    const sections = secs.map(s => container.querySelector(`#csr-${s.key}`));
    const barSec = container.querySelector("#csr-numbers");
    let barsGrown = false;
    const onScroll = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / max)) : 0;
      if (fill) fill.style.width = `${(pct * 100).toFixed(1)}%`;
      if (pctEl) pctEl.textContent = String(Math.round(pct * 100));
      const marker = scroller.scrollTop + scroller.clientHeight * 0.35;
      let active = -1;
      sections.forEach((sec, i) => { if (sec && sec.offsetTop <= marker) active = i; });
      links.forEach((l, i) => l.classList.toggle("is-active", i === active));
      // Grow once the section's top edge has entered the lower viewport, and
      // also if it is already behind us — a jump must not leave empty tracks.
      if (!barsGrown && barSec && barSec.offsetTop <= scroller.scrollTop + scroller.clientHeight * 0.85) {
        barsGrown = true;
        container.querySelectorAll(".csr-bar-fill").forEach(bar => { bar.style.width = bar.dataset.w || "0%"; });
      }
    };
    // Re-renders must not stack listeners: the previous handler is parked on
    // the scroller element, so it can be removed even from a new closure.
    if (scroller._csrScroll) scroller.removeEventListener("scroll", scroller._csrScroll);
    scroller._csrScroll = onScroll;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  function renderCSEditor(id) {
    const isNew = !id;
    const cs = isNew ? {
      id: `case-study-${Date.now()}`,
      title: "",
      role: "",
      years: "",
      accentColor: "#FF007F",
      status: "DRAFT",
      glyph: "📁",
      heroMedia: { type: "image", src: "" },
      stats: [],
      pipeline: { description: "", steps: [] },
      evidence: [],
      milestones: [],
      outcomes: { metrics: [], retrospective: "", status: "" }
    } : JSON.parse(JSON.stringify(caseStudies.find(x => x.id === id))); // Deep clone to edit in isolation

    function drawForm() {
      const statsHTML = (cs.stats || []).map((s, idx) => `
        <div class="cs-editor-array-item" data-type="stat" data-idx="${idx}">
          <div class="cs-editor-array-item-header">
            <span class="cs-editor-array-item-index">Profile Spec #${idx + 1}</span>
            <div class="cs-editor-array-controls">
              <button type="button" class="cs-editor-btn-action move-up">▲</button>
              <button type="button" class="cs-editor-btn-action move-down">▼</button>
              <button type="button" class="cs-editor-btn-action delete">Delete</button>
            </div>
          </div>
          <div class="cs-editor-field-row two-col">
            <div class="cs-editor-field">
              <label class="cs-editor-label">label</label>
              <input type="text" class="cs-editor-input stat-label" value="${escapeHtml(s.label)}" placeholder="e.g. Structure">
            </div>
            <div class="cs-editor-field">
              <label class="cs-editor-label">value</label>
              <input type="text" class="cs-editor-input stat-val" value="${escapeHtml(s.val)}" placeholder="e.g. OPC Pvt Ltd">
            </div>
          </div>
        </div>
      `).join("");

      const stepsHTML = (cs.pipeline.steps || []).map((s, idx) => `
        <div class="cs-editor-array-item" data-type="step" data-idx="${idx}">
          <div class="cs-editor-array-item-header">
            <span class="cs-editor-array-item-index">Pipeline Step #${idx + 1}</span>
            <div class="cs-editor-array-controls">
              <button type="button" class="cs-editor-btn-action move-up">▲</button>
              <button type="button" class="cs-editor-btn-action move-down">▼</button>
              <button type="button" class="cs-editor-btn-action delete">Delete</button>
            </div>
          </div>
          <div class="cs-editor-field">
            <label class="cs-editor-label">step title</label>
            <input type="text" class="cs-editor-input step-title" value="${escapeHtml(s.title)}" placeholder="e.g. Strategy First">
          </div>
          <div class="cs-editor-field" style="margin-top:12px;">
            <label class="cs-editor-label">step description</label>
            <textarea class="cs-editor-input step-desc cs-editor-textarea" placeholder="Describe the workflow step...">${escapeHtml(s.desc)}</textarea>
          </div>
        </div>
      `).join("");

      const milestonesHTML = (cs.milestones || []).map((m, idx) => `
        <div class="cs-editor-array-item" data-type="milestone" data-idx="${idx}">
          <div class="cs-editor-array-item-header">
            <span class="cs-editor-array-item-index">Milestone #${idx + 1}</span>
            <div class="cs-editor-array-controls">
              <button type="button" class="cs-editor-btn-action move-up">▲</button>
              <button type="button" class="cs-editor-btn-action move-down">▼</button>
              <button type="button" class="cs-editor-btn-action delete">Delete</button>
            </div>
          </div>
          <div class="cs-editor-field-row mixed-col">
            <div class="cs-editor-field">
              <label class="cs-editor-label">milestone title</label>
              <input type="text" class="cs-editor-input milestone-title" value="${escapeHtml(m.title)}" placeholder="e.g. Incorporated Company">
            </div>
            <div class="cs-editor-field">
              <label class="cs-editor-label">date (YYYY-MM-DD)</label>
              <input type="text" class="cs-editor-input milestone-date monospace" value="${escapeHtml(m.date)}" placeholder="YYYY-MM-DD">
            </div>
          </div>
          <div class="cs-editor-field-row two-col" style="margin-top:12px;">
            <div class="cs-editor-field">
              <label class="cs-editor-label">description</label>
              <input type="text" class="cs-editor-input milestone-desc" value="${escapeHtml(m.desc)}" placeholder="Context behind milestone...">
            </div>
            <div class="cs-editor-field">
              <label class="cs-editor-label">ledger entry id (optional)</label>
              <input type="text" class="cs-editor-input milestone-ledgerId monospace" value="${m.ledgerEntryId || ""}" placeholder="e.g. 76">
            </div>
          </div>
        </div>
      `).join("");

      const evidenceHTML = (cs.evidence || []).map((e, idx) => `
        <div class="cs-editor-array-item" data-type="evidence" data-idx="${idx}">
          <div class="cs-editor-array-item-header">
            <span class="cs-editor-array-item-index">Evidence File #${idx + 1}</span>
            <div class="cs-editor-array-controls">
              <button type="button" class="cs-editor-btn-action move-up">▲</button>
              <button type="button" class="cs-editor-btn-action move-down">▼</button>
              <button type="button" class="cs-editor-btn-action delete">Delete</button>
            </div>
          </div>
          <div class="cs-editor-field-row three-col">
            <div class="cs-editor-field">
              <label class="cs-editor-label">type</label>
              <select class="cs-editor-input evidence-type">
                <option value="image" ${e.type === "image" ? "selected" : ""}>Image</option>
                <option value="pdf" ${e.type === "pdf" ? "selected" : ""}>PDF</option>
                <option value="video" ${e.type === "video" ? "selected" : ""}>Video (.mp4/.mov)</option>
                <option value="youtube" ${e.type === "youtube" ? "selected" : ""}>YouTube</option>
                <option value="x" ${e.type === "x" ? "selected" : ""}>X (Twitter)</option>
                <option value="instagram" ${e.type === "instagram" ? "selected" : ""}>Instagram</option>
              </select>
            </div>
            <div class="cs-editor-field">
              <label class="cs-editor-label">source url / file path</label>
              <input type="text" class="cs-editor-input evidence-src monospace" value="${escapeHtml(e.src || e.url || "")}" placeholder="e.g. public/proof/...">
            </div>
            <div class="cs-editor-field">
              <label class="cs-editor-label">caption</label>
              <input type="text" class="cs-editor-input evidence-caption" value="${escapeHtml(e.caption || "")}" placeholder="Description of evidence...">
            </div>
          </div>
        </div>
      `).join("");

      root.innerHTML = `
        <div class="fx is-single cs-info" data-view="case-studies" style="--cs-accent:var(--cds-accent)">
          <div class="fx-tabrow">
            <button type="button" class="fx-ftab fx-ftab--home" data-fx-home title="Home">${FOLIO_ICONS.home}</button>
            <button type="button" class="fx-ftab fx-ftab--roles" data-fx-tab="roles">roles</button>
            <button type="button" class="fx-ftab fx-ftab--clients" data-fx-tab="clients">clients</button>
            <button type="button" class="fx-ftab fx-ftab--case-studies is-active" data-fx-tab="case-studies">case studies</button>
          </div>
          <div class="fx-sheet">
            <header class="fx-chrome">
              <div class="fx-heading">
                <span class="fx-crumb"><button type="button" class="fx-crumb-btn" id="cs-editor-back">${isNew ? "case studies" : escapeHtml(cs.title.toLowerCase())}</button></span>
                <span class="fx-crumb-sep">/</span>
                <span class="fx-crumb fx-crumb--current">editor</span>
              </div>
              <div class="fx-meta">
                <span class="cs-editor-array-item-index" style="text-transform:uppercase;letter-spacing:1px;font-size:11px;">CMS Mode</span>
              </div>
            </header>
            <div class="fx-body">
              <main class="fx-main cs-info-scroll" style="padding-bottom:120px !important;">
                
                <div class="cs-editor-form">
                  <div class="cs-editor-fields">
                    
                    <!-- GENERAL INFO -->
                    <div class="cs-editor-section-card">
                      <h2 class="cs-editor-section-title">General Metadata</h2>
                      <div class="cs-editor-field-row two-col">
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">case study id (slug)</label>
                          <input type="text" id="cs-form-id" class="cs-editor-input monospace" value="${escapeHtml(cs.id)}" ${isNew ? "" : "disabled"} placeholder="e.g. haus-of-pixels">
                        </div>
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">title</label>
                          <input type="text" id="cs-form-title" class="cs-editor-input" value="${escapeHtml(cs.title)}" placeholder="e.g. Haus of Pixels">
                        </div>
                      </div>
                      
                      <div class="cs-editor-field-row three-col">
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">role</label>
                          <input type="text" id="cs-form-role" class="cs-editor-input" value="${escapeHtml(cs.role)}" placeholder="e.g. Founder & Director">
                        </div>
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">span / years</label>
                          <input type="text" id="cs-form-years" class="cs-editor-input monospace" value="${escapeHtml(cs.years)}" placeholder="e.g. 2022 – Now">
                        </div>
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">status badge</label>
                          <input type="text" id="cs-form-status" class="cs-editor-input monospace" value="${escapeHtml(cs.status)}" placeholder="e.g. COMPANY / STUDIO">
                        </div>
                      </div>

                      <div class="cs-editor-field-row three-col">
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">glyph / emoji</label>
                          <input type="text" id="cs-form-glyph" class="cs-editor-input" value="${escapeHtml(cs.glyph)}" placeholder="e.g. 🏢">
                        </div>
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">accent color (hex)</label>
                          <input type="color" id="cs-form-color-picker" class="cs-editor-input" value="${cs.accentColor[0] === "#" ? cs.accentColor : "#" + cs.accentColor}" style="height:38px;padding:2px;cursor:pointer;">
                        </div>
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">hex text</label>
                          <input type="text" id="cs-form-color-hex" class="cs-editor-input monospace" value="${escapeHtml(cs.accentColor)}" placeholder="#FF007F">
                        </div>
                      </div>
                    </div>

                    <!-- HERO MEDIA -->
                    <div class="cs-editor-section-card">
                      <h2 class="cs-editor-section-title">Hero Banner Media</h2>
                      <div class="cs-editor-field-row two-col">
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">media type</label>
                          <select id="cs-form-media-type" class="cs-editor-input">
                            <option value="image" ${cs.heroMedia && cs.heroMedia.type === "image" ? "selected" : ""}>Image (.webp/.png/.jpg)</option>
                            <option value="pdf" ${cs.heroMedia && cs.heroMedia.type === "pdf" ? "selected" : ""}>PDF Document</option>
                          </select>
                        </div>
                        <div class="cs-editor-field">
                          <label class="cs-editor-label">media url</label>
                          <input type="text" id="cs-form-media-src" class="cs-editor-input monospace" value="${escapeHtml(cs.heroMedia ? cs.heroMedia.src : "")}" placeholder="e.g. public/proof/...">
                        </div>
                      </div>
                    </div>

                    <!-- PROFILE SPECS -->
                    <div class="cs-editor-section-card" id="cs-form-stats-sec">
                      <h2 class="cs-editor-section-title">Profile Specs & Facts</h2>
                      <div class="cs-editor-array-container">
                        ${statsHTML}
                      </div>
                      <button type="button" class="cs-editor-btn-add" id="cs-add-stat-btn">+ Add profile spec</button>
                    </div>

                    <!-- PIPELINE -->
                    <div class="cs-editor-section-card">
                      <h2 class="cs-editor-section-title">Process Pipeline</h2>
                      <div class="cs-editor-field">
                        <label class="cs-editor-label">pipeline lede description</label>
                        <textarea id="cs-form-pipe-desc" class="cs-editor-input cs-editor-textarea" placeholder="Lede explaining the timeline pipeline...">${escapeHtml(cs.pipeline.description)}</textarea>
                      </div>
                      <div class="cs-editor-array-container" id="cs-form-steps-sec" style="margin-top:16px;">
                        ${stepsHTML}
                      </div>
                      <button type="button" class="cs-editor-btn-add" id="cs-add-step-btn">+ Add pipeline step</button>
                    </div>

                    <!-- MILESTONES -->
                    <div class="cs-editor-section-card" id="cs-form-milestones-sec">
                      <h2 class="cs-editor-section-title">Milestones Chronology</h2>
                      <div class="cs-editor-array-container">
                        ${milestonesHTML}
                      </div>
                      <button type="button" class="cs-editor-btn-add" id="cs-add-milestone-btn">+ Add milestone node</button>
                    </div>

                    <!-- OUTCOMES -->
                    <div class="cs-editor-section-card">
                      <h2 class="cs-editor-section-title">Project Outcomes</h2>
                      <div class="cs-editor-field">
                        <label class="cs-editor-label">metrics (comma-separated chips)</label>
                        <input type="text" id="cs-form-metrics" class="cs-editor-input" value="${escapeHtml((cs.outcomes.metrics || []).join(", "))}" placeholder="Registered OPC, $15K NEAR Grant, 187 Commits">
                      </div>
                      <div class="cs-editor-field" style="margin-top:12px;">
                        <label class="cs-editor-label">retrospective analysis</label>
                        <textarea id="cs-form-retro" class="cs-editor-input cs-editor-textarea" placeholder="Reflections on the project and outcomes...">${escapeHtml(cs.outcomes.retrospective)}</textarea>
                      </div>
                      <div class="cs-editor-field" style="margin-top:12px;">
                        <label class="cs-editor-label">current operational status</label>
                        <input type="text" id="cs-form-outcomes-status" class="cs-editor-input" value="${escapeHtml(cs.outcomes.status)}" placeholder="e.g. Active operating studio...">
                      </div>
                    </div>

                    <!-- EVIDENCE -->
                    <div class="cs-editor-section-card" id="cs-form-evidence-sec">
                      <h2 class="cs-editor-section-title">Evidence Artifacts (Bento)</h2>
                      <div class="cs-editor-array-container">
                        ${evidenceHTML}
                      </div>
                      <button type="button" class="cs-editor-btn-add" id="cs-add-evidence-btn">+ Add evidence file</button>
                    </div>

                  </div>
                  
                  <div class="cs-editor-sidebar">
                    <h2 class="cs-editor-section-title" style="border:none;margin:0;">Actions</h2>
                    <button type="button" class="cs-editor-action-btn-large save" id="cs-editor-save-btn">SAVE CHANGES</button>
                    <button type="button" class="cs-editor-action-btn-large cancel" id="cs-editor-cancel-btn">CANCEL</button>
                    ${isNew ? "" : `<button type="button" class="cs-editor-action-btn-large delete-cs" id="cs-editor-delete-btn">DELETE CASE STUDY</button>`}
                  </div>
                </div>

              </main>
            </div>
          </div>
        </div>
      `;

      bindFormEvents();
    }

    function saveCurrentInputs() {
      cs.title = root.querySelector("#cs-form-title").value;
      cs.role = root.querySelector("#cs-form-role").value;
      cs.years = root.querySelector("#cs-form-years").value;
      cs.status = root.querySelector("#cs-form-status").value;
      cs.glyph = root.querySelector("#cs-form-glyph").value;
      cs.accentColor = root.querySelector("#cs-form-color-hex").value;
      
      cs.heroMedia = {
        type: root.querySelector("#cs-form-media-type").value,
        src: root.querySelector("#cs-form-media-src").value
      };

      // Stats
      const statItems = root.querySelectorAll("[data-type='stat']");
      cs.stats = Array.from(statItems).map(item => ({
        label: item.querySelector(".stat-label").value,
        val: item.querySelector(".stat-val").value
      }));

      // Pipeline
      cs.pipeline.description = root.querySelector("#cs-form-pipe-desc").value;
      const stepItems = root.querySelectorAll("[data-type='step']");
      cs.pipeline.steps = Array.from(stepItems).map(item => ({
        title: item.querySelector(".step-title").value,
        desc: item.querySelector(".step-desc").value
      }));

      // Milestones
      const milestoneItems = root.querySelectorAll("[data-type='milestone']");
      cs.milestones = Array.from(milestoneItems).map(item => ({
        title: item.querySelector(".milestone-title").value,
        date: item.querySelector(".milestone-date").value,
        desc: item.querySelector(".milestone-desc").value,
        ledgerEntryId: item.querySelector(".milestone-ledgerId").value ? Number(item.querySelector(".milestone-ledgerId").value) : null
      }));

      // Outcomes
      const metricsText = root.querySelector("#cs-form-metrics").value;
      cs.outcomes.metrics = metricsText.split(",").map(s => s.trim()).filter(Boolean);
      cs.outcomes.retrospective = root.querySelector("#cs-form-retro").value;
      cs.outcomes.status = root.querySelector("#cs-form-outcomes-status").value;

      // Evidence
      const evidenceItems = root.querySelectorAll("[data-type='evidence']");
      cs.evidence = Array.from(evidenceItems).map(item => {
        const type = item.querySelector(".evidence-type").value;
        const src = item.querySelector(".evidence-src").value;
        const caption = item.querySelector(".evidence-caption").value;
        return {
          type,
          src,
          caption
        };
      });
    }

    function bindFormEvents() {
      const container = root.querySelector(".fx");

      // Color picker sync
      const picker = container.querySelector("#cs-form-color-picker");
      const hexInput = container.querySelector("#cs-form-color-hex");
      picker.addEventListener("input", (e) => {
        hexInput.value = e.target.value.toUpperCase();
      });
      hexInput.addEventListener("input", (e) => {
        let val = e.target.value;
        if (val[0] !== "#") val = "#" + val;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
          picker.value = val;
        }
      });

      // Array additions
      container.querySelector("#cs-add-stat-btn").addEventListener("click", () => {
        saveCurrentInputs();
        cs.stats.push({ label: "", val: "" });
        drawForm();
      });
      container.querySelector("#cs-add-step-btn").addEventListener("click", () => {
        saveCurrentInputs();
        cs.pipeline.steps.push({ title: "", desc: "" });
        drawForm();
      });
      container.querySelector("#cs-add-milestone-btn").addEventListener("click", () => {
        saveCurrentInputs();
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        cs.milestones.push({ date: dateStr, title: "", desc: "", ledgerEntryId: null });
        drawForm();
      });
      container.querySelector("#cs-add-evidence-btn").addEventListener("click", () => {
        saveCurrentInputs();
        cs.evidence.push({ type: "image", src: "", caption: "" });
        drawForm();
      });

      // Array item controls (delete, move up, move down)
      container.addEventListener("click", (e) => {
        const btnAction = e.target.closest(".cs-editor-btn-action");
        if (!btnAction) return;
        
        const item = btnAction.closest(".cs-editor-array-item");
        if (!item) return;

        const type = item.dataset.type;
        const idx = Number(item.dataset.idx);

        saveCurrentInputs();

        let arr;
        if (type === "stat") arr = cs.stats;
        else if (type === "step") arr = cs.pipeline.steps;
        else if (type === "milestones" || type === "milestone") arr = cs.milestones;
        else if (type === "evidence") arr = cs.evidence;

        if (!arr) return;

        if (btnAction.classList.contains("delete")) {
          arr.splice(idx, 1);
        } else if (btnAction.classList.contains("move-up") && idx > 0) {
          const temp = arr[idx];
          arr[idx] = arr[idx - 1];
          arr[idx - 1] = temp;
        } else if (btnAction.classList.contains("move-down") && idx < arr.length - 1) {
          const temp = arr[idx];
          arr[idx] = arr[idx + 1];
          arr[idx + 1] = temp;
        }

        drawForm();
      });

      // Back / Cancel
      const cancelAct = () => {
        if (isNew) {
          activeId = null;
          renderCSGrid();
        } else {
          activeId = cs.id;
          renderCSDetail(cs.id);
        }
      };
      container.querySelector("#cs-editor-back").addEventListener("click", cancelAct);
      container.querySelector("#cs-editor-cancel-btn").addEventListener("click", cancelAct);

      // Save
      container.querySelector("#cs-editor-save-btn").addEventListener("click", async () => {
        saveCurrentInputs();
        if (isNew) {
          cs.id = root.querySelector("#cs-form-id").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
          if (!cs.id) { alert("ID is required for a new case study."); return; }
        }
        if (!cs.title.trim()) { alert("Title is required."); return; }

        const saveBtn = container.querySelector("#cs-editor-save-btn");
        saveBtn.disabled = true;
        saveBtn.textContent = "SAVING...";

        try {
          const method = isNew ? "POST" : "PUT";
          const url = isNew ? "/api/case-studies" : `/api/case-studies/${encodeURIComponent(cs.id)}`;
          
          const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cs)
          });

          if (response.ok) {
            // Reload case studies in memory
            const refreshResp = await fetch(`data/case-studies.json?_t=${Date.now()}`);
            if (refreshResp.ok) {
              const freshData = await refreshResp.json();
              caseStudies = freshData.caseStudies || [];
              if (els.navCaseStudiesCount) setText(els.navCaseStudiesCount, String(caseStudies.length));
            }
            activeId = cs.id;
            renderCSDetail(cs.id);
          } else {
            const err = await response.json();
            alert("Error saving: " + (err.error || response.statusText));
            saveBtn.disabled = false;
            saveBtn.textContent = "SAVE CHANGES";
          }
        } catch (ex) {
          alert("Network error saving case study: " + ex);
          saveBtn.disabled = false;
          saveBtn.textContent = "SAVE CHANGES";
        }
      });

      // Delete case study
      const delBtn = container.querySelector("#cs-editor-delete-btn");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm(`Are you absolutely sure you want to permanently delete case study "${cs.title}"?`)) return;
          
          delBtn.disabled = true;
          delBtn.textContent = "DELETING...";

          try {
            const response = await fetch(`/api/case-studies/${encodeURIComponent(cs.id)}`, {
              method: "DELETE"
            });

            if (response.ok) {
              // Reload in memory
              const refreshResp = await fetch(`data/case-studies.json?_t=${Date.now()}`);
              if (refreshResp.ok) {
                const freshData = await refreshResp.json();
                caseStudies = freshData.caseStudies || [];
                if (els.navCaseStudiesCount) setText(els.navCaseStudiesCount, String(caseStudies.length));
              }
              activeId = null;
              renderCSGrid();
            } else {
              const err = await response.json();
              alert("Error deleting: " + (err.error || response.statusText));
              delBtn.disabled = false;
              delBtn.textContent = "DELETE CASE STUDY";
            }
          } catch (ex) {
            alert("Network error deleting case study: " + ex);
            delBtn.disabled = false;
            delBtn.textContent = "DELETE CASE STUDY";
          }
        });
      }
    }

    drawForm();
  }

  function handleClicks(e) {
    // 1. Home / other tabs
    const homeBtn = e.target.closest("[data-fx-home]");
    if (homeBtn) { if (!exitCSViaHistory()) closeNavPage(); return; }

    const tab = e.target.closest("[data-fx-tab]");
    if (tab) {
      // Sideways navigation to a different top-level tab, not an undo —
      // just quietly drop any ?cs= param rather than fighting popstate's
      // async timing with a history.back() here.
      if (history.state && ("cs" in history.state)) {
        history.replaceState(null, "", location.pathname);
      }
      openNavPage(tab.dataset.fxTab);
      return;
    }

    // Relations map toggle click
    const toggleRel = e.target.closest("#cs-toggle-relations");
    if (toggleRel) {
      state.caseStudiesViewMode = state.caseStudiesViewMode === "relations" ? "grid" : "relations";
      renderCSGrid();
      return;
    }

    // 2. Folder click (landing -> detail)
    const folder = e.target.closest("[data-cs-folder]");
    if (folder) {
      NavStack.push("case-study-detail", { slug: folder.dataset.csFolder });
      return;
    }

    // 3. Sidebar row click (grid or detailed view)
    const srow = e.target.closest("[data-cs-srow]");
    if (srow) {
      NavStack.push("case-study-detail", { slug: srow.dataset.csSrow });
      return;
    }

    // 4. Back button
    const backBtn = e.target.closest("[data-cs-back]");
    if (backBtn) {
      NavStack.pop();
      return;
    }

    // 5. Ledger jump milestone click
    const jump = e.target.closest("[data-ledger-jump]");
    if (jump) {
      const entryId = Number(jump.dataset.ledgerJump);
      if (entryId) {
        state.editOriginNavView = "case-studies";
        if (!isMobile()) closeNavPage(); // see [data-client-entry] above
        selectEntry(entryId, { zoom: true });
      }
      return;
    }

    // 6. Evidence tile → lightbox
    const lb = e.target.closest("[data-cs-lightbox]");
    if (lb) {
      const cs = caseStudies.find(x => x.id === activeId);
      if (cs && cs.evidence) {
        const images = cs.evidence.filter(ev => ev.type === "image");
        const clickedSrc = lb.dataset.csLightbox;
        const startIdx = images.findIndex(img => img.src === clickedSrc);
        if (startIdx >= 0) {
          openCSLightbox(images, startIdx);
          return;
        }
      }
      openLightbox(lb.dataset.csLightbox, lb.dataset.csCap || "");
      return;
    }
  }

  render({ syncHistory: !skipInitialHistorySync });
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
  if (norm.includes("pixelate")) return "public/stickers/pixelateit_logo.jpg";
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
      <div class="fx-sheet-wrapper">
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
      const evHero = entryHero(e);
      // Thumbnail priority: real evidence image → the company logo assigned in
      // the clients/case-studies tabs (getClientLogoSticker) → a fanned stack of
      // the entry's ROLE stickers. So a branded project with no photo still reads
      // as its company rather than a generic glyph.
      const logo = getClientLogoSticker(e.org || e.clientCanonical);
      const hero = evHero || logo;
      const isLogo = !evHero && !!logo;
      const meta = [e.year, e.role].filter(Boolean).join("  ·  ");
      const art = `<span class="fx-file-ico">${glyph || ""}</span>${
        hero ? "" : renderStickleFan(entryStickleIds(e), { size: 200, extraClass: "fx-file-fan" })
      }${
        hero ? `<img class="fx-file-thumb${isLogo ? " fx-file-thumb--logo" : ""}" src="${escapeHtml(hero)}" alt="" loading="lazy" onerror="this.remove()">` : ""
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


// Sortable numeric stamp for an entry — year·month·day. Everything in the
// roles/clients explorer orders by this DESCENDING (latest work first).
function entryTimeKey(e) {
  const y = Number(e && e.year);
  if (!y || isNaN(y)) return 0;
  const m = Number(e && e.month), d = Number(e && e.day);
  return y * 10000 + (isNaN(m) ? 1 : m) * 100 + (isNaN(d) ? 1 : d);
}

// Newest-first ordering for a list of entries.
function byTimeDesc(a, b) {
  return entryTimeKey(b) - entryTimeKey(a);
}

// The image the hover preview should show for a group of entries. Same
// fallback chain the cluster cards use: real evidence → client logo →
// role sticker. `list` must already be newest-first so the most recent
// documented piece of evidence wins.
function rosterThumbFor(list) {
  const arr = Array.isArray(list) ? list : [list];
  for (const e of arr) {
    const src = evidencePreviewSrc(e);
    if (src) return src;
  }
  for (const e of arr) {
    const logo = getClientLogoSticker(e.org || e.clientCanonical);
    if (logo) return logo;
  }
  const ids = arr[0] ? entryStickleIds(arr[0]) : [];
  return ids && ids.length ? stickleUrl(ids[0], 240) : "";
}

// Group entries by a key function → [{ label, list }] newest-first, where
// each group's rank is its most recent entry. (Distinct from the older
// groupEntriesBy(field, fallback), which groups the global entries array by a
// single field name and ranks by size.)
function groupByKeysTimeDesc(list, keysOf) {
  const map = new Map();
  list.forEach((e) => {
    keysOf(e).forEach((k) => {
      const label = String(k || "").trim();
      if (!label) return;
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(e);
    });
  });
  return [...map.entries()]
    .map(([label, items]) => {
      items.sort(byTimeDesc);
      return { label, list: items, count: items.length, time: entryTimeKey(items[0]) };
    })
    .sort((a, b) => b.time - a.time || a.label.localeCompare(b.label));
}

function renderNavPage() {
  if (!els.navPageInner) els.navPageInner = document.getElementById("navPageInner");
  if (!els.navPageInner) return;
  const view = navPageState.view || "roles";

  els.navPageInner.classList.remove("np-explorer");

  if (view === "case-studies") {
    renderCaseStudiesExplorer();
    return;
  }

  if (view === "contact") {
    renderContactForm();
    return;
  }

  const isClients = view === "clients";

  // The rail enumerates roles on the Roles tab and client organizations on the
  // Clients tab — the two tabs are different cuts of the ledger, not the same
  // list with different headings. Both key off the canonical helpers so the
  // rail length always matches the count on the nav tab.
  const railGroups = isClients
    ? groupByKeysTimeDesc(entries, (e) => [entryClientKey(e)])
    : groupByKeysTimeDesc(entries, entryRoleKeys);

  if (!railGroups.length) {
    els.navPageInner.innerHTML = `<div class="roles-explorer-layout"><aside class="roles-explorer-rail"></aside><div class="client-matrix-wrap"></div></div>`;
    return;
  }

  // Keep the selection when switching tabs only if it still exists in this cut.
  const stateKey = isClients ? "activeClient" : "activeRole";
  let activeLabel = navPageState[stateKey];
  if (!activeLabel || !railGroups.some((g) => g.label === activeLabel)) {
    activeLabel = railGroups[0].label;
    navPageState[stateKey] = activeLabel;
  }
  const activeGroup = railGroups.find((g) => g.label === activeLabel) || railGroups[0];

  // Right panel: on Clients it's the selected org's projects; on Roles it's
  // the organizations that engaged that role. Both newest-first.
  const matrixCards = isClients
    ? activeGroup.list.map((e) => ({
        title: e.title || "Untitled",
        meta: [e.role || (e.roles || [])[0], e.date || e.year].filter(Boolean).join(" · "),
        entryId: e.id,
        thumb: rosterThumbFor([e])
      }))
    : groupByKeysTimeDesc(activeGroup.list, (e) => [orgLabelOf(e)]).map((g) => ({
        title: g.label,
        meta: `${g.count} project${g.count === 1 ? "" : "s"} · ${g.list[0].year || ""}`,
        entryId: g.list[0].id,
        thumb: rosterThumbFor(g.list)
      }));

  // Open on the LIST, not on a drilled-in item. activeLabel always defaults to
  // railGroups[0], so a collapsed-by-default rail meant the Roles tab opened
  // showing one role's clients with the other 24 hidden behind a control that
  // reads as "close this" — you had to collapse something to see the menu.
  // Mobile only; on desktop `rail-open` matches nothing outside the 900px block.
  const railOpen = !navPageState.railPicked;

  els.navPageInner.classList.add("np-explorer");
  els.navPageInner.innerHTML = `
    <div class="roles-explorer-layout${railOpen ? " rail-open" : ""}">
      <!-- Mobile rail control. The 280px rail cannot sit beside the matrix on a
           phone, so below 900px it collapses behind this button and the matrix
           gets the full width. display:none on desktop, so it stays out of the
           two-column grid there. -->
      <button type="button" class="explorer-rail-toggle" aria-expanded="${railOpen}">
        <span class="explorer-rail-toggle-key">${railOpen ? (isClients ? "Clients" : "Roles") : (isClients ? "Client" : "Role")}</span>
        <span class="explorer-rail-toggle-val">${railOpen ? `${railGroups.length} total` : escapeHtml(activeLabel)}</span>
        <span class="explorer-rail-toggle-chevron" aria-hidden="true"></span>
      </button>
      <!-- Left rail -->
      <aside class="roles-explorer-rail">
        <div class="roles-explorer-label">${isClients ? "Clients" : "Roles"}</div>
        ${railGroups.map(g => `
            <button type="button" class="roles-explorer-btn${g.label === activeLabel ? " active" : ""}" data-role-select="${escapeHtml(g.label)}" data-thumb="${escapeHtml(rosterThumbFor(g.list))}">
              <span class="roles-explorer-title">${escapeHtml(g.label)}</span>
              <span class="roles-explorer-count">${g.count} project${g.count === 1 ? "" : "s"}</span>
            </button>
          `).join('')}
      </aside>

      <!-- Right matrix -->
      <div class="client-matrix-wrap">
        <div class="client-matrix-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <span>${escapeHtml(activeLabel.toUpperCase())} — ${isClients ? "Projects" : "Clients &amp; Studios"}</span>
          <button type="button" class="onboard-btn" style="margin-left:auto;padding:5px 12px;font-size:11px;border-radius:4px;cursor:pointer;" data-filter-active-group="${escapeHtml(activeLabel)}">Filter Archive →</button>
        </div>
        <div class="client-matrix-grid">
          ${matrixCards.map(c => `
            <div class="client-matrix-card" data-client-entry="${c.entryId || ''}" data-thumb="${escapeHtml(c.thumb || '')}">
              ${c.thumb ? `<img src="${escapeHtml(c.thumb)}" alt="" class="client-matrix-thumb" style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0;">` : `<div class="client-monogram-fallback">${escapeHtml(getMonogram(c.title))}</div>`}
              <div style="flex:1;min-width:0;">
                <div class="client-matrix-name">${escapeHtml(c.title)}</div>
                <div class="client-matrix-meta">${escapeHtml(c.meta)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Mobile: the rail is a disclosure. It re-renders collapsed on every
  // selection, which is the behaviour we want — pick a role, get the matrix.
  const explorerLayout = els.navPageInner.querySelector(".roles-explorer-layout");
  const railToggle = els.navPageInner.querySelector(".explorer-rail-toggle");
  if (explorerLayout && railToggle) {
    railToggle.addEventListener("click", () => {
      const open = explorerLayout.classList.toggle("rail-open");
      railToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // Filter Archive button in matrix header
  const filterBtn = els.navPageInner.querySelector("[data-filter-active-group]");
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      closeNavPage();
      state.search = activeLabel;
      if (els.searchInput) els.searchInput.value = activeLabel;
      applyFilters();
      if (isMobile()) pushMobileNavState("archive");
    });
  }

  els.navPageInner.querySelectorAll("[data-role-select]").forEach(btn => {
    btn.addEventListener("click", () => {
      navPageState[stateKey] = btn.dataset.roleSelect;
      navPageState.railPicked = true; // collapse to the matrix on re-render
      renderNavPage();
      // The open rail can be taller than the viewport, so a selection made
      // near its bottom would otherwise leave the new matrix scrolled past.
      els.navPageInner.scrollTop = 0;
    });
  });

  // 13 · Hover roster preview over the rail + the matrix
  initHoverRoster(els.navPageInner.querySelector(".roles-explorer-rail"), ".roles-explorer-btn");
  initHoverRoster(els.navPageInner.querySelector(".client-matrix-grid"), ".client-matrix-card");

  els.navPageInner.querySelectorAll("[data-client-entry]").forEach(card => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.clientEntry);
      if (id) {
        if (!isMobile()) closeNavPage();
        selectEntry(id, { zoom: true, scroll: true });
      }
    });
  });
}

// On mobile each section gets a history entry so the system Back gesture steps
// back through the site instead of walking straight off it. Desktop keeps its
// old behaviour — its overlays are dismissed with the ×, not with Back.
function pushMobileNavState(view) {
  if (!isMobile() || navPageState.view === view) return;
  try { history.pushState({ nav: view }, "", location.pathname); } catch (e) {}
  navPageState.view = view;
}

function openNavPageDirect(view, { pushHistory = true } = {}) {
  if (!els.navPage) els.navPage = document.getElementById("navPage");
  if (!els.navPageInner) els.navPageInner = document.getElementById("navPageInner");
  if (!els.navPage || !els.navPageInner) return;
  if (pushHistory) pushMobileNavState(view);
  navPageState.view = view;
  navPageState.railPicked = false;
  renderNavPage();
  els.navPage.classList.add("visible");
  els.navPage.setAttribute("aria-hidden", "false");
  setActiveNav(view);
}

function openNavPage(view, opts = {}) {
  if (opts.fromNavStack) {
    openNavPageDirect(view, opts);
  } else {
    NavStack.push(view);
  }
}

function closeNavPageDirect() {
  if (els.navPage) {
    els.navPage.classList.remove("visible");
    els.navPage.setAttribute("aria-hidden", "true");
  }
}

function closeNavPage() {
  NavStack.pop();
}

// Track codex view state for roles/clients
let navCodexActive = false;

let _navCodexCleanup = null;

// The deduplicated contact link matrix
const CONTACT_ROWS = [
  { label: "Email", value: "1991anirudh@gmail.com", href: "mailto:1991anirudh@gmail.com", isEmail: true },
  { label: "Phone / WhatsApp", value: "+91 90336 26897", href: "https://wa.me/919033626897" },
  { label: "Location", value: "Neelagiri / Puducherry, Tamil Nadu (UTC+5:30)", href: "#" },
  { label: "LinkedIn", value: "linkedin.com/in/anirudh-light", href: "https://www.linkedin.com/in/anirudh-light/" },
  { label: "GitHub", value: "github.com/Pixel-Explorer", href: "https://github.com/Pixel-Explorer" },
  { label: "Behance", value: "behance.net/anirudhjust", href: "https://www.behance.net/anirudhjust" },
  { label: "YouTube", value: "youtube.com/@pixel.explorer.mp4", href: "https://www.youtube.com/@pixel.explorer.mp4" },
  { label: "Portfolio", value: "Download folio 2026 (PDF)", href: "public/Anirudh-Venkatesan-Folio-2026.pdf", download: "Anirudh-Venkatesan-Folio-2026.pdf" },
];

function contactRowsHTML() {
  return CONTACT_ROWS.map((c) => {
    const isDownload = Boolean(c.download);
    const isAction = c.href === "#";
    const attrs = isDownload
      ? ` download="${escapeHtml(c.download)}"`
      : isAction
      ? ` onclick="return false;"`
      : ` target="_blank" rel="noopener"`;
    return `
      <div class="contact-row-wrap" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <a href="${escapeHtml(c.href)}" class="contact-row${isDownload ? " contact-row--folio" : ""}" style="flex:1;"${attrs}>
          <span class="contact-row-key">${escapeHtml(c.label)}</span>
          <span class="contact-row-val css-link-sweep">${escapeHtml(c.value)} ${isDownload ? "↓" : isAction ? "" : "↗"}</span>
        </a>
        ${c.isEmail ? `<button type="button" id="copyDirectEmailRowBtn" class="onboard-btn" style="padding:4px 8px;font-size:10px;height:26px;border-radius:4px;border:1px solid var(--cds-border);background:var(--cds-layer-01);color:var(--cds-text-primary);cursor:pointer;" title="Copy email address">Copy</button>` : ""}
      </div>`;
  }).join("");
}

function renderContactForm() {
  if (!els.navPageInner) return;
  els.navPageInner.innerHTML = `
    <div class="contact-grid">
      <div class="contact-left">
        <div class="contact-kicker">Contact</div>
        <h1 class="contact-title">Let's make<br>something.</h1>
        <p class="contact-subtitle">Available for direction, design systems, and creative consulting. Response within two business days.</p>
        <p style="margin: 0 0 16px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--cds-accent); line-height: 1.4;">
          Neelagiri / Puducherry, Tamil Nadu, India (UTC+5:30) · 100% Remote Global Setup
        </p>
        <div style="margin-bottom: 16px;">
          <button type="button" id="copyDirectEmailBtn" class="onboard-btn" style="padding: 8px 14px; font-size: 11px; cursor: pointer; border: 1px solid var(--cds-border); background: var(--cds-layer-01); color: var(--cds-text-primary); border-radius: 4px;">
            📋 Copy Email (1991anirudh@gmail.com)
          </button>
        </div>
        <div class="contact-links">
          ${contactRowsHTML()}
        </div>
      </div>
      <div class="contact-right">
        <label class="contact-field-label">Name</label>
        <input class="contact-input" placeholder="Your name" autocomplete="name">
        <label class="contact-field-label">Email</label>
        <input class="contact-input" placeholder="you@studio.com" type="email" autocomplete="email">
        <label class="contact-field-label">Project</label>
        <textarea class="contact-textarea" placeholder="Tell me about the work…" rows="5"></textarea>
        <button class="contact-submit" type="button" data-mag>Send inquiry →</button>
      </div>
    </div>
  `;

  // One-click copy email button listeners
  const copyFn = () => {
    navigator.clipboard.writeText("1991anirudh@gmail.com").then(() => {
      const b1 = document.getElementById("copyDirectEmailBtn");
      const b2 = document.getElementById("copyDirectEmailRowBtn");
      if (b1) b1.textContent = "✓ Copied 1991anirudh@gmail.com!";
      if (b2) b2.textContent = "✓ Copied";
      setTimeout(() => {
        if (b1) b1.textContent = "📋 Copy Email (1991anirudh@gmail.com)";
        if (b2) b2.textContent = "Copy";
      }, 2800);
    });
  };

  document.getElementById("copyDirectEmailBtn")?.addEventListener("click", copyFn);
  document.getElementById("copyDirectEmailRowBtn")?.addEventListener("click", copyFn);

  // 05 · Magnetic pull on the primary CTA
  initMagneticButtons();
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
    const labelOut = isEdu && outcomes.length ? `${label} · ${outcomes.join(" / ")}` : label;
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

      bindDirectionHover(cell);

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
  terrain?.applyYearWindow?.(state.yearWindow.start, state.yearWindow.end);
  terrain?.updateFilters({
    hasFilter: Boolean(allActiveTags.size || state.search || effectiveRole !== "all" || state.yearWindow.start !== 2009 || state.yearWindow.end !== 2026),
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

  // There is ONE contact surface. The Contact building maps to this entry, and
  // it used to open as an artifact with its own directory-card layout — a
  // second contact page that had the folio PDF but not the panel's UI, while
  // the menu's had the UI but not the PDF. Every route now lands on the same
  // modal. Covers the building, the 2D grid, search results and cluster rows.
  if (isContactEntry(entry)) {
    openNavPage("contact");
    return;
  }

  // selectEntry is the DESKTOP flow: move the 3D camera, then render the entry
  // into the right-hand HUD. On mobile there is no camera, and the HUD restacks
  // to the bottom of the archive page — so every list that called this (the
  // roles/clients matrix, related entries, prev/next, cluster rows, the 2D
  // grid) closed whatever you were looking at, set body.hud-expanded, and drew
  // the entry somewhere off-screen. It read as "the page refreshed and threw me
  // back to the roles list". The artifact is the canonical single-entry view and
  // needs no terrain, so on mobile every one of those paths lands there.
  if (isMobile()) {
    state.selectedEntryId = entry.id;
    state.clusterContext = options.fromCluster || null;
    openEntryArtifact(entry);
    return;
  }

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

  // Expand panel and resize canvas immediately before focusing camera
  document.body.classList.add("hud-expanded");
  window.dispatchEvent(new Event("resize"));

  terrain?.selectEntry(entry, { focus: Boolean(options.zoom || options.scroll) });
  if (options.zoom && state.zoom < 145) setZoom(155);

  // Modal slides in alongside the camera motion (~280ms slide + 250ms ease).
  // The 200ms lead-time lets the camera start its arc before the panel arrives.
  const delay = options.skipDelay ? 0 : 200;
  setTimeout(() => {
    if (state.selectedEntryId === entry.id) showExpandedDetail(entry);
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
      <p class="detail-description">${escapeHtml(entry.description || "No description yet.")}</p>

      <div class="detail-grid">
        ${fact("Role", entry.role)}
        ${fact("Org / Client", entry.org, logoHTML)}
        ${fact("Location", entry.location)}
        ${fact("Productivity", `${emailCount.toLocaleString("en-IN")} sent email${emailCount === 1 ? "" : "s"} this week`)}
        ${entry.earningsAmount ? fact("Money", `${entry.currency || ""} ${Number(entry.earningsAmount).toLocaleString("en-IN")}`) : ""}
      </div>

      <button type="button" id="detailFullViewBtn" class="detail-full-btn">Open full page view →</button>

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
    const fullBtn = els.detailPanel.querySelector("#detailFullViewBtn");
    if (fullBtn) fullBtn.addEventListener("click", () => {
      openProjectPage(entry);
    });
  }
}

// ─── WS3: Expanded Right Detail Panel View ──
// ─── WS3: Expanded Right Detail Panel View ──
function showClusterListInPanel(label, clusterEntries) {
  const rightHud = document.getElementById("rightHud");

  document.body.classList.add("hud-expanded");
  
  window.dispatchEvent(new Event("resize"));

  const cards = clusterEntries.map((e) => {
    const evSrc = evidencePreviewSrc(e);
    const logo = getClientLogoSticker(e.org || e.clientCanonical);
    const src = evSrc || logo;
    const isLogo = !evSrc && !!logo;
    const meta = [e.year, e.role, e.org].filter(Boolean).join(" · ");
    return `
      <button type="button" class="cl-panel-card" data-entry-id="${e.id}" style="display:flex; flex-direction:column; background:var(--cds-layer-01); border:1px solid var(--cds-border); cursor:pointer; text-align:left; padding:0; overflow:hidden; transition:border-color 0.2s, background 0.2s; box-sizing:border-box; width:100%;">
        <span style="aspect-ratio:16/9; width:100%; display:block; overflow:hidden; background:var(--cds-layer-00); border-bottom:1px solid var(--cds-border); position:relative;">
          ${src 
            ? `<img src="${escapeHtml(src)}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">` 
            : `<div style="width:100%; height:100%; display:grid; place-items:center; font-family:'IBM Plex Mono'; font-size:11px; color:var(--cds-text-secondary);">${escapeHtml(e.title || "Project")}</div>`}
        </span>
        <span style="padding:12px; display:flex; flex-direction:column; gap:4px; flex:1;">
          <span style="font-family:'IBM Plex Sans'; font-size:14px; font-weight:500; color:var(--cds-text-primary); line-height:1.2;">${escapeHtml(e.title || "Untitled")}</span>
          <span style="font-family:'IBM Plex Mono'; font-size:11px; color:var(--cds-text-secondary);">${escapeHtml(meta)}</span>
        </span>
      </button>
    `;
  }).join("");

  rightHud.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%; background:var(--cds-bg); box-sizing:border-box; padding:24px; overflow-y:auto; overflow-x:hidden; width:100%;">
      <header style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; border-bottom:1px solid var(--cds-border); padding-bottom:16px;">
        <div>
          <div style="font-family:'IBM Plex Mono'; font-size:11px; text-transform:uppercase; color:var(--cds-text-secondary); letter-spacing:0.04em;">Studio / Client Cluster</div>
          <h2 style="font-family:'IBM Plex Sans'; font-weight:300; font-size:32px; margin:4px 0 0; color:var(--cds-text-primary); line-height:1.1; word-break:break-word; overflow-wrap:break-word; white-space:normal;">${escapeHtml(label)}</h2>
          <span style="font-family:'IBM Plex Mono'; font-size:12px; color:var(--cds-text-secondary); margin-top:4px; display:inline-block;">${clusterEntries.length} projects in this group</span>
        </div>
        <button type="button" id="clPanelCloseBtn" style="width: 32px; height: 32px; display: grid; place-items: center; background: transparent; border: 1px solid var(--cds-border); color: var(--cds-text-primary); cursor: pointer; font-size: 13px;">✕</button>
      </header>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px; margin-bottom:24px; width:100%;">
        ${cards}
      </div>
    </div>
  `;

  const clPanelCloseBtn = document.getElementById("clPanelCloseBtn");
  if (clPanelCloseBtn) clPanelCloseBtn.addEventListener("click", closeExpandedDetail);

  rightHud.querySelectorAll(".cl-panel-card").forEach((card) => {
    card.addEventListener("click", () => {
      const ent = entries.find((e) => e.id === Number(card.dataset.entryId));
      if (ent) selectEntry(ent.id, { zoom: true, scroll: false, fromCluster: state.clusterContext });
    });
  });
}

function showExpandedDetail(entry) {
  const rightHud = document.getElementById("rightHud");

  document.body.classList.add("hud-expanded");
  
  // Trigger Three.js canvas resize
  window.dispatchEvent(new Event("resize"));

  const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ''];
  const bucket = findBucketForTags(allTags);
  const bucketLabel = bucket?.label || 'Other';
  const ref = entry.ref || `REF-${String(entry.id).padStart(4, '0')}`;

  const media = Array.isArray(entry.evidence) ? entry.evidence : [];
  const slots = media.map(m => evidenceToSlot(m, entry)).filter(Boolean);
  
  let thumbsHtml = "";
  if (slots.length > 0) {
    thumbsHtml = slots.map((slot, idx) => {
      if (slot.thumbSrc) {
        return `<button type="button" class="evidence-thumb" data-idx="${idx}" style="width:50px;height:50px;background:url('${slot.thumbSrc}') center/cover;border:1px solid var(--cds-border);cursor:pointer;opacity:${idx === 0 ? '1' : '0.6'};transition:opacity 0.2s;box-sizing:border-box;margin:0;padding:0;"></button>`;
      } else {
        return `<button type="button" class="evidence-thumb" data-idx="${idx}" style="width:50px;height:50px;display:grid;place-items:center;background:var(--cds-layer-01);border:1px solid var(--cds-border);color:var(--cds-text-primary);font-family:'IBM Plex Mono';font-size:10px;font-weight:bold;cursor:pointer;opacity:${idx === 0 ? '1' : '0.6'};transition:opacity 0.2s;box-sizing:border-box;margin:0;padding:0;">${slot.glyph || '↗'}</button>`;
      }
    }).join("");
  }

  const initialHero = slots[0] ? slots[0].hero : `<div style="padding:20px;color:var(--cds-text-secondary);font-size:13px;font-family:'IBM Plex Mono';">No evidence attached</div>`;

  rightHud.innerHTML = `
    <div class="expanded-detail-container" style="display: grid; grid-template-columns: 1.2fr 1fr; height: 100%; min-height: 0; background: var(--cds-bg); width: 100%;">
      
      <!-- Left Side: Hero Preview & Evidences -->
      <div class="detail-preview-panel" style="padding: 24px; display: flex; flex-direction: column; gap: 16px; border-right: 1px solid var(--cds-border); overflow-y: auto; background: var(--cds-layer-01);">
        <!-- Hero Image/Video preview -->
        <div class="detail-hero-viewport" id="expandedHeroViewport" style="aspect-ratio: 16/9; width: 100%; position: relative; border: 1px solid var(--cds-border); display: grid; place-items: center; overflow: hidden; background: var(--cds-layer-00);">
          ${initialHero}
        </div>
        
        <!-- Evidence List / Previews -->
        ${thumbsHtml ? `
        <div class="detail-evidence-list">
          <div style="font-family:'IBM Plex Mono'; font-size:11px; text-transform:uppercase; color:var(--cds-text-secondary); margin-bottom:8px; letter-spacing:0.04em;">Evidence / Artifacts</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;" id="expandedEvidenceGrid">
            ${thumbsHtml}
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Right Side: Details & Ledger -->
      <div class="detail-info-panel" style="padding: 24px; display: flex; flex-direction: column; overflow-y: auto; background: var(--cds-bg); overflow-x: hidden; box-sizing: border-box;">
        <!-- Close & Navigation Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <!-- Prev/Next Navigation buttons -->
          <div style="display: flex; gap: 4px; align-items: center;">
            ${state.clusterContext ? `<button type="button" id="expBackToClusterBtn" style="padding: 6px 12px; font-size: 13px; font-family:'IBM Plex Sans'; background:var(--cds-layer-01); color:var(--cds-text-primary); border:1px solid var(--cds-border); cursor:pointer; margin-right:8px;">← Back to group</button>` : ''}
            <button type="button" id="expPrevBtn" style="padding: 6px 12px; font-size: 13px; font-family:'IBM Plex Sans'; background:var(--cds-layer-01); color:var(--cds-text-primary); border:1px solid var(--cds-border); cursor:pointer;">← Prev</button>
            <button type="button" id="expNextBtn" style="padding: 6px 12px; font-size: 13px; font-family:'IBM Plex Sans'; background:var(--cds-layer-01); color:var(--cds-text-primary); border:1px solid var(--cds-border); cursor:pointer;">Next →</button>
          </div>
          <button type="button" id="expCloseBtn" style="width: 32px; height: 32px; display: grid; place-items: center; background: transparent; border: 1px solid var(--cds-border); color: var(--cds-text-primary); cursor: pointer; font-size: 13px;">✕</button>
        </div>

        <!-- Title and Description -->
        <div style="font-family: 'IBM Plex Mono'; font-size: 12px; color: var(--cds-text-secondary); letter-spacing: 0.32px; margin-bottom: 4px;">${escapeHtml(ref)} / ENTRY DETAIL</div>
        <h2 style="font-family: 'IBM Plex Sans'; font-weight: 300; font-size: 32px; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 16px; color: var(--cds-text-primary); word-break: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(entry.title || "Untitled")}</h2>
        <p style="font-family: 'IBM Plex Serif'; font-size: 15px; line-height: 1.45; color: var(--cds-text-secondary); margin: 0 0 24px; word-break: break-word; overflow-wrap: break-word; white-space: normal;">${escapeHtml(entry.description || "No description yet.")}</p>

        <!-- 6-row metadata ledger (No Era!) -->
        <div style="border-top: 1px solid var(--cds-border); margin-bottom: 24px; width: 100%;">
          ${entry.role ? `<div class="entry-modal-ledger-row" style="display:grid;grid-template-columns:100px 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--cds-border);"><span class="entry-modal-ledger-key" style="font-family:'IBM Plex Mono';font-size:12px;text-transform:uppercase;color:var(--cds-text-secondary);">Role</span><span class="entry-modal-ledger-val" style="font-family:'IBM Plex Sans';font-size:14px;color:var(--cds-text-primary);word-break:break-word;overflow-wrap:break-word;white-space:normal;">${escapeHtml(entry.role)}</span></div>` : ''}
          ${entry.org ? `<div class="entry-modal-ledger-row" style="display:grid;grid-template-columns:100px 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--cds-border);"><span class="entry-modal-ledger-key" style="font-family:'IBM Plex Mono';font-size:12px;text-transform:uppercase;color:var(--cds-text-secondary);">Client</span><span class="entry-modal-ledger-val" style="font-family:'IBM Plex Sans';font-size:14px;color:var(--cds-text-primary);word-break:break-word;overflow-wrap:break-word;white-space:normal;">${escapeHtml(entry.org)}</span></div>` : ''}
          ${entry.location ? `<div class="entry-modal-ledger-row" style="display:grid;grid-template-columns:100px 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--cds-border);"><span class="entry-modal-ledger-key" style="font-family:'IBM Plex Mono';font-size:12px;text-transform:uppercase;color:var(--cds-text-secondary);">Location</span><span class="entry-modal-ledger-val" style="font-family:'IBM Plex Sans';font-size:14px;color:var(--cds-text-primary);word-break:break-word;overflow-wrap:break-word;white-space:normal;">${escapeHtml(entry.location)}</span></div>` : ''}
          ${entry.year ? `<div class="entry-modal-ledger-row" style="display:grid;grid-template-columns:100px 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--cds-border);"><span class="entry-modal-ledger-key" style="font-family:'IBM Plex Mono';font-size:12px;text-transform:uppercase;color:var(--cds-text-secondary);">Year</span><span class="entry-modal-ledger-val" style="font-family:'IBM Plex Sans';font-size:14px;color:var(--cds-text-primary);word-break:break-word;overflow-wrap:break-word;white-space:normal;">${escapeHtml(String(entry.year))}</span></div>` : ''}
          ${entry.tags?.length ? `<div class="entry-modal-ledger-row" style="display:grid;grid-template-columns:100px 1fr;gap:16px;padding:12px 0;border-bottom:1px solid var(--cds-border);"><span class="entry-modal-ledger-key" style="font-family:'IBM Plex Mono';font-size:12px;text-transform:uppercase;color:var(--cds-text-secondary);">Tags</span><span class="entry-modal-ledger-val" style="font-family:'IBM Plex Sans';font-size:14px;color:var(--cds-text-primary);word-break:break-word;overflow-wrap:break-word;white-space:normal;">${entry.tags.slice(0,5).map(t => escapeHtml(t)).join(', ')}</span></div>` : ''}
        </div>

        <!-- Actions -->
        <div style="display: flex; gap: 8px; margin-top: auto;">
          <button id="expFullScreenBtn" class="sheen-glint-btn" data-mag style="position:relative;overflow:hidden;flex: 1; padding: 12px; font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; background:var(--cds-accent); color:#fff; border:none; cursor:pointer; text-align:center;will-change:transform;">
            <span class="sheen-glint"></span>
            <span style="position:relative;">Open case study →</span>
          </button>
        </div>
      </div>

    </div>
  `;

  // Attach event listeners
  const expPrevBtn = document.getElementById("expPrevBtn");
  const expNextBtn = document.getElementById("expNextBtn");
  if (expPrevBtn) expPrevBtn.addEventListener("click", () => stepEntry(-1));
  if (expNextBtn) expNextBtn.addEventListener("click", () => stepEntry(1));
  
  const expCloseBtn = document.getElementById("expCloseBtn");
  if (expCloseBtn) expCloseBtn.addEventListener("click", closeExpandedDetail);

  const expBackToClusterBtn = document.getElementById("expBackToClusterBtn");
  if (expBackToClusterBtn && state.clusterContext) {
    expBackToClusterBtn.addEventListener("click", () => {
      const clusterEntries = state.clusterContext.entryIds
        .map((id) => entries.find((e) => e.id === id))
        .filter(Boolean);
      showClusterListInPanel(state.clusterContext.label, clusterEntries);
    });
  }

  const expFullScreenBtn = document.getElementById("expFullScreenBtn");
  if (expFullScreenBtn) {
    expFullScreenBtn.addEventListener("click", () => {
      openProjectPage(entry);
    });
  }

  // Wire thumbs click behavior
  const thumbs = document.querySelectorAll(".evidence-thumb");
  thumbs.forEach(btn => {
    btn.addEventListener("click", () => {
      thumbs.forEach(b => b.style.opacity = "0.6");
      btn.style.opacity = "1";
      const idx = Number(btn.dataset.idx);
      const viewport = document.getElementById("expandedHeroViewport");
      if (viewport && slots[idx]) {
        viewport.innerHTML = slots[idx].hero;
        window.instgrm?.Embeds?.process();
        window.twttr?.widgets?.load();
      }
    });
  });

  // Re-run sheen sweep and magnetic effects
  initSheenSweep();
  initMagneticButtons();
}

function closeExpandedDetail() {
  document.body.classList.remove("hud-expanded");
  
  state.selectedEntryId = null;
  state.clusterContext = null;
  document.querySelectorAll(".cell.active").forEach((cell) => cell.classList.remove("active"));
  terrain?.selectEntry(null);
  terrain?.restoreCamera?.();
  terrain?.resetView?.();
  
  renderDefaultRightHud();

  window.dispatchEvent(new Event("resize"));
}

function renderDefaultRightHud() {
  const rightHud = document.getElementById("rightHud");
  if (!rightHud) return;

  const totalEntries = entries.length;
  const activeViewCount = getVisibleEntries().length;
  const disciplinesCount = new Set(entries.map(e => getEntryThemes(e).keys().next().value).filter(Boolean)).size || 3;
  const yearsCount = new Set(entries.map(e => e.year).filter(Boolean)).size || 10;

  rightHud.innerHTML = `
    <div style="padding:24px 20px;border-bottom:1px solid var(--cds-border);">
      <div class="rail-label" style="font-family:'IBM Plex Mono';font-size:11px;letter-spacing:0.32px;text-transform:uppercase;color:var(--cds-text-secondary);margin-bottom:14px;text-align:left;line-height:1.3;white-space:normal;overflow:visible;">ARCHIVE STATS /<br>INDEX HUD</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--cds-border); opacity:0.8;">
        <span style="font-family:'IBM Plex Sans';font-size:13px;color:var(--cds-text-secondary);">Total entries</span>
        <span id="statEntries" style="font-family:'IBM Plex Mono';font-size:20px;font-weight:500;color:var(--cds-text-primary);">${totalEntries}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--cds-border); opacity:0.8;">
        <span style="font-family:'IBM Plex Sans';font-size:13px;color:var(--cds-text-secondary);">In view</span>
        <span id="statInView" style="font-family:'IBM Plex Mono';font-size:20px;font-weight:500;color:var(--cds-text-primary);">${activeViewCount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--cds-border); opacity:0.8;">
        <span style="font-family:'IBM Plex Sans';font-size:13px;color:var(--cds-text-secondary);">Disciplines</span>
        <span id="statDisciplines" style="font-family:'IBM Plex Mono';font-size:20px;font-weight:500;color:var(--cds-text-primary);">${disciplinesCount}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;">
        <span style="font-family:'IBM Plex Sans';font-size:13px;color:var(--cds-text-secondary);">Years active</span>
        <span id="statYears" style="font-family:'IBM Plex Mono';font-size:20px;font-weight:500;color:var(--cds-text-primary);">${yearsCount}</span>
      </div>
    </div>

    <!-- Now Hovering Section -->
    <div style="padding:24px 20px;">
      <div class="rail-label" style="font-family:'IBM Plex Mono';font-size:11px;letter-spacing:0.32px;text-transform:uppercase;color:var(--cds-text-secondary);margin-bottom:14px;text-align:left;line-height:1.3;white-space:normal;overflow:visible;">LIVE PREVIEW /<br>INSPECTING NOW</div>
      <div id="hoverTitle" style="font-family:'IBM Plex Serif';font-size:22px;line-height:1.25;color:var(--cds-text-primary);margin-bottom:10px;min-height:56px;">—</div>
      <div id="hoverMeta" style="font-family:'IBM Plex Mono';font-size:12px;color:var(--cds-text-secondary);line-height:1.7;">Hover an entry to inspect.</div>
    </div>
  `;
  initSheenSweep();
  initMagneticButtons();
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

  // Update Right HUD Now Hovering section
  const elHoverTitle = document.getElementById("hoverTitle");
  const elHoverMeta = document.getElementById("hoverMeta");
  const strongest = weekEntries.length ? getStrongestEntry(weekEntries) : null;
  if (elHoverTitle) {
    elHoverTitle.textContent = strongest ? strongest.title : weekKey;
  }
  if (elHoverMeta) {
    if (strongest) {
      elHoverMeta.innerHTML = `${escapeHtml(strongest.org || strongest.clientCanonical || "Independent")}<br>${escapeHtml(strongest.role || "")}<br>${strongest.year}`;
    } else {
      elHoverMeta.textContent = `No ledger entry attached.`;
    }
  }
}

function moveTooltip(event) {
  els.tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`;
  els.tooltip.style.top = `${Math.min(window.innerHeight - 130, event.clientY + 14)}px`;
}

function hideTooltip() {
  els.tooltip.style.display = "none";

  // Reset Right HUD Hovering section
  const elHoverTitle = document.getElementById("hoverTitle");
  const elHoverMeta = document.getElementById("hoverMeta");
  if (elHoverTitle) elHoverTitle.textContent = "—";
  if (elHoverMeta) elHoverMeta.textContent = "Hover an entry to inspect.";
}

function stepEntry(direction) {
  let list = getVisibleEntries();
  if (state.clusterContext && Array.isArray(state.clusterContext.entryIds) && state.clusterContext.entryIds.length) {
    list = state.clusterContext.entryIds
      .map((id) => entries.find((e) => e.id === id))
      .filter(Boolean);
  }
  if (!list.length) return;
  const currentIndex = Math.max(0, list.findIndex((entry) => entry.id === state.selectedEntryId));
  const nextIndex = (currentIndex + direction + list.length) % list.length;
  selectEntry(list[nextIndex].id, { zoom: true, scroll: true, fromCluster: state.clusterContext });
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

let _terrainReady = false;

async function initTerrain() {
  if (_terrainReady) return;
  _terrainReady = true;
  const canvasEl = document.getElementById("terrainCanvas") || els.terrainCanvas;
  if (!canvasEl) {
    updateLoaderProgress(100);
    document.getElementById("loader")?.classList.add("done");
    return;
  }

  // Safety timeout: hide loader after 8 seconds if it gets stuck (e.g., Draco WASM network issues)
  setTimeout(() => {
    const loaderEl = document.getElementById("loader");
    if (loaderEl && !loaderEl.classList.contains("done")) {
      console.warn("Loader safety timeout triggered - showing fallback");
      loaderEl.classList.add("done");
      document.body.classList.add("terrain-fallback");
      const widget = document.getElementById("navWidget");
      const toggle = document.getElementById("navWidgetToggle");
      if (widget) widget.style.display = "none";
      if (toggle) toggle.style.display = "none";
      const emptyEl = document.getElementById("terrainEmpty");
      if (emptyEl) {
        emptyEl.innerHTML = "<strong>Spatial portfolio unavailable</strong><span>The flat chronology is still ready below.</span>";
      }
    }
  }, 8000);

  try {
    const module = await import("./terrain.js?v=city-src-1");
    const loaderEl = document.getElementById("loader");
    const isLandingBg = new URLSearchParams(window.location.search).has('landing');
    if (isLandingBg) {
      document.body.classList.add("landing-bg-mode");
      if (loaderEl) loaderEl.style.display = "none";
    }
    updateLoaderProgress(20);

    terrain = module.createArchiveTerrain({
      container: canvasEl,
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
    const widget = document.getElementById("navWidget");
    const toggle = document.getElementById("navWidgetToggle");
    if (widget) widget.style.display = "none";
    if (toggle) toggle.style.display = "none";
    if (els.terrainEmpty) {
      els.terrainEmpty.innerHTML = "<strong>Spatial portfolio unavailable</strong><span>The flat chronology is still ready below.</span>";
    }
    const loaderEl = document.getElementById("loader");
    if (loaderEl) {
      loaderEl.classList.add("done");
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
  if (state.yearWindow.start !== 2009 || state.yearWindow.end !== 2026) count++;
  if (count > 0) {
    els.activeFiltersBadge.textContent = `${count} filter${count > 1 ? "s" : ""} active`;
    els.activeFiltersBadge.hidden = false;
    if (els.clearFilters) els.clearFilters.hidden = false;
  } else {
    els.activeFiltersBadge.hidden = true;
    if (els.clearFilters) els.clearFilters.hidden = true;
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

// Canonical role/client keys for an entry. The roles/clients explorer AND the
// nav tab counts both read these, so the rail can never disagree with the
// number on the tab.
//
// roles[] is the normalized, split field written by
// scripts/normalize-roles-clients.mjs. The legacy `role` string is unsplit
// ("Director, Cinematographer"), so preferring it counted compound strings as
// their own roles and inflated the tab count.
function entryRoleKeys(e) {
  if (e && Array.isArray(e.roles) && e.roles.length) {
    return e.roles.map((r) => String(r).trim()).filter(Boolean);
  }
  const r = e && e.role ? String(e.role) : "";
  return r ? r.split(",").map((x) => x.trim()).filter(Boolean) : ["Creative Direction"];
}

// "" means the entry is not a client engagement — excluded by the normalizer,
// or personal/education work with no canonical client.
function entryClientKey(e) {
  if (!e || e.excludeFromClients) return "";
  return (e.clientCanonical && String(e.clientCanonical).trim()) || "";
}

// Display-only org label. Unlike entryClientKey this always resolves, so
// grouping a role's work by organization never silently drops personal or
// education entries that have no canonical client.
function orgLabelOf(e) {
  return entryClientKey(e)
    || (e && e.org && String(e.org).trim())
    || "Independent Studio";
}

function computeUniqueRoleCount(entries) {
  const roles = new Set();
  for (const e of entries) entryRoleKeys(e).forEach((r) => roles.add(r));
  return roles.size;
}

function computeUniqueClientCount(entries) {
  const clients = new Set();
  for (const e of entries) {
    const name = entryClientKey(e);
    if (name) clients.add(name);
  }
  return clients.size;
}

// ─── WS7: Direction-Aware Hover ───────────────────────────────
function getHoverEdge(e, rect) {
  const w = rect.width, h = rect.height;
  const x = (e.clientX - rect.left - w / 2) * (w >= h ? h / w : 1);
  const y = (e.clientY - rect.top - h / 2) * (h >= w ? w / h : 1);
  return (Math.round(Math.atan2(y, x) / (Math.PI / 2)) + 4) % 4;
}

function bindDirectionHover(card) {
  let overlay = card.querySelector('.dir-hover-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'dir-hover-overlay';
    overlay.innerHTML = '<span>View project →</span>';
    card.style.position = 'relative';
    card.style.overflow = 'hidden';
    card.appendChild(overlay);
  }
  const transforms = [
    'translateY(-100%)', // top
    'translateX(100%)',  // right
    'translateY(100%)',  // bottom
    'translateX(-100%)'  // left
  ];
  card.addEventListener('mouseenter', (e) => {
    const edge = getHoverEdge(e, card.getBoundingClientRect());
    overlay.style.transition = 'none';
    overlay.style.transform = transforms[edge];
    requestAnimationFrame(() => {
      overlay.style.transition = 'transform 380ms cubic-bezier(0, 0, 0.3, 1)';
      overlay.style.transform = 'translate(0, 0)';
    });
  });
  card.addEventListener('mouseleave', (e) => {
    const edge = getHoverEdge(e, card.getBoundingClientRect());
    overlay.style.transition = 'transform 380ms cubic-bezier(0.4, 0, 1, 1)';
    overlay.style.transform = transforms[edge];
  });
}

// ─── WS8: Magnetic Buttons ────────────────────────────────────
function initMagneticButtons() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('[data-mag]').forEach(container => {
    if (container.dataset.magBound) return;
    container.dataset.magBound = '1';
    const target = container.querySelector('[data-mag-target]') || container;
    // Cap the pull so full-width CTAs shift tastefully instead of sliding away.
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    container.addEventListener('mousemove', (e) => {
      const r = container.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width / 2;
      const dy = e.clientY - r.top - r.height / 2;
      target.style.transform = `translate(${clamp(dx * 0.15, 10)}px, ${clamp(dy * 0.4, 8)}px)`;
    });
    container.addEventListener('mouseleave', () => {
      target.style.transform = '';
    });
  });
}

// ─── WS9: Sheen Light-Sweep ──────────────────────────────────
function initSheenSweep() {
  document.querySelectorAll('.sheen-glint').forEach(glint => {
    const parent = glint.parentElement;
    if (!parent || parent.dataset.sheenBound) return;
    parent.dataset.sheenBound = '1';
    parent.addEventListener('mouseenter', () => {
      glint.style.transition = 'none';
      glint.style.transform = 'translateX(-130%) skewX(-18deg)';
      requestAnimationFrame(() => {
        glint.style.transition = 'transform 720ms ease';
        glint.style.transform = 'translateX(360%) skewX(-18deg)';
      });
    });
  });
}

// ─── WS10: IO-triggered Count-Up ──────────────────────────────
function initCountUpObserver() {
  const targets = document.querySelectorAll('.stat-value');
  if (!targets.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(ent => {
      if (ent.isIntersecting && !ent.target.dataset.counted) {
        ent.target.dataset.counted = '1';
        const val = parseInt(ent.target.textContent, 10);
        if (!isNaN(val) && val > 0) animateCount(ent.target, val, 1300);
      }
    });
  }, { threshold: 0.4 });
  targets.forEach(t => io.observe(t));
}

// ─── Interactions Lab Rebuilt Micro-interactions ─────────────

// 11 · Sliding-pill navbar indicator
function initSlidingPillNavbar() {
  const container = document.getElementById("topnavLinks");
  if (!container) return;

  let pill = container.querySelector(".nav-pill-indicator");
  if (!pill) {
    pill = document.createElement("div");
    pill.className = "nav-pill-indicator";
    container.appendChild(pill);
  }

  const updatePill = (target) => {
    if (!target) {
      pill.style.opacity = "0";
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    pill.style.left = `${targetRect.left - containerRect.left}px`;
    pill.style.width = `${targetRect.width}px`;
    pill.style.opacity = "1";
  };

  const activeBtn = container.querySelector(".navlink.active") || container.querySelector(".navlink");
  updatePill(activeBtn);

  container.querySelectorAll(".navlink").forEach((btn) => {
    btn.addEventListener("mouseenter", () => updatePill(btn));
  });

  container.addEventListener("mouseleave", () => {
    const currentActive = container.querySelector(".navlink.active");
    updatePill(currentActive);
  });
}

// 20 · Tik-tik color list flash
function initTikTikColorFlash(container) {
  if (!container) return;
  container.addEventListener("pointerenter", () => {
    const rows = container.querySelectorAll(".discipline-btn");
    rows.forEach((r, i) => {
      r.animate(
        [
          { background: "transparent" },
          { background: "var(--cds-layer-hover)", offset: 0.45 },
          { background: "transparent" }
        ],
        { duration: 420, delay: i * 65, easing: "ease-out" }
      );
    });
  });
}

// 24 · Scroll text word reveal
function initScrollTextReveal() {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".cs-content p").forEach((p) => {
    if (p.dataset.revealBound) return;
    p.dataset.revealBound = "1";
    // Skip paragraphs that carry inline markup (links, emphasis) — rewriting
    // textContent into word spans would destroy those children.
    if (p.querySelector("*")) return;
    const text = p.textContent.trim();
    if (!text) return;
    const words = text.split(/\s+/);
    p.innerHTML = words
      .map((w) => `<span class="scroll-reveal-word">${escapeHtml(w)} </span>`)
      .join("");

    const wordEls = p.querySelectorAll(".scroll-reveal-word");
    if (reduceMotion) {
      wordEls.forEach((w) => w.classList.add("revealed"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          if (ent.isIntersecting) {
            wordEls.forEach((w, idx) => {
              setTimeout(() => w.classList.add("revealed"), idx * 25);
            });
            io.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    io.observe(p);
  });
}

// 16 · Dynamic island — availability chip expands on click
function initStatusIsland() {
  const chip = document.getElementById("statusIsland");
  if (!chip || chip.dataset.bound) return;
  chip.dataset.bound = "1";
  chip.addEventListener("click", () => chip.classList.toggle("is-open"));
}

// 07 · Spotlight reveal — cursor-follow vignette over the 3D-city stage
function initSpotlight() {
  const stage = document.getElementById("cityStage");
  if (!stage || stage.dataset.spotBound) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  stage.dataset.spotBound = "1";
  const ov = document.createElement("div");
  ov.className = "spotlight-overlay";
  stage.appendChild(ov);
  stage.addEventListener("pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    ov.style.setProperty("--sx", `${e.clientX - r.left}px`);
    ov.style.setProperty("--sy", `${e.clientY - r.top}px`);
    ov.classList.add("is-active");
  });
  stage.addEventListener("pointerleave", () => ov.classList.remove("is-active"));
}

// 12 · Image cursor trail — spawn framed tiles as the pointer moves the gallery
function initCursorTrail(host) {
  if (!host || host.dataset.trailBound) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  host.dataset.trailBound = "1";
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  let last = { x: -999, y: -999 };
  host.addEventListener("pointermove", (e) => {
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    if (dx * dx + dy * dy < 4200) return;
    last = { x: e.clientX, y: e.clientY };
    const r = host.getBoundingClientRect();
    const hue = 190 + Math.random() * 130;
    const d = document.createElement("div");
    d.className = "cursor-trail-img";
    d.style.left = `${e.clientX - r.left - 44 + host.scrollLeft}px`;
    d.style.top = `${e.clientY - r.top - 58 + host.scrollTop}px`;
    d.style.background = `linear-gradient(135deg, hsl(${hue} 45% 30%), hsl(${hue + 30} 35% 14%))`;
    host.appendChild(d);
    d.animate(
      [
        { opacity: 0, transform: "scale(0.55) rotate(-5deg)" },
        { opacity: 1, transform: "scale(1) rotate(0deg)", offset: 0.35 },
        { opacity: 0, transform: "scale(0.96) translateY(10px)" },
      ],
      { duration: 950, easing: "cubic-bezier(0.2,0,0.3,1)" }
    ).onfinish = () => d.remove();
  });
}

// 13 · Hover roster preview — a floating thumbnail follows the cursor over list rows
function initHoverRoster(host, itemSelector) {
  if (!host || host.dataset.rosterBound) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  host.dataset.rosterBound = "1";
  let follower = document.getElementById("rosterFollower");
  if (!follower) {
    follower = document.createElement("div");
    follower.id = "rosterFollower";
    follower.className = "roster-follower";
    follower.innerHTML = '<span class="roster-follower-cap"></span>';
    document.body.appendChild(follower);
  }
  const cap = follower.querySelector(".roster-follower-cap");
  // Rows carry the resolved artwork in data-thumb (evidence → client logo →
  // role sticker). The preview is the artwork alone on a transparent field —
  // no tinted backdrop, so logos and stickers read as themselves.
  let lastThumb = null;
  host.addEventListener("pointermove", (e) => {
    const row = e.target.closest(itemSelector);
    if (!row) { follower.style.opacity = "0"; lastThumb = null; return; }
    follower.style.opacity = "1";
    follower.style.transform = `translate(${e.clientX + 20}px, ${e.clientY - 74}px)`;
    const thumb = row.dataset.thumb || "";
    if (thumb !== lastThumb) {
      lastThumb = thumb;
      follower.style.backgroundImage = thumb ? `url("${encodeURI(thumb)}")` : "none";
      follower.classList.toggle("is-mark", /icons8\.com|\/stickers\//.test(thumb));
    }
    if (cap) cap.textContent = row.dataset.ref || row.querySelector(".roles-explorer-title, .client-matrix-name")?.textContent?.trim() || "";
  });
  host.addEventListener("pointerleave", () => { follower.style.opacity = "0"; lastThumb = null; });
}

// 19 · Box-grid preloader — inline spinner for data-fetch waits
function boxSpinnerHTML(label) {
  return `<div class="box-spinner-wrap"><div class="box-spinner">${"<span></span>".repeat(9)}</div>${label ? `<span class="box-spinner-label">${escapeHtml(label)}</span>` : ""}</div>`;
}

// 15/21/22/23 · Mobile quick-nav — proximity dock, draw-on-hover icons, sliding tooltip, gooey FAB
function initMobileQuicknav() {
  const wrap = document.getElementById("mobileQuicknav");
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = "1";
  const go = (view) => document.querySelector(`.navlink[data-view="${view}"]`)?.click();

  // Dock items → route + draw-on-hover icon + sliding tooltip
  const dock = document.getElementById("mqDock");
  const tip = document.getElementById("mqTip");
  if (dock) {
    dock.querySelectorAll(".mq-dock-item").forEach((btn) => {
      btn.addEventListener("click", () => go(btn.dataset.view));
      // 21 · draw the icon on press
      btn.addEventListener("pointerenter", () => {
        const p = btn.querySelector("path");
        if (p) p.animate([{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }],
          { duration: 500, easing: "cubic-bezier(0.2,0,0.2,1)", fill: "both" });
        // 22 · slide the shared tooltip to this trigger
        if (tip) {
          tip.textContent = btn.dataset.tip || "";
          tip.style.opacity = "1";
          tip.style.left = `${btn.offsetLeft + btn.offsetWidth / 2 - 32}px`;
        }
      });
    });
    dock.addEventListener("pointerleave", () => { if (tip) tip.style.opacity = "0"; });
    // 15 · proximity magnification
    dock.addEventListener("pointermove", (e) => {
      dock.querySelectorAll(".mq-dock-item").forEach((ch) => {
        const r = ch.getBoundingClientRect();
        const dist = Math.abs(e.clientX - (r.left + r.width / 2));
        const s = Math.max(1, 1.5 - dist / 130);
        ch.style.transform = `scale(${s}) translateY(${-(s - 1) * 12}px)`;
      });
    });
    dock.addEventListener("pointerleave", () => {
      dock.querySelectorAll(".mq-dock-item").forEach((ch) => { ch.style.transform = ""; });
    });
  }

  // (The gooey "+" FAB that used to expand to quick routes is retired — see
  // the note on .mobile-quicknav in index.html. Case studies moved into the
  // dock, which is now the single bottom nav.)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initApp());
} else {
  initApp();
}
