# STORY MODE — ASSET PRODUCTION LIST (ship build)

Hand this to an LLM to generate gen-prompts. Do not invent content beyond what's here.

## PIPELINE (per building)
1. **Dimension** — render the building at the specified camera angle (opaque base ok).
2. **Nano Banana** — restyle to house material + add the listed surrounding elements; output START frame and END frame.
3. **Bridge frames** — render 1–2 IN/OUT frames that carry the line from the previous building to this one (field-color crossfade).
4. **Kling 3** — image→video: animate START→END (+ bridges) into the fly-in / hold / fly-out clip.
5. **Audio** — fish.audio (Rick voice), one render per beat (script in Part 3). VO length sets the Kling clip duration.

---

## PART 1 — GLOBAL SPECS

### Material (identical on EVERY building)
Frosted translucent acrylic/glass wrap, porcelain-white edges, soft internal glow, fine edge highlights catching soft directional light. Same on all buildings. **Only variable: ground-reflection intensity** — default low; hero beats (studio, arrival) = high-gloss reflective floor (matches Image 2).

### Field background (full-bleed, one flat color per beat)
| Beat | Field |
|---|---|
| boot / meta | void black → deep ink |
| birth | signal red |
| graduation+photon | acid yellow |
| film | warm amber/cream |
| film_fall | graphite (desaturated) |
| crypto | red + electric neon |
| studio | acid yellow (high gloss floor) |
| animation+europe | acid yellow ↔ cool grey (Europe = grey) |
| pondi | tropical warm gold |
| arrival | full glow / daylit (all hues resolve) |
| gate / handoff | warm, settling |
> Exact hex from CV palette + `tuning.js`. Treatment = FULL-BLEED (not card-on-margin).

### The line
A single drawn line on the ground plane running to the horizon = the timeline. Camera tracks along it, flying in to each building and back out. **Each beat opens 1–2 THREADS** (one per skill/role surfacing that era): a thin thread peels off the main line, wanders, then merges back and **thickens** the main line. Line accumulates thickness era to era; by arrival it's thick/braided into the city. Thread = field's contrast color (white on red, black on yellow). Keep it a LINE — no glow/photon styling.

### Orb = cursor
Igniculus-style light dot + soft halo, IS the cursor. Evidence cards and threads respond to cursor proximity (tilt/brighten/parallax). At handoff the orb drifts off and becomes the archive cursor.

### Evidence cards
Flat cards = REAL portfolio images, fly in/out at hero beats, cursor-responsive. Source from existing assets in the Portfolio folder (the 2023 deck exports). Listed per beat.

### Atmosphere (Higgsfield-direct, no Dimension base)
Clouds, drifting dust/particles, haze — generated separately, composited as parallax layers.

### Audio
fish.audio, Rick voice. One render per beat (Part 3, Indian phonetics applied). Rough durations given to size the Kling clips; the render gives exact.

---

## PART 2 — PER-BEAT ASSETS (12 beats)

**1 · BOOT** — Field: void black
- BUILD: none (orb in black void)
- NANO: faint first segment of the line drawing toward horizon
- START: black, orb dim → END: orb awake, line seeded
- LINE: main line begins, no threads · CARDS: none
- KLING: orb blink + line draws in · VO ~10s

**2 · BIRTH (1991)** — Field: signal red
- BUILD: Hospital, 3/4 low angle, floating
- NANO: small vegetation + few drifting particles at base; low ground reflection; neon "HOSPITAL" lit
- START: hospital small, upper-right, entering → END: hospital docked at first line node, sign lit
- BRIDGE OUT: void→red field, line extends toward grad
- LINE: main line only (origin node); one faint "life" thread opens · CARDS: none
- KLING: slow float-in + settle · VO ~22s

**3 · GRADUATION + PHOTON (2009–13)** — Field: acid yellow
- BUILD: BBA-ITM building, docking angle
- NANO: design tools, a camera + lens glint, scatter of tiny light dots (for the photon monologue), vegetation
- START: BBA docking → END: BBA docked, light dots drifting
- BRIDGE OUT: red→yellow
- LINE: **two threads open — "Design" + "Photography"** — peel off, wander, merge back, thicken line
- CARDS: first paid design (OGX/AIESEC poster), early photographs
- KLING: dock + photon dots drift (longer hold) · VO ~32s (longest mid-beat)

