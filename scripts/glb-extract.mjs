// Extract a single named node (one building) from a composed-scene GLB into its
// own GLB. Used to pull individual hero buildings out of the Stager city export.
//
//   list:    node scripts/glb-extract.mjs <in.glb>
//   extract: node --max-old-space-size=12288 scripts/glb-extract.mjs <in.glb> <out.glb> "<Node Name>"
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup } from "@gltf-transform/functions";

const [, , inPath, outPath, nodeName] = process.argv;
if (!inPath) { console.error("usage: glb-extract.mjs <in.glb> [out.glb] [nodeName]"); process.exit(1); }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const root = doc.getRoot();

// Count triangles under a node (recursively) so we can spot real buildings.
function triCount(node) {
  let tris = 0;
  const mesh = node.getMesh?.();
  if (mesh) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices();
    tris += idx ? idx.getCount() / 3 : (prim.getAttribute("POSITION")?.getCount() || 0) / 3;
  }
  for (const child of node.listChildren()) tris += triCount(child);
  return tris;
}

if (!outPath || !nodeName) {
  // LIST mode — top-level + named nodes with geometry
  console.log("=== Named nodes with geometry (candidates to extract) ===");
  const scene = root.listScenes()[0];
  const walk = (node, depth) => {
    const name = node.getName() || "(unnamed)";
    const tris = triCount(node);
    if (name !== "(unnamed)" && tris > 0) {
      console.log(`${"  ".repeat(depth)}• ${name}  (~${Math.round(tris).toLocaleString()} tris)`);
    }
    for (const child of node.listChildren()) walk(child, depth + 1);
  };
  for (const n of scene.listChildren()) walk(n, 0);
  process.exit(0);
}

// EXTRACT mode
const target = root.listNodes().find((n) => n.getName() === nodeName);
if (!target) { console.error(`Node "${nodeName}" not found.`); process.exit(1); }

const scene = root.listScenes()[0];
for (const child of scene.listChildren()) scene.removeChild(child);
scene.addChild(target); // re-parent target as the sole scene root
await doc.transform(prune(), dedup());

const mb = (n) => (n / 1048576).toFixed(1) + " MB";
const bytes = await io.writeBinary(doc);
const { writeFileSync } = await import("node:fs");
writeFileSync(outPath, bytes);
console.log(`Extracted "${nodeName}" → ${outPath}  (${mb(bytes.length)}, ~${Math.round(triCount(target)).toLocaleString()} tris)`);
