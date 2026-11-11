# Annealage style

The shared look of the Annealage product web UIs (Loom, Trace, Canvas, Mesh, Pod) and of the platform pages around them (projects, account): design tokens, the theme, fonts, icons and the marks. Each product pulls this repo in as a `lib/style` submodule and serves it from its own static tree.

The look is **Hairline + plate**. Everything sits on one surface divided by 1px rules. The drawing's surround is the only tonal recess, and nothing has a box unless it is an input, a menu, or the one thing waiting on the human. Three things come from the marks: a 45° chamfer on markers and on the Allow button, mono readouts in a slightly recessed field, and square status lamps. `MIGRATION.md` covers moving from the earlier Workbench theme.

## What's here

- `tokens.css`: colours, type, sizes and the `@font-face` rules. Light and dark follow the OS through `light-dark()`, and `<html data-theme="light|dark">` forces one. `<html data-product="loom|trace|canvas|mesh|pod">` sets the product's temper and nothing else: the greys are the same for every product. With no `data-product` the page is platform chrome and temper falls back to ink.
- `theme.css`: base, controls, lamps, markers, readouts, menus, tables, the workbench frame (title bar, view tabs, tool rail, well, inspector, agent pane, status bar), the timeline, findings, the run console, and the agent chat and settings window that annealage-ember's `chat.js` and `settings.js` build.
- `pages.css`: what sits outside the workbench frame. The project register and tiles, a guided flow with its step spine and pinned footer, the settings or account layout, the drop zone.
- `scheme.js`: light and dark follow the OS unless the user picks one, remembered per origin in localStorage under `annealage.scheme`. It sets `<html data-theme>`, keeps the marks' `<picture>` sources in step, drives any `<button data-scheme-toggle>` (System, Light, Dark), and fires `schemechange` on `<html>` (detail `{scheme, choice}`) on every effective change. `window.annealageScheme` has `choice()`, `get()` and `set('light'|'dark'|null)`.
- `icons.svg`: a sprite of 16px stroke icons with round joins, used as `<svg class="ico"><use href="icons.svg#i-pin"/></svg>`.
- `fonts/`: Instrument Sans (400, 500, 600) and Red Hat Mono (400, 500), latin and latin-ext, under the SIL Open Font License (`fonts/OFL-InstrumentSans.txt`, `fonts/OFL-RedHatMono.txt`).
- `marks/`: the parent mark and the product marks, each with a `-dark` variant. They are exported from the brand repo and used as they are, never redrawn or recoloured.
- `demo/`: the reference pages. Serve the repo root and open them (`python3 -m http.server 8793 -d .`, then `http://127.0.0.1:8793/demo/components.html`).
  - `components.html`: every component and every state, grouped and titled. This is the visual spec.
  - `workbench.html`: the frame assembled, with each product's kind of content.
  - `flow.html`: a guided setup (`#upload`, `#inventory`, `#datasheets`, `#review`).
  - `list.html`: the project register (`#list`, `#tiles`).
  - `settings.html`: an account page (`#overview`, `#usage`, `#security`, `#workspaces`, `#danger`).
  - Each takes `?product=loom|trace|canvas|mesh|pod|none` and `?theme=light|dark`, and has the scheme button. `demo/shots/` holds screenshots of all of them; `tools/shoot.mjs` retakes them.
- `runtime-files.txt`: what a product serves and ships (see "What a product ships"). `tools/shoot.mjs` is the port gate tool (see "Checking a port"); `tools/bump-style.sh` is the pin-bump template.
- `tools/contrast.py`: reads `tokens.css` and checks every text token against every surface the theme puts it on, in both schemes and for every product. Run it after changing a colour; it exits non-zero on a failure.

## Using it in a product

Load `scheme.js` as a plain `<script src=".../scheme.js"></script>` in `<head>`, before the stylesheets, so a saved choice is applied before the first paint. Then link the stylesheets in this order:

