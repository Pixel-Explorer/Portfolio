// Batch-build textured hero GLBs from the big Substance Stager city export.
//
// This is the "all named buildings" driver for the KitBash pipeline:
//   1. convert each source KitBash OBJ folder to a textured base GLB
//   2. merge that textured base with the decals/signage authored in Stager
//   3. write public/models/<entryId>/model.glb
//   4. update data/ledger.json so the app replaces the procedural prism
//
// Dry-run/list first:
//   node scripts/batch-hero-models.mjs --list
//   node scripts/batch-hero-models.mjs --dry-run
//
// Run one entry:
//   node scripts/batch-hero-models.mjs --only 46
//
// Run all pending confirmed mappings:
//   node --max-old-space-size=12288 scripts/batch-hero-models.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sourceRoot = resolve(repoRoot, "..", "3d");
const defaultCityPath = join(sourceRoot, "new_main city composition.glb");
const defaultWorkDir = join(repoRoot, "scratch", "hero-model-build");

const BUILDINGS = [
  // Already committed, kept here so --list shows the full Stager cluster.
  {
    enabled: false,
    reason: "already present as entry #1",
    entryId: 1,
    stagerNode: "Hospital_Building_n3d",
    label: "Birth hospital",
  },
  {
    entryId: 100,
    stagerNode: "Rabble building",
    label: "Rabble Labs",
    kitFolder: "kitbash-manhattan-office-building-c-2026-02-07-16-30-27-utc",
    basePrefix: "OfficeBuilding_C",
  },

  // Confirmed / strongly named mappings.
  {
    entryId: 46,
    stagerNode: "Chello Divas",
    label: "Chhello Divas release",
    kitFolder: "kitbash-manhattan-broadway-theater-2026-02-07-16-54-41-utc",
    basePrefix: "BroadwayTheater_A",
  },
  {
    entryId: 53,
    stagerNode: "Pixelate",
    label: "Pixelate co-founded",
    kitFolder: "kitbash-manhattan-financial-building-2026-02-07-16-41-33-utc",
    basePrefix: "FinancialBuilding_A",
  },
  {
    entryId: 76,
    stagerNode: "Haus of Pixels",
    label: "Haus of Pixels OPC",
    kitFolder: "kitbash-manhattan-media-company-tower-2026-02-07-16-48-38-utc",
    basePrefix: "MediaCompanyTower_A",
  },
  {
    entryId: 90,
    stagerNode: "Kind Health Building",
    label: "KindHealth",
    kitFolder: "kitbash-manhattan-office-tower-a-2026-02-07-17-32-02-utc",
    basePrefix: "OfficeTower_A",
  },
  {
    entryId: 94,
    stagerNode: "Flamingo Travel Film",
    label: "Flamingo Travels film",
    kitFolder: "kitbash-manhattan-office-tower-b-2026-02-07-16-42-34-utc",
    basePrefix: "OfficeTower_B",
  },
  {
    entryId: 9,
    stagerNode: "AIESEC",
    label: "AIESEC induction",
    kitFolder: "kitbash-manhattan-office-tower-c-2026-02-07-16-56-42-utc",
    basePrefix: "OfficeTower_C",
  },
  {
    entryId: 7,
    stagerNode: "BBA-ITM",
    label: "BBA(IT) starts",
    kitFolder: "kitbash-manhattan-residential-tower-2026-02-07-16-46-37-utc",
    basePrefix: "ResidentialTower_A",
  },
  {
    entryId: 52,
    stagerNode: "Faculty Guest",
    label: "SEMCOM Visiting Faculty",
    kitFolder: "kitbash-manhattan-skyscraper-a-2026-02-07-17-00-45-utc",
    basePrefix: "Skyscraper_A",
    note: "Could be #66 CVM guest lecturer if the authored decal says CVM.",
  },
  {
    entryId: 68,
    stagerNode: "Octo Research",
    label: "OCTO Advisory research",
    kitFolder: "kitbash-manhattan-skyscraper-b-2026-02-07-16-47-38-utc",
    basePrefix: "Skyscraper_B",
  },
  {
    entryId: 123,
    stagerNode: "map oIl",
    label: "Map Oil TVC",
    kitFolder: "kitbash-manhattan-skyscraper-c-2026-02-07-16-35-30-utc",
    basePrefix: "Skyscraper_C",
  },
  {
    entryId: 54,
    stagerNode: "StartupWeekend Winner",
    label: "StartupWeekend win",
    kitFolder: "kitbash-manhattan-skyscraper-f-2026-02-07-16-36-31-utc",
    basePrefix: "Skyscraper_F",
  },
  {
    entryId: 77,
    stagerNode: "wow",
    label: "Workshop on Wheels",
    kitFolder: "kitbash-storefronts-auto-repair-shop-2026-02-07-16-26-25-utc",
    basePrefix: "LowEndStore_F",
  },
  {
    entryId: 60,
    stagerNode: "Khayaal",
    label: "Tarikshir / Khayaal Patel",
    kitFolder: "kitbash-storefronts-book-store-2026-02-07-16-51-40-utc",
    basePrefix: "MidEndStore_F",
  },
  {
    entryId: 78,
    stagerNode: "SD",
    label: "Silver Dragon",
    kitFolder: "kitbash-storefronts-chinese-restaurant-2026-02-07-16-38-32-utc",
    basePrefix: "LowEndStore_C",
  },
  {
    entryId: 70,
    stagerNode: "JD",
    label: "Jadi Duty",
    kitFolder: "kitbash-manhattan-shopping-center-2026-02-07-16-59-44-utc",
    basePrefix: "ShoppingCenter_A",
  },
  {
    entryId: 102,
    stagerNode: "Buddy Tales",
    label: "Buddy Tales",
    kitFolder: "kitbash-manhattan-apartment-building-b-2026-02-07-16-54-41-utc",
    basePrefix: "ApartmentBuilding_B",
  },

  // Deliberately held until the target entry is confirmed.
  {
    enabled: false,
    reason: "needs entry confirmation",
    entryId: null,
    stagerNode: "Gallery Travel",
    label: "Gallery Travel",
    kitFolder: "kitbash-manhattan-history-museum-2026-02-07-16-49-39-utc",
    basePrefix: "HistoryMuseum_A",
    note: "No exact ledger match found. Candidate: #126 Gujarat tourism AD films.",
  },
];

