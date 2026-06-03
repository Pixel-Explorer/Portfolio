import fs from 'fs';
import path from 'path';
import exifr from 'exifr';

const GALLERY_DIR = './public/proof/Gallery';
const OUTPUT_FILE = './data/gallery.json';

// Simple function to format GPS coordinates to DMS format
function decimalToDMS(deg, latOrLon) {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
  
  let direction = "";
  if (latOrLon === "lat") {
    direction = deg >= 0 ? "N" : "S";
  } else {
    direction = deg >= 0 ? "E" : "W";
  }
  
  return `${degrees}° ${minutes}' ${seconds}\" ${direction}`;
}

async function run() {
  console.log(`Scanning directory: ${GALLERY_DIR}`);
  if (!fs.existsSync(GALLERY_DIR)) {
    console.error(`Error: Directory ${GALLERY_DIR} does not exist`);
    process.exit(1);
  }

  const files = fs.readdirSync(GALLERY_DIR).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.jpg' || ext === '.jpeg';
  });

  console.log(`Found ${files.length} images. Extracting EXIF...`);
  
  const galleryItems = [];
  let count = 0;

  for (const file of files) {
    const filePath = path.join(GALLERY_DIR, file);
    count++;
    
    if (count % 20 === 0 || count === files.length) {
      console.log(`Processing progress: ${count}/${files.length}`);
    }

    try {
      const data = fs.readFileSync(filePath);
      
      // Parse EXIF details using exifr (including GPS coordinates)
      const exif = await exifr.parse(data, {
        gps: true,
        xmp: true,
        iptc: true,
        exif: true,
        tiff: true
      }) || {};

      // Structure EXIF variables
      const cameraBrand = exif.Make || "";
      const cameraModel = exif.Model || "";
      const fullCameraName = cameraModel.startsWith(cameraBrand) ? cameraModel : `${cameraBrand} ${cameraModel}`.trim();
      
      const lensModel = exif.LensModel || exif.Lens || "";
      
      // Compute exposure parameters
      const fNumber = exif.FNumber ? `f/${exif.FNumber}` : "";
      
      let shutterSpeed = "";
      if (exif.ExposureTime) {
        if (exif.ExposureTime < 1) {
          shutterSpeed = `1/${Math.round(1 / exif.ExposureTime)}s`;
        } else {
          shutterSpeed = `${exif.ExposureTime}s`;
        }
      }
      
      const iso = exif.ISO ? `ISO ${exif.ISO}` : "";
      const exposureString = [fNumber, shutterSpeed, iso].filter(Boolean).join(" · ");
      
      // Format coordinates
      let gpsCoords = "";
      let lat = null;
      let lon = null;
      if (exif.latitude !== undefined && exif.longitude !== undefined) {
        lat = Number(exif.latitude);
        lon = Number(exif.longitude);
        gpsCoords = `${decimalToDMS(lat, "lat")}, ${decimalToDMS(lon, "lon")}`;
      }

      // Date parsing
      let imageDate = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || null;
      let year = 2024; // default fallback
      if (imageDate) {
        const d = new Date(imageDate);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
        }
      }

      // Formatting Title from filename
      const baseName = path.parse(file).name;
      const title = baseName.replace(/^[_\s-]+/, "").replace(/[_\s-]+/g, " ");

      galleryItems.push({
        id: baseName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        src: `public/proof/Gallery/${file}`,
        title: title || "Untitled Exhibit",
        location: gpsCoords ? "Geotagged Location" : "Unknown Location",
        coordinates: gpsCoords || "N/A",
        lat: lat,
        lon: lon,
        year: year,
        genre: "Photography",
        camera: fullCameraName || "Unknown Camera",
        lens: lensModel || "Unknown Lens",
        exif: exposureString || "EXIF unavailable",
        story: `Original frame ${file}. Captured in ${year} using ${fullCameraName || "a digital sensor"}.`
      });

    } catch (err) {
      console.error(`Failed to read EXIF for ${file}:`, err.message);
      // Fallback object if parsing fails entirely
      const baseName = path.parse(file).name;
      galleryItems.push({
        id: baseName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        src: `public/proof/Gallery/${file}`,
        title: baseName,
        location: "Archived Frame",
        coordinates: "N/A",
        year: 2024,
        genre: "Photography",
        camera: "Unknown Camera",
        lens: "Unknown Lens",
        exif: "EXIF unavailable",
        story: `Original archival frame ${file}.`
      });
    }
  }

  console.log(`Writing JSON metadata database to ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(galleryItems, null, 2));
  console.log("Done successfully!");
}

run().catch(console.error);
