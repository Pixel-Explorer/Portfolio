// Extract each building's exact Stager world transform (position / Y-rotation /
// scale) from the composed city GLB, so the app can reproduce the authored
// layout instead of auto-fitting buildings to prism slots.
//
//   node --max-old-space-size=12288 scripts/extract-coords.mjs <city.glb> [out.json]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [, , cityPath, outPath] = process.argv;
if (!cityPath) { console.error("usage: extract-coords.mjs <city.glb> [out.json]"); process.exit(1); }

// 4x4 column-major multiply (glTF convention)
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const len3 = (x, y, z) => Math.hypot(x, y, z);

function decompose(m) {
  const pos = [m[12], m[13], m[14]];
  const sx = len3(m[0], m[1], m[2]);
  const sy = len3(m[4], m[5], m[6]);
  const sz = len3(m[8], m[9], m[10]);
  // yaw (rotation about Y) from the normalized basis
  const yaw = Math.atan2(m[8] / (sz || 1), m[10] / (sz || 1));
  return { pos, scale: [sx, sy, sz], yawDeg: (yaw * 180) / Math.PI };
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(cityPath);
const scene = doc.getRoot().listScenes()[0];

const results = {};
const IDENT = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
// buildings are named nodes; skip props/trees/banners/planes
const skip = (n) => /^(KB3D_|Plane|render_camera|default_group)/.test(n) || n === "";

function walk(node, parentWorld) {
  const world = mul(parentWorld, node.getMatrix());
  const name = node.getName() || "";
  // a "building" = named node (not a raw KB3D part) that has descendants/geometry
  if (!skip(name) && (node.getMesh() || node.listChildren().length)) {
    const t = decompose(world);
    if (!results[name]) results[name] = { name, ...t };
  }
  for (const c of node.listChildren()) walk(c, world);
}
for (const n of scene.listChildren()) walk(n, IDENT);

const rows = Object.values(results)
  .filter((r) => !skip(r.name))
  .sort((a, b) => a.pos[0] - b.pos[0]);

// overall footprint (for mapping the city into the app's plinth space)
const xs = rows.map((r) => r.pos[0]), zs = rows.map((r) => r.pos[2]);
const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };

for (const r of rows) {
  console.log(`${r.name.padEnd(26)} pos=[${r.pos.map((v) => v.toFixed(2)).join(", ")}]  yaw=${r.yawDeg.toFixed(1)}°  scale=[${r.scale.map((v) => v.toFixed(2)).join(",")}]`);
}
console.log(`\nfootprint: X ${bounds.minX.toFixed(1)}..${bounds.maxX.toFixed(1)}  (w=${(bounds.maxX - bounds.minX).toFixed(1)})   Z ${bounds.minZ.toFixed(1)}..${bounds.maxZ.toFixed(1)}  (d=${(bounds.maxZ - bounds.minZ).toFixed(1)})`);

if (outPath) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outPath, JSON.stringify({ bounds, buildings: rows }, null, 2));
  console.log(`\nwrote ${outPath}`);
}
