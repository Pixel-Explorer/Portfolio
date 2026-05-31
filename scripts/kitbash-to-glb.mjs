// KitBash OBJ + texture set → optimized, fully-textured GLB.
//
// KitBash ships a Blender-flavoured MTL that crams PBR maps into non-standard
// slots (map_Ns=roughness, map_refl=metallic, map_Bump=normal) and points at
// dead absolute paths. obj2gltf can't read that correctly, so we:
//   1. parse the MTL → material → {basecolor,roughness,metallic,normal,emissive}
//   2. write a stripped MTL (basecolor only, local paths) so obj2gltf gives us
//      clean geometry + UVs + base color
//   3. in gltf-transform, attach normal + a packed metallicRoughness texture
//      (G=roughness, B=metallic, built with sharp) + emissive, per material
//   4. optimize (resize textures, meshopt geometry) via optimize-glb.mjs
//
//   node --max-old-space-size=12288 scripts/kitbash-to-glb.mjs <kitbashFolder> <out.glb> [--size 2048]

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import obj2gltf from "obj2gltf";
import sharp from "sharp";
import { optimizeGlb } from "./optimize-glb.mjs";

const [, , folder, outPath, ...rest] = process.argv;
if (!folder || !outPath) {
  console.error("usage: kitbash-to-glb.mjs <kitbashFolder> <out.glb> [--size 2048]");
  process.exit(1);
}
const sizeArg = rest.indexOf("--size");
const textureSize = sizeArg >= 0 ? Number(rest[sizeArg + 1]) : 2048;

// ── locate obj + mtl ──
const files = readdirSync(folder);
const objName = files.find((f) => f.toLowerCase().endsWith(".obj"));
const mtlName = files.find((f) => f.toLowerCase().endsWith(".mtl"));
if (!objName || !mtlName) { console.error("No .obj/.mtl in folder"); process.exit(1); }
const objPath = join(folder, objName);
const mtlPath = join(folder, mtlName);

// ── parse MTL: material → slot basenames ──
// map_Kd=basecolor, map_Ns=roughness, map_refl=metallic, map_Bump=normal, map_Ke=emissive
const mtlText = readFileSync(mtlPath, "utf8");
const mats = {};
let cur = null;
const baseOf = (line) => line.trim().split(/\s+/).pop().split(/[\\/]/).pop(); // last token, basename
for (const line of mtlText.split(/\r?\n/)) {
  const t = line.trim();
  if (t.startsWith("newmtl ")) { cur = t.slice(7).trim(); mats[cur] = {}; }
  else if (!cur) continue;
  else if (t.startsWith("map_Kd ")) mats[cur].base = baseOf(t);
  else if (t.startsWith("map_Ns ")) mats[cur].rough = baseOf(t);
  else if (t.startsWith("map_refl ")) mats[cur].metal = baseOf(t);
  else if (t.startsWith("map_Bump ") || t.startsWith("map_bump ") || t.startsWith("bump ")) mats[cur].normal = baseOf(t);
  else if (t.startsWith("map_Ke ")) mats[cur].emissive = baseOf(t);
}
const localTex = (name) => (name && existsSync(join(folder, name)) ? join(folder, name) : null);

// ── write stripped MTL (basecolor only, local basenames) so obj2gltf is clean ──
const bakPath = mtlPath + ".orig";
let strippedGlb;
try {
  copyFileSync(mtlPath, bakPath);
  const stripped = Object.entries(mats).map(([name, m]) => {
    const lines = [`newmtl ${name}`, "Ka 1 1 1", "Kd 1 1 1", "illum 2"];
    if (m.base && existsSync(join(folder, m.base))) lines.push(`map_Kd ${m.base}`);
    return lines.join("\n");
  }).join("\n\n");
  writeFileSync(mtlPath, stripped);

  console.log(`obj2gltf: ${objName} (${Object.keys(mats).length} materials)...`);
  strippedGlb = await obj2gltf(objPath, { binary: true, metallicRoughness: true });
} finally {
  copyFileSync(bakPath, mtlPath); // always restore the original MTL
}

// ── pack roughness + metallic into one RGB texture (G=rough, B=metal) ──
async function packMetalRough(roughPath, metalPath, size) {
  const toGray = async (p) =>
    p ? new Uint8Array(await sharp(p).resize(size, size, { fit: "fill" }).removeAlpha().toColourspace("b-w").raw().toBuffer()) : null;
  const r = await toGray(roughPath);
  const m = await toGray(metalPath);
  if (!r && !m) return null;
  const px = size * size;
  const out = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    out[i * 3] = 255;                       // R (unused / AO=white)
    out[i * 3 + 1] = r ? r[i] : 255;        // G = roughness
    out[i * 3 + 2] = m ? m[i] : 0;          // B = metallic
  }
  return new Uint8Array(await sharp(out, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer());
}
async function resizedPng(path, size) {
  return new Uint8Array(await sharp(path).resize(size, size, { fit: "fill" }).png().toBuffer());
}

// ── attach the real PBR channels per material ──
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.readBinary(strippedGlb);
const root = doc.getRoot();

const findSlots = (matName) => {
  if (mats[matName]) return mats[matName];
  const key = Object.keys(mats).find((k) => matName === k || matName.startsWith(k) || k.startsWith(matName));
  return key ? mats[key] : null;
};

let textured = 0;
for (const material of root.listMaterials()) {
  const slots = findSlots(material.getName());
  if (!slots) continue;
  material.setBaseColorFactor([1, 1, 1, 1]);

  const normalPath = localTex(slots.normal);
  if (normalPath) {
    const tex = doc.createTexture(material.getName() + "_n").setImage(await resizedPng(normalPath, textureSize)).setMimeType("image/png");
    material.setNormalTexture(tex);
  }
  const packed = await packMetalRough(localTex(slots.rough), localTex(slots.metal), textureSize);
  if (packed) {
    const tex = doc.createTexture(material.getName() + "_mr").setImage(packed).setMimeType("image/png");
    material.setMetallicRoughnessTexture(tex);
    material.setMetallicFactor(1).setRoughnessFactor(1);
  }
  const emissivePath = localTex(slots.emissive);
  if (emissivePath) {
    const tex = doc.createTexture(material.getName() + "_e").setImage(await resizedPng(emissivePath, textureSize)).setMimeType("image/png");
    material.setEmissiveTexture(tex);
    material.setEmissiveFactor([1, 1, 1]);
  }
  textured++;
}
console.log(`attached PBR maps to ${textured}/${root.listMaterials().length} materials`);

const texturedBuffer = await io.writeBinary(doc);

// ── optimize (resize basecolor, meshopt geometry) ──
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
console.log("optimizing...");
const { after } = await optimizeGlb(texturedBuffer, outPath, { textureSize });
console.log(`done → ${outPath}  (${mb(after)})`);
