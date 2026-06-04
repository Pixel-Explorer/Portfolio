window.ARCHIVE_APP_DEBUG = window.ARCHIVE_APP_DEBUG || {};
window.ARCHIVE_APP_DEBUG.version = "time-machine-r02";
window.ARCHIVE_APP_DEBUG.loadedAt = new Date().toISOString();
console.log("Archive app module loaded", window.ARCHIVE_APP_DEBUG);

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
  console.log("Editor mode active — appending data-editor=on to modal renders");
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

  years = range(data.yearStart || 2009, data.yearEnd || new Date().getFullYear());
  weeks = range(1, 53);
  weekCells = new Map();
  monthCells = new Map();
  entriesByWeek = groupBy(entries, (entry) => entry.weekKey);
  entriesByMonth = groupBy(entries, (entry) => `${entry.year}-${String(entry.month || 1).padStart(2, "0")}`);
  maxEmailCount = Math.max(1, ...Object.values(data.weeklyEmailCounts || {}));

  console.log("Archive initialized:", {
    entryCount: entries.length,
    yearRange: [years[0], years[years.length - 1]],
    weekKeys: entriesByWeek.size,
    source: data.sourceWorkbook || "static fallback",
  });

  init();
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
};

const ROLE_PILLS = [
  { key: "MovingImages",   label: "Moving Images",            icon: "▶", color: "#F23B21", modalBg: "#F23B21", ink: "#FFFFFF", match: ["Photographer", "Photography", "Film", "Cinematographer", "Director", "DOP", "Producer", "Animation", "MusicVideo", "Documentary", "Wedding Photographer", "Unit Still", "BTS", "Filmmaker", "Editor"] },
  { key: "VisualSystems",  label: "Visual Systems",           icon: "◆", color: "#E1FA3C", modalBg: "#E1FA3C", ink: "#1A1714", match: ["Designer", "Design", "Graphic", "Art Director", "Visual", "Animator", "Branding", "Studio"] },
  { key: "CompCulture",    label: "Computational Culture",    icon: "⬢", color: "#4A514A", modalBg: "#4A514A", ink: "#FFFFFF", match: ["Tech", "Web3", "Blockchain", "AI", "Engineer", "IT", "Pixel Explorer", "Maker"] },
  { key: "DocResearch",    label: "Documentation & Research", icon: "❡", color: "#C8923B", modalBg: "#C8923B", ink: "#FFFFFF", match: ["Research", "Blogger", "Consultant", "Strategy", "Observer", "Documentation"] },
  { key: "LeadershipEdu",  label: "Leadership & Education",   icon: "★", color: "#5B8C3E", modalBg: "#5B8C3E", ink: "#FFFFFF", match: ["Lecturer", "Faculty", "Teacher", "AIESEC", "LCC", "VP", "Team Lead", "Founder", "Co-founder", "Leadership", "Education", "Student", "Graduate", "Member", "Mentor"] },
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

function init() {
  setText(els.statEntries, entries.length.toLocaleString("en-IN"));
  setText(els.statYears, computeAge("1991-09-23").toString());
  setText(els.statTags, (data.tags || []).length.toLocaleString("en-IN"));

  renderRolePills();
  renderTags();
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
    ...ROLE_PILLS.map((r) => ({ key: r.key, label: r.label, icon: r.icon, color: r.color, ink: r.ink })),
    { key: "Other", label: "Other", icon: "○", color: "#c8c0e0", ink: "#1A1714" },
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
      <span class="rolepill-dot" aria-hidden="true" style="background:${role.color}; color:${role.ink};">${role.icon}</span>
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
  const role = ROLE_PILLS.find((r) => r.key === effectiveKey);
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
        setActiveRole("all");
        renderTags();
        applyFilters();
      } else {
        openNavPage(view);
      }
    });
  });
}

