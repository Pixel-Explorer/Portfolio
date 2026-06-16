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
let years = [];
let weeks = [];
let months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
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

async function loadLedgerData() {
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

  entries = (data.entries || [])
    .map((entry) => ({
      ...entry,
      tags: toArray(entry.tags),
      roleTags: toArray(entry.roleTags),
    }))
    .sort((a, b) => dateNumber(a) - dateNumber(b));

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
  galleryCursor: document.getElementById("galleryCursor"),
  galleryFloatingPreview: document.getElementById("galleryFloatingPreview"),
  searchChips: document.getElementById("searchChips"),
  themeToggle: document.getElementById("themeToggle"),
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
  if (saved === "light" || (!saved && window.matchMedia("(prefers-color-scheme: light)").matches)) {
    document.documentElement.setAttribute("data-theme", "light");
    if (els.themeToggle) els.themeToggle.textContent = "●";
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (els.themeToggle) els.themeToggle.textContent = "○";
  }
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  if (isLight) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("archive-theme", "dark");
    if (els.themeToggle) els.themeToggle.textContent = "○";
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("archive-theme", "light");
    if (els.themeToggle) els.themeToggle.textContent = "●";
  }
  // Flip the 3D scene to match (background / floor / fog).
  terrain?.setTheme?.(!isLight);
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

function init() {
  if (_uiReady) return;
  _uiReady = true;
  setText(els.statEntries, entries.length.toLocaleString("en-IN"));
  setText(els.statYears, computeAge("1991-09-23").toString());
  setText(els.statTags, (data.tags || []).length.toLocaleString("en-IN"));

  initTheme();
  renderRolePills();
  renderSearchChips();
  renderWeekHeader();
  renderGrid();
  renderSupportingSections();
  applyFilters();
  bindEvents();
  bindNavLinks();

  // Do NOT auto-select an entry — detail panel stays hidden until user clicks
  initTerrain();
}

