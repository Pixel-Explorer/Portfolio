# Graph Report - Archival app  (2026-07-16)

## Corpus Check
- 66 files · ~174,001 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 793 nodes · 1090 edges · 61 communities (41 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `303b8584`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Story Mode Modules|Story Mode Modules]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Archive UI State & Filters|Archive UI State & Filters]]
- [[_COMMUNITY_Kitbash GLB Converter|Kitbash GLB Converter]]
- [[_COMMUNITY_Decal Merge Script|Decal Merge Script]]
- [[_COMMUNITY_Hero Model Batch Pipeline|Hero Model Batch Pipeline]]
- [[_COMMUNITY_Design Direction Doc|Design Direction Doc]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Beat Building Choreography|Beat Building Choreography]]
- [[_COMMUNITY_Agents Memory Doc|Agents Memory Doc]]
- [[_COMMUNITY_Claude Memory Doc|Claude Memory Doc]]
- [[_COMMUNITY_Story Engine Core|Story Engine Core]]
- [[_COMMUNITY_Story Audio & Voice|Story Audio & Voice]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Package Manifest|Package Manifest]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_App Bootstrap & Grid|App Bootstrap & Grid]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Story UI Overlays|Story UI Overlays]]
- [[_COMMUNITY_Ledger XLSX Migration|Ledger XLSX Migration]]
- [[_COMMUNITY_Folder Sheet & Detail View|Folder Sheet & Detail View]]
- [[_COMMUNITY_Cluster Pages & Editor|Cluster Pages & Editor]]
- [[_COMMUNITY_Project README|Project README]]
- [[_COMMUNITY_Story Transitions|Story Transitions]]
- [[_COMMUNITY_Story Self-Test Harness|Story Self-Test Harness]]
- [[_COMMUNITY_Story Tune Panel|Story Tune Panel]]
- [[_COMMUNITY_Coordinate Matching Fixed|Coordinate Matching Fixed]]
- [[_COMMUNITY_Camera Rig & Chase|Camera Rig & Chase]]
- [[_COMMUNITY_Terrain Core & Roles|Terrain Core & Roles]]
- [[_COMMUNITY_Layout & Grid Spec|Layout & Grid Spec]]
- [[_COMMUNITY_Ledger XLSX Export|Ledger XLSX Export]]
- [[_COMMUNITY_Mobile Teaser|Mobile Teaser]]
- [[_COMMUNITY_GLB Inspector|GLB Inspector]]
- [[_COMMUNITY_Typography Spec|Typography Spec]]
- [[_COMMUNITY_Role Filters & Nav Pages|Role Filters & Nav Pages]]
- [[_COMMUNITY_Entry Selection & Zoom|Entry Selection & Zoom]]
- [[_COMMUNITY_GLB Extractor|GLB Extractor]]
- [[_COMMUNITY_EXIF Extraction Script|EXIF Extraction Script]]
- [[_COMMUNITY_Precommit Self-Test|Precommit Self-Test]]
- [[_COMMUNITY_GLB Bounding Box|GLB Bounding Box]]
- [[_COMMUNITY_Audio Assets README|Audio Assets README]]
- [[_COMMUNITY_GLB Texture Dump|GLB Texture Dump]]
- [[_COMMUNITY_Community 207|Community 207]]
- [[_COMMUNITY_Community 212|Community 212]]
- [[_COMMUNITY_Community 230|Community 230]]
- [[_COMMUNITY_Community 338|Community 338]]
- [[_COMMUNITY_Community 348|Community 348]]
- [[_COMMUNITY_Community 379|Community 379]]
- [[_COMMUNITY_Community 407|Community 407]]
- [[_COMMUNITY_Community 2118|Community 2118]]
- [[_COMMUNITY_Community 4842|Community 4842]]
- [[_COMMUNITY_Community 5366|Community 5366]]
- [[_COMMUNITY_Community 5570|Community 5570]]
- [[_COMMUNITY_Community 5633|Community 5633]]
- [[_COMMUNITY_Community 5634|Community 5634]]
- [[_COMMUNITY_Community 5679|Community 5679]]
- [[_COMMUNITY_Community 5978|Community 5978]]

## God Nodes (most connected - your core abstractions)
1. `BeatBuildings` - 25 edges
2. `init()` - 23 edges
3. `escapeHtml()` - 23 edges
4. `StoryEngine` - 23 edges
5. `AudioManager` - 20 edges
6. `StoryUI` - 17 edges
7. `Orb` - 16 edges
8. `ScrollManager` - 14 edges
9. `Transitions` - 14 edges
10. `TunePanel` - 14 edges

