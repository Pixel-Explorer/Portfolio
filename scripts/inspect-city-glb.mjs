import fs from 'fs';
import path from 'path';

const cityPath = 'D:/Portfolio/Archival app/public/city/city.glb';

if (fs.existsSync(cityPath)) {
  const stats = fs.statSync(cityPath);
  console.log(`city.glb file size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
} else {
  console.error('city.glb does not exist at:', cityPath);
}