const args = process.argv.slice(2);
const argValue = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const cityPath = resolve(argValue("city", defaultCityPath));
const workDir = resolve(argValue("work-dir", defaultWorkDir));
const textureSize = Number(argValue("size", 1024));
const dryRun = has("dry-run");
const listOnly = has("list");
const noLedger = has("no-ledger");
const includeExisting = has("include-existing");
const onlyRaw = argValue("only", "");
const only = new Set(
  onlyRaw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
);

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicModelPath(entryId) {
  return join(repoRoot, "public", "models", String(entryId), "model.glb");
}

function publicModelUrl(entryId) {
  return `public/models/${entryId}/model.glb`;
}

function readLedger() {
  const ledgerPath = join(repoRoot, "data", "ledger.json");
  return { ledgerPath, data: JSON.parse(readFileSync(ledgerPath, "utf8")) };
}

function entryTitleMap() {
  const { data } = readLedger();
  return new Map((data.entries || []).map((e) => [String(e.id), e.title || "Untitled"]));
}

function selectedBuildings() {
  return BUILDINGS.filter((b) => {
    if (only.size) {
      const keys = [b.entryId, b.stagerNode, b.label, b.basePrefix].filter(Boolean).map((x) => String(x).toLowerCase());
      if (!keys.some((k) => only.has(k) || [...only].some((needle) => k.includes(needle)))) return false;
    }
    if (b.enabled === false) return false;
    if (!includeExisting && b.entryId && existsSync(publicModelPath(b.entryId))) return false;
    return true;
  });
}

function printList() {
  const titles = entryTitleMap();
  const rows = BUILDINGS.map((b) => {
    const state =
      b.enabled === false
        ? `held: ${b.reason}`
        : b.entryId && existsSync(publicModelPath(b.entryId))
          ? "exists"
          : "pending";
    return {
      state,
      entry: b.entryId ? `#${b.entryId}` : "-",
      title: b.entryId ? titles.get(String(b.entryId)) || b.label : b.label,
      node: b.stagerNode,
      kit: b.basePrefix || "-",
      note: b.note || "",
    };
  });
  console.table(rows);
}

