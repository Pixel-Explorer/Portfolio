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
      closeProjectPage();
      terrain?.selectEntry(null, { focus: false });
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

  els.prevEntry.addEventListener("click", () => stepEntry(-1));
  els.nextEntry.addEventListener("click", () => stepEntry(1));

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") stepEntry(1);
    if (event.key === "ArrowLeft") stepEntry(-1);
    if (event.key === "Escape") {
      hideTooltip();
      if (els.projectPage?.classList.contains("visible")) {
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

  const idx = entries.findIndex((e) => e.id === entry.id);
  const prev = idx > 0 ? entries[idx - 1] : null;
  const next = idx < entries.length - 1 ? entries[idx + 1] : null;

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
      <h1 class="display-title">${escapeHtml(entry.title || "Untitled moment")}</h1>
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

      <section class="section-block">
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

  els.projectPage.classList.add("visible");
  els.projectPage.setAttribute("aria-hidden", "false");
  document.body.classList.add("project-open");
}

function closeProjectPage() {
  if (els.projectPage) {
    els.projectPage.classList.remove("visible");
    els.projectPage.setAttribute("aria-hidden", "true");
    document.body.classList.remove("project-open");
  }
  state.editingEntryId = null;
}

// ─── Pass 04: editor view + media + save ─────────────────────────

function renderEvidenceReadOnly(entry) {
  const media = Array.isArray(entry.evidence) ? entry.evidence : [];
  if (!media.length) return "";
  const items = media.map((m) => {
    if (m.type === "image" && m.src) {
      return `<figure class="ev-figure">
        <img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.caption || "")}" loading="lazy">
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    if (m.type === "video" && m.src) {
      return `<figure class="ev-figure">
        <video src="${escapeHtml(m.src)}" controls preload="metadata"></video>
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    if (m.type === "youtube" && m.url) {
      const id = extractYouTubeId(m.url);
      if (!id) return `<a class="ev-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">${escapeHtml(m.url)}</a>`;
      return `<figure class="ev-figure">
        <iframe src="https://www.youtube.com/embed/${id}" title="${escapeHtml(m.caption || "YouTube")}" allowfullscreen loading="lazy"></iframe>
        ${m.caption ? `<figcaption>${escapeHtml(m.caption)}</figcaption>` : ""}
      </figure>`;
    }
    return "";
  }).join("");
  return `<section class="section-block">
    <h3 class="section-head">Evidence</h3>
    <div class="evidence-grid">${items}</div>
  </section>`;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
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
    else if (m.type === "youtube" && m.url) {
      const id = extractYouTubeId(m.url);
      preview = id
        ? `<iframe src="https://www.youtube.com/embed/${id}" loading="lazy"></iframe>`
        : `<span class="ev-edit-fallback">${escapeHtml(m.url)}</span>`;
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
            <input type="file" accept="image/*,video/*" data-media-upload hidden multiple>
            <span>+ UPLOAD IMAGE / VIDEO</span>
          </label>

          <form class="ev-youtube-form" data-media-youtube-form>
            <input type="url" placeholder="https://youtube.com/watch?v=..." data-media-youtube-url required>
            <button type="submit">+ ADD YOUTUBE</button>
          </form>
        </div>
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
          const type = file.type.startsWith("video/") ? "video" : "image";
          editDraft.evidence.push({ type, src: url, caption: "" });
        } catch (err) {
          console.error("Upload failed:", err);
          alert(`Upload failed: ${err.message || err}`);
        }
      }
      renderEditView(entry);
    });
  }

  // YouTube link
  const ytForm = els.projectPageInner.querySelector("[data-media-youtube-form]");
  if (ytForm) {
    ytForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const inp = ytForm.querySelector("[data-media-youtube-url]");
      const url = inp.value.trim();
      if (!url) return;
      if (!extractYouTubeId(url)) {
        if (!confirm("Doesn't look like a YouTube URL. Add anyway?")) return;
      }
      editDraft.evidence.push({ type: "youtube", url, caption: "" });
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
  const order = [...ROLE_PILLS.map((b) => b.key), "Other"];
  const result = [];
  for (const key of order) {
    const list = buckets.get(key);
    if (!list || !list.length) continue;
    const bucketObj = ROLE_PILLS.find((b) => b.key === key) || {
      key: "Other", label: "Other", color: "#c8c0e0", modalBg: "#EDE4CE", ink: "#1A1714",
    };
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
    eyebrow = "Master · 5 CV categories";
    field = "role"; fallback = "Untagged";
    groups = groupEntriesByBucket();
    groupedByBucket = true;
  } else if (view === "clients") {
    title = "CLIENTS";
    eyebrow = "Master · orgs & clients across the archive";
    field = "org"; fallback = "No client";
    groups = groupEntriesBy("org", "No client");
  } else {
    return;
  }

  const totalEntries = entries.length;
  const totalGroups = groups.length;
  const editing = Boolean(state.editMode);

  const groupRows = groups.map((g) => {
    const groupLabel = g[0];
    const list = g[1];
    const bucketObj = g[2]; // only present when grouped by bucket
    const isOpen = navPageState.expanded.has(groupLabel);
    const safeId = `grp-${groupLabel.replace(/[^a-z0-9]/gi, "_")}`;
    const sortedList = [...list].sort((a, b) => dateNumber(a) - dateNumber(b));
    const innerRows = isOpen ? sortedList.map((entry) => {
      // When grouped by bucket, show the individual role as a small chip in the meta line.
      const rolePiece = groupedByBucket && entry.role
        ? `<span class="nav-entry-role">${escapeHtml(entry.role)}</span>`
        : "";
      const metaPieces = [formatDate(entry)];
      if (entry.org) metaPieces.push(entry.org);
      if (entry.location) metaPieces.push(entry.location);
      return `
        <li class="nav-entry-row" data-entry-id="${entry.id}">
          <button type="button" class="nav-entry-jump" data-entry-jump="${entry.id}">
            <span class="nav-entry-title">${escapeHtml(entry.title || "Untitled")}</span>
            <span class="nav-entry-meta">
              ${rolePiece}
              <span>${escapeHtml(metaPieces.join(" · "))}</span>
            </span>
          </button>
          ${editing ? `<button type="button" class="nav-entry-edit" data-entry-edit="${entry.id}">EDIT</button>` : ""}
        </li>
      `;
    }).join("") : "";

    // Color swatch (when grouped by bucket) + sub-count of unique roles
    const swatch = bucketObj
      ? `<span class="nav-group-swatch" style="background:${bucketObj.color}"></span>`
      : "";
    const uniqueRoles = bucketObj
      ? new Set(list.map((e) => e.role).filter(Boolean)).size
      : 0;
    const subMeta = bucketObj && uniqueRoles
      ? `<span class="nav-group-submeta">${uniqueRoles} role${uniqueRoles === 1 ? "" : "s"}</span>`
      : "";

    return `
      <section class="nav-group ${isOpen ? "is-open" : ""} ${bucketObj ? "nav-group--bucket" : ""}" id="${safeId}"
               ${bucketObj ? `style="--group-color:${bucketObj.color}"` : ""}>
        <button type="button" class="nav-group-row" data-group-toggle="${escapeHtml(groupLabel)}">
          <span class="nav-group-chevron" aria-hidden="true">${isOpen ? "−" : "+"}</span>
          ${swatch}
          <strong class="nav-group-title">${escapeHtml(groupLabel)}</strong>
          ${subMeta}
          <span class="nav-group-count">${list.length} ${list.length === 1 ? "moment" : "moments"}</span>
        </button>
        ${isOpen ? `<ol class="nav-entry-list">${innerRows}</ol>` : ""}
      </section>
    `;
  }).join("");

  els.navPageInner.innerHTML = `
    <header class="nav-page-header">
      <span class="nav-page-eyebrow">${escapeHtml(eyebrow)}</span>
      <h2 class="nav-page-title">${escapeHtml(title)}</h2>
      <div class="nav-page-meta">
        <span>${totalGroups} ${view === "roles" ? "categories" : "clients"}</span>
        <span>·</span>
        <span>${totalEntries} moments total</span>
        ${editing ? `
          <button type="button" class="modal-action-btn nav-page-add" data-action="add-entry">+ ADD NEW MOMENT</button>
        ` : ""}
      </div>
    </header>
    <div class="nav-page-groups">${groupRows}</div>
  `;

  // ── Wire interactions ──
  els.navPageInner.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.groupToggle;
      if (navPageState.expanded.has(key)) navPageState.expanded.delete(key);
      else navPageState.expanded.add(key);
      renderNavPage();
    });
  });
  els.navPageInner.querySelectorAll("[data-entry-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.entryJump);
      closeNavPage();
      selectEntry(id, { zoom: true });
    });
  });
  els.navPageInner.querySelectorAll("[data-entry-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.entryEdit);
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
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
        alert(`Couldn't create new moment: ${err.message || err}`);
      }
    });
  }
}

