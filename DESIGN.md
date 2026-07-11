# Latent Scope Design System — "Amber Console"

Terminal-native futurism. The sci-fi is *calibration*: warm graphite surfaces, one amber
phosphor accent (the copper brand matured, not replaced), monospace for everything the
machine measured, sans for everything the human reads, and light that only ever means state.
Heritage: the **amber terminal** (VT220 amber mode, P3 phosphor) — which is exactly where
copper `#b87333` already lives on the hue wheel. No green CRT, no scanlines, no glass.

**Scene:** a midnight instrument bench — the embedding map glows like a star chart in a deep
graphite well, framed by matte panels whose amber diodes and mono readouts say the machine
is running and knows exactly where every point is.

- **Dark is home.** App background is a deep warm graphite well; panels rise *lighter* out of
  it. The map canvas is the darkest surface in the app: everything luminous is data. Amber is
  emissive: hover brightens.
- **Light is the daylight lab, first-class.** Warm paper bench, white panels, amber deepened
  to stamped copper. Hover *deepens* (metal, not phosphor). No glows in light mode.
- **One deliberate inversion:** the console primitive (job logs, export snippets) stays dark
  in both modes — a real terminal embedded in the bench.

This is **product register**: it must pass "would a Linear/Figma-fluent user trust every
component." Sci-fi lives in atmosphere and three signatures (§7), never in display fonts on
controls or decorative motion.

## 1. Theme delivery

- `web/src/latentscope--brand-theme.scss` is the **single source of truth** for every color
  and `--ls-*` token. Light-first `:root`, one `@media (prefers-color-scheme: dark)` override
  block. Imported **exactly once** (from `index.scss` via `@use`); the `main.jsx` and
  `App.jsx` theme imports are removed.
- **No `data-theme` mirrors for now** (a toggle would fork CSS vs `useColorMode()` JS; if a
  toggle ever ships, update `useColorMode` to read the attribute in the same commit).
- `index.scss` keeps the react-element-forge alias layer (frozen names → brand vars) but its
  competing dark ramp, dark-first defaults, and all Vite template leftovers are **deleted**.
- Canvas/WebGL code reads tokens via `getComputedStyle(document.documentElement)
  .getPropertyValue('--ls-…')` and re-renders on `useColorMode()` changes. Never hardcode
  chrome colors in JS.

## 2. Frozen forge tokens — new values (names unchanged)

Hex is canonical. Every pair below is WCAG-verified (body/label text ≥ 4.5:1 both modes).

### 2.1 Neutrals — one ramp, warm graphite / warm paper

Semantic contract in BOTH modes — memorize this: **`neutral-1` = page background,
`neutral-0` = raised panel/card surface (lighter than the page in both modes), `neutral-2` =
hover/inset, `neutral-3` = strong/pressed.** Use the `--ls-surface-page` / `--ls-surface-panel`
aliases in new CSS so intent is explicit. Never place `text-subtle` on `neutral-3`.

| Token | Light | Dark |
|---|---|---|
| `--neutrals-color-neutral-0` | `#ffffff` | `#1d1a17` |
| `--neutrals-color-neutral-0-reverse` | `#151312` | `#ffffff` |
| `--neutrals-color-neutral-1` | `#f6f4f1` | `#151312` |
| `--neutrals-color-neutral-2` | `#eae6e0` | `#282420` |
| `--neutrals-color-neutral-3` | `#cfc9c1` | `#3a352f` |
| `--borders-color-border-1` (hairline) | `#e3dfd9` | `#332e28` |
| `--borders-color-border-2` (standard) | `#c8c2b9` | `#4a443c` |
| `--borders-color-border-3` (ghost) | `#c8c2b933` | `#4a443c33` |

### 2.2 Interaction — amber, the single accent

| Token | Light | Dark |
|---|---|---|
| `--interactions---primary-color-interaction-primary` | `#a35c14` | `#e59d4b` |
| `…-primary-hover` | `#8a4c0f` | `#f0ab5c` |
| `…-primary-active` | `#713d0a` | `#cc8636` |
| `…-primary-disabled` | `#d9bd9e` | `#6e5636` |
| `--interactions---secondary-color-interaction-secondary` | `#ffffff` | `#24201c` |
| `…-secondary-hover` | `#f6f2ec` | `#2e2924` |
| `…-secondary-active` | `#eae3d9` | `#3a342d` |
| `…-secondary-disabled` | `#f4f1ec99` | `#24201c99` |

