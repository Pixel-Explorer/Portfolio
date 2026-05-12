// runtime ledger loader
// Place your updated Excel workbook at data/anirudh-ledger-v4.xlsx

window.LEDGER_DATA_PROMISE = (async function () {
  const xlsxUrl = "data/anirudh-ledger-v4.xlsx";

  function normalizeKey(key) {
    return String(key || "").trim().toLowerCase();
  }

  function sheetToArray(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }

  function parseKeyValueRows(rows) {
    const result = {};
    for (const row of rows) {
      const keys = Object.keys(row);
      if (!keys.length) continue;
      const keyCell = row[keys[0]];
      const valueCell = row[keys[1]];
      if (!keyCell) continue;
      result[String(keyCell).trim()] = Number(valueCell) || String(valueCell).trim();
    }
    return result;
  }

  function parseTags(value) {
    const tags = Array.isArray(value)
      ? value.map((tag) => String(tag || "").trim())
      : String(value || "").split(/[,;]+/).map((tag) => tag.trim());
    return [...new Set(tags.filter(Boolean))];
  }

  function parseDateParts(entry) {
    const date = String(entry.date || "").trim();
    const match = date.match(/^(?:~\s*)?(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);
    if (!match) return entry;

    const year = Number(match[1]);
    const month = Number(match[2] || 1);
    const day = Number(match[3] || 1);

    return {
      ...entry,
      year: entry.year || year,
      month: entry.month || month,
      day: entry.day || day,
    };
  }

  function formatWeekKey(entry) {
    const year = Number(entry.year);
    const month = Number(entry.month) || 1;
    const day = Number(entry.day) || 1;
    if (!year) return undefined;

    const date = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);
    const weekYear = date.getUTCFullYear();
    const weekNumber = Math.ceil((((date - new Date(Date.UTC(weekYear, 0, 1))) / 86400000) + 1) / 7);
    return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
  }

  function mapEntryFields(rawEntry) {
    const fieldMap = {
      id: "id",
      year: "year",
      month: "month",
      quarter: "quarter",
      date: "date",
      era: "era",
      "era name": "eraName",
      "activity type": "activityType",
      title: "title",
      role: "role",
      "org/client": "org",
      "org client": "org",
      org: "org",
      location: "location",
      description: "description",
      "evidence source": "evidenceSource",
      "evidence detail": "evidenceDetail",
      "earnings amount": "earningsAmount",
      currency: "currency",
      "identity tag": "identityTag",
      status: "status",
      "role tags": "roleTags",
      notes: "notes",
      tags: "tags",
      weekkey: "weekKey",
      "week key": "weekKey",
    };

    const entry = {};
    for (const [rawKey, rawValue] of Object.entries(rawEntry)) {
      const normalizedKey = normalizeKey(rawKey);
      const mappedKey = fieldMap[normalizedKey] || normalizedKey.replace(/[^a-z0-9]/g, "");
      if (!mappedKey) continue;

      let value = rawValue;
      if (mappedKey === "year" || mappedKey === "month" || mappedKey === "day" || mappedKey === "quarter") {
        value = Number(rawValue) || undefined;
      } else if (mappedKey === "earningsAmount") {
        const numeric = Number(rawValue);
        value = Number.isFinite(numeric) ? numeric : String(rawValue || "").trim();
      } else {
        value = String(rawValue || "").trim();
      }

      entry[mappedKey] = value;
    }

    if (!entry.era && entry.eraName) {
      entry.era = entry.eraName;
    }

    entry.tags = parseTags(entry.tags || entry.roleTags);
    entry.roleTags = parseTags(entry.roleTags || entry.tags);

    const parsedDateEntry = parseDateParts(entry);
    entry.year = parsedDateEntry.year || entry.year;
    entry.month = parsedDateEntry.month || entry.month;
    entry.day = parsedDateEntry.day || entry.day;

    if (!entry.weekKey) {
      entry.weekKey = formatWeekKey(entry);
    }

    if (entry.id !== undefined && entry.id !== null) {
      const idNumber = Number(entry.id);
      entry.id = Number.isFinite(idNumber) && String(entry.id).trim() !== "" ? idNumber : String(entry.id);
    }

    return entry;
  }

  function buildTagSummary(entries) {
    const counts = {};
    for (const entry of entries) {
      const entryTags = Array.from(new Set([...(entry.tags || []), ...(entry.roleTags || [])]));
      for (const tag of entryTags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }

  function parseWorkbook(workbook) {
    const data = {};
    const sheetNames = workbook.SheetNames || [];

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = sheetToArray(sheet);
      const lower = normalizeKey(sheetName);

      if (!rows.length) continue;

      if (lower.includes("master") || lower.includes("entry")) {
        data.entries = rows;
      } else if (lower.includes("weekly") || lower.includes("email")) {
        data.weeklyEmailCounts = parseKeyValueRows(rows);
      } else if (lower.includes("tag")) {
        data.tags = rows;
      } else if (lower.includes("role")) {
        data.roles = rows;
      } else if (lower.includes("first")) {
        data.firsts = rows;
      } else if (lower.includes("person") || lower.includes("people")) {
        data.people = rows;
      } else if (lower.includes("film")) {
        data.films = rows;
      } else if (lower.includes("earning")) {
        data.earnings = rows;
      } else if (lower.includes("meta") || lower.includes("config") || lower.includes("info")) {
        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.length >= 2) {
            data[String(row[keys[0]]).trim()] = row[keys[1]];
          }
        }
      } else if (!data.entries && sheetNames.length === 1) {
        data.entries = rows;
      }
    }

    if (!data.entries && sheetNames.length) {
      const masterName = sheetNames.find((sheetName) => normalizeKey(sheetName).includes("master"));
      const sheet = workbook.Sheets[masterName || sheetNames[0]];
      data.entries = sheetToArray(sheet);
    }

    if (Array.isArray(data.entries)) {
      data.entries = data.entries.map(mapEntryFields);
    }

    if ((!data.tags || !data.tags.length) && Array.isArray(data.entries)) {
      data.tags = buildTagSummary(data.entries);
    }

    if (!data.yearStart || !data.yearEnd) {
      const years = (data.entries || []).map((entry) => Number(entry.year)).filter(Boolean);
      if (years.length) {
        data.yearStart = Math.min(...years);
        data.yearEnd = Math.max(...years);
      }
    }

    return data;
  }

  async function loadFallbackData() {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "data/ledger-data-static.js";
      script.onload = () => resolve(window.LEDGER_DATA || {});
      script.onerror = () => resolve(window.LEDGER_DATA || {});
      document.head.appendChild(script);
    });
  }

  async function ensureXlsxLibrary() {
    if (window.XLSX) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  try {
    const response = await fetch(xlsxUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Workbook fetch failed: ${response.status}`);
    await ensureXlsxLibrary();
    const arrayBuffer = await response.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
    const data = parseWorkbook(workbook);
    data.generatedAt = new Date().toISOString();
    data.sourceWorkbook = xlsxUrl;
    window.LEDGER_DATA = data;
    if (window.ARCHIVE_APP_DEBUG) {
      console.log("Loaded ledger workbook:", {
        source: data.sourceWorkbook,
        entries: (data.entries || []).length,
        yearStart: data.yearStart,
        yearEnd: data.yearEnd,
        tagCount: (data.tags || []).length,
      });
    }
    return data;
  } catch (error) {
    console.warn("Failed to load ledger workbook, falling back to static data.", error);
    return loadFallbackData();
  }
})();
