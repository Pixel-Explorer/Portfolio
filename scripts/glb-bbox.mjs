// Per-mesh world bounding boxes — to see where decals sit relative to the base.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { flatten, clearNodeTransform } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

const [, , inPath] = process.argv;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(inPath);
await doc.transform(flatten());
for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { try { clearNodeTransform(n); } catch {} }

const all = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const prim of mesh.listPrimitives()) {
    const p = prim.getAttribute("POSITION"); if (!p) continue;
    const lo = p.getMin([]), hi = p.getMax([]);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], lo[i]); max[i] = Math.max(max[i], hi[i]); all.min[i] = Math.min(all.min[i], lo[i]); all.max[i] = Math.max(all.max[i], hi[i]); }
  }
  const size = max.map((v, i) => (v - min[i]).toFixed(2));
  const ctr = max.map((v, i) => ((v + min[i]) / 2).toFixed(2));
  console.log(`${(node.getName() || mesh.getName() || "?").slice(0, 40).padEnd(42)} size[${size}] center[${ctr}]`);
}
console.log(`\nOVERALL size[${all.max.map((v, i) => (v - all.min[i]).toFixed(2))}] min[${all.min.map(n=>n.toFixed(2))}] max[${all.max.map(n=>n.toFixed(2))}]`);
