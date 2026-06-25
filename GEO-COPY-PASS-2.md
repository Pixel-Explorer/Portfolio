# GEO and Recruiter Copy Pass 2

> Status: editorial handoff only. No UI, runtime, styling, or ledger data has been changed.
>
> Date: 2026-06-21

## Outcome

The first GEO pass already improved the page metadata and most ledger titles. This pass focuses on the remaining high-value work:

1. Compress the landing-page thesis into loader-sized prompts.
2. Replace unsupported or ambiguous landing claims.
3. Consolidate related experience for recruiters without deleting chronology.
4. Rewrite the weakest descriptions in recruiter language.
5. Preserve clear, useful copy for people first, with structured facts that search and AI systems can also understand.

## Copy Brief

- **Page goal:** earn an archive visit, then a qualified contact.
- **Primary audience:** recruiters, founders, creative leaders, producers, and hiring managers.
- **Core value:** one senior creative operator across film, brand, photography, systems, production, web3, and generative AI.
- **Primary CTA:** enter the work archive.
- **Traffic context:** direct links, LinkedIn, referrals, search, and AI-assisted discovery.
- **Voice:** specific, restrained, evidence-led, and cinematic.

## 1. Loading-Screen Copy

### Existing typography constraints

- Main title: Instrument Serif, 56px, 280px container.
- Subtitle: Cascadia Code, 11px, widely tracked.
- Status: Cascadia Code, 10px.
- Main-title target: 5 to 14 visible characters where possible.
- Main-title hard cap: two lines.
- Subtitle target: 18 characters or fewer.
- Status target: 34 characters or fewer.
- Keep every phase visually similar in height to avoid the progress bar jumping.

### Recommended sequence

| Progress | Main title | Subtitle | Status |
|---|---|---|---|
| 0 to 19% | **Film + design** | ANIRUDH VENKATESAN | Reading 89 documented moments |
| 20 to 39% | **Brand systems** | CREATIVE SYSTEMS | Mapping 15+ roles |
| 40 to 59% | **One operator** | STUDIO RANGE | Loading 35 city buildings |
| 60 to 79% | **Real proof** | WORK, NOT CLAIMS | Connecting 58 backed entries |
| 80 to 94% | **Work city** | 1991 TO 2026 | Assembling the archive |
| 95 to 100% | **Look around** | ARCHIVE READY | Ready |

The counts should be derived from data when implemented, not permanently hard-coded.

### Implementation-ready copy object

```js
const LOADER_COPY = [
  {
    at: 0,
    title: "Film + design",
    subtitle: "ANIRUDH VENKATESAN",
    status: "Reading 89 documented moments",
  },
  {
    at: 20,
    title: "Brand systems",
    subtitle: "CREATIVE SYSTEMS",
    status: "Mapping 15+ roles",
  },
  {
    at: 40,
    title: "One operator",
    subtitle: "STUDIO RANGE",
    status: "Loading 35 city buildings",
  },
  {
    at: 60,
    title: "Real proof",
    subtitle: "WORK, NOT CLAIMS",
    status: "Connecting 58 backed entries",
  },
  {
    at: 80,
    title: "Work city",
    subtitle: "1991 TO 2026",
    status: "Assembling the archive",
  },
  {
    at: 95,
    title: "Look around",
    subtitle: "ARCHIVE READY",
    status: "Ready",
  },
];
```

### Alternative sequences

**More direct**

`Creative lead` -> `Film + brand` -> `15+ roles` -> `One operator` -> `Proof attached` -> `Enter`

**More cinematic**

`A life in work` -> `Many roles` -> `One practice` -> `Built from proof` -> `Rendered in 3D` -> `Look around`

The recommended sequence is stronger because it uses recognizable capability nouns before the more conceptual "one operator" idea.

## 2. Landing-Page Copy Rewrite

### Beat 1: Recruiter hook

**Current**

> You're hiring for a role that doesn't have a clean title yet.

**Recommended**

> Some briefs need more than one kind of creative.

**Alternative**

> One creative lead across film, brand and systems.

Why: the current line makes the profile sound difficult to place. The rewrite frames breadth as a property of the brief, not a problem with the candidate.

### Beat 2: Range

**Recommended**

> Film. Brand. Photography. Systems.  
> One operator across the handoffs.

Why: recognizable search and recruiter language arrives before the metaphor.

### Beat 3: Positioning

**Recommended lede**

> I build creative systems that keep brand, product, story and production coherent.

**Keep**

> Creative Systems Lead.

Remove "so a 5-person team ships like a 50-person one" unless a documented case study supports it.

### Beat 4: Proof

**Recommended headline**