Light hover **deepens** (stamped metal, keeps white labels ≥ 4.5:1 at every state); dark
hover **brightens** (phosphor gains energy). Primary button labels: light `#ffffff`, dark
`var(--text-color-text-reverse)` (= `#1a1713` ink — amber terminals ran inverse-video).

`--color-interaction-delete*` aliases the **critical** set (incl. `-alt` →
`--semantic-color-semantic-critical-bg-alt`); `--color-interaction-pos*` aliases the
**success** set. Pure `var()` aliases in index.scss, no literals.

### 2.3 Text

| Token | Light | Dark |
|---|---|---|
| `--text-color-text-main` | `#26221c` | `#ece7df` |
| `--text-color-text-subtle` | `#5c574f` | `#a39d92` |
| `--text-color-text-primary` (links/accent) | `#96540f` | `#eda453` |
| `--text-color-text-critical` | `#8a3129` | `#e89c90` |
| `--text-color-text-info` | `#3d6470` | `#93c3d1` |
| `--text-color-text-success` | `#47663a` | `#a4cc92` |
| `--text-color-text-warning` | `#7d6217` | `#dcc06a` |
| `--text-color-text-neutral` | `#6e6459` | `#b3a99c` |
| `--text-color-text-reverse` | `#ffffff` | `#1a1713` |
| `--text-color-text-reverse-subtle` | `#e9e4dc` | `#2e2923` |
| `--text-color-text-disabled` (new) | `#a19a8f` | `#6f685e` |

Key verified ratios — body on page 14.4/15.1, body on panel 15.8/14.1, subtle on page
6.5/6.9, primary label 5.1/8.2, link on page 5.4/8.3, delete label (white on critical)
5.6/4.7.

### 2.4 Semantic families — muted phosphor set

Info = cyan-slate (~hue 218), success = sage (137, desaturated away from CRT green), warning
= yellow (88 — 25° from amber so warning never reads as brand), critical = brick (28).

| Family | Light base/hover/active/disabled | Dark base/hover/active/disabled |
|---|---|---|
| critical | `#b0453c` `#c2564c` `#8f342d` `#d9a29c99` | `#c14f41` `#d4604f` `#a03f33` `#c14f4166` |
| info | `#4f7d8c` `#5f8fa0` `#406873` `#a9c2ca99` | `#6fa9b8` `#85bccb` `#5b93a2` `#6fa9b866` |
| success | `#5f8f4e` `#6fa15c` `#4d7740` `#abc6a099` | `#83b370` `#95c281` `#6f9c5e` `#83b37066` |
| warning | `#c29a2b` `#d3ab3c` `#a37f1f` `#e3cd9199` | `#d9b34a` `#e5c25c` `#c19c39` `#d9b34a66` |
| neutral | `#998f83` `#a89e92` `#7d746a` `#c9c2b999` | `#6b6156` `#7b7165` `#595044` `#6b615666` |

Plus: `--semantic-color-semantic-critical-bg-alt` `#f7e4e0` / `#3a201c`;
`--semantic-color-semantic-neutral-inactive` `#c9c2b9` / `#4a443c`;
`--color-semantic-disabled` → alias neutral-disabled.

### 2.5 Overlays, status, badges, menu, misc

