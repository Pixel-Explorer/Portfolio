// Truth pass, 19 Oct 2026.
//
// Every entry on the site was checked against Anirudh's own records. This
// script applies the result in one place, keyed by entry id, so each change
// can be read, re-run and reverted. Sources cited in the comments:
//
//   CV   Anirudh Venkatesan - CV - ATS (24 Jul 2026)
//   LI   LinkedIn data export (8 May 2026): Positions, Education, Honors
//   WB   workbook sheets (anirudh-ledger-v4.xlsx, mirrored in the old
//        ledger.json): roles / films / firsts / people
//   NL   Notion "Evidence Ledger"
//   YT   YouTube title and upload date (oEmbed + watch page, 19 Oct 2026)
//   GM   Gmail thread-id timestamp
//
// Outputs:
//   data/ledger.json            public: work entries + public fields only
//   data/private/*.json         NOT deployed (.vercelignore): pre-audit
//                               backups, removed entries, provenance, people,
//                               firsts, fees
//   data/case-studies.json      rebuilt from the sources above
//   data/gallery.json           location labels cleaned, family photos out
//   data/ledger-data-static.js  regenerated offline fallback
//
// Idempotent: always transforms from the pre-audit backups.
//
//   node scripts/truth-audit-2026-10.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteAll } from "./proof-hosting.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => resolve(root, ...p);
const PRIVATE = P("data/private");
mkdirSync(PRIVATE, { recursive: true });

function backup(src, name) {
  const dst = resolve(PRIVATE, name);
  if (!existsSync(dst)) copyFileSync(src, dst);
  return JSON.parse(readFileSync(dst, "utf8"));
}

const ledger = backup(P("data/ledger.json"), "ledger-pre-audit-2026-10-19.json");
const caseData = backup(P("data/case-studies.json"), "case-studies-pre-audit-2026-10-19.json");
const gallery = backup(P("data/gallery.json"), "gallery-pre-audit-2026-10-19.json");

// ── Role families ──────────────────────────────────────────────────────
// The Roles page lists these and nothing else. Each entry keeps its exact
// credit in `role` (what the card shows); `roles` holds the families it
// files under.
const F = {
  DIR: "Director", CIN: "Cinematographer", PHO: "Photographer", EDI: "Editor",
  ART: "Art Director", PRO: "Producer", DES: "Designer", FOU: "Founder",
  TEA: "Teaching", RES: "Research", LEA: "Leadership & Volunteering",
};

// Families → discipline themes (the archive's left rail).
const THEME_OF = {
  Director: "Moving Images", Cinematographer: "Moving Images", Photographer: "Moving Images",
  Editor: "Moving Images", Producer: "Moving Images",
  Designer: "Visual Systems", "Art Director": "Visual Systems",
  Founder: "Leadership & Teaching", Teaching: "Leadership & Teaching",
  "Leadership & Volunteering": "Leadership & Teaching",
  Research: "Documentation & Research",
};

// ── Removed from the site (owner decision, 19 Oct 2026) ────────────────
// Personal and education entries leave the public archive entirely. Merged
// entries are folded into the entry named in `into`.
const REMOVE = {
  111: "education: KV Cambay schooling",
  112: "education: KV Vallabh Vidyanagar schooling",
  113: "education: Angels Higher Secondary",
  7: "education: BBA start",
  30: "education: BBA graduation",
  32: "education: NID entrance prep",
  131: "education: self-taught Udacity coursework",
  2: "personal: family settles in Anand (source was 'Inferred')",
  4: "personal: first email (client was a family member's handle)",
  117: "personal: Diana",
  132: "not work: contact card (contact page has its own list)",
  116: "unverifiable: WB-firsts dates these wins pre-2009 with details TBD; site said 2014 'during college'",
};
const MERGE = {
  46: { into: 42, why: "Chhello Divas release is the same credit as #42" },
  91: { into: 90, why: "KindHealth financial model is part of the KindHealth venture" },
  95: { into: 90, why: "Riga stint was KindHealth (WB-people: Saransh Sharma, KindHealth co-founder + Latvia trip 2024)" },
};

