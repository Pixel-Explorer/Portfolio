# Graph Report - .  (2026-06-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 994 nodes · 1199 edges · 77 communities (62 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bfa62c7d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Story Mode Modules|Story Mode Modules]]
- [[_COMMUNITY_Story Pass 02 Spec|Story Pass 02 Spec]]
- [[_COMMUNITY_Archive UI State & Filters|Archive UI State & Filters]]
- [[_COMMUNITY_Kitbash GLB Converter|Kitbash GLB Converter]]
- [[_COMMUNITY_Decal Merge Script|Decal Merge Script]]
- [[_COMMUNITY_Hero Model Batch Pipeline|Hero Model Batch Pipeline]]
- [[_COMMUNITY_Design Direction Doc|Design Direction Doc]]
- [[_COMMUNITY_Ledger Dedup Scripts|Ledger Dedup Scripts]]
- [[_COMMUNITY_Beat Building Choreography|Beat Building Choreography]]
- [[_COMMUNITY_Agents Memory Doc|Agents Memory Doc]]
- [[_COMMUNITY_Claude Memory Doc|Claude Memory Doc]]
- [[_COMMUNITY_Story Engine Core|Story Engine Core]]
- [[_COMMUNITY_Story Audio & Voice|Story Audio & Voice]]
- [[_COMMUNITY_Story Pass 01 Spec|Story Pass 01 Spec]]
- [[_COMMUNITY_Package Manifest|Package Manifest]]
- [[_COMMUNITY_Ledger Cleanup Scripts|Ledger Cleanup Scripts]]
- [[_COMMUNITY_App Bootstrap & Grid|App Bootstrap & Grid]]
- [[_COMMUNITY_Gallery Image Optimizer|Gallery Image Optimizer]]
- [[_COMMUNITY_Story UI Overlays|Story UI Overlays]]
- [[_COMMUNITY_Story Pass 03 Spec|Story Pass 03 Spec]]
- [[_COMMUNITY_Ledger XLSX Migration|Ledger XLSX Migration]]
- [[_COMMUNITY_Folder Sheet & Detail View|Folder Sheet & Detail View]]
- [[_COMMUNITY_Cluster Pages & Editor|Cluster Pages & Editor]]
- [[_COMMUNITY_Asset Pipeline Handoff|Asset Pipeline Handoff]]
- [[_COMMUNITY_Project README|Project README]]
- [[_COMMUNITY_Story Asset Plan|Story Asset Plan]]
- [[_COMMUNITY_Story Pass 04 Spec|Story Pass 04 Spec]]
- [[_COMMUNITY_Story Transitions|Story Transitions]]
- [[_COMMUNITY_Story Mode Architecture Doc|Story Mode Architecture Doc]]
- [[_COMMUNITY_Cluster Layout Transform|Cluster Layout Transform]]
- [[_COMMUNITY_Story Self-Test Harness|Story Self-Test Harness]]
- [[_COMMUNITY_Story Tune Panel|Story Tune Panel]]
- [[_COMMUNITY_Coordinate Matching Fixed|Coordinate Matching Fixed]]
- [[_COMMUNITY_GLB Coordinate Extraction|GLB Coordinate Extraction]]
- [[_COMMUNITY_Camera Rig & Chase|Camera Rig & Chase]]
- [[_COMMUNITY_Terrain Core & Roles|Terrain Core & Roles]]
- [[_COMMUNITY_Layout & Grid Spec|Layout & Grid Spec]]
- [[_COMMUNITY_Ledger XLSX Export|Ledger XLSX Export]]
- [[_COMMUNITY_Proof Evidence Wiring|Proof Evidence Wiring]]
- [[_COMMUNITY_Mobile Teaser|Mobile Teaser]]
- [[_COMMUNITY_Brutal Folder Spec|Brutal Folder Spec]]
- [[_COMMUNITY_Manila V2 Reference Specs|Manila V2 Reference Specs]]
- [[_COMMUNITY_Coordinate Matching Sorted|Coordinate Matching Sorted]]
- [[_COMMUNITY_Duplicate Merge Script|Duplicate Merge Script]]
- [[_COMMUNITY_Proof Image Optimizer|Proof Image Optimizer]]
- [[_COMMUNITY_Story Pass 01 Notes|Story Pass 01 Notes]]
- [[_COMMUNITY_Coordinate Matching|Coordinate Matching]]
- [[_COMMUNITY_Gallery EXIF Enrichment|Gallery EXIF Enrichment]]
- [[_COMMUNITY_GLB Inspector|GLB Inspector]]
- [[_COMMUNITY_Story Pass 02 Notes|Story Pass 02 Notes]]
- [[_COMMUNITY_Typography Spec|Typography Spec]]
- [[_COMMUNITY_Manila V2 Handoff|Manila V2 Handoff]]
- [[_COMMUNITY_Manila V2 Codemap|Manila V2 Codemap]]
- [[_COMMUNITY_Story Pass 03 Notes|Story Pass 03 Notes]]
- [[_COMMUNITY_Role Filters & Nav Pages|Role Filters & Nav Pages]]
- [[_COMMUNITY_Entry Selection & Zoom|Entry Selection & Zoom]]
- [[_COMMUNITY_Gallery Codex & Motion|Gallery Codex & Motion]]
- [[_COMMUNITY_Proof Linking TODO|Proof Linking TODO]]
- [[_COMMUNITY_Duplicate Cleanup Script|Duplicate Cleanup Script]]
- [[_COMMUNITY_GLB Extractor|GLB Extractor]]
- [[_COMMUNITY_Quarantined Gallery Recovery|Quarantined Gallery Recovery]]
- [[_COMMUNITY_Duplicate Report Generator|Duplicate Report Generator]]
- [[_COMMUNITY_Story Pass 04 Notes|Story Pass 04 Notes]]
- [[_COMMUNITY_Cluster Node Extraction|Cluster Node Extraction]]
- [[_COMMUNITY_Cluster Node Printer|Cluster Node Printer]]
- [[_COMMUNITY_EXIF Extraction Script|EXIF Extraction Script]]
- [[_COMMUNITY_Chhello Entry Finder|Chhello Entry Finder]]
- [[_COMMUNITY_Precommit Self-Test|Precommit Self-Test]]
- [[_COMMUNITY_Temp Duplicate Check|Temp Duplicate Check]]
- [[_COMMUNITY_XLSX Inspector|XLSX Inspector]]
- [[_COMMUNITY_Data Check Script|Data Check Script]]
- [[_COMMUNITY_GLB Bounding Box|GLB Bounding Box]]
- [[_COMMUNITY_Audio Assets README|Audio Assets README]]
- [[_COMMUNITY_GLB Texture Dump|GLB Texture Dump]]

