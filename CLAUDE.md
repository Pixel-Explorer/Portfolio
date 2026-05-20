# CLAUDE.md

> Persistent project memory for Claude Code. Auto-loaded at session start.
> Keep this under 400 lines. Anything that bloats it costs context every session.

---

## 1. Project identity

**Cinematic personal portfolio web app for Anirudh Venkatesan ("Pixel Explorer").**

A two-mode narrative experience:
- **Story Mode** (`/`) — directed, scroll-locked cinematic film of his life 1991 → 2026.
- **Archive Mode** (`/firsts`, `/roles`, `/throughlines`, `/ledger`) — filterable proof catalog. *Already built as v1 in Codex; currently broken after UI rehaul.*

Chronology = spine. Roles = overlays. Artifacts = proof. Treat eras as chapters.

---

## 2. The person

| Field | Value |
|---|---|
| Name | Anirudh Venkatesan |
| Alias | Pixel Explorer |
| Born | 23 Sep 1991, Khambhat, Gujarat (Tamil-Brahmin family already in Gujarat — **NOT Tamil Nadu**) |
| Raised | Anand, Gujarat |
| Based | Pondicherry (since late 2024) |
| Languages | English, Hindi, Tamil, Gujarati |
| Email | `1991anirudh@gmail.com` / `admin@pixelhaus.in` |
| Web | `pixelhaus.in` |
| Company | Haus of Pixels OPC Pvt Ltd · CIN `U72900GJ2022OPC131119` (registered Apr 2022, Anand) |
| Self-description | "15+ job roles played." Artist · Filmmaker · Cinematographer · Photographer · Designer · Founder · Researcher · Blockchain Expert · Computational Photography Expert |
| Status (May 2026) | Just laid off from Rabble Labs. Hunting next consulting role. Has a dog. |

---

## 3. North star

**Land the next consulting role before end of May 2026.**
The site is the pitch. Recruiters and businesses must see, in under 60 seconds, that hiring him = hiring a one-person studio across design / film / photo / web3 / animation / strategy.

**Hard deadline:** ~2 weeks from this writing (15 May → 31 May 2026).

---

## 4. Audience

| Tier | Audience | What they want |
|---|---|---|
| Primary | Recruiters + businesses hiring for design / film / consulting | Fast proof of breadth + depth. Skim, verify, contact. |
| Secondary | Peers, internet, fellow creatives | Story, craft, personality. Slow burn. |

**Implication:** Archive Mode is the deal-closer; Story Mode is the seduction. Story Mode must have a visible "Skip film → archive" exit at all times.

**Sell the pitch:** "Hire one operator. Get a studio's output across the creative spectrum."
Lead with film / ads / corporate / documentary work — that's where he has the most volume.

---

## 5. Site architecture

```
/                          → Story Mode (front door, cinematic)
/archive                   → Archive landing (already built in v1)
/firsts                    → Firsts ledger (41 milestones)
/roles                     → Roles index (27 roles, filterable)
/throughlines              → Cross-cutting relationship arcs
/ledger                    → Year-by-year master timeline
/now                       → Current availability + contact (consulting pitch surface)
```

**Persistent UI:**
- Mode toggle top-right (Story ↔ Archive) — never lose user position.
- Year ticker top-left (fixed in Story Mode, scrubs as user scrolls).
- "Skip film → archive" link bottom-right of Story Mode.

---

## 6. Story Mode — 11 scenes, one per era

Each scene = pinned background + 3-act content rail (hook line → context → proof artifact). ~3–6 viewports of scroll per scene.