// ── Per-entry corrections ──────────────────────────────────────────────
// Keys: title, role (exact credit), roles (families), client (clientCanonical,
// "" = not a client), org, date, location, activityType, status, description,
// fmt (format tags), themes (extra discipline themes), evidence ops.
const PRIVATE_WEDDINGS = "Private wedding clients";
const E = {
  3: { // Owner, 19 Oct: bring back as Intern. GM "Jun 24 2010 project report submission"; WB-firsts "First mentor-graded project closure"
    title: "Internship: Anupam Industries, GIDC Anand (2010)",
    role: "Intern", roles: [], client: "", org: "Anupam Industries, GIDC Anand", activityType: "Internship",
    description: "Second-year SEMCOM internship at Anupam Industries in the GIDC Anand industrial estate. Project report submitted in June 2010.",
    fmt: ["Internship"],
  },
  9: { // GM 2010-10-14; WB-roles "AIESEC Member / OGX"
    role: "AIESEC member, outgoing exchange (OGX) team", roles: [F.LEA], client: "", org: "AIESEC Vidyanagar",
    description: "Joined AIESEC Vidyanagar on 14 October 2010 as a member of the outgoing exchange (OGX) team. It led to my first design brief a month later, then to VP Communications (2011) and Local Committee Coordinator (2012).",
    fmt: ["AIESEC"], dropEvidence: "all", // the poster and tee belong to #11 and #13
  },
  11: { // GM 2010-11-17; WB-firsts "First design brief" (volunteer work, so not "commercial")
    title: "First Design Brief: AIESEC OGX Fair Posters (2010)",
    role: "Poster designer (volunteer)", roles: [F.DES], client: "", org: "AIESEC Vidyanagar",
    description: "My first design brief: posters for the AIESEC OGX (outgoing exchange) Fair in Vallabh Vidyanagar, made with Kunal Shah in November 2010. I installed Photoshop for the first time to make them.",
    fmt: ["AIESEC", "Poster"],
  },
  13: { // GM 2010-11-21; WB-firsts "First t-shirt designed"
    role: "T-shirt designer (volunteer)", roles: [F.DES], client: "", org: "AIESEC Vidyanagar",
    description: "The front graphic for the AIESEC OGX Fair t-shirt (November 2010), my first t-shirt design.",
    fmt: ["AIESEC", "Apparel"],
  },
  15: { // LI "Vice president Communications and Information Management, 2011"; WB-roles May 2011 - May 2012
    role: "VP Communications & Information Management", roles: [F.LEA], client: "", org: "AIESEC Vidyanagar", date: "2011-05",
    description: "VP Communications and Information Management at AIESEC Vidyanagar from May 2011 to May 2012: posters, recruitment campaigns and conference branding for the chapter.",
    fmt: ["AIESEC"],
  },
  14: { // DeviantArt post Dec 2011 (deviation 272642222). Paid status open: WB-firsts names Greenopia (Nov 2012) as first paid work.
    title: "First Paid Photoshoot: Nail Salon, Bandra, Mumbai (2011)",
    role: "Photographer", roles: [F.PHO], client: "Bandra Nail Salon", org: "Bandra Nail Salon",
    description: "My first paid photography commission: a commercial set for a boutique nail salon in Bandra, Mumbai, booked after a chance meeting at a coffee shop (December 2011).",
    fmt: ["Commercial"],
  },
  125: { // YT "SEMCOM College Leave a Mark" (25 Jan 2012); WB-films Director/Editor, College Promo, client SEMCOM
    title: "SEMCOM 'Leave a Mark': Ad-Film Competition Winner (2012)",
    role: "Director & Editor", roles: [F.DIR, F.EDI], client: "SEMCOM College", org: "SEMCOM College", activityType: "Promo Film",
    location: "Vallabh Vidyanagar, Gujarat",
    description: "Directed and edited 'Leave a Mark', a promotional film for SEMCOM College that won the college's ad-film competition (January 2012).",
    fmt: ["Promo Film"],
  },
  28: {
    role: "Designer", roles: [F.DES], client: "Shril Patel",
    description: "Visiting-card design for Shril Patel (February 2012).",
    fmt: ["Print"],
  },
  17: { // GM 2012-05-31; WB-firsts "First leadership role"
    role: "Local Committee Coordinator", roles: [F.LEA], client: "", org: "AIESEC Vidyanagar",
    description: "Elected Local Committee Coordinator of AIESEC Vidyanagar on 31 May 2012: the top role in the chapter, leading its expansion across Vallabh Vidyanagar and reporting to AIESEC Baroda.",
    fmt: ["AIESEC"],
  },
  18: {
    title: "JNC 2012 and GoGujarat: AIESEC Vidyanagar (2012)",
    role: "Local Committee Coordinator", roles: [F.LEA], client: "", org: "AIESEC Vidyanagar", date: "2012-07",
    description: "Led AIESEC Vidyanagar through JNC 2012 and the GoGujarat project: delegates, branding and logistics.",
    fmt: ["AIESEC", "Conference"],
  },
  20: { // YT "Vantage Point" (15 Mar 2012); WB-films Director/Editor
    role: "Director & Editor (with Parth Brahmbhatt)", roles: [F.DIR, F.EDI], client: "", org: "SEMCOM team at Mithibai Kshitij",
    description: "Represented SEMCOM at the Mithibai Kshitij student festival in Mumbai with two short films made with Parth Brahmbhatt, including 'Vantage Point' (2012).",
    fmt: ["Short Film"],
  },
  25: { // GM 2012-11-26; WB-firsts "First confirmed paid commercial work" + "First recurring paid client"; WB-people arc to 2020
    title: "First Paid Design Client: Greenopia (2012)",
    role: "Designer", roles: [F.DES], client: "Greenopia", org: "Greenopia (Hrishit and Nilkanth Ray)",
    description: "My first paid design work: Facebook cover art and social assets for Greenopia (Hrishit and Nilkanth Ray), on a 24-hour turnaround in November 2012. Greenopia stayed a client until 2020.",
    fmt: ["Social Media"],
  },
  36: {
    role: "Wedding photographer", roles: [F.PHO], client: PRIVATE_WEDDINGS, org: "Private clients",
    description: "Freelance wedding photography across Gujarat since 2014: candid coverage and portraits for private clients.",
    fmt: ["Wedding"],
  },
  119: { // Gmail Jan 2014 (3 confirmation emails, WB-people). Owner, 19 Oct: first wedding shoot.
    title: "First Wedding Shoot: Destination Wedding, Mathura, UP (2014)",
    role: "Wedding photographer", roles: [F.PHO], client: PRIVATE_WEDDINGS, org: "Private client",
    description: "My first wedding shoot: a destination wedding in Mathura, Uttar Pradesh (January 2014).",
    fmt: ["Wedding"],
  },
  43: { // YT "Jepoor - Do Aana", uploaded 13 Aug 2015; WB-films Music Video, Director/Cinematographer
    title: "Jepoor (Do Aana): Music Video, Director & Cinematographer (2015)",
    role: "Director & Cinematographer", roles: [F.DIR, F.CIN], client: "", org: "Self-initiated",
    date: "2015-08", location: "", activityType: "Music Video",
    description: "Directed and shot 'Jepoor (Do Aana)', an independent music video, published in August 2015.",
    fmt: ["Music Video"],
  },
  35: { // YT "Pep and Joss" (9 Jun 2014); WB-films client "Industrial company GIDC Anand"
    title: "Pep & Joss: Corporate Film, Director & Cinematographer (2014)",
    role: "Director & Cinematographer", roles: [F.DIR, F.CIN], client: "Pep & Joss", org: "Pep & Joss",
    description: "Directed and shot a corporate film for Pep & Joss on its factory floor in GIDC Anand (June 2014).",
    fmt: ["Corporate Film"],
  },
  37: { // WB-firsts "First paid management role: Team Lead Design, 3 direct reports"; WB-roles Dec 2014 - Mar 2015
    title: "Design Team Lead: TGES-Schoogle, Ahmedabad (2014-2015)",
    role: "Design Team Lead", roles: [F.DES], client: "TGES-Schoogle", date: "2014-12",
    description: "Design team lead at TGES-Schoogle, an ed-tech company in Ahmedabad, from December 2014 to March 2015: my first salaried job, managing three designers.",
    fmt: ["In-house"],
  },
  42: { // WB-roles + WB-films + NL + CV: Asst Cinematographer / Stills / BTS. YT: 4 BTS videos = 538,783 views.
    title: "Chhello Divas: Assistant Cinematographer, Unit Stills & BTS (2015)",
    role: "Assistant Cinematographer, Unit Still Photographer & BTS", roles: [F.CIN, F.PHO],
    client: "Chhello Divas (dir. Krishnadev Yagnik)", org: "Chhello Divas (dir. Krishnadev Yagnik)", date: "2015-04",
    description: "Assistant cinematographer, unit still photographer and behind-the-scenes videographer on Krishnadev Yagnik's Gujarati feature Chhello Divas, released in theatres on 20 November 2015. My four BTS videos from the set have about 539,000 combined views on YouTube.",
    fmt: ["Feature Film", "BTS"],
  },
  121: {
    role: "Unit Still Photographer & BTS", roles: [F.PHO], client: "Nomad Movies Pvt Ltd",
    description: "Unit stills and behind-the-scenes coverage for Nomad Movies' feature film Sameer (2015).",
    fmt: ["Feature Film", "BTS"],
  },
  47: { // WB-firsts "First wedding shoot (documented)" conflicts with #119 (Jan 2014): "first" dropped
    title: "Wedding Commission: Niyati Patel (2015)",
    role: "Wedding photographer", roles: [F.PHO], client: PRIVATE_WEDDINGS, org: "Niyati Patel",
    description: "Wedding photography for Niyati Patel's celebration (October 2015).",
    fmt: ["Wedding"],
  },
  122: { // WB-firsts "First Art Director on a feature"
    role: "Art Director", roles: [F.ART], client: "Dhwani Gautam Films",
    description: "Art direction for Dhwani Gautam Films' feature Patel vs Patrik in 2016: set design, styling and scenic layouts. My first feature as art director; production stopped before release.",
    fmt: ["Feature Film"],
  },
  51: { // YT uploaded 8 Jan 2016 (embedding is disabled on YouTube)
    role: "Cinematographer", roles: [F.CIN], client: "", org: "Self-initiated",
    description: "My first cinematography showreel, published in January 2016.",
    fmt: ["Showreel"],
  },
  50: { // YT "Ullu ki Kahani - Pondicherry" (17 Feb 2017); WB-films Director/Cinematographer, "was in Pondi 2016"
    title: "Ullu ki Kahani: Pondicherry Travel Film (2016)",
    role: "Director & Cinematographer", roles: [F.DIR, F.CIN], client: "", org: "Self-initiated",
    description: "Directed and shot 'Ullu ki Kahani', an independent travel film made in Pondicherry in 2016 and published in February 2017.",
    fmt: ["Travel Film"],
  },
  52: { // LI "Visiting Faculty, Apr 2016": digital media marketing tools, digital cinematography, film editing, blockchain
    role: "Visiting Faculty", roles: [F.TEA], client: "SEMCOM College", date: "2016-04",
    description: "Visiting faculty at SEMCOM, my own college, since April 2016: digital media marketing tools, digital cinematography, film editing and blockchain.",
    fmt: ["Teaching"],
  },
  137: {
    role: "Designer", roles: [F.DES], client: "Home Halt", date: "2016",
    description: "Brand identity and website for Home Halt (2016): logo, visual language and web presence.",
    fmt: ["Brand Identity", "Web Design"],
  },
  140: { // Commissioning party unconfirmed: "Govt of India" as client removed until confirmed
    title: "Swachh Bharat Abhiyan: Documentary Photography, Rajpipla (2016)",
    role: "Documentary photographer", roles: [F.PHO], client: "", org: "Commissioned by an NGO", date: "2016",
    description: "Documentary photographs of Swachh Bharat Abhiyan sanitation work in Rajpipla, Gujarat, commissioned by an NGO (2016).",
    fmt: ["Documentary"], themes: ["Documentation & Research"],
  },
  139: {
    role: "Unit Still Photographer & BTS", roles: [F.PHO], client: "Passport Film", activityType: "Feature Film",
    description: "Unit stills and behind-the-scenes coverage on the set of the feature film Passport (2016).",
    fmt: ["Feature Film", "BTS"],
  },
  56: { // gallery.json EXIF: 11 Jul - 19 Aug 2017; WB-firsts "First international art sales: Displate Europe series (44 prints), Dec 2018"
    title: "Europe Photography: Belgium, Netherlands, France, Italy (2017)",
    role: "Photographer", roles: [F.PHO], client: "", org: "Self-initiated", date: "2017-07",
    location: "Belgium, Netherlands, France, Italy",
    description: "Street and travel photography across Belgium, the Netherlands, France and Italy in July and August 2017. The series later sold as 44 prints on Displate (December 2018).",
    fmt: ["Travel"],
  },
  53: { // LI Pixelate Co-Founder Mar 2017; WB-roles; NL "Live Web2 MVP at app.pixelate.photos (12,000+ images)"
    role: "Co-founder", roles: [F.FOU], client: "", org: "Pixelate", date: "2017-03",
    description: "Co-founded Pixelate with Ronak P Amin and Pranav Burnwal in March 2017: a market for camera-sensor photographs. The token design reached whitepaper stage; a Web2 MVP shipped at app.pixelate.photos.",
    fmt: ["Web3", "Startup"], themes: ["Computational Culture"],
    dropEvidence: ["proof/54/Screenshot_2026-05-29_171244.png"], // belongs to #54
  },
  130: { // YT "Aabad Bread - LetsArc Media" (19 Aug 2017) + "Super Bread - LetsArc Media"
    title: "Aabad Bread and Super Bread: Corporate Films, Director & DP (2017)",
    role: "Director & Cinematographer", roles: [F.DIR, F.CIN], client: "LetsArc Media", org: "LetsArc Media",
    description: "Directed and shot films for Aabad Bread and Super Bread through LetsArc Media, published in August 2017.",
    fmt: ["Corporate Film"],
  },
  128: { // YT "Hotel Armoise - LetsArc Media" (3 Jul 2017)
    title: "Hotel Armoise: Ad Film, Director & Cinematographer (2017)",
    role: "Director & Cinematographer", roles: [F.DIR, F.CIN], client: "LetsArc Media", org: "LetsArc Media",
    description: "Directed and shot an ad film for Hotel Armoise through LetsArc Media, published in July 2017.",
    fmt: ["Ad Film"],
  },
  54: { // LI Honors "Winner, Blockchain startup challenge in 54 hours, Oct 2017"
    role: "Co-founder", roles: [F.FOU], client: "", org: "Pixelate",
    description: "Won the 54-hour Startup Weekend Bangalore blockchain challenge with the Pixelate team (October 2017).",
    fmt: ["Web3", "Award"], themes: ["Computational Culture"],
  },
  136: { // WB-films lists Dell TVC with "Year + role TBD": kept as entered, flagged for confirmation
    role: "Art Director", roles: [F.ART], client: "Dell", org: "Dell",
    description: "Art direction for Dell's 'Ek Behtar Kal Ka Aarambh' television commercial (2017): set and frame-level visual language.",
    fmt: ["TVC"],
  },
  123: { // WB-films 2016 "First TVC Art Director"; WB-firsts 2016 "First TVC Art Direction"; YT live by 5 Jun 2017 (site said Dec 2017)
    title: "MAP Oil TVC: Art Director (2016)",
    role: "Art Director", roles: [F.ART], client: "MAP Edible Oils", org: "MAP Edible Oils", date: "2016",
    description: "Art direction for a MAP Premium Edible Oils television commercial: set design and visual treatment. My first TVC as art director.",
    fmt: ["TVC"],
  },
  135: {
    role: "Cinematographer & Photographer", roles: [F.CIN, F.PHO], client: "Cassidix Media Works", org: "Cassidix Media Works",
    description: "Wedding films and photography with Cassidix Media Works from 2018 to 2025.",
    fmt: ["Wedding"],
  },
  57: {
    role: "Co-founder", roles: [F.FOU], client: "", org: "Pixelate", date: "2018-04",
    description: "Drafted the Pixelate whitepaper: the technical and economic design for owning and trading camera-sensor photographs (2018).",
    fmt: ["Web3", "Whitepaper"], themes: ["Computational Culture"],
  },
  58: { // YT "Tosha's Bride Book" (29 Jun 2018); WB-films Director; site Cinematographer & Editor
    title: "Tosha's Bride Book: Wedding Film (2018)",
    role: "Director, Cinematographer & Editor", roles: [F.DIR, F.CIN, F.EDI], client: PRIVATE_WEDDINGS, org: "Tosha (wedding)",
    location: "Ankleshwar, Gujarat",
    description: "Directed, shot and edited 'Tosha's Bride Book', a wedding film from Ankleshwar, Gujarat, built around unscripted moments (June 2018).",
    fmt: ["Wedding Film"],
  },
  59: { // LI Certifications Jul 2018, #11770046. A certification, not a role or a client.
    role: "", roles: [], client: "", org: "Blockchain Council", date: "2018-07", activityType: "Certification",
    description: "Certified Blockchain Expert, Blockchain Council (July 2018, credential 11770046).",
    fmt: ["Certification", "Web3"], themes: ["Computational Culture"],
    evidenceType: { "accredible.com": "image" },
  },
  60: { // LI "Social Media Manager, Khayaal Patel, Aug 2018 - Jan 2019, Dubai"; WB-films book trailer (Director, Aug 2018);
        // WB-firsts "First book designed: Tarikshir"; CV cover + identity for the Starmark trilogy
    title: "Tarikshir: Book Cover, Trailer and Launch Social Media, Dubai (2018)",
    role: "Cover designer, book-trailer director & social media manager", roles: [F.DES, F.DIR],
    client: "Khayaal Patel / Starmark", date: "2018-08",
    description: "Designed the cover of Khayaal Patel's novel Tarikshir (Starmark), directed its book trailer, and managed the author's social media from August 2018 to January 2019, including the launch in Dubai. My first trip abroad.",
    fmt: ["Book Design", "Book Trailer", "Social Media"],
  },
  65: { // YT "The other woman - Lana Del Rey ft. Iti (Music Video)" (27 Apr 2019)
    title: "The Other Woman (Lana Del Rey cover) ft. Iti: Music Video (2019)",
    role: "Director & Cinematographer", roles: [F.DIR, F.CIN], client: "", org: "Self-initiated",
    description: "Directed and shot a music video for Iti's cover of Lana Del Rey's 'The Other Woman' (April 2019).",
    fmt: ["Music Video"],
  },
  129: { // YT: three SMC films by LetsArc Media, uploaded 28 Sep 2017 - 31 Jan 2018 (site said 2019 and "2026")
    title: "Surat Municipal Corporation: 3 Energy Films, DP (2017-2018)",
    role: "Cinematographer & motion-graphics designer", roles: [F.CIN], client: "LetsArc Media", org: "LetsArc Media",
    date: "2017-09", location: "Surat, Gujarat",
    description: "Cinematographer and motion-graphics designer on three Surat Municipal Corporation films on solar power and energy security, produced by LetsArc Media and published between September 2017 and January 2018.",
    fmt: ["Corporate Film"],
  },
  66: { // LI "Guest Lecturer, Sep 2019": four-day graphic design workshop
    title: "Guest Lecturer: CVM College of Fine Arts (2019)",
    role: "Guest Lecturer", roles: [F.TEA], client: "CVM College of Fine Arts", date: "2019-09",
    description: "A four-day workshop at CVM College of Fine Arts (September 2019) on the graphic design market: past, present and future. Students built a brand identity, a pitch and a website in Adobe XD.",
    fmt: ["Teaching", "Workshop"],
  },
  70: {
    title: "Jadi Duty: Ayurvedic Brand Identity & Packaging (2020-2021)",
    role: "Designer", roles: [F.DES], client: "Jadi Duty", date: "2020",
    description: "Brand identity and packaging for Jadi Duty, an Ayurvedic wellness brand (Ashwagandha, Moringa and Giloy capsules): an earth-toned, apothecary-style system across bottle labels and boxes.",
    fmt: ["Brand Identity", "Packaging"],
  },
  68: { // LI "Research Associate, OCTO Advisory, Apr - Aug 2020"
    role: "Research Associate", roles: [F.RES], client: "OCTO Advisory", date: "2020-04",
    description: "Research associate at OCTO Advisory, Vadodara (April to August 2020). Wrote two papers on the collaboration-software market: data for a SWOT analysis and the design of a native application.",
    fmt: ["Research"],
  },
  69: {
    role: "Researcher & writer", roles: [F.RES], client: "", org: "Self-initiated",
    description: "Researched and wrote 'The Human Eye and its Collective Visual Knowledge', an essay connecting my photography practice with how perception works (2020).",
    fmt: ["Essay"],
  },
  126: { // YT "The Gir Adventure" + "Gandhi Circuit" by ToT Media
    role: "Art Director & Production Associate", roles: [F.ART], client: "Gujarat Tourism", org: "Talk of the Town Media for Gujarat Tourism",
    description: "Art director and production associate on Gujarat Tourism ad films produced by Talk of the Town Media, including 'The Gir Adventure' and 'Gandhi Circuit': scenic design, spatial layouts and on-ground production.",
    fmt: ["Ad Film", "Tourism"],
  },
  71: { // NL NEAR Accelerator cohort Aug - Oct 2021
    role: "Co-founder", roles: [F.FOU], client: "", org: "Pixelate",
    description: "Pixelate was selected into the NEAR Protocol accelerator cohort (August to October 2021).",
    fmt: ["Web3", "Accelerator"], themes: ["Computational Culture"],
  },
  74: { // NL grant resolved: $15K NEAR Fast Grant, 14 Oct 2021
    role: "Co-founder", roles: [F.FOU], client: "", org: "Pixelate",
    description: "Pixelate received a $15,000 NEAR Fast Grant on 14 October 2021, eleven years to the day after I joined AIESEC.",
    fmt: ["Web3", "Grant"], themes: ["Computational Culture"], keepEarnings: true,
    evidenceType: { "linkedin.com": "link" },
  },
  77: {
    role: "Designer", roles: [F.DES], client: "WOW Services",
    description: "Brand identity for WOW (Workshop on Wheels), an at-home car-servicing concept: logo and visual language across print and digital.",
    fmt: ["Brand Identity"],
  },
  78: { // PDF p1: "Logo Guideline, Haus of Pixels Studio, Silver Dragon Chinese Restaurant"
    role: "Designer", roles: [F.DES], client: "Silver Dragon", org: "Silver Dragon",
    description: "Rebrand for Silver Dragon, an Indo-Chinese restaurant in Vallabh Vidyanagar open since 1995, under Haus of Pixels: new logo, colour palette and logo guidelines.",
    fmt: ["Brand Identity"],
  },
  79: { // "defence" claim came from an assistant-written note, not a source
    role: "Designer", roles: [F.DES], client: "MK Engineering",
    description: "Brand identity for MK Engineering Works, an industrial parts manufacturer: logo, colour palette and stationery.",
    fmt: ["Brand Identity"],
  },
  76: { // MCA CIN U72900GJ2022OPC131119, Apr 2022
    role: "Founder & Director", roles: [F.FOU], client: "", org: "Haus of Pixels OPC Pvt Ltd", date: "2022-04",
    description: "Incorporated Haus of Pixels OPC Pvt Ltd in Anand (CIN U72900GJ2022OPC131119) in April 2022, giving my independent practice a company, with me as sole owner and director.",
    fmt: ["Studio"], themes: ["Visual Systems"],
  },
  118: {
    role: "Volunteer: events and promotion", roles: [F.LEA], client: "", org: "Arahantas Yoga Studio",
    description: "Volunteered at Arahantas yoga studio in Dharamkot for three months of a five-month stay in Himachal Pradesh (2022): ran weekend events and made posters and social posts. It led to photography and social design work for the studio in 2023.",
    fmt: ["Volunteering"],
  },
  138: {
    role: "Designer", roles: [F.DES], client: "My Village Tea",
    description: "Branding and packaging for My Village Tea, a green-tea brand from Kangra, Himachal Pradesh (2022).",
    fmt: ["Brand Identity", "Packaging"],
  },
  81: {
    role: "Designer", roles: [F.DES], client: "House of Glam",
    description: "Brand identity for House of Glam, a beauty salon: a serif monogram on a textured-gold motif, applied across the brand's touchpoints.",
    fmt: ["Brand Identity"],
  },
  82: {
    title: "Cross.pet: Pet E-commerce Brand Identity (2023)",
    role: "Designer", roles: [F.DES], client: "Cross.pet",
    description: "Brand identity for cross.pet, an online pet store: an oversized logo mark that scales from the storefront to packaging and merchandise. The brand is available for sale.",
    fmt: ["Brand Identity", "Packaging"],
  },
  85: { // Owner, 19 Oct: photography + social only, no identity
    title: "Arahantas Yoga: Photography and Social Design (2023)",
    role: "Photographer & Designer", roles: [F.PHO, F.DES], client: "Arahantas",
    description: "Photographs of the daily practice at Arahantas Yoga in Dharamkot, plus social content and event posters (2023).",
    fmt: ["Photography", "Social Media"],
  },
  83: { // owner's note: 30+ year old khaman shop; product shoot turned into seasonal slideshows for an LED screen at a new outlet
    title: "Yogesh Khaman: Food Photography and LED Screen Content (2023)",
    role: "Photographer & editor", roles: [F.PHO, F.EDI], client: "Yogesh Khaman",
    description: "Product photography for Yogesh Khaman, a khaman shop running for over 30 years, edited into seasonal slideshows for the LED screen at its new outlet (2023).",
    fmt: ["Food Photography", "Motion"],
  },
  88: { // Behance 178557519; WB-firsts "First published portfolio", 26 Aug 2023
    role: "Designer", roles: [F.DES], client: "", org: "Self-initiated",
    description: "My 2023 portfolio, published on Behance as a 24-module presentation.",
    fmt: ["Portfolio"],
    evidenceType: { "drive.google.com": "link" },
  },
  84: { // YT "Pasoori Cover song music video"
    title: "Pasoori Cover by Serena Nanawati: Music Video (2023)",
    role: "Art Director & Cinematographer", roles: [F.ART, F.CIN], client: "Serena Nanawati",
    description: "Art director and cinematographer on Serena Nanawati's cover of 'Pasoori' (2023): shot design, lighting and camera movement.",
    fmt: ["Music Video"],
  },
  102: { // CV Producer & Director (Contract) Dec 2023 - Dec 2025: 50+ interviews, 4 hired, 10-minute pilot.
         // WB-roles/NL: Shivanata co-founded Feb 2025; WB-firsts: first offer letters 13 Oct 2025, wrap 24 Dec 2025.
    title: "Buddy Tales Animated Pilot: Director & Producer, Shivanata (2023-2025)",
    role: "Director & Producer", roles: [F.DIR, F.PRO], client: "Shivanata Production LLP",
    description: "Director and producer of Buddy Tales, an animated series for children, with Savan Barot for Shivanata Production LLP. It began as a client contract in December 2023. I ran 50+ interviews, hired and led a four-person remote team, and delivered a 10-minute pilot. Production wrapped on 24 December 2025.",
    fmt: ["Animation"],
    evidenceType: { "drive.google.com": "link" },
  },
  94: { // Owner, 19 Oct: Technoville paid; films for Flamingo Travels. NL: Dec 2023 - Mar 2024.
    title: "Singapore & Malaysia Travel Films for Flamingo Travels (2023-2024)",
    role: "Director & Cinematographer", roles: [F.DIR, F.CIN], client: "Technoville", org: "Technoville, for Flamingo Travels",
    description: "Travel films shot in Singapore and Malaysia for Flamingo Travels, under a contract with Technoville (December 2023 to March 2024).",
    fmt: ["Travel Film"],
  },
  96: { // YT "Mankind Pharma Internal Audio Visual" (12 Jun 2024). Fee moved to private data.
    role: "Director & Editor", roles: [F.DIR, F.EDI], client: "Mankind Pharma", org: "Mankind Pharma", date: "2024-06",
    description: "Directed and edited an internal audio-visual film for Mankind Pharma (2024).",
    fmt: ["Corporate Film"],
  },
  133: { // a skills list, not a project
    title: "Generative AI Toolstack (2024-2026)",
    role: "", roles: [], client: "", org: "Used across Rabble Labs, Buddy Tales and my own work", activityType: "Skills",
    description: "Tools I use in production: ChatGPT (GPT, Image, Projects, Codex), Claude (LLM, Claude Code, Projects, Design), Freepik / Magnific (image, video, template and audio generation), ElevenLabs (TTS, voice cloning), Suno AI (music + SFX), Higgsfield (video, cinema, image, UGC), ComfyUI (self-hosted pipelines), OpenCode (self-hosted code generation), and LM Studio (self-hosted LLMs).",
    fmt: ["Generative AI"], themes: ["Computational Culture"],
  },
  90: { // NL flags Kind Gestures / KindHealth "Needs evidence"; deck p2: AI-driven pre-diagnosis. #91 and #95 folded in.
    role: "Co-founder", roles: [F.FOU], client: "", org: "KindHealth",
    description: "Co-founded KindHealth, a health-tech venture for AI-assisted pre-diagnosis, in April 2024: brand, pitch deck and financial model. Worked on it from Riga, Latvia in June 2024. The venture has stalled.",
    fmt: ["Startup", "Health Tech"], themes: ["Computational Culture"],
  },
  92: {
    role: "Designer", roles: [F.DES], client: "Its a Baby! Studios",
    description: "Complete visual identity for Its a Baby! Studios, Vadodara: brand book, six brochures, stationery, apparel and large-format hoardings across print and digital (2024).",
    fmt: ["Brand Identity", "Print"],
  },
  97: { // GM Jul 25 2024
    role: "Co-founder", roles: [F.FOU], client: "", org: "Pixelate",
    description: "Pixelate wound down on 25 July 2024, seven years after it was founded.",
    fmt: ["Web3", "Startup"], themes: ["Computational Culture"],
  },
  98: { // WB-roles + NL: volunteer since Aug 2024, ongoing
    title: "Energy-Policy Analyst (Volunteer): Auroville Consulting (since 2024)",
    role: "Energy-policy analyst (volunteer)", roles: [F.RES], client: "", org: "Auroville Consulting", status: "Ongoing",
    description: "Volunteer energy-policy analyst with Auroville Consulting since August 2024.",
    fmt: ["Research", "Volunteering"],
  },
  100: { // CV Visual Design Consultant (Contract) Sep 2024 - May 2026; WB-roles 17 Sep 2024 - May 2026
    title: "Visual Design Consultant: Rabble Labs & BuidlersTribe (2024-2026)",
    role: "Visual Design Consultant", roles: [F.DES], client: "Rabble Labs / BuidlersTribe",
    description: "Visual design consultant from September 2024 to May 2026 across brand, product, AI workflows and communications. Built the Rabble Labs and Scribble identities, a shadcn-mapped Figma variable library, 100+ layout systems and 20+ AV pieces.",
    fmt: ["Brand Identity", "Design System", "Generative AI"],
  },
  141: { // YT "Kalarigram, Auroville Mahashivratri Celebration 2025"
    title: "Kalarigram Mahashivratri: Travel Film, Auroville (2025)",
    role: "Director, Cinematographer & Editor", roles: [F.DIR, F.CIN, F.EDI], client: "", org: "Self-initiated",
    description: "Self-initiated film of the Mahashivratri celebration at Kalarigram, Auroville, shot and edited solo (February 2025).",
    fmt: ["Travel Film"],
  },
  103: { // WB-roles "Conscious Cafe Designer (recurring)" since 2025-03
    role: "Designer", roles: [F.DES], client: "Conscious Cafe", org: "Conscious Cafe", date: "2025-03",
    description: "Menu design for Conscious Cafe in Pondicherry since March 2025: typographic hierarchy across a broad menu of kombuchas, specialty coffees and floral teas.",
    fmt: ["Menu Design", "Print"],
  },
  127: {
    title: "Vet Veda: Pet Supplement Brand & Packaging (2025)",
    role: "Designer", roles: [F.DES], client: "Petved Nutritions Pvt Ltd", org: "Petved Nutritions Pvt Ltd",
    description: "Brand identity and capsule packaging for Vet Veda, a pet-supplement brand by Petved Nutritions (2025).",
    fmt: ["Brand Identity", "Packaging"],
  },
  106: { // WB-roles "Green Silk Road (Communication Manager)", Volunteer/Tech, Aug 2024, Supabase; NL persona research + outline
    title: "Green Silk Road: Communication Manager and Map Portal Build (Volunteer, since 2024)",
    role: "Communication manager (volunteer)", roles: [F.LEA], client: "", org: "Green Silk Road (Gijs Spoor)", date: "2024-08",
    description: "Volunteer communication manager for Green Silk Road, a bio-eco-tourism initiative led by Gijs Spoor, since August 2024: user-persona research, the project outline, and the Supabase backend for its map portal.",
    fmt: ["Volunteering", "Supabase"], themes: ["Computational Culture"],
  },
  142: { // NL Verified; WB-roles Shivanata co-founded Feb 2025 with Savan Barot + Utkarsh Rajora
    role: "Producer & Director", roles: [F.DIR, F.PRO], client: "", org: "Shivanata Production LLP",
    description: "Producer and director of Episode 1, 'Vastraharan', of a Mahabharata web series for Shivanata Production LLP, which I co-founded with Savan Barot and Utkarsh Rajora in February 2025. In production since March 2026.",
    fmt: ["Web Series"],
  },
};