function bindEvents() {
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

  els.clearFilters.addEventListener("click", () => {
    state.activeTags.clear();
    state.search = "";
    els.searchInput.value = "";
    renderTags();
    applyFilters();
  });

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
        openClusterPage(state.clusterContext);
      } else {
        closeProjectPage();
        terrain?.selectEntry(null, { focus: false });
      }
    });
  }
  if (els.projectBack) {
    els.projectBack.addEventListener("click", () => {
      closeProjectPage();
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
  if (els.artifactBack) {
    els.artifactBack.addEventListener("click", closeArtifactView);
  }
  if (els.artifactClose) {
    els.artifactClose.addEventListener("click", () => {
      closeArtifactView();
      closeGalleryOverlay();
    });
  }

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
    renderEditView(entry);
    return;
  }

  // Gather "same month" siblings (matches the LOD: each building is a month).
  const monthKey = `${entry.year}-${String(entry.month || 1).padStart(2, "0")}`;
  const monthEntries = entries.filter((item) => {
    const mk = `${item.year}-${String(item.month || 1).padStart(2, "0")}`;
    return mk === monthKey;
  });
  const emailCount = Number((data.weeklyEmailCounts || {})[entry.weekKey] || 0);

  const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
  const bucket = findBucketForTags(allTags);
  const bucketColor = bucket?.color || "#c8c0e0";
  const bucketLabel = bucket?.label || "Other";

  const tagsHTML = (entry.tags || []).slice(0, 10)
    .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("");

  const sameBucket = entries.filter((e) => {
    const b = findBucketForTags([...(e.tags || []), ...(e.roleTags || []), e.role || ""]);
    return b?.key === bucket?.key;
  });
  const bIdx = sameBucket.findIndex((e) => e.id === entry.id);
  const prev = bIdx > 0 ? sameBucket[bIdx - 1] : null;
  const next = bIdx < sameBucket.length - 1 ? sameBucket[bIdx + 1] : null;

  const relatedHTML = monthEntries
    .filter((item) => item.id !== entry.id)
    .slice(0, 8)
    .map((item) => `
      <button type="button" data-related-id="${item.id}">
        <strong>${escapeHtml(item.title || "Untitled")}</strong>
        <small>${escapeHtml(item.role || "")}${item.org ? " · " + escapeHtml(item.org) : ""}</small>
      </button>
    `).join("");

  const ledgerRow = (label, value) => value
    ? `<div class="ledger-row">
         <span class="ledger-label">${escapeHtml(label)}</span>
         <span class="ledger-value">${escapeHtml(value)}</span>
       </div>`
    : "";

  els.projectPageInner.style.setProperty("--accent-bucket", bucketColor);
  els.projectPageInner.style.setProperty("--modal-bg", bucket?.modalBg || "var(--paper)");
  els.projectPageInner.style.setProperty("--modal-ink", bucket?.ink || "var(--ink)");
  els.projectPageInner.innerHTML = `
    <aside class="project-ledger">
      ${ledgerRow("Date", formatDate(entry))}
      ${ledgerRow("Role", entry.role)}
      ${ledgerRow("Org / Client", entry.org)}
      ${ledgerRow("Location", entry.location)}
      ${ledgerRow("Evidence", [entry.evidenceSource, entry.evidenceDetail].filter(Boolean).join(" · "))}
    </aside>

    <main class="project-mainboard">
      <div class="mainboard-topbar">
        <span class="display-eyebrow">${escapeHtml(bucketLabel)} · ${escapeHtml(formatDate(entry))}</span>
        ${state.editMode ? `<button type="button" class="modal-action-btn" data-action="edit">EDIT</button>` : ""}
      </div>
      <h1 class="display-title">${escapeHtml(entry.title || "Untitled project")}</h1>
      ${tagsHTML ? `<div class="display-tagstrip">${tagsHTML}</div>` : ""}

      ${entry.description || entry.notes ? `
        <section class="section-block">
          <h3 class="section-head">Notes</h3>
          <p class="body-copy">${escapeHtml(entry.description || entry.notes)}</p>
          ${entry.notes && entry.notes !== entry.description
            ? `<p class="body-copy">${escapeHtml(entry.notes)}</p>` : ""}
        </section>
      ` : ""}

      ${renderEvidenceReadOnly(entry)}

      ${relatedHTML ? `
        <section class="section-block">
          <h3 class="section-head">Same month</h3>
          <div class="related-grid">${relatedHTML}</div>
        </section>
      ` : ""}

      <section class="section-block" style="border-top:1px solid rgba(26,23,20,0.18);padding-top:24px">
        <h3 class="section-head">Navigation</h3>
        <div class="prev-next">
          ${prev
            ? `<button type="button" data-nav-id="${prev.id}">
                 <span class="nav-label">← Previous</span>
                 <span class="nav-title">${escapeHtml(prev.title || "Untitled")}</span>
               </button>`
            : `<div></div>`}
          ${next
            ? `<button type="button" data-nav-id="${next.id}">
                 <span class="nav-label">Next →</span>
                 <span class="nav-title">${escapeHtml(next.title || "Untitled")}</span>
               </button>`
            : `<div></div>`}
        </div>
      </section>
    </main>
  `;

  // Evidence images: clickable — open in a lightbox overlay
  els.projectPageInner.querySelectorAll(".ev-figure--clickable").forEach((fig) => {
    fig.addEventListener("click", () => {
      const src = fig.dataset.evSrc;
      if (!src) return;
      openLightbox(src, fig.querySelector("figcaption")?.textContent || "");
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
      state.editingEntryId = entry.id;
      renderEditView(entry);
    });
  });

  state.modalView = "entry";
  refreshProjectBack();
  els.projectPage.classList.add("visible");
  els.projectPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("project-open");
}

function openClusterPage(clusterInfo) {
  if (!els.projectPage || !els.projectPageInner) return;
  const { label, entryIds, buildingName } = clusterInfo;

  if (label === "Travel & Gallery") {
    openGalleryOverlay();
    return;
  }

  const clusterEntries = entryIds
    .map(id => entries.find(e => e.id === id))
    .filter(Boolean)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0));

  const allTags = clusterEntries.flatMap(e => [...(e.tags || []), ...(e.roleTags || []), e.role || ""]);
  const bucket = findBucketForTags(allTags);
  const bucketColor = bucket?.color || "#c8c0e0";

  const entryRows = clusterEntries.map(entry => {
    const eTags = (entry.tags || []).slice(0, 3).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("");
    const dateStr = `${entry.year || ""}${entry.month ? "-" + String(entry.month).padStart(2, "0") : ""}`;
    return `
      <button type="button" class="cluster-entry-row" data-cluster-entry-id="${entry.id}">
        <div class="cluster-entry-main">
          <strong>${escapeHtml(entry.title || "Untitled")}</strong>
          <small>${escapeHtml(entry.role || "")}${entry.org ? " · " + escapeHtml(entry.org) : ""}</small>
        </div>
        <div class="cluster-entry-meta">
          <span class="cluster-entry-date">${escapeHtml(dateStr)}</span>
          ${eTags}
        </div>
      </button>`;
  }).join("");

  els.projectPageInner.style.setProperty("--accent-bucket", bucketColor);
  els.projectPageInner.style.setProperty("--modal-bg", bucket?.modalBg || "var(--paper)");
  els.projectPageInner.style.setProperty("--modal-ink", bucket?.ink || "var(--ink)");
  els.projectPageInner.innerHTML = `
    <aside class="project-ledger">
      <div class="ledger-row">
        <span class="ledger-label">Building</span>
        <span class="ledger-value">${escapeHtml(buildingName || label)}</span>
      </div>
      <div class="ledger-row">
        <span class="ledger-label">Projects</span>
        <span class="ledger-value">${clusterEntries.length}</span>
      </div>
    </aside>
    <main class="project-mainboard">
      <div class="mainboard-topbar">
        <span class="display-eyebrow">Cluster · ${clusterEntries.length} project${clusterEntries.length === 1 ? "" : "s"}</span>
      </div>
      <h1 class="display-title">${escapeHtml(label)}</h1>
      <section class="section-block">
        <div class="cluster-entry-list">${entryRows || "<p>No entries mapped to this building yet.</p>"}</div>
      </section>
    </main>
  `;

  // Drilling into a row remembers this cluster (fromCluster) so the entry
  // view's back button returns here instead of closing.
  els.projectPageInner.querySelectorAll("[data-cluster-entry-id]").forEach(btn => {
    btn.addEventListener("click", () => selectEntry(Number(btn.dataset.clusterEntryId), { zoom: false, skipDelay: true, fromCluster: clusterInfo }));
  });

  state.modalView = "cluster";
  refreshProjectBack();
  els.projectPage.classList.add("visible");
  els.projectPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("project-open");
}

