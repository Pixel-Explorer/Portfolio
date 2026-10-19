# Portfolio truth audit

19 Oct 2026. Every entry and every screen of the archive, checked against your own records.

**Sources used, in order of trust**
- CV: `Anirudh Venkatesan - CV - ATS` (24 Jul 2026)
- LinkedIn data export (8 May 2026): positions, education, honours, certifications
- Your workbook sheets: roles, films, firsts, people (`anirudh-ledger-v4.xlsx`)
- Notion Evidence Ledger, including its Verified / Tentative / Needs-evidence flags
- YouTube: real title, channel and upload date of all 29 linked videos
- Gmail thread IDs, which encode the send date (6 entry dates confirmed to the day)

Nothing on the site was rewritten from memory or "improved". Where sources disagree, the claim was cut back to what they share, and the conflict is listed under **Questions only you can answer**.

---

## Why it read as AI slop: five root causes

1. **The code invented labels when data was missing.**
   - No role became "Creative Direction". That's how the internship, the first email and the contact card got filed there.
   - No client became "Independent Studio", "Independent" or "Project".
   - A red apple sticker stood in for any unclassified entry.
2. **Everything counted as work.** Schools, the family move, Diana, the first email and the contact card all fed "27 roles / 55 clients / 89 projects", and the CV quotes those numbers.
3. **One piece of work, several entries.**
   - Chhello Divas had 2 entries.
   - KindHealth had 3.
   - A blockchain certificate was counted as a role ("Blockchain Expert").
   - A grant giver (NEAR) and a certifier (Blockchain Council) were listed as clients.
4. **Claims with no source.** The worst ones:
   - Buddy Tales: "Full TV Series Delivered", with fake Jan to Mar 2024 milestones. Really a 10-minute pilot, wrapped 24 Dec 2025. (A "72 days" figure added in this pass was also false, removed 19 Oct 2026; `check-ledger` now fails on it.)
   - Chhello Divas: "539K views" given as the film's views. They are your four BTS videos (538,783 combined).
   - Surat Municipal Corporation films: titled "2026" and dated 2019. YouTube shows Sep 2017 to Jan 2018.
   - Haus of Pixels: "16-year studio" on a card that also says "2022 - Now".
   - Haus of Pixels: "100+ Design Systems". The CV says layout systems.
   - Pixelate: "4+ MVPs", "100+ pitch rounds" and "team of 4" have no source. Notion says one Web2 MVP and three co-founders.
   - Diana: "eleven years" for a 2017 rescue.
5. **The proof store was down.** Vercel Blob returns 403 ("Your store is blocked"). 21 videos, 8 PDFs and 3 images had no copy and showed as dead tiles. Now all proof is self-hosted (see below).

## The numbers, before and after

