# Annealage style

The shared look of the Annealage product web UIs (Mesh, Loom, Trace): design tokens, the Workbench theme, fonts, icons and the product marks. Each product pulls this repo in as a `lib/style` submodule and serves it from its own static tree.

## What's here

- `tokens.css`: colours, type and sizes. Light and dark follow the OS through `light-dark()`, and `<html data-theme="light|dark">` forces one. `<html data-product="mesh|loom|trace">` picks the product's temper colour, and the chrome greys lean slightly towards it.
- `theme.css`: the Workbench layout. That's the title bar, tool rail, view with document tabs, an inspector with Review and Timeline tabs, the agent console and the status bar. It also styles the agent chat that annealage-agent's `chat.js` and `settings.js` build, through the ids and classes that layer already uses.
- `icons.svg`: a sprite of 20px stroke icons, used as `<svg class="ico"><use href="icons.svg#i-pin"/></svg>`.
- `fonts/`: Chivo and Chivo Mono (latin and latin-ext), under the SIL Open Font License in `fonts/OFL.txt`.
- `marks/`: the parent mark and the product marks, each with a `-dark` variant. These are exported from the brand repo, and they're used as they are.
- `demo.html`: a static reference page with every part of the theme on it. Serve the repo root and open it; the query string picks `?product=`, `?theme=`, `?side=timeline`, `?preview=1`, `?working=1` and `?banner=1`.

## Using it in a product

Link the stylesheets in this order: `tokens.css`, the agent layer's `agent.css`, `theme.css`, then the product's own stylesheet. Put `data-product` on `<html>`.

The page supplies the frame markup (`.wb` and its children, see `demo.html`), the chat's header, a `.side` wrapper round `.chathint`, `#chatPending` and `#chatComposer`, and a `.working` indicator in the chat header. chat.js keeps these attributes on `#chat`, and theme.css and the page react to them:
- `data-working` while a turn runs
- `data-turn-started` (epoch ms)
- `data-pending` (the number of open approvals)

Canvas and WebGL code that needs a token colour should resolve it through an element rather than read the custom property. `getComputedStyle(root).getPropertyValue('--pin')` returns the unresolved `light-dark(...)` text. Instead, set `probe.style.color = 'var(--pin)'` on a hidden element and read `getComputedStyle(probe).color`. Redraw when `matchMedia('(prefers-color-scheme: dark)')` changes.

Ember (`#E8632A`) means "the agent needs you". It's the pending approval's Allow button (`.pactions button.allow`) and the status-bar `.alert`, and nothing else on the page uses it.

## Licence

The CSS, JS and icons are under the PolyForm Noncommercial License 1.0.0 (`LICENSE`), the same as the products. The fonts are OFL (`fonts/OFL.txt`). The marks are Annealage trademarks and aren't licensed for other use.