function renderRolePills() {
  if (!els.rolePills) return;
  // Reset list — but rebuild "All" as a card now too instead of relying on
  // the static HTML markup which doesn't carry our colour vars.
  els.rolePills.innerHTML = "";

  const cards = [
    { key: "all", label: "All work", icon: "◯", color: "#FFFFFF", ink: "#0A0908" },
    ...SPATIAL_FILTERS.map((r) => ({ key: r.key, label: r.label, icon: r.icon, color: r.color, ink: r.ink })),
  ];

  for (const role of cards) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `rolepill${state.activeRoleKey === role.key ? " active" : ""}`;
    btn.dataset.role = role.key;
    // Per-role CSS vars drive the card's accent + ink colour
    btn.style.setProperty("--pill-color", role.color);
    btn.style.setProperty("--pill-ink", role.ink);
    btn.innerHTML = `
      <span class="rolepill-dot" aria-hidden="true" style="background:${role.color}; color:${role.ink};">${FOLIO_ICONS[role.key] || role.icon}</span>
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
  // Search: live text filter (clears when tag chips are used)
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    applyFilters();
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
      // Update the fill bar position (CSS custom props).
      const min = Number(els.yearWindowStart.min);
      const max = Number(els.yearWindowStart.max);
      const range = max - min || 1;
      if (els.yearRange) {
        els.yearRange.style.setProperty("--start-pct", `${((start - min) / range) * 100}%`);
        els.yearRange.style.setProperty("--end-pct",   `${((end   - min) / range) * 100}%`);
      }
      terrain?.applyYearWindow?.(start, end);
    };
    els.yearWindowStart.addEventListener("input", onYearWindowChange);
    els.yearWindowEnd.addEventListener("input", onYearWindowChange);
    // Initial paint so the fill bar matches the default values.
    onYearWindowChange();
  }

  if (els.clearFilters) {
    els.clearFilters.addEventListener("click", () => {
      state.activeTags.clear();
      state.activeTagInputs.clear();
      state.search = "";
      els.searchInput.value = "";
      renderSearchChips();
      applyFilters();
    });
  }

  if (els.themeToggle) {
    els.themeToggle.addEventListener("click", toggleTheme);
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

  els.prevEntry.addEventListener("click", () => stepEntry(-1));
  els.nextEntry.addEventListener("click", () => stepEntry(1));

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") stepEntry(1);
    if (event.key === "ArrowLeft") stepEntry(-1);
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
    return null;
  }).filter(Boolean);
}

function buildFolderSheet(entry) {
  // Canonical manila sheet — same body the single-entry slide-up view uses.
  return `<div class="ms-body-inner">${renderEntrySheetBody(entry)}</div>`;
}

// Cluster labels that collapse to a single merged folder (see openClusterPage).
const MERGE_CLUSTER_LABELS = new Set(["Pixelate", "KindHealth"]);

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
  const story = (primary.description || "").trim();
  const description = milestones.length > 1
    ? `${story}${story ? "\n\n" : ""}Milestones — ${milestones.join(" · ")}.`
    : story;
  return {
    ...primary,
    title: label,
    role: primary.role || "Co-founder",
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

  // Pixelate + KindHealth collapse to ONE merged folder (combine every member
  // entry's evidence into a single sheet) instead of N cofounder duplicates.
  // Originals stay untouched in data — they still surface in their other
  // buildings (e.g. the NEAR grant / whitepaper in Blockchain & Web3).
  if (MERGE_CLUSTER_LABELS.has(label) && clusterEntries.length > 1) {
    clusterEntries = [mergeClusterEntries(clusterEntries, label)];
  }

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
  els.projectPage.style.setProperty("--fill", masterBucket?.modalBg || "#EDE4CE");
  els.projectPage.style.setProperty("--ink", masterBucket?.ink || "#1A1714");
  els.projectPage.classList.add("folder-sheet");

  const folderHTML = clusterEntries.map((entry, i) => {
    const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
    const eb = findBucketForTags(allTags);
    const fill = eb?.modalBg || eb?.color || "#EDE4CE";
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
    const tabMax = Math.min(260, sheetW - 80);
    const frontBand = 112;
    const step = Math.max(22, Math.min(40, Math.round((vh * 0.5 - frontBand) / Math.max(1, N - 1))));
    const slots = Math.max(2, Math.floor((sheetW - 36) / (tabMax + 28)));
    const slotSpan = (sheetW - tabMax - 36) / Math.max(1, slots - 1);
    drawerInner.style.setProperty("--sheetW", sheetW + "px");
    drawerInner.style.setProperty("--mf-right", mfRight + "px");
    folders.forEach((f, i) => {
      const top = vh - menuH - frontBand - i * step;
      f.style.top = top + "px";
      f.dataset.stackTop = top;
      f.dataset.zBase = N - i;
      if (!f.classList.contains("is-open")) f.style.zIndex = String(N - i);
      f.style.setProperty("--tabX", Math.round(18 + (i % slots) * slotSpan) + "px");
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

// Custom magnetic "VIEW" cursor + floating row preview, both lerped toward
// the mouse in one RAF loop (Indrajaal / Nicola Romei references). The loop
// only runs while a gallery surface is open. Touch devices skip it (the CSS
// hides the elements and we never call start()).
function initGalleryMotion() {
  const cursor = els.galleryCursor;
  const preview = els.galleryFloatingPreview;
  if (!cursor) return { start() {}, stop() {}, hoverItem() {}, hoverRow() {}, leave() {} };

  let mx = innerWidth / 2, my = innerHeight / 2;   // mouse target
  let cx = mx, cy = my, cs = 0.5;                  // cursor lerp (pos + scale)
  let px = mx, py = my, ps = 0.8, po = 0;          // preview lerp (pos, scale, opacity)
  let hot = false, previewOn = false, active = false, raf = null;
  const span = cursor.querySelector("span");

  function loop() {
    cx += (mx - cx) * 0.2; cy += (my - cy) * 0.2;
    cs += ((hot ? 1 : 0.5) - cs) * 0.2;
    cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(${cs})`;
    // Preview trails with more inertia (slower lerp) and sits up-right of cursor.
    px += (mx + 28 - px) * 0.12; py += (my - py) * 0.12;
    ps += ((previewOn ? 1 : 0.8) - ps) * 0.18;
    po += ((previewOn ? 1 : 0) - po) * 0.18;
    preview.style.opacity = po.toFixed(3);
    preview.style.transform = `translate(${px}px, ${py}px) translate(0, -50%) scale(${ps})`;
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (active) cursor.classList.add("is-active");
  });

  return {
    start() {
      if (active) return;
      active = true;
      document.body.classList.add("gallery-cursor-on");
      raf = requestAnimationFrame(loop);
    },
    stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf); raf = null;
      document.body.classList.remove("gallery-cursor-on");
      cursor.classList.remove("is-active", "is-hot");
      hot = false; previewOn = false; po = 0; preview.style.opacity = "0";
    },
    hoverItem(on) {            // grid item / generic clickable
      hot = on;
      cursor.classList.toggle("is-hot", on);
      if (!on) previewOn = false;
    },
    hoverRow(on, src) {        // codex row → also floats the preview image
      hot = on;
      cursor.classList.toggle("is-hot", on);
      if (on && src) {
        if (preview.getAttribute("src") !== src) preview.src = src;
        if (!previewOn) { px = mx + 28; py = my; }   // snap so it doesn't fly in
        previewOn = true;
      } else {
        previewOn = false;
      }
    },
  };
}

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
        galleryData = await resp.json();
      } catch (err) {
        console.error("Failed to load gallery metadata:", err);
        galleryData = [];
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
  const tick = () => {
    if (!dragging) { targetY += vy; vy *= 0.90; if (Math.abs(vy) < 0.05) vy = 0; }
    y += (targetY - y) * 0.16;            // eased catch-up = silky scroll
    if (Math.abs(targetY - y) < 0.1) y = targetY;
    wrap();
    track.style.transform = `translate3d(0, ${y}px, 0)`;
    updateHover();
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
        <span class="artifact-eyebrow">${escapeHtml(item.genre || "Photograph")}${item.dayNight && item.dayNight !== "Unknown" ? " · " + escapeHtml(item.dayNight) : ""}</span>
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
    ".artifact-eyebrow, .artifact-title, .artifact-origin, .artifact-story, .artifact-metadata-row, .artifact-tags, .artifact-extra");

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
  els.galleryArtifact.classList.remove("visible");
  els.galleryArtifact.setAttribute("aria-hidden", "true");
  // If the gallery overlay is gone too, retire the custom cursor.
  if (!els.galleryOverlay?.classList.contains("visible")) galleryMotion?.stop();
}