## God Nodes (most connected - your core abstractions)
1. `BeatBuildings` - 25 edges
2. `StoryEngine` - 23 edges
3. `AudioManager` - 20 edges
4. `StoryUI` - 17 edges
5. `escapeHtml()` - 16 edges
6. `Orb` - 16 edges
7. `design.md — Archive View: "The Time Machine"` - 15 edges
8. `TASKS` - 15 edges
9. `init()` - 14 edges
10. `ScrollManager` - 14 edges

## Surprising Connections (you probably didn't know these)
- `initGridCanvas()` --calls--> `bounds`  [INFERRED]
  app.js → scripts/extract-coords.mjs
- `mergeEntries()` --calls--> `uniq()`  [INFERRED]
  scripts/duplicate_cleanup.mjs → scripts/clean_ledger.mjs
- `handleApi()` --calls--> `optimizeGlb()`  [INFERRED]
  scripts/static-server.mjs → scripts/optimize-glb.mjs

## Import Cycles
- None detected.

## Communities (77 total, 15 thin omitted)

### Community 0 - "Story Mode Modules"
Cohesion: 0.05
Nodes (9): BEATS, ERA_COLORS, ColorGrader, ExplodeView, Orb, ScrollManager, BG_COLORS, BEAT_TUNING (+1 more)