| Token | Light | Dark |
|---|---|---|
| `--overlays-color-background-overlay` | `#26221c66` | `#00000080` |
| `--overlays-color-background-modal-overlay` | `#18141066` | `#000000a6` |
| `--color-background-overlay` / `--color-background-modal-overlay` | aliases of the above (indigo `rgba(23,10,122,…)` dies) | |
| `--color-background-subtle-callout` | `#f4ede1` | `#2b241a` |
| `--color-background-critical` | `#f7e4e0` | `#3a201c` |
| `--color-background-neutral-0` | alias `--neutrals-color-neutral-0` | |
| `--color-avatar-bg` | `#efe4d3` | `#3a3226` |
| `--color-status-ready` | `#4d8a3d` | `#7fd45e` |
| `--color-status-busy` | `#c2811f` | `#f0a848` |
| `--color-status-offline` | `#9a938a` | `#7a736a` |
| `--color-badge-primary-bg` / `-text` | `#26221c` / `#f6f4f1` | `#ece7df` / `#1d1a17` |
| `--color-badge-secondary-bg` / `-text` | `#ffffff` / `#26221c` | `#282420` / `#ece7df` |
| `--color-interactions-menu` / `-hover` / `-inactive` | `#26221c` / `#574f45` / `#8c857b` | `#ece7df` / `#c9c2b6` / `#837c71` |
| `--copy-button-text-color` | `#5c574f` | `#a39d92` |

Status dots are the one place saturation spikes (8px diodes, not surfaces).

### 2.6 Forge dimension/typography tokens

| Token | New value |
|---|---|
| `--button-font-size` / `-weight` | `0.875rem` / `500` |
| `--button-border-radius` / `-border-stroke` | `6px` / `1px` |
| `--button-padding-large`/`-round` · `-medium`/`-round` · `-small`/`-round` | `10px 16px`/`10px` · `6px 12px`/`6px` · `3px 8px`/`3px` |
| `--button-box-shadow` | `none` |
| `--input-border-radius` / `--input-padding` | `6px` / `8px 10px` |
| `--input-font-size` / `--input-info-font-size` | `0.875rem` |
| `--input-label-font-size` / `-weight` | `0.8125rem` / `600` |
| `--dropdown-border-radius` / `--dropdown-margin-top` | `6px` / `6px` |
| `--badge-font-size` / `-weight` / `-padding` / `-border-radius` | `0.75rem` / `500` / `2px 8px` / `3px` (56px pill dies) |
| `--tooltip-font-size` / `-weight` / `--tooltip-width` | `0.75rem` / `400` / `280px` |
| `--checkbox-label-font-size` / `-weight` | `0.875rem` / `400` |
| `--radio-label-font-size` / `-weight` | `0.875rem` / `400` |
| `--switch-font-weight` | `500` |
| `--copy-button-font-size` / `-weight` | `0.75rem` / `500` |
| `--font-primary` / `--font-secondary` / `--font-backup` | `'IBM Plex Sans'` / `'IBM Plex Mono'` / `system-ui` |
| `--font-primary-weight` / `--font-secondary-weight` | `400` / `400` |
| `--font-body-xs/sm/md/lg` (units fixed) | `0.75rem / 0.875rem / 1rem / 1.125rem` |
| `--font-body-mobile-md/lg` | `0.875rem / 1rem` |
| `--font-body-thin/regular/semibold/bold-weight` | `300 / 400 / 600 / 700` |

## 3. New `--ls-*` tokens

