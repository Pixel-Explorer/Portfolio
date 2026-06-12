#!/usr/bin/env node
// One-shot normalization of role + client data in data/ledger.json.
// Spec: see CLAUDE.md §"Final mass UI Pass 1" → role/client cleanup block.
//
// Adds fields per entry (originals preserved):
//   roles[]            canonical split of compound roles (e.g. "Dir/Cine" → ["Director","Cinematographer"])
//   roleGroups[]       master-folder memberships for Roles page (multi)
//   clientCanonical    normalized client name (merges Self/Independent, AIESEC variants, Letsarc case dups)
//   clientGroup        optional theme group ("Education" → green pill)
//   clientOutcome      optional outcome label for green-pill clients
//   excludeFromClients true for Diana + Haus of Pixels (not real clients)

import fs from "node:fs";

const SRC = "data/ledger.json";
const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const entries = data.entries || data;

// --- Per-id surgical overrides (role layer) ---
// Each value: { role?, roles?, roleGroups? }
// roles[] = canonical split. roleGroups[] = master-folder memberships.
const ROLE_OVERRIDES = {
  // Life (Birth, Family settled, Diana, Riga deport, Pixelate ends)
  1:   { role: "Life",                  roles: ["Life"],                                       roleGroups: ["Life"] },
  2:   { role: "Life",                  roles: ["Life"],                                       roleGroups: ["Life"] },
  117: { role: "Life",                  roles: ["Life"],                                       roleGroups: ["Life"] },
  // Riga deport + Pixelate ENDS: kept as moments but not shown on Roles page (no roleGroups)
  95:  { role: "Co-founder",            roles: ["Co-founder"],                                 roleGroups: [] },
  97:  { role: "Co-founder",            roles: ["Co-founder"],                                 roleGroups: [] },

  // LCC → Volunteer (under AIESEC client)
  17:  { role: "Volunteer",             roles: ["Volunteer"],                                  roleGroups: ["Volunteer"] },
  18:  { role: "Volunteer",             roles: ["Volunteer"],                                  roleGroups: ["Volunteer"] },

  // Graduate → Student
  30:  { role: "Student",               roles: ["Student"],                                    roleGroups: ["Student"] },

  // Guest Lecturer + Visiting Faculty → unified
  66:  { role: "Visiting Faculty",      roles: ["Visiting Faculty"],                           roleGroups: ["Visiting Faculty"] },
  52:  { role: "Visiting Faculty",      roles: ["Visiting Faculty"],                           roleGroups: ["Visiting Faculty"] },
  120: { role: "Visiting Faculty",      roles: ["Visiting Faculty"],                           roleGroups: ["Visiting Faculty"] },

  // Haus of Pixels — Director → Founder, also under Cofounder bucket per spec
  76:  { role: "Founder",               roles: ["Founder"],                                    roleGroups: ["Founder","Leadership","Cofounder"] },

  // Cofounder buckets — Pixelate (×5) + KindHealth (×2)
  53:  { role: "Co-founder", roles: ["Co-founder"], roleGroups: ["Cofounder","Leadership"] },
  54:  { role: "Co-founder", roles: ["Co-founder"], roleGroups: ["Cofounder","Leadership"] },
  57:  { role: "Co-founder", roles: ["Co-founder"], roleGroups: ["Cofounder","Leadership"] },
  71:  { role: "Co-founder", roles: ["Co-founder"], roleGroups: ["Cofounder","Leadership"] },
  74:  { role: "Co-founder", roles: ["Co-founder"], roleGroups: ["Cofounder","Leadership"] },
  90:  { role: "Co-founder", roles: ["Co-founder"], roleGroups: ["Cofounder","Leadership","Computational Culture"] },
  91:  { role: "Co-founder", roles: ["Co-founder"], roleGroups: ["Cofounder","Leadership","Computational Culture"] },

  // Unit Still Photographer — kept SEPARATE from Photographer (3 projects: Chhello Divas / Sameer / Passport)
  42:  { role: "Unit Still Photographer", roles: ["Unit Still Photographer"], roleGroups: ["Unit Still Photographer"] },
  46:  { role: "Unit Still Photographer", roles: ["Unit Still Photographer"], roleGroups: ["Unit Still Photographer"] },
  121: { role: "Unit Still Photographer", roles: ["Unit Still Photographer"], roleGroups: ["Unit Still Photographer"] },
  139: { role: "Unit Still Photographer", roles: ["Unit Still Photographer"], roleGroups: ["Unit Still Photographer","Moving Images"] },

  // Wedding Photographer → Photographer
  47:  { role: "Photographer",          roles: ["Photographer"],                               roleGroups: ["Photographer"] },
  119: { role: "Photographer",          roles: ["Photographer"],                               roleGroups: ["Photographer"] },

  // Compound role splits (each entry now counts toward each independent category +1)
  35:  { role: "Cinematographer, Director",      roles: ["Cinematographer","Director"],            roleGroups: ["Cinematographer","Director","Moving Images"] },
  43:  { role: "Director, Cinematographer",      roles: ["Director","Cinematographer"],            roleGroups: ["Director","Cinematographer","Moving Images"] },
  58:  { role: "Cinematographer, Editor",        roles: ["Cinematographer","Editor"],              roleGroups: ["Cinematographer","Editor","Moving Images"] },
  65:  { role: "Director, Cinematographer",      roles: ["Director","Cinematographer"],            roleGroups: ["Director","Cinematographer","Moving Images"] },
  83:  { role: "Photographer, Director",         roles: ["Photographer","Director"],               roleGroups: ["Photographer","Director","Moving Images"] },
  84:  { role: "Art Director, Cinematographer",  roles: ["Art Director","Cinematographer"],        roleGroups: ["Art Director","Cinematographer","Moving Images"] },
  85:  { role: "Designer, Photographer",         roles: ["Designer","Photographer"],               roleGroups: ["Designer","Photographer","Visual Systems"] },
  96:  { role: "Director, Editor",               roles: ["Director","Editor"],                     roleGroups: ["Director","Editor","Moving Images"] },
  102: { role: "Director, Producer",             roles: ["Director","Producer"],                   roleGroups: ["Director","Producer","Moving Images","Leadership"] },
  125: { role: "Director, Cinematographer",      roles: ["Director","Cinematographer"],            roleGroups: ["Director","Cinematographer","Moving Images"] },
  128: { role: "Cinematographer, Director",      roles: ["Cinematographer","Director"],            roleGroups: ["Cinematographer","Director","Moving Images"] },
  130: { role: "Cinematographer, Director",      roles: ["Cinematographer","Director"],            roleGroups: ["Cinematographer","Director","Moving Images"] },
  135: { role: "Cinematographer, Photographer",  roles: ["Cinematographer","Photographer"],        roleGroups: ["Cinematographer","Photographer","Moving Images"] },
  141: { role: "Cinematographer, Editor",        roles: ["Cinematographer","Editor"],              roleGroups: ["Cinematographer","Editor","Moving Images"] },

  // Pixel Explorer (88) — personal portfolio = Designer / Visual Systems
  88:  { role: "Designer",              roles: ["Designer"],                                   roleGroups: ["Designer","Visual Systems"] },

  // Rabble work — under Visual Systems AND Moving Images per spec
  100: { role: "Visual Designer Consultant", roles: ["Visual Designer"], roleGroups: ["Designer","Visual Systems","Moving Images"] },
  133: { role: "GenAI Expert",          roles: ["GenAI Expert"],                               roleGroups: ["Researcher","Visual Systems","Moving Images"] },
};

