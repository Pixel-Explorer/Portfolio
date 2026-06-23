// Recruiter-facing experience consolidation is intentionally presentation-only.
//
// Atomic dated entries must remain in data/ledger.json because the 3D city,
// chronology, role views, and proof links address them by id. Deleting those
// records previously broke city mappings for AIESEC, Chhello Divas, Pixelate,
// KindHealth, and the SEMCOM graduation milestone.
//
// The live grouping rules and summary copy now live in app.js:
//   MERGE_CLUSTER_LABELS
//   MERGE_CLUSTER_COPY
//   mergeClusterEntries()
//
// Keep this command as a safe audit for anyone following old documentation.

import fs from "node:fs";

const SRC = "data/ledger.json";
const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const entries = data.entries || [];

const groups = {
  AIESEC: [9, 11, 13, 15, 17, 18],
  "Chhello Divas": [42, 46],
  Pixelate: [53, 54, 57, 71, 74, 97],
  KindHealth: [90, 91],
  "SEMCOM degree": [7, 30],
};

let valid = true;
for (const [label, ids] of Object.entries(groups)) {
  const found = ids.filter((id) => entries.some((entry) => Number(entry.id) === id));
  const missing = ids.filter((id) => !found.includes(id));
  console.log(`${label}: ${found.length}/${ids.length} atomic entries present`);
  if (missing.length) {
    valid = false;
    console.error(`  Missing ids: ${missing.join(", ")}`);
  }
}

if (!valid) {
  console.error("Ledger consolidation audit failed. Restore the missing atomic entries before continuing.");
  process.exit(1);
}

console.log("Ledger consolidation audit passed.");
console.log("No data was changed. Related entries are consolidated at presentation time in app.js.");