// ── Gallery State & Functions ──────────────────────────────────
let galleryData = null;
let galleryMotion = null;

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

async function openGalleryOverlay() {
  if (!els.galleryOverlay) return;
  if (!galleryMotion) galleryMotion = initGalleryMotion();

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
  switchGalleryTab("grid");
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
  const finish = () => {
    els.galleryOverlay.classList.remove("visible");
    els.galleryOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("project-open");
    galleryMotion?.stop();
    if (window.gsap) window.gsap.set(els.galleryOverlay, { clearProps: "opacity,transform,clipPath" });
    // The Travel & Gallery building was framed + the rest faded on click —
    // restore the full city when leaving the gallery.
    terrain?.resetView();
  };
  const gsap = window.gsap;
  if (gsap) {
    gsap.killTweensOf(els.galleryOverlay);
    gsap.to(els.galleryOverlay, { opacity: 0, duration: 0.35, ease: "power2.in", onComplete: finish });
  } else {
    finish();
  }
}

function switchGalleryTab(tab) {
  document.querySelectorAll("[data-gallery-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.galleryTab === tab);
  });
  if (els.galleryGridView) els.galleryGridView.classList.toggle("active", tab === "grid");
  if (els.galleryCodexView) els.galleryCodexView.classList.toggle("active", tab === "codex");
}