**4 · FILM (2015)** — Field: warm amber/cream
- BUILD: Film-set / "Movies" building (frosted) with set lights, camera rig, clapboard, marquee
- NANO: film lights, crew silhouettes, lit marquee
- START: building swerving BACK into frame from a veered-off branch → END: film building docked, lit like a set
- BRIDGE IN: the **NID thread shoots off the line and dead-ends (broken stub)**; camera/line finds the film branch
- LINE: NID thread = dead-end stub; **"Cinematography/Film" thread** opens + merges
- CARDS: Chhello Divas stills, "539K views" stat card
- KLING: veer-return swerve + dock · VO ~22s

**5 · FILM FALL (2015–17)** — Field: graphite (desaturated)
- BUILD: none new — film building dims/drains
- NANO: drain color, dim set lights, falling/entropy particles
- START: film building lit → END: greyed, drained, line thins
- LINE: main line thins + darkens (the dip) · CARDS: none
- KLING: color drain + dim, slow · VO ~16s

**6 · CRYPTO / PIXELATE (2017–21)** — Field: red + electric neon
- BUILD: Pixelate tower (tallest), rising; frosted + neon glow
- NANO: neon glow, subtle holographic/crypto UI bits, hackathon trophy, certificate, funding-glow; a few tasteful floating tokens
- START: tower rising from line → END: tower full height, glowing, line re-thickens
- BRIDGE IN: graphite→red-neon (light returns)
- LINE: **"Blockchain/Tech" thread** opens strong, merges, line thickens back up (comeback)
- CARDS: hackathon win, blockchain cert, NEAR/funding
- KLING: rise + light bloom · VO ~16s

**7 · STUDIO / HAUS OF PIXELS (2022)** — Field: acid yellow, HIGH-GLOSS floor (= Image 2)
- BUILD: Haus of Pixels (Image-2 building) + work block; wide
- NANO: billboard/screen with logo, brand logos spilling across a map of Gujarat, intense ground reflection
- START: studio entering → END: studio wide, logos spilling, glossy floor
- BRIDGE OUT: toward animation/europe
- LINE: **"Branding/Studio" thread** opens; several brand sub-threads briefly fork + merge
- CARDS: Silver Dragon, WOW, Jadi Duty, Yogesh Khaman, Arahantas, House of Glam, packaging, web (real deck assets)
- KLING: wide reveal + logos spill, high-gloss · VO ~14s

**8 · ANIMATION + EUROPE (2023–24)** — Field: acid yellow ↔ cool grey
- BUILD: animation studio (Buddy Tales) + health-startup building (KindHealth); a plane element
- NANO: floating cartoon/animation frames, health-startup logo, a plane arcing toward Europe that STALLS and turns back
- START: cartoon building lit + KH logo + plane arcing out → END: plane stalled/returned, Europe greyed, buildings docked
- LINE: **two parallel threads — animation (India) + health startup (Europe)** fork simultaneously; the Europe thread shoots out and bounces back (stall); both merge
- CARDS: Buddy Tales frames, KindHealth
- KLING: dual-building + plane arc + stall-return · VO ~14s

**9 · PONDI (2024→)** — Field: tropical warm gold
- BUILD: Pondi remote/beach building (frosted); camera tilts to sea
- NANO: palms, sea, hammock, warm late-afternoon light, French-quarter calm
- START: city tilting toward sea → END: warm beach scene, building settled, calm
- BRIDGE OUT: yellow→tropical warm
- LINE: threads settle; line runs warm toward the city · CARDS: Rabble work, Conscious Cafe, Auroville (small)
- KLING: tilt-to-sea + warm bloom · VO ~12s

**10 · ARRIVAL / COMPILED CITY (today)** — Field: full glow / daylit
- BUILD: the FULL city cluster (all buildings = Image-2-style city). This render doubles as the archive establishing frame.
- NANO: full skyline, thick braided line arriving into the city, glow
- START: pull-back begins → END: full city resolved, glowing, line thick + braided into it
- BRIDGE IN: tropical→full glow
- LINE: **ALL threads braided into one thick line entering the city = the compile** · CARDS: none (the city is the payoff)
- KLING: epic pull-back reveal (longest clip) · VO ~34s

**11 · GATE / DEVICE ROAST (MOBILE ONLY)** — Field: warm settling
- BUILD: held city frame + share-to-desktop prompt (mostly UI)
- NANO: minimal
- BRANCH: fires only on mobile; on desktop SKIP → straight to handoff/archive
- KLING: hold · VO ~14s