```css
:root {
  /* spacing — 4px base; existing 20px paddings round to 16 (dense) or 24 (roomy) */
  --ls-space-1: 4px;  --ls-space-2: 8px;  --ls-space-3: 12px; --ls-space-4: 16px;
  --ls-space-5: 24px; --ls-space-6: 32px; --ls-space-7: 48px; --ls-space-8: 64px;

  /* radius — 3 stops kill the 2/3/4/5/6/8/12/20/56 scatter */
  --ls-radius-1: 3px;    /* chips, badges, tooltips, table cells, swatches, scrollbar thumb */
  --ls-radius-2: 6px;    /* buttons, inputs, cards, panels, console */
  --ls-radius-3: 10px;   /* modals, drawers, floating HUD panels */
  --ls-radius-round: 999px; /* diodes + avatar ONLY */

  /* layout chrome */
  --ls-nav-height: 48px; --ls-subnav-height: 40px;
  --ls-page-offset: calc(var(--ls-nav-height) + var(--ls-subnav-height));
  --ls-pane-config-width: 300px; --ls-drawer-width: 400px;

  /* z-index — named layers; map plot layers stay DOM-ordered with NO z-index (load-bearing) */
  --ls-z-base: 0; --ls-z-raised: 10; --ls-z-sticky: 50; --ls-z-nav: 100;
  --ls-z-hud: 200;      /* floating map chrome: ConfigurationPanel, colorBy chip, reticle */
  --ls-z-drawer: 300;   /* PointDetail */
  --ls-z-sheet: 350;    /* mobile bottom sheet */
  --ls-z-dropdown: 400; /* search dropdown, select menus */
  --ls-z-overlay: 500; --ls-z-modal: 510;
  --ls-z-toast: 600; --ls-z-tooltip: 700;

  /* elevation — light: shadows; dark: overridden below */
  --ls-shadow-1: 0 1px 2px rgba(21,19,18,0.08);
  --ls-shadow-2: 0 4px 12px rgba(21,19,18,0.12);
  --ls-shadow-3: 0 12px 32px rgba(21,19,18,0.20);
  --ls-glow-status: none;   /* the ONLY glow in the system; lights up in dark */

  /* focus — one ring everywhere (restores Compare's deleted outlines) */
  --ls-focus-ring-color: var(--color-interaction-primary);
  --ls-focus-ring: 2px solid var(--ls-focus-ring-color);
  --ls-focus-ring-offset: 2px;

  /* type */
  --ls-font-ui: 'IBM Plex Sans', system-ui, sans-serif;
  --ls-font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;
  --ls-text-2xs: 0.6875rem; --ls-text-xs: 0.75rem; --ls-text-sm: 0.875rem;
  --ls-text-md: 1rem; --ls-text-lg: 1.125rem; --ls-text-xl: 1.25rem;
  --ls-text-2xl: 1.5rem; --ls-text-3xl: 1.625rem;  /* page-title ceiling; h1 3.2em dies */
  --ls-leading-body: 1.5; --ls-leading-ui: 1.4; --ls-leading-tight: 1.25;
  --ls-tracking-label: 0.06em; --ls-tracking-wordmark: 0.08em;

  /* motion */
  --ls-dur-fast: 150ms; --ls-dur-base: 200ms; --ls-dur-slow: 250ms;
  --ls-ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ls-ease-in-out: cubic-bezier(0.45, 0, 0.25, 1);

  /* surfaces */
  --ls-surface-page: var(--neutrals-color-neutral-1);
  --ls-surface-panel: var(--neutrals-color-neutral-0);
  --ls-surface-map: var(--neutrals-color-neutral-0);  /* dark override: #0e0d0b, darkest surface */
  --ls-surface-input: #ffffff;                        /* dark: #151312 (inset) */
  --ls-surface-console: #0e0d0b;                      /* console is dark in BOTH modes */
  --ls-console-text: #e8b465;                         /* 10.3:1 on console bg */
  --ls-console-text-dim: #8a7a5c;
  --ls-console-border: #26221c;                       /* dark: var(--borders-color-border-2) */
  --ls-scrim: rgba(246,244,241,0.85);

  /* accent washes (JS-readable; use instead of inline color-mix) */
  --ls-accent-surface: #a35c141a;  /* selected rows/cards wash ~10% */
  --ls-accent-line: #a35c1473;     /* selected outlines ~45% */

  /* JS-readable chrome colors for canvas/WebGL (via getComputedStyle) */
  --ls-color-selection: #2f7a8e;       /* crosshair/neighbor selection; kills #4488ff */
  --ls-color-selection-fill: #2f7a8e22;
  --ls-color-crosshair: #9a938a;
  --ls-color-canvas-grid: #26221c14;   /* kills rgba(40,90,200,…) */
  --ls-color-hover-halo: #26221c33;
}

@media (prefers-color-scheme: dark) { :root {
  --ls-shadow-1: 0 1px 2px rgba(0,0,0,0.5);
  --ls-shadow-2: 0 4px 12px rgba(0,0,0,0.5);
  --ls-shadow-3: 0 12px 32px rgba(0,0,0,0.65);
  --ls-glow-status: 0 0 6px currentColor;
  --ls-surface-map: #0e0d0b;
  --ls-surface-input: #151312;
  --ls-console-border: var(--borders-color-border-2);
  --ls-scrim: rgba(21,19,18,0.85);
  --ls-accent-surface: #e59d4b1f; --ls-accent-line: #e59d4b73;
  --ls-color-selection: #7fc4d6; --ls-color-selection-fill: #7fc4d61f;
  --ls-color-crosshair: #7a736a;
  --ls-color-canvas-grid: #ece7df12;
  --ls-color-hover-halo: #ece7df2e;
}}
```