### Community 1 - "Story Pass 02 Spec"
Cohesion: 0.05
Nodes (39): 0. Why this pass exists — read this or you will repeat the same mistakes, 1. Known pitfalls — verify each before committing any task that touches them, 2. The pass-01 audit findings (what the human saw) — your fix targets, 3. How a human will verify your work (build for this), A1 — Make `hideAllBuildings` truly hide; verify staged reveal, A2 — Orb: from beachball to photon/firefly, A3 — Strip stage directions from subtitles, A4 — Letterbox bars fixed & symmetric (+31 more)

### Community 2 - "Archive UI State & Filters"
Cohesion: 0.07
Nodes (24): data, detectLinkType(), els, entriesByMonth, entriesByWeek, entryMatchesActiveRole(), extractBehanceId(), extractGoogleDriveId() (+16 more)

### Community 3 - "Kitbash GLB Converter"
Cohesion: 0.08
Nodes (23): files, io, mats, mtlName, mtlPath, mtlText, objName, objPath (+15 more)

### Community 4 - "Decal Merge Script"
Cohesion: 0.07
Nodes (25): a, authoredKitDecals, baseNodes, buffers, cityRoot, cos, decalScale, dx (+17 more)

### Community 5 - "Hero Model Batch Pipeline"
Cohesion: 0.09
Nodes (24): args, BUILDINGS, cityPath, defaultCityPath, defaultWorkDir, __dirname, dryRun, entryTitleMap() (+16 more)

### Community 6 - "Design Direction Doc"
Cohesion: 0.08
Nodes (24): 0. What changed, 10. Motion, 11. Typography, 12. Implementation notes, 13. Open decisions / flags, 1. Core metaphor, 2. Spatial concept, 3. References → decisions (+16 more)

### Community 7 - "Ledger Dedup Scripts"
Cohesion: 0.10
Nodes (19): groups, ledgerPath, norm(), obj, orgKey(), outPath, raw, titleKey() (+11 more)

### Community 9 - "Agents Memory Doc"
Cohesion: 0.09
Nodes (21): 0. Where we are (rev 2026-06-09), 10. Anchor moments (these MUST land), 11. Cross-cutting threads (use in `/throughlines`), 12. Voice rules, 13. Visual reference — what "cinematic" means here, 14. Non-negotiables, 15. Open questions — ASK before assuming, 16. File map (actual repo state) (+13 more)

### Community 10 - "Claude Memory Doc"
Cohesion: 0.09
Nodes (21): 0. Where we are (rev 2026-06-10), 10. Anchor moments (these MUST land), 11. Cross-cutting threads (use in `/throughlines`), 12. Voice rules, 13. Visual reference — what "cinematic" means here, 14. Non-negotiables, 15. Open questions — ASK before assuming, 16. File map (actual repo state) (+13 more)

### Community 13 - "Story Pass 01 Spec"
Cohesion: 0.10
Nodes (20): 0. How to use this document, 1. Non-negotiable guardrails (from CLAUDE.md §14), 2. Creative invariants — the soul. Do NOT sand these off., 3. Verify-as-you-go, Appendix A — Beat → building → behavior quick map, Appendix B — Owner asset handback (fill in PASS-01-NOTES.md), STORY-PASS-01 — Autonomous build spec for OpenCode, T0 — Discovery + safety net  *(do this first, always)* (+12 more)

### Community 14 - "Package Manifest"
Cohesion: 0.11
Nodes (18): description, devDependencies, draco3d, exifr, @gltf-transform/core, @gltf-transform/extensions, @gltf-transform/functions, http-server (+10 more)

### Community 15 - "Ledger Cleanup Scripts"
Cohesion: 0.13
Nodes (14): ledgerPath, obj, outPath, raw, uniq(), apply, args, fs (+6 more)

### Community 16 - "App Bootstrap & Grid"
Cohesion: 0.13
Nodes (17): bindEvents(), bindNavLinks(), computeAge(), getDominantBucketKey(), getTone(), gridYears(), groupBy(), init() (+9 more)

### Community 17 - "Gallery Image Optimizer"
Cohesion: 0.12
Nodes (11): DISPLAY, DISPLAY_DIR, files, force, GALLERY_JSON, idMap, paths, root (+3 more)