| # | Era | Anchor visual | Hook line | Proof reveal |
|---|---|---|---|---|
| 01 | 1991 Khambhat | Map zoom Gujarat → Khambhat, sun flare | "Born in light." | Birth year, family note |
| 02 | 2009–2013 SEMCOM + AIESEC | Campus → OGX poster Nov 2010 | "First commercial pixel: November 2010." | Poster, LCP appointment letter |
| 03 | 2013–2014 NID drift | Empty Anand street, rejection slip | "The year that didn't take." | Pep & Joss film, Schoogle exit email |
| 04 | 2015 Chhello Divas | Film slate, view counter ticking to 539K | "One reference. One month. One movie." | YT clips, BTS stills |
| 05 | 2016–2018 Pondi + Tarikshir | Pondicherry sea, book cover unfurls | "First stamp: Dubai." | Tarikshir book, Hive posts, Displate prints |
| 06 | 2018–2021 Pixelate genesis | NEAR logo + hackathon trophy | "$15K, deposited Oct 14 — eleven years to the day." | Cert, grant doc, NEAR blog post |
| 07 | 2022 Haus of Pixels OPC | Studio render | "I gave the practice a building." | MCA filing, CIN U72900GJ2022OPC131119 |
| 08 | 2024 cliff | Calendar shredding Jul 25 → Aug 28 | "Six applications in one day." | Pixelate close email, Auroville accept emails |
| 09 | 2024–2026 Rabble | Karan's Nov 2 2021 DM → Sep 17 2024 offer | "Three years from message to job." | Trial offer, permanent offer, layoff |
| 10 | 2025 Shivanata | Buddy Tales frames, 72-day counter | "Born and shelved in seventy-two days." | Hire date → close date |
| 11 | 2026 May (now) | Empty desk, blinking cursor | "Open to consult." | CV, contact form |

---

## 7. Reusable primitives (build 5, use 11+ times)

| Primitive | Spec | Notes |
|---|---|---|
| `PinnedScene` | Sticky 300vh container; GSAP ScrollTrigger pin | Wrap every scene |
| `HookLine` | Kinetic type. Mask / kern / reveal on scroll progress 0 → 1 | One per scene |
| `ProofCard` | Artifact tile. Slides in at progress > 0.6 | Image, PDF, email screenshot, video frame |
| `YearTicker` | Fixed top-right. Scrubs era + year as user scrolls | One global instance |
| `Letterbox` | Top/bottom bars close on scene boundary | Cinematic punctuation |

---

## 8. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Scroll | **GSAP + ScrollTrigger** | Genre standard, free for personal use |
| Smooth scroll | **Lenis** | Required for the cinematic feel |
| 3D | **Three.js** (selective) | Use ONLY for Khambhat globe zoom (Scene 01), maybe `/now` cursor. Don't 3D-ify what 2D can do. |
| Build | **Codex-antigravity-vscode + Claude Code** | Anirudh's flow. Vibecoded by him. |
| Asset gen | **Higgsfield + Freepik** | Backgrounds, era posters, ambient loops |
| Framework | **Whatever v1 archive is built in** | Read v1 first. Do not migrate framework. Don't break what works. |

**Stack rules:**
- No React migration unless v1 is already React.
- No CMS. Data lives in JSON/MDX in repo.
- Mobile must work but desktop-cinematic is the showcase.

---

## 9. Data — single source of truth

| File | Purpose |
|---|---|
| `/content/ledger.md` | The 954-line chronological ledger. Master narrative source. |
| `/data/eras.json` | 11 era objects (id, years, title, signal, summary). |
| `/data/events.json` | All ~110+ events from MASTER sheet. Schema below. |
| `/data/people.json` | 22 bridge people + arcs. |
| `/data/firsts.json` | 41 first-ever milestones. |
| `/data/throughlines.json` | 8 cross-cutting relationship arcs. |
| `/public/proof/` | Image/PDF/video proof artifacts. |
| `anirudh-ledger-workbook.xlsx` | Source spreadsheet (v3 currently; v4 in progress). Treat as upstream — never edit programmatically. |

### Schema (TypeScript)

```ts
type Era = {
  id: string;              // "08-cliff-2024"
  years: [number, number];
  title: string;
  signal: 'low' | 'mid' | 'high' | 'peak';
  summary: string;
  scene_number: number;    // 1-11
};

type Event = {
  id: string;
  date: string;            // ISO or "2024-Q2" or "2014" if year only
  title: string;
  era_id: string;
  roles: Role[];
  category: 'creative'|'design'|'photo'|'film'|'web3'|'startup'|
            'consulting'|'tech'|'paid'|'personal'|'education'|'volunteer';
  significance: 'first'|'turning-point'|'earning'|'grant'|'shift'|
                'project'|'milestone'|'collaboration';
  description: string;
  evidence: Evidence[];
  tentative?: boolean;     // memory-based, not document-backed
};

type Evidence = {
  type: 'image'|'pdf'|'video'|'url'|'email'|'screenshot';
  src: string;
  caption?: string;
};

type Role = 'designer'|'photographer'|'cinematographer'|'filmmaker'|
            'founder'|'consultant'|'researcher'|'faculty'|'marketer'|
            'animator'|'engineer'|'art-director'|'producer';
```

