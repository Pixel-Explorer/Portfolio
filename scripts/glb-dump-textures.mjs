// Dump every texture in a GLB to PNG files so we can eyeball what's in it
// (logos, posters, concrete, etc.).  node scripts/glb-dump-textures.mjs <in.glb> <outDir>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , inPath, outDir = "."] = process.argv;
if (!inPath) { console.error("usage: glb-dump-textures.mjs <in.glb> <outDir>"); process.exit(1); }
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(inPath);
mkdirSync(outDir, { recursive: true });
let i = 0;
for (const tex of doc.getRoot().listTextures()) {
  const img = tex.getImage();
  if (!img) continue;
  const ext = (tex.getMimeType() || "image/png").split("/")[1].replace("jpeg", "jpg");
  const name = (tex.getName() || `tex${i}`).replace(/[^\w.-]/g, "_");
  const file = join(outDir, `${String(i).padStart(2, "0")}_${name}.${ext}`);
  writeFileSync(file, Buffer.from(img));
  console.log(`${(img.byteLength / 1024).toFixed(0)}KB  ${file}  (used by: ${doc.getRoot().listMaterials().filter(m => [m.getBaseColorTexture(), m.getEmissiveTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture()].includes(tex)).map(m => m.getName()).join(", ") || "?"})`);
  i++;
}
console.log(`\nDumped ${i} textures to ${outDir}`);