// ── helpers ────────────────────────────────────────────────────────────
const slugify = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function isoWeekKey(y, m, d) {
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function applyDate(e, date) {
  const s = String(date).replace(/^~/, "");
  const [y, m, d] = s.split("-").map(Number);
  e.date = s;
  e.year = y;
  if (m) e.month = m; else delete e.month;
  if (d) e.day = d; else delete e.day;
}

// Every kept entry ends up with an explicit, tilde-free date string.
function normalizeDate(e) {
  if (e.date && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(e.date)) return;
  const raw = String(e.date || "").replace(/^~/, "");
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(raw)) return applyDate(e, raw);
  const y = e.year, m = e.month;
  applyDate(e, m && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, "0")}` : String(y));
}

const PRIVATE_FIELDS = ["evidenceSource", "evidenceDetail", "notes", "identityTag", "earningsAmount", "currency", "clientGroup", "clientOutcome"];

// ── ledger ─────────────────────────────────────────────────────────────
const removed = [];
const privateFields = {};
const byId = new Map(ledger.entries.map((e) => [e.id, structuredClone(e)]));

for (const [id, why] of Object.entries(REMOVE)) {
  const e = byId.get(Number(id));
  if (e) { removed.push({ reason: why, entry: e }); byId.delete(Number(id)); }
}
for (const [id, { into, why }] of Object.entries(MERGE)) {
  const e = byId.get(Number(id));
  const target = byId.get(into);
  if (!e || !target) continue;
  // Keep the merged entry's unique evidence on the surviving entry.
  const have = new Set(target.evidence.map((v) => v.src));
  for (const v of e.evidence || []) if (!have.has(v.src)) target.evidence.push(v);
  removed.push({ reason: `merged into #${into}: ${why}`, entry: e });
  byId.delete(Number(id));
}

