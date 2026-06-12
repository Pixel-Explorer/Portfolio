// One-shot recovery: re-applies ALL gallery.json edits from the session that
// were lost when the working copy reverted to the committed original.
// Sources: every caption/location script run earlier in the conversation.
import { readFileSync, writeFileSync } from "node:fs";
const FILE = "data/gallery.json";
const d = JSON.parse(readFileSync(FILE, "utf8"));

const DHK = "Dharamkot, Himachal Pradesh, India";
const BIR = "Bir Billing, Himachal Pradesh, India";
const HP  = "Himachal Pradesh, India";

// 1) Locations by capture-date cluster (base; CAP overrides specifics below).
const locFor = (dt) => {
  if (dt.startsWith("2024-07")) return "Istanbul, Türkiye";
  if (dt.startsWith("2023-12")) return "Kuala Lumpur, Malaysia";
  if (dt.startsWith("2024-01")) return "Singapore";
  if (dt.startsWith("2022-"))   return HP;
  if (dt.startsWith("2016-"))   return HP;
  if (dt.startsWith("2024-08")) return "Pondicherry, India";
  if (dt.startsWith("2024-12")) return "Pondicherry, India";
  if (dt.startsWith("2025-"))   return "Pondicherry, India";
  if (dt.startsWith("2023-10")) return "Ahmedabad, India";
  if (dt.startsWith("2021-"))   return "Anand, Gujarat, India";
  return null;
};

