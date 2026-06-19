# GEO Copy Review — for approval before applying

> **Goal:** make this portfolio *discoverable and citable by AI engines* (ChatGPT, Perplexity, Claude, Google AI Overviews) when a recruiter or business asks "find me a cinematographer in Gujarat", "blockchain + design freelancer India", "one-person creative studio for hire", etc.
> **Persona kept front of mind:** recruiters/businesses skimming for *breadth + depth in 60 seconds*, increasingly via an AI assistant rather than a search box. GEO rewards the same things your CLAUDE.md §12 voice rules do — specific names, dates, numbers, places; self-contained factual sentences; no "passionate / exhilarating / masterclass" filler.
>
> **Nothing here is applied yet.** This is the review pass. Tick what you want, edit what you don't, then I'll write the approved set into `data/ledger.json` and `index.html`.

---

## How I rewrote things (the rules I applied)

**Titles** — formula: `Concrete work/deliverable — Client/Org (Year)`, role in parens where it sells breadth. Front-load the matchable noun (the client, the medium, the role), keep it short enough for the folder tab / codex list (~3–8 words). Every title now carries at least one *entity* an AI engine can match a query to.

**Descriptions** — first sentence = the facts an engine will quote (who, role, client, place, year, medium). Second sentence = substance or outcome (numbers, result). Cut the adjective fog. Kept your first-person voice, just trimmed.

---

# PART A — The technical GEO layer (highest ROI, currently missing)

Right now `<head>` has only `<title>Anirudh · Portfolio</title>` — no meta description, no Open Graph, no structured data. This is the single biggest miss: it's the first thing crawlers and AI engines read, and it's what they cite. Proposed drop-in for `index.html` `<head>`:

```html
<!-- Primary SEO/GEO -->
<title>Anirudh Venkatesan — Filmmaker, Cinematographer & Brand Designer | Pixel Explorer</title>
<meta name="description" content="Anirudh Venkatesan (Pixel Explorer) is a one-person creative studio across film, photography, brand identity, animation and web3 — 15+ roles over 15 years, from Gujarat to Pondicherry. Open to consulting.">
<meta name="author" content="Anirudh Venkatesan">
<meta name="keywords" content="cinematographer India, filmmaker Gujarat, brand identity designer, freelance photographer, art director, web3 designer, blockchain, generative AI, Pondicherry, Haus of Pixels, Pixel Explorer">
<link rel="canonical" href="https://pixelhaus.in/">

<!-- Open Graph (LinkedIn/WhatsApp/Slack/FB previews) -->
<meta property="og:type" content="profile">
<meta property="og:title" content="Anirudh Venkatesan — One-person creative studio across film, design & web3">
<meta property="og:description" content="15+ roles over 15 years: cinematographer, filmmaker, photographer, brand designer, founder, web3 builder. Hire one operator, get a studio's output. Open to consulting.">
<meta property="og:url" content="https://pixelhaus.in/">
<meta property="og:site_name" content="Anirudh Venkatesan · Pixel Explorer">
<meta property="og:image" content="https://pixelhaus.in/og-cover.jpg"><!-- TODO: add a 1200x630 cover -->
<meta property="profile:first_name" content="Anirudh">
<meta property="profile:last_name" content="Venkatesan">
<meta property="profile:username" content="anirudhjust">

<!-- Twitter/X -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Anirudh Venkatesan — Filmmaker · Photographer · Designer · Founder">
<meta name="twitter:description" content="A one-person creative studio across film, design, photography, animation and web3. Open to consulting.">
<meta name="twitter:image" content="https://pixelhaus.in/og-cover.jpg">

<!-- Structured data: this is what AI engines parse into a knowledge entity -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://pixelhaus.in/#website",
      "url": "https://pixelhaus.in/",
      "name": "Anirudh Venkatesan · Pixel Explorer",
      "publisher": { "@id": "https://pixelhaus.in/#person" }
    },
    {
      "@type": "ProfilePage",
      "@id": "https://pixelhaus.in/#profilepage",
      "url": "https://pixelhaus.in/",
      "name": "Anirudh Venkatesan — Portfolio",
      "about": { "@id": "https://pixelhaus.in/#person" },
      "mainEntity": { "@id": "https://pixelhaus.in/#person" }
    },
    {
      "@type": "Person",
      "@id": "https://pixelhaus.in/#person",
      "name": "Anirudh Venkatesan",
      "alternateName": "Pixel Explorer",
      "description": "A one-person creative studio across film, photography, brand identity, animation and web3. 15+ professional roles over 15 years, from Gujarat to Pondicherry.",
      "jobTitle": [
        "Filmmaker", "Cinematographer", "Photographer", "Brand Designer",
        "Art Director", "Founder", "Web3 Builder", "Computational Photography Researcher"
      ],
      "url": "https://pixelhaus.in/",
      "email": "mailto:1991anirudh@gmail.com",
      "birthDate": "1991-09-23",
      "birthPlace": { "@type": "Place", "name": "Khambhat, Gujarat, India" },
      "homeLocation": { "@type": "Place", "name": "Pondicherry, India" },
      "nationality": "Indian",
      "knowsLanguage": ["English", "Hindi", "Tamil", "Gujarati"],
      "worksFor": {
        "@type": "Organization",
        "name": "Haus of Pixels OPC Pvt Ltd",
        "identifier": "CIN U72900GJ2022OPC131119",
        "foundingDate": "2022-04",
        "location": "Anand, Gujarat, India"
      },
      "knowsAbout": [
        "Cinematography", "Filmmaking", "Photography", "Brand Identity Design",
        "Art Direction", "Corporate Films", "Wedding Films", "Animation Production",
        "Blockchain", "Web3", "Generative AI", "Computational Photography"
      ],
      "sameAs": [
        "https://www.behance.net/anirudhjust",
        "https://www.instagram.com/anirudh.light/",
        "https://youtube.com/channel/UCSvNDRlq3F1LZouWB-WkJ6Q/"
      ]
    }
  ]
}
</script>
```

