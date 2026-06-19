---
name: Pixel Explorer Archive
description: Cinematic sculptural portfolio — 3D cluster on a circular plinth, brutalist editorial UI, Fluent UI Web Components layer
colors:
  bg-deep: "#0A0908"
  paper: "#141210"
  ink: "#f5f5f5"
  ink-soft: "rgba(245,245,245,0.78)"
  ink-mute: "rgba(245,245,245,0.55)"
  ink-faint: "rgba(245,245,245,0.32)"
  accent: "#FFD080"
  accent-hot: "#C49A5A"
  accent-cool: "#8A9AA0"
  accent-warm: "#C8A04A"
  gold: "#C8923B"
  leaf: "#6B8B4A"
  leaf-hi: "#8BA85A"
  glass-bg: "#14110D"
  glass-bg-strong: "#211C15"
  glass-bg-faint: "#100D0A"
  glass-border: "rgba(245,245,245,0.22)"
  glass-border-strong: "rgba(245,245,245,0.42)"
  role-moving-images: "#C49A5A"
  role-visual-systems: "#B8A468"
  role-comp-culture: "#8A9AA0"
  role-doc-research: "#C8A04A"
  role-leadership-edu: "#9AA878"
  role-other: "#A89878"
fluent-ui:
  cdn: "@fluentui/web-components@2.6.1"
  provider-accent: "#FFD080"
  provider-neutral: "#0A0908"
  provider-bg: "#0A0908"
  stealth-buttons: true
  filled-inputs: true
  switch-controls: true
