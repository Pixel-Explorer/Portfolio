// GLB optimizer for hero buildings exported from Substance Stager.
//
// Raw Stager exports ship 4K textures + uncompressed geometry → hundreds of MB.
// This downsizes textures, prunes/dedupes, and (optionally) meshopt-compresses
// geometry so a building lands in the ~10–30 MB range while keeping its real
// materials + logo decals intact.
//
// Used two ways:
//   • CLI:   node --max-old-space-size=12288 scripts/optimize-glb.mjs in.glb out.glb [--size 2048] [--no-meshopt]
//   • import: const { optimizeGlb } = await import('./optimize-glb.mjs')
//
// Meshopt geometry compression adds the EXT_meshopt_compression extension, which
// requires MeshoptDecoder wired into GLTFLoader at load time (done in terrain.js).

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, textureCompress, meshopt, simplify, flatten, join } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

/**
 * Optimize a GLB.
 * @param {Uint8Array|Buffer|string} input  raw GLB bytes or a file path
 * @param {string|null} outputPath  if given, writes here; always returns bytes
 * @param {object} opts  { textureSize=2048, meshoptCompress=true, quality=85 }
 * @returns {Promise<{ bytes: Uint8Array, before: number, after: number }>}
 */
export async function optimizeGlb(input, outputPath = null, opts = {}) {
  // WebP by default: ~10–20× smaller than lossless PNG, supported by Three.js
  // GLTFLoader (EXT_texture_webp) + all modern browsers.
  const { textureSize = 2048, meshoptCompress = true, quality = 85, textureFormat = "webp", simplifyRatio = null } = opts;

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  if (simplifyRatio) await MeshoptSimplifier.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

  const doc =
    typeof input === "string"
      ? await io.read(input)
      : await io.readBinary(input instanceof Uint8Array ? input : new Uint8Array(input));

  const before = typeof input === "string" ? null : (input.length ?? input.byteLength);

  const transforms = [
    dedup(),                                  // merge identical accessors/textures/materials
    prune(),                                  // drop anything unreferenced
    weld(),                                   // merge coincident verts (helps compression)
  ];
  if (simplifyRatio) {
    // Decimate geometry — KitBash buildings ship millions of tris; at cluster
    // viewing distance ~10–20% retains the silhouette while cutting GPU load.
    transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.02 }));
  }
  // Collapse the scene graph + merge primitives that share a material into one
  // mesh → far fewer draw calls (KitBash buildings ship ~25 separate meshes).
  // Decals keep their own materials, so they stay separate and intact.
  transforms.push(flatten(), join());
  transforms.push(
    textureCompress({                         // the big win: 4K → textureSize, recompress
      encoder: sharp,
      targetFormat: textureFormat || undefined, // webp by default; null keeps original
      resize: [textureSize, textureSize],
      quality,
    }),
  );
  if (meshoptCompress) {
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  }

  await doc.transform(...transforms);

  const bytes = await io.writeBinary(doc);
  if (outputPath) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(outputPath, bytes);
  }
  return { bytes, before, after: bytes.length };
}

// ── CLI ──
const isCli = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("optimize-glb.mjs");
if (isCli) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const inputPath = positional[0];
  const outputPath = positional[1] || inputPath?.replace(/\.glb$/i, ".opt.glb");
  const sizeArg = args.indexOf("--size");
  const textureSize = sizeArg >= 0 ? Number(args[sizeArg + 1]) : 2048;
  const fmtArg = args.indexOf("--format");
  const textureFormat = fmtArg >= 0 ? args[fmtArg + 1] : "webp";
  const meshoptCompress = !args.includes("--no-meshopt");
  const simpArg = args.indexOf("--simplify");
  const simplifyRatio = simpArg >= 0 ? Number(args[simpArg + 1]) : null;

  if (!inputPath) {
    console.error("usage: node scripts/optimize-glb.mjs <in.glb> [out.glb] [--size 2048] [--simplify 0.2] [--no-meshopt]");
    process.exit(1);
  }

  const mb = (n) => (n / 1048576).toFixed(1) + " MB";
  const { statSync } = await import("node:fs");
  const beforeBytes = statSync(inputPath).size;
  console.log(`Optimizing ${inputPath}`);
  console.log(`  input: ${mb(beforeBytes)} | textures → ${textureSize}px | simplify: ${simplifyRatio ?? "off"} | meshopt: ${meshoptCompress}`);
  const t0 = Date.now();
  const { after } = await optimizeGlb(inputPath, outputPath, { textureSize, meshoptCompress, textureFormat, simplifyRatio });
  console.log(`  output: ${outputPath}`);
  console.log(`  ${mb(beforeBytes)} → ${mb(after)}  (${(after / beforeBytes * 100).toFixed(1)}% of original, ${(Date.now() - t0) / 1000}s)`);
}