// --- Per-id client/org overrides ---
// Each value: { clientCanonical?, clientGroup?, clientOutcome?, excludeFromClients? }
const CLIENT_OVERRIDES = {
  // Diana — not a client, just a life moment
  117: { excludeFromClients: true },
  // Haus of Pixels — not a client, it's him
  76:  { excludeFromClients: true },
  // Life moments with no real client
  1:   { excludeFromClients: true },
  2:   { excludeFromClients: true },
  95:  { clientCanonical: "Health-tech startup (Riga)", excludeFromClients: true },
  97:  { excludeFromClients: true },
  // Entry 133 GenAI has mixed org "Self, rabble labs, buddy tales" — primary client is Rabble
  133: { clientCanonical: "Rabble Labs / BuidlersTribe" },
  // KindHealth → Computational Culture
  90:  { clientCanonical: "KindHealth", clientGroup: "Computational Culture" },
  91:  { clientCanonical: "KindHealth", clientGroup: "Computational Culture" },

  // Education (green) clients — outcome labels per entry
  // SEMCOM College
  16:  { clientCanonical: "SEMCOM College", clientGroup: "Education", clientOutcome: "BBA-IT" },   // (will set below if id exists)
  29:  { clientCanonical: "SEMCOM College", clientGroup: "Education", clientOutcome: "BBA-IT" },
  30:  { clientCanonical: "SEMCOM College", clientGroup: "Education", clientOutcome: "BBA-IT" },
  52:  { clientCanonical: "SEMCOM College", clientGroup: "Education", clientOutcome: "Faculty" },
  120: { clientCanonical: "SEMCOM College", clientGroup: "Education", clientOutcome: "Faculty" },
  // CVM
  66:  { clientCanonical: "CVM College of Fine Arts", clientGroup: "Education", clientOutcome: "Faculty" },
  // Blockchain Council
  59:  { clientCanonical: "Blockchain Council", clientGroup: "Education", clientOutcome: "Certified Expert" },
  // Bhanwar Rathod Academy
  41:  { clientCanonical: "Bhanwar Rathod Academy", clientGroup: "Education", clientOutcome: "Design" },
  // Angels Higher Secondary
  // (will resolve by org match below)
};