**Dark elevation rule:** shadow alone is invisible on graphite — every elevated surface also
gets a 1px `border-1` (floating: `border-2`) edge. Edges are the constant, shadows are
atmosphere.

## 4. Typography

**Two families total** (Google Fonts; Orbitron, Roboto, and every Courier stack die):

| Role | Face | Weights | Usage |
|---|---|---|---|
| UI / body | IBM Plex Sans | 400 body · 500 buttons/tabs/emphasis · 600 headings/labels | all sentences, labels, buttons, headings, empty states |
| Data / mono | IBM Plex Mono | 400 readouts/logs · 500 chips/IDs · 600 wordmark | coordinates, counts, run IDs, metrics, byte sizes, paths, table numerics, console, status chips, micro-labels |

Always `font-variant-numeric: tabular-nums` on mono data. UI chrome sits at `sm`; reading
prose at `md`/1.5. Headings weight 600, never the `bold` keyword. **Mono micro-label
overline** pattern: `2xs / 500 / uppercase / tracking var(--ls-tracking-label) / text-subtle`.

**The wordmark**: "LATENT SCOPE" in Plex Mono 600, `0.875rem`, uppercase, tracking
`--ls-tracking-wordmark`, preceded by a live 6px status diode. (Orbitron is gone from the
app; one rule to revert if the wordmark decision is overturned.)

**Mono is for facts the machine measured, never for language the human reads as prose.**

## 5. Component specs

- **Nav** (kills lightsalmon): h `--ls-nav-height`, bg `--ls-surface-panel`, 1px bottom
  `border-1`, padding-inline `--ls-space-4`. Wordmark per §4. Links: Sans 500 `sm`
  `text-subtle`; hover `text-main`; active route `text-main` + `box-shadow: inset 0 -2px 0
  var(--color-interaction-primary)`. Right: settings icon-button + server diode.
- **Tabs — ONE primitive** (kills 3 implementations + seagreen): transparent button, padding
  `6px 12px`, Sans 500 `sm` `text-subtle`, `border-bottom: 2px solid transparent`, radius 0.
  Hover: `text-main` + bottom `border-2`. Active: `text-main` + bottom amber. Focus-visible:
  `outline: var(--ls-focus-ring); outline-offset: -2px`. Counts inside tabs: mono `xs`.
- **Panel/card**: bg `--ls-surface-panel`, 1px `border-1`, radius `--ls-radius-2`, padding
  `--ls-space-4`; shadow only when floating. Header: optional mono overline + title `sm` 600.
  Floating-over-map (ConfigurationPanel, metadata card, colorBy chip): bg
  `color-mix(in srgb, var(--neutrals-color-neutral-0) 95%, transparent)` (NO backdrop blur),
  1px `border-2`, `--ls-shadow-2`, `z: var(--ls-z-hud)`, radius `--ls-radius-3`.
- **Buttons**: primary amber fill (labels per §2.2); secondary = `interaction-secondary` bg +
  1px `border-2` + `text-main`; ghost = transparent, `text-subtle`, hover `text-main` + bg
  `neutral-2`; destructive = critical fill + white label. **Icon button: 28×28, radius 6px,
  ghost treatment, 16px icon** (replaces three 30×30 `!important` skins and `scale(0.6)`).
  Transitions 150ms color/bg/border only; no shadows, no transforms. The global `button {}`
  element restyle dies; unstyled natives migrate to forge.
- **Inputs/selects**: bg `--ls-surface-input`, 1px `border-2`, radius 6px, padding `8px 10px`,
  Sans `sm`; placeholder `text-disabled`; hover border `neutral-3`; focus border amber +
  ring. Numeric/ID inputs: **Plex Mono tabular-nums right-aligned**. Labels: `xs` 600. Range
  sliders + checkboxes/radios: native/forge with `accent-color: var(--color-interaction-primary)`.
  react-select via `SelectStyles.jsx` (the standard); raw `<select>`s get shared `.ls-select`.