typography:
  display:
    fontFamily: "Climate Crisis, Impact, sans-serif"
    fontSize: "clamp(42px, 8vw, 96px)"
    fontWeight: 400
    lineHeight: 0.96
    letterSpacing: "0"
  headline:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(36px, 4vw, 48px)"
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: "0"
  title:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(48px, 6vw, 80px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "0"
  sheet-title:
    fontFamily: "Cascadia Code, ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "clamp(18px, 2.4vw, 28px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.005em"
    textTransform: "uppercase"
  body:
    fontFamily: "Cascadia Code, ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Cascadia Code, ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.08em"
    textTransform: "uppercase"
rounded:
  sm: "8px"
  md: "14px"
  lg: "22px"
  pill: "999px"
  control: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  pill-chip:
    backgroundColor: "{glass-bg-faint}"
    textColor: "{ink-soft}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  role-pill:
    backgroundColor: "{paper}"
    textColor: "{ink}"
    rounded: "4px"
    padding: "14px 16px"
  icon-button:
    backgroundColor: "{glass-bg-faint}"
    textColor: "{ink}"
    rounded: "50%"
    size: "38px"
  search-input:
    backgroundColor: "rgba(255,220,140,0.04)"
    textColor: "rgba(255,220,160,0.80)"
    rounded: "{rounded.pill}"
    padding: "0 14px"
  fluent-button:
    appearance: "stealth"
    stealth-hover: "rgba(245,245,245,0.10)"
    stealth-active: "rgba(245,245,245,0.18)"
  fluent-text-field:
    appearance: "filled"
    filled-bg: "rgba(10,9,8,0.50)"
    filled-hover: "rgba(10,9,8,0.60)"
  fluent-switch:
    track-bg: "rgba(10,9,8,0.45)"
    thumb-bg: "#f5f5f5"
    checked-track: "#FFD080"
---

# Design System: The Sculptural Cluster

## 1. Overview

**Creative North Star: "The Sculptural Cluster"**

The archive is a single dense model of a life — a phyllotaxis-spiral cluster of white porcelain buildings on a lime-green circular plinth, viewed in a dark studio with a glossy reflecting floor. The UI is a brutalist editorial layer over this 3D core: sharp corners, monospace data typography, glass-on-dark surfaces, and amber-gold accents that recall warm metal in a dark room. Everything is weighty and intentional — a gallery installation, not a slideshow.

The UI is built on **Microsoft Fluent UI Web Components v2.6.1** (CDN, no bundler) — custom elements with Shadow DOM that provide consistent button, input, and switch controls while allowing brand color injection via design tokens.

The system explicitly rejects generic portfolio language, stock photography, gradient text, glassmorphism-as-default, bouncy spring animations, and any friction before the work (no login walls, no popups, no cookie banners).

**Key Characteristics:**
- Dark studio background (`#0A0908`) with warm amber-gold accent (`#FFD080`)
- Monospace data-first typography (Cascadia Code) as the body face
- Sharp corners (8px max radius, 4px Fluent control radius) — no rounding for rounding's sake
- Glass-on-dark layered surfaces with backdrop-blur for depth
- Role identity expressed through color chips, not tinted backgrounds
- Sculptural 3D core + brutalist 2D overlay — two distinct visual systems that meet at the modal
- Fluent UI Web Components for all interactive controls (buttons, inputs, switches)

## 2. Colors

The palette is dark-studio with warm-metallic accents: a near-black ground, amber-gold highlights, and desaturated warm role colors that read as mineral rather than electronic.

### Primary
- **Amber Accent** (`#FFD080`): The single warm signal across the entire interface — active states, focus rings, accent borders, timeline slider thumbs. Mapped to Fluent `--accent-fill-rest`. Used sparingly; its rarity is the point.
- **Gold** (`#C8923B`): Earnings, grants, and win markers. A secondary warm metal for special-status data points.

### Neutral
- **Studio Black** (`#0A0908`): Primary background — the room, the ambience, the ground. Mapped to Fluent `neutral-base-color`.
- **Paper** (`#141210`): Surface color for panels, cards, and containers. One step off the background, legible as a distinct layer.
- **Warm White Ink** (`#f5f5f5`): Body text. Never pure white (`#ffffff`); always the slight warmth of a dim incandescent bulb. Mapped to Fluent `--neutral-foreground-rest`.
- **Ink Soft** (`rgba(245,245,245,0.78)`): Secondary text, descriptions.
- **Ink Mute** (`rgba(245,245,245,0.55)`): Metadata, labels, captions.
- **Ink Faint** (`rgba(245,245,245,0.32)`): Placeholder text, disabled states.

### Glass
- **Glass Surface** (`#14110D`): The base tint for frosted UI panels.
- **Glass Strong** (`#211C15`): Higher-opacity glass for elevated elements.
- **Glass Border** (`rgba(245,245,245,0.22)`): Subtle white hairline on dark glass.
- **Glass Border Strong** (`rgba(245,245,245,0.42)`): Emphasized borders for active/hover states.

### Role Colors (desaturated warm range)
- **Moving Images** (`#C49A5A`): Amber-brown.
- **Visual Systems** (`#B8A468`): Warm olive-gold.
- **Comp Culture** (`#8A9AA0`): Cool grey-steel.
- **Doc & Research** (`#C8A04A`): Ochre.
- **Leadership & Edu** (`#9AA878`): Muted sage.
- **Other** (`#A89878`): Warm taupe.

### The One Voice Rule
The amber accent (`#FFD080`) is used on ≤5% of any given screen. It highlights active filters, focused inputs, Fluent switch checked state, timeline thumbs, and the current-year marker. If a screen has more than three amber elements, strip two of them. Not because they look bad — because the rarity is what makes it read as a signal.

## 3. Typography

**Display Font:** Climate Crisis (with Impact, sans-serif fallback)
**Body Font:** Cascadia Code (with ui-monospace, SFMono-Regular, Consolas fallback)
**Identity Font:** Instrument Serif (with Georgia, serif fallback)

**Character:** A monospace-first editorial system where data is the voice. Cascadia Code is the body face — uncommon for web, which is the point. Every label, description, and fact reads like a terminal transcript. Instrument Serif provides warmth and editorial weight for titles. Climate Crisis (a variable CO₂-emission-inspired display face) is reserved for giant year numerals only.

**Fluent integration:** The body font is injected into Fluent's `--body-font` custom property so Fluent components use Cascadia Code. Font size ramps are mapped via `--type-ramp-*` tokens (base 14px, minus-1 11px, minus-2 9px, plus-1 15px, plus-2 22px).

### Hierarchy
- **Display** (400, clamp(42px, 8vw, 96px), 0.96): Giant year numerals on the timeline spine. Climate Crisis. Only appears once per view.
- **Headline** (400, clamp(36px, 4vw, 48px), 1.0): Detail panel hero titles, section headers. Instrument Serif.
- **Title** (400, clamp(48px, 6vw, 80px), 0.98): Nav-page headings (Roles/Clients page headers). Instrument Serif.
- **Sheet Title** (700, clamp(18px, 2.4vw, 28px), 1.2, uppercase): Manila folder project titles, entry card headings. Cascadia Code. Max-width 44ch to prevent runaway widows.
- **Body** (500, 13px, 1.5, letter-spacing 0): Entry descriptions, story text, side notes. Cascadia Code. Line length capped at 65–75ch.
- **Label** (600, 10px, letter-spacing 0.08em, uppercase): Metadata, pill labels, keyboard shortcuts, section heads. Cascadia Code.

### The One-Family Rule
Never mix two monospace families. Cascadia Code IS the monospace. No Fira Code, no JetBrains Mono, no SF Mono as an alternative — only Cascadia Code and its fallback stack.

## 4. Elevation

Depth is conveyed through glass blur and tonal layering rather than drop shadows. UI panels float above the dark studio background via `backdrop-filter: blur(20px) saturate(140%)` + a tinted glass background — never hard shadows. The 3D scene below provides the real depth; the UI sits on a single glass plane above it.

Fluent components have their own elevation model (focus rings, hover fills) which is flattened: `--control-corner-radius: 4px`, `--stroke-width: 1.5px`, and `--focus-ring-width: 1.5px`. No Fluent elevation shadows are enabled.

### Glass Vocabulary
- **Glass default** (`backdrop-filter: blur(20px) saturate(140%)`, background `rgba(16,13,10,0.65)`, border `1px solid rgba(245,245,245,0.22)`): Standard surface for panels, sidebars, modals.
- **Glass strong** (same blur, background `rgba(33,28,21,0.85)`): Hovered or active glass surfaces.
- **Drawer** (`box-shadow: 0 -24px 64px rgba(0,0,0,0.55)`): The project-page bottom drawer gets a hard upward shadow to anchor it to the 3D scene.

### The Flat-By-Default Rule
Surfaces are flat at rest. No emboss, no inner shadow, no gradient overlay. Depth appears only as a state response — hover lifts a card via `translateY(-2px)`, not `box-shadow` inflation.

## 5. Components

### Fluent UI Integration
The UI layer is built on **@fluentui/web-components v2.6.1** loaded via CDN script tag (no bundler). Components use Shadow DOM for encapsulation. Brand colors are injected via CSS custom properties on `<fluent-design-system-provider>` and `::part()` selectors for deeper styling.

**Provider configuration** (`index.html:143`):
```html
<fluent-design-system-provider id="dsProvider"
  accent-base-color="#FFD080" neutral-base-color="#0A0908"
  background-color="#0A0908" use-defaults>
```

**Token mapping** (`styles.css:30-65`):
| Brand token | Fluent custom property | Value |
|---|---|---|
| Amber accent | `--accent-fill-rest` | `#FFD080` |
| Amber accent (hover) | `--accent-fill-hover` | `#FFE0A0` |
| Amber accent (active) | `--accent-fill-active` | `#C49A5A` |
| Studio black | `--neutral-fill-rest` | `rgba(10,9,8,0.55)` |
| Warm white ink | `--neutral-foreground-rest` | `#f5f5f5` |
| Cascadia Code | `--body-font` | `"Cascadia Code", monospace` |
| Sharp corners | `--control-corner-radius` | `4px` |

Light theme inverts neutral fills/foregrounds via `[data-theme="light"]` overrides on the provider.

### Element Map — Fluent vs Native

| Element | Fluent component | Appearance | Notes |
|---|---|---|---|
| Topnav navlinks (archive/roles/clients) | `<fluent-button>` | `stealth` | Transparent bg, hover fill |
| Search input | `<fluent-text-field>` | `filled` | Pill-shaped via `::part(root)` |
| Theme toggle | `<fluent-switch>` | — | Amber accent when checked |
| Clear filters | `<fluent-button>` | `stealth` | In timeline bar |
| View toggle (2D/3D) | `<fluent-button>` | `stealth` | In map-toolbar |
| Reset view | `<fluent-button>` | `stealth` | In map-toolbar |
| **Close buttons** (project, nav, gallery, artifact) | **Native `<button>`** | — | Need precise circular 40×40 sizing + glass bg |
| **Gallery tabs** (GRID/LIST) | **Native `<button>`** | — | Need precise typographic control in gallery header |
| **Story mode buttons** (Play Film/Explore) | **Native `<button>`** | — | Custom cinematic styling |
| **Role pills** | **Native `<button>`** | — | Custom JS-rendered with role-color chips |
| **Year range sliders** | **Native `<input type="range">`** | — | Dual-range not supported by `<fluent-slider>` |

### Buttons
- **Fluent stealth buttons** (`<fluent-button appearance="stealth">`): Transparent background, ink text. Hover adds subtle fill. Used for navigation, toolbar actions, text actions. Styled via `::part(control)` for hover/active fills.
- **Native close buttons**: Circular 40×40, glass background, hover rotates 90°. These remain native `<button>` because Fluent's Shadow DOM overrides precise sizing and border-radius.
- **Primary / CTA**: No filled primary button exists in the system. CTAs are text links with hover underline or a bordered pill.

### Chips (Tag pills, Search chips)
- **Style:** Pill-shaped (`border-radius: 999px`), `--glass-bg-faint` background, `--ink-soft` text, hairline `--glass-border`.
- **State:** Active chips get `rgba(255,255,255,0.18)` background + `--glass-border-strong`. Removable chips have an `×` close button at `--ink-faint`.

### Cards / Containers
- **Corner Style:** 8px radius (`var(--radius-md)`), consistently. Manila folder sheet cards use 18px outer radius.
- **Background:** `--glass-bg` (`#14110D`) with blur. Manila sheet body is cream (`#f5f5f5`) with ink (`#1a1714`) text.
- **Border:** 1px `--glass-border`. Folder sheet uses no border — relies on box-shadow for depth.
- **Shadow Strategy:** None at rest. Hover lifts via `translateY(-2px)` and strengthens border to `--glass-border-strong`. Folder sheet uses `0 16px 44px rgba(0,0,0,0.50)`.
- **Internal Padding:** 24px (`--spacing-lg`). Manila single-entry card stacks `22px` horizontal / `24px` top / `44px` bottom.

### Manila Sheet (`.ms-body-inner`, `.ms-body-inner--single`)
- **Structure:** Cream body (`#f5f5f5`), role-colored tab grip, scrollable bento evidence gallery + side notes column.
- **Width:** `min(860px, 90vw)` for centered single-entry; `max-width: 720px` for cluster cascade sheet.
- **Content gap:** `14px` between title, chips, tags, story, and gallery.
- **Title:** Cascadia Code, 700, uppercase, `clamp(18px, 2.4vw, 28px)`, capped at 44ch.
- **Body text:** 13px/1.5 Cascadia Code, max 660px.
- **Evidence:** `.ms-gallery` bento grid with `minmax(120px, 1fr)` cells, `120px` auto rows, `8px` gap. Captions migrate to a sticky `minmax(170px, 220px)` side notes column.
- **Close button:** Fixed 46px circle, cream (`#f5f5f5`) with `#1A1714` X, `z-index: 80`, `box-shadow: 0 6px 22px rgba(0,0,0,0.45)`.

### Inputs / Fields
- **Fluent text field** (`<fluent-text-field appearance="filled">`): Pill-shaped via `search-glass::part(root) { border-radius: 75px }`. Filled appearance with dark background. Amber accent border on focus.
- **Placeholder:** `--ink-faint` (never muted gray), styled via `::part(control)::placeholder`.
- **Error / Disabled:** No custom error styling in the current system — inputs are read-only or search, not form fields.

### Styling Fluent Shadow DOM
Fluent components encapsulate their DOM in Shadow DOM. Use these techniques to style them:

| Technique | Usage | Example |
|---|---|---|
| CSS custom properties | Token injection | `--neutral-fill-rest: ...` on `<fluent-design-system-provider>` |
| `::part()` selector | Style internal elements | `fluent-button::part(control) { ... }` |
| Host element styling | Outer box model | `fluent-button { margin: 0; }` |
| Inherited properties | Color, font cascade | `color: var(--ink)` on host inherits into shadow |

### Navigation (Topnav)
- **Style:** Fixed glass bar spanning the viewport top. Pill container, `backdrop-filter: blur(20px)`, height 56px.
- **Links:** `<fluent-button appearance="stealth">` with pill hover fill. Active link gets amber text + amber 10% background + inset amber 1px border (via `::part(control)`).
- **Brand:** Left-aligned, amber gradient dot avatar + name/role stack.
- **Right side:** Search input (`<fluent-text-field>`) + theme toggle (`<fluent-switch>`) + year-window pill.

### Role Pills (Signature Component)
- **Style:** Rectangular card (4px radius, not pill), `grid-template-columns: 40px 1fr`. Left slot = role-color icon chip (40×28px, filled with role color, 3px radius). Right slot = role label in Cascadia Code, 11px, uppercase, 0.08em tracking.
- **Rest:** `--paper` background, `--ink` text, `rgba(255,255,255,0.10)` border.
- **Hover / Preview:** Border fills with role color at 85% opacity, card shifts 6px left, box-shadow appears on the left edge.
- **Active (locked filter):** Role color fills at 55% opacity, border merges with fill.
- **Position:** Fixed right-side vertical stack, `top: 50%; transform: translateY(-50%)`. Not in the document flow.

## 6. Do's and Don'ts

### Do:
- **Do** lead with evidence. Every entry has a proof artifact — show the real Gmail screenshot, the real contract.
- **Do** use specific dates and numbers over vague language ("14 Oct 2010" not "October 2010").
- **Do** keep the amber accent rare. One or two elements per view; never three.
- **Do** use Cascadia Code for all body text — the monospace IS the voice.
- **Do** keep surfaces flat at rest; let interaction create depth.
- **Do** prefer glass blur + tint over drop shadows for container depth.
- **Do** use 8px as the maximum corner radius for UI surfaces (pills are the exception; Fluent control radius is 4px).
- **Do** respect the `[data-theme="light"]` overrides — the palette inverts completely while keeping the same hierarchy.
- **Do** use `::part(control)` to style Fluent button/input internals when the host-level CSS custom properties aren't enough.
- **Do** keep Fluent components inside `<fluent-design-system-provider>` for token inheritance.
- **Do** keep native `<button>` for elements needing precise visual control (close buttons, gallery tabs, role pills).

### Don't:
- **Don't** use generic portfolio language ("passionate", "innovative", "creative").
- **Don't** use stock photography — every visual is either Anirudh's or AI-generated to spec.
- **Don't** use gradient text (`background-clip: text` with gradient). One solid color per text element.
- **Don't** use glassmorphism as a default. Glass is for UI panels over the 3D scene; do not blur decorative elements.
- **Don't** use bouncy spring animations. All motion is eased (cubic-bezier(0.4, 0, 0.2, 1)) and weighty (600–900ms camera transitions).
- **Don't** pair two similar fonts — no two geometric sans-serifs, no two humanist sans-serifs.
- **Don't** use border-left greater than 1px as a colored accent stripe.
- **Don't** use numbered section markers (01/02/03) as default scaffolding.
- **Don't** put login walls, analytics popups, cookie banners, or any friction before the portfolio.
- **Don't** let heading text overflow its container — test clamp values at every breakpoint. Cap sheet titles at 44ch and body text at 660px.
- **Don't** use `border: 1px solid X + box-shadow: 0 Npx Mpx with M ≥ 16` on the same element.
- **Don't** use rounded corners larger than 8px on cards or containers (pill-shaped elements are the only exception).
- **Don't** use sketchy SVG illustrations as decorative filler.
- **Don't** fight Fluent's Shadow DOM with `!important` on host elements — use `::part()` or CSS custom properties instead.
- **Don't** wrap Fluent components in extra `<div>` for styling — use `::part(root)` for the outer container.