for (const e of byId.values()) {
  const p = E[e.id];
  if (!p) throw new Error(`No correction row for entry #${e.id}. Every public entry must be reviewed.`);
  const oldSlug = slugify(e.title);

  // Private fields leave the public file.
  const priv = {};
  for (const k of PRIVATE_FIELDS) {
    if (k in e && !(p.keepEarnings && (k === "earningsAmount" || k === "currency"))) {
      if (e[k] !== "" && e[k] != null && !(k === "earningsAmount" && !e[k])) priv[k] = e[k];
      delete e[k];
    }
  }
  if (Object.keys(priv).length) privateFields[e.id] = priv;

  if (p.title) e.title = p.title;
  if ("role" in p) e.role = p.role;
  e.roles = p.roles;
  e.clientCanonical = p.client;
  if (p.client) delete e.excludeFromClients; else e.excludeFromClients = true;
  if ("org" in p) e.org = p.org;
  else if (p.client) e.org = e.org && e.org.trim() ? e.org.trim() : p.client;
  if ("location" in p) e.location = p.location;
  if (p.activityType) e.activityType = p.activityType;
  if (p.status) e.status = p.status;
  if (p.description) e.description = p.description;
  if (p.date) applyDate(e, p.date);
  normalizeDate(e);
  // The old data used the 1st as filler for "some day that month" (and 1 Jan
  // for "that year"). Shown as "1 Jan 2014" that is false precision.
  if (/-01-01$/.test(e.date)) applyDate(e, e.date.slice(0, 4));
  else if (/-\d{2}-01$/.test(e.date)) applyDate(e, e.date.slice(0, 7));
  e.weekKey = isoWeekKey(e.year, e.month, e.day);

  const themes = new Set(p.roles.map((r) => THEME_OF[r]).filter(Boolean));
  for (const t of p.themes || []) themes.add(t);
  e.roleGroups = [...themes];

  const tags = [...new Set([...p.roles, ...(p.fmt || [])])];
  e.tags = tags;
  e.roleTags = tags;

  // Evidence: drop duplicates, fix mistyped links, drop items that belong elsewhere.
  let ev = e.evidence || [];
  if (p.dropEvidence === "all") ev = [];
  else if (Array.isArray(p.dropEvidence)) ev = ev.filter((v) => !p.dropEvidence.some((s) => String(v.src).includes(s)));
  const seen = new Set();
  ev = ev.filter((v) => { const k = String(v.src || "").replace(/\.(png|webp)$/i, ""); if (seen.has(k)) return false; seen.add(k); return true; });
  for (const v of ev) {
    for (const [host, type] of Object.entries(p.evidenceType || {})) if (String(v.src).includes(host)) v.type = type;
  }
  e.evidence = ev;

  if (e.title !== ledger.entries.find((x) => x.id === e.id).title) {
    e.slugAliases = [...new Set([...(e.slugAliases || []), oldSlug])];
  }
}