**12 · HANDOFF** — Field: warm, city idle-glow
- BUILD: city idle; orb drifts off → becomes cursor → hands to Archive (Image 2)
- NANO: minimal
- KLING: orb drift-off + transition into archive · VO ~7s

---

## TRANSITION BRIDGES (frames between consecutive buildings)
Render 1–2 bridge frames for each, showing the line traveling + field crossfade:
birth→grad · grad→film (+NID dead-end stub) · film→fall · fall→crypto · crypto→studio · studio→europe · europe→pondi · pondi→arrival. (8 bridge sets.)

---

## PART 3 — VO SCRIPT, fish.audio-ready

Spoken text only — strip the [visual cues], KEEP [performance cues] if fish.audio honors bracket tags (else perform/remove).

1. **boot** (~10s): "[exhale into a coughing fit] —oh. Oh shit. Oh shit it's—[cough]—it's starting, it's already going, okay, okay okay okay—do NOT tell them I wasn't ready."

2. **birth** (~22s): "[excited] Anirudh Venkatesan, the guy who is paying for all of this. Born 1991. Gujarat. Now here's the thing—he's Tamil. A Tamil kid. Born in Gujarat. Which is—[laughs]—that's like ordering a pizza and it shows up at the neighbor's and just decides to live there. Universe made a typo, never hit backspace. Love it. Moving on."

3. **graduation+photon** (~32s): "Business school, IT degree, blah blah, skip it—except—nineteen, twenty years old, people start paying him. Photos. Design. And listen—[leans in]—here's the part that gets me—light. He starts chasing light. Photons, man. You can't catch a photon. It's the one thing in the whole universe that doesn't experience time—doesn't age, doesn't stop, just goes, forever—and this lunatic looked at the one uncatchable thing in existence and went 'yeah, that, I'll do that for a living.' [laughs] Idiot. Beautiful idiot."

4. **film** (~22s): "So—and this is just statistics, don't look it up—NOT getting into art school meant he was always gonna end up on a movie set, obviously, that's how it works—and he gets good. Good enough a real film hands him a real camera. Half a million people watched it. Nobody gave him that. Earned every frame. [proud] Heh. Look at him go."

5. **film_fall** (~16s): "And THEN the movie work just... dries up. Pfft. Gone. Because a career, see, a career is the universe waiting for you to feel cute so it can kick you directly in the dick. It's thermodynamics. Everything you build, the universe wants back. Entropy. We're all just—[cough]—...where was I."

6. **crypto** (~16s): "Crypto! He pivots to crypto. Yeah. That crypto. And before you—no—shut up—he actually wins the hackathon, actually gets certified, actually lands the funding. Real money. Tech doesn't crawl back, it kicks the door in and pays the rent. [burp] 'scuse me."

7. **studio** (~14s): "Builds a studio. Brands businesses all the way across Gujarat. One pixel at a time. One. Pixel. At a time. You know how insane that is? No, you don't, you have a job, probably. Anyway."

8. **animation+europe** (~14s): "Then—simultaneously, like a maniac—he's making a whole animated series in India AND co-founding a health startup in Europe. Tries to drag the entire circus to Europe. Europe goes: 'nah.' [laughs] Europe said nah, man."

9. **pondi** (~12s): "So August 2024 he lands in a sleepy little beach town down south and just... stays. Works remote. Chases light from a hammock now. The smug, sun-kissed prick."

10. **arrival** (~34s): "And here—okay—here's the thing I actually—[soft]—every win, every faceplant, every dumb gorgeous swing—he compiled in the past 16 years. Into this. A whole city, built out of light—these are well-curated electrons shooting your screen to throw photons; he can wield beautiful light. And that's the joke. The cosmic one. We're temporary, man. We rot. But light? Light doesn't. So this one mortal idiot spent his one mortal life chasing the one immortal thing... and left behind a city that glows. [beat] ...that's not nothing. That's—uh—[clears throat]—that's actually kind of everything."

11. **gate** (~14s): "...which you are currently trying to experience on a PHONE. A phone. Like a medieval peasant squinting at a glowing pebble. This is ELITE work, sweetheart—it does not fit in your sad little pocket rectangle. Go find a real machine. Chop chop."

12. **handoff** (~7s): "The light'll wait. Light's patient. [inhale] ...unlike me."

> Total ~3.5 min. Render each beat as its own file (`boot.mp3` … `handoff.mp3`) → drop in `story/audio/` → wire via `audio-manifest.js`. Clip duration per beat ≈ its VO length + ~1s tail.