// ── Full-screen single-entry artifact view (app-wide "expand") ────────
// The canonical full-screen single-page look — same as the gallery photo
// artifact: ambient backdrop + centred hero + metadata rail. ANY ledger
// entry opens into it via the app-wide expand affordance. It renders into
// the shared `.gallery-artifact` overlay (z-index 110), which sits ABOVE
// the project-page (60) and nav-page (55), so closing it simply reveals
// whatever the user expanded from — back-wiring is automatic via stacking.
function buildEntryArtifactHTML(entry) {
  const role = entry.role || (entry.roles && entry.roles[0]) || "Project";
  const metaRow = (l, v) => v
    ? `<div class="artifact-metadata-row"><span class="artifact-meta-label">${escapeHtml(l)}</span><span class="artifact-meta-val">${escapeHtml(String(v))}</span></div>`
    : "";
  const dateStr = entry.date || [entry.month, entry.year].filter(Boolean).join("/") || entry.year || "";
  const tags = [...new Set([...(entry.tags || []), ...(entry.roleTags || [])])].slice(0, 8).join("   ·   ");
  // Hero shows the first previewable media of ANY type (image / video / YouTube),
  // not just images — so video / embed-only entries preview too.
  const heroMedia = folderHeroMedia(entry);
  const heroInner = heroMedia[0]
    || `<div class="fx-plate">${escapeHtml((entry.title || "·").trim().slice(0, 2).toUpperCase())}</div>`;
  const heroHTML = `<figure class="artifact-hero">${heroInner}</figure>`;
  const bgSrc = evidencePreviewSrc(entry);   // ambient backdrop still (any evidence type)
  const imgs = (entry.evidence || []).filter((m) => m.type === "image" && m.src);
  const thumbs = imgs.length > 1
    ? `<div class="artifact-thumbs">${imgs.slice(0, 10).map((m, i) => `<button type="button" class="artifact-thumb ${i === 0 ? "is-active" : ""}" data-thumb="${escapeHtml(m.src)}"><img src="${escapeHtml(m.src)}" alt=""></button>`).join("")}</div>`
    : "";
  return `
    ${bgSrc ? `<div class="artifact-bg" style="background-image:url('${escapeHtml(bgSrc)}')"></div>` : ""}
    <div class="artifact-stage">
      <aside class="artifact-left">
        <span class="artifact-eyebrow">${escapeHtml(role)}</span>
        <h2 class="artifact-title">${escapeHtml(entry.title || "Untitled")}</h2>
        <div class="artifact-origin">
          ${metaRow("When", dateStr)}
          ${metaRow("Org / Client", entry.org || entry.clientCanonical)}
          ${metaRow("Location", entry.location)}
        </div>
      </aside>
      ${heroHTML}
      <aside class="artifact-right">
        <p class="artifact-story">${escapeHtml(entry.description || "")}</p>
        <div class="artifact-metadata-grid">
          ${metaRow("Role", role)}
          ${metaRow("Tags", tags)}
        </div>
        ${thumbs}
      </aside>
    </div>`;
}

