window.ARCHIVE_APP_DEBUG = window.ARCHIVE_APP_DEBUG || {};
window.ARCHIVE_APP_DEBUG.version = "v2";
window.ARCHIVE_APP_DEBUG.loadedAt = new Date().toISOString();
console.log("Archive app module loaded", window.ARCHIVE_APP_DEBUG);

let data = {};
let entries = [];
let years = [];
let weeks = [];
let weekCells = new Map();
let entriesByWeek = new Map();
let maxEmailCount = 1;
let terrain = null;
const state = window.ARCHIVE_APP_STATE || {
  activeTags: new Set(),
  search: "",
  selectedEntryId: null,
  zoom: 100,
};
window.ARCHIVE_APP_STATE = state;

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
  entriesByWeek = groupBy(entries, (entry) => entry.weekKey);
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
  { key: "Photography", label: "Photography", color: "#ff6ec7", match: ["Photographer", "Photography"] },
  { key: "Design",      label: "Graphic Design", color: "#6ed1ff", match: ["Designer", "Design", "Graphic"] },
  { key: "AV",          label: "Audio-Visual", color: "#b48cff", match: ["Film", "Cinematographer", "Animation", "MusicVideo", "Documentary"] },
  { key: "Branding",    label: "Branding", color: "#ffb18c", match: ["Studio", "Strategy", "Founder"] },
  { key: "IT",          label: "IT & Web3", color: "#8cffb4", match: ["Tech", "Web3"] },
];

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
  // Keep the "All" pill that's already in HTML, then append role pills
  els.rolePills.querySelectorAll(".rolepill[data-role]:not([data-role='all'])").forEach((n) => n.remove());

  // Wire the "All" pill
  const allPill = els.rolePills.querySelector(".rolepill[data-role='all']");
  if (allPill) {
    allPill.classList.toggle("active", state.activeRoleKey === "all");
    allPill.onclick = () => setActiveRole("all");
  }

  for (const role of ROLE_PILLS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `rolepill${state.activeRoleKey === role.key ? " active" : ""}`;
    btn.dataset.role = role.key;
    btn.innerHTML = `<span class="rolepill-dot" style="background:${role.color}; color:${role.color}"></span>${role.label}`;
    btn.addEventListener("click", () => setActiveRole(role.key));
    els.rolePills.append(btn);
  }
}

function setActiveRole(key) {
  state.activeRoleKey = key;
  // Update pill UI
  els.rolePills?.querySelectorAll(".rolepill").forEach((p) => {
    p.classList.toggle("active", p.dataset.role === key);
  });
  applyFilters();
}