### Community 19 - "Story Pass 03 Spec"
Cohesion: 0.12
Nodes (15): 0. HARD GUARDRAILS — read before touching anything (pass-02 broke these), 1. Current state (verified in a real browser by the design lead), 2. GROUND TRUTH — real building world positions (measured live from the GLB), 3. TASKS, 4. After OpenCode finishes (for Anirudh + the design lead), P1 — Confirm the two applied fixes; same-class audit, P2 — Real `frameBuilding()` and bake correct camera framing (THE main task), P3 — Arrival & CTA wide framing of the whole city (+7 more)

### Community 20 - "Ledger XLSX Migration"
Cohesion: 0.20
Nodes (14): buf, buildTagSummary(), data, __dirname, FIELD_MAP, formatWeekKey(), mapEntryFields(), normalizeKey() (+6 more)

### Community 21 - "Folder Sheet & Detail View"
Cohesion: 0.15
Nodes (14): buildFolderSheet(), escapeHtml(), extractLinkedInEmbedUrl(), fact(), formatDate(), init3DPlane(), openArtifactView(), openLightbox() (+6 more)

### Community 22 - "Cluster Pages & Editor"
Cohesion: 0.19
Nodes (14): closeProjectPage(), deleteEntry(), findBucketForTags(), getKnownRoles(), groupEntriesByBucket(), leaveProjectArtifactMode(), loadSocialEmbeds(), openClusterPage() (+6 more)