function openEntryArtifact(entry) {
  if (!els.galleryArtifact || !els.artifactContainer || !entry) return;
  els.artifactContainer.innerHTML = buildEntryArtifactHTML(entry);
  // Thumbnail clicks swap the centred hero (replacing a video/embed too) + backdrop.
  const fig = els.artifactContainer.querySelector(".artifact-hero");
  const bg = els.artifactContainer.querySelector(".artifact-bg");
  els.artifactContainer.querySelectorAll("[data-thumb]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.dataset.thumb;
      if (!src) return;
      if (fig) fig.innerHTML = `<img src="${escapeHtml(src)}" alt="">`;
      if (bg) bg.style.backgroundImage = `url('${src}')`;
      els.artifactContainer.querySelectorAll(".artifact-thumb").forEach((t) => t.classList.toggle("is-active", t === btn));
    });
  });
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
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  behance: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 12.5c.9-.4 1.4-1.1 1.4-2.2 0-2-1.5-2.7-3.3-2.7H2v9.1h5.7c1.9 0 3.7-.9 3.7-3 0-1.3-.6-2-2-2.2zM4.5 9.5h2.5c.8 0 1.4.3 1.4 1.1 0 .8-.5 1.1-1.3 1.1H4.5V9.5zm2.7 5.7H4.5v-2.4h2.8c.9 0 1.5.4 1.5 1.2 0 .9-.7 1.2-1.6 1.2zM21.9 12.6c0-2-1.2-3.7-3.4-3.7-2.1 0-3.6 1.6-3.6 3.7 0 2.2 1.4 3.6 3.6 3.6 1.7 0 2.9-.8 3.3-2.3h-1.9c-.2.5-.7.7-1.3.7-.9 0-1.4-.5-1.5-1.4h4.8v-.6zm-4.8-.8c.1-.8.6-1.3 1.4-1.3.8 0 1.3.5 1.3 1.3h-2.7zM15.5 8h4.3v1.1h-4.3V8z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-2C18.88 4 12 4 12 4s-6.88 0-8.59.42a2.78 2.78 0 0 0-1.95 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.41 19c1.71.46 8.59.46 8.59.46s6.88 0 8.59-.42a2.78 2.78 0 0 0 1.95-2 29 29 0 0 0 .46-5.29 29 29 0 0 0-.46-5.33z"/><path d="m9.75 15.02 5.75-3.27-5.75-3.27z" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

