// Proof hosting without Vercel Blob.
//
// The Blob store (th4xikrqb3qoxcmi) answers every public read with
// "403 Your store is blocked" (checked 19 Oct 2026), so proof is served by the
// site itself instead, from public/proof-web/ (committed, deployed with the
// site). Sources are the full-size originals in public/proof/ (gitignored,
// local only) and the pre-encoded videos in bin/blob-opt/.
//
//   images  → 1600px WebP
//   videos  → as-is when ≤5 MB, else H.264 1280px CRF 28 (ffmpeg-static)
//   PDFs    → every page as a 1600px WebP (headless Chromium + pdf.js);
//             PDFs ≤5 MB are also kept as a downloadable file
//
//   node scripts/proof-hosting.mjs           build missing copies + rewrite data
//   node scripts/proof-hosting.mjs --check   report what still points at Blob
//
// truth-audit-2026-10.mjs calls rewriteAll() before it writes, so a re-run of
// the audit keeps the self-hosted URLs.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => resolve(root, ...p);

const BLOB = /^https:\/\/th4xikrqb3qoxcmi\.public\.blob\.vercel-storage\.com\/proof\/(.+)$/;
const IMAGE = /\.(webp|png|jpe?g)$/i;
const VIDEO = /\.(mp4|mov)$/i;
const PDF = /\.pdf$/i;
const MB = 1048576;
const MANIFEST = P("public/proof-web/pdf-pages.json");

// Originals that don't sit under public/proof/ at their Blob path.
const SOURCE_OVERRIDE = {
  "100/rabble-tongue.png": "D:/Portfolio/tonguethingy final.png",
};

// Blob items dropped outright because the same video is already linked from
// its official YouTube upload on the same entry.
const DROP = new Set([
  "126/The_Gir_Adventure_Gujarat_Tourism_ToT_Media_HD.mp4", // = youtu.be/LXdO68EPp4Q (ToT Media) on #126
]);

const safe = (seg) => seg.replace(/[^A-Za-z0-9._-]+/g, "-");
const webRel = (rel, ext) => "public/proof-web/" + rel.split("/").map(safe).join("/").replace(/\.[^.]+$/, ext);
const blobRel = (src) => { const m = String(src || "").match(BLOB); return m ? decodeURIComponent(m[1]) : null; };

function videoSource(rel) {
  for (const c of [P("bin/blob-opt", rel), P("public/proof", rel), P("public/proof", rel).replace(/\.mp4$/i, ".MOV")]) {
    if (existsSync(c)) return c;
  }
  return null;
}

const readManifest = () => (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {});

// One evidence item → the self-hosted item(s) that replace it, or [item].
function rewriteItem(v, manifest) {
  const rel = blobRel(v && v.src);
  if (!rel) return [v];
  if (DROP.has(rel)) return [];
  if (IMAGE.test(rel)) {
    const url = webRel(rel, ".webp");
    return existsSync(P(url)) ? [{ ...v, type: "image", src: url }] : [v];
  }
  if (VIDEO.test(rel)) {
    const url = webRel(rel, ".mp4");
    return existsSync(P(url)) ? [{ ...v, type: "video", src: url, caption: v.caption && /upload pending/i.test(v.caption) ? "" : v.caption }] : [v];
  }
  if (PDF.test(rel)) {
    const m = manifest[rel];
    if (!m) return [v];
    const name = v.caption || basename(rel, ".pdf").replace(/[_-]+/g, " ");
    const out = m.pdf ? [{ ...v, type: "pdf", src: m.pdf, caption: `${name} (PDF)` }] : [];
    m.pages.forEach((src, i) => out.push({ type: "image", src, caption: `${name.replace(/ \(PDF\)$/, "")}, page ${i + 1} of ${m.pages.length}` }));
    return out;
  }
  return [v];
}

export function rewriteList(list) {
  const manifest = readManifest();
  const out = (list || []).flatMap((v) => rewriteItem(v, manifest));
  const seen = new Set();
  return out.filter((v) => (seen.has(v.src) ? false : seen.add(v.src)));
}

// Rewrite every evidence list in the public ledger and the case studies.
export function rewriteAll(ledger, cs) {
  for (const e of ledger.entries) e.evidence = rewriteList(e.evidence);
  for (const c of cs.caseStudies) {
    c.evidence = rewriteList(c.evidence);
    if (c.heroMedia) c.heroMedia = rewriteList([c.heroMedia])[0];
  }
}