// --- General org normalization (applied if no per-id override sets clientCanonical) ---
function normalizeClient(org) {
  if (!org) return "";
  const trimmed = org.trim();
  const lc = trimmed.toLowerCase();
  // Self / Independent → Self. "Self + Nahush" (Diana) goes to Self; mixed-org strings ("Self, rabble labs, …") fall through and get handled per-id.
  if (lc === "self" || lc === "independent" || lc === "self + nahush shukla" || lc === "various clients") return "Self";
  // AIESEC variants
  if (lc.startsWith("aiesec")) return "AIESEC";
  // Letsarc case dups
  if (lc === "letsarc media") return "Letsarc Media";
  // Pixelate variants
  if (lc === "pixelate" || lc === "pixelate / near") return "Pixelate";
  // Arahantas (yoga / yoga studio) → one client
  if (lc.startsWith("arahantas")) return "Arahantas";
  // Krishnadev variants (Chhello Divas director)
  if (lc.startsWith("krishnadev")) return "Krishnadev Yagnik";
  return trimmed;
}

// Auto-tag Education group for known schools/training providers
const EDU_DEFAULTS = {
  "Kendriya Vidyalaya Cambay":              { clientGroup: "Education", clientOutcome: "Schooling" },
  "Kendriya Vidyalaya Vallabh Vidyanagar":  { clientGroup: "Education", clientOutcome: "Schooling" },
  "Angels Higher Secondary School":         { clientGroup: "Education", clientOutcome: "Schooling" },
  "SEMCOM College":                         { clientGroup: "Education", clientOutcome: "BBA-IT" },
  "Bhanwar Rathod Academy":                 { clientGroup: "Education", clientOutcome: "Design" },
  "Blockchain Council":                     { clientGroup: "Education", clientOutcome: "Certified Expert" },
  "CVM College of Fine Arts":               { clientGroup: "Education", clientOutcome: "Faculty" },
};

// --- Apply ---
let mutated = 0;
for (const x of entries) {
  // ROLES
  const ro = ROLE_OVERRIDES[x.id];
  if (ro) {
    if (ro.role !== undefined) x.role = ro.role;
    x.roles = ro.roles.slice();
    x.roleGroups = ro.roleGroups.slice();
  } else {
    // Default: single-role; roleGroups = [role] (or empty)
    const r = (x.role || "").trim();
    x.roles = r ? [r] : [];
    x.roleGroups = r ? [r] : [];
  }

  // CLIENTS
  const co = CLIENT_OVERRIDES[x.id];
  if (co) {
    if (co.clientCanonical !== undefined) x.clientCanonical = co.clientCanonical;
    if (co.clientGroup !== undefined) x.clientGroup = co.clientGroup;
    if (co.clientOutcome !== undefined) x.clientOutcome = co.clientOutcome;
    if (co.excludeFromClients) x.excludeFromClients = true;
  }
  if (x.clientCanonical === undefined) {
    x.clientCanonical = normalizeClient(x.org || "");
  }
  // Apply EDU defaults if not already set
  if (!x.clientGroup) {
    const edu = EDU_DEFAULTS[x.clientCanonical];
    if (edu) {
      x.clientGroup = edu.clientGroup;
      if (!x.clientOutcome) x.clientOutcome = edu.clientOutcome;
    }
  }
  mutated++;
}

fs.writeFileSync(SRC, JSON.stringify(data, null, 2));
console.log(`mutated ${mutated} entries → wrote ${SRC}`);
