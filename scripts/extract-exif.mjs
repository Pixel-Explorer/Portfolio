// EXIF extractor — recursive subfolder edition.
//
// Recursively walks public/proof/Gallery/** for JPEG/PNG images, extracts
// EXIF metadata, and writes gallery.json. Location = EXIF GPS else subfolder
// name else "Unknown". Adds a "collection" field for the subfolder name.
//
// Usage: node scripts/extract-exif.mjs
//
import fs from 'fs';
import path from 'path';
import exifr from 'exifr';

const GALLERY_DIR = './public/proof/Gallery';
const OUTPUT_FILE = './data/gallery.json';

function decimalToDMS(deg, latOrLon) {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
  let direction = "";
  if (latOrLon === "lat") direction = deg >= 0 ? "N" : "S";
  else direction = deg >= 0 ? "E" : "W";
  return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
}

// Recursive file collection
function collectFiles(dir, subfolder = "") {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = subfolder ? path.join(subfolder, entry.name) : entry.name;
      results.push(...collectFiles(full, sub));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        results.push({ full, subfolder, name: entry.name });
      }
    }
  }
  return results;
}

async function run() {
  console.log(`Scanning directory: ${GALLERY_DIR}`);
  if (!fs.existsSync(GALLERY_DIR)) {
    console.error(`Error: Directory ${GALLERY_DIR} does not exist`);
    process.exit(1);
  }

  const files = collectFiles(GALLERY_DIR);
  console.log(`Found ${files.length} images across subfolders. Extracting EXIF...`);

  // Load existing gallery.json to preserve curated fields (titles, stories)
  const existing = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    const oldData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
    for (const item of oldData) {
      // Match by basename (lowercased, no ext)
      const key = path.parse(item.src || item.thumb || "").name.toLowerCase();
      existing[key] = item;
    }
    console.log(`Loaded ${oldData.length} existing entries to preserve curated data.`);
  }

  const galleryItems = [];
  let count = 0;

  for (const { full, subfolder, name } of files) {
    const filePath = full;
    count++;
    if (count % 30 === 0 || count === files.length) {
      console.log(`Processing: ${count}/${files.length}`);
    }

    const baseName = path.parse(name).name;
    const id = baseName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const subfolderName = subfolder || "";
    const locationFallback = subfolderName || "Unknown";

    // Check if we have an existing curated entry
    const existingEntry = existing[id];
    if (existingEntry) {
      // Preserve curated fields, but update location if it was "Unknown" or "Unknown Location"
      let location = existingEntry.location;
      if (!location || location === "Unknown" || location === "Unknown Location") {
        location = locationFallback;
      }
      galleryItems.push({
        ...existingEntry,
        location: location,
        collection: subfolderName || existingEntry.collection || "",
        src: existingEntry.src || `public/proof/Gallery/${subfolderName}/${name}`.replace(/\/\//g, "/"),
        thumb: existingEntry.thumb || "",
      });
      continue;
    }

    try {
      const data = fs.readFileSync(filePath);
      const exif = await exifr.parse(data, {
        gps: true, xmp: true, iptc: true, exif: true, tiff: true
      }) || {};

      const cameraBrand = exif.Make || "";
      const cameraModel = exif.Model || "";
      const fullCameraName = cameraModel.startsWith(cameraBrand) ? cameraModel : `${cameraBrand} ${cameraModel}`.trim();
      const lensModel = exif.LensModel || exif.Lens || "";
      const fNumber = exif.FNumber ? `f/${exif.FNumber}` : "";
      let shutterSpeed = "";
      if (exif.ExposureTime) {
        shutterSpeed = exif.ExposureTime < 1 ? `1/${Math.round(1 / exif.ExposureTime)}s` : `${exif.ExposureTime}s`;
      }
      const iso = exif.ISO ? `ISO ${exif.ISO}` : "";
      const exposureString = [fNumber, shutterSpeed, iso].filter(Boolean).join(" · ");

      let gpsCoords = "", lat = null, lon = null;
      if (exif.latitude !== undefined && exif.longitude !== undefined) {
        lat = Number(exif.latitude);
        lon = Number(exif.longitude);
        gpsCoords = `${decimalToDMS(lat, "lat")}, ${decimalToDMS(lon, "lon")}`;
      }

      let imageDate = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || null;
      let year = 2024;
      if (imageDate) {
        const d = new Date(imageDate);
        if (!isNaN(d.getTime())) year = d.getFullYear();
      }

      // Location = EXIF GPS else subfolder name else "Unknown"
      let location = "Unknown";
      if (gpsCoords) location = "Geotagged Location";
      else if (subfolderName) location = subfolderName;
      else location = "Unknown";

      galleryItems.push({
        id: id,
        src: `public/proof/Gallery/${subfolderName}/${name}`.replace(/\/+/g, "/"),
        title: baseName,
        location: location,
        coordinates: gpsCoords || "N/A",
        lat: lat,
        lon: lon,
        year: year,
        genre: "Photography",
        camera: fullCameraName || "Unknown Camera",
        lens: lensModel || "Unknown Lens",
        exif: exposureString || "EXIF unavailable",
        story: `Original frame ${name}. Captured in ${year}${fullCameraName ? ` using ${fullCameraName}` : ""}.`,
        collection: subfolderName || "",
        timeOfDay: "",
        dayNight: "",
        date: "",
        thumb: "",
      });
    } catch (err) {
      console.error(`Failed EXIF for ${name} (${subfolderName}): ${err.message}`);
      galleryItems.push({
        id: id,
        src: `public/proof/Gallery/${subfolderName}/${name}`.replace(/\/+/g, "/"),
        title: baseName,
        location: subfolderName || "Archived Frame",
        coordinates: "N/A",
        year: 2024,
        genre: "Photography",
        camera: "Unknown Camera",
        lens: "Unknown Lens",
        exif: "EXIF unavailable",
        story: `Original archival frame ${name}.`,
        collection: subfolderName || "",
        timeOfDay: "",
        dayNight: "",
        date: "",
        thumb: "",
      });
    }
  }

  console.log(`Writing ${galleryItems.length} items to ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(galleryItems, null, 2));
  console.log("Done!");
}

run().catch(console.error);