1. `tokens.css`
2. the agent layer's `agent.css` (only on a page with the agent pane)
3. `theme.css`
4. `pages.css` (only on a page outside the workbench frame)
5. the product's own stylesheet

Put `data-product` on `<html>`. There are no external requests and no inline styles, so a `style-src 'self'; font-src 'self'; script-src 'self'` policy covers it.

The page supplies the frame markup (`.wb` and its children, see `demo/workbench.html`), the chat scaffold that annealage-ember's `embed.py` writes, and a `.side` wrapper round `#chatPending` and `#chatComposer`. `chat.js` keeps these attributes on `#chat`, and the theme reacts to them:

- `data-working` while a turn runs (the working line along the pane header)
- `data-turn-started` (epoch ms; the page writes the timer text)
- `data-pending` (the number of open approvals; the page shows the status-bar `.alert` from it)

A page with a signed-in name sets `--chat-you: "andrew"` on `#chat` to label its messages.

Things only one product draws stay in that product's stylesheet: Mesh's scene, Loom's sheet overlays beyond pins, a table's column template (`.dt.parts { --cols: … }`).

### Canvas and WebGL colours

Canvas and WebGL code that needs a token colour should resolve it through an element rather than read the custom property. `getComputedStyle(root).getPropertyValue('--pin')` returns the unresolved `light-dark(...)` text. Instead, set `probe.style.color = 'var(--pin)'` on a hidden element and read `getComputedStyle(probe).color`. A module script doesn't wait for stylesheets, so wait for the `<link rel=stylesheet>` loads before the first read, or the colours come out as the inherited text colour. Redraw on scheme.js's `schemechange` event, which covers both the OS changing and the user's choice. `--hover`, `--press` and `--temper-wash` are translucent, so composite them over the surface beneath if the scene needs an opaque value.

Scene and editor colours have tokens too, so no product keeps literals for them:

- `--mv-axis-x`, `--mv-axis-y`, `--mv-axis-z`: the scene axes (lines, 3:1 on `--well`).
- `--sketch` and `--sketch-halo`: the sketch stroke over a scene. One value in both schemes, because it is baked into the image the agent reads. No single colour reaches 3:1 on both wells and every part, so draw the halo wider, under the stroke; `tools/contrast.py` checks that one of the two reaches 3:1 on every surface.
- `--syn-keyword`, `--syn-def`, `--syn-meta`, `--syn-comment`, `--syn-string`, `--syn-number`, `--syn-invalid`: source highlighting. `pre.src` and `ol.src` with Loom's `tok-*` classes need no product CSS. Red Hat Mono's heaviest weight is 500, so use `font-weight: 500` for keywords and `600` (which renders as 500) for a definition name, with `font-synthesis-weight: none`.

A CodeMirror 6 theme takes the same tokens: a `HighlightStyle` mapping keywords to `{ color: 'var(--syn-keyword)', fontWeight: 500 }`, definition names to `var(--syn-def)` at 600, strings to `var(--syn-string)`, numbers and constants to `var(--syn-number)`, comments to `var(--syn-comment)`, decorators and builtins to `var(--syn-meta)` and invalid text to `var(--syn-invalid)`. The selection is `var(--temper-wash)` (ink stays on it at AA), a search match is `var(--temper-wash)` too, and the current match is outlined 1.5px in `var(--temper-text)`. Do not mix temper at 25 to 65% into the selection: it falls under 4.5:1 in dark.

## What a product ships

`runtime-files.txt` is the one list of what a product serves and packages: one path or directory per line, no globs (fonts are the directory). Static routes, wheel `force-include`, Canvas's copy list and Trace's `Containerfile` read it; `demo/`, `tools/` and the `*.md` files are not on it. `frame.js` and `palette.js` are listed before the library has them (the frame helper and the palette script land with later tickets); `runtime-pending.txt` names those two, and `tools/bump-style.sh` and the existence check skip any path named there. Once both files exist, `runtime-pending.txt` is deleted.