function renderGallery() {
  if (!galleryData) return;

  // Render Grid View
  if (els.galleryGridView) {
    els.galleryGridView.innerHTML = galleryData.map((item) => `
      <div class="gallery-item" data-gallery-id="${item.id}">
        <img src="${item.thumb || item.src}" alt="${escapeHtml(item.title)}" loading="lazy">
        <div class="gallery-item-info">
          <h3 class="gallery-item-title">${escapeHtml(item.title)}</h3>
          <span class="gallery-item-meta">${escapeHtml(item.location)} · ${item.year}</span>
        </div>
      </div>
    `).join("");

    els.galleryGridView.querySelectorAll(".gallery-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.galleryId;
        const item = galleryData.find((x) => x.id === id);
        if (item) openArtifactView(item);
      });
      el.addEventListener("mouseenter", () => galleryMotion?.hoverItem(true));
      el.addEventListener("mouseleave", () => galleryMotion?.hoverItem(false));
    });
  }

  // Render Codex View
  if (els.galleryCodexView) {
    els.galleryCodexView.innerHTML = `
      <table class="gallery-codex-table">
        <thead>
          <tr class="gallery-codex-row header">
            <th class="gallery-codex-cell">Preview</th>
            <th class="gallery-codex-cell">Title</th>
            <th class="gallery-codex-cell">Location</th>
            <th class="gallery-codex-cell">Year</th>
            <th class="gallery-codex-cell">Genre</th>
            <th class="gallery-codex-cell">Camera</th>
          </tr>
        </thead>
        <tbody>
          ${galleryData.map((item) => `
            <tr class="gallery-codex-row" data-gallery-id="${item.id}">
              <td class="gallery-codex-cell gallery-codex-preview-cell">
                <img class="gallery-codex-thumb" src="${item.thumb || item.src}" alt="${escapeHtml(item.title)}" loading="lazy">
              </td>
              <td class="gallery-codex-cell" style="font-weight: 700;">${escapeHtml(item.title)}</td>
              <td class="gallery-codex-cell meta">${escapeHtml(item.location)}</td>
              <td class="gallery-codex-cell meta">${item.year}</td>
              <td class="gallery-codex-cell meta">${escapeHtml(item.genre || "N/A")}</td>
              <td class="gallery-codex-cell meta">${escapeHtml(item.camera || "N/A")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    els.galleryCodexView.querySelectorAll(".gallery-codex-row[data-gallery-id]").forEach((el) => {
      const id = el.dataset.galleryId;
      const item = galleryData.find((x) => x.id === id);
      el.addEventListener("click", () => { if (item) openArtifactView(item); });
      el.addEventListener("mouseenter", () => galleryMotion?.hoverRow(true, item?.thumb || item?.src));
      el.addEventListener("mouseleave", () => galleryMotion?.hoverRow(false));
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

  els.artifactContainer.innerHTML = `
    <div class="artifact-media-pane">
      <img src="${item.src}" alt="${escapeHtml(item.title)}">
    </div>
    <div class="artifact-text-pane">
      <span class="artifact-eyebrow">${escapeHtml(item.genre || "EXHIBIT")}</span>
      <h2 class="artifact-title">${escapeHtml(item.title)}</h2>
      <p class="artifact-story">${escapeHtml(item.story || "No description provided for this work.")}</p>
      
      <div class="artifact-metadata-grid">
        <div class="artifact-metadata-row">
          <span class="artifact-meta-label">Location</span>
          <span class="artifact-meta-val">${escapeHtml(item.location)}</span>
        </div>
        <div class="artifact-metadata-row">
          <span class="artifact-meta-label">Coordinates</span>
          <span class="artifact-meta-val">${escapeHtml(item.coordinates || "N/A")}</span>
        </div>
        <div class="artifact-metadata-row">
          <span class="artifact-meta-label">Year</span>
          <span class="artifact-meta-val">${item.year}</span>
        </div>
        <div class="artifact-metadata-row">
          <span class="artifact-meta-label">Camera Model</span>
          <span class="artifact-meta-val">${escapeHtml(item.camera || "N/A")}</span>
        </div>
        <div class="artifact-metadata-row">
          <span class="artifact-meta-label">Lens</span>
          <span class="artifact-meta-val">${escapeHtml(item.lens || "N/A")}</span>
        </div>
        <div class="artifact-metadata-row">
          <span class="artifact-meta-label">Exposure Settings</span>
          <span class="artifact-meta-val">${escapeHtml(item.exif || "N/A")}</span>
        </div>
        ${externalLinkHtml}
      </div>
    </div>
  `;

  els.galleryArtifact.classList.add("visible");
  els.galleryArtifact.setAttribute("aria-hidden", "false");
  galleryMotion?.start(); // custom cursor works over the artifact too

  setupArtifactCinematics();
}

// Split-screen reveal + staggered metadata + ambient Ken Burns + interactive
// parallax on the hero image. Returns nothing; stores teardown on _artifactFx.
let _artifactFx = null;
function setupArtifactCinematics() {
  const gsap = window.gsap;
  const media = els.artifactContainer.querySelector(".artifact-media-pane");
  const img = els.artifactContainer.querySelector(".artifact-media-pane img");
  if (_artifactFx) { _artifactFx(); _artifactFx = null; }
  if (!gsap || !img) return;

  // Entrance: panes slide in from opposite edges; text content staggers.
  gsap.killTweensOf([".artifact-media-pane", ".artifact-text-pane"]);
  const tl = gsap.timeline();
  tl.set(els.galleryArtifact, { opacity: 1 });
  tl.fromTo(".artifact-media-pane", { xPercent: -101 }, { xPercent: 0, duration: 0.75, ease: "power4.inOut" }, 0);
  tl.fromTo(".artifact-text-pane", { xPercent: 101 }, { xPercent: 0, duration: 0.75, ease: "power4.inOut" }, 0);
  // Transform-only staggers (no opacity) so a stalled tween can't leave the
  // exhibit text/metadata invisible — they just slide into place.
  tl.from([".artifact-eyebrow", ".artifact-title", ".artifact-story"],
    { y: 26, stagger: 0.08, duration: 0.5, ease: "power3.out", clearProps: "transform" }, "-=0.35");
  tl.from(".artifact-metadata-row",
    { x: 24, stagger: 0.05, duration: 0.4, ease: "power2.out", clearProps: "transform" }, "-=0.35");

  // Ambient Ken Burns — slow breathing zoom (scale only; pan is interactive).
  const ken = gsap.fromTo(img, { scale: 1.04 }, {
    scale: 1.16, duration: 14, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.6,
  });

  // Interactive parallax — image drifts toward the cursor to inspect detail.
  const panX = gsap.quickTo(img, "x", { duration: 0.6, ease: "power3.out" });
  const panY = gsap.quickTo(img, "y", { duration: 0.6, ease: "power3.out" });
  const onMove = (e) => {
    const r = media.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
    const ny = (e.clientY - r.top) / r.height - 0.5;
    panX(-nx * 60); panY(-ny * 60);                    // opposite = parallax
  };
  const onLeave = () => { panX(0); panY(0); };
  media.addEventListener("pointermove", onMove);
  media.addEventListener("pointerleave", onLeave);

  _artifactFx = () => {
    ken.kill();
    media.removeEventListener("pointermove", onMove);
    media.removeEventListener("pointerleave", onLeave);
  };
}

function closeArtifactView() {
  if (!els.galleryArtifact) return;
  if (_artifactFx) { _artifactFx(); _artifactFx = null; }
  const finish = () => {
    els.galleryArtifact.classList.remove("visible");
    els.galleryArtifact.setAttribute("aria-hidden", "true");
    if (window.gsap) window.gsap.set(els.galleryArtifact, { clearProps: "opacity" });
    // If the gallery overlay is gone too, retire the custom cursor.
    if (!els.galleryOverlay?.classList.contains("visible")) galleryMotion?.stop();
  };
  const gsap = window.gsap;
  if (gsap) {
    gsap.killTweensOf(els.galleryArtifact);
    gsap.to(els.galleryArtifact, { opacity: 0, duration: 0.3, ease: "power2.in", onComplete: finish });
  } else {
    finish();
  }
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
        <video src="${escapeHtml(m.src)}" controls preload="metadata"></video>
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

// Group entries by their 5 CV category bucket (Moving Images, Visual Systems, etc.)
// Returns [[bucketLabel, entries[], bucketObj], ...] sorted by ROLE_PILLS order.
function groupEntriesByBucket() {
  const buckets = new Map();
  for (const e of entries) {
    const allTags = [...(e.tags || []), ...(e.roleTags || []), e.role || ""];
    const bucket = findBucketForTags(allTags);
    const key = bucket ? bucket.key : "Other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e);
  }
  const OTHER_BUCKET = { key: "Other", label: "Other", icon: "○", color: "#c8c0e0", modalBg: "#EDE4CE", ink: "#1A1714" };
  const order = [...ROLE_PILLS.map((b) => b.key), "Other"];
  const result = [];
  for (const key of order) {
    const list = buckets.get(key);
    if (!list || !list.length) continue;
    const bucketObj = ROLE_PILLS.find((b) => b.key === key) || OTHER_BUCKET;
    result.push([bucketObj.label, list, bucketObj]);
  }
  return result;
}

function openNavPage(view) {
  if (!els.navPage || !els.navPageInner) return;
  navPageState.view = view;
  renderNavPage();
  els.navPage.classList.add("visible");
  els.navPage.setAttribute("aria-hidden", "false");
}

function renderNavPage() {
  const view = navPageState.view;
  if (!view) return;

  let title = "";
  let eyebrow = "";
  let groups = [];      // [[groupLabel, entries[], bucketObj?], ...]
  let field = "role";
  let fallback = "Untagged";
  let groupedByBucket = false;

  if (view === "roles") {
    title = "ROLES";
    eyebrow = `Master · ${ROLE_PILLS.length + 1} CV categories`;
    field = "role"; fallback = "Untagged";
    groups = groupEntriesByBucket();
    groupedByBucket = true;
  } else if (view === "clients") {
    title = "CLIENTS";
    eyebrow = "Master · orgs & clients across the portfolio";
    field = "org"; fallback = "No client";
    groups = groupEntriesBy("org", "No client");
  } else {
    return;
  }

  const totalEntries = entries.length;
  const totalGroups = groups.length;
  const editing = Boolean(state.editMode);

  // ── Bento builders ──────────────────────────────────────────────
  // A project row (leaf) — jumps into the 3D project, or edits in edit mode.
  const projectRow = (entry) => {
    const meta = [entry.role, entry.org, formatDate(entry)].filter(Boolean).join(" · ");
    return `
      <li class="bento-project">
        <button type="button" class="bento-project-jump" data-entry-jump="${entry.id}">
          <span class="bp-title">${escapeHtml(entry.title || "Untitled project")}</span>
          <span class="bp-meta">${escapeHtml(meta)}</span>
        </button>
        ${editing ? `<button type="button" class="nav-entry-edit" data-entry-edit="${entry.id}">EDIT</button>` : ""}
      </li>`;
  };
  const projectList = (list) =>
    `<ul class="bento-projects">${[...list].sort((a, b) => dateNumber(b) - dateNumber(a)).map(projectRow).join("")}</ul>`;

  // Roles drill one level deeper: each category box reveals its individual
  // roles as sub-boxes, which in turn reveal their projects.
  const roleSubgrid = (list) => {
    const byRole = new Map();
    for (const e of list) {
      const r = (e.role && String(e.role).trim()) || "Other";
      if (!byRole.has(r)) byRole.set(r, []);
      byRole.get(r).push(e);
    }
    const subs = [...byRole.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    return `<div class="bento-subgrid">${subs.map(([role, rl]) => `
      <div class="bento-subbox">
        <button type="button" class="bento-subbox-head" data-subbox-toggle>
          <span class="bento-subbox-title">${escapeHtml(role)}</span>
          <span class="bento-subbox-count">${rl.length}</span>
        </button>
        <div class="bento-subchildren">${projectList(rl)}</div>
      </div>`).join("")}</div>`;
  };

  // Top-level bento boxes (3-col grid): role categories, or client orgs.
  const groupRows = groups.map((g) => {
    const groupLabel = g[0];
    const list = g[1];
    const bucketObj = g[2]; // present only when grouped by bucket (roles)
    const color = bucketObj ? bucketObj.color : "#A89878";
    const children = groupedByBucket ? roleSubgrid(list) : projectList(list);
    const subCount = bucketObj
      ? `${new Set(list.map((e) => e.role).filter(Boolean)).size} roles · `
      : "";
    return `
      <div class="bento-box" style="--box-color:${color}">
        <button type="button" class="bento-box-head" data-box-toggle>
          <span class="bento-swatch" style="background:${color}"></span>
          <span class="bento-box-title">${escapeHtml(groupLabel)}</span>
          <span class="bento-box-count">${subCount}${list.length} project${list.length === 1 ? "" : "s"}</span>
        </button>
        <div class="bento-children">${children}</div>
      </div>`;
  }).join("");

  els.navPageInner.innerHTML = `
    <header class="nav-page-header">
      <span class="nav-page-eyebrow">${escapeHtml(eyebrow)}</span>
      <h2 class="nav-page-title">${escapeHtml(title)}</h2>
      <div class="nav-page-meta">
        <span>${totalGroups} ${view === "roles" ? "categories" : "clients"}</span>
        <span>·</span>
        <span>${totalEntries} projects total</span>
        ${editing ? `
          <button type="button" class="modal-action-btn nav-page-add" data-action="add-entry">+ ADD NEW PROJECT</button>
        ` : ""}
      </div>
    </header>
    <div class="bento-grid">${groupRows}</div>
  `;

  // ── Wire interactions ──
  // Toggle a top-level bento box: it expands full-width (CSS flex-basis
  // transition) while siblings jelly away. Single-open — clicking one
  // collapses the rest. We toggle classes (no re-render) so the transitions
  // actually run.
  els.navPageInner.querySelectorAll("[data-box-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const box = btn.closest(".bento-box");
      const grid = box.closest(".bento-grid");
      const willOpen = !box.classList.contains("expanded");
      grid.querySelectorAll(".bento-box.expanded").forEach((b) => {
        b.classList.remove("expanded");
        // collapse any open sub-boxes inside the one we're closing
        b.querySelectorAll(".bento-subbox.expanded").forEach((s) => s.classList.remove("expanded"));
        b.querySelectorAll(".bento-subgrid.has-expanded").forEach((sg) => sg.classList.remove("has-expanded"));
      });
      box.classList.toggle("expanded", willOpen);
      grid.classList.toggle("has-expanded", willOpen);
    });
  });
  // Roles only: toggle a role sub-box to reveal its projects.
  els.navPageInner.querySelectorAll("[data-subbox-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sub = btn.closest(".bento-subbox");
      const subgrid = sub.closest(".bento-subgrid");
      const willOpen = !sub.classList.contains("expanded");
      subgrid.querySelectorAll(".bento-subbox.expanded").forEach((s) => s.classList.remove("expanded"));
      sub.classList.toggle("expanded", willOpen);
      subgrid.classList.toggle("has-expanded", willOpen);
    });
  });
  els.navPageInner.querySelectorAll("[data-entry-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.entryJump);
      // Remember origin so × / Escape returns to this nav page
      state.editOriginNavView = navPageState.view;
      closeNavPage();
      selectEntry(id, { zoom: true });
    });
  });
  els.navPageInner.querySelectorAll("[data-entry-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.entryEdit);
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      // Remember which nav page we came from so we can return on cancel/close
      state.editOriginNavView = navPageState.view;
      closeNavPage();
      state.editingEntryId = entry.id;
      state.selectedEntryId = entry.id;
      terrain?.selectEntry(entry, { focus: true });
      setTimeout(() => openProjectPage(entry), 220);
    });
  });
  const addBtn = els.navPageInner.querySelector('[data-action="add-entry"]');
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      // Pre-fill role or org from the user's nav context (most-populated group)
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
        // Insert into local cache, sorted
        entries.push(j.entry);
        entries.sort((a, b) => dateNumber(a) - dateNumber(b));
        // Update entriesByMonth
        const mk = `${j.entry.year}-${String(j.entry.month || 1).padStart(2, "0")}`;
        if (!entriesByMonth.has(mk)) entriesByMonth.set(mk, []);
        entriesByMonth.get(mk).push(j.entry);
        // Open editor on the new entry
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

