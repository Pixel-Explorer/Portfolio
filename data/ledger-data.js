// Pass 04: JSON is canonical. The runtime loader just fetches it.
// The xlsx workbook is now archival — regenerate ledger.json from it via
// `node scripts/xlsx-to-json.mjs` if you ever need to re-seed from Excel.
// Live edits go through the API in scripts/static-server.mjs and write back
// to data/ledger.json directly.

window.LEDGER_DATA_PROMISE = (async function () {
  try {
    // Cache-bust so edits made via the API surface on hard refresh without
    // the static server caching the previous JSON body.
    const response = await fetch(`data/ledger.json?_t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`ledger.json fetch failed: ${response.status}`);
    const data = await response.json();
    window.LEDGER_DATA = data;
    if (window.ARCHIVE_APP_DEBUG) {
      console.log("Loaded ledger:", {
        source: data.sourceWorkbook || "data/ledger.json",
        entries: (data.entries || []).length,
        yearStart: data.yearStart,
        yearEnd: data.yearEnd,
        tagCount: (data.tags || []).length,
        schemaVersion: data.schemaVersion,
      });
    }
    return data;
  } catch (err) {
    console.warn("Failed to load ledger.json, falling back to static snapshot.", err);
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "data/ledger-data-static.js";
      s.onload = () => resolve(window.LEDGER_DATA || {});
      s.onerror = () => resolve(window.LEDGER_DATA || {});
      document.head.appendChild(s);
    });
  }
})();