## Surprising Connections (you probably didn't know these)
- `handleApi()` --calls--> `optimizeGlb()`  [INFERRED]
  scripts/static-server.mjs → scripts/optimize-glb.mjs

## Import Cycles
- None detected.

## Communities (61 total, 20 thin omitted)

### Community 0 - "Story Mode Modules"
Cohesion: 0.09
Nodes (8): BEATS, ERA_COLORS, ColorGrader, ExplodeView, SelfTest, BG_COLORS, BEAT_TUNING, GLOBAL_TUNING

### Community 2 - "Archive UI State & Filters"
Cohesion: 0.04
Nodes (40): caseStudies, CONTACT_ICONS, CS_MONTHS, csCleanLabel(), csFigures(), csMagnitude(), csParseFig(), data (+32 more)

### Community 3 - "Kitbash GLB Converter"
Cohesion: 0.08
Nodes (26): files, io, mats, mtlName, mtlPath, mtlText, objName, objPath (+18 more)

### Community 4 - "Decal Merge Script"
Cohesion: 0.07
Nodes (25): a, authoredKitDecals, baseNodes, buffers, cityRoot, cos, decalScale, dx (+17 more)

### Community 5 - "Hero Model Batch Pipeline"
Cohesion: 0.09
Nodes (24): args, BUILDINGS, cityPath, defaultCityPath, defaultWorkDir, __dirname, dryRun, entryTitleMap() (+16 more)

### Community 6 - "Design Direction Doc"
Cohesion: 0.07
Nodes (28): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (8): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Product, Product Purpose, Register, Users

### Community 9 - "Agents Memory Doc"
Cohesion: 0.08
Nodes (24): 0. Where we are (rev 2026-07-13), 0a. Code knowledge graph (graphify) — consult BEFORE scanning files, 10. Anchor moments (these MUST land), 11. Cross-cutting threads (use in `/throughlines`), 12. Voice rules, 13. Visual reference — what "cinematic" means here, 14. Non-negotiables, 15. Open questions — ASK before assuming (+16 more)

### Community 10 - "Claude Memory Doc"
Cohesion: 0.08
Nodes (22): 0. Where we are (rev 2026-07-16b), 0a. Code knowledge graph (graphify) — consult BEFORE scanning files, 10. Anchor moments (these MUST land), 11. Cross-cutting threads (use in `/throughlines`), 12. Voice rules, 13. Visual reference — what "cinematic" means here, 14. Non-negotiables, 15. Open questions — ASK before assuming (+14 more)

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (7): cityTmp, clientsTmp, csFolder, dir, graphTmp, rolesTmp, skip

### Community 14 - "Package Manifest"
Cohesion: 0.07
Nodes (28): description, devDependencies, draco3d, eslint, @eslint/js, exifr, globals, @gltf-transform/core (+20 more)

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (5): clientStickleIds(), entryStickleIds(), getEntryThemePill(), getEntryThemes(), pickStickleIcon()

### Community 16 - "App Bootstrap & Grid"
Cohesion: 0.10
Nodes (24): animateCount(), bindEvents(), bindNavLinks(), bindNavMenu(), computeAge(), computeUniqueClientCount(), computeUniqueRoleCount(), computeYearRange() (+16 more)

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (6): initCodexScroller(), initGalleryMotion(), initGridCanvas(), openGalleryOverlay(), renderGallery(), switchGalleryTab()

### Community 20 - "Ledger XLSX Migration"
Cohesion: 0.20
Nodes (14): buf, buildTagSummary(), data, __dirname, FIELD_MAP, formatWeekKey(), mapEntryFields(), normalizeKey() (+6 more)

### Community 21 - "Folder Sheet & Detail View"
Cohesion: 0.11
Nodes (24): buildEditorialFeatureHTML(), buildEntryArtifactHTML(), buildFolderSheet(), escapeHtml(), extractLinkedInEmbedUrl(), fact(), formatDate(), getClientLogoSticker() (+16 more)

### Community 22 - "Cluster Pages & Editor"
Cohesion: 0.15
Nodes (19): closeProjectPage(), collapseMergedEntries(), findBucketForTags(), getKnownRoles(), groupEntriesByBucket(), hideDetail(), leaveProjectArtifactMode(), loadSocialEmbeds() (+11 more)

### Community 24 - "Project README"
Cohesion: 0.14
Nodes (13): Controls, Credits, Pass 04: JSON is canonical, Pixel Explorer — Portfolio Archive, Project state (May 2026), Quick start, Re-seeding from xlsx (rare), Role-driven facades (+5 more)

### Community 32 - "Coordinate Matching Fixed"
Cohesion: 0.50
Nodes (3): OUT, skip, TMP

