// Enrich gallery.json with capture time → day/night, time-of-day, real date,
// a derived title, and a grounded story. MERGES into the existing gallery.json
// (preserving the optimized src/thumb webp paths). Reads EXIF timestamps from
// the raw originals in public/proof/Gallery/ (recursive).
//
// Titles are derived from capture time + date (the images aren't human-named);
// every value here comes from EXIF — nothing invented. Edit gallery.json by
// hand afterward to give any photo a bespoke title/story.
//
// Run: node scripts/enrich-gallery.mjs
import exifr from "exifr";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, parse, extname } from "node:path";

const RAW_DIR = "public/proof/Gallery";
const LEDGER = "data/gallery.json";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const IMG_RE = /\.(jpe?g|png|tiff?)$/i;

// Recursively collect raw files, map by lowercased basename
const rawById = {};
function collectRaw(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { collectRaw(full); }
    else if (entry.isFile() && IMG_RE.test(entry.name)) {
      rawById[parse(entry.name).name.toLowerCase()] = full;
    }
  }
}
collectRaw(RAW_DIR);

function timeOfDay(h) {
  if (h >= 5 && h < 7) return "Dawn";
  if (h >= 7 && h < 11) return "Morning";
  if (h >= 11 && h < 15) return "Midday";
  if (h >= 15 && h < 17) return "Afternoon";
  if (h >= 17 && h < 19) return "Golden Hour";
  if (h >= 19 && h < 21) return "Dusk";
  return "Night";
}

const data = JSON.parse(readFileSync(LEDGER, "utf8"));
let enriched = 0, noExif = 0;

for (const item of data) {
  const key = parse(item.src || item.thumb || "").name.toLowerCase();
  const raw = rawById[key] || rawById[String(item.id).toLowerCase()];
  let h = null, y = item.year, mo = null, d = null;
  if (raw) {
    try {
      const ex = await exifr.parse(raw, { pick: ["DateTimeOriginal", "CreateDate"], reviveValues: false }) || {};
      const dt = ex.DateTimeOriginal || ex.CreateDate;
      const m = dt && String(dt).match(/(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):/);
      if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; h = +m[4]; }
    } catch (_) {}
  }
  if (h == null) { noExif++; }
  const tod = h == null ? "Untimed" : timeOfDay(h);
  const dayNight = h == null ? "Unknown" : (h >= 6 && h < 19 ? "Day" : "Night");
  const dateLabel = (mo && d) ? `${d} ${MONTHS[mo - 1]} ${y}` : String(y);
  const dateFull = (mo && d) ? `${d} ${MONTHS_FULL[mo - 1]} ${y}` : String(y);

  item.year = y;
  item.timeOfDay = tod;
  item.dayNight = dayNight;
  item.date = (mo && d) ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : String(y);
  item.title = (tod === "Untimed") ? `Frame, ${y}` : `${tod}, ${dateLabel}`;

  const cam = item.camera && item.camera !== "Unknown Camera" ? item.camera : null;
  const lens = item.lens && item.lens !== "Unknown Lens" ? item.lens : null;
  const geo = item.coordinates && item.coordinates !== "N/A" ? item.coordinates : null;
  item.story = [
    (tod === "Untimed" ? "An archival frame" : `A ${dayNight.toLowerCase()} frame, ${tod.toLowerCase()}`) + `, from ${dateFull}.`,
    cam ? `Shot on the ${cam}${lens ? ` with a ${lens}` : ""}.` : "",
    geo ? `Geotagged at ${geo}.` : "",
  ].filter(Boolean).join(" ");
  enriched++;
}

writeFileSync(LEDGER, JSON.stringify(data, null, 2));
console.log(`Enriched ${enriched} items (${noExif} without EXIF time).`);
const dn = {}; const tod = {};
for (const it of data) { dn[it.dayNight] = (dn[it.dayNight] || 0) + 1; tod[it.timeOfDay] = (tod[it.timeOfDay] || 0) + 1; }
console.log("day/night:", JSON.stringify(dn));
console.log("time-of-day:", JSON.stringify(tod));
console.log("sample:", JSON.stringify({ id: data[0].id, title: data[0].title, dayNight: data[0].dayNight, date: data[0].date, story: data[0].story, src: data[0].src, thumb: data[0].thumb }, null, 1));