function entryMatchesActiveRole(entry) {
  if (state.activeRoleKey === "all") return true;
  const role = ROLE_PILLS.find((r) => r.key === state.activeRoleKey);
  if (!role) return true;
  const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
  return allTags.some((t) =>
    role.match.some((m) => String(t).toLowerCase().includes(m.toLowerCase())),
  );
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

  els.zoomControl.addEventListener("input", (event) => {
    setZoom(Number(event.target.value));
  });

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

// ─── Full-screen project page ────────────────────────────────────
function openProjectPage(entry) {
  if (!els.projectPage || !els.projectPageInner) return;

  const weekEntries = entriesByWeek.get(entry.weekKey) || [];
  const emailCount = Number((data.weeklyEmailCounts || {})[entry.weekKey] || 0);

  // Find dominant role bucket for the accent color
  const allTags = [...(entry.tags || []), ...(entry.roleTags || []), entry.role || ""];
  const bucket = ROLE_PILLS.find((b) =>
    allTags.some((t) => b.match.some((m) => String(t).toLowerCase().includes(m.toLowerCase()))),
  );
  const bucketColor = bucket?.color || "#c8c0e0";
  const bucketLabel = bucket?.label || "Other";

  const tagsHTML = entry.tags.slice(0, 12)
    .map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("");

  // Find prev/next entry chronologically
  const idx = entries.findIndex((e) => e.id === entry.id);
  const prev = idx > 0 ? entries[idx - 1] : null;
  const next = idx < entries.length - 1 ? entries[idx + 1] : null;

  const relatedHTML = weekEntries
    .filter((item) => item.id !== entry.id)
    .slice(0, 6)
    .map((item) => `
      <button type="button" class="project-related-btn" data-related-id="${item.id}">
        ${escapeHtml(item.title || "Untitled")}
        <small>${escapeHtml(item.role || "")} ${item.org ? "· " + escapeHtml(item.org) : ""}</small>
      </button>
    `).join("");

  els.projectPageInner.style.setProperty("--accent-bucket", bucketColor);
  els.projectPageInner.innerHTML = `
    <div class="project-hero">
      <div class="project-bucket-tag">
        <span class="project-bucket-dot" style="background:${bucketColor}; box-shadow: 0 0 8px ${bucketColor};"></span>
        ${escapeHtml(bucketLabel)}
      </div>
      <span class="project-date">${escapeHtml(formatDate(entry))} · ${escapeHtml(entry.weekKey)}</span>
      <h1 class="project-title">${escapeHtml(entry.title || "Untitled moment")}</h1>
      ${tagsHTML ? `<div class="project-tags">${tagsHTML}</div>` : ""}
      <p class="project-description">${escapeHtml(entry.description || entry.notes || "No description yet.")}</p>
    </div>

    <div class="project-grid">
      ${fact("Role", entry.role)}
      ${fact("Org / Client", entry.org)}
      ${fact("Location", entry.location)}
      ${fact("Era", entry.era)}
      ${fact("Evidence", [entry.evidenceSource, entry.evidenceDetail].filter(Boolean).join(" · "))}
      ${fact("Productivity", `${emailCount.toLocaleString("en-IN")} sent email${emailCount === 1 ? "" : "s"} this week`)}
      ${entry.earningsAmount ? fact("Money", `${entry.currency || ""} ${Number(entry.earningsAmount).toLocaleString("en-IN")}`) : ""}
      ${entry.notes && entry.notes !== entry.description ? fact("Notes", entry.notes) : ""}
    </div>

    ${relatedHTML ? `
      <div class="project-section">
        <h3>Same week</h3>
        <div class="project-related">${relatedHTML}</div>
      </div>
    ` : ""}

    <div class="project-nav">
      ${prev ? `
        <button type="button" class="project-nav-btn" data-nav-id="${prev.id}">
          <small>← Previous</small>
          ${escapeHtml(prev.title || "Untitled")}
        </button>
      ` : `<div></div>`}
      ${next ? `
        <button type="button" class="project-nav-btn" data-direction="next" data-nav-id="${next.id}">
          <small>Next →</small>
          ${escapeHtml(next.title || "Untitled")}
        </button>
      ` : `<div></div>`}
    </div>
  `;

  els.projectPageInner.querySelectorAll("[data-related-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectEntry(Number(btn.dataset.relatedId), { zoom: true }));
  });
  els.projectPageInner.querySelectorAll("[data-nav-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectEntry(Number(btn.dataset.navId), { zoom: true }));
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
}

// ─── Nav-tab overlay pages (Roles / Firsts / Throughlines) ──────
function openNavPage(view) {
  if (!els.navPage || !els.navPageInner) return;

  let title = "";
  let eyebrow = "";
  let items = [];

  if (view === "roles") {
    title = "Roles";
    eyebrow = "Hats worn over the years";
    // Aggregate by role across all entries
    const byRole = new Map();
    for (const e of entries) {
      const r = e.role || "Other";
      if (!byRole.has(r)) byRole.set(r, []);
      byRole.get(r).push(e);
    }
    items = [...byRole.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([role, list]) => ({
        title: role,
        count: list.length,
        sub: `${list.length} moment${list.length === 1 ? "" : "s"}`,
        firstId: list[0]?.id,
      }));
  } else if (view === "firsts") {
    title = "Firsts";
    eyebrow = "Milestones and beginnings";
    items = entries
      .filter((e) => (e.tags || []).includes("Milestone"))
      .map((e) => ({
        title: e.title || "Untitled",
        sub: `${formatDate(e)} · ${e.role || ""}`,
        firstId: e.id,
      }));
  } else if (view === "throughlines") {
    title = "Throughlines";
    eyebrow = "Themes that run across the archive";
    items = entries
      .filter((e) => (e.tags || []).includes("ThroughLine"))
      .map((e) => ({
        title: e.title || "Untitled",
        sub: `${formatDate(e)} · ${e.role || ""}`,
        firstId: e.id,
      }));
  } else {
    return;
  }

  els.navPageInner.innerHTML = `
    <div class="nav-page-header">
      <span class="nav-page-eyebrow">${escapeHtml(eyebrow)}</span>
      <h2 class="nav-page-title">${escapeHtml(title)}</h2>
    </div>
    <div class="nav-page-list">
      ${items.map((item) => `
        <button type="button" class="nav-page-card" data-jump-id="${item.firstId || ""}">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.sub || "")}</small>
        </button>
      `).join("")}
    </div>
  `;

  els.navPageInner.querySelectorAll("[data-jump-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.jumpId);
      if (id) {
        closeNavPage();
        selectEntry(id, { zoom: true });
      }
    });
  });

  els.navPage.classList.add("visible");
  els.navPage.setAttribute("aria-hidden", "false");
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