---

## 10. Anchor moments (these MUST land)

The narrative pivots on these dates. If a scene drops one, the scene is broken.

1. **23 Sep 1991** — Born, Khambhat, Gujarat.
2. **14 Oct 2010** — AIESEC induction. Day his structured public life begins.
3. **Nov 2010** — First commercial design: OGX Fair posters with Kunal Shah. *Predates "Pixel Explorer" alias by 5 years.*
4. **31 May 2012** — Elected Local Committee Coordinator (LCP-equivalent), AIESEC Vidyanagar.
5. **20 Nov 2015** — Chhello Divas releases. Asst Cinematographer + Unit Stills + BTS. ~539K combined YT views.
6. **Oct 2017** — Wins 54hr blockchain hackathon.
7. **Aug–Oct 2018** — Designs Tarikshir cover. Attends Dubai launch — first international travel.
8. **14 Oct 2021** — $15K NEAR Fast Grant deposited. **Exactly 11 years to the day after AIESEC induction.** Use this echo.
9. **Apr 2022** — Haus of Pixels OPC Pvt Ltd registered.
10. **25 Jul 2024** — Pixelate ends.
11. **28 Aug 2024** — Applies to 6 Auroville volunteer roles in one day. Two accepted same week.
12. **17 Sep 2024** — Rabble Labs offer. *Karan Aneja's first DM was 2 Nov 2021 — three-year incubation.*
13. **13 Oct 2025** — First time signs offer letters as employer (Shivanata animators).
14. **24 Dec 2025** — Shivanata shutdown. 72 days from first hire.
15. **May 2026** — Laid off from Rabble. *Site lives here.*

---

## 11. Cross-cutting threads (use in `/throughlines`)

Named arcs across years. These differentiate the site from a flat résumé.

| Thread | Arc | Years |
|---|---|---|
| Hardik Darji | AIESEC OC volunteer → Dubai book printer | 12 yrs (2012 → 2024) |
| Savan Barot | First contact → Shivanata co-founder | 11 yrs (2015 → 2025) |
| Khayaal Patel | Tarikshir → 3-book trilogy designer | 5+ yrs |
| Karan Aneja | NEAR DM → Rabble hire | 3 yrs (2021 → 2024) |
| Mitra Gadhvi | Chhello Divas lead actor → friend | 11+ yrs |
| Ronak Amin | Pixelate co-founder | 9+ yrs |
| SEMCOM | Student → Visiting Faculty (since 2016) | 17+ yrs |
| Anand (the town) | Born nearby → school → college → faculty → company HQ | 35 yrs |

---

## 12. Voice rules

**DO:**
- Specific dates over vague months. "14 Oct 2010" not "October 2010."
- Real artifacts over polished mockups. Show the actual Gmail screenshot.
- One-sentence hooks. Each scene gets ONE hook line. Nothing more.
- Numbers. "539K views" / "$15K grant" / "72 days" / "6 applications in one day."
- His own words where possible (from emails, posts, the original portfolio PDF).

**DON'T:**
- Generic portfolio language ("passionate," "creative," "innovative").
- Motivational filler.
- Stock photography. Every visual is either his or AI-generated to spec.
- Filling gaps by inventing. If evidence is missing, mark tentative or omit.
- Long paragraphs in Story Mode. Story Mode is image-led; copy is sparse.

---

## 13. Visual reference — what "cinematic" means here

Pattern language pulled from the inspo set Anirudh shared (shrshhez, artycoders, exploraX, nidhisingh, Oluwaphilemon threads):

| Device | Function |
|---|---|
| Pinned hero + scroll-locked chapters | Fixed stage, content moves through |
| Type-as-protagonist | Headlines kern / mask / reveal on scroll progress |
| Image curtain reveals | Splits, wipes, slides between scenes |
| Year-as-scrubber | Numeric anchor doubles as timeline cursor |
| Cursor-as-spotlight / magnetic UI | Micro-signal that the surface is alive |
| Letterbox + audio sting on chapter change | Cinematic punctuation |

**Anti-patterns:** Parallax for parallax's sake. Bouncy spring animations. Gradient text. Glassmorphism. Emoji.

---

## 14. Non-negotiables