| | Before | After |
|---|---|---|
| Entries | 89 (incl. schools, family, dog, contact card) | **74** work entries |
| Roles tab | 25 (27 in the HTML; "Life", "Student", "Aspirant", "Promotor", "GenAI Expert"…) | **11** role families |
| Clients tab | 55 (incl. 3 schools, a sister's email handle, "Self", "Film Festival") | **37** real clients |
| Years active | 15, 16, 18 or 21, depending on the page | **16** everywhere (2010-2026) |
| Disciplines | 6 incl. "Life" | **5** |

Your CV still says "77 projects, 27 roles, 55 clients". Update it to match (or drop the numbers).

## Privacy: found live, fixed here, one action is yours

- **anirudh.website served your private files.** Anyone could download:
  - `/CLAUDE.md` ("Just laid off from Rabble Labs")
  - `/data/anirudh-ledger-v4.xlsx` (the whole research workbook)
  - `/data/ledger.json` with your Rabble salary, the layoff reason, a third party's work email, Gmail thread IDs and your hires' names
  - **Fixed:** a new `.vercelignore` stops these deploying. Private data is moved to `data/private/` (never deployed, never committed), and `ledger.json` now carries public fields only.
- **The GitHub repo `Pixel-Explorer/Archival-app` is public.** The same files are in its history.
  - **Your action:** make the repo private (GitHub, Settings, Danger Zone). Vercel deploys from private repos.
  - The workbook is now untracked and gitignored.

---

## Screen by screen

**Loader**
- Rolling titles included "Design Token Architect" and "Web3 & Protocol Designer", which appear nowhere in your records.
- Now: Creative Systems Lead, Cinematographer, Brand Designer, Co-founder Pixelate, Film Director.

**Onboarding tour (5 steps)**
- It pointed at a right-edge filter bar that doesn't exist, a desktop menu that doesn't exist, a "?" replay button that doesn't exist and a folio download that isn't in that menu.
- Raw `**WASD**` markdown showed on screen, and the copy said "15-year career".
- Now: five true steps, each anchored to the real control.

**Archive home**
- Header counts were wrong (see the table above).
- The discipline rail put schooling under "Leadership & Education", Tarikshir marketing under "Research", and personal entries under "Life".
- Now: themes are derived from role families. "Leadership & Education" is renamed "Leadership & Teaching", and "Life" is gone.

**Stats panel**
- "Years active" counted distinct years with an entry (21) instead of the span.
- Now: 16.

**3D city (36 buildings)**
- Home Halt (2016) sat in the Haus of Pixels building (founded 2022).
- The "BBA-ITM" building held schooling, a first email and a nail-salon shoot.
- The hospital building opened entry #1, which never existed.
- The blockchain certificate sat in the Pixelate building.
- The college promo sat under "Corporate Films".
- Jepoor, a music video, sat under "Travel Films".
- Now: every cluster holds only what its label says.

**Entry hover**
- Fell back to "Independent".
- Now: real org, credit and date.

**Entry page (desktop panel)**
- A blanket "Verified" sticker sat on every entry.
- "Productivity: 0 sent emails this week" showed on every entry, because the email data no longer exists.
- A "Money" row published your fees.
- Now: When / Role / Org / Location. Only the NEAR grant amount shows, as "Grant".

**Entry page (artifact and editorial)**
- Role fell back to "Project".
- Dates showed in four formats ("~1997", "2012-08", "5/2013", "2009-04-01"), and placeholder 1st-of-month dates read as exact days.
- Raw internal tags showed ("Earnings" on unpaid work, "project evalvuation", "gen ai").
- The browser-tab title ended "· Independent (year)" on every entry; the code read a field that doesn't exist.
- Now: one date format ("14 Oct 2010", "Apr 2016", "2016"), curated tags, honest titles.

**Roles page**
- Was the screenshot you sent.
- Now: 11 families. Each card shows the real organisation and your exact credit, e.g. "Assistant Cinematographer, Unit Still Photographer & BTS".

**Clients page**
- Was 55 "clients" including schools and your sister's email handle.
- Now: 35 organisations or people who commissioned or employed you. Private weddings are grouped as one "Private wedding clients" card.
- Volunteer orgs (AIESEC, Arahantas volunteering, Auroville, Green Silk Road) and your own ventures (Pixelate, KindHealth, Haus of Pixels incorporation) are no longer clients.
- Monograms read "P(" and "D(" (from "(2025)"). Fixed.

**Stickers**
- Generic 3D stickers (apple, a smartphone for "Photographer", a robot for "Blockchain") were replaced with plain monograms. Real client logos and real images stay.

**Case studies (all 5)**
- Rebuilt from your CV, Notion and workbook. Every unsourced line was cut (details in the root causes above).
- The "By the numbers" bars compared a year with a head count with a grant, so they're now plain figures.
- The Haus of Pixels "Buddy Tales" milestone opened It's a Baby! Studios.
- All five anirudh.website milestones opened Rabble Labs.
- Two images were broken.
- Now: 0 broken, every link correct.

**Contact**
- "Neelagiri / Puducherry, Tamil Nadu" became "Puducherry, India", as on the CV. Puducherry is a Union Territory.
- "100% Remote Global Setup" became "Remote-first, open to relocation", also from the CV.
- The emoji button is gone.

**Gallery (416 photos)**
- 128 locations leaked a Windows folder path ("Europe\Netherlands").
- Other "locations" were placeholders: "Geotagged Location", "Family", "Still life".
- All 416 captions came from one template ("A night frame, dusk, from…").
- 6 family photos were in the public gallery.
- Now: real place names, no templated captions, family photos out (410 photos).

**SEO and social preview**
- Said "15+ roles over 15 years" and listed the job titles "Web3 Builder" and "Computational Photography Researcher".
- Now: 16 years and titles from your CV.

**Parked landing page (`/landing.html`)**
- Still reachable, claiming "42 film projects". That count includes TBD rows and a web background loop.
- Now excluded from deploy.

**Mobile**
- Same data, same fixes; the list shows 73 entries.

## Your decisions (19 Oct)

- **Roles:** 11 role families. Each card keeps the exact credit.
- **Personal and education entries:** removed from the site. That's 3 schools, BBA start and graduation, NID prep, the SEMCOM internship (stored as education), self-taught Udacity, family move, first email, Diana, and the contact card. Unsourced competition wins were removed as well. All of it is kept privately in `data/private/ledger-private.json`.
- **Case studies:** rebuilt from your records only.
- **Stickers:** replaced with monograms.

## Questions only you can answer (all 15 answered 19 Oct, applied)

Answers: 1 Technoville paid, for Flamingo Travels. 2 Paid. 3 Mathura was first. 4 An NGO (name unknown); both 2016 dates year-only. 5 Art Director 2017. 6 2016. 7 Pep & Joss is the client. 8 2020-2021. 9 Keep. 10 It won. 11 Leave out. 12 Buddy Tales. 13 Photos + social only. 14 Vet Veda. 15 Back as Intern.

Each item says what the site shows until you answer. All of them are safe defaults: the unsourced part is left out, nothing new is claimed.

1. **Singapore & Malaysia films (#94).** Who was the client?
   - Workbook: Self.
   - People sheet: Flamingo Travels, paid, "10-trip campaign".
   - Notion: Technoville, paid, 3 films.
   - *Now:* no client; "published on my channel".
2. **Nail-salon shoot, Bandra (#14).** Was it paid? Your firsts sheet says Greenopia (Nov 2012) was your first paid work, and the linked Gmail thread is from Oct 2010. *Now:* "First Commercial Photoshoot", no "paid".
3. **First wedding.** Mathura (Jan 2014, 3 confirmation emails) or Niyati Patel (Oct 2015, "first documented")? *Now:* neither says "first".
4. **Swachh Bharat (#140).** Who commissioned it? *Now:* no client named (was "Govt of India"). Its date, 9 Apr 2016, is identical to Home Halt's (#137); please confirm both.
5. **Dell TVC (#136).** Your films sheet says "year + role TBD". *Now:* kept as Art Director, Nov 2017.
6. **MAP Oil TVC (#123).** *Now:* 2016 per your workbook. YouTube shows it live by 5 Jun 2017.
7. **Pep and Joss (#35).** What's the company's name? *Now:* "Industrial manufacturer, GIDC Anand", not on the Clients page.
8. **Jadi Duty (#70).** The site says 2020, but the product photos are dated 15 Apr 2021 and the Behance project is from Apr 2021. Which year?
9. **KindHealth (#90).** Notion flags it "Needs evidence" (CMO, Kind Gestures, Latvia visa). *Now:* one merged entry: co-founded Apr 2024, Riga Jun 2024, stalled. Keep, reword, or remove?
10. **SEMCOM "Leave a Mark" (#125).** Did it win the college ad-film competition? *Now:* the award is out of the title.
11. **Photography competition wins.** Which competitions and years? Workbook: pre-2009, details TBD. *Now:* removed.
12. **Buddy Tales model sheets (Krishna, Kans).** Are these Buddy Tales or Mahabharata artwork?
13. **Arahantas (#85).** Did you design the logo, or was it photography and social only? *Now:* "Brand Identity & Photography" (as entered).
14. **Petved (#127).** Is the brand name "Vet Veda"? The PDF is `Vet_veda.pdf`.
15. **SEMCOM internship.** It was removed with the education entries. Want it back as "Intern"?

## Not fixed in this patch (needs a decision or your hands)

- **Proof hosting: fixed 19 Oct.** The Blob store is blocked ("Your store is blocked"). All proof is now served by the site from `public/proof-web/` (78 MB): 190 images, 15 videos, and 7 PDFs as 48 viewable page images. 342 of 342 self-hosted links return 200.
  - "The Gir Adventure" mp4 was dropped; the same film is already linked from its official YouTube upload.
  - The Rabble tongue illustration came from `D:\Portfolio\tonguethingy final.png`. Confirm it's the right file.
- **YouTube showreel (#51).** Embedding is disabled on YouTube, so it can't play inside the site. Turn on "Allow embedding" in YouTube Studio.
- **Folio download.** The contact page serves the older 5.4 MB folio. It's image-only (not searchable by ATS tools or AI). Swap in `Folio 6 Page 2026-compressed.pdf`?
- **Story Mode (`?story`).** Unlinked, but its voice-over script still has jokey lines ("Universe made a typo"). Untouched.

## How it stays true

- `node scripts/check-ledger.mjs` (also `npm run check:ledger`) fails on any of these:
  - an entry with no role family or organisation
  - a title year that contradicts the date
  - private fields in the public file
  - duplicate evidence
  - em-dashes
  - case-study links to missing entries
  - On the old data it reports 452 problems; on the new data, 0.
- `scripts/truth-audit-2026-10.mjs` holds every correction in this report, keyed by entry ID with its source. It's re-runnable from the pre-audit backups in `data/private/`.
- The code no longer invents a role, client, date precision or sticker when data is missing.

---

## Entry by entry (all 89 original entries)

| # | Entry (as it reads now) | What changed |
|---|---|---|
| 111 | Early Schooling: KV Cambay (Classes 1-5) | **Removed.** education: KV Cambay schooling |
| 2 | Family Settles in Anand, Gujarat (2002) | **Removed.** personal: family settles in Anand (source was 'Inferred') |
| 112 | Secondary School: KV Vallabh Vidyanagar (Classes 6-10) | **Removed.** education: KV Vallabh Vidyanagar schooling |
| 113 | Higher Secondary, Commerce: Angels School, Anand | **Removed.** education: Angels Higher Secondary |
| 4 | First Email Ever Sent (2009) | **Removed.** personal: first email (client was a family member's handle) |
| 7 | BBA in Information Technology: SEMCOM (2009) | **Removed.** education: BBA start |
| 3 | Internship: Anupam Industries, GIDC Anand (SEMCOM, 2010) | **Removed.** education: SEMCOM curriculum internship (activityType Education) |
| 9 | AIESEC Induction: 14 Oct 2010 | Credit "Volunteer" → "AIESEC member, outgoing exchange (OGX) team"; Client "AIESEC" → "not a client"; Description rewritten to sourced facts; Evidence 2 → 0 (duplicates/misfiled removed or merged in) |
| 11 | First Design Brief: AIESEC OGX Fair Posters (2010) | Title was "First Commercial Design: AIESEC OGX Fair Posters (2010)"; Credit "Designer" → "Poster designer (volunteer)"; Client "AIESEC" → "not a client"; Description rewritten to sourced facts |
| 13 | First T-Shirt Design: AIESEC OGX Fair (2010) | Credit "Designer" → "T-shirt designer (volunteer)"; Client "AIESEC" → "not a client"; Description rewritten to sourced facts |
| 15 | VP Communications: AIESEC Vidyanagar (2011) | Credit "VP Communications" → "VP Communications & Information Management"; Client "AIESEC" → "not a client"; Date "2011" → "2011-05"; Description rewritten to sourced facts |
| 14 | First Commercial Photoshoot: Nail Salon, Bandra, Mumbai (2011) | Title was "First Paid Photoshoot: Nail Salon, Bandra Mumbai (2011)"; Date "2011-12-01" → "2011-12"; Description rewritten to sourced facts |
| 125 | SEMCOM 'Leave a Mark': College Promo Film (2012) | Title was "First College Ad Film: Festival-Awarded (2012)"; Credit "Director, Cinematographer" → "Director & Editor"; Client "(none)" → "SEMCOM College"; Description rewritten to sourced facts |
| 28 | Visiting Card Design: Shril Patel (2012) | Description rewritten to sourced facts |
| 17 | Elected Local Committee Coordinator: AIESEC Vidyanagar (2012) | Credit "Volunteer" → "Local Committee Coordinator"; Client "AIESEC" → "not a client"; Description rewritten to sourced facts |
| 18 | JNC 2012 and GoGujarat: AIESEC Vidyanagar (2012) | Title was "Conference Lead: JNC 2012 & GoGujarat (AIESEC)"; Credit "Volunteer" → "Local Committee Coordinator"; Client "AIESEC" → "not a client"; Date "2012" → "2012-07"; Description rewritten to sourced facts |
| 20 | First Short Films: Mithibai Kshitij Festival, Mumbai (2012) | Credit "Aspirant" → "Director & Editor (with Parth Brahmbhatt)"; Client "Film Festival" → "not a client"; Description rewritten to sourced facts |
| 25 | First Paid Client: Greenopia (2012) | Title was "First Freelance Client: Greenopia (2012)"; Client "Greenopia (Hrishit/Nilkanth Ray)" → "Greenopia"; Description rewritten to sourced facts |
| 30 | Graduates BBA (IT): SEMCOM (2013) | **Removed.** education: BBA graduation |
| 32 | NID Entrance Prep: Bhanwar Rathod Academy (2013) | **Removed.** education: NID entrance prep |
| 36 | Freelance Wedding Photography: Gujarat (since 2014) | Credit "Photographer" → "Wedding photographer"; Client "Self" → "Private wedding clients"; Date "2014-01-01" → "2014"; Description rewritten to sourced facts |
| 119 | Destination Wedding Shoot: Mathura, UP (2014) | Credit "Photographer" → "Wedding photographer"; Client "Kumar Jaivardhan / Indian Oil" → "Private wedding clients"; Description rewritten to sourced facts |
| 43 | Jepoor (Do Aana): Music Video, Director & Cinematographer (2015) | Title was "Jepoor: Jaipur Travel Documentary (Director, 2014)"; Credit "Director, Cinematographer" → "Director & Cinematographer"; Client "Self" → "not a client"; Date "2014-04-04" → "2015-08"; Description rewritten to sourced facts |
| 116 | Photography Competition Wins: State & National (2014) | **Removed.** unverifiable: WB-firsts dates these wins pre-2009 with details TBD; site said 2014 'during college' |
| 35 | Pep and Joss: Corporate Film, Director & Cinematographer (2014) | Title was "Pep & Joss Corporate Film: Director & Cinematographer (2014)"; Credit "Cinematographer, Director" → "Director & Cinematographer"; Client "Industrial company at GIDC Anand" → "not a client"; Description rewritten to sourced facts |
| 37 | Design Team Lead: TGES-Schoogle, Ahmedabad (2014-2015) | Title was "Team Lead, Design: TGES/Schoogle, Ahmedabad (2014)"; Credit "Team Lead Design" → "Design Team Lead"; Date "2014" → "2014-12"; Description rewritten to sourced facts |
| 42 | Chhello Divas: Assistant Cinematographer, Unit Stills & BTS (2015) | Title was "Chhello Divas: Unit Stills & BTS"; Credit "Unit Still Photographer" → "Assistant Cinematographer, Unit Still Photographer & BTS"; Client "Krishnadev Yagnik" → "Chhello Divas (dir. Krishnadev Yagnik)"; Date "2015-04-01" → "2015-04"; Description rewritten to sourced facts; Evidence 5 → 2 (duplicates/misfiled removed or merged in) |
| 121 | Sameer (Feature Film): Unit Stills & BTS (2015) | Credit "Unit Still Photographer" → "Unit Still Photographer & BTS"; Description rewritten to sourced facts |
| 47 | Wedding Commission: Niyati Patel (2015) | Title was "First Wedding Commission: Niyati Patel (2015)"; Credit "Photographer" → "Wedding photographer"; Client "Niyati Patel" → "Private wedding clients"; Date "2015" → "2015-10"; Description rewritten to sourced facts |
| 46 | Chhello Divas Releases: Gujarati Cult Classic (2015) | **Removed.** merged into #42: Chhello Divas release is the same credit as #42 |
| 122 | Art Director: Patel vs Patrik (Feature, 2016) | Description rewritten to sourced facts |
| 51 | First Cinematography Showreel (2016) | Client "Self" → "not a client"; Description rewritten to sourced facts |
| 50 | Ullu ki Kahani: Pondicherry Travel Film (2016) | Title was "Pondicherry Travel Film: Director & Cinematographer (2016)"; Credit "Cinematographer" → "Director & Cinematographer"; Client "Self" → "not a client"; Date "2016-02-01" → "2016-02"; Description rewritten to sourced facts |
| 52 | Visiting Faculty: SEMCOM (since 2016) | Date "2016" → "2016-04"; Description rewritten to sourced facts |
| 137 | Home Halt: Brand Identity & Website (2016) | Description rewritten to sourced facts |
| 140 | Swachh Bharat Abhiyan: Documentary Photography, Rajpipla (2016) | Title was "Swachh Bharat Abhiyan: Documentary Photography (Govt of India, 2016)"; Credit "Photographer" → "Documentary photographer"; Client "Govt of India" → "not a client"; Description rewritten to sourced facts |
| 139 | Passport (Feature Film): Unit Stills & BTS (2016) | Credit "Unit Still Photographer" → "Unit Still Photographer & BTS"; Description rewritten to sourced facts |
| 56 | Europe Photography: Belgium, Netherlands, France, Italy (2017) | Title was "Europe Photography Trip: Italy, France, Netherlands, Belgium (2017)"; Client "Self" → "not a client"; Date "2017" → "2017-07"; Description rewritten to sourced facts |
| 117 | Rescues Diana: Ahmedabad (2017) | **Removed.** personal: Diana |
| 53 | Co-founds Pixelate: Blockchain Photo Startup (2017) | Client "Pixelate" → "not a client"; Date "2017" → "2017-03"; Description rewritten to sourced facts; Evidence 2 → 1 (duplicates/misfiled removed or merged in) |
| 130 | Aabad Bread and Super Bread: Corporate Films, Director & DP (2017) | Title was "Abad Bread: Corporate Films (Director/DP, 2017)"; Credit "Cinematographer, Director" → "Director & Cinematographer"; Client "Letsarc Media" → "LetsArc Media"; Date "2017-06-01" → "2017-06"; Description rewritten to sourced facts; Evidence 2 → 1 (duplicates/misfiled removed or merged in) |
| 128 | Hotel Armoise: Ad Film, Director & Cinematographer (2017) | Title was "Armoise Hotel Ad: Director & Cinematographer (2017)"; Credit "Cinematographer, Director" → "Director & Cinematographer"; Client "Letsarc Media" → "LetsArc Media"; Description rewritten to sourced facts |
| 54 | Wins Startup Weekend Bangalore: 54-Hour Challenge (2017) | Client "Pixelate" → "not a client"; Date "2017-10-01" → "2017-10"; Description rewritten to sourced facts |
| 136 | Dell TVC: Art Director, "Ek Behtar Kal Ka Aarambh" (2017) | Client "Dell Electronics" → "Dell"; Description rewritten to sourced facts |
| 123 | MAP Oil TVC: Art Director (2016) | Title was "Art Director: MAP Oil National TVC (2017)"; Client "Map Oil" → "MAP Edible Oils"; Date "2017-12-02" → "2016"; Description rewritten to sourced facts |
| 135 | Wedding Films & Photography: Cassidix Media Works (2018-2025) | Credit "Cinematographer, Photographer" → "Cinematographer & Photographer"; Client "cassidix media works" → "Cassidix Media Works"; Date "2018-01-01" → "2018"; Description rewritten to sourced facts; Evidence 4 → 1 (duplicates/misfiled removed or merged in) |
| 57 | Drafts the Pixelate Whitepaper (2018) | Client "Pixelate" → "not a client"; Date "2018" → "2018-04"; Description rewritten to sourced facts |
| 58 | Tosha's Bride Book: Wedding Film (2018) | Title was "Tosha Wedding Film: Cinematographer & Editor (2018)"; Credit "Cinematographer, Editor" → "Director, Cinematographer & Editor"; Client "Tosha (wedding)" → "Private wedding clients"; Description rewritten to sourced facts; Evidence 2 → 1 (duplicates/misfiled removed or merged in) |
| 131 | Computational Photography: Self-Taught (Udacity) | **Removed.** education: self-taught Udacity coursework |
| 59 | Certified Blockchain Expert: Blockchain Council (2018) | Credit "Blockchain Expert" → "(none)"; Client "Blockchain Council" → "not a client"; Date "2018" → "2018-07"; Description rewritten to sourced facts; Evidence 2 → 1 (duplicates/misfiled removed or merged in) |
| 60 | Tarikshir: Book Cover, Trailer and Launch Social Media, Dubai (2018) | Title was "Tarikshir Book Launch: Marketing Lead, Dubai (2018)"; Credit "Promotor" → "Cover designer, book-trailer director & social media manager"; Date "2018-08-01" → "2018-08"; Description rewritten to sourced facts; Evidence 8 → 2 (duplicates/misfiled removed or merged in) |
| 65 | The Other Woman (Lana Del Rey cover) ft. Iti: Music Video (2019) | Title was "Music Video: The Other Woman ft. Iti, Director & DP (2019)"; Credit "Director, Cinematographer" → "Director & Cinematographer"; Client "Self" → "not a client"; Description rewritten to sourced facts |
| 129 | Surat Municipal Corporation: 3 Energy Films, DP (2017-2018) | Title was "Surat Municipal Corporation: 3 Corporate Films (DP, 2026)"; Credit "Cinematographer" → "Cinematographer & motion-graphics designer"; Client "Letsarc Media" → "LetsArc Media"; Date "2019-06-08" → "2017-09"; Description rewritten to sourced facts; Evidence 3 → 1 (duplicates/misfiled removed or merged in) |
| 66 | Guest Lecturer: CVM College of Fine Arts (2019) | Credit "Visiting Faculty" → "Guest Lecturer"; Date "2019" → "2019-09"; Description rewritten to sourced facts |
| 70 | Jadi Duty: Ayurvedic Brand Identity & Packaging (2020) | Date "2020-01-01" → "2020"; Description rewritten to sourced facts |
| 68 | Research Associate: OCTO Advisory (2020) | Date "2020" → "2020-04"; Description rewritten to sourced facts |
| 69 | Essay: The Human Eye & Its Collective Visual Knowledge (2020) | Credit "Researcher" → "Researcher & writer"; Client "Self" → "not a client"; Date "2020" → "2020-09"; Description rewritten to sourced facts |
| 126 | Gujarat Tourism Ad Films: Art Director (2020) | Credit "Art Director" → "Art Director & Production Associate"; Date "2020-09-01" → "2020-09"; Description rewritten to sourced facts; Evidence 19 → 18 (duplicates/misfiled removed or merged in) |
| 71 | NEAR Protocol Accelerator: Pixelate Co-founder (2021) | Client "Pixelate" → "not a client"; Description rewritten to sourced facts |
| 74 | $15,000 NEAR Fast Grant: 14 Oct 2021 | Client "NEAR Foundation" → "not a client"; Description rewritten to sourced facts |
| 77 | Workshop on Wheels (WOW): Brand Identity (2022) | Date "2022" → "2022"; Description rewritten to sourced facts |
| 78 | Silver Dragon: Restaurant Rebrand (2022) | Client "Silver Dragon (est. 1995)" → "Silver Dragon"; Date "2022" → "2022"; Description rewritten to sourced facts |
| 79 | MK Engineering Works: Industrial Brand Identity (2022) | Date "2022" → "2022"; Description rewritten to sourced facts; Evidence 8 → 5 (duplicates/misfiled removed or merged in) |
| 76 | Incorporates Haus of Pixels OPC Pvt Ltd (2022) | Credit "Founder" → "Founder & Director"; Client "Haus of Pixels OPC Pvt Ltd" → "not a client"; Date "2022" → "2022-04"; Description rewritten to sourced facts |
| 118 | Volunteer Event Promoter: Arahantas, Himachal (2022) | Credit "Volunteer" → "Volunteer: events and promotion"; Client "Arahantas" → "not a client"; Date "2022-05-01" → "2022-05"; Description rewritten to sourced facts; Evidence 6 → 1 (duplicates/misfiled removed or merged in) |
| 138 | My Village Tea: Packaging & Branding, Kangra (2022) | Description rewritten to sourced facts |
| 81 | House of Glam: Beauty Brand Identity (2023) | Date "2023" → "2023"; Description rewritten to sourced facts |
| 82 | Cross.pet: Pet E-commerce Brand Identity (2023) | Title was "Cross.pet: Pet E-commerce Brand Identity (For Sale, 2023)"; Date "2023" → "2023"; Description rewritten to sourced facts |
| 85 | Arahantas Yoga: Brand Identity & Photography (2023) | Credit "Designer, Photographer" → "Designer & Photographer"; Date "2023" → "2023"; Description rewritten to sourced facts |
| 83 | Yogesh Khaman: Food Photography and LED Screen Content (2023) | Title was "Yogesh Khaman: LED Food Commercial (Director/DP, 2023)"; Credit "Photographer, Director" → "Photographer & editor"; Description rewritten to sourced facts; Evidence 23 → 15 (duplicates/misfiled removed or merged in) |
| 88 | Portfolio 2023: 24-Module Behance Anthology | Client "Self" → "not a client"; Description rewritten to sourced facts; Evidence 2 → 1 (duplicates/misfiled removed or merged in) |
| 84 | Pasoori Cover by Serena Nanawati: Music Video (2023) | Title was "Serena Nanawati Music Video: Art Director & DP (2023)"; Credit "Art Director, Cinematographer" → "Art Director & Cinematographer"; Description rewritten to sourced facts |
| 102 | Buddy Tales Animated Pilot: Director & Producer, Shivanata (2023-2025) | Title was "Director & Producer: Buddy Tales Animated Series (Shivanata, 2023–2025)"; Credit "Director, Producer" → "Director & Producer"; Date "2023-12-01" → "2023-12"; Description rewritten to sourced facts; Evidence 2 → 1 (duplicates/misfiled removed or merged in) |
| 94 | Singapore & Malaysia Travel Films (2023-2024) | Title was "Singapore & Malaysia Travel Film: Flamingo Travels (2023)"; Credit "Cinematographer" → "Director & Cinematographer"; Client "Flamingo Travels, Ahmedabad" → "not a client"; Description rewritten to sourced facts; Evidence 2 → 1 (duplicates/misfiled removed or merged in) |
| 96 | Mankind Pharma: Internal Corporate Film (Director/Editor, 2024) | Credit "Director, Editor" → "Director & Editor"; Client "Mankind Pharma (Anil Kumar Yadav)" → "Mankind Pharma"; Date "2024-01-01" → "2024-06"; Description rewritten to sourced facts |
| 133 | Generative AI Toolstack (2024-2026) | Title was "Generative AI Toolstack: 15+ Production Tools"; Credit "GenAI Expert" → "(none)"; Client "Rabble Labs / BuidlersTribe" → "not a client"; Date "2024-01-01" → "2024"; Description rewritten to sourced facts |
| 90 | Co-founds KindHealth: Health-Tech Venture (2024) | Client "KindHealth" → "not a client"; Description rewritten to sourced facts |
| 91 | KindHealth: Financial Model (2024) | **Removed.** merged into #90: KindHealth financial model is part of the KindHealth venture |
| 92 | Its a Baby! Studios: Full Brand Identity (2024) | Date "2024" → "2024-05"; Description rewritten to sourced facts |
| 95 | Health-Tech Co-founding Stint: Riga, Latvia (2024) | **Removed.** merged into #90: Riga stint was KindHealth (WB-people: Saransh Sharma, KindHealth co-founder + Latvia trip 2024) |
| 97 | Pixelate Winds Down (2024) | Client "Pixelate" → "not a client"; Description rewritten to sourced facts |
| 98 | Energy-Policy Analyst (Volunteer): Auroville Consulting (since 2024) | Title was "Energy-Policy Analyst (Volunteer): Auroville Consulting (2024)"; Credit "Volunteer" → "Energy-policy analyst (volunteer)"; Client "Auroville Consulting" → "not a client"; Description rewritten to sourced facts; Status Completed → Ongoing |
| 100 | Visual Design Consultant: Rabble Labs & BuidlersTribe (2024-2026) | Title was "Visual Design Consultant: Rabble Labs & BuidlersTribe (2024)"; Credit "Visual Designer Consultant" → "Visual Design Consultant"; Description rewritten to sourced facts; Evidence 19 → 16 (duplicates/misfiled removed or merged in) |
| 141 | Kalarigram Mahashivratri: Travel Film, Auroville (2025) | Title was "Kalarigram Mahashivratri: Travel Film (Director/Editor, 2025)"; Credit "Cinematographer, Editor" → "Director, Cinematographer & Editor"; Client "Self" → "not a client"; Description rewritten to sourced facts |
| 103 | Conscious Cafe: Menu Design, Pondicherry (2025) | Client "Conscious Cafe (Kirtana Vurgese + Bhavninder Singh)" → "Conscious Cafe"; Date "2025-05-01" → "2025-03"; Description rewritten to sourced facts |
| 127 | Petved: Pet Nutrition Brand & Packaging (2025) | Client "Petved nutritions pvt ltd" → "Petved Nutritions Pvt Ltd"; Date "2025-08-01" → "2025-08" |
| 106 | Green Silk Road: Communication Manager and Map Portal Build (Volunteer, since 2024) | Title was "Green Silk Road: Map Portal (Tech Contractor, 2025)"; Credit "Tech contractor" → "Communication manager (volunteer)"; Client "Green Silk Road (Gijs Spoor)" → "not a client"; Date "2025-12-02" → "2024-08"; Description rewritten to sourced facts |
| 142 | Producer & Director: Mahabharata Web Series, Ep.1 "Vastraharan" | Credit "Producer, Director" → "Producer & Director"; Client "Shivanata Production LLP" → "not a client"; Date "2026-03-01" → "2026-03"; Description rewritten to sourced facts |
| 132 | Contact: Anirudh Venkatesan | **Removed.** not work: contact card (contact page has its own list) |