**Notes / decisions for you:**
- `og:image` points at a placeholder `og-cover.jpg` — GEO/social previews need a 1200×630 image. Want me to flag generating one, or skip the image tags for now?
- Canonical assumes the live domain is `pixelhaus.in`. Confirm (CLAUDE.md §15 lists this as unconfirmed).
- Title tag is ~80 chars (Google truncates ~60 in blue-link display, but AI engines read the whole thing — for a discovery play I'd keep the full breadth). Shorter alt: `Anirudh Venkatesan — Cinematographer, Filmmaker & Brand Designer`.

---

# PART B — Titles (all 90, old → new)

Legend: ⚠ = a factual thing I need you to confirm (see Part D).

| # | Old | New |
|---|---|---|
| 1 | Birth | **Born in Khambhat, Gujarat (1991)** |
| 111 | School: KV Cambay (classes 1-5) | **Early Schooling — KV Cambay (Classes 1–5)** |
| 2 | Family settled in Anand | **Family Settles in Anand, Gujarat (2002)** |
| 112 | School: KV VVN (classes 6-10) | **Secondary School — KV Vallabh Vidyanagar (Classes 6–10)** |
| 113 | School: Angels HS Anand (11-12 commerce) | **Higher Secondary, Commerce — Angels School, Anand** |
| 3 | SEMCOM 2nd-year internship: Anupam Industries (GIDC Anand) | **Internship — Anupam Industries, GIDC Anand (SEMCOM, 2010)** |
| 116 | Multiple photography competition wins - national + state level | **Photography Competition Wins — State & National (2014)** |
| 4 | First-ever sent email | **First Email Ever Sent (2009)** |
| 7 | BBA(IT) | **BBA in Information Technology — SEMCOM (2009)** |
| 9 | AIESEC induction | **AIESEC Induction — 14 Oct 2010** |
| 11 | First design Work | **First Commercial Design — AIESEC OGX Fair Posters (2010)** |
| 13 | First t-shirt designed | **First T-Shirt Design — AIESEC OGX Fair (2010)** |
| 14 | First photoshoot | **First Paid Photoshoot — Nail Salon, Bandra Mumbai (2011)** |
| 15 | AIESEC VP Communications | **VP Communications — AIESEC Vidyanagar (2011)** |
| 17 | Elected Local Committee Coordinator | **Elected Local Committee Coordinator — AIESEC Vidyanagar (2012)** |
| 18 | JNC 2012 + GoGujarat | **Conference Lead — JNC 2012 & GoGujarat (AIESEC)** |
| 20 | First Short Films - Film Festival | **First Short Films — Mithibai Kshitij Festival, Mumbai (2012)** |
| 25 | First client - Greenopia | **First Freelance Client — Greenopia (2012)** |
| 28 | Visiting Card Design | **Visiting Card Design — Shril Patel (2012)** |
| 30 | BBA(IT) graduates | **Graduates BBA (IT) — SEMCOM (2013)** |
| 32 | NID prep: Bhanwar Rathod Academy | **NID Entrance Prep — Bhanwar Rathod Academy (2013)** |
| 119 | Mathura wedding shoot: Kumar Jaivardhan (Indian Oil) | **Destination Wedding Shoot — Mathura, UP (2014)** |
| 35 | Pep and Joss corporate film | **Pep & Joss Corporate Film — Director & Cinematographer (2014)** |
| 37 | TGES/Schoogle - Team Lead Design | **Team Lead, Design — TGES/Schoogle, Ahmedabad (2014)** |
| 36 | Wedding shoots | **Freelance Wedding Photography — Gujarat (2014–)** |
| 43 | Jepoor - Jaipur travel film | **Jepoor — Jaipur Travel Documentary (Director, 2014)** |
| 47 | Niyati Patel wedding (Payal Di Shoot) | **First Wedding Commission — Niyati Patel (2015)** |
| 46 | Chhello Divas releases (cult classic) | **Chhello Divas Releases — Gujarati Cult Classic (2015)** |
| 42 | Chhello Divas - Stills + BTS | **Chhello Divas — Unit Stills & BTS (539K+ Views)** |
| 121 | Sameer Movie - unit still photographer + BTS | **Sameer (Feature Film) — Unit Stills & BTS (2015)** |
| 51 | First Showreel published | **First Cinematography Showreel (2016)** |
| 52 | SEMCOM Visiting Faculty starts | **Visiting Faculty — SEMCOM (2016–)** |
| 120 | SEMCOM Visiting Faculty: ad film production outcomes | **Visiting Faculty — Ad Film Production, SEMCOM** |
| 50 | Pondicherry travel film | **Pondicherry Travel Film — Director & Cinematographer (2016)** |
| 122 | Art Director - Patel vs Patrik(unreleased feature) | **Art Director — Patel vs Patrik (Feature, 2016)** |
| 123 | Art Director - Map Oil TVC | **Art Director — MAP Oil National TVC (2017)** |
| 117 | Diana rescued, with Nahush from Ahmedabad streets | **Rescues Diana — Ahmedabad (2017)** |
| 53 | Pixelate co-founded | **Co-founds Pixelate — Blockchain Photo Startup (2017)** |
| 54 | Won Startupweekend banglore challenge (54hr) | **Wins Startup Weekend Bangalore — 54-Hour Challenge (2017)** |
| 56 | Europe trip | **Europe Photography Trip — Italy · France · Netherlands · Belgium (2017)** |
| 57 | Pixelate Whitepaper drafted | **Drafts the Pixelate Whitepaper (2018)** |
| 58 | Tosha wedding film | **Tosha Wedding Film — Cinematographer & Editor (2018)** |
| 59 | Certified Blockchain Expert | **Certified Blockchain Expert — Blockchain Council (2018)** |
| 60 | Tarikshir book promotion and marketing | **Tarikshir Book Launch — Marketing Lead, Dubai (2018)** |
| 65 | Music video: The Other Woman ft. Iti | **Music Video: The Other Woman ft. Iti — Director & DP (2019)** |
| 66 | CVM College of Fine Arts: Guest Lecturer | **Guest Lecturer — CVM College of Fine Arts (2019)** |
| 118 | Arahantas - 5 months Himachal (volunteer event promoter) | **Volunteer Event Promoter — Arahantas, Himachal (2022)** |
| 68 | OCTO Advisory Research Associate | **Research Associate — OCTO Advisory (2020)** |
| 69 | "The Human Eye and its collective visual knowledge" | **Essay: The Human Eye & Its Collective Visual Knowledge (2020)** |
| 70 | Jadi Duty - Brand Identity | **Jadi Duty — Ayurvedic Brand Identity & Packaging (2020)** |
| 71 | NEAR Blockchain Accelerator bootcamp begins | **NEAR Protocol Accelerator — Pixelate Co-founder (2021)** |
| 74 | $15,000 NEAR Fast Grant deposited | **$15,000 NEAR Fast Grant — 14 Oct 2021** |
| 76 | Haus of Pixels OPC Pvt Ltd incorporated | **Incorporates Haus of Pixels OPC Pvt Ltd (2022)** |
| 77 | Workshop on Wheels (WOW) brand identity | **Workshop on Wheels (WOW) — Brand Identity (2022)** |
| 78 | Silver Dragon rebranding | **Silver Dragon — Restaurant Rebrand (2022)** |
| 79 | MK Engineering Works branding | **MK Engineering Works — Industrial Brand Identity (2022)** |
| 88 | Portfolio 2023 published | **Portfolio 2023 — 24-Module Behance Anthology** |
| 81 | House of Glam branding | **House of Glam — Beauty Brand Identity (2023)** |
| 82 | Cross.pet brand iDENTITY - For Sale | **Cross.pet — Pet E-commerce Brand Identity (For Sale, 2023)** |
| 83 | Yogesh Khaman LED content | **Yogesh Khaman — LED Food Commercial (Director/DP, 2023)** |
| 84 | Miss Serena Nanawati music video | **Serena Nanawati Music Video — Art Director & DP (2023)** |
| 85 | Arahantas Yoga Studio brand | **Arahantas Yoga — Brand Identity & Photography (2023)** |
| 90 | KindHealth folder formally created | **Co-founds KindHealth — Health-Tech Venture (2024)** |
| 91 | KindHealth Financial Model | **KindHealth — Financial Model (2024)** |
| 92 | Its a Baby! Studios - Brand Identity | **Its a Baby! Studios — Full Brand Identity (2024)** |
| 94 | Singapore/Malaysia - Travel film (Flamingo Travels) | **Singapore & Malaysia Travel Film — Flamingo Travels (2023)** |
| 95 | Latvia/Riga: health-tech cofounding + DEPORTATION | **Health-Tech Co-founding Stint — Riga, Latvia (2024)** ⚠ |
| 96 | Mankind Pharma Internal AV | **Mankind Pharma — Internal Corporate Film (Director/Editor, 2024)** |
| 97 | Pixelate formally ENDS | **Pixelate Winds Down (2024)** |
| 98 | Auroville volunteering | **Energy-Policy Analyst (Volunteer) — Auroville Consulting (2024)** |
| 100 | Visual designer Consultant - Rabble Labs | **Visual Design Consultant — Rabble Labs & BuidlersTribe (2024)** |
| 102 | Production director - Buddy Tales animation series | **Director & Producer — Buddy Tales Animated Series (Shivanata, 2023)** |
| 103 | Conscious Cafe Menu | **Conscious Cafe — Menu Design, Pondicherry (2025)** |
| 106 | Green Silk Road Map Portal | **Green Silk Road — Map Portal (Tech Contractor, 2025)** |
| 125 | First College Ad film | **First College Ad Film — Festival-Awarded (2012)** |
| 126 | Gujarat tourism AD films | **Gujarat Tourism Ad Films — Art Director (2020)** |
| 127 | Petved Brand identity design | **Petved — Pet Nutrition Brand & Packaging (2025)** |
| 128 | Armoise hotel ad | **Armoise Hotel Ad — Director & Cinematographer (2017)** |
| 129 | Surat Municipal corporation corporate films | **Surat Municipal Corporation — 3 Corporate Films (DP, 2026)** |
| 130 | Abad Bread corporate film | **Abad Bread — Corporate Films (Director/DP, 2017)** |
| 131 | Computational photography expert | **Computational Photography — Self-Taught (Udacity)** |
| 132 | COntact | **Contact — Anirudh Venkatesan** |
| 133 | GenAi | **Generative AI Toolstack — 15+ Production Tools** |
| 135 | Weddings - CMW | **Wedding Films & Photography — Cassidix Media Works (2018–2025)** |
| 136 | Dell TVC ad | **Dell TVC — Art Director, "Ek Behtar Kal Ka Aarambh" (2017)** |
| 137 | Home Halt - brand & web development | **Home Halt — Brand Identity & Website (2016)** |
| 138 | My Village Tea - branding | **My Village Tea — Packaging & Branding, Kangra (2022)** |
| 139 | Passport (film) - BTS / unit stills | **Passport (Feature Film) — Unit Stills & BTS (2016)** |
| 140 | Swachh Bharat Abhiyan - documentation | **Swachh Bharat Abhiyan — Documentary Photography (Govt of India, 2016)** |
| 141 | Kalarigram Mahashivratri 2025 - travel film | **Kalarigram Mahashivratri — Travel Film (Director/Editor, 2025)** |

---

# PART C — Descriptions

## C1. Rewrites (de-fluffed — these violated §12 or were too thin)

**#11** — My first commercial design brief: event posters for the AIESEC Global Internship Youth Fair, made with Kunal Shah in 2010. I installed Photoshop for the first time and worked on pure instinct — the start of a self-taught path into professional graphic design.

**#14** — My first paid photography commission. After a chance meeting at a Mumbai coffee shop, I was hired to shoot a commercial set for a boutique nail salon in Bandra — the start of my commercial career.

**#20** — Represented SEMCOM at the Mithibai Kshitij student festival in Mumbai with two original short films, made with Parth Brahmbhatt. My first films screened to a festival audience — the moment cinema hooked me.

**#25** — My first official freelance client. A one-day Facebook cover-art brief for Greenopia (Hrishit / Nilkanth Ray) grew into an ongoing engagement across the rest of 2012 — the project that started my professional career.

**#35** — Director and cinematographer for Pep & Joss, a corporate film shot on the factory floor at GIDC Anand. Turned industrial machinery and the workforce's rhythm into a visual story; the film still runs online.

**#36** — Freelance wedding photography across Gujarat from 2014 onward — candid storytelling, environmental portraiture, and high-stakes event coverage for a wide range of clients.

**#37** — Joined Ahmedabad ed-tech startup TGES-Schoogle as Team Lead, Design — my first move from solo creative to managing a three-designer team across creative direction and cross-department delivery.

**#42** — Unit Still Photographer and BTS videographer on Krishnadev Yagnik's Gujarati cult classic *Chhello Divas* (2015). My behind-the-scenes coverage went on to 539,000+ combined YouTube views — the most-seen credit of my early film career.

**#47** — My first documented wedding commission — Niyati Patel's celebration, archived as the "Payal Di Shoot". The shoot that set the baseline for over a decade of wedding photography across Gujarat.

**#58** — Cinematographer and editor on Tosha's wedding film in Ankleshwar, Gujarat (2018). Cut as a cinematic "Bride Book" built around unscripted moments rather than standard event documentation.

**#60** — Marketing lead and digital creative for Khayaal Patel's debut novel *Tarikshir*. Ran the international launch in Dubai (Starmark, 2018) and managed the author's ongoing personal brand — social aesthetic, content, and audience. My first international travel.

**#70** — Brand identity and packaging system for Jadi Duty, an Ayurvedic wellness brand (Ashwagandha, Moringa, Giloy capsules). An earth-toned, apothecary-inspired grid across bottle wraps and boxes — traditional supplements positioned for a modern shelf.

**#77** — Brand identity for WOW (Workshop on Wheels), an at-home automotive-servicing concept. Designed the logo and extended the visual language across print and digital.

**#78** — Rebrand for Silver Dragon, a 25-year-old Indo-Chinese restaurant in Vallabh Vidyanagar, under Haus of Pixels. New primary logo and color palette — modernised without losing its legacy.

**#79** — Brand identity for MK Engineering Works, a manufacturer of industrial and defence parts. A precise, geometric logo and high-visibility palette built around the workshop's technical strength.

**#81** — Brand identity for House of Glam, a beauty salon. A classic serif monogram on a textured-gold motif, carried across the brand's touchpoints for a premium feel.

**#82** — Brand identity for cross.pet, a modern online pet store (available for sale). Anchored by an oversized logo mark that scales from e-commerce UI to packaging and merchandise.

**#83** — Director and photographer for Yogesh Khaman's promotional food content, built for high-brightness LED displays. Bold color separation, macro texture, and controlled lighting to make the product read on screen.

**#84** — Art Director and Cinematographer on Serena Nanawati's music video (2023) — shot design, lighting, and camera movement translating the track into an atmospheric visual.

**#85** — Brand identity and photography for Arahantas Yoga in Dharamkot. Shot the studio's daily rhythm and designed social content and event posters around its quiet energy.

**#92** — Complete visual identity for Its A Baby! Studios, Vadodara — my largest single-client deliverable of 2024. Brand book, six brochures, stationery, custom apparel, and large-format hoardings across print and digital.

**#94** — Cinematographer for Flamingo Travels' multi-country campaign across Singapore and Malaysia — a 10-trip shoot covering the streetscapes and skylines of both countries (2023). A bucket-list international project.

**#96** — Director and editor on an internal corporate film for Mankind Pharma — paced and cut to give internal brand messaging the same craft as a broadcast ad (₹45,000).

**#100** — Visual Design Consultant for Rabble Labs and BuidlersTribe, working with the Product, Growth, and Business Development teams. Built brand identities for Rabble Labs and Scribble and turned them into scalable design systems, templates, and assets.

**#102** — Director and Producer of the *Buddy Tales* animated mini-series with Savan Barot, under Shivanata Production LLP — leading two animators and a background artist on a remote pipeline (2023).

**#103** — Menu design for Conscious Cafe, a well-loved spot in Pondicherry. Clean visual hierarchy and typography across a broad menu — house-made kombuchas, specialty coffees, and floral teas.

**#116** — Several state- and national-level photography competition wins during my college years — the formal start of my trajectory as a photographer.

**#119** — Destination wedding shoot in Mathura, UP, booked through an Indian Oil connection — documenting Kumar Jaivardhan's wedding in an unfamiliar city and cultural rhythm (2014).

**#127** — Brand identity and capsule-packaging design for Petved Nutritions, a pet-supplement brand (2025).

**#131** — Self-taught computational photography through Udacity coursework — the technical grounding behind the Pixelate protocol whitepaper.

**#138** — Branding and packaging design for My Village Tea, a Kangra (Himachal) green-tea brand — the work centred on the pack.

**#133 (GenAI)** — keep as a structured tool list (great for GEO — it's all entities), just cleaned up. Proposed:
> Current, hands-on across the production GenAI stack:
> **ChatGPT** (GPT LLM, Image, Projects, Codex) · **Claude** (LLM, Claude Code, Projects, Design) · **Freepik / Magnific** (image, video, template, audio — 20+ months paid) · **ElevenLabs** (TTS, voice cloning) · **Suno AI** (music, SFX) · **Higgsfield** (video, cinema, image, UGC) · **ComfyUI** (self-hosted pipelines) · **OpenCode** (self-hosted code gen) · **LM Studio** (self-hosted LLMs).
> *(fixes: imgae→Image, ElvenLabs→ElevenLabs, HiggsFeild→Higgsfield, ComphyUI→ComfyUI)*

**#132 (Contact)** — keep the links; just normalise formatting. Title → "Contact — Anirudh Venkatesan".

## C2. Keep as-is (already tight & factual — no change)

`1, 111, 2, 112, 113, 3, 4, 7, 9, 13, 15, 17, 18, 28, 30, 32, 43, 46, 50, 51, 52, 53*, 54, 56, 57, 59, 65, 66, 68, 69, 71, 74, 76, 88, 90, 91, 95, 97, 98, 106, 117, 118, 120, 121, 122, 123, 125, 126, 128, 129, 130, 135, 136, 137, 139, 140, 141`

(*#53 keep the copy but fix one name — see Part D.)

---

# PART D — Factual snags to confirm (I did NOT auto-change these)

1. **#53 Pixelate co-founder name.** Ledger says **"Ronak Pamin"**; your CLAUDE.md §11 throughlines list **"Ronak Amin"**. One is a typo — which is correct?
2. **#95 "DEPORTATION" (all-caps).** I softened it out of the *title* (recruiter-facing first impression). The deportation fact stays in the description as-is. OK, or do you want it kept blunt in the title?
3. **#36 "Wedding shoots".** Description said "a decade" but the entry is dated 2014; I changed it to "from 2014 onward". Fine?
4. **Tag typos** (not user-facing, but sloppy if ever surfaced): `evalvuation`, `computaional`, `PhorographY`, `ART director`. Want me to clean tags too while I'm in there?

---

# Apply plan (once you approve)

- **Titles + descriptions** → scripted patch into `data/ledger.json` keyed by `id` (mechanical, reversible via git).
- **Head meta + JSON-LD** → inserted into `index.html` `<head>`.
- Then `graphify update .` per CLAUDE.md, and a quick preview check that the new titles render in the folder tabs / codex without overflow.

**Tell me:** approve all / approve titles only / approve a subset (give me the #s) / edits you want first.