- **Tables** (react-data-grid via scoped `.ls-rdg` wrapper — prefer rdg's own `--rdg-*` CSS
  custom properties, zero `!important`): header bg `neutral-1`, Sans 600 `xs` uppercase
  tracking 0.04em `text-subtle`, 1px bottom `border-2`, h 32px. Rows 32px (48 with images),
  1px bottom `border-1`, no vertical rules. Numeric cells mono `xs` tabular right-aligned.
  Hover `color-mix(in srgb, var(--neutrals-color-neutral-2) 55%, transparent)`; selected row
  `--ls-accent-surface` (no border tricks). Raw `<table>`s adopt identical values.
  Pagination: icon buttons + mono `xs` `PAGE 3 / 128`.
- **Modals**: radius `--ls-radius-3`, bg panel, 1px `border-2`, `--ls-shadow-3`. Header: mono
  overline + title `md` 600 + icon-button close (ONE close-X everywhere). Sizes `sm 400px ·
  md 640px · lg 880px · xl min(1100px, 90vw)` (kills `70vw/80vw/800px !important`). Enter
  200ms fade + 8px rise; exit 150ms. PointDetail drawer: same chrome, translateX 250ms,
  w `--ls-drawer-width`, `z-drawer`.
- **Tooltips** (kills `#D3965E` ×4 + `top:-200`): inverse surface — light `#26221c`/`#f6f4f1`,
  dark `#ece7df`/`#1d1a17`; radius `--ls-radius-1`; padding `6px 8px`; `xs`; 300ms delay,
  150ms fade; `z-tooltip`. Rich metadata/feature cards are Panels, not tooltips. All
  react-tooltip theming via CSS class, never inline objects.
- **Badges — ONE component** (kills ≥9 pill styles): radius `--ls-radius-1`, padding `2px 8px`,
  `xs` 500. Semantic variants: bg = 12% color-mix of semantic base over panel, text = matching
  `--text-color-text-*`, optional 1px `border-1`. **Mono chip variant** for machine facts:
  Mono `2xs` 500 uppercase — `HDF5`, `LANCE`, run IDs, status chips `RUN/OK/ERR/DEAD`.
  **IndexCircle replacement**: 20px mono chip, 1px `border-3`, radius-1; selected = amber
  border + amber text. Tag chips: secondary badge; selected = amber wash + amber text (no
  border-width shifts).
- **Status diodes**: 8px circle, radius-round, bg `--color-status-*`, `box-shadow: inset 0 0 0
  1px rgba(0,0,0,0.15)`. Running: + `--ls-glow-status` + 2s opacity pulse. Paired with mono
  `2xs` uppercase label when meaning matters. **StepProgress mapping: done=ready ·
  running=busy(pulse) · pending=offline · failed=critical.**
- **Scrollbars**: 10px; track transparent; thumb `neutral-3`, radius `--ls-radius-1`,
  `border: 2px solid transparent; background-clip: content-box`; one global rule. Add
  `scrollbar-gutter: stable` on dense scroll containers.
- **Console primitive `.ls-console`** (springgreen dies): bg `--ls-surface-console` both
  modes, text `--ls-console-text` Mono `xs`/1.6, radius 6px, 1px `--ls-console-border`,
  padding `--ls-space-3`. Collapse/expand via `grid-template-rows 0fr↔1fr` 250ms (never
  `height`). Timestamps `--ls-console-text-dim`; errors `#e89c90`.
- **Progress**: 4px track `neutral-2`, amber fill, radius 2px, determinate via `transform:
  scaleX` 200ms; indeterminate 1.2s sweep. Job rows: status chip + mono elapsed `T+00:42`;
  Kill = destructive small, Rerun = secondary small, Dismiss = ghost (emoji buttons die).
- **Loading/empty**: one `Spinner` (20px / 14px inline, 2px `border-2` ring + amber arc,
  800ms); scrims `--ls-scrim` + spinner + mono `2xs` uppercase line (`LOADING SCOPE…`).
  Skeletons: `neutral-2`, radius-1, shared 1.5s `ls-pulse`. Empty states: mono overline +
  `sm` `text-subtle` explanation + secondary button. No emoji, no illustrations.