function blobItems(ledger, cs) {
  return [
    ...ledger.entries.flatMap((e) => e.evidence || []),
    ...cs.caseStudies.flatMap((c) => [...(c.evidence || []), ...(c.heroMedia ? [c.heroMedia] : [])]),
  ].filter((v) => blobRel(v && v.src));
}

async function buildImages(rels) {
  const sharp = (await import("sharp")).default;
  const missing = [];
  for (const rel of rels) {
    const out = P(webRel(rel, ".webp"));
    const src = SOURCE_OVERRIDE[rel] || P("public/proof", rel);
    if (existsSync(out)) continue;
    if (!existsSync(src)) { missing.push(rel); continue; }
    mkdirSync(dirname(out), { recursive: true });
    await sharp(src).rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 }).toFile(out);
  }
  return missing;
}

async function buildVideos(rels) {
  const ffmpeg = (await import("ffmpeg-static")).default;
  const missing = [];
  for (const rel of rels) {
    const out = P(webRel(rel, ".mp4"));
    if (existsSync(out)) continue;
    const src = videoSource(rel);
    if (!src) { missing.push(rel); continue; }
    mkdirSync(dirname(out), { recursive: true });
    if (statSync(src).size <= 5 * MB && /\.mp4$/i.test(src)) { copyFileSync(src, out); continue; }
    // Long ads (>15 MB source) go to 960px / CRF 30; they are proof, not a showreel.
    const big = statSync(src).size > 15 * MB;
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", src,
      "-vf", `scale='min(${big ? 960 : 1280},iw)':-2`, "-c:v", "libx264", "-preset", "slow", "-crf", big ? "30" : "28",
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out]);
  }
  return missing;
}

async function buildPdfs(rels) {
  const manifest = readManifest();
  const todo = rels.filter((rel) => !manifest[rel]);
  if (!todo.length) return [];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("https://pdf.local/**", (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    route.fulfill({ body: readFileSync(P("public/proof", rel)), contentType: "application/pdf" });
  });
  await page.goto("about:blank");
  const missing = [];
  for (const rel of todo) {
    const src = P("public/proof", rel);
    if (!existsSync(src)) { missing.push(rel); continue; }
    const pages = await page.evaluate(async (url) => {
      const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument(url).promise;
      const out = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        const v0 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: 1600 / Math.max(v0.width, v0.height) });
        const c = document.createElement("canvas");
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        out.push(c.toDataURL("image/webp", 0.82).split(",")[1]);
      }
      return out;
    }, "https://pdf.local/" + encodeURIComponent(rel));
    const base = webRel(rel, "");
    mkdirSync(P(dirname(base)), { recursive: true });
    const urls = pages.map((b64, i) => {
      const url = `${base}-p${String(i + 1).padStart(2, "0")}.webp`;
      writeFileSync(P(url), Buffer.from(b64, "base64"));
      return url;
    });
    let pdf = null;
    if (statSync(src).size <= 5 * MB) { pdf = webRel(rel, ".pdf"); copyFileSync(src, P(pdf)); }
    manifest[rel] = { pages: urls, pdf };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  }
  await browser.close();
  return missing;
}

async function build() {
  const ledger = JSON.parse(readFileSync(P("data/ledger.json"), "utf8"));
  const cs = JSON.parse(readFileSync(P("data/case-studies.json"), "utf8"));
  const rels = [...new Set(blobItems(ledger, cs).map((v) => blobRel(v.src)))].filter((r) => !DROP.has(r));

  const missing = [
    ...(await buildImages(rels.filter((r) => IMAGE.test(r)))),
    ...(await buildVideos(rels.filter((r) => VIDEO.test(r)))),
    ...(await buildPdfs(rels.filter((r) => PDF.test(r)))),
  ];

  rewriteAll(ledger, cs);
  const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
  writeFileSync(P("data/ledger.json"), crlf(JSON.stringify(ledger, null, 2)));
  writeFileSync(P("data/case-studies.json"), crlf(JSON.stringify(cs, null, 2)) + "\r\n");
  writeFileSync(P("data/ledger-data-static.js"), `window.LEDGER_DATA = ${JSON.stringify(ledger)};\n`);

  if (missing.length) console.log(`no local source for: ${missing.join(", ")}`);
  report(ledger, cs);
}

function report(ledger, cs) {
  const left = blobItems(ledger, cs);
  console.log(left.length ? `still on Blob: ${left.length}\n  ${left.map((v) => blobRel(v.src)).join("\n  ")}` : "nothing points at Blob any more");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--check")) {
    report(JSON.parse(readFileSync(P("data/ledger.json"), "utf8")), JSON.parse(readFileSync(P("data/case-studies.json"), "utf8")));
  } else {
    await build();
  }
}