function closeNavPage() {
  if (els.navPage) {
    els.navPage.classList.remove("visible");
    els.navPage.setAttribute("aria-hidden", "true");
  }
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

// Pass 04: 2D view is now a year × month calendar matrix.
// Rows = years (chronological top-down), columns = 12 months.
// Matches the 3D scene which is locked to month granularity.
const MONTH_ABBR = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function renderWeekHeader() {
  document.documentElement.style.setProperty("--month-count", months.length);
  els.weekHeader.replaceChildren();
  const corner = document.createElement("span");
  corner.className = "grid-corner";
  els.weekHeader.append(corner);
  for (const m of months) {
    const label = document.createElement("span");
    label.className = "month-col-label";
    label.textContent = MONTH_ABBR[m - 1];
    label.title = MONTH_ABBR[m - 1];
    els.weekHeader.append(label);
  }
}

function renderGrid() {
  els.yearGrid.replaceChildren();
  monthCells.clear();

  for (const year of years) {
    const row = document.createElement("div");
    row.className = "year-row";

    const label = document.createElement("div");
    label.className = "year-row-label";
    label.textContent = String(year);
    row.append(label);

    for (const month of months) {
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
        `${year} ${MONTH_ABBR[month - 1]}: ${monthEntries.length} ledger moments`,
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
    els.visibleSummary.textContent = `${filteredEntries.length} of ${entries.length} ledger moments visible`;
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
      <span aria-hidden="true">←</span> Back to archive
    </button>
    <button class="detail-close" id="detailCloseInner" type="button" aria-label="Close detail">×</button>

    <div class="detail-hero" style="background: linear-gradient(135deg, ${bucketColor}28, transparent 70%);">
      <div class="detail-hero-tag">
        <span class="hero-dot" style="background:${bucketColor}; box-shadow: 0 0 12px ${bucketColor};"></span>
        ${escapeHtml(bucketLabel)}
      </div>
      <p class="detail-eyebrow">${escapeHtml(formatDate(entry))} · ${escapeHtml(entry.weekKey)}</p>
      <h2>${escapeHtml(entry.title || "Untitled moment")}</h2>
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
    <strong>${escapeHtml(weekKey)} | ${weekEntries.length} moment${weekEntries.length === 1 ? "" : "s"}</strong>
    <span>${escapeHtml(title || "No curated entry yet")}</span><br>
    <span>${emailCount.toLocaleString("en-IN")} emails${tags ? ` | ${escapeHtml(tags)}` : ""}</span>
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
      onHover: (event, weekKey) => {
        const weekEntries = entriesByWeek.get(weekKey) || [];
        const emailCount = Number((data.weeklyEmailCounts || {})[weekKey] || 0);
        showTooltip(event, weekKey, weekEntries, emailCount);
      },
      onMove: moveTooltip,
      onLeave: hideTooltip,
      onSelectEntry: (entryId) => selectEntry(entryId, { zoom: true, scroll: false }),
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
      els.terrainEmpty.innerHTML = "<strong>Spatial archive unavailable</strong><span>The flat chronology is still ready below.</span>";
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