### Community 35 - "Terrain Core & Roles"
Cohesion: 0.15
Nodes (7): DEBUG, LOD, MONTH_LABELS, PRIORITY_TAGS, ROLE_BUCKETS, TAG_COLORS, TOKENS

### Community 36 - "Layout & Grid Spec"
Cohesion: 0.18
Nodes (10): 1. Core Philosophy, 2. Modal & Detail View Structure, 3. Archival Specific Layout Patterns, 4. Visual Treatments, Layout & Grid System: Archival Pages, Modals & Roles, Massive Lists ("Hats Worn"), Sequential Navigation ("Same Week"), Split-Screen Archival Layout (+2 more)

### Community 37 - "Ledger XLSX Export"
Cohesion: 0.27
Nodes (7): Convert-Year(), Get-CellValue(), Get-ColName(), Get-DateParts(), Get-EntryText(), Get-SharedStrings(), Read-Sheet()

### Community 48 - "GLB Inspector"
Cohesion: 0.22
Nodes (7): buf, chunk0Len, chunk0Type, json, magic, total, version

### Community 50 - "Typography Spec"
Cohesion: 0.22
Nodes (8): 1. Core Philosophy, 2. Typographic Hierarchy, 3. Interaction Typography, Archival Metadata & Micro-copy, Body Copy (Notes & Descriptions), Display / Hero Titles (Project Names & Roles), Sub-headers & Categorization (H2, H3), Typography System: Archival Pages, Modals & Roles

### Community 54 - "Role Filters & Nav Pages"
Cohesion: 0.15
Nodes (15): applyFilters(), buildClientGroups(), buildRoleSubfolders(), deleteEntry(), entries, groupEntriesBy(), openNavPage(), previewRole() (+7 more)

### Community 55 - "Entry Selection & Zoom"
Cohesion: 0.32
Nodes (8): closeArtifactView(), getVisibleEntries(), initTerrain(), resetPageSEO(), selectEmptyWeek(), selectEntry(), setZoom(), stepEntry()

### Community 59 - "GLB Extractor"
Cohesion: 0.33
Nodes (3): io, root, target

### Community 65 - "EXIF Extraction Script"
Cohesion: 0.83
Nodes (3): collectFiles(), decimalToDMS(), run()

### Community 67 - "Precommit Self-Test"
Cohesion: 0.67
Nodes (3): assert(), check(), { readFileSync }

### Community 207 - "Community 207"
Cohesion: 0.12
Nodes (11): DISPLAY, DISPLAY_DIR, files, force, GALLERY_JSON, idMap, paths, root (+3 more)

### Community 212 - "Community 212"
Cohesion: 0.29
Nodes (10): detectLinkType(), evidencePreviewSrc(), evidenceToSlot(), extractBehanceId(), extractGoogleDriveId(), extractInstagramPath(), extractXPostPath(), extractYouTubeId() (+2 more)

### Community 230 - "Community 230"
Cohesion: 0.11
Nodes (20): cityLoad, debounce(), DEBUG, getStatusMsg(), init(), initCursor(), initHandoffGate(), initKickerScramble() (+12 more)

### Community 338 - "Community 338"
Cohesion: 0.67
Nodes (3): download(), downloadGoogleFont(), OUT

### Community 348 - "Community 348"
Cohesion: 0.40
Nodes (5): categories, destPath, __dirname, run(), scrapeCategory()

### Community 379 - "Community 379"
Cohesion: 0.50
Nodes (3): BEAT_CAMS, lerp(), lerpVec()

### Community 407 - "Community 407"
Cohesion: 0.50
Nodes (3): families, FONTS_DIR, geistWeights

### Community 2118 - "Community 2118"
Cohesion: 0.22
Nodes (6): data, dn, MONTHS, MONTHS_FULL, rawById, tod

## Knowledge Gaps
- **281 isolated node(s):** `data`, `caseStudies`, `years`, `weeks`, `months` (+276 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BeatBuildings` connect `Beat Building Choreography` to `Story Mode Modules`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `StoryEngine` connect `Story Engine Core` to `Story Mode Modules`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `AudioManager` connect `Story Audio & Voice` to `Story Mode Modules`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `data`, `caseStudies`, `years` to the rest of the system?**
  _281 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Story Mode Modules` be split into smaller, more focused modules?**
  _Cohesion score 0.08780487804878048 - nodes in this community are weakly interconnected._
- **Should `Archive UI State & Filters` be split into smaller, more focused modules?**
  _Cohesion score 0.03932244404113733 - nodes in this community are weakly interconnected._
- **Should `Kitbash GLB Converter` be split into smaller, more focused modules?**
  _Cohesion score 0.07563025210084033 - nodes in this community are weakly interconnected._