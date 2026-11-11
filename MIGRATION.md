# Moving a product to Hairline + plate

This is what changes for a product that vendors this repo as `lib/style` and was built on the Workbench theme (the `main` branch before `hairline`). The library is on style `main` (Q1, merged 2026-11-11), and a product pins a `main` SHA with `scripts/bump-style.sh` (template: `tools/bump-style.sh`); there is no `hairline` branch to pin. Nothing here has been applied to a product yet.

Most class and id names are unchanged, so most markup keeps working and only looks different. What needs hands is listed here: renamed tokens, the frame's new shape, the things that were boxes and aren't any more, and each product's own stylesheet where it overrode the old look.

## Link order and files

Settled rule 6, and what each page really links today (the per-product sections give every page):

| Slot | File | Notes |
|---|---|---|
| 1 | `scheme.js` | A blocking classic script in `<head>`, first. A page that also needs `hosted-fetch.js` (Loom) keeps it before the page's own module. |
| 2 | `tokens.css` | Now holds the `@font-face` rules. |
| 3 | ember `agent.css` | Only on a page with the agent pane. Trace and the hosted pages link none. |
| 3a | ember `agent-page.css` | Only the chat-only page `render_agent_page` builds (Canvas's `/chat`), after `agent.css`. S7 cuts it to the page shell. |
| 3b | ember `project.css` | Loom links it between `agent.css` and the theme. S8 empties it; X2 deletes it. |
| 4 | `theme.css` | |
| 5 | `pages.css` | Only a page outside the workbench frame, and a workbench whose views use `.card` (Trace). |
| 6 | the viewer's `board.css` | Loom links it after the theme, so it beats the theme at equal specificity: S10 cuts it to what the theme lacks. |
| 7 | the product's CSS | |

Scripts, each a classic script at the end of `<body>` unless noted (`confirm.js` is an ES module, see below): `frame.js` (layout focus, Panel button, phone tab bar, column resizers; replaces ember's `layout.js`), `palette.js` (the command palette behind `.cmd`, S12), `confirm.js` (an ES module: `export function confirmRow`, the inline confirm row instead of the browser's `confirm()`; load it with `<script type="module">` or `import()`, and the product serves it like the other runtime files). `runtime-files.txt` lists what a product serves and ships; the docs, `demo/` and `tools/` are not in it.

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
- **Phone** (900px and below) is as before: one pane at a time from `#tabbar`, now through `frame.js` (annealage-ember's `layout.js` is not needed; the tab bar is `role="tablist"` with `aria-selected` tabs, each `button[data-tab][data-target]`). `frame.js` also drives the layout focus and the Panel button. A `.vhead` that is a child of `.wb` hides with the view.

### Title bar

`.titlebar`, `.mark`, `.prod`, `.tsep`, `.doc` and `.tb-right` keep their names. New:

- Wrap the left-hand items in `.tb-left` to centre a command field `.cmd` between it and `.tb-right`.
- `.mark` is now a 40px column of its own (so the product name lines up with the first tab and the drawing's edge). Put the class on the `<picture>` or on a link round it.
- `.crumbs` for "Projects / name" with a Rename pencil; `.stageline` with a `.stagebar` for a staged job; `.prodtabs` for the product switch on platform pages.
- `.cmd` is the command field, on workbench and flow pages only. List, account and chooser pages do not draw it: their title bar carries the product name and the account area. `palette.js` makes it work (S12); the commands each product registers are still to decide.
- `.conn` shows a square lamp. In the title bar it no longer needs extra padding rules.

### A control that cannot act

Show it disabled with a `title` saying why, not hidden and not left clickable (`.btn:disabled` or `[aria-disabled="true"]`; `components.html` has the specimens). Owner-only actions in a view-only session, a write without a grant, a feature whose backend is not built (the datasheet's Open PDF) and an unmet precondition are all this case. Owner-only data may stay absent, and so may a control whose mere presence tells the user something they must not learn (an administrator surface for someone who is not one). The ports apply it; the reference pages draw it.

## Scheme toggle

`scheme.js` keeps its API, its `annealage.scheme` storage key and its `schemechange` event. Nothing that listens to it changes.

The button can now be one icon:

```html
<button class="btn icon" type="button" data-scheme-toggle aria-label="Colours"><svg class="ico"><use href="style/icons.svg#i-auto"/></svg></button>
```

`scheme.js` swaps the `<use>` to `i-auto`, `i-sun` or `i-moon`. The earlier markup, three `<svg data-for="system|light|dark">`, still works unchanged, so this is optional. `i-monitor` is still in the sprite.

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

## What each product's port has to touch

These lists come from the six surveys in `~/studio/planning/ui-port/20261111_survey-*.md`, which hold the full tables (every token line, every markup site, the guide violations in content, the data gaps and the work units). What follows is the part a port is written from. File and selector come first and the line second, because lines drift; each section is stamped with the product commit its survey read, so a line that no longer matches means the file moved on, not that the claim was wrong.

Rules that apply to every port, from `planning/ui-port/00_context.md`:

- Products pin a style `main` SHA (Q1), with `scripts/bump-style.sh` (the template is `tools/bump-style.sh`), and move no token alias or old-name shim in with it (rule 8).
- Ember is the agent interface only (Q3). The style library owns the look, and any layout the pane and the project views share (`.pj-*`, `#toast`, `#err`, `.chatusage`). A product stylesheet lays out what is particular to that product and restates no colour, radius, font or control shape.
- A control that cannot act is drawn disabled with a `title` saying why, not hidden and not left clickable (rule 11, GUIDE "Words"). That includes owner-only actions in a view-only session, a write without a grant, and anything whose backend does not exist yet.
- A port is not done until it passes the gate in the roadmap: `tools/shot`, `tools/check`, and looking at the running product in light and dark, desktop and phone, beside its reference page.

### Loom (`loom/src/loom/web/static/`, `S/` below)

Read at `loom` feb00d9e23 (`main`). Survey: `20261111_survey-loom.md`.

- **Files.** `page.html` (workbench, 34 scripts, entry `js/main.js`), `front.html` and `js/front.js` (local project list, `loom --projects` only), `css/loom.css` (769 lines), `css/front.css` (80). `src/loom/viewer.py` (a developer KiCanvas browser with its own inline CSS) is not a product surface; decide in or out before a ticket names it. Hosted Loom never serves `front.html`: the hosted chooser and waiting page are `hosted/` surfaces.
- **Link order, as it is.** `page.html`: `scheme.js`, `js/hosted-fetch.js` (a classic script that must stay before `main.js`), `tokens.css`, ember `agent.css`, ember `project.css`, `theme.css`, viewer `board.css`, `css/loom.css`, and an import map (`agent/`, `viewer/`, `three`). `front.html`: `scheme.js`, `tokens.css`, `theme.css`, `css/front.css`, with no `agent.css` although it imports `agent/ui.js`. `lib/style` is served whole at `/style/<path>` by ember's `static_tree`, so after a bump `GUIDE.md`, `demo/` and `tools/` are fetchable too; narrow it. The wheel does not contain `lib/style`, so the web app runs only from a checkout.
- **Tokens.** In `loom.css`: `--rule-2` 19, `--panel` 16, `--view` 4 (`#app`, `#boardStage`, `#boardEmpty`, fullscreen; all become `--well`), `--chrome` 3, `--code` 3, `--font` 2. In `front.css`: `--panel` 1, `--font` 1. In JS: `--view` is read at three call sites in `js/board.js` (460, 467, 922; the board theme is picked by its luminance) and a doc comment in `js/tokens.js`. `tokens.js` itself is generic and names no token. `--console-h` is not used. Outside Loom: `lib/viewer` `board.css` (`--rule-2`) and ember `project.css` (`--panel` with a dark fallback) are fixed by S10 and S8, not here.
- **Frame work.** `.vhead`, `.rail`, `#view` and `#review` sit inside `section#workspace` under a `.workspace-head` row, and the layout focus is its own 44px row (`#workspaceFocus`). All three wrappers go: the title bar, the `.vhead` as a child of `.wb`, then `.rail`, `.view`, `.inspector`, `#chat`. `loom.css` rules that restate the frame: the `.wb` grid, `#workspace`, `#view:has(> .subtabs…)`, `#review` docked under the drawing, `body[data-workspace-mode]` (the new `.wb[data-layout]`, now `frame.js`), the three resizers, the 44px minimums on `.rail .tool`, `.vtab`, `.subtab`, the `#chat` column and `.msg` overrides, the phone block and `body.drawing-fullscreen`. Its own `--agent-width`, `--agent-height`, `--review-height` and `--titlebar-height` give way to `--insp-w` and `--chat-w`; the persisted keys `loom.workspace.wide.v1` and `.narrow.v1` stop being read. The Review inspector moves from under the drawing to the 300px column; check the board's Selection tables at that width.
- **View tabs.** Eleven, not ten: Requirements, Workflow, Circuit, Import (only for a project made from an image), Schematic, Board, History, Cost, Reference, Datasheets, Exports. `views.js` builds them and a `?` help panel per tab; the reference has neither the Import tab nor the help panels.
- **Stage line.** `#projectStage.tag` becomes `.stageline` with a `.stagebar` ("Schematic, 5 of 8"). The data is in `/api/build` (`project.active_stage`, `project.last_checkpoint`); the eight stages are `STAGES` in `src/loom/project.py`, and the product calls stage six "Board layout review" (`board_layout`; hard-coded in `sheet.js` and `front.js`). The reference's tooltip now says the same.
- **Markup that changes shape.** Plain `.btn` as an outlined secondary (every Refresh, Flip, Save, Highlight all, Resolve; Requirements has two primaries in one row). 16 static `.notice` blocks in `page.html` and others built in JS; only `#reqRecovery` nests block content and needs one child wrapper. `.mk mk--sev` is emitted with the extra `mk` class. Callout and finding rows are already `.row`; the change is `dl.fields` to `.rhead` and `.btn.sm` to `.btn.quiet.sm.x`. The status bar needs `.k` labels. `#chat` needs a `.side` wrapper round `#chatPending`, `.chathint` and `#chatComposer`, and the header takes connection and Pause into the chat header's More menu.
- **Sheet overlays.** SVG elements in `svg#overlay` in sheet millimetres, so the smaller change is chamfered SVG paths (`commentPin`, `draftPin` in `dom.js`), not the HTML `.hpin`. Loom has no human comment pins: its pins are the agent's, and its human markers are the speech-bubble `promptMarker` (`prompt.js`), which the library has no shape for. Selection and lint boxes keep their rules with `--temper-text` lines. The sheet takes `.paper`, but the theme's multiply trick is written for `<img>`, not an inline SVG that paints its own `#FDFDF9`; the dark paper is open (survey section 8, item 20).
- **Board.** `lib/viewer` `board.css` redraws `.chips`, `.chip`, `.slider` after the theme with `--rule-2`; the baked KiCanvas themes (`annealage`, `annealage-light`) are chosen by the luminance of `--view`; `board3d` is passed its background. These move with S10 and S11 and Loom's host calls change to `--well`.
- **Project list.** `front.html` is a `.wb` frame with `data-rail="none"`; it becomes a `pages.css` page. Register columns that exist today are name, id, last commit, active work, last checkpoint, build and agent state. Thumbnail, rev, parts and nets need Phase 7 data (R1, R2); until then the thumbnail is an empty placeholder cell with no control, the List / Tiles switch is not offered, and the page keeps one primary (it has two today). The list page draws no command field.
- **Words.** Workflow and Cost keep their ids, hashes and run ids as mono data: they are provenance views (Q8, GUIDE "Words"). Elsewhere, ids and stored file names in labels go. 
- **Not covered by the reference, to decide in a ticket:** Requirements editor, Circuit source view, History, Reference, Datasheets, Exports, the subagent dialog, `?` help, fullscreen mode, and the 44px touch-target rules (phone only, or dropped).
- **Hand-drawn icons** (Undo, Redo, fullscreen) use `i-undo`, `i-redo`, `i-fullscreen`. `component-preview.js` ignores the scheme (`0x20252b`).

### Trace (`trace/src/annealage_trace/static/`)

Read at `trace` f14a822560 (`main`). Survey: `20261111_survey-trace.md`. Trace's own `lib/style` pin is 62c7e0d by a local-path URL, two commits behind `main`; re-point it at the GitHub URL when it is bumped. Trace links no ember static and has no agent pane.

- **Pages.** `workbench.html` (the product and, inside it, `section.setup-page#guidedSetup`, shown for `?view=setup`), `setup.html` and `draft_setup.js` (hosted only, served from the product bundle by the hosted front, not by Trace), `upload.html`, `projects.html`, `admin.html`. The report is generated (`review/report_template/`, `review/report_html.py`).
- **Link order, as it is.** `scheme.js`, `tokens.css`, `theme.css`, `trace.css` on each page, and `trace.css` does `@import url("./viewer/board.css")`. No `agent.css`: there is no pane. `pages.css` is needed on `upload`, `projects`, `setup` and `admin`, and also on `workbench.html`, because Files, Datasheets, Resources, Run details and Runs use `.card`. `setup.html` uses a different path prefix (`./static/style/`) and has no `.page` wrapper. `admin.html` shares nothing with the theme below its title bar and carries an inline `<style>` that a hosted CSP would block, as would the inline import map in `workbench.html`. Hosted's `Containerfile` copies the whole `lib/style` tree into `front-static`, so `demo/`, `tools/` and `GUIDE.md` would ship; narrow it with `runtime-files.txt`. The wheel does not contain `lib/style`.
- **Tokens.** `trace.css`: `--view` 10, `--rule-2` 7, `--panel` 1, `--console-h` 2 (gone). `report.css`: `--view` 14, `--rule-2` 12, `--font` 12, `--code` 4, `--panel` 2. In JS the only read is `tokenColour("--view")` at `board3d-view.js:71` (`--well`); `js/tokens.js` names none. `--temper` used as a line colour becomes `--temper-text`: 17 sites in `trace.css`, 14 in `report.css`.
- **`trace.css`** (310 lines, not 3 to 277 as before): drop the `.wb` override, `.titlebar .doc`, `.inspector .ihead` and `.ptabs`, `.filters .frow`, `.finding .fhead`, `.fbody`, `.pagebody .card` and the whole `.setup-page` block (233 to 310 at the survey, including the `.wb[data-setup=true]` frame overrides). It also has the phone grid, `.review-kind`, `.last-run`, the round `.sheet-marker`, four left-ruled callouts, outlined tags, `.sev[triage]`, `accent-color` and its own focus ring. `.viewtab` is not a view tab: it is the findings list's Issues, Questions, All and History switch (`findings_panel.js`), shared with the report through `finding_view.js`, so it becomes a `.seg` or `.chips` in both places together.
- **Frame work.** `workbench.html` runs `data-console="none"` initially; `trace.js` sets it to `log` for owners, and that console is a one-line "Import log", not a run console. The run console of the reference is built in Phase 2 (below).
- **Guided setup** (`guided_setup.js`, driven from `trace.js`): `.setup-steps` with `is-locked` and `is-done` become `ol.flowsteps` of `li.flowstep[data-state]`; `.setup-footer` becomes `.flowfoot`; the stack of notes and notices becomes one line of help under the title, limits behind `details.disc`. The review step is `guided_setup.js` 264 to 396 (397 to 459 is the shell and footer): the stage choice becomes `.optlist`, the summary `dl.fl.ruled` in a `.flowaside`. The stage names are the reference's.
- **Datasheets** (`datasheets.js`, button row 79 to 105, exemption form to 163, details to 178; the source-choice box, identity form and private-PDF form it opens are in `trace.js`): the row becomes a `.dt` row with one action and a `.menuwrap`; the counts line (242) becomes `.ready` with `.figs` and a `.segbar`. **Open PDF is drawn disabled** with `title="The datasheet file cannot be opened from here yet"` unless T5 finds the PDF is served to the UI.
- **Actions the backend does not have yet are still the target** (Q11, DECIDED: the backend is built first, Phase 2 tickets B0 to B5). The reference keeps drawing: bulk actions by selection in `.dt-bulk` (one common exemption reason for all selected groups), candidate Confirm and Reject, finding Accept and Dismiss, and the run console's step list with its nested dimension rows, "N waiting" counts and skipped rows (B2 records and reports all of them; runs that finished before stay flat). No UI ticket treats them as optional, and none draws them before its backend ticket lands. Confirm and Reject and Accept and Dismiss begin with a design note (B0); if it changes what a row offers, the reference is corrected from that design.
- **Projects page** (`projects.html`, `projects.js`): not a list today. The server refuses to list (`GET /api/projects` answers 404 by design) and access is by capability link. Q12 (DECIDED): Trace gets a browser-only local project list, stored in the browser and never seen by the server (T8), with an opt-in "remember on this device" for capability links; it is drawn as `.reg`. Register columns Trace can fill today: title, revision, parts, nets, review state; the thumbnail is empty until Phase 7. The list page draws no command field.
- **Report.** It does not carry its own fonts: `report_html.py` reads `lib/style/fonts/chivo-*` by file name, so the bump breaks report generation outright, and the `@page` rules hard-code Chivo. The `@font-face` rules now in `tokens.css` would collide with the embedded faces. The report has its own uppercase labels, filled badges, left-ruled callouts and bordered cards (survey 3.6). It is T10.
- **Command field.** In the workbench and flow title bars it is the palette (S12); which commands Trace registers is undecided.
- **Not mentioned before, in scope:** `upload.js` and `intake.js` (intake report), `resources.js`, `datum_pane.js`, `runs_list.js`, `run_details.js`, `context_card.js`, `upgrade_card.js`, `resolution_card.js`, `findings_panel.js`, the sheet and board markers (`board.js` makes `mk mk--agent board-marker`), the title-bar review controls, `hosted.py`'s path rewriting.

### Canvas (`annealage-canvas/studio/`)

Read at `annealage-canvas` b37d5b5d1a (`canvas-product-bundle`). Survey: `20261111_survey-canvas.md`. **The Canvas workbench reference is `demo/workbench.html?product=canvas`, redrawn by C0 for Q26 (a)**: the file tree is the inspector moved to the left (`.wb[data-insp=left]`, no rail), the view is a split of the editor and the screen (`.canvas.split.even` with two `.half` columns and a frame.js handle), the agent column stays at the right, and the phone tab bar is Files, Editor, Screen, Agent. Every Studio state is a `?state=` on that page (the template's comment lists them; `demo/canvas-demo.js` draws them). Compare each Canvas ticket with it. The decisions behind the drawing are in `planning/ui-port/20261112_canvas-frame.md`. Library additions it needed, all in `README.md`: `data-insp=left`, `.half`, the `.vtab` file-tab children (`.vname`, `.dirty`, `.x`), the `.tree` current-row wash and `--tree-in`, `.hpin.cap` and `.hbox`, `.menu.at`, `.half[data-preview]`, `i-panel-l`, and in `frame.js` the left inspector, the split handle and `split()`/`setSplit()`.

- **Surfaces.** The Studio SPA (Vite 8, TypeScript, Lit; `studio/index.html`, `studio/src/**`), served on :5051 by `studio_launcher.py` or by the managed host in `canvas_host/app.py`; the harness viewer, a Python string `VIEWER_HTML` in `annealage_canvas/server.py` frozen into firmware (S2, S2b inside Studio); the agent chat page built by ember's `render_agent_page` in `canvas_host/app.py` (S3); the favicon. `tools/wasm/demo/index.html` is a spike and out of scope.
- **Link order.** Studio: `scheme.js`, `tokens.css`, `theme.css`, an inline `<style>`, then the bundle's `index-*.css`. No `agent.css` (chat is an iframe). The chat page: `scheme.js`, `tokens.css`, ember `agent.css`, ember `agent-page.css`, `theme.css`, which is right and takes no `pages.css`; `agent-page.css` is in Canvas's cascade and reads `--panel`, `--rule-2`, `--view` until S7. The viewer links nothing: it embeds a copy of the palette.
- **Build.** `studio/vite.config.ts` copies `tokens.css`, `theme.css`, `scheme.js`, `icons.svg`, `fonts` and `marks` into `dist/assets/style/`. `fonts` and `marks` are copied as whole directories, so the new font names need no edit there; the font names are pinned in `tools/worker/front_conformance.py` (`fonts/chivo-latin-400-normal.woff2`). `pages.css` is needed only if Studio grows a page outside the frame.
- **Tokens.** `src/styles/tokens.css` aliases `--bg-deep` (`--view`), `--bg-pane` (`--panel`), `--bg-raised` (`--chrome`); three aliases that collapse onto `--ground` make 46 "pane on a different grey" uses wrong, so each use is a deliberate `--ground`, `--well` or `--field` choice, and the aliases are deleted (rule 8), not their right-hand sides edited. `--font` is used directly 15 times, `--rule-2` 4, `--view` 3, `--panel` 3, `--chrome` 3 (`styles/app.css` and component styles), `font-weight: 700` once. Two literal shadows (`editor/tabs.ts`, `files/contextmenu.ts`) become `--shadow-menu`. No JS reads a token by name.
- **Shadow DOM (Q27, DECIDED (a)).** Ten components with about 835 lines of their own CSS sit in shadow roots the theme cannot reach: `canvas-frame`, `chat-panel`, `chat-placeholder`, `split-pane`, `status-bar`, `merge-view`, `editor-pane`, `tab-bar`, `file-context-menu`, `file-tree`, plus `styles/focus.ts` and the CodeMirror themes (`editor/codemirror.ts`, `editor/merge.ts`). They move to light DOM; `studio-app` and `studio-header` already are. Class names inside them collide with theme classes once moved (`.row`, `.empty`, `.btn`, `.menu`, `.card`, `.hint`), and about 150 `shadowRoot` test queries are rewritten. It is not "bring the radii into line by hand".
- **CSP.** The Studio page is served with `style-src 'self' 'unsafe-inline'` because of eight `style=` bindings (`canvas/frame.ts`, `chrome/splitter.ts`, `files/contextmenu.ts`, `files/tree.ts`); tightening is C9.
- **Header.** `chrome/header.ts` lacks `.tb-left`, uses `dl.fields` under a product override and carries words the guide forbids (the words pass is C7); its three-svg scheme toggle still works.
- **Harness viewer** (`annealage_canvas/server.py`): the palette copy is at lines 92 to 115 (not 75 to 92), copied from the old Canvas block (`--chrome`, `--panel`, `--view`, `--rule-2`, `--code`, `--font: 'Chivo'`, `--r: 3px`), 17 uses of old names in its own rules, round status dot, outlined buttons, a bordered rail, the mark's `#E6C36A` fills and the favicon. It names Chivo and loads no font file; a page frozen into firmware keeps system fonts on-device (Q29 (a)). `canvas_host/app.py` hides `header, footer, .rail` by element name for the managed iframe, and `tests/test_input_sqe.py` asserts JS strings in `VIEWER_HTML`. The test that kept the palette copy in step with the style was deleted, so nothing guards it today; C8 restores one.
- **Straw temper.** Lines are `--temper-text`, never `--temper` (1.6:1 on light ground): `styles/app.css` (tab underline) and `canvas/frame.ts` (pressed tool). Dark-scheme CodeMirror selection and search colour mix straw at 45 to 65% under light text and need `--temper-wash` and an outline instead. Nothing puts white on straw.
- **Docs and images.** `docs/studio-spec.md`, `docs/studio.md`, the repo `CLAUDE.md`, 11 images in `docs/screenshots/` and 7 in `docs/screenshots/bench-console/` show the old look.

### Mesh (`mesh/src/annealage_mesh/static/`)

Read at `mesh` e9aaff1d48 (`agent-extract`). Survey: `20261111_survey-mesh.md`, which predates Q23. Q23 (DECIDED): `origin/main` (d4c3ad7) already carries the six `workbench-theme` port commits, so M0 rebases `agent-extract` onto it and the port builds from `main`.

- **Not a bare adoption.** An earlier port against the Workbench theme exists on `origin/workbench-theme` and `main`: the library was pinned as a `lib/style` submodule with a `/style/` route and a `STYLE_FILES` hatch list. That is superseded: Mesh now VENDORS the runtime files with `tools/vendor-style.sh` into `src/annealage_mesh/style/` (no `lib/style` submodule, no change to the `STYLE_FILES` hatch list; `tools/check` skips that directory because it holds `VENDORED.json`). Mesh `main`'s `js/palette.js` already listens for `schemechange`. M0 and M1 still add `scheme.js` as the first blocking classic script and fix the `fonts` licence entries (`OFL-InstrumentSans.txt` and `OFL-RedHatMono.txt`; there is no `fonts/OFL.txt`).
- **frame.js and ember's store.** `frame.js` does not write ember's store (`activeTab`, `panelOpen`). Products that read `store.activeTab` or `store.panelOpen` (Mesh `pins.js:169`, `chrome.js`) must read `frame.js` state instead until X2 deletes `layout.js`. Ember's `.svg` and `.woff2` static types exist for this.
- **Page.** `static/viewer.html` is the only page; `css/app.css` (195 lines) is all old look and has no light scheme at all. Link order becomes `scheme.js`, `tokens.css`, ember `agent.css`, `theme.css`, `css/app.css`; no `pages.css`. `data-product="mesh"`. The pane targets of `main.js`'s `initLayout` (`#app`, `#side`) become `#view` and `#review`, and the tab "Chat" becomes "Agent"; the phone tab bar is `frame.js`.
- **Title and tabs.** The title is the folder name and the path is in its tooltip only (Q25); today `models.js` `updateTitle` writes the served path into `#topbar .title` with seven inline style properties. The view tab is "Model", not `build`. There is no Timeline tab and no restore form: the inspector has Review only. The Mesh reference (`workbench.html?product=mesh`) is drawn that way.
- **Literal colours** (`js/three-scene.js`, `models.js`, `pins.js`, `sprites.js`, `measure.js`, `sketch.js`; `pins.js` and `sprites.js` and `sketch.js` were missing from the earlier list): scene background `0x14161a` becomes `--well`; the grid `0x3a3f47` and `0x282c32` become `--mv-grid-2` and `--mv-grid`; the eight part colours become `--mv-part-1` to `-8` (part 1 is currently pin-orange, ember-adjacent, on the largest thing on screen); the pin `0xe86b34` becomes `--pin` with `--on-pin`; the selected pin `0xffd24a` becomes `--pin-selected` with `--on-temper`; the measure line `0xffd24a` becomes `--measure`; axis letters use `--mv-axis-x`, `-y`, `-z`; the sketch stroke `0x35c7e0` is `--sketch` with `--sketch-halo`. Mesh draws no edge lines today, so `--mv-edge` means new `EdgesGeometry` rendering, not a recolour. Callouts: the theme draws the agent's marker outlined (paper fill, ink stroke), not temper-filled, so the sprite is outlined, and `--callout` is not the fill. `sprites.js` draws a round badge and a rounded pill: the badge becomes the chamfered path and the pill goes (the `.hud--br` readout carries the measure). Its font strings change from `system-ui` to `500 … Red Hat Mono`, and `main.js` awaits the new face before building sprites.
- **DOM built by JS.** `js/pins.js` `.pin`, `.apin`, `.meta`, `.cmt` become `.row` with `.mk.mk--human` or `.mk--agent` and `dl.fields` or `.rhead`; `buildMetaRows`, `makePartRow` (keep the swatch, it ties the row to the part), `measure.js` `innerHTML` strings, `sketch.js` `.sketchbar` (becomes `.btn` and `.btn.primary`; `#chatSketchBtn.on` becomes `aria-pressed`), `three-scene.js` `#upBtn` (becomes the Z-up / Y-up `.seg`), and the native `confirm("Delete all N pins?")` in `pins.js` becomes `confirmRow`. `#toast` and `#err` are styled by the theme after S1.
- **Tests and docs.** `tests/test_viewer_e2e.py` selectors; `README.md` and `docs/*.png` (`mesh-three-pane`, `mesh-approval`, `mesh-phone-chat`) and prose naming "the topbar", "the gear", "the paperclip", "cyan" callouts.
- **Not UI.** The `.claude`-config acceptance is a CLI refusal; the two-JSON-file contract (`mesh-comments.json`, `mesh-callouts.json`) has no page and its data shapes do not change.

### Hosted (`hosted/src/annealage_hosted/portal`, `front`)

Read at `hosted` 88259792ba (`main`). Survey: `20261111_survey-hosted.md`. Hosted is dark only today and has no scheme script; the port adds light and the toggle. It is an adoption: every stylesheet and nearly every class attribute is replaced.

- **Surfaces.** The account host (`portal/pages.py`, `billing_pages.py`, `invoice_pages.py`, `customer_invoices.py`, `invoice_render.py`, `oidc.py` onboarding), and on a product host: the project chooser is `front/home.py`, the waiting page `front/waiting.py`, the delete-confirm page in `home.py`, and **`front/overview.py` is the workspace overview** (cross-product list, lineage, Send to, file tree, send status), a different surface, drawn in `demo/overview.html` (H7; H8 builds it, see the overview bullet below). Also the printable invoice and `portal/assets/invoice.css` (Q18: a full restyle, H9), the two emails and Zitadel's login theme.
- **One kit, not two.** `portal/kit/` is a vendored, unmodified copy of `~/studio/website/app-shell/` (a start-up check and tests enforce "unmodified", and the nav is regex-extracted from `kit/index.html`). `front/overview_static/css/{home,overview,waiting}.css` are three small layers on top of it, and the front reads the kit's files from `portal/kit/static` on disk. The port ends the vendoring contract; swapping stylesheets is not enough. Four copies of the page shell exist (portal, home, waiting, overview) and become one.
- **Taking the library.** A `lib/style` submodule at the repo root, pinned to a `main` SHA, with a hatch `force-include` of `tokens.css`, `theme.css`, `pages.css`, `scheme.js`, `icons.svg`, `fonts/` and `marks/` into the wheel (a submodule inside the package would ship `demo/`). One resolver and one static route (`/_style/{tail}` or `/static/` on the account host) replace the three allow-lists (`portal/static.py`, `home.py` `_OWN_FILES`, `overview.py` `_KIT_FILES`). The build scripts must fail if `lib/style/tokens.css` is missing, or an image ships with no CSS. Every page's CSP (`style-src 'self'`) already fits the library.
- **Link order.** `scheme.js`, `tokens.css`, `theme.css`, `pages.css`, then the page's own CSS; no ember (`agent.css` has no use on these pages), no script in the head today.
- **Markup (counts of `class=` in the Python source):** `pages.py` 154, `overview.py` 129, `home.py` 61, `billing_pages.py` 56, `invoice_pages.py` 35, `invoice_render.py` 21, `waiting.py` 15, `oidc.py` 6. The kit's vocabulary maps: `.app`, `.app-nav`, `.app-main`, `.app-top` to `.page`, `.titlebar` and `.navpage`; `.page-head` to `.sidenav h1` or `.pagehead`; `.section` to `.blk`; `.panel` and `.stat-grid` cards to `ul.rows` of `li.fr.item`; `.pill` (50) to `.lamp` and a word, or `.state`; `.table-wrap > table.table` (15) to `table.dtable.flush.fixed` or `.dt`; `.field` stacks to `.fr` or `dl.fl`; `.btn--primary` (12) to `.btn.primary` (ink: in the kit it was ember, so every primary changes colour); `.btn--danger` to `.btn.danger`; `.btn--sm` to `.btn.sm`; `.notice--error` to `--danger`; `.empty-state` to one `.empty` line; `.danger-zone` to a closing `.blk`; the spinner to `.lamp.run` with `.pline.indet`; `brand/logo-dark.svg` to a `<picture>` of the `marks/` pair. Billing and invoice pages carry 10 to 12 stat tiles where the guide allows about six readouts. Two primaries per view occur in `invoice_pages.py` (Issue and Send) and `home.py` (Create project and Upload). The raw file input in `home.py` becomes `label.dropstrip`. The kit's ember-bordered active view button in `home.css` is a second ember use; it goes.
- **Chooser (`front/home.py`, H4).** `.reg[data-view]` > `.reg-head` + `ol.projs` > `li.proj`, one markup for both views; Delete moves into the row's `.menuwrap`. The backend has, per project, name, visibility, created, a head commit and history (so last changed and a commit count), the newest job's operation and state, role, and a saved list or tiles preference. Missing: a thumbnail, a user-facing revision, parts and nets (product-declared figures), a per-person last-opened time, rename (no function or route exists), and serving-job state for every listed project in one call. Until Phase 7 the thumbnail is an empty placeholder cell, the List / Tiles switch is not offered (H4 drops Tiles; R1 adds it back), and the project row carries the product's temper (`data-product` set) on the selected row and active tab (Q15). The "Workspaces" and "Usage" links show disabled with a reason when empty. No command field on the chooser or account pages.
- **Workspace overview (`front/overview.py`, three pages, `demo/overview.html`: `#overview`, `#tree`, `#status`, `#missing`; `?state=` in the page's comment).** One shell with the product tabs and none current, no temper, no command field. `.ov-top` and the lede paragraphs go; the workspace name is `.pagehead h1` and the product filter is `.chips` in that row (links hold the chosen one with `aria-current`). The project table is `.dt` with columns Project, Product (text, no pill), Changed (a relative time, the stamp in `title`), Derived from and Sent to (counts), Unread, and one `Open` with a `...` menu holding Files and Send to another product; the raw project id and the short revision hash are gone. Lineage is the row's `.exp` opening a `.dt-detail` with a nested `.dt` (Project, Product, Kind in plain words, When, Note, a Send status link). "Sent to other products" stays under the register as a `.dt` whose State is a `.state[data-kind]` link (pending Queued or Checking, busy Sending or Finishing, good Sent, bad Failed, no kind Cancelled); the job id link text goes. The send `<dialog>` becomes `form.inlineform` opened in place under the row (`.dt-detail`) or under the title row, its fields a `dl.fl.form`, Options a `details.disc`, the result a `dl.fl.form[role=status]`; every id `overview.js` uses stays. The tree is `ul.tree` (the stored file names, the hash in the name's `title`, the sha256 and LFS paragraph removed), compare is a plain form row, revisions a `details.disc` holding a `.dtable` of time and hash. Send status is `dl.rows` of `.fr` with a Details `details.disc` for job, operation, revisions and checksum, and Cancel send is `.btn.danger` with `confirmRow` into the facts block (it replaces `window.confirm`). The 404 is a `.pagehead h1`, an `.empty` line and a shell with no menu, tabs or status bar. A viewer sees Send to disabled with one `.notice` per page.
- **Waiting page.** Becomes a row state (`aria-busy`, `.lamp.run`, `.pline.indet`) in H5, not its own page.
- **JS.** `portal/assets/portal.js`, the kit's `app.js` (`data-src` plus `<template>`) and each front page's script build pills and tables by class name; they change with the markup.
- **Words.** Uppercase tracked mono labels, role and product pills, lede paragraphs, the Tiles / List server round-trip form (kept, inside a `.seg`, because it works without script and stores the choice).
- **Not a hosted surface:** Canvas, Loom, Trace workbenches; hosted does not use ember in its own pages.

### Shared libraries

Read at `ember` 7a416924d1, viewer `fc7158e564`, kicanvas `8fc23333ae`. Survey: `20261111_survey-shared.md`.

**Ember** is the agent interface only (Q3, DECIDED): the style library owns its look and any layout the pane and the project views share (`.pj-*`, `#toast`, `#err`, `.chatusage`). An earlier version of this file said ember needed nothing; it does. The changes, in ember's own tickets:

- S7: `static/agent-page.css` (read `--panel`, `--rule-2`, `--view`, hid the working line on a phone, carried a left-ruled `#toast` and `#err`) is cut to the full-height page shell of a chat-only page and `embed.py`'s README says the page needs the theme.
- S8: `static/project.css` (`--panel` with a dark fallback, 85 `.pj-*` rules) is emptied; the theme draws and lays out the project views (title-bar Rename and Change id, conflict banner, lineage bar, History); the file stays as a comment until X2 deletes it. The `--pj-*` custom properties are removed.
- S9: `.chatusage` becomes two child readouts (context and cost), each hidden when unknown, and glyphs and middle-dot strings go from `chat.js`, `settings.js`, `pause.js`, `embed.py` and `project.js`. The theme's `#chat .chatusage` accepts both the new two-child form and the old one-string form.
- X2 (Phase 8): `agent.css` is cut to structure (hidden rules, overflow, the attachment chip's remove button; no paint), `static/project.css` and `static/layout.js` are deleted. `layout.js` is replaced by `frame.js` in style: ids `#tabbar` and `#panelBtn`, `body.panel-open`, `data-layout`. Products import ember's copy until Loom's L2 and Mesh's M3.
- Class names, ids and markup are a contract (rule 7); no port renames them. The pins: Loom at `7a416924d1`, Trace `89ffe88443`, Canvas `286feb35cb`, Mesh `ee23c14055` (lacks context attachments, the lineage classes and `.agentstatus[data-state=idle]`, so the theme must cope with both; Mesh's M0 bumps it).

**Viewer** (`annealage-viewer`, `src/annealage_viewer/static/viewer/`; Loom and Trace link it as `lib/viewer`): S10 reduces `board.css` to what the theme lacks (it redrew `.chips`, `.chip`, `.slider`, `.layerlist`, `.layerrow` after the theme with `--rule-2`, and set `accent-color`) and the 3D default background (`board3d.js`, `initBoard3d({ background })`). `board.js`'s markup (`button.chip`, `label.layerrow`, `span.swatch`, `details.layermore`) is theme-compatible. Hosts pass `--well`, not `--view`, to `board.js` and `board3d-view.js`.

**KiCanvas** (branch `annealage`): S11 retunes `themes/annealage.ts` and `annealage-light.ts` (backgrounds and grids) to the well, re-checks every layer colour for contrast, and rebuilds `build/kicanvas-board.js` into the viewer. Hosts choose the theme by scheme.

**kicad-restyle** reads a YAML style, no tokens. The sheet fill (`#FDFDF9`) is for the Loom and Trace tickets to reconcile with `--paper`.

## The rest of the platform

- **Pod** is not surveyed: `data-product="pod"` has a temper block and a reference mode, and no Pod web UI is planned in this port.
- **Where the command field is drawn.** On workbench and flow pages (`.cmd` in the title bar, opening the palette, S12). It is not drawn on list, account or chooser pages (`demo/list.html`, `demo/settings.html`): their title bar carries the product name and the account area only.
- **Open PDF.** Anywhere a datasheet file cannot be opened from the UI it is `disabled` with the reason in `title`.
- **Register columns.** `demo/list.html` is the Phase 7 target (R1 to R3 supply thumbnails and the project summary). Until then a port offers the list view only, draws the thumbnail as an empty placeholder cell with no control, and does not offer the List / Tiles switch. State which columns exist today in the product's own ticket.
