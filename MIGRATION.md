# Moving a product to Hairline + plate

This is what changes for a product that vendors this repo as `lib/style` and was built on the Workbench theme (the `main` branch before `hairline`). The library is on style `main` (Q1, merged 2026-11-11), and a product pins a `main` SHA with `scripts/bump-style.sh` (template: `tools/bump-style.sh`); there is no `hairline` branch to pin.

Most class and id names are unchanged, so most markup keeps working and only looks different. What needs hands is listed here: renamed tokens, the frame's new shape, the things that were boxes and aren't any more, and each product's own stylesheet where it overrode the old look.

## Link order and files

Settled rule 6:

| Slot | File | Notes |
|---|---|---|
| 1 | `scheme.js` | A blocking classic script in `<head>`, first. A page that also needs `hosted-fetch.js` (Loom) keeps it before the page's own module. |
| 2 | `tokens.css` | Now holds the `@font-face` rules. |
| 3 | ember `agent.css` | Only on a page with the agent pane. Trace and the hosted pages link none. |
| 3a | ember `agent-page.css` | Only the chat-only page `render_agent_page` builds (Canvas's `/chat`), after `agent.css`: the page shell, no paint. |
| 3b | ember `project.css` | Has no rules; the theme draws the project views. |
| 4 | `theme.css` | |
| 5 | `pages.css` | Only a page outside the workbench frame, and a workbench whose views use `.card` (Trace). |
| 6 | the viewer's `board.css` | Loom links it after the theme; it holds only what the theme lacks. |
| 7 | the product's CSS | |

Scripts, each a classic script at the end of `<body>` unless noted (`confirm.js` is an ES module, see below): `frame.js` (layout focus, Panel button, phone tab bar, column resizers; it replaced ember's `layout.js`), `palette.js` (the command palette behind `.cmd`, S12), `account.js` (the account menu and product switch of a title bar, for a page served by hosted, R4), `confirm.js` (an ES module: `export function confirmRow`, the inline confirm row instead of the browser's `confirm()`; load it with `<script type="module">` or `import()`, and the product serves it like the other runtime files). `runtime-files.txt` lists what a product serves and ships; the docs, `demo/` and `tools/` are not in it.

| Before | Now |
|---|---|
| `scheme.js`, `tokens.css`, `agent.css`, `theme.css`, product CSS | the order above |
| `@font-face` in `theme.css` | `@font-face` in `tokens.css` |
| `demo.html`, `demo.css`, `demo.js` | `demo/components.html`, `workbench.html`, `flow.html`, `list.html`, `settings.html` |

A page that used `.page`, `.pagebody`, `.card`, `.drop`, `.linkrow`, `.pageacts` or `.lede` now needs `pages.css`; those rules moved out of `theme.css`.

A build step that copies named files out of `lib/style` (Canvas's Vite config does) must add `pages.css` if it uses it. A step that copies whole directories (`fonts`, `marks`) needs no change for the new font files, but any test or script naming a font file (`chivo-latin-400-normal.woff2`) does. Serving the whole repo at `/style/` exposes `GUIDE.md`, `demo/` and `tools/`: serve or copy only `runtime-files.txt`.

## Fonts

Chivo and Chivo Mono are gone. The interface is Instrument Sans (400, 500, 600) and data is Red Hat Mono (400, 500). There is no 700: anything that asked for `font-weight: 700` now gets 600.

- `--font` is renamed `--sans`. `--mono` keeps its name.
- The base size is still 13px; line height is now 18px. Reading text in the agent log is 14px/21px.
- Mono is for data only. A label set in `var(--mono)` should move to the sans.
- Anything that hard-codes `'Chivo'` (a generated report's stylesheet, an embedded page that copies token values) needs the new family and its own copy of the files.

## Tokens

The greys no longer lean towards the product. Every `data-product` block now sets the temper tokens and nothing else, and there is a `pod` block.

| Old | New | Notes |
|---|---|---|
| `--chrome` | `--ground` | Bars are the page ground now; there is no chrome band. |
| `--panel` | `--ground` | Panes too. |
| `--view` | `--ground` for a page, `--well` for a drawing's surround | The canvas behind a sheet or a scene is `--well`. |
| `--field` | `--field` | Same name. Now clearly above ground in dark (`#1E2226`). |
| `--rule` | `--rule` | |
| `--rule-2` | `--rule-strong` | |
| `--code` | `--hover` for inline code, `--field` for a block, `--well` for a log tail | |
| `--hover` | `--hover` | New beside it: `--press`. |
| `--font` | `--sans` | |
| `--r` (3px) | `--r` (6px) | Also `--r-sm` 4px, `--r-xs` 2px. Panes have no radius. |
| `--ctl` | `--ctl` | Still 28px. New: `--ctl-sm` 24px. |
| `--temper` | `--temper` | Same hexes for loom, trace, mesh, canvas. With no product it is now ink, not `#5F686C`. Use it for fills only. |
| `--temper-text` | `--temper-text` | Now draws every temper line (tab underline, focus ring, working line). |
| `--temper-wash` | `--temper-wash` | Was an opaque hex, now a translucent `rgba()`. It can't hide what is under it; composite it if a canvas needs an opaque colour. |
| `--on-callout` | `--on-callout` | Now `var(--on-temper)`: white on loom and trace, ink on mesh, canvas and pod. |
| `--on-pin` | `--on-pin` | Now `var(--ground)`. |
| `--mv-edge`, `--mv-grid`, `--mv-grid-2` | same names | Retuned for a scene drawn on `--well`. `--mv-part-1` to `-8` are unchanged. |
| `--ink`, `--ink-2`, `--ink-3` | same names | `--ink-2` and `--ink-3` are slightly different greys. `--ink-3` must not sit on a wash or a pressed tone; the theme steps it up there. |
| `--ember`, `--on-ember`, `--quench`, `--danger`, `--warn`, `--sheet-danger`, `--sheet-warn`, `--pin`, `--pin-selected`, `--callout`, `--measure`, `--mono` | unchanged | |

New tokens: `--mv-axis-x`, `--mv-axis-y`, `--mv-axis-z`, `--sketch`, `--sketch-halo`, `--syn-keyword`, `--syn-def`, `--syn-meta`, `--syn-comment`, `--syn-string`, `--syn-number`, `--syn-invalid` (scene axes, the sketch stroke and its casing, source highlighting), `--well`, `--press`, `--paper`, `--paper-under`, `--paper-ink`, `--on-temper`, `--focus`, `--shadow-menu`, `--cut`, the type scale (`--fs-micro`, `--fs-small`, `--fs-ui`, `--fs-read`, `--fs-title`, `--fs-figure`, `--lh-ui`, `--lh-read`, `--lh-title`), the heights (`--h-bar` 40, `--h-tabs` 34, `--h-pane` 36, `--h-row` 36, `--h-status` 24), `--gutter` 40 and the spacing steps `--s-1` to `--s-5` (4, 8, 12, 16, 24).

Gone with no replacement: `--console-h` (the agent pane is a column now; see below).

## The frame

The old frame docked the agent console under the view. The new one puts the agent pane in a column of its own at the right, beside the inspector, and allows two chrome rows above the drawing.

```
title   title   title   title          40px
tabs    tabs    tabs    tabs           34px   (only if .vhead is a child of .wb)
rail    view    insp    chat
status  status  status  status         24px
```

- **`.vhead` moves out of `.view`** to be a direct child of `.wb`, so the view tabs span the window. Left inside `.view` it still works and heads that column only.
- **Widths** are `--insp-w` (300px) and `--chat-w` (400px) on `.wb`. A product that set `--console-h`, or its own `--agent-width` or `--review-height`, should set these.
- **The rail** is 40px wide with 28px tools (was 44px and 34px). `<hr>` in a rail is now a gap, not a line.
- **`.view`** is a flex column on `--well`: optional `.vhead`, `.previewbar`, then `.canvas`, then `.subtabs`. A product that overrode `.view`'s `grid-template-rows` should delete that.
- **`.subtabs`** are small text on the well with a temper underline. Cursor and zoom readouts can sit in a `.right` group inside it.
- **`.hud`** has no plate behind it; it is second-level ink straight on the well. New corners: `.hud--tr`, `.hud--br`.
- **Layout focus** is new: `data-layout="drawing|split|agent"` on `.wb`, driven by a three-icon `.seg` in the title bar.
- **`#chat`** is a flex column: header, banner, log, then `.side` (hint, pending approval, composer) at the bottom. `.side` used to be a right-hand column of the docked console.
- **`.console`** (Trace's run) takes the same column; `.cbody` stacks the steps over the log.
- **The status bar** has gaps between items, no divider lines. Wrap a label in `.k` and a value in `<b>`.
- **Phone** (900px and below) is as before: one pane at a time from `#tabbar`, now through `frame.js` (annealage-ember's `layout.js` is gone; the tab bar is `role="tablist"` with `aria-selected` tabs, each `button[data-tab][data-target]`). `frame.js` also drives the layout focus and the Panel button. A `.vhead` that is a child of `.wb` hides with the view.

### Title bar

`.titlebar`, `.mark`, `.prod`, `.tsep`, `.doc` and `.tb-right` keep their names. New:

- Wrap the left-hand items in `.tb-left` to centre a command field `.cmd` between it and `.tb-right`.
- `.mark` is now a 40px column of its own (so the product name lines up with the first tab and the drawing's edge). Put the class on the `<picture>` or on a link round it.
- `.crumbs` for "Projects / name" with a Rename pencil; `.stageline` with a `.stagebar` for a staged job; `.prodtabs` for the product switch on platform pages.
- `.cmd` is the command field, on workbench and flow pages only. List, account and chooser pages do not draw it: their title bar carries the product name and the account area. `palette.js` makes it work; each product registers its own commands.
- `.conn` shows a square lamp. In the title bar it no longer needs extra padding rules.
- The account menu (R4): a page served by hosted puts `<span class="menuwrap" data-account-menu hidden></span>` last in `.tb-right` and loads `account.js` (README "The account menu"). From 901px up the bar gives room in this order, so the menu is never off screen: the command field shrinks to 200px and drops its key under 1440px, the stage line goes under 1360px, the menu's name goes under 1000px (and at 640px and below), then the crumbs and `.doc` label end in an ellipsis. A product's own bar rules must not undo that (`min-width: max-content` on `.tb-left`, a fixed `.cmd` width).

### A control that cannot act

Show it disabled with a `title` saying why, not hidden and not left clickable (`.btn:disabled` or `[aria-disabled="true"]`; `components.html` has the specimens). Owner-only actions in a view-only session, a write without a grant, a feature whose backend is not built (the datasheet's Open PDF) and an unmet precondition are all this case. Owner-only data may stay absent, and so may a control whose mere presence tells the user something they must not learn (an administrator surface for someone who is not one). The ports apply it; the reference pages draw it.

## Scheme toggle

`scheme.js` keeps its API, its `annealage.scheme` storage key and its `schemechange` event. Nothing that listens to it changes.

The button is one icon:

```html
<button class="btn icon" type="button" data-scheme-toggle aria-label="Colours"><svg class="ico"><use href="style/icons.svg#i-auto"/></svg></button>
```

`scheme.js` swaps the `<use>` to `i-auto`, `i-sun` or `i-moon`. The earlier markup, three `<svg data-for="system|light|dark">`, is no longer drawn: replace it with the one icon. `i-monitor` is still in the sprite.

## Icons

The sprite is redrawn on a 16px grid with round caps and joins (was 20px, square). Every earlier id is still there. `.ico` is still 16px; `.tool .ico` is now 16px too (was 18px). An icon drawn by hand to match the old set, with `stroke-linejoin: miter`, will look out of place.

New ids: `i-auto`, `i-check`, `i-chev-d`, `i-fullscreen`, `i-grid`, `i-list`, `i-lay-drawing`, `i-lay-split`, `i-lay-agent`, `i-minus`, `i-more`, `i-open`, `i-pencil`, `i-plus`, `i-redo`, `i-review`, `i-sort`, `i-undo`.

## Classes

Same name, new look, no markup change needed:

`.btn.quiet` `.btn.primary` `.btn.danger` `.btn.icon` `.btn.sm` `.input` `.check` `.seg` `.chips` `.chip` `.fields` `.vtab` `.subtab` `.tool` `.inspector` `.ihead` `.ptabs` `.ipane` `.iscroll` `.toggles` `.sec` `.secbody` `.ifoot` `.vpanel` `.layerlist` `.layerrow` `.slider` `.query` `.results` `.hit` `.propshead` `table.props` `.linkish` `.empty` `.hint` `.subhead` `.metaline` `.previewbar` `.statusbar` `.alert` `.console` `.chead` `.cbody` `.steps` `.step` `.log` `.meter` `.filters` `.frow` `.finding` `.fhead` `.fid` `.fstat` `.claim` `.subj` `.fbody` `.evidence` `.covcounts` `.covlist` `.dtable` `.state` and everything annealage-ember generates.

Same name, but check the markup or the product's overrides:

| Class | What changed |
|---|---|
| `.btn` | No border and no fill: a plain `.btn` is a text button. There is no outlined variant. One `.btn.primary` (solid ink) per view. |
| checkboxes, radios | Drawn by the theme wherever they are (square, solid ink when on). `accent-color` is no longer used, so a product rule that set it does nothing. A toggle is `input.switch`. |
| `.chip` | No border; a pressed chip takes the press tone (`aria-pressed=true`, or `aria-current` on a chip that is a link). In a `.pagehead` the chips sit in the title row. |
| `.n` | A quiet mono number, not a rounded badge. |
| `.tag` | Quiet text, not an outlined box. |
| `.mk--human` | A plate marker (a square with one corner cut), not a round badge. `.mk` alone is the same. |
| `.mk--agent` | An outlined plate marker, 18px square (was a 26 by 19 temper octagon). |
| `.mk--sev`, `.mk--defect`, `.mk--warning` | Square lamps. |
| `.row` | The marker column is 18px (was 28px). The selected row takes the wash with no side rule. A line of facts can be a `.rhead` (`.ref`, `.who`, `.xy`) in place of a `dl.fields`. |
| `.note` | Quiet text. No left rule, no fill. |
| `.notice`, `.notice--warn`, `--danger`, `--ok` | A message row with a square lamp, not a bordered box with a left rule. Don't nest block layout in it; wrap rich content in one child element. |
| `.eq` | No left rule. |
| `.sev` | A lamp and a word. Critical is no longer a filled badge. |
| `.ftri`, `.fver`, `.fstale` | Words beside the status, not boxed tags. |
| SVG `.pin .dot` | Draw it as a chamfered path, not a circle: `M-9-9H4L9-4V9H-9Z` for an 18-unit marker, scaled to suit. `.pin.model` is now outlined (paper fill, ink stroke), not a temper fill. The selected pin is `.is-selected` or `aria-pressed=true`. |
| `.card` | A ruled section with a heading row. No border, no fill, no header band. In `pages.css`. |
| `.pagebody` | Starts at the 40px gutter and runs the full width. It is no longer an 880px centred column, and `h1` is 18px. Use `.measure` for text that should not run wide. |
| `.drop` | Wide and short (76px), not a 180px box. `.dropstrip` is the slim one above a list. |
| `.hdrbtn` | A text button. |
| `.chatbanner`, `.setwarn` | Message rows with a lamp. |
| `.permcard` | Still the bordered box. Its "Approval needed" heading and the Tool and Input labels are drawn by the theme. |
| `.msg` | No name gutter. Your messages sit on a faint row under `--chat-you`; the agent's text has no label. |
| `.toolcard` | A mono line with a chevron; no left rule. Its input and result have Input and Result labels drawn by the theme. |
| `.working .bar` | The 2px temper line along the pane header's bottom edge, not a 56px bar. |

Removed:

| Old | Use |
|---|---|
| outlined `.btn` look | `.btn` (text) or `.btn.primary` |
| `.tb-right .btn[aria-pressed=true]` bold rule | the held state is the press tone |
| `box-shadow: inset 2px 0 0 var(--temper)` on a selected row, tool or finding | the temper wash alone |
| `.statusbar > *` divider borders, `.push` border | gaps |

New, with no earlier equivalent: `.lamp`, `.readout` and `.val`, `.pline`, `.paper`, `.menuwrap` and `.menu`, `.disc`, `dl.fl` (and `dl.fl.form`), `.inlineform`, `.tree`, `.dt` (the selectable table), `.hpin`, `.rhead`, `.cmd`, `.crumbs`, `.stageline`, `.prodtabs`, `.vsep`, `.vtab.second`, `.zoom`, and everything in `pages.css` beyond the five names above.

Newly covered from annealage-ember, which the old theme left to `agent.css`: `details.thinking`, `details.toolgroup`, `.turnerrors`, `.chathistory`, `.contextchip`, `.author`, `.setrow`, `.setmodels`, `.loginflow`, `details.more`, `#toast`, `#err` and every `pj-*` class of `project.js`. The theme now lays the whole pane out itself, so a page still links `agent.css` first but no longer depends on it.