1. **Don't break the v1 archive.** It works (partially). Read it before touching it.
2. **Evidence-backed only.** Every fact in the site has a proof artifact in `/public/proof/` or a tentative flag.
3. **Anirudh writes the prompts; Claude Code writes the code.** Don't generate copy unless asked.
4. **Token-frugal.** Anirudh is rationing across Codex / Claude Code / others. Don't propose rebuilds. Don't regenerate working files. Ask before destructive ops.
5. **Mobile parity is required, but the showcase is desktop.** Don't over-optimize for mobile at desktop's expense.
6. **No login, no analytics, no popups, no cookie banner** unless legally required.

---

## 15. Open questions — ASK before assuming

These are not yet decided. If a task touches them, ask Anirudh first.

| Q | Status |
|---|---|
| Story Mode fork: pure vertical pinned (A) vs horizontal era rail (B) vs hybrid (C)? | Tentatively A (recruiter-safe, 3-week build). Confirm. |
| Audio in Story Mode — yes/no? Ambient score per era? | Unconfirmed. |
| Is the v1 archive in React, vanilla JS, or something else? | Unknown to Claude — read `/archive` source first. |
| Three.js scope — Scene 01 globe only, or more scenes? | Default to Scene 01 only. Expand only if requested. |
| Mobile design philosophy — same scenes condensed, or different IA? | Unconfirmed. Default to same scenes condensed. |
| Final domain — pixelhaus.in or new domain? | Unconfirmed. |
| Contact mechanism — form, email link, Calendly, all three? | Unconfirmed. |

---

## 16. File map (target repo structure)

```
/
├── CLAUDE.md                          ← this file
├── BUILD_PLAN.md                      ← phased roadmap (to be created)
├── DESIGN.md                          ← design tokens, motion rules (to be created)
├── package.json
├── /content/
│   ├── ledger.md                      ← the 954-line ledger
│   └── /scenes/
│       ├── 01-khambhat.mdx
│       ├── 02-aiesec.mdx
│       └── ... (one per scene)
├── /data/
│   ├── eras.json
│   ├── events.json
│   ├── people.json
│   ├── firsts.json
│   └── throughlines.json
├── /public/
│   ├── /proof/                        ← real artifacts (emails, posters, frames)
│   ├── /generated/                    ← Higgsfield + Freepik outputs
│   └── /video/                        ← ambient loops, BTS clips
├── /src/
│   ├── /components/
│   │   ├── PinnedScene.{tsx|js}
│   │   ├── HookLine.{tsx|js}
│   │   ├── ProofCard.{tsx|js}
│   │   ├── YearTicker.{tsx|js}
│   │   └── Letterbox.{tsx|js}
│   ├── /scenes/                       ← 11 scene components
│   ├── /archive/                      ← existing v1 archive views
│   └── /lib/
│       ├── data.{ts|js}               ← query helpers
│       └── scroll.{ts|js}             ← GSAP + Lenis setup
└── /scripts/
    └── ledger-to-json.{ts|js}         ← parses ledger.md + xlsx into /data/
```

---

## 17. Session start checklist for Claude Code

When opened in a new session, before doing anything:

1. Read this file (`CLAUDE.md`).
2. Read `BUILD_PLAN.md` to see current phase.
3. If touching data: read `/content/ledger.md` for canonical facts.
4. If touching components: read the existing `/src/components/` to match existing patterns.
5. If touching the archive: read `/src/archive/` FIRST — it's partially built and fragile.
6. If unsure about a fact (date, name, event), check `/content/ledger.md` before asking Anirudh.
7. If a fact isn't in the ledger and isn't in evidence, **ask** — never invent.

---

## 18. Quick reference: where the heaviest narrative weight sits

| Era | Weight | Why |
|---|---|---|
| 1991 (birth) | High | The opening shot. Sets cinematic tone. |
| Oct 2010 (AIESEC) | Critical | Origin of structured creative life. |
| 2015 (Chhello Divas) | Critical | Most-viewed work. Recruiter-visible. |
| 2018 (Tarikshir Dubai) | High | First international, first published. |
| 14 Oct 2021 (NEAR grant) | Critical | The 11-year echo. Pure narrative gold. |
| Aug 2024 (cliff + pivot) | Critical | The human moment. Real, vulnerable, decisive. |
| May 2026 (now) | Critical | The CTA. Where consulting happens. |

Eras 03 (NID drift) and 10 (Shivanata) are valuable but lower-weight. Compress on mobile if needed.

---

*Last updated: 15 May 2026.*
*Maintained by Anirudh + Claude. Update this file when project state changes — don't rely on chat memory.*