function isContactEntry(entry) {
  return entry.activityType === "Contact" || /^\s*contact\s*$/i.test(entry.title || "");
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
  for (let u of urlList) {
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
      <span class="ms-filed-eyebrow">Filed without imagery</span>
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
  let domain = "";
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
      let domain = "";
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
let navPageState = { view: null, expanded: new Set() };

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
  for (const e of entries) {
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
  home: `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M6.66667 31.6667V16.6667C6.66667 16.1389 6.785 15.6389 7.02167 15.1667C7.25833 14.6944 7.58444 14.3056 8 14L18 6.5C18.5833 6.05556 19.25 5.83333 20 5.83333C20.75 5.83333 21.4167 6.05556 22 6.5L32 14C32.4167 14.3056 32.7433 14.6944 32.98 15.1667C33.2167 15.6389 33.3344 16.1389 33.3333 16.6667V31.6667C33.3333 32.5833 33.0067 33.3683 32.3533 34.0217C31.7 34.675 30.9156 35.0011 30 35H25C24.5278 35 24.1322 34.84 23.8133 34.52C23.4944 34.2 23.3344 33.8044 23.3333 33.3333V25C23.3333 24.5278 23.1733 24.1322 22.8533 23.8133C22.5333 23.4944 22.1378 23.3344 21.6667 23.3333H18.3333C17.8611 23.3333 17.4656 23.4933 17.1467 23.8133C16.8278 24.1333 16.6678 24.5289 16.6667 25V33.3333C16.6667 33.8056 16.5067 34.2017 16.1867 34.5217C15.8667 34.8417 15.4711 35.0011 15 35H10C9.08333 35 8.29889 34.6739 7.64667 34.0217C6.99444 33.3694 6.66778 32.5844 6.66667 31.6667Z" fill="currentColor"/></svg>`,
  search: `<svg viewBox="0 0 31.1667 30.3042" fill="none" aria-hidden="true"><path d="M12.4583 23.9167C18.7866 23.9167 23.9167 18.7866 23.9167 12.4583C23.9167 6.13007 18.7866 1 12.4583 1C6.13007 1 1 6.13007 1 12.4583C1 18.7866 6.13007 23.9167 12.4583 23.9167Z" stroke="currentColor" stroke-width="2"/><path d="M22.6958 21.8333L30.1667 29.3042" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  MovingImages: `<svg viewBox="0 0 25 25" fill="none" aria-hidden="true"><path d="M3.57129 0.5H21.4287C23.1223 0.5 24.5 1.87768 24.5 3.57129V21.4287C24.5 23.1223 23.1223 24.5 21.4287 24.5H3.57129C1.87768 24.5 0.5 23.1223 0.5 21.4287V3.57129C0.5 1.87768 1.87768 0.5 3.57129 0.5ZM3.57129 17.3574C2.80414 17.3574 2.17871 17.9828 2.17871 18.75V20.5361C2.17871 21.3031 2.80428 21.9287 3.57129 21.9287H5.35742C6.12437 21.9287 6.75 21.3031 6.75 20.5361V18.75C6.75 17.9829 6.12451 17.3574 5.35742 17.3574H3.57129ZM19.6426 17.3574C18.8755 17.3574 18.25 17.9829 18.25 18.75V20.5361C18.25 21.3031 18.8756 21.9287 19.6426 21.9287H21.4287C22.1957 21.9287 22.8213 21.3031 22.8213 20.5361V18.75C22.8213 17.9828 22.1959 17.3574 21.4287 17.3574H19.6426ZM3.57129 10.2139C2.80414 10.2139 2.17871 10.8403 2.17871 11.6074V13.3926C2.17871 14.1597 2.80414 14.7861 3.57129 14.7861H5.35742C6.12451 14.7861 6.75 14.1597 6.75 13.3926V11.6074C6.75 10.8403 6.12451 10.2139 5.35742 10.2139H3.57129ZM19.6426 10.2139C18.8755 10.2139 18.25 10.8403 18.25 11.6074V13.3926C18.25 14.1597 18.8755 14.7861 19.6426 14.7861H21.4287C22.1959 14.7861 22.8213 14.1597 22.8213 13.3926V11.6074C22.8213 10.8403 22.1959 10.2139 21.4287 10.2139H19.6426ZM3.57129 3.07129C2.80428 3.07129 2.17871 3.69689 2.17871 4.46387V6.25C2.17871 7.01717 2.80414 7.64258 3.57129 7.64258H5.35742C6.12451 7.64258 6.75 7.01712 6.75 6.25V4.46387C6.75 3.69694 6.12437 3.07129 5.35742 3.07129H3.57129ZM19.6426 3.07129C18.8756 3.07129 18.25 3.69694 18.25 4.46387V6.25C18.25 7.01712 18.8755 7.64258 19.6426 7.64258H21.4287C22.1959 7.64258 22.8213 7.01717 22.8213 6.25V4.46387C22.8213 3.69689 22.1957 3.07129 21.4287 3.07129H19.6426Z" stroke="currentColor" stroke-linejoin="round"/></svg>`,
  VisualSystems: `<svg viewBox="0 0 25 15" fill="none" aria-hidden="true"><path d="M12.3438 13.8691C19.1297 13.8691 22.5421 9.98126 23.6826 8.45117C23.7875 8.31039 23.8108 8.12431 23.7441 7.96191C23.2582 6.77872 21.9442 4.02924 18.6504 2.48242M12.3438 13.8691C5.71604 13.8691 2.29602 9.98325 1.29785 8.4209C1.21026 8.2837 1.19402 8.11249 1.25586 7.96191C1.74942 6.76025 3.06287 4.19635 6.33105 2.49121M12.3438 13.8691C9.20235 13.8691 6.59395 11.1785 6.59375 7.84766C6.59375 7.09828 6.7361 6.49807 6.89258 5.84473" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"/><circle cx="12.4" cy="6.5" r="3.2" stroke="currentColor"/></svg>`,
  CompCulture: `<svg viewBox="0 0 25 25" fill="none" aria-hidden="true"><rect x="8.1" y="7.3" width="8.8" height="8.8" stroke="currentColor"/><path d="M10.97 0v6.3M14.01 3.3v3M11.13 7.3v-1.2M4.99 5.07h2.16M0 5.58h3.68M17.93 8.16h-2.5M7.15 8.16h-2.5M1.72 11.25v3.5M5.57 15.35v3.5M11.48 17.2v4.3M20.89 15.35v5.3M23.45 6.6v1.6M23.45 11.5v1.5" stroke="currentColor" stroke-linecap="round"/><circle cx="4.99" cy="1.6" r="1.4" stroke="currentColor"/><circle cx="15.67" cy="1.6" r="1.4" stroke="currentColor"/><circle cx="23.45" cy="5.13" r="1.4" stroke="currentColor"/><circle cx="1.72" cy="16.76" r="1.4" stroke="currentColor"/><circle cx="5.57" cy="20.53" r="1.4" stroke="currentColor"/><circle cx="11.48" cy="23.44" r="1.4" stroke="currentColor"/><circle cx="20.89" cy="22.12" r="1.4" stroke="currentColor"/><circle cx="23.45" cy="13.05" r="1.4" stroke="currentColor"/></svg>`,
  DocResearch: `<svg viewBox="0 0 18 25" fill="none" aria-hidden="true"><path d="M2.7002 0.5H8.5V6.25C8.5 7.09426 8.83798 7.90325 9.43848 8.49902C10.0389 9.09468 10.8528 9.42871 11.7002 9.42871H17.5V22.3213C17.5 22.8977 17.2694 23.4515 16.8574 23.8604C16.4451 24.2694 15.8846 24.5 15.2998 24.5H2.7002C2.11544 24.5 1.55486 24.2694 1.14258 23.8604C0.7306 23.4515 0.5 22.8977 0.5 22.3213V2.67871C0.5 2.10233 0.7306 1.5485 1.14258 1.13965C1.55486 0.730641 2.11544 0.5 2.7002 0.5ZM16.3359 6.64258H11.7002C11.5929 6.64258 11.4907 6.60041 11.416 6.52637C11.3414 6.45238 11.2998 6.3529 11.2998 6.25V1.64648L16.3359 6.64258Z" stroke="currentColor" stroke-linejoin="round"/><path d="M5.9 13.5h6.2M5.9 17h6.2M5.9 20.4h3.4" stroke="currentColor" stroke-linecap="round"/></svg>`,
  LeadershipEdu: `<svg viewBox="0 0 25 25" fill="none" aria-hidden="true"><circle cx="3.76" cy="10.27" r="2.16" stroke="currentColor"/><circle cx="20.78" cy="10.27" r="2.16" stroke="currentColor"/><circle cx="12.2" cy="6.2" r="2.4" stroke="currentColor"/><path d="M0.5 24.5v-7.8c0-1.5 1.2-2.7 2.7-2.7h2.6M24.5 24.5v-7.8c0-1.5-1.2-2.7-2.7-2.7h-2.6M7 24.5v-7c0-2 1.6-3.6 3.6-3.6h3.6c2 0 3.6 1.6 3.6 3.6v7" stroke="currentColor" stroke-linejoin="round"/></svg>`,
  Life: `<svg viewBox="0 0 25 22" fill="none" aria-hidden="true"><path d="M16.1328 0.790039C17.4246 0.390609 18.8109 0.403546 20.0947 0.827148C21.3787 1.25085 22.4949 2.06394 23.2852 3.14941C24.0753 4.23479 24.5 5.53825 24.5 6.875C24.5 11.3391 22.236 14.8316 19.5586 17.3086C16.9348 19.7359 13.9693 21.1322 12.5 21.4844C11.0307 21.1322 8.06524 19.7359 5.44141 17.3086C2.76398 14.8316 0.5 11.3391 0.5 6.875C0.5 5.53825 0.924763 4.23479 1.71484 3.14941C2.50511 2.06394 3.62132 1.25085 4.90527 0.827148C6.18912 0.403546 7.57542 0.390609 8.86719 0.790039C10.159 1.18955 11.2906 1.98131 12.1016 3.05176C12.1961 3.17653 12.3435 3.25 12.5 3.25C12.6565 3.25 12.8039 3.17653 12.8984 3.05176C13.7094 1.98131 14.841 1.18955 16.1328 0.790039Z" stroke="currentColor" stroke-linejoin="round"/></svg>`,
};
function folioFolderSVG(color) {
  return `<svg class="fx-folder-svg" viewBox="0 0 302 242" fill="none" aria-hidden="true"><path d="M30.2 242C21.895 242 14.7879 239.041 8.8788 233.122C2.96967 227.203 0.0100667 220.079 0 211.75V30.25C0 21.9312 2.9596 14.8124 8.8788 8.8935C14.798 2.97458 21.9051 0.0100833 30.2 0H120.8L151 30.25H271.8C280.105 30.25 287.217 33.2145 293.136 39.1435C299.055 45.0725 302.01 52.1913 302 60.5V211.75C302 220.069 299.045 227.193 293.136 233.122C287.227 239.051 280.115 242.01 271.8 242H30.2Z" fill="${color}"/></svg>`;
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

  const foldersHTML = groups.map((g, i) => {
    const [label, list] = g;
    const color = folderColor(g, i);
    return `<button type="button" class="fx-folder" data-fx-folder="${i}" style="--fc:${color}">
      <span class="fx-folder-art">${folioFolderSVG(color)}<span class="fx-folder-glyph">${folderIcon(g)}</span></span>
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

  els.navPageInner.innerHTML = `
    <div class="fx" data-view="${view}">
      <div class="fx-tabrow">
        <button type="button" class="fx-ftab fx-ftab--home" data-fx-home title="Home">${FOLIO_ICONS.home}</button>
        <button type="button" class="fx-ftab fx-ftab--roles ${view === "roles" ? "is-active" : ""}" data-fx-tab="roles">roles</button>
        <button type="button" class="fx-ftab fx-ftab--clients ${view === "clients" ? "is-active" : ""}" data-fx-tab="clients">clients</button>
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
          <aside class="fx-sidebar" data-fx-sidebar>${sidebarGrid}</aside>
          <main class="fx-main">
            <div class="fx-grid" data-fx-grid>
              <span class="fx-selrect" data-fx-selrect></span>
              ${foldersHTML}
            </div>
            <div class="fx-codex" data-fx-codex aria-hidden="true">
              <img class="fx-codex-stage" data-fx-codex-stage alt="">
              <div class="fx-codex-track" data-fx-codex-track></div>
            </div>
            <section class="fx-single" data-fx-single aria-hidden="true"></section>
            <button type="button" class="fx-back" data-fx-back hidden><span aria-hidden="true">←</span> back</button>
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
  const single = root.querySelector("[data-fx-single]");
  const back = root.querySelector("[data-fx-back]");
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
    selrect.style.opacity = "1";
    selrect.style.width = el.offsetWidth + pad * 2 + "px";
    selrect.style.height = el.offsetHeight + pad * 2 + "px";
    selrect.style.transform = `translate(${el.offsetLeft - pad}px, ${el.offsetTop - pad}px)`;
    sidebar.querySelectorAll(".fx-srow").forEach((r, i) => r.classList.toggle("is-peek", i === idx));
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
    back.hidden = false;
    setActiveEntry(entry.id);
    setCrumb("single", groups[activeBucket]?.[0], entry.title || "Untitled");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    single.scrollTop = 0;
    single.innerHTML = `<button type="button" class="fx-expand" data-expand-id="${entry.id}" aria-label="Expand to full screen" title="Expand to full screen">⤢ <span>Full screen</span></button>` + buildEntryArtifact(entry);
    if (typeof init3DPlane === "function") singleFx = init3DPlane(single);
  }

  function openBucket(idx) {
    const g = groups[idx];
    if (!g) return;
    activeBucket = idx;
    mode = "codex";
    const [label, list] = g;
    root.classList.add("is-codex");
    root.classList.remove("is-single");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    back.hidden = false;
    setCrumb("codex", label);
    headingIcon.innerHTML = folderIcon(g);
    headingIcon.style.color = folderColor(g, idx);
    const distinctRoles = new Set();
    list.forEach((e) => (e.roles || (e.role ? [e.role] : [])).forEach((r) => distinctRoles.add(r)));
    metaProjects.textContent = list.length;
    metaGroups.textContent = distinctRoles.size;
    sidebar.innerHTML = list.map((e) => `<button type="button" class="fx-srow fx-srow--entry" data-fx-entry="${e.id}">
      <span class="fx-srow-label">${escapeHtml(e.title || "Untitled")}</span>
      <span class="fx-srow-meta">${escapeHtml([e.year, e.role].filter(Boolean).join(" · "))}</span>
    </button>`).join("");
    buildCodex(list);
  }

  function goGrid() {
    root.classList.remove("is-single", "is-codex");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    activeBucket = -1;
    mode = "grid";
    back.hidden = true;
    headingIcon.innerHTML = "";
    setCrumb("grid");
    metaProjects.textContent = totalEntries;
    metaGroups.textContent = totalGroups;
    sidebar.innerHTML = sidebarGrid;
    requestAnimationFrame(() => moveSelTo(selFolderIdx));
  }

  function goCodex() {
    root.classList.remove("is-single");
    if (singleFx) { try { singleFx(); } catch (_) {} singleFx = null; }
    mode = "codex";
    const g = groups[activeBucket];
    if (g) setCrumb("codex", g[0]);
  }

  function backOne() {
    if (mode === "single") { goCodex(); return; }
    if (mode === "codex") { goGrid(); return; }
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
    const backBtn = e.target.closest("[data-fx-back]");
    if (backBtn) { backOne(); return; }
    const crumb = e.target.closest("[data-crumb]");
    if (crumb) { crumb.dataset.crumb === "grid" ? goGrid() : goCodex(); return; }
    const thumb = e.target.closest("[data-thumb]");
    if (thumb) {
      const src = thumb.dataset.thumb;
      const img = single.querySelector(".artifact-hero img");
      const bg = single.querySelector(".artifact-bg");
      if (img) img.src = src;
      if (bg) bg.style.backgroundImage = `url('${src}')`;
      single.querySelectorAll(".artifact-thumb").forEach((t) => t.classList.toggle("is-active", t === thumb));
      return;
    }
    const folder = e.target.closest("[data-fx-folder]");
    if (folder) { selFolderIdx = Number(folder.dataset.fxFolder); openBucket(selFolderIdx); return; }
    const srowBucket = e.target.closest("[data-fx-srow]");
    if (srowBucket) { selFolderIdx = Number(srowBucket.dataset.fxSrow); openBucket(selFolderIdx); return; }
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

  let title = "";
  let eyebrow = "";
  let groups = [];      // [[groupLabel, entries[], bucketObj?], ...]
  let groupedByBucket = false;

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

  const totalEntries = entries.length;
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

      const tick = () => {
        if (!dragging) { targetY += vy; vy *= 0.90; if (Math.abs(vy) < 0.05) vy = 0; }
        y += (targetY - y) * 0.16;
        if (Math.abs(targetY - y) < 0.1) y = targetY;
        wrap();
        track.style.transform = `translate3d(0, ${y}px, 0)`;
        updateHover();
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
  for (const e of entries) {
    if (e.excludeFromClients) continue;
    const name = (e.clientCanonical && String(e.clientCanonical).trim()) || "";
    if (!name) continue;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(e);
  }
  return [...grouped.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([label, list]) => {
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
        <p class="detail-eyebrow">${escapeHtml(monthKey)}</p>
        <h2>Open month</h2>
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
      if (window.gsap) gsap.fromTo(els.watermarkText, { scale: 0.8, filter: "blur(20px)" }, { scale: 1, filter: "blur(12px)", duration: 1.2, ease: "power3.out" });
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
  // No auto-selection — detail panel only opens when user clicks a prism
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
      <p class="detail-eyebrow">${escapeHtml(weekKey)}</p>
      <h2>Open week</h2>
      <p class="detail-description">No curated ledger entry is attached to this week yet. The email layer shows ${emailCount.toLocaleString("en-IN")} substantive sent email${emailCount === 1 ? "" : "s"} here.</p>
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
    els.detailPanel.innerHTML = `
    <button class="detail-back" id="detailBackInner" type="button">
      <span aria-hidden="true">←</span> Back to portfolio
    </button>
    <button class="detail-close" id="detailCloseInner" type="button" aria-label="Close detail">×</button>

    <div class="detail-hero" style="background: linear-gradient(135deg, ${bucketColor}28, transparent 70%);">
      <div class="detail-hero-tag">
        <span class="hero-dot" style="background:${bucketColor}; box-shadow: 0 0 12px ${bucketColor};"></span>
        ${escapeHtml(bucketLabel)}
      </div>
      <p class="detail-eyebrow">${escapeHtml(formatDate(entry))} · ${escapeHtml(entry.weekKey)}</p>
      <h2>${escapeHtml(entry.title || "Untitled project")}</h2>
      ${tags ? `<div class="detail-meta">${tags}</div>` : ""}
    </div>

    <div class="detail-content">
      <p class="detail-description">${escapeHtml(entry.description || entry.notes || "No description yet.")}</p>

      <div class="detail-grid">
        ${fact("Role", entry.role)}
        ${fact("Org / Client", entry.org)}
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
    <span>${escapeHtml(title || "No curated entry yet")}</span>
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
    const module = await import("./terrain.js?v=brutal-folder-d2");
    const loaderFill = document.getElementById("loaderFill");
    const loaderStatus = document.getElementById("loaderStatus");
    const loaderEl = document.getElementById("loader");
    if (loaderStatus) loaderStatus.textContent = "Building cluster...";
    if (loaderFill) loaderFill.style.width = "20%";

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
        if (loaderFill) loaderFill.style.width = `${20 + pct * 0.8}%`;
        if (loaderStatus) loaderStatus.textContent = phase;
      },
      onLoadComplete() {
        if (loaderFill) loaderFill.style.width = "100%";
        if (loaderStatus) loaderStatus.textContent = "Ready";
        setTimeout(() => loaderEl?.classList.add("done"), 400);
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

function matchesEntry(entry) {
  if (!entryMatchesActiveRole(entry)) return false;
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

function fact(label, value) {
  if (!value) return "";
  return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
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