> Studio range.  
> One operator.

**Recommended proof grid**

| Stat | Label |
|---|---|
| 15+ | roles |
| 58 | proof-backed entries |
| 539K+ | BTS views |
| $15K | NEAR grant |
| 15+ | years |

Remove "100+ design systems" unless the underlying inventory can be produced. "11 brands" and "04 sites" can return after the counting method is documented.

### Beat 5: Selected work

Keep the section title:

> Selected work, 2015 to 2025.

Correct the receipt captions:

| Asset | Year | Project | Safe role copy |
|---|---:|---|---|
| Chhello Divas | 2015 | Chhello Divas | Unit Stills + BTS |
| Khyaal folder | Confirm | Confirm whether this is Tarikshir or a separate 2022 project | Do not publish until linked to a canonical entry |
| Sameer | 2015 | Sameer | Unit Stills + BTS |
| Pondicherry | 2024 | Pondicherry | Photography |

The current Sameer caption says 2022, while the ledger says 2015.

### Beat 6: Emerging technology

**Recommended**

> Blockchain venture in 2017.  
> $15K NEAR grant in 2021.  
> Production GenAI today.

Why: "AI and blockchain since 2018" combines two timelines and overstates the AI date. The rewrite gives each claim its documented time.

### Beat 7: Handoff

**Recommended**

> Fifteen years of work,  
> rendered as a city.  
> Look around.

**CTA**

> Enter the work archive

## 3. Consolidation Audit

### Key finding

The current destructive consolidation removed 11 entry IDs that the 3D city still references:

`11, 13, 15, 17, 18, 30, 46, 54, 57, 71, 91`

This means the data model and city map disagree. More importantly, several removed entries were distinct milestones rather than duplicates.

### Recommended model

Keep two layers:

1. **Atomic timeline entries:** one dated event or deliverable per entry.
2. **Recruiter presentation groups:** one engagement summary that gathers the atomic entries, proof, roles, and outcomes.

Do not delete chronology to create recruiter clarity. Group it at presentation time.

### Grouping decisions

| Group | Atomic entries | Recruiter presentation | Decision |
|---|---|---|---|
| AIESEC | induction, first posters, first T-shirt, VP Communications, coordinator election, conference leadership | One AIESEC engagement with a milestone timeline | Restore atomic entries and group |
| Pixelate | founding, Startup Weekend win, whitepaper, NEAR accelerator, grant, shutdown | One Pixelate venture case with dated milestones | Restore atomic entries and group |
| Chhello Divas | production coverage and public release | One project case with production and release milestones | Restore release entry and group |
| KindHealth | co-founding and financial model | One short venture case | Restore financial-model entry and group |
| BBA at SEMCOM | degree start and graduation | One education record for recruiters | Merge in recruiter view; atomic dates optional |
| Weddings | general practice, Mathura, Niyati, Tosha, Cassidix | One wedding-film and photography body of work with selected projects | Group, do not delete |
| Letsarc Media | Abad Bread, Armoise Hotel, Surat Municipal Corporation | One recurring production relationship with three project rows | Group, do not merge projects |
| Arahantas | volunteer promotion and later identity/photography | One relationship arc with two distinct engagements | Group, do not merge |
| SEMCOM | student, festival films, visiting faculty | One long-term institutional relationship | Group, do not merge |
| Unit stills and BTS | Chhello Divas, Sameer, Passport | One role portfolio with three separate films | Role collection, not a merged work experience |
| Rabble and GenAI toolstack | consulting engagement and general capability inventory | Keep separate | Not duplicates |

### Recommended group summary copy

**AIESEC**

> Joined AIESEC Vidyanagar on 14 October 2010, then moved from first commercial poster and T-shirt briefs into VP Communications and Local Committee Coordinator. The 2010 to 2012 run combined hands-on design, volunteer leadership, conference branding and chapter operations.

**Pixelate**

> Co-founded Pixelate in 2017 with Ronak P Amin and Pranav Burnwal to explore blockchain ownership for camera-sensor photographs. The venture won a 54-hour Startup Weekend challenge, produced a technical whitepaper, joined the NEAR accelerator and received a $15,000 Fast Grant before closing on 25 July 2024.

**Chhello Divas**

> Shot unit stills and behind-the-scenes video for director Krishnadev Yagnik's Chhello Divas, released on 20 November 2015. The BTS coverage reached 539,000+ combined YouTube views, making it the most-viewed early film credit in this archive.

**KindHealth**

> Co-founded KindHealth in 2024 and developed the initial product concept and financial model. The venture stalled before launch.

**Wedding film and photography**