// 2) Captions: id -> { t:title, g?:genre, s:story, l?:location-override }
const CAP = {
  // Group 2 (dog/friends rotation) + Diana
  "img-0007": { t: "Reach for It", g: "Candid", s: "A figure thrown against the sunset, arms up." },
  "img-0529": { t: "Two, at Dusk", g: "Candid", s: "Friends in silhouette against a burning sky." },
  "img-0261": { t: "Diana", g: "Pet", s: "My dog Diana, at home in Anand. She outlasted most of my jobs and half the cities I lived in.", l: "Anand, Gujarat, India" },

  // Istanbul (genre kept from original)
  "dscf2897": { t: "Before the Rush", s: "Early morning in Istanbul's new terminal. I caught the departures hall nearly empty — one traveller against the glass, the sun just coming up behind." },
  "dscf2906": { t: "Under the Big Roof", s: "I stood under the terminal's rippling roofline and watched the morning crowd move through. The whole ceiling reads like one long wave." },
  "dscf2915": { t: "Mid-Stride", s: "Commuters cutting across the polished floor. I held the frame still and let them walk through it." },
  "dscf2917": { t: "Toward the Gates", s: "Slow shutter through the concourse — everyone smearing toward their gates while the building stayed put." },
  "dscf2918": { t: "Concourse", s: "A terminal in motion. The rush turns into a kind of choreography if you watch it long enough." },
  "dscf2947": { t: "Hard Lines", s: "Escalators and structure folding into each other. I framed it for the geometry, nothing else." },
  "dscf2965": { t: "Ornate Front", s: "An ornate frontage out in the city, catching flat midday light. Istanbul throws this kind of detail at you constantly." },
  "dscf2968": { t: "Rooflines", s: "Built form stripped back to silhouette and edge. I shot upward until the structure read as pure shape." },
  "dscf3073": { t: "Deep Red", s: "A wash of deep red in a dark interior corner. I waited for a single figure to step into it." },
  "dscf3113": { t: "Street Level", s: "Worn colour and texture down at street level. The good stuff in Istanbul is usually at eye height, off the main drag." },

  // Ahmedabad
  "-dsf1502": { t: "The Stare", g: "Portrait", s: "A kid in the family, in Ahmedabad. He locked onto the lens and held it.", l: "Ahmedabad, India" },
  "-dsf1719": { t: "Clock Tower", g: "Architecture", s: "An old clock tower over the street in Ahmedabad. I shot it straight-on from across the traffic.", l: "Ahmedabad, India" },
  "-dsf1747": { t: "Riverfront, Dusk", g: "Cityscape", s: "The Sabarmati riverfront going blue at dusk, the new bridge curving out over the water.", l: "Ahmedabad, India" },
  "-dsf1894": { t: "Family, Outside", g: "Candid", s: "A family afternoon in Ahmedabad. The kid was busier with his drink than with me.", l: "Ahmedabad, India" },

  // Pondicherry Dec-2024 (no kids)
  "dscf4426": { t: "The Walk Up", g: "Travel", s: "Trailing the group up a path that threads through the green, just outside Pondicherry." },
  "dscf4433": { t: "Ahead of Me", g: "Street", s: "She walked ahead down the lane; I hung back and let the trees frame her." },

  // Chennai nephews
  "dscf4511": { t: "Reaching", g: "Portrait", s: "My nephew, going straight for the lens — all grin and arm. At their place in Chennai.", l: "Chennai, India" },
  "dscf4513": { t: "Small Face", g: "Portrait", s: "Same kid, palm out, taking up the whole frame.", l: "Chennai, India" },
  "dscf4515": { t: "Mischief", g: "Portrait", s: "The smaller one, mid-dash, reaching up just as I clicked. Chennai.", l: "Chennai, India" },

  // 2025 set table (Pondicherry)
  "dscf7965": { t: "Set Table", g: "Still Life", s: "A table laid out under the trees in Pondicherry — printed cloth, glassware, one flower, waiting for everyone to sit." },

  // 2024-08 Pondicherry
  "dscf3256": { t: "Roadside", g: "Street", s: "A low building holding the edge of the street, palms behind it. Pondicherry, flat afternoon." },
  "dscf3274": { t: "White Town", g: "Street", s: "A clean, empty stretch in Pondicherry's White Town under an even sky. I waited for it to clear." },
  "dscf3331": { t: "Shopfront", g: "Street", s: "The ordinary geometry of a Pondicherry street — colour, shutters, palms." },
  "dscf3354": { t: "Colonial Lines", g: "Architecture", s: "An old colonial facade in Pondicherry, carrying its history in the plasterwork." },
  "dscf3369": { t: "Cafe Lane", g: "Street", s: "A narrow lane of pastel walls and cafe tables — the kind of corner Pondicherry hides everywhere." },
  "dscf3426": { t: "Open Ground", g: "Landscape", s: "An open clearing running toward a low structure in the distance. Overcast and still, on the Pondicherry edge." },
  "dscf3485": { t: "Colonnade", g: "Architecture", s: "White arches running back into shadow, greenery spilling in. A colonnade in Pondicherry." },

  // GoPro Himachal (Bir / Dharamkot)
  "gopr4352": { t: "Window, Green Wall", g: "Interiors", s: "A green wall, one window, the hills sitting inside it. A room I stayed in.", l: DHK },
  "gopr4354": { t: "Mist on the Slopes", g: "Landscape", s: "Cloud dragging low across the forested slopes above Dharamkot.", l: DHK },
  "gopr4377": { t: "Valley Road", g: "Landscape", s: "The valley dropping away, a road threading the forested slopes. Dharamkot.", l: DHK },
  "gopr4382": { t: "Open-Side Room", g: "Interiors", s: "A bamboo-roofed room opening straight onto the green. This was Bir.", l: BIR },
  "gopr4391": { t: "The Cafe", g: "Interiors", s: "Warm light, a few people, an afternoon killed in a Bir cafe.", l: BIR },
  "gopr4392": { t: "Yellow Room", g: "Interiors", s: "A yellow-walled cafe with the green pushing in at the windows. Bir.", l: BIR },
  "gopr4432": { t: "Open Green", g: "Landscape", s: "Wide cultivated land under a heavy sky — and a dog who owned the field. Bir.", l: BIR },
  "gopr4437": { t: "Stepped Fields", g: "Landscape", s: "Stepped green fields folding down the slope toward the flats. Bir.", l: BIR },
  "gopr4449": { t: "Valley Floor", g: "Landscape", s: "From a covered terrace, the flat green basin of Bir spread out between the ridges.", l: BIR },
  "gopr4450": { t: "Grass & Cloud", g: "Landscape", s: "Grass running out to meet a wide bank of cloud. Bir, off a terrace.", l: BIR },
  "gopr4451": { t: "The Track", g: "Travel", s: "A track cutting straight through the green. Bir.", l: BIR },
  "gopr4459": { t: "Small in the Field", g: "Street", s: "People gone small against the open field, the sun flaring out. Bir.", l: BIR },
  "gopr4464": { t: "Wood Table", g: "Interiors", s: "A plain table by the window, hills in the glass — the room I worked from in Bir.", l: BIR },
  "gopr4479": { t: "Pine Road", g: "Travel", s: "A track slipping into the treeline, someone riding out ahead. Bir.", l: BIR },
  "gopr4492": { t: "Cloud Bank", g: "Landscape", s: "A restless sky stacking over the green, one car on the road. Bir.", l: BIR },
  "gopr4495": { t: "Last Gold", g: "Golden Hour", s: "Sunset going molten over the ridge, watched from the terrace. Bir.", l: BIR },
  "gopr4500": { t: "Valley & Peaks", g: "Landscape", s: "The green valley opening out to the far peaks. Bir.", l: BIR },

  // Kuala Lumpur
  "-dsf4175": { t: "Quiet, Grey", g: "Architecture", s: "A pink-domed mosque under a flat grey sky, the plaza emptied out. Kuala Lumpur gone quiet." },
  "-dsf4286": { t: "Skyline, Hazed", g: "Cityscape", s: "Towers stacked into the haze across the plaza. Kuala Lumpur." },
  "-dsf4325": { t: "City Flow", g: "Street", s: "Traffic threading the avenue, towers boxing it in. KL." },
  "-dsf4398": { t: "Among Towers", g: "Cityscape", s: "Caught someone small under the overpass, the towers going gold behind. KL." },
  "-dsf4400": { t: "Glass & Steel", g: "Architecture", s: "Skyscrapers cutting straight into the dusk. KL." },
  "-dsf4439": { t: "Twin Towers", g: "Architecture", s: "The Petronas towers at night — two spires burning against the dark. KL." },
  "-dsf4589": { t: "Up the Towers", g: "Architecture", s: "Steel rising clean out of the frame. KL." },
  "-dsf4754": { t: "Green Mist", g: "Landscape", s: "Foliage dissolving into fog on a wet KL morning." },
  "-dsf4833": { t: "Under the Vines", g: "Nature", s: "Green climbing overhead, people moving through the damp. KL." },
  "-dsf5670": { t: "City Street", g: "Street", s: "The pulse of the avenue under a heavy sky. KL." },
  "-dsf5740": { t: "Storefront", g: "Street", s: "Colour and signage stacked up at street level, dusk coming on. KL." },
  "-dsf5746": { t: "Sidewalk", g: "Street", s: "The everyday flow of the street — shutters, bikes, people. KL." },
  "-dsf5748": { t: "Bright Room", g: "Interiors", s: "Figures crossing a bright, bare space. KL." },
  "-dsf5770": { t: "Blur", g: "Motion", s: "The city smeared into pure light — handheld, slow shutter. KL." },
  "-dsf5771": { t: "Panned", g: "Motion", s: "Held one car sharp against the rush. KL." },
  "-dsf5772": { t: "Speed", g: "Motion", s: "Motion stretched right across the frame. KL." },

  // Himachal Canon 2022-06
  "img-4791": { t: "Diana, Up High", g: "Pet", s: "My dog Diana in her hoodie, the mountains stacked up behind her.", l: DHK },
  "img-4810": { t: "Roadside Dog", g: "Pet", s: "Diana parked next to the bike on a mountain path, waiting me out.", l: DHK },
  "img-4814": { t: "The Town Below", g: "Mountain", s: "The town sitting under the Dhauladhar peaks, cloud rolling off the range.", l: DHK },
  "img-4857": { t: "Homestay View", g: "Landscape", s: "A homestay opening onto the snow line. This was home for a while.", l: DHK },
  "img-4859": { t: "Terraced Slope", g: "Landscape", s: "Cultivated steps cut into the green hillside — the old way of farming a slope.", l: HP },
  "img-4864": { t: "Far Snow", g: "Mountain", s: "The snow line holding the horizon, a long way off.", l: DHK },
  "img-4915": { t: "Forest Breath", g: "Landscape", s: "Mist moving through the trees, the forest exhaling.", l: DHK },
  "img-6422": { t: "At Work", g: "Documentary", s: "Hands busy in a working space — I kept out of the way and watched.", l: DHK },
  "img-6425": { t: "The Workshop", g: "Interiors", s: "Tools and clutter in warm interior light.", l: DHK },
  "img-6484": { t: "In the Open", g: "Wildlife", s: "A wary animal holding still out in the open field.", l: HP },
  "img-6503": { t: "Jacketed", g: "Pet", s: "Diana bundled into a jacket against the hill cold.", l: DHK },
  "img-6570": { t: "Fence Sitter", g: "Pet", s: "Diana parked by the fence, keeping an eye on the slope.", l: DHK },
  "img-6573": { t: "Red Bloom", g: "Macro", s: "A single red rose against the dark.", l: HP },
  "img-6623": { t: "Yellow Face", g: "Macro", s: "A sunflower turned right into the light.", l: HP },
  "img-6651": { t: "The Bend", g: "Travel", s: "A lone car taking the foggy mountain road.", l: DHK },
  "img-6693": { t: "Pine Stand", g: "Landscape", s: "Tall trunks rising straight off the forest floor.", l: DHK },
  "img-6699": { t: "Among the Pines", g: "Street", s: "People gone small beneath the deodar canopy.", l: DHK },
};

