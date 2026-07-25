import { createServer } from "node:http";
import {
  createReadStream, statSync,
  readFileSync, writeFileSync, mkdirSync, existsSync,
} from "node:fs";
import { extname, join, normalize, resolve, basename } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 3000);
const ledgerPath = resolve(root, "data/ledger.json");
const caseStudiesPath = resolve(root, "data/case-studies.json");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".fbx": "application/octet-stream",
};

// ─── helpers ──────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return resolveBody({});
      try {
        resolveBody(JSON.parse(buf.toString("utf8")));
      } catch (e) {
        rejectBody(e);
      }
    });
    req.on("error", rejectBody);
  });
}

function readRawBody(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) {
        rejectBody(new Error(`Upload too large (>${maxBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

function loadLedger() {
  if (!existsSync(ledgerPath)) {
    throw new Error(`ledger.json missing at ${ledgerPath} — run scripts/xlsx-to-json.mjs first`);
  }
  return JSON.parse(readFileSync(ledgerPath, "utf8"));
}

function saveLedger(data) {
  data.savedAt = new Date().toISOString();
  writeFileSync(ledgerPath, JSON.stringify(data, null, 2), "utf8");
}

function loadCaseStudies() {
  if (!existsSync(caseStudiesPath)) {
    return { caseStudies: [] };
  }
  return JSON.parse(readFileSync(caseStudiesPath, "utf8"));
}

function saveCaseStudies(data) {
  if (existsSync(caseStudiesPath)) {
    writeFileSync(caseStudiesPath + ".bak", readFileSync(caseStudiesPath, "utf8"), "utf8");
  }
  writeFileSync(caseStudiesPath, JSON.stringify(data, null, 2), "utf8");
}

function sanitizeFilename(name) {
  // Strip path separators + risky chars; preserve extension and basic chars.
  return basename(String(name || "upload"))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120) || "upload";
}

// Rebuild the tag summary the way the loader does (counts unique tags
// across every entry's tags + roleTags arrays).
function rebuildTagSummary(entries) {
  const counts = {};
  for (const e of entries) {
    const seen = new Set([...(e.tags || []), ...(e.roleTags || [])]);
    for (const t of seen) counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

// ─── routes ───────────────────────────────────────────────────────

async function handleApi(req, res, url) {
  const p = url.pathname; // e.g. /api/entries/42
  const method = req.method || "GET";

  try {
    if (p === "/api/ledger" && method === "GET") {
      const data = loadLedger();
      return sendJson(res, 200, data);
    }

    // POST /api/entries — create a new entry. Body = any subset of fields;
    // server assigns next-available numeric id and fills sensible defaults.
    if (p === "/api/entries" && method === "POST") {
      const body = await readJsonBody(req);
      const data = loadLedger();
      data.entries = data.entries || [];
      const existingIds = data.entries
        .map((e) => Number(e.id))
        .filter((n) => Number.isFinite(n));
      const nextId = (existingIds.length ? Math.max(...existingIds) : 0) + 1;
      const now = new Date();
      const entry = {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        title: "New moment",
        role: "",
        org: "",
        location: "",
        description: "",
        notes: "",
        era: "",
        eraName: "",
        activityType: "",
        evidenceSource: "",
        evidenceDetail: "",
        earningsAmount: 0,
        currency: "",
        identityTag: "",
        status: "Draft",
        tags: [],
        roleTags: [],
        evidence: [],
        ...body,
        id: nextId, // never let caller override id
      };
      // Re-derive weekKey from the (possibly client-provided) date.
      if (!entry.weekKey && entry.year && entry.month && entry.day) {
        const d = new Date(Date.UTC(entry.year, entry.month - 1, entry.day));
        const dow = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dow);
        const wY = d.getUTCFullYear();
        const wN = Math.ceil((((d - new Date(Date.UTC(wY, 0, 1))) / 86400000) + 1) / 7);
        entry.weekKey = `${wY}-W${String(wN).padStart(2, "0")}`;
      }
      data.entries.push(entry);
      data.tags = rebuildTagSummary(data.entries);
      // Re-derive year range if the new entry pushes it out
      const years = data.entries.map((e) => Number(e.year)).filter(Boolean);
      if (years.length) {
        data.yearStart = Math.min(...years);
        data.yearEnd = Math.max(...years);
      }
      saveLedger(data);
      return sendJson(res, 201, { ok: true, entry });
    }

    // DELETE /api/entries/:id — remove an entry permanently.
    // PUT /api/entries/:id — full or partial update of one entry.
    // Body must be an object representing the modified fields (server merges
    // it onto the existing entry; unknown fields are preserved).
    const entryMatch = p.match(/^\/api\/entries\/(.+)$/);
    if (entryMatch && method === "DELETE") {
      const id = decodeURIComponent(entryMatch[1]);
      const data = loadLedger();
      const before = (data.entries || []).length;
      data.entries = (data.entries || []).filter((e) => String(e.id) !== String(id));
      if (data.entries.length === before) {
        return sendJson(res, 404, { error: "entry not found", id });
      }
      data.tags = rebuildTagSummary(data.entries);
      saveLedger(data);
      return sendJson(res, 200, { ok: true, removed: id });
    }
    if (entryMatch && method === "PUT") {
      const id = decodeURIComponent(entryMatch[1]);
      const body = await readJsonBody(req);
      const data = loadLedger();
      const idx = (data.entries || []).findIndex(
        (e) => String(e.id) === String(id),
      );
      if (idx < 0) return sendJson(res, 404, { error: "entry not found", id });
      const next = { ...data.entries[idx], ...body, id: data.entries[idx].id };
      // Always keep evidence array shape, never let a client wipe it accidentally
      // by omitting the field (only update it if explicitly provided).
      if (body.evidence === undefined) next.evidence = data.entries[idx].evidence || [];
      // Re-derive tag summary (entry-level tag changes propagate to the cloud).
      data.entries[idx] = next;
      data.tags = rebuildTagSummary(data.entries);
      saveLedger(data);
      return sendJson(res, 200, { ok: true, entry: next });
    }

    // POST /api/upload-model?entryId=42[&textureSize=2048]
    // Body: raw GLB binary (Stager export). Auto-optimizes — downsizes 4K
    // textures, meshopt-compresses geometry — then saves the lean result to
    // public/models/<entryId>/model.glb. Real materials + logo decals survive.
    // Falls back to saving the raw bytes if optimization throws.
    if (p === "/api/upload-model" && method === "POST") {
      const entryId = sanitizeFilename(url.searchParams.get("entryId") || "misc");
      const dir = resolve(root, "public/models", entryId);
      mkdirSync(dir, { recursive: true });
      const raw = await readRawBody(req, 1536 * 1024 * 1024); // up to 1.5 GB raw
      const dest = join(dir, "model.glb");
      const publicUrl = `public/models/${entryId}/model.glb`;
      const textureSize = Number(url.searchParams.get("textureSize")) || 2048;

      try {
        const { optimizeGlb } = await import("./optimize-glb.mjs");
        const { after } = await optimizeGlb(raw, dest, { textureSize });
        console.log(`[upload-model] entry ${entryId}: ${(raw.length / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB`);
        return sendJson(res, 200, { ok: true, url: publicUrl, rawBytes: raw.length, bytes: after, optimized: true });
      } catch (err) {
        console.error("[upload-model] optimization failed, saving raw:", err);
        writeFileSync(dest, raw);
        return sendJson(res, 200, { ok: true, url: publicUrl, rawBytes: raw.length, bytes: raw.length, optimized: false, warning: String(err?.message || err) });
      }
    }

    // POST /api/upload?entryId=42&filename=poster.jpg
    // Body: raw binary file. Saves to public/proof/<entryId>/<filename>.
    // Returns { url } — the relative URL the client should store in evidence[].
    if (p === "/api/upload" && method === "POST") {
      const entryId = sanitizeFilename(url.searchParams.get("entryId") || "misc");
      const filename = sanitizeFilename(url.searchParams.get("filename") || "upload");
      const dir = resolve(root, "public/proof", entryId);
      mkdirSync(dir, { recursive: true });

      // If filename already exists, append a timestamp to avoid overwriting.
      let finalName = filename;
      if (existsSync(join(dir, finalName))) {
        const dot = filename.lastIndexOf(".");
        const stem = dot > 0 ? filename.slice(0, dot) : filename;
        const ext = dot > 0 ? filename.slice(dot) : "";
        finalName = `${stem}-${Date.now()}${ext}`;
      }

      const buf = await readRawBody(req);
      writeFileSync(join(dir, finalName), buf);
      const publicUrl = `public/proof/${entryId}/${finalName}`;
      return sendJson(res, 200, { ok: true, url: publicUrl, bytes: buf.length });
    }

    // GET /api/case-studies
    if (p === "/api/case-studies" && method === "GET") {
      const csData = loadCaseStudies();
      return sendJson(res, 200, csData);
    }

    // POST /api/case-studies
    if (p === "/api/case-studies" && method === "POST") {
      const body = await readJsonBody(req);
      const data = loadCaseStudies();
      data.caseStudies = data.caseStudies || [];
      const newCS = {
        id: body.id || `case-study-${Date.now()}`,
        title: body.title || "New Case Study",
        role: body.role || "",
        years: body.years || "",
        accentColor: body.accentColor || "#FF007F",
        status: body.status || "DRAFT",
        glyph: body.glyph || "📁",
        heroMedia: body.heroMedia || { type: "image", src: "" },
        stats: body.stats || [],
        pipeline: body.pipeline || { description: "", steps: [] },
        evidence: body.evidence || [],
        milestones: body.milestones || [],
        outcomes: body.outcomes || { metrics: [], retrospective: "", status: "" },
        chartData: body.chartData || null,
        ...body
      };
      data.caseStudies.push(newCS);
      saveCaseStudies(data);
      return sendJson(res, 201, { ok: true, caseStudy: newCS });
    }

    // PUT /api/case-studies/:id
    // DELETE /api/case-studies/:id
    const csMatch = p.match(/^\/api\/case-studies\/(.+)$/);
    if (csMatch) {
      const id = decodeURIComponent(csMatch[1]);
      const data = loadCaseStudies();
      data.caseStudies = data.caseStudies || [];
      const idx = data.caseStudies.findIndex((cs) => String(cs.id) === String(id));

      if (method === "PUT") {
        if (idx < 0) {
          return sendJson(res, 404, { error: "case study not found", id });
        }
        const body = await readJsonBody(req);
        const updated = {
          ...data.caseStudies[idx],
          ...body,
          id: data.caseStudies[idx].id // protect id
        };
        data.caseStudies[idx] = updated;
        saveCaseStudies(data);
        return sendJson(res, 200, { ok: true, caseStudy: updated });
      }

      if (method === "DELETE") {
        if (idx < 0) {
          return sendJson(res, 404, { error: "case study not found", id });
        }
        const removed = data.caseStudies[idx].id;
        data.caseStudies = data.caseStudies.filter((cs) => String(cs.id) !== String(id));
        saveCaseStudies(data);
        return sendJson(res, 200, { ok: true, removed });
      }
    }

    return sendJson(res, 404, { error: "unknown api route", path: p });
  } catch (err) {
    console.error("API error:", err);
    return sendJson(res, 500, { error: String(err.message || err) });
  }
}

// ─── server ───────────────────────────────────────────────────────

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

  if (url.pathname.startsWith("/api/")) {
    return handleApi(request, response, url);
  }

  const pathname = decodeURIComponent(url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(join(root, safePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    let stats = statSync(filePath);
    if (stats.isDirectory()) {
      filePath = join(filePath, "index.html");
      stats = statSync(filePath);
    }
    const ext = extname(filePath);
    response.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Content-Length": stats.size,
      // Dev server: never cache anything, so a reload always serves fresh code
      // (the SPA keeps app.js in memory across in-app nav; only a reload refetches).
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
  console.log(`API:`);
  console.log(`  GET  /api/ledger           → current data/ledger.json`);
  console.log(`  PUT  /api/entries/:id      → partial update, body = JSON`);
  console.log(`  POST /api/upload?entryId=N&filename=foo.jpg → raw binary body`);
});
