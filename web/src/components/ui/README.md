# Amber Console primitives

Utility classes live in `web/src/styles/primitives.scss` (imported once in `App.jsx` — do not re-import). Components here are thin wrappers. All values are tokens; never add `!important` on top of these.

## Components (import from `@/components/ui` or `./components/ui`)

```jsx
import { StatusDiode, Badge, Spinner, Pagination, Readout } from '@/components/ui';
```

- `<StatusDiode status="ready|busy|offline|critical" pulse label="RUNNING" />` — 8px diode, optional mono label. Pulse ONLY for live/running state; max one pulsing diode per panel. StepProgress mapping: done=ready, running=busy+pulse, pending=offline, failed=critical.
- `<Badge variant="critical|info|success|warning|neutral" mono selected>OK</Badge>` — the ONE badge. `mono` = machine-fact chip (mono 2xs uppercase: `HDF5`, `RUN`, `ERR`, run IDs). `selected` = amber wash (tag chips).
- `<Spinner size="md|sm" label="LOADING SCOPE…" />` — 20px (sm=14px inline). Label renders mono uppercase status line.
- `<Pagination page={3} totalPages={128} onPage={(p) => …} />` — 1-indexed; first/prev/next/last icon buttons + mono `PAGE 3 / 128` readout.
- `<Readout label="PTS" value="8,421/120,000" />` — mono telemetry pair.

## Classes

### Tabs — `.ls-tab` (THE tab; delete local tab CSS)
`<button className="ls-tab ls-tab--active">Clusters <span className="ls-tab__count">42</span></button>`
Active = `.ls-tab--active` or `aria-selected="true"`. Never remove focus outline — the primitive handles focus-visible.

### Badges — `.ls-badge` / `.ls-chip`
- `.ls-badge` base (secondary look) + `.ls-badge--critical|info|success|warning|neutral` semantic washes + `.ls-badge--selected` (amber wash, no border-width shift).
- `.ls-chip` standalone mono chip; combine with variants: `class="ls-chip ls-badge--success"`.
- `.ls-chip ls-chip--index` — 20px square IndexCircle replacement; add `.ls-badge--selected` for the amber-selected state.

### Icon button — `.ls-icon-btn`
28×28 ghost button, expects a 16px `<svg>` child (stroke `currentColor`). Replaces all 30×30 `!important` skins and `scale(0.6)` hacks.

### Console — `.ls-console` (dark in BOTH modes; replaces springgreen/#111)
```html
<pre class="ls-console">
  <span class="ls-console__line"><span class="ls-console__time">12:04:01</span> embedding…</span>
  <span class="ls-console__line ls-console__line--error">FAILED …</span>
</pre>
```
Collapse/expand (never animate height):
```html
<div class="ls-console-collapse [ls-console-collapse--collapsed]">
  <div class="ls-console-collapse__inner"><pre class="ls-console">…</pre></div>
</div>
```

### Readout / overline
- `.ls-readout` > `.ls-readout__label` + `.ls-readout__value` (what `<Readout>` renders).
- `.ls-overline` — mono micro-label (2xs 500 uppercase tracked) for panel eyebrows, modal headers, empty states.

### Select — `.ls-select`
Put directly on a raw `<select>`: input box + data-URI chevron, hover/focus/disabled included. (react-select keeps using `SelectStyles.jsx`; forge Select stays forge.)

### Tables — `.ls-rdg`
Wrap the react-data-grid container: `<div className="ls-rdg"><DataGrid … /></div>`. Themes via rdg's `--rdg-*` custom properties (header, rows, hover, selected = amber wash) with zero `!important`. Extras:
- Numeric columns: `cellClass="ls-rdg-cell--num"` (mono xs tabular, right-aligned).
- Heights are rdg props, not CSS: `headerRowHeight={32}` `rowHeight={32}` (48 with images).
- Delete legacy global `.rdg-*` `!important` overrides once wrapped.

### Loading — `.ls-spinner` / `.ls-loading` / `.ls-scrim` / `.ls-skeleton`
- `.ls-spinner` (+ `.ls-spinner--sm`) — the ONE spinner.
- `.ls-loading` — column stack of spinner + `.ls-loading__status` mono line.
- `.ls-scrim` — absolute inset-0 veil (`--ls-scrim` bg); parent needs `position: relative`. Put a spinner + `.ls-scrim__status` inside.
- `.ls-skeleton` — pulsing placeholder block (size it at the call site); shared `@keyframes ls-pulse`.

### Status diodes — `.ls-diode`
`<span class="ls-diode ls-diode--busy ls-diode--pulse" />` — modifiers `--ready|--busy|--offline|--critical`, `--pulse` (2s pulse + glow in dark). Custom color via `--ls-diode-color`. `.ls-status` + `.ls-status__label` pair diode with a mono label. The diode is the ONLY glowing/pulsing element in the app.

### Panels — `.ls-panel`
Base panel chrome (panel bg, hairline border, radius-2, space-4 padding). `.ls-panel--floating` for over-the-map HUD surfaces (95% opaque, border-2, shadow-2, radius-3, z-hud — no backdrop blur). Optional `.ls-panel__header` (+ `.ls-overline`) and `.ls-panel__title`.

### Tooltip — `.ls-tooltip`
react-tooltip theming: `<Tooltip className="ls-tooltip" delayShow={300} … />`. Inverse surface, radius-1, xs, z-tooltip. Kills every inline `style={{ backgroundColor: '#D3965E' }}` object — never pass inline style to Tooltip.

### Empty state — `.ls-empty`
```html
<div class="ls-empty">
  <span class="ls-overline">NO SCOPES</span>
  <p class="ls-empty__text">Explanation sentence…</p>
  <!-- secondary forge Button -->
</div>
```
No emoji, no illustrations.

## Motion notes
Shared keyframes: `ls-spin` (spinner 800ms), `ls-pulse` (skeleton 1.5s, diode 2s) — do not redeclare local spin/pulse keyframes. `prefers-reduced-motion`: pulses freeze automatically; spinners keep rotating (state-necessary).