### Community 23 - "Asset Pipeline Handoff"
Cohesion: 0.14
Nodes (13): 0. Locked decisions (do NOT relitigate), 1. HARD GUARDRAILS (violations = task failure), 2. Current state (facts — RE-VERIFY against the live file, it's changing), 3. Task A — gitignore raw, keep derivatives committable, 4. Task B — compress proof + wire folders (THE deterministic mapping), 4a. Numbered folders → same-id entry (MERGE evidence), 4b. Named folders → ATTACH to existing entry (MERGE evidence, do NOT create new), 4c. Named folders → CREATE NEW entry (ids = max(existing id)+1, sequential, computed live) (+5 more)

### Community 24 - "Project README"
Cohesion: 0.14
Nodes (13): Controls, Credits, Pass 04: JSON is canonical, Pixel Explorer — Portfolio Archive, Project state (May 2026), Quick start, Re-seeding from xlsx (rare), Role-driven facades (+5 more)

### Community 25 - "Story Asset Plan"
Cohesion: 0.14
Nodes (13): Atmosphere (Higgsfield-direct, no Dimension base), Audio, Evidence cards, Field background (full-bleed, one flat color per beat), Material (identical on EVERY building), Orb = cursor, PART 1 — GLOBAL SPECS, PART 2 — PER-BEAT ASSETS (12 beats) (+5 more)

### Community 26 - "Story Pass 04 Spec"
Cohesion: 0.14
Nodes (13): 0. HARD ISOLATION — non-negotiable, self-policing, 1. Don't regress pass-03's wins, 2. TASKS, 3. After OpenCode finishes (operator), P0 — Snapshot off-limits trees (self-policing guard), P1 — Baseline verification (no code change beyond cache bump), P2 — Lift hero framings into the upper-middle, clear of the caption, P3 — Multi-building beats fit all subjects (+5 more)

### Community 28 - "Story Mode Architecture Doc"
Cohesion: 0.15
Nodes (11): Architecture overview, Background management (story-engine.js), Beat 15-17 archive transition (arrival→cta→handoff), Building lifecycle (beat-buildings.js), Chase mode (camera-rig.js), Data flow, How to test, Key concepts (+3 more)

### Community 29 - "Cluster Layout Transform"
Cohesion: 0.17
Nodes (9): classifyTier(), clusterLayout(), data, entries, entriesByMonth, groups, HEAVY_TAGS, knownKeys (+1 more)

### Community 32 - "Coordinate Matching Fixed"
Cohesion: 0.18
Nodes (8): classifyTier(), clusterLayout(), data, entries, entriesByMonth, groups, HEAVY_TAGS, stagerNodes

### Community 33 - "GLB Coordinate Extraction"
Cohesion: 0.23
Nodes (11): decompose(), IDENT, io, len3(), mul(), results, rows, skip() (+3 more)

### Community 35 - "Terrain Core & Roles"
Cohesion: 0.17
Nodes (6): LOD, MONTH_LABELS, PRIORITY_TAGS, ROLE_BUCKETS, TAG_COLORS, TOKENS

### Community 36 - "Layout & Grid Spec"
Cohesion: 0.18
Nodes (10): 1. Core Philosophy, 2. Modal & Detail View Structure, 3. Archival Specific Layout Patterns, 4. Visual Treatments, Layout & Grid System: Archival Pages, Modals & Roles, Massive Lists ("Hats Worn"), Sequential Navigation ("Same Week"), Split-Screen Archival Layout (+2 more)

### Community 37 - "Ledger XLSX Export"
Cohesion: 0.27
Nodes (7): Convert-Year(), Get-CellValue(), Get-ColName(), Get-DateParts(), Get-EntryText(), Get-SharedStrings(), Read-Sheet()

### Community 38 - "Proof Evidence Wiring"
Cohesion: 0.18
Nodes (8): data, LEDGER_PATH, maxId, NAMED_ATTACH, NAMED_NEW, NUMBERED, PROOF, root

### Community 40 - "Brutal Folder Spec"
Cohesion: 0.20
Nodes (9): Acceptance criteria, Constraints, Implementation map, Part A — Kill the split: folders overlay the full-viewport 3D, Part B — Bubble-pop choreography (the organic, immersive animation), Part C — Scene cleanup: keep ONLY the city cluster, Run / verify, SPEC — Immersive folder overlay (no split) + choreography + scene cleanup (+1 more)

### Community 41 - "Manila V2 Reference Specs"
Cohesion: 0.20
Nodes (9): 1. Aceternity — Animated Tooltip  →  FOLDER HOVER, 2. Aceternity — Tabs  →  CLICK = COME TO FRONT + EXPAND, 3. Aceternity — Draggable Card  →  DRAG WHEN STACKED, 4. Massimo CodePen — the folder shape + open anim  →  PORT TO VERTICAL, 5. 98.css — Tabs (multirows)  →  BOTTOM MENUBAR, 6. Indrajaal codex + single page  →  CODEX MODE WIRING, Motion budget / feel, OC REFS — inspiration → exact behaviour spec (Manila v2) (+1 more)

### Community 42 - "Coordinate Matching Sorted"
Cohesion: 0.22
Nodes (7): classifyTier(), clusterLayout(), data, entriesByMonth, groups, HEAVY_TAGS, stagerNodes

### Community 43 - "Duplicate Merge Script"
Cohesion: 0.31
Nodes (6): backupPath, DSU, ledgerPath, levenshtein(), main(), normalize()

### Community 44 - "Proof Image Optimizer"
Cohesion: 0.20
Nodes (6): files, folders, force, PROOF, root, SKIP

### Community 45 - "Story Pass 01 Notes"
Cohesion: 0.20
Nodes (9): Audio (14 files), Commit log, Proof images, STORY-PASS-01 — Handback notes, Tasks T0–T11 complete, Test URLs, Verified, What's stubbed / needs owner assets (+1 more)

### Community 46 - "Coordinate Matching"
Cohesion: 0.25
Nodes (7): classifyTier(), clusterLayout(), data, entriesByMonth, groups, HEAVY_TAGS, stagerNodes

### Community 47 - "Gallery EXIF Enrichment"
Cohesion: 0.22
Nodes (6): data, dn, MONTHS, MONTHS_FULL, rawById, tod

### Community 48 - "GLB Inspector"
Cohesion: 0.22
Nodes (7): buf, chunk0Len, chunk0Type, json, magic, total, version

### Community 49 - "Story Pass 02 Notes"
Cohesion: 0.22
Nodes (8): Branch, Cache tag, Commits (after pass-01 base), Known warnings (benign), State, STORY-PASS-02 NOTES, Testing, TODOs

### Community 50 - "Typography Spec"
Cohesion: 0.22
Nodes (8): 1. Core Philosophy, 2. Typographic Hierarchy, 3. Interaction Typography, Archival Metadata & Micro-copy, Body Copy (Notes & Descriptions), Display / Hero Titles (Project Names & Roles), Sub-headers & Categorization (H2, H3), Typography System: Archival Pages, Modals & Roles

### Community 51 - "Manila V2 Handoff"
Cohesion: 0.25
Nodes (7): Acceptance (every item must hold), Anti-asks (don't do), Files to deliver, HANDOFF — Manila folders v2 (OpenCode), Run / verify, The six inspirations (one-line distill — full notes in OC-REFS-MANILA-V2.md), What you're building

### Community 52 - "Manila V2 Codemap"
Cohesion: 0.25
Nodes (7): app.js, Cluster map (terrain.js STAGER_BUILDING_ENTRY), Data shape (entry), GSAP safety rule (critical — from CLAUDE.md), index.html, OC CODEMAP — where everything lives (Manila v2), styles.css

### Community 53 - "Story Pass 03 Notes"
Cohesion: 0.25
Nodes (7): Branch, Cache tag, Commits (pass-03, 9 commits), Known gaps, State, STORY-PASS-03 NOTES, Verification

### Community 54 - "Role Filters & Nav Pages"
Cohesion: 0.29
Nodes (7): applyFilters(), entries, groupEntriesBy(), openNavPage(), previewRole(), renderNavPage(), setActiveRole()

### Community 55 - "Entry Selection & Zoom"
Cohesion: 0.38
Nodes (7): getVisibleEntries(), hideDetail(), initTerrain(), selectEmptyWeek(), selectEntry(), setZoom(), stepEntry()

### Community 56 - "Gallery Codex & Motion"
Cohesion: 0.29
Nodes (7): initCodexScroller(), initGalleryMotion(), initGridCanvas(), openGalleryOverlay(), renderGallery(), switchGalleryTab(), bounds

### Community 57 - "Proof Linking TODO"
Cohesion: 0.33
Nodes (5): After this commit: remaining work, Named folders → attached to existing entry, New draft entries (status: Draft, desc blank), Numbered folders → same-id entry (merged), Proof wiring summary (asset-pipeline)

### Community 58 - "Duplicate Cleanup Script"
Cohesion: 0.40
Nodes (4): backupPath, ledgerPath, levenshtein(), main()

### Community 59 - "GLB Extractor"
Cohesion: 0.33
Nodes (3): io, root, target

### Community 60 - "Quarantined Gallery Recovery"
Cohesion: 0.33
Nodes (4): CAP, d, dist, SG

### Community 61 - "Duplicate Report Generator"
Cohesion: 0.50
Nodes (4): ledgerPath, main(), normalize(), reportPath

### Community 62 - "Story Pass 04 Notes"
Cohesion: 0.40
Nodes (4): Files Modified, PASS-04 — Polish + Hard Isolation, Summary, Violations Caught

### Community 63 - "Cluster Node Extraction"
Cohesion: 0.50
Nodes (3): io, newClusterNode, root

### Community 64 - "Cluster Node Printer"
Cohesion: 0.50
Nodes (3): io, newClusterNode, root

### Community 65 - "EXIF Extraction Script"
Cohesion: 0.83
Nodes (3): collectFiles(), decimalToDMS(), run()

### Community 66 - "Chhello Entry Finder"
Cohesion: 0.50
Nodes (3): { entries }, ledgerPath, matches

### Community 67 - "Precommit Self-Test"
Cohesion: 0.67
Nodes (3): assert(), check(), { readFileSync }

## Knowledge Gaps
- **459 isolated node(s):** `data`, `years`, `weeks`, `months`, `weekCells` (+454 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BeatBuildings` connect `Beat Building Choreography` to `Story Mode Modules`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `StoryEngine` connect `Story Engine Core` to `Story Mode Modules`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `AudioManager` connect `Story Audio & Voice` to `Story Mode Modules`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `data`, `years`, `weeks` to the rest of the system?**
  _459 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Story Mode Modules` be split into smaller, more focused modules?**
  _Cohesion score 0.05075187969924812 - nodes in this community are weakly interconnected._
- **Should `Story Pass 02 Spec` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Archive UI State & Filters` be split into smaller, more focused modules?**
  _Cohesion score 0.07058823529411765 - nodes in this community are weakly interconnected._