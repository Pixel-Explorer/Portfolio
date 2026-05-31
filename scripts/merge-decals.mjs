// Stage 2 — merge Stager decals (logo billboards/posters) onto a textured
// KitBash base building.
//
// The Stager building node = base meshes (KB3D_MIM_<basePrefix>_*) carrying the
// user's flat colors + extra meshes (billboards/logos) carrying the decals.
// We keep the decal meshes in their original Stager frame, fit the textured
// KitBash base into the Stager base's bounding box (so the decals line up where
// they were authored), merge, and optimize.
//
//   node --max-old-space-size=12288 scripts/merge-decals.mjs \
//     <stagerCity.glb> "<Building Node>" <basePrefix> <texturedBase.glb> <out.glb> \
//     [--size 1024] [--yrot 90] [--xoff 0] [--yoff 0] [--zoff 0] [--scale 1]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { mergeDocuments, flatten, clearNodeTransform, prune, dedup } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { optimizeGlb } from "./optimize-glb.mjs";

const a = process.argv.slice(2);
const pos = a.filter((x) => !x.startsWith("--"));
const [cityPath, nodeName, basePrefix, basePath, outPath] = pos;
const opt = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? Number(a[i + 1]) : d; };
const textureSize = opt("size", 1024);
const yrot = (opt("yrot", 0) * Math.PI) / 180;
const xoff = opt("xoff", 0), yoff = opt("yoff", 0), zoff = opt("zoff", 0), scaleMult = opt("scale", 1);
if (!cityPath || !nodeName || !basePrefix || !basePath || !outPath) {
  console.error('usage: merge-decals.mjs <city.glb> "<Node>" <basePrefix> <base.glb> <out.glb> [--yrot deg] [--xoff] [--yoff] [--zoff] [--scale]');
  process.exit(1);
}

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

// Bake every node transform into vertices so all geometry is in world space.
function bakeWorld(doc) {
  doc.transform(flatten());
  for (const node of doc.getRoot().listNodes()) {
    if (node.getMesh()) { try { clearNodeTransform(node); } catch {} }
  }
}
// World AABB over mesh nodes matching pred(nodeName) — assumes baked vertices.
function worldBox(doc, pred) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || !pred(node.getName() || "")) continue;
    for (const prim of mesh.listPrimitives()) {
      const p = prim.getAttribute("POSITION"); if (!p) continue;
      const lo = p.getMin([]), hi = p.getMax([]);
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], lo[i]); max[i] = Math.max(max[i], hi[i]); }
    }
  }
  return { min, max, size: max.map((v, i) => v - min[i]), center: max.map((v, i) => (v + min[i]) / 2) };
}

// ── load + isolate the Stager building node ──
const cityDoc = await io.read(cityPath);
const cityRoot = cityDoc.getRoot();
const target = cityRoot.listNodes().find((n) => n.getName() === nodeName);
if (!target) { console.error(`Node "${nodeName}" not found`); process.exit(1); }
const cityScene = cityRoot.listScenes()[0];
for (const c of cityScene.listChildren()) cityScene.removeChild(c);
cityScene.addChild(target);
await cityDoc.transform(prune());            // drop the now-detached sibling buildings
bakeWorld(cityDoc);

const isBase = (name) => name.includes(basePrefix);
const stagerBaseBox = worldBox(cityDoc, isBase);
console.log("stager base box:", stagerBaseBox.min.map((n) => n.toFixed(2)), "→", stagerBaseBox.max.map((n) => n.toFixed(2)));

// Drop the Stager base meshes — keep only decal/extra meshes.
const baseNodes = cityDoc.getRoot().listNodes().filter((n) => n.getMesh() && isBase(n.getName() || ""));
const decalMeshes = cityDoc.getRoot().listNodes().filter((n) => n.getMesh()).length - baseNodes.length;
for (const n of baseNodes) n.dispose();
await cityDoc.transform(prune());
console.log(`kept ${decalMeshes} decal meshes`);

