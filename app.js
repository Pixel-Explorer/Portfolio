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
};

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
  setText(els.statYears, years.length.toLocaleString("en-IN"));
  setText(els.statTags, (data.tags || []).length.toLocaleString("en-IN"));

  renderTags();
  renderWeekHeader();
  renderGrid();
  renderSupportingSections();
  applyFilters();
  bindEvents();

  if (entries.length) {
    selectEntry(entries[entries.length - 1].id, { zoom: false, scroll: false });
  }

  initTerrain();
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
      els.toggleView.textContent = is3D ? "2D view" : "3D view";
      document.body.classList.toggle("view-2d", !is3D);
    });
  }

  els.prevEntry.addEventListener("click", () => stepEntry(-1));
  els.nextEntry.addEventListener("click", () => stepEntry(1));

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") stepEntry(1);
    if (event.key === "ArrowLeft") stepEntry(-1);
    if (event.key === "Escape") hideTooltip();
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

function renderWeekHeader() {
  els.weekHeader.replaceChildren();
  els.weekHeader.append(document.createElement("span"));
  for (const week of weeks) {
    const label = document.createElement("span");
    label.className = "week-label";
    label.textContent = [1, 14, 27, 40, 53].includes(week) ? `W${week}` : "";
    els.weekHeader.append(label);
  }
}

function renderGrid() {
  els.yearGrid.replaceChildren();
  weekCells.clear();

  for (const year of years) {
    const row = document.createElement("div");
    row.className = "year-row";

    const label = document.createElement("div");
    label.className = "year-label";
    label.textContent = year;
    row.append(label);

    for (const week of weeks) {
      const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
      const weekEntries = entriesByWeek.get(weekKey) || [];
      const emailCount = Number((data.weeklyEmailCounts || {})[weekKey] || 0);
      const tone = getTone(weekEntries.length, emailCount);
      const kind = getDominantKind(weekEntries);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cell${weekEntries.length ? " has-entry" : ""}`;
      cell.dataset.weekKey = weekKey;
      cell.dataset.tone = tone;
      if (kind) cell.dataset.kind = kind;
      cell.setAttribute("aria-label", `${year} week ${week}: ${weekEntries.length} ledger moments, ${emailCount} emails`);

      cell.addEventListener("mouseenter", (event) => {
        showTooltip(event, weekKey, weekEntries, emailCount);
        // Quentin Hocdé - GSAP cell distortion
        if (window.gsap) {
          gsap.to(cell, { scale: 2.2, borderRadius: "50%", zIndex: 10, duration: 0.4, ease: "elastic.out(1, 0.3)" });
          gsap.to(cell.parentNode.children, {
            scale: (i, target) => target === cell ? 2.2 : 0.9,
            x: (i, target) => target === cell ? 0 : (Math.random() - 0.5) * 5,
            y: (i, target) => target === cell ? 0 : (Math.random() - 0.5) * 5,
            duration: 0.3,
            stagger: 0.01,
            ease: "power2.out"
          });
        }
      });
      cell.addEventListener("mousemove", moveTooltip);
      cell.addEventListener("mouseleave", () => {
        hideTooltip();
        if (window.gsap) {
          gsap.to(cell.parentNode.children, { scale: 1, x: 0, y: 0, borderRadius: "0%", zIndex: 1, duration: 0.4, ease: "power2.out" });
        }
      });
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
    hasFilter: Boolean(state.activeTags.size || state.search),
    matchingWeekKeys: matching,
  });

  if (filteredEntries.length && !filteredEntries.some((entry) => entry.id === state.selectedEntryId)) {
    selectEntry(filteredEntries[0].id, { zoom: false, scroll: false });
  }
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
  renderDetail(entry);
}

function selectEmptyWeek(weekKey, emailCount, cell) {
  document.querySelectorAll(".cell.active").forEach((item) => item.classList.remove("active"));
  if (cell) cell.classList.add("active");
  terrain?.selectWeek(weekKey, { focus: true });
  if (state.zoom < 130) setZoom(130);
  if (cell) cell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  if (els.detailPanel) {
    els.detailPanel.classList.add("visible");
    els.detailPanel.innerHTML = `
    <div class="detail-content">
      <p class="eyebrow">${escapeHtml(weekKey)}</p>
      <h2>Open week</h2>
      <p class="detail-description">No curated ledger entry is attached to this week yet. The email layer shows ${emailCount.toLocaleString("en-IN")} substantive sent email${emailCount === 1 ? "" : "s"} here.</p>
      <div class="detail-grid">
        <div class="fact"><span>Status</span><strong>Available for future annotation</strong></div>
      </div>
    </div>
  `;
  }
}

function renderDetail(entry) {
  const weekEntries = entriesByWeek.get(entry.weekKey) || [];
  const emailCount = Number((data.weeklyEmailCounts || {})[entry.weekKey] || 0);
  const tags = entry.tags.slice(0, 10).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("");
  const siblingButtons = weekEntries
    .filter((item) => item.id !== entry.id)
    .slice(0, 6)
    .map((item) => `<button type="button" data-entry-id="${item.id}">${escapeHtml(item.title)}</button>`)
    .join("");

  if (els.detailPanel) {
    els.detailPanel.classList.add("visible");
    els.detailPanel.innerHTML = `
    <div class="detail-content">
      <p class="eyebrow">${escapeHtml(formatDate(entry))} | ${escapeHtml(entry.weekKey)}</p>
      <h2>${escapeHtml(entry.title || "Untitled moment")}</h2>
      <div class="detail-meta">${tags}</div>
      <p class="detail-description">${escapeHtml(entry.description || entry.notes || "No description yet.")}</p>
      <div class="detail-grid">
        ${fact("Role", entry.role)}
        ${fact("Org / Client", entry.org)}
        ${fact("Location", entry.location)}
        ${fact("Era", entry.era)}
        ${fact("Evidence", [entry.evidenceSource, entry.evidenceDetail].filter(Boolean).join(" | "))}
        ${fact("Productivity trace", `${emailCount.toLocaleString("en-IN")} substantive sent email${emailCount === 1 ? "" : "s"} in this week`)}
        ${entry.earningsAmount ? fact("Money", `${entry.currency || ""} ${Number(entry.earningsAmount).toLocaleString("en-IN")}`) : ""}
        ${fact("Notes", entry.notes)}
      </div>
      ${siblingButtons ? `<div class="week-stack"><h3>Same week</h3>${siblingButtons}</div>` : ""}
    </div>
  `;

    els.detailPanel.querySelectorAll("[data-entry-id]").forEach((button) => {
      button.addEventListener("click", () => selectEntry(Number(button.dataset.entryId), { zoom: false, scroll: true }));
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
  els.mapScale.style.transform = `scale(${value / 100})`;
  terrain?.setZoom(value);
}

async function initTerrain() {
  if (!els.terrainCanvas) return;
  try {
    const module = await import("./terrain.js?v=spatial-v4");
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
