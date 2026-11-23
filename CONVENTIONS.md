# Card order prototype — markup conventions

Plain HTML + CSS, no frameworks, no Tailwind, no external libraries. The prototype is a
single `index.html` assembled by `build.py` from `shell.html` + every file in `parts/`.

## Phone and shell

- Every screen is a 375 × 812 iPhone frame. The shell (`shell.html`) already draws:
  - the iOS status bar (top 44 px, clock "12:12", signal/wifi/battery) — DO NOT draw it;
  - the home indicator (bottom 34 px zone) — DO NOT draw it;
  - the dimmed backdrop behind bottom sheets — DO NOT draw it;
  - transitions, navigation, the settings menu.
- Keep all other geometry exactly as in Figma: a page's content still starts at y = 44
  (leave the status-bar area empty, same background as the screen).

## Part files

One file per group: `parts/<group>.html`. It contains:

1. One `<style>` block with all CSS for the group. Every selector MUST be scoped with the
   screen root class (`.scr--<id> …` or `.sheet--<id> …`) so groups never clash.
   Shared fragments use their own prefix (e.g. `.cb-…`).
2. One `<template>` per screen or state:

```html
<template data-screen="phone" data-kind="page" data-title="Mobile number">
  <div class="scr scr--phone"> … </div>
</template>

<template data-screen="currency" data-kind="sheet" data-title="Currency selection">
  <div class="sheet sheet--currency"> … </div>
</template>
```

- `data-kind="page"`: root `<div class="scr scr--<id>">`. The shell gives `.scr` position:absolute,
  inset:0, 375×812, overflow:hidden. If the content is taller than 812, put it in a child
  `.scr__scroll` (the shell gives it `position:absolute; inset:0; overflow-y:auto`), and put
  fixed elements (nav bars, tab bars, bottom buttons) outside it as absolutely positioned siblings.
- `data-kind="sheet"`: root `<div class="sheet sheet--<id>">` = only the white sheet itself
  (rounded top corners + grabber as in Figma), width 375, height auto. The shell pins it to
  the bottom and slides it up. If the sheet is taller than ~770 px, make the root
  `display:flex; flex-direction:column; max-height:770px`, scroll the middle (`.sheet__scroll`,
  `overflow-y:auto; flex:1`) and keep the bottom button area fixed.
- `data-kind="fragment"`: a reusable snippet the shell clones into other screens.
- Alternative states of a screen (errors, filled, edit mode…) are separate templates named
  `<id>__<state>`, e.g. `phone__edit`, `phone__error`. Same kind as the base. Give each a
  human `data-title` (Russian is fine, e.g. `data-title="Ошибка: неверный номер"`), the
  settings menu lists them.
- Screen ids are given in your brief — use them exactly.

## Interaction hooks (the shell handles these by event delegation)

| attribute | meaning |
|---|---|
| `data-go="<id>"` | navigate to page `<id>` (push) or open sheet `<id>` |
| `data-action="back"` | go back one step (chevron "‹" top-left) |
| `data-action="close"` | close the top sheet (✕ on sheets) |
| `data-action="<name>"` | named action from your brief (the shell implements it) |
| `data-toggle="<class>"` | toggles `<class>` on the screen/sheet root (switches, checkboxes) |
| `data-key="0".."9" / "del"` | numeric keypad keys |
| `data-slot="<name>"` | an element the shell fills or reads (texts, images, inputs) |

Make every tappable thing a `<button type="button">` (reset its styles) or give it the hook
attribute; add `cursor:pointer`. Switches: render on/off by a class on the root
(e.g. `.is-referral .x-switch {…on…}`).

Inputs that the user types into should be real `<input>` elements styled like Figma.
Static iOS QWERTY keyboards: render them from the Figma design (component or image) and show
them only while an input in that screen has focus (`.scr--x:focus-within .kb{display:block}`),
unless your brief says otherwise.

## Visual fidelity

- Implement from `get_design_context` output (follow the figma-design-to-code skill).
  Translate React+Tailwind into plain CSS: exact sizes, paddings, radii, colours, shadows,
  font sizes, weights, line heights, letter spacing.
- Fonts: `font-family: var(--font)` (shell defines SF Pro Display → system fallbacks).
  SF Pro Display Medium = 500, Semibold = 600, Bold = 700, Regular = 400.
- Assets: download every image/SVG from the design-context URLs with `curl -L` into
  `assets/<group>/` with descriptive file names, and reference them as
  `assets/<group>/<file>` (path relative to the project root, where index.html lives).
  Never leave figma.com URLs in the markup. Never use Figma screenshots as assets.
- Card artwork: use the product skins already in `assets/skins/`
  (`cashback.svg`, `miles.svg`, `star.svg`, `platinum.svg`, 124×88 viewBox, scale freely;
  round the corners in CSS as in Figma). They replace the old card skins in the flow file.
  Mapping: Birbank Cashback → cashback, Birbank Miles → miles, Birbank Star → star,
  Birbank Platinum → platinum, Birbank Platinum Miles → miles.
  Put payment-system logos (VISA / Mastercard) and last-4 labels on top as in the design.

## Preview / check your work

```
python3 build.py --only <group>      # writes preview-<group>.html at the project root
```

Open `preview-<group>.html#<screen-id>` (file:// URL) in a browser tab of your own to check
a screen; the shell renders it directly (sheets over a grey backdrop). Do not edit `shell.html`,
`build.py` or other groups' part files.