function run(cmd, cmdArgs, label) {
  console.log(`\n[${label}] ${cmd} ${cmdArgs.map((x) => x.includes(" ") ? `"${x}"` : x).join(" ")}`);
  if (dryRun) return;
  const result = spawnSync(cmd, cmdArgs, { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function updateLedgerModel(entriesDone) {
  if (dryRun || noLedger || !entriesDone.length) return;
  const { ledgerPath, data } = readLedger();
  const byId = new Map(entriesDone.map((b) => [String(b.entryId), b]));
  let changed = 0;
  data.entries = (data.entries || []).map((entry) => {
    const b = byId.get(String(entry.id));
    if (!b) return entry;
    changed++;
    // Clean model block: the GLB is baked at absolute Stager world coords, so it
    // must load at identity (stagerWorld) — drop any stale position/rotation/scale.
    return {
      ...entry,
      model: {
        src: publicModelUrl(entry.id),
        preserveMaterials: true,
        stagerWorld: true,
      },
    };
  });
  writeFileSync(ledgerPath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[ledger] updated model refs for ${changed} entries`);
}

async function main() {
  if (listOnly) {
    printList();
    return;
  }

  if (!existsSync(cityPath)) {
    throw new Error(`Stager city GLB not found: ${cityPath}`);
  }

  const batch = selectedBuildings();
  if (!batch.length) {
    console.log("No buildings selected. Use --include-existing, --only <id>, or --list to inspect mappings.");
    return;
  }

  console.log(`City: ${cityPath}`);
  console.log(`Work dir: ${workDir}`);
  console.log(`Texture size: ${textureSize}`);
  console.log(`Selected: ${batch.map((b) => `${b.stagerNode}->#${b.entryId}`).join(", ")}`);
  mkdirSync(workDir, { recursive: true });

  const completed = [];
  for (const b of batch) {
    const kitPath = join(sourceRoot, b.kitFolder);
    if (!existsSync(kitPath)) throw new Error(`KitBash folder not found for ${b.stagerNode}: ${kitPath}`);

    const modelDir = join(repoRoot, "public", "models", String(b.entryId));
    const itemWorkDir = join(workDir, `${String(b.entryId).padStart(3, "0")}-${slug(b.stagerNode)}`);
    const baseGlb = join(itemWorkDir, `${b.basePrefix}-textured.glb`);
    const outGlb = join(modelDir, "model.glb");
    mkdirSync(itemWorkDir, { recursive: true });
    mkdirSync(modelDir, { recursive: true });

    run(
      process.execPath,
      [
        "--max-old-space-size=12288",
        join("scripts", "kitbash-to-glb.mjs"),
        kitPath,
        baseGlb,
        "--size",
        String(textureSize),
      ],
      `base ${b.stagerNode}`,
    );

    const mergeArgs = [
      "--max-old-space-size=12288",
      join("scripts", "merge-decals.mjs"),
      cityPath,
      b.stagerNode,
      b.basePrefix,
      baseGlb,
      outGlb,
      "--size",
      String(textureSize),
    ];
    if (b.yrot != null) mergeArgs.push("--yrot", String(b.yrot));
    if (b.xoff != null) mergeArgs.push("--xoff", String(b.xoff));
    if (b.yoff != null) mergeArgs.push("--yoff", String(b.yoff));
    if (b.zoff != null) mergeArgs.push("--zoff", String(b.zoff));
    if (b.scale != null) mergeArgs.push("--scale", String(b.scale));
    if (b.decalScale != null) mergeArgs.push("--decalscale", String(b.decalScale));
    if (b.decalx != null) mergeArgs.push("--decalx", String(b.decalx));
    if (b.decaly != null) mergeArgs.push("--decaly", String(b.decaly));
    if (b.decalz != null) mergeArgs.push("--decalz", String(b.decalz));
    if (b.nocrop) mergeArgs.push("--nocrop");
    run(process.execPath, mergeArgs, `merge ${b.stagerNode}`);
    completed.push(b);
  }

  updateLedgerModel(completed);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