function closeNavPage() {
  if (els.navPage) {
    els.navPage.classList.remove("visible");
    els.navPage.setAttribute("aria-hidden", "true");
  }
  els.navLinks?.forEach((l) => {
    l.classList.toggle("active", l.dataset.view === "archive");
  });
}

function renderTags() {
  els.tagFilters.replaceChildren();
  for (const tag of data.tags || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tag-button${state.activeTags.has(tag.name) ? " active" : ""}`;
    button.innerHTML = `${escapeHtml(tag.name)} <span>${tag.count}</span>`;
    button.addEventListener("click", () => {
      if (state.activeTags.has(tag.name)) state.activeTags.delete(tag.name);
      else state.activeTags.add(tag.name);
      renderTags();
      applyFilters();
    });
    els.tagFilters.append(button);
  }
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

  const filterText = [];
  if (state.activeTags.size) filterText.push([...state.activeTags].join(", "));
  if (state.search) filterText.push(`"${state.search}"`);
  
  if (els.activeSummary) {
    els.activeSummary.textContent = filterText.length ? "Filtered map" : "All years";
  }
  if (els.visibleSummary) {
    els.visibleSummary.textContent = `${filteredEntries.length} of ${entries.length} projects visible`;
  }
  
  // Finach: Massive watermark text
  if (els.watermarkText) {
    if (state.activeTags.size) {
      els.watermarkText.textContent = [...state.activeTags].join(" ");
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
    hasFilter: Boolean(state.activeTags.size || state.search || effectiveRole !== "all"),
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

async function initTerrain() {
  if (!els.terrainCanvas) return;
  try {
    const module = await import("./terrain.js?v=time-machine-r02");
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
  const tagMatch = !state.activeTags.size || entry.tags.some((tag) => state.activeTags.has(tag));
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