- **Readout primitive `.ls-readout`** (+ optional `<Readout label value>` component): the
  enforcement vehicle for telemetry — mono `2xs` uppercase label + mono value, tabular-nums.

## 6. Motion

150ms hover/color/focus · 200ms dropdowns/modals/tab underline · 250ms drawer/sheet/console/
atlas crossfade. Easings `--ls-ease-out` / `--ls-ease-in-out`. Animate only `opacity`,
`transform`, `color`, `background-color`, `border-color`, `grid-template-rows 0fr↔1fr`.
**Banned:** `height`, `width`, `padding`, `margin`, `top/left`. State-conveying only — no
entrance choreography, no staggers. **Exempt continuous state-display loops** (the only
exception to the 150–250ms envelope): spinner 800ms, indeterminate sweep 1.2s, skeleton
1.5s, diode pulse 2s. `prefers-reduced-motion`: durations → 1ms, pulses freeze (diodes hold
steady-on), spinners keep rotating (state-necessary). Data-space camera moves (zoomToPoints,
transition-morph) are data motion, out of chrome scope.

## 7. Signature details — exactly three

1. **Viewport reticle ticks.** Four 12×12px corner L-marks (1px, `--ls-color-crosshair` via
   `border-2`-toned stroke) inset 8px in map viewports (VisualizationPane, Compare panes,
   Preview map, TilePlot preview). Selection/lasso active → amber (150ms). One
   `pointer-events:none` overlay div, 4 spans with 2-side borders, `z-hud`.
   **If a screen has no map, it has no reticle.**
2. **Mono telemetry readouts.** Bottom-left HUD line in the map viewport — `x −3.412 y 12.007
   · 8,421/120,000 PTS · 3.2×` — mono `2xs` `text-subtle` tabular-nums, text-swap only. Same
   voice for run IDs, metric chips, byte sizes, panel counts, ScopeHeader plate.
3. **Status-diode light language.** The diode is the ONLY element that glows or pulses.
   Never on links, tabs, badges without live state; max one pulsing diode per panel.

**Glow discipline (auditable):** no glowing text, no glowing buttons, no glowing borders.

## 8. What dies (grep list)

Orbitron · Roboto · Courier stacks · `lightsalmon`/`salmon`/`slateblue` · `#646cff/#535bf2/
#747bff/#213547` · `h1 3.2em` · index.scss dark ramp `#1A1A1A/#2A2A2A/#3A3A3A/#4A4A4A` +
borders `#333/#404040/#4D4D4D` · `seagreen` · `#4488ff` · `#2ecc71` · `#5cb85c` dup ·
`#4CAF50` · `#2196F3` · `#1e3a5f` · `#e3f2fd/#1976d2` · `#6366f1` · `#3498db` · `springgreen`
· `rgba(40,90,200,…)` · copper satellites `#D3965E/#d9a778/#a36022/rgb(212,178,151)` · indigo
overlay `rgba(23,10,122,…)` · `#E8EFFD` · Bootstrap alert hexes `#f8d7da/#721c24/#fff3cd/
#856404/#d1ecf1/#0c5460/#d4edda/#155724` · warning zoo `red`/`salmon`/`lightpink+coral` ·
emoji as UI (👍💀🤬🔁✅◻️🗑️✏️🤔⚙️👉❌💾 incl. CSS `::before`) · 56px pills · `!important`
warfare (~50 declarations) · `outline: none` without replacement · height/padding animation ·
`top:-200` hacks · `z-index: 9999` · duplicated keyframes · unitless font tokens · "regular"
= 500 · 4px side-stripe accents on rounded cards · dead code named in the inventory brief.

## 9. Hard constraints (unchanged from inventory)

Forge token names frozen (values only) · data-viz colors (d3 scales, point palettes, hulls
passed as data props) out of scope · map plot layers stay DOM-ordered with NO z-index +
`pointer-events:none` overlays · Escape capture in lightbox · Setup `overflow:hidden` +
`min-height:0` scroll chains · react-tooltip global `.tooltip-area/.tooltip-content` ·
SettingsModal renders Settings page inside a modal (style for both containers) · Progress
polls at 200–500ms (cheap paints only).