const kept = [...byId.values()].sort((a, b) => (a.year - b.year) || ((a.month || 0) - (b.month || 0)) || ((a.day || 0) - (b.day || 0)) || (a.id - b.id));

// Tag counts for the tag filter.
const tagCounts = new Map();
for (const e of kept) for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);

const years = kept.map((e) => e.year);
const publicLedger = {
  entries: kept,
  tags: [...tagCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  yearStart: Math.min(...years),
  yearEnd: Math.max(...years),
  schemaVersion: ledger.schemaVersion,
  savedAt: new Date().toISOString(),
  truthAudit: "2026-10-19",
};

const privateLedger = {
  note: "Private research data. Never deployed (see .vercelignore). Moved out of data/ledger.json on 19 Oct 2026.",
  removedEntries: removed,
  privateFields,
  sheets: { roles: ledger.roles, films: ledger.films, people: ledger.people, firsts: ledger.firsts },
  sourceWorkbook: ledger.sourceWorkbook,
  generatedAt: ledger.generatedAt,
};

// ── case studies (rebuilt from CV / NL / WB / YT; no unsourced lines) ──
const cs = structuredClone(caseData);
const study = (id) => cs.caseStudies.find((c) => c.id === id);
const counts = {
  entries: kept.length,
  clients: new Set(kept.map((e) => e.clientCanonical).filter(Boolean)).size,
  families: new Set(kept.flatMap((e) => e.roles)).size,
  span: `${publicLedger.yearStart}-${publicLedger.yearEnd}`,
  years: publicLedger.yearEnd - publicLedger.yearStart,
};
const hausClientIds = [77, 78, 79, 81, 82, 83, 85, 92, 103, 127, 138];

Object.assign(study("haus-of-pixels"), { // NL "Haus of Pixels" row (Verified) + MCA CIN
  role: "Founder & Director",
  roleFull: "Founder & Director",
  years: "2022 - Now",
  tagline: "Brand identity, packaging, print",
  summary: `Haus of Pixels OPC Pvt Ltd (CIN U72900GJ2022OPC131119) is the company I incorporated in April 2022 for my independent practice. This archive holds ${hausClientIds.length} client projects delivered through it, among them Silver Dragon, House of Glam, It's a Baby! Studios, MK Engineering, My Village Tea and Yogesh Khaman.`,
  stats: [
    { val: "2022", label: "Incorporated" },
    { val: String(hausClientIds.length), label: "Client projects in this archive" },
    { val: "OPC", label: "One Person Company, Anand" },
  ],
  pipeline: {
    description: "Small business owners rarely see why brand identity matters beyond a one-off logo. The studio delivers the full system and explains why it lasts:",
    steps: [
      { title: "Identity", desc: "Logos, colour palettes and logo guidelines: Silver Dragon, House of Glam, MK Engineering, WOW." },
      { title: "Packaging", desc: "Packs and labels: My Village Tea, Vet Veda, cross.pet." },
      { title: "Print rollout", desc: "Brand book, six brochures, stationery, apparel and hoardings for It's a Baby! Studios." },
      { title: "Photo and screen", desc: "Product photography edited into LED-screen content for Yogesh Khaman." },
    ],
  },
  milestones: [
    { date: "2022-04-01", ledgerEntryId: 76, title: "Incorporated Haus of Pixels OPC Pvt Ltd", desc: "Registered under CIN U72900GJ2022OPC131119 in Anand, with me as sole owner and director." },
    { date: "2024-05", ledgerEntryId: 92, title: "It's a Baby! Studios identity", desc: "Brand book, six brochures, stationery, apparel and large-format hoardings." },
    { date: "2025-08-01", ledgerEntryId: 127, title: "Vet Veda packaging", desc: "Brand identity and capsule packaging for Petved Nutritions' pet-supplement brand." },
  ],
  outcomes: {
    metrics: ["OPC Pvt Ltd since Apr 2022", `${hausClientIds.length} client projects archived`, "Identity, packaging, print"],
    retrospective: "The studio's job is to give small businesses an identity system they can keep using, not a one-off logo, and to explain why that matters for the long term.",
    status: "Active since April 2022.",
  },
  capabilities: [
    { title: "Brand identity", desc: "Logos, palettes, guidelines" },
    { title: "Packaging", desc: "Labels, boxes, capsule packs" },
    { title: "Print", desc: "Brand books, brochures, stationery, hoardings" },
    { title: "Photography", desc: "Product and food photography" },
  ],
});
const hausCaptions = {
  "IMG_1270": "Haus of Pixels services sheet: graphic design, photography, branding, audio-visual",
  "IMG_1357": "The studio space in Anand during setup",
  "IMG_1684": "Studio wall: posters and collage",
  "IMG_1763": "Studio wall of maps above the workstation",
  "IMG_1765": "Studio workstation",
  "IMG_1767": "Studio wall mural",
  "IMG_2554": "Studio stairwell camera wall",
  "IMG_9034": "Haus of Pixels poster series: 'Brand identity crisis'",
  "IMG_9035": "Haus of Pixels poster series: photography",
  "IMG_9037": "Haus of Pixels poster series: portraits",
  "IMG_9038": "Haus of Pixels poster series: services",
  "IMG_9040": "Haus of Pixels poster series: 'Your pixel life sorted'",
  "IMG_9041": "Haus of Pixels poster series: 'Pixel identity'",
  "IMG_9043": "Haus of Pixels poster series: 'Pixel life sorted'",
  "IMG_1359": "Studio walkthrough (video)",
  "IMG_1686": "Studio footage (video)",
};
for (const v of study("haus-of-pixels").evidence) {
  const k = Object.keys(hausCaptions).find((n) => String(v.src).includes(`/${n}.`));
  if (k) v.caption = hausCaptions[k];
  if (/SD_Identity_25\.pdf/.test(v.src)) v.caption = "Silver Dragon: logo guidelines (PDF)";
  if (/Its_a_baby_studio_Brand_Guideline_book/.test(v.src)) { v.type = "pdf"; v.caption = "It's a Baby! Studios: brand guidelines book (PDF)"; }
}

Object.assign(study("rabble-labs"), { // CV + NL "Rabble Labs" row
  years: "2024 - 2026",
  tagline: "Brand, product design, AI production",
  stats: [
    { val: "3", label: "Products" },
    { val: "4", label: "Departments" },
    { val: "100+", label: "Layout systems" },
    { val: "20+", label: "AV pieces" },
    { val: "20", label: "Months" },
  ],
  pipeline: {
    description: "The company's product brands lacked a shared visual language. I unified it across brand, product, AI workflows and communications:",
    steps: [
      { title: "Identity", desc: "Brand identities for Rabble Labs and Scribble, including the signature tongue illustration made in Midjourney in my first weeks." },
      { title: "Design system", desc: "A shadcn-mapped Figma variable library and component system; engineers shipped multiple product surfaces from it in six months." },
      { title: "Content", desc: "100+ layout systems and 20+ AV pieces: podcasts, UGC, explainer films and generative-AI production. Non-designers ran the templates unaided." },
    ],
  },
  milestones: [
    { date: "2024-09-17", ledgerEntryId: 100, title: "Joined Rabble Labs and BuidlersTribe", desc: "Hired as visual design consultant across brand and product." },
    { date: "2026-05", ledgerEntryId: 100, title: "Contract ended", desc: "The engagement closed in May 2026 after a team restructure." },
  ],
  outcomes: {
    metrics: ["2 brand identities (Rabble Labs, Scribble)", "Figma variable library", "Pitch decks and proposals"],
    retrospective: "Unified the visual language across two brands and three verticals, and built reusable systems: logos, AI-generated production, pitch decks, documents and social templates.",
    status: "Contract ended in May 2026.",
  },
  summary: "Led visual design for three products across four cross-functional departments (brand, product, AI workflows, communications) over 20 months, from a shadcn-mapped Figma variable library to AV and generative-AI production.",
  capabilities: [
    { title: "Brand identity", desc: "Visual language for three products" },
    { title: "AV production", desc: "Podcasts, UGC, explainers, generative-AI pieces" },
    { title: "Design systems", desc: "Figma variables, components, layout systems" },
    { title: "Product design", desc: "UI for product surfaces, pitch decks, proposals" },
  ],
});
delete study("rabble-labs").pullQuote;

Object.assign(study("pixelate"), { // LI + NL "Pixelate Protocol" row (Verified) + WB-firsts
  role: "Co-founder",
  roleFull: "Co-founder",
  years: "2017 - 2024",
  tagline: "Co-founder, Web3, funded",
  stats: [
    { val: "7", label: "Years" },
    { val: "$15K", label: "NEAR Fast Grant" },
    { val: "12,000+", label: "Images in the Web2 MVP" },
    { val: "Winner", label: "Startup Weekend Bangalore 2017" },
  ],
  pipeline: {
    description: "There was no open market where camera-generated images could be owned and traded. Pixelate designed one:",
    steps: [
      { title: "Rating economy", desc: "Camera metadata (EXIF) as the basis for rating and valuing photographs." },
      { title: "Market design", desc: "A blockchain-native marketplace with an automated market maker for image ownership and discovery." },
      { title: "Whitepaper", desc: "The technical and economic design, drafted in 2018." },
      { title: "Web2 MVP", desc: "Shipped at app.pixelate.photos, with 12,000+ images." },
    ],
  },
  milestones: [
    { date: "2017-03-01", ledgerEntryId: 53, title: "Co-founded Pixelate", desc: "With Ronak P Amin and Pranav Burnwal." },
    { date: "2017-10-01", ledgerEntryId: 54, title: "Won Startup Weekend Bangalore", desc: "The 54-hour blockchain startup challenge." },
    { date: "2018-04-01", ledgerEntryId: 57, title: "Drafted the whitepaper", desc: "Technical and economic design for owning and trading camera-sensor photographs." },
    { date: "2021-08-14", ledgerEntryId: 71, title: "NEAR accelerator cohort", desc: "Selected for the NEAR Protocol accelerator, August to October 2021." },
    { date: "2021-10-14", ledgerEntryId: 74, title: "$15,000 NEAR Fast Grant", desc: "Received eleven years to the day after I joined AIESEC." },
    { date: "2024-07-25", ledgerEntryId: 97, title: "Pixelate wound down", desc: "Seven years after it was founded." },
  ],
  outcomes: {
    metrics: ["$15,000 NEAR Fast Grant", "Startup Weekend win", "Whitepaper", "Web2 MVP, 12,000+ images"],
    retrospective: "Conceived a new economic model for photographs from zero, shipped a working platform, and won competitive funding for it.",
    status: "Wound down in July 2024.",
  },
  summary: "Pixelate asked whether camera-sensor photographs could trade as a market. Co-founded in 2017 with Ronak P Amin and Pranav Burnwal, it won Startup Weekend Bangalore, produced a whitepaper and an AMM design, shipped a Web2 MVP with 12,000+ images, and joined the NEAR accelerator with a $15K Fast Grant in 2021.",
  capabilities: [
    { title: "Business development", desc: "Pitching, funding, outreach" },
    { title: "Leadership", desc: "Co-founder of a three-person founding team" },
    { title: "Product design", desc: "UX, product and AMM design" },
  ],
});

Object.assign(study("buddy-tales"), { // CV + NL "Buddy Tales" row + WB-roles/WB-firsts dates
  years: "2023 - 2025",
  tagline: "Animation, production",
  stats: [
    { val: "50+", label: "Interviews" },
    { val: "4", label: "Hires" },
    { val: "10 min", label: "Pilot" },
    { val: "72", label: "Days from first hire to wrap" },
  ],
  pipeline: {
    description: "There was no superhero-style animated show teaching morals to children on YouTube. Buddy Tales was built to be one, starting with no team and no pipeline:",
    steps: [
      { title: "Team from zero", desc: "50+ interviews; hired a senior animator, a junior animator, a background artist and a script writer." },
      { title: "Story and visual development", desc: "Conceived the IP and its visual development across a multidisciplinary pipeline." },
      { title: "Remote production", desc: "Produced fully remotely, script to screen." },
      { title: "Pilot", desc: "Owned every script-to-screen decision through the 10-minute pilot." },
    ],
  },
  milestones: [
    { date: "2023-12-01", ledgerEntryId: 102, title: "Client contract begins", desc: "Buddy Tales starts as a client contract with Savan Barot." },
    { date: "2025-02", ledgerEntryId: 102, title: "Shivanata Production LLP co-founded", desc: "With Savan Barot and Utkarsh Rajora; Buddy Tales moves into production under it." },
    { date: "2025-10-13", ledgerEntryId: 102, title: "First animators hired", desc: "My first offer letters signed as an employer." },
    { date: "2025-12-24", ledgerEntryId: 102, title: "Pilot wrapped", desc: "The production team was released 72 days after the first hire." },
  ],
  outcomes: {
    metrics: ["10-minute pilot", "Team of 4 hired from 50+ interviews", "Fully remote pipeline", "72 days from first hire to wrap"],
    retrospective: "Built an animation team, its systems and its pipeline from zero, and owned every script-to-screen decision through the pilot.",
    status: "Pilot delivered; the production team was released on 24 December 2025. Shivanata Production LLP remains active and is producing the Mahabharata web series.",
  },
  summary: "Buddy Tales began as a client contract in December 2023 and became my largest production responsibility: building an animation studio's team, systems and pipeline from zero. I ran 50+ interviews, hired and led a four-person remote team, and owned every script-to-screen decision through the 10-minute pilot.",
  capabilities: [
    { title: "Production leadership", desc: "Script, direction, animation and team decisions" },
    { title: "Team building", desc: "50+ interviews; hired and led a four-person remote team" },
    { title: "Pipeline", desc: "A remote script-to-screen pipeline" },
  ],
});

Object.assign(study("anirudh-website"), {
  stats: [
    { val: String(counts.entries), label: "Entries" },
    { val: String(counts.clients), label: "Clients" },
    { val: counts.span, label: "Years archived" },
    { val: "Vanilla", label: "JS, no framework" },
    { val: "Solo", label: "Design and build" },
  ],
  summary: `An interactive archive of my work from ${publicLedger.yearStart} to ${publicLedger.yearEnd}: a WebGL city of ${counts.entries} entries, built solo with vanilla ES modules, Three.js and IBM Carbon design tokens.`,
  milestones: study("anirudh-website").milestones.map(({ ledgerEntryId, ...m }) => m)
    .filter((m) => !/Story Mode/.test(m.title)),
});
const web = study("anirudh-website");
web.outcomes.metrics = web.outcomes.metrics.map((m) => m.replace(/16-Year Ledger Normalization/, "Ledger normalization"));
web.pipeline.steps = web.pipeline.steps.map((s) => ({ ...s, desc: s.desc.replace(/the 16-year ledger/, "the career ledger") }));
web.capabilities = web.capabilities.map((c) => ({ ...c, desc: c.desc.replace(/16-year career timeline ledger/, "Career timeline ledger") }));

// ── gallery ────────────────────────────────────────────────────────────
const cleanLoc = (s) => String(s || "").replace(/^Europe\\/, "").trim();
const gal = gallery
  .filter((g) => g.collection !== "Family")            // personal photos leave the site
  .map((g) => {
    const out = { ...g };
    out.collection = cleanLoc(g.collection);
    out.location = g.location === "Geotagged Location" ? out.collection
      : g.location === "Still life" ? ""
      : cleanLoc(g.location);
    // The generated one-line "story" repeated the title and the camera line.
    out.story = "";
    return out;
  });

// ── write ──────────────────────────────────────────────────────────────
// Blob is blocked: point images at the self-hosted copies (proof-hosting.mjs).
rewriteAll(publicLedger, cs);

const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
writeFileSync(P("data/ledger.json"), crlf(JSON.stringify(publicLedger, null, 2)));
writeFileSync(resolve(PRIVATE, "ledger-private.json"), JSON.stringify(privateLedger, null, 2) + "\n");
writeFileSync(P("data/case-studies.json"), crlf(JSON.stringify(cs, null, 2)) + "\r\n");
writeFileSync(P("data/gallery.json"), crlf(JSON.stringify(gal, null, 2)));
writeFileSync(P("data/ledger-data-static.js"), `window.LEDGER_DATA = ${JSON.stringify(publicLedger)};\n`);

console.log(`entries ${ledger.entries.length} -> ${kept.length} (removed ${removed.length})`);
console.log(`role families ${counts.families}, clients ${counts.clients}, span ${counts.span}`);
console.log(`gallery ${gallery.length} -> ${gal.length}`);