`tools/bump-style.sh` is a template: copy it to `scripts/bump-style.sh` in a product. `scripts/bump-style.sh [sha-or-tag]` fetches `lib/style`, checks out the ref detached, refuses a ref that is not on `origin/main` or a submodule with changes of its own, checks the runtime list exists, stages the gitlink and prints the log between the old and new pin. It never commits.

## Checking a port

`tools/shoot.mjs` is the gate's shot tool. From an omp JS eval cell, with the product running:

```js
const { shoot } = await import('/path/to/style/tools/shoot.mjs');
const table = (await import('/path/to/style/tools/shots/loom.example.mjs')).default;
await shoot(browser, { base: 'http://127.0.0.1:18765', shots: table.shots, allow: table.allow, out: '/tmp/loom-shots' });
```

`shoot(browser)` alone retakes the reference pages into `demo/shots/` (serve the repo root on :8793 first). Each table entry is `{ name, path, state?, ready?, full?, viewports?, schemes?, webgl? }`; the header of `tools/shoot.mjs` documents them, and `tools/shots/loom.example.mjs` is a worked table. Each entry gives `<name>-<scheme>-<width>.png` for light and dark at 1600 and 400 wide. The page is shot once fonts, stylesheets and images are in (plus the entry's own `ready` and `state`); no test hook is needed in the product. The scheme is forced through `localStorage` and `prefers-color-scheme`, so a product that predates `scheme.js` still switches, and the stored choice is removed afterwards.

The result is `{ ok, shots, stale, text }` and `text` is also printed. A shot is clean only if it became ready (20 s limit, then `ready: false`), logged no console error, made no request that failed, answered 4xx/5xx or left the origin, and shows no old look: a computed `font-family` containing Chivo, or a stylesheet reference to `var(--chrome`, `--panel`, `--view`, `--rule-2`, `--code`, `--font` or `--console-h`. A table's `allow` list (`{ match, reason }`) lets a known refusal through, for instance the agent socket in a no-backend run; allowed items are listed per shot. `ok` is true when every shot is clean, so the gate needs no judgement; an agent then reads the PNGs beside `demo/shots/`. PNGs from an earlier run are deleted before shooting, and any left in the folder from a renamed entry are listed as `stale`.

Bumping a product's pin without porting it reports the same faults (old markup under the new theme), which is the point of the probe. Board and 3D views need WebGL: run the browser under the viewer's SwiftShader launcher (`scripts/webgl-browser.sh`) and pass `{ webgl: true }`; entries marked `webgl: true` are otherwise skipped with a note rather than shot blank. Pixel diffs and baselines are not part of the gate.

## The rules the theme keeps

- **Ember** (`#E8632A`) means the product needs you. It is the pending approval's Allow button (`.pactions button.allow`, or `.btn.ember`) and the status-bar `.alert` that jumps to it, and nothing else. A view with nothing waiting on the human has no ember; its primary button is solid ink.
- **Quench** is state only: ok, done, connected.
- **Temper** is the product's own colour, on a few small things: the active tab's underline, the selection wash, the selected marker, the working line and the focus ring. `--temper` fills, `--temper-text` draws lines and text (straw is unreadable as a line on a light page).
- Severity and status never use ember. Critical is danger and major is warn.
- **Mono** is for data: refs, part numbers, coordinates, paths, counts, costs. Labels are in the sans.
- No shadow except on a menu, a popover or a dialog. No gradients, glow or blur.
- `--ink-3` is for third-level data on ground, well and field. A washed or pressed surface steps it up to `--ink-2`, which the theme does wherever it paints one.

## Components

Each component's markup is in the comment above its rules.

**Controls** (`theme.css`)
- Buttons: `.btn` with `.quiet`, `.primary`, `.danger`, `.icon`, `.sm`, `.edge`; `aria-pressed=true` or `.on` for a held state; `.btn.ember` for Allow; `.hdrbtn` in a pane header; `.linkish` for a text link that is a button.
- Fields: `.input` (on an input, select or textarea), `.inputwrap`, the command field `.cmd`, `kbd`.
- Checkboxes and radios are styled wherever they are; `input.switch` is a toggle; `label.check` lays one out with its text.
- `.seg` (segmented control, `.icons`, `.sm`), `.chips` and `.chip`, the count `.n`, the label `.tag`.
- `[data-scheme-toggle]`, the scheme button.
- `.confirm` and `confirm.js`: the inline approval row that replaces the browser's `confirm()`. `confirmRow(anchor, {title, detail, fields, action, danger, cancel, into})` returns a promise that is true for the action and false for Cancel, Escape, another row opening or the anchor leaving the page. It opens in place (a `.dt-detail` under a table row, `into`, or after the anchor), disables the opener while open and returns focus to it. A spend uses the solid ink button, a destructive action danger text; neither is ember. It is for in-page actions: a `beforeunload` guard stays with the browser's own prompt.

**Lamps, markers, readouts**
- `.lamp` with `.ok`, `.warn`, `.bad`, `.none`, `.run`; `.state[data-kind=good|busy|gap|bad|pending|waiting]`; `.conn[data-state]`; `.agentstatus[data-state]`.
- `.mk`, the plate marker, with `.mk--human`, `.mk--agent` (or `.open`), `.sel`, `.resolved`; severity marks `.mk--sev` with `.mk--defect` or `.mk--warning`.
- `.readout` holding a `.val` and a `.lg`; `.val.zero`, `.val.lg`.
- `.pline` (`.p10` to `.p100`, `.indet`, `.steady`), `progress.meter`.
- `.paper` for a sheet or thumbnail.

**Menus, disclosures, text**
- `.menuwrap` with a `[data-menu]` button and a `.menu`; `details.more` with a `.menu`.
- `details.disc` with `.disc-body`, stacked in `.discs`.
- `.subhead`, `.empty`, `.hint`, `.note`, `.metaline`, and `.notice` with `--warn`, `--danger` or `--ok`.
- `dl.fields` (wrapping labelled data), `dl.fl` (label and value columns; `.ruled`, `.cols2`), `.propshead` and `table.props`.

**Tables**
- `table.dtable` (`.num`, `.mono`, `tr[aria-current]`, `.flush`).
- The selectable grid table `.dt` with `.dt-bulk`, `.dt-head`, `.dt-row[aria-selected]`, `.dt-detail`, the expander `.exp`, and the cell roles `.dt-main`, `.dt-sub`, `.dt-state`, `.dt-act`. It stacks at 640px.

**Workbench frame**
- `.wb` with `data-rail=none`, `data-console=none`, `data-layout=drawing|split|agent`, `data-side=review|timeline`, `data-preview`; `body.panel-open` shows the inspector; `--insp-w` and `--chat-w` set the pane widths.
- Title bar: `.titlebar` with `.tb-left`, `.mark`, `.prod`, `.tsep`, `.crumbs` or `.doc`, `.stageline` and `.stagebar`, `.cmd`, `.tb-right`, `.prodtabs`.
- View tabs: `.vhead` with `.vtab`, `.vsep`, `.vtab.second`, `.meta`, `.right`.
- Tool rail: `.rail` with `.tool` and its shortcut `.k`.
- View: `.view`, `.canvas`, `.hud` (`--tl`, `--tr`, `--bl`, `--br`), `.subtabs` and `.subtab`, `.zoom`, `.previewbar`.
- A view's own panel: `.canvas.split` with `aside.vpanel` beside a `.stage`, holding `.chips`, `.layerlist` and `.layerrow`, `.slider`, `.query`, `.qmeta`, `.qacts`, `.results` and `.hit`.
- Pins: SVG `g.pin` (`.model`, `.resolved`, `.is-selected`, `.ring`), `.pindraft`, the HTML `.hpin` for a paper sheet, and the floating `form.composer`.
- Inspector: `.inspector`, `.ihead`, `.ptabs`, `.ipane`, `.iscroll`, `.toggles`, `details.sec` and `.secbody`, `.row` with `.rhead` (`.is-selected`), `.ifoot`.
- Timeline: `.tl` and `.ev` with `.node--msg`, `--build`, `--ev`, `--wait`, `--now`; `.ebody`, `.eh`, `.eq`, `.ed`, `.chg`, `.rp`, `.eacts`, `form.restore`, `.is-preview`.
- Status bar: `.statusbar` with `.conn`, `.alert`, `.push`, `.k`, `b`, `.pv`.

**Agent pane and settings** (annealage-ember's markup)
- `#chat` with its header (`.agentstatus`, `.chatwho`, `.chatusage`, `.working`, `.conn`, `.hdrbtn`, `details.more`), `.chatbanner[data-kind]`, `#chatLog` (`.turn`, `.msg.user`, `.msg.assistant`, `.msg.action`, `.segments`, `.text`, `details.thinking`, `details.toolgroup`, `details.toolcard`, `pre.toolinput`, `pre.toolresult`, `.turnerrors`, `.chathistory`, `.attachthumbs`, `.contextchip`), `.side`, `.chathint`, `#chatPending` with `.permcard`, and `#chatComposer` (`.chatmodelrow`, `.attachstrip`, `.attachchip`, `#chatComposerRow`, `.attachbtn`, `#chatInput`, `.chatbtns`).
- `.modal` and `.setpanel` with `.setwarn`, `.setbody`, `.setrow`, `.setlabel`, `.setinput`, `.setnote`, `.sethelp`, `.diagrow`, `.logrow`, `.logtail`, `.loginflow`.
- `#toast` (class `ok` or `err`) and `#err`, which ember's `ui.js` writes: a floating message row with a lamp.
- The project views `project.js` builds, all `pj-*` classes: `.pj-header`, `.pj-history`, `.pj-lineage`, `.pj-projects` and the `.pj-modal` dialog. The theme draws their look and layout; `demo/ember.html` shows them under ember's real `agent.css` and `project.css`.

**Review** (a product that runs a review rather than a chat)
- `section.console` with `.chead` and `.cbody`, `ol.steps` of `li.step[data-state]`, `pre.log`.
- `.filters` and `.frow`; `details.finding` with `.fhead`, `.sev[data-sev]`, `.fid`, `.fstat[data-status]`, `.ftri`, `.fver`, `.fstale`, `.claim`, `.subj`, `.fbody`, `ul.evidence`, `form.triageform`.
- Coverage: `.covcounts`, `.covlist`, `.covhead`.

**Pages** (`pages.css`)
- `.page` with `.pagebody`, `.pagehead`, `.lede`, `.measure`, `.pageacts`; `section.card` (a ruled section, not a box); `.linkrow`.
- `.drop` and `.dropstrip`.
- Flow: `.flow`, `.flowside`, `ol.flowsteps` of `li.flowstep[data-state=done|current|open|locked]`, `.flowfacts`, `.flowmain`, `.flowview` (`.split`), `.flowscroll`, `.flowhead`, `.flowaside`, `.flowfoot`; `.ready` with `.figs`, `.ready-r` and `.segbar`; `.optlist` and `.opt`; `.besides` and `.sidenote`; `dl.fl.stack`.
- Register: `.reg[data-view=list|tiles]` with `.reg-head`, `.projs`, `.proj` and its `.p-thumb`, `.p-name`, `.p-rev`, `.p-parts`, `.p-nets`, `.p-state`, `.p-opened`, `.p-created`, `.p-act`.
- Settings: `.navpage` with `.sidenav` and `.navmain`; `.blk`, `.blk-h`, `.rows`, `.fr` (`.item`, `.sum`, `.total`), `.fr-act`; `table.dtable.fixed` with `col.c-label`, `.c-date`, `.c-act`.

## Licence

The CSS, JS and icons are under the PolyForm Noncommercial License 1.0.0 (`LICENSE`), the same as the products. The fonts are OFL (`fonts/OFL-InstrumentSans.txt`, `fonts/OFL-RedHatMono.txt`). The marks are Annealage trademarks and aren't licensed for other use.