// 3) Singapore: story-only rewrites (titles/genres kept from original).
const SG = {
  "-dsf7009": "From the top deck, the whole green-and-glass city laid out — water and gardens threaded between the towers.",
  "-dsf7014": "Singapore spread out flat from the SkyPark, edge to edge.",
  "-dsf7020": "People crowded the edge of the deck, taking the skyline in. I shot them, not it.",
  "-dsf7024": "A waterfront walk under open sky, the bay wide open in front of me.",
  "-dsf7099": "Visitors leaning into the view; I let the skyline do the work behind them.",
  "-dsf7109": "Figures lined along the rail against the view.",
  "-dsf7164": "The deck's own structure framing the open air.",
  "-dsf7173": "One figure left against the whole city.",
  "-dsf7378": "One of the Supertrees, its steel canopy reaching up into the dark.",
  "-dsf7383": "The Supertree grove — engineered trees standing over Gardens by the Bay.",
  "-dsf7387": "Green and glass sharing one skyline. Singapore earns the garden-city line.",
  "-dsf8116": "An ornate temple roofline set hard against the towers.",
  "-dsf8128": "A temple sitting low beneath the glass skyline — the whole city in one frame.",
  "-dsf8142": "Towers crisp against a clean blue. Midday, downtown.",
  "-dsf8158": "Rows of lanterns glowing inside the temple hall. I kept quiet and shot wide.",
  "-dsf8165": "Ornament packed wall to wall inside the temple.",
  "-dsf8357": "Deep red and gilt sitting in the half-light.",
  "-dsf8361": "Colour stacked along an old shophouse street.",
  "-dsf8364": "Old facade detail, caught in flat light.",
  "-dsf8369": "People gathered along the water as the evening built.",
  "-dsf8373": "Warm light over a quiet table, just off the street.",
  "-dsf8417": "The press of a busy street, everyone moving at once.",
  "-dsf8441": "The street in low light, the signs taking over.",
  "-dsf8450": "A single building standing against the failing light.",
  "-dsf8509": "Old-world frontage holding its own among the towers.",
  "-dsf8651": "A run of painted shophouses, end to end.",
  "-dsf8806": "Carved eaves cutting against the sky.",
  "-dsf8817": "People crossing the open square.",
  "-dsf8842": "The Helix Bridge spiralling in steel over the bay.",
  "-dsf8864": "The Singapore Flyer turning slow over the water.",
  "-dsf8871": "Structure bending clean against the sky.",
  "-dsf8879": "A lattice of beams overhead — I shot straight up.",
  "-dsf8883": "Pure structure against the light.",
  "-dsf8977": "The skyline going dark, the lights coming on.",
  "-dsf8986": "The promenade tracing the edge of the water.",
  "-dsf9008": "Cyclists cutting across the open ground.",
  "-dsf9022": "Towers crowding right up to the frame.",
  "-dsf9028": "Trees softening the hard skyline.",
  "-dsf9078": "A dark form cut sharp against the sky.",
  "-dsf9097": "Skyscrapers leaning in together.",
  "-dsf9107": "Glass climbing straight out of the frame.",
  "-dsf9120": "The hard heart of the CBD.",
  "-dsf9164": "Reflections stacking up the face of a tower.",
  "-dsf9170": "The city's edge cut against the light.",
  "-dsf9180": "Glass breaking the light apart.",
  "-dsf9218": "A flat wall of buildings.",
  "-dsf9242": "Glass and grid, up close.",
  "-dsf9276": "One tower filling the whole frame.",
  "-dsf9281": "A figure gone small under the towers.",
  "-dsf9292": "A monument planted against the towers.",
  "-dsf9324": "Towers crowding the bay.",
  "-dsf9338": "A transit line threading between the towers.",
  "-dsf9349": "A facade catching and holding the light.",
  "-dsf9367": "The dense heart of the city.",
  "-dsf9384": "The skyline rising straight out of the water.",
  "-dsf9438": "Changi's sweeping roof arcing over the concourse.",
  "-dsf9445": "Light flooding the terminal.",
  "-dsf9470": "The clean lines of the terminal.",
  "-dsf9479": "A quiet stretch of the concourse.",
  "-dsf9481": "Polished floor, open space — Changi.",
  "-dsf9483": "A corridor of glass and light.",
  "-dsf9486": "Daylight pouring across the terminal.",
  "-dsf9491": "The Jewel at Changi — a forest under a glass dome.",
  "-dsf9500": "The Rain Vortex coming straight down inside the glass.",
  "-dsf9509": "A whole forest grown indoors.",
  "-dsf9523": "Engineered green stacked under the dome.",
  "-dsf9528": "Steel and leaf overhead.",
  "-dsf9547": "Foliage filling the atrium.",
  "-dsf9553": "Planting stepped up under glass.",
  "-dsf9562": "A wall of indoor foliage.",
  "-dsf9567": "Green, close and layered.",
  "-dsf9568": "Plants crowding right up to the lens.",
  "-dsf9570": "Clean white structure against all that planting.",
  "-dsf9679": "Aircraft waiting out on the apron under a wide sky.",
  "-dsf9687": "The control tower standing over the field.",
  "-dsf9703": "The Skytrain gliding past the green.",
  "-dsf9712": "Water, garden and skyline all in one frame.",
  "-dsf9720": "The city closing in — green and glass together.",
};

let locN = 0, capN = 0, sgN = 0;
for (const e of d) {
  const L = locFor(e.date || "");
  if (L) { e.location = L; locN++; }
  const c = CAP[e.id];
  if (c) { e.title = c.t; e.story = c.s; if (c.g) e.genre = c.g; if (c.l) e.location = c.l; capN++; }
  if (SG[e.id]) { e.story = SG[e.id]; sgN++; }
}
writeFileSync(FILE, JSON.stringify(d, null, 2) + "\n");
console.log("recovered -> locations:", locN, "captions:", capN, "singapore stories:", sgN, "total:", d.length);
const dist = {}; for (const e of d) dist[e.location] = (dist[e.location] || 0) + 1;
console.log(dist);