function renderWeekHeader() {
  // Transposed: years run horizontally across the top
  document.documentElement.style.setProperty("--year-count", years.length);
  els.weekHeader.replaceChildren();
  const corner = document.createElement("span");
  corner.className = "grid-corner";
  els.weekHeader.append(corner);
  for (const year of years) {
    const label = document.createElement("span");
    label.className = "year-col-label";
    // Only show every other year label to avoid clutter
    label.textContent = year % 2 === 0 ? String(year).slice(2) : "";
    label.title = String(year);
    els.weekHeader.append(label);
  }
}

function renderGrid() {
  // Transposed: each row is a week, columns are years
  els.yearGrid.replaceChildren();
  weekCells.clear();

  for (const week of weeks) {
    const row = document.createElement("div");
    row.className = "week-row";

    const label = document.createElement("div");
    label.className = "week-row-label";
    label.textContent = [1, 14, 27, 40, 53].includes(week) ? `W${week}` : "";
    row.append(label);

    for (const year of years) {
      const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
      const weekEntries = entriesByWeek.get(weekKey) || [];
      const emailCount = Number((data.weeklyEmailCounts || {})[weekKey] || 0);
      const tone = getTone(weekEntries.length, emailCount);
      const bucketKey = getDominantBucketKey(weekEntries);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cell${weekEntries.length ? " has-entry" : ""}`;
      cell.dataset.weekKey = weekKey;
      cell.dataset.tone = tone;
      if (bucketKey) cell.dataset.bucket = bucketKey;
      cell.setAttribute(
        "aria-label",
        `${year} week ${week}: ${weekEntries.length} ledger moments, ${emailCount} emails`,
      );

      cell.addEventListener("mouseenter", (event) => {
        showTooltip(event, weekKey, weekEntries, emailCount);
      });
      cell.addEventListener("mousemove", moveTooltip);
      cell.addEventListener("mouseleave", hideTooltip);
      cell.addEventListener("click", () => {
        if (weekEntries.length) selectEntry(getStrongestEntry(weekEntries).id, { zoom: true, scroll: true });
        else selectEmptyWeek(weekKey, emailCount, cell);
      });

      row.append(cell);
      weekCells.set(weekKey, cell);
    }

    els.yearGrid.append(row);
  }
}

function applyFilters() {
  const matching = new Set();
  const filteredEntries = entries.filter((entry) => matchesEntry(entry));
  for (const entry of filteredEntries) matching.add(entry.weekKey);

  for (const [weekKey, cell] of weekCells.entries()) {
    const hasEntries = (entriesByWeek.get(weekKey) || []).length > 0;
    const shouldDim = (state.activeTags.size || state.search) && hasEntries && !matching.has(weekKey);
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
  terrain?.updateFilters({
    hasFilter: Boolean(state.activeTags.size || state.search || state.activeRoleKey !== "all"),
    matchingWeekKeys: matching,
    // Search isolates results entirely (hide non-matches); pills/tags just dim
    isolate: Boolean(state.search),
  });
  // No auto-selection — detail panel only opens when user clicks a prism
}

function selectEntry(entryId, options = {}) {
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) return;

  state.selectedEntryId = entry.id;
  document.querySelectorAll(".cell.active").forEach((cell) => cell.classList.remove("active"));
  const cell = weekCells.get(entry.weekKey);
  if (cell) {
    cell.classList.add("active");
    if (options.scroll) cell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }
  terrain?.selectEntry(entry, { focus: Boolean(options.zoom || options.scroll) });
  if (options.zoom && state.zoom < 145) setZoom(155);
  // Brief delay so the in-scene anchor (title billboard, halo) animates in first
  const delay = options.skipDelay ? 0 : 600;
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
  const bucket = ROLE_PILLS.find((b) =>
    allTags.some((t) => b.match.some((m) => String(t).toLowerCase().includes(m.toLowerCase()))),
  );
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
  els.zoomControl.value = String(value);
  els.zoomOutput.textContent = `${value}%`;
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
    const module = await import("./terrain.js?v=anchor-v13");
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
      const bucket = ROLE_PILLS.find((b) => b.match.some((m) => String(t).toLowerCase().includes(m.toLowerCase())));
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