> Shot weddings across Gujarat and beyond from 2014 to 2025, spanning independent photography, destination assignments, cinematic wedding films and an eight-year collaboration with Cassidix Media Works.

**Letsarc Media**

> Directed or shot commercial and corporate films through Letsarc Media across two periods: Abad Bread and Armoise Hotel in 2017, followed by three Surat Municipal Corporation films in 2026.

## 4. Priority Description Rewrites

These are the current entries with the weakest recruiter copy. Each rewrite stays within the documented facts already present in the ledger.

### 125: First College Ad Film

> Directed and shot a student advertising film at SEMCOM in 2012. The film won at the college's ad-film competition.

### 43: Jepoor

> Directed and shot Jepoor, an independent travel documentary about Jaipur's streets, architecture and cultural life. I handled location research, cinematography and the visual direction.

### 121: Sameer

> Shot unit stills and behind-the-scenes coverage for Nomad Movies' feature film Sameer in 2015. The work created production documentation and promotional imagery for my second feature-film assignment that year.

### 122: Patel vs Patrik

> Led art direction for Dhwani Gautam Films' unreleased feature Patel vs Patrik in 2016, covering set design, styling and scenic layouts. Production stopped before release, but it was my first feature-length art-direction credit.

### 50: Pondicherry Travel Film

> Directed and shot an independent Pondicherry travel film in 2016, shaping the concept, framing, camera work and visual treatment.

### 130: Abad Bread

> Directed and shot two corporate films for Abad Bread through Letsarc Media in 2017. Both finished films are linked in the archive.

### 128: Armoise Hotel

> Directed and shot a hotel advertisement for Armoise through Letsarc Media in 2017. The completed commercial is linked in the archive.

### 136: Dell TVC

> Art-directed Dell's "Ek Behtar Kal Ka Aarambh" television commercial in 2017, shaping the set and frame-level visual language for production.

### 123: MAP Oil

> Art-directed a national television commercial for MAP Premium Edible Oils in 2017, leading set design and the visual treatment through production. It was my first national TVC credit.

### 65: The Other Woman

> Directed and shot the independent music video The Other Woman featuring Iti in 2019, owning the visual concept, framing and cinematography.

### 135: Cassidix Media Works

> Shot wedding films and photography with Cassidix Media Works from 2018 to 2025, covering multiple celebrations across an eight-year collaboration. Selected films and the Cassidix portfolio are linked in the archive.

### 129: Surat Municipal Corporation

> Worked as cinematographer and motion-graphics designer on three Surat Municipal Corporation corporate films through Letsarc Media in 2026. All three finished films are linked in the archive.

## 5. Facts Requiring Confirmation

Do not publish revised copy for these until the conflict is resolved:

1. **Chhello Divas credit:** the landing page says Assistant Cinematographer, while the ledger says Unit Still Photographer and BTS videographer.
2. **Khyaal receipt:** landing says "Brand, 2022. Khyaal," but the canonical ledger does not contain a matching 2022 Khyaal entry.
3. **Buddy Tales date:** the ledger says 2023, while the project memory places the Shivanata hiring and shutdown arc in 2025.
4. **Rabble duration:** the ledger title says 2024, while project memory says the role ran from September 2024 to May 2026.
5. **Ronak surname:** use "Ronak P Amin" only after confirming it against the source artifact.

## 6. GEO Guidance Applied

- Write for recruiters first. Clear role, client, medium, date, and outcome language also improves machine understanding.
- Keep visible claims and structured data consistent.
- Preserve first-hand evidence, original images, video, exact dates, and named entities.
- Do not create thin copy variants solely for AI systems.
- Do not treat `llms.txt` or special AI files as a Google ranking requirement.
- Use structured data to clarify the person and page, but do not overstate unsupported facts.

Primary references:

- Google Search Central, AI features and website guidance: https://developers.google.com/search/docs/appearance/ai-features
- Google Search Central, generative AI optimization guide: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google Search Central, ProfilePage structured data: https://developers.google.com/search/docs/appearance/structured-data/profile-page
- Aggarwal et al., GEO: Generative Engine Optimization: https://arxiv.org/abs/2311.09735

## 7. Safe Apply Order

After Claude's UI revamp is complete:

1. Commit or otherwise freeze the UI work.
2. Restore missing atomic entries from `data/ledger.json.bak`.
3. Add recruiter presentation groups instead of deleting entries.
4. Apply approved description rewrites by entry ID.
5. Wire the loader-copy sequence to real progress.
6. Correct landing receipt dates and unsupported proof stats.
7. Verify the city map, role pages, client pages, loader, and mobile typography.
8. Run `graphify update .`.