// Enlarge / reposition the decal (billboard) so the logos read clearly.
const decalScale = opt("decalscale", 1);
const dx = opt("decalx", 0), dy = opt("decaly", 0), dz = opt("decalz", 0);
if (decalScale !== 1 || dx || dy || dz) {
  const dbox = worldBox(cityDoc, () => true); // decals only at this point
  const dc = dbox.center;
  for (const node of cityDoc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION"); if (!pos) continue;
      const v = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        v[0] = (v[0] - dc[0]) * decalScale + dc[0] + dx;
        v[1] = (v[1] - dc[1]) * decalScale + dc[1] + dy;
        v[2] = (v[2] - dc[2]) * decalScale + dc[2] + dz;
        pos.setElement(i, v);
      }
    }
  }
  console.log(`decal: scale ${decalScale}, offset [${dx},${dy},${dz}], from center [${dc.map((n) => n.toFixed(2))}]`);
}

// Crop the white border off the logo atlas so the logos fill the billboard.
// (Stager exports the logos small inside a mostly-white texture.) Only the
// base-color texture is trimmed — roughness/normal are near-uniform, so leaving
// them at full extent doesn't cause a visible mismatch.
if (!process.argv.includes("--nocrop")) {
  const seen = new Set();
  for (const mat of cityDoc.getRoot().listMaterials()) {
    const tex = mat.getBaseColorTexture();
    if (!tex || seen.has(tex)) continue;
    seen.add(tex);
    const img = tex.getImage(); if (!img) continue;
    try {
      const before = await sharp(Buffer.from(img)).metadata();
      const trimmed = await sharp(Buffer.from(img)).trim({ background: "#ffffff", threshold: 25 }).png().toBuffer();
      const after = await sharp(trimmed).metadata();
      tex.setImage(new Uint8Array(trimmed)).setMimeType("image/png");
      console.log(`cropped logo "${mat.getName()}": ${before.width}x${before.height} → ${after.width}x${after.height}`);
    } catch (e) { console.warn("logo crop skipped:", e.message); }
  }
}

// ── load textured KitBash base, fit it into the Stager base box ──
const baseDoc = await io.read(basePath);
bakeWorld(baseDoc);
const kitBox = worldBox(baseDoc, () => true);

// scale so heights match (× manual multiplier), align XZ centers + Y floor
const s = (stagerBaseBox.size[1] / (kitBox.size[1] || 1)) * scaleMult;
const cos = Math.cos(yrot), sin = Math.sin(yrot);
// Bake transform into base vertices: rotateY about kit center, scale s, then move
// kit center→stager center (X/Z) and kit floor→stager floor (Y).
for (const node of baseDoc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION"); if (!pos) continue;
    const v = [];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      let x = v[0] - kitBox.center[0], y = v[1] - kitBox.min[1], z = v[2] - kitBox.center[2];
      const rx = x * cos - z * sin, rz = x * sin + z * cos; // rotateY
      v[0] = rx * s + stagerBaseBox.center[0] + xoff;
      v[1] = y * s + stagerBaseBox.min[1] + yoff;
      v[2] = rz * s + stagerBaseBox.center[2] + zoff;
      pos.setElement(i, v);
    }
  }
}
console.log(`fitted base: scale ${s.toFixed(4)}, yrot ${(yrot*180/Math.PI)}°`);

// ── merge decals into the base doc, add to its scene ──
const map = mergeDocuments(baseDoc, cityDoc);
const dstScene = baseDoc.getRoot().listScenes()[0];
for (const node of cityDoc.getRoot().listScenes()[0].listChildren()) {
  const copied = map.get(node);
  if (copied) dstScene.addChild(copied);
}

// A GLB allows only one buffer — move every accessor onto the base buffer and
// drop the buffer that came in with the merged decals.
const buffers = baseDoc.getRoot().listBuffers();
const mainBuf = buffers[0];
for (const acc of baseDoc.getRoot().listAccessors()) acc.setBuffer(mainBuf);
for (let i = 1; i < buffers.length; i++) buffers[i].dispose();

const merged = await io.writeBinary(baseDoc);
const mb = (n) => (n / 1048576).toFixed(1) + " MB";
console.log("optimizing merged result...");
const { after } = await optimizeGlb(merged, outPath, { textureSize });
console.log(`done → ${outPath}  (${mb(after)})`);
