// Quick GLB introspection — parses the JSON chunk and summarizes contents.
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: node glb-inspect.mjs <file.glb>"); process.exit(1); }

const buf = readFileSync(path);
const magic = buf.toString("ascii", 0, 4);
if (magic !== "glTF") { console.error("Not a GLB (magic:", magic, ")"); process.exit(1); }
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);

// First chunk = JSON
const chunk0Len = buf.readUInt32LE(12);
const chunk0Type = buf.readUInt32LE(16);
const json = JSON.parse(buf.toString("utf8", 20, 20 + chunk0Len));

// Second chunk = BIN (optional)
let binLen = 0;
const off = 20 + chunk0Len;
if (off + 8 <= buf.length) binLen = buf.readUInt32LE(off);

const mb = (n) => (n / 1048576).toFixed(2) + " MB";
console.log("=== GLB:", path.split(/[\\/]/).pop(), "===");
console.log("glTF version:", version, "| file:", mb(total), "| BIN chunk:", mb(binLen));
console.log("generator:", json.asset?.generator || "(none)");
console.log("");
console.log("counts:",
  "nodes", json.nodes?.length || 0,
  "| meshes", json.meshes?.length || 0,
  "| materials", json.materials?.length || 0,
  "| textures", json.textures?.length || 0,
  "| images", json.images?.length || 0,
  "| accessors", json.accessors?.length || 0,
);

// Embedded image summary
if (json.images?.length) {
  console.log("\n--- images (embedded textures) ---");
  let withData = 0, withUri = 0;
  for (const img of json.images) {
    if (img.bufferView != null) withData++;
    else if (img.uri) withUri++;
  }
  console.log(`embedded-in-BIN: ${withData} | external-uri: ${withUri}`);
  const mimes = {};
  for (const img of json.images) { const m = img.mimeType || "(uri)"; mimes[m] = (mimes[m]||0)+1; }
  console.log("mime types:", JSON.stringify(mimes));
} else {
  console.log("\n!!! NO IMAGES — this GLB has no textures (geometry/material-color only)");
}

// Material names
if (json.materials?.length) {
  console.log("\n--- materials (first 40) ---");
  json.materials.slice(0, 40).forEach((m, i) => {
    const pbr = m.pbrMetallicRoughness || {};
    const maps = [];
    if (pbr.baseColorTexture) maps.push("base");
    if (pbr.metallicRoughnessTexture) maps.push("metalRough");
    if (m.normalTexture) maps.push("normal");
    if (m.occlusionTexture) maps.push("ao");
    if (m.emissiveTexture) maps.push("emissive");
    console.log(`  [${i}] ${m.name || "(unnamed)"}  maps:[${maps.join(",") || "none"}]`);
  });
  if (json.materials.length > 40) console.log(`  ...and ${json.materials.length - 40} more`);
}

// Top-level scene node names (the "buildings")
const scene = json.scenes?.[json.scene ?? 0];
if (scene?.nodes) {
  console.log("\n--- top-level scene nodes (buildings/groups) ---");
  scene.nodes.forEach((ni) => {
    const n = json.nodes[ni];
    console.log(`  • ${n?.name || "(unnamed node " + ni + ")"}`);
  });
}
