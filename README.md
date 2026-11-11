# Annealage style

The shared look of the Annealage product web UIs (Loom, Trace, Canvas, Mesh, Pod) and of the platform pages around them (projects, account): design tokens, the theme, fonts, icons and the marks. Each product pulls this repo in as a `lib/style` submodule and serves it from its own static tree.

The look is **Hairline + plate**. Everything sits on one surface divided by 1px rules. The drawing's surround is the only tonal recess, and nothing has a box unless it is an input, a menu, or the one thing waiting on the human. Three things come from the marks: a 45° chamfer on markers and on the Allow button, mono readouts in a slightly recessed field, and square status lamps. `MIGRATION.md` covers moving from the earlier Workbench theme.

## What's here

- `tokens.css`: colours, type, sizes and the `@font-face` rules. Light and dark follow the OS through `light-dark()`, and `<html data-theme="light|dark">` forces one. `<html data-product="loom|trace|canvas|mesh|pod">` sets the product's temper and nothing else: the greys are the same for every product. With no `data-product` the page is platform chrome and temper falls back to ink.
- `theme.css`: base, controls, lamps, markers, readouts, menus, tables, the workbench frame (title bar, view tabs, tool rail, well, inspector, agent pane, status bar), the timeline, findings, the run console, and the agent chat and settings window that annealage-ember's `chat.js` and `settings.js` build.
- `pages.css`: what sits outside the workbench frame. The project register and tiles, a guided flow with its step spine and pinned footer, the settings or account layout, the drop zone. `--reg-cols` is the register's column hook: set it on `.reg` to replace the default `grid-template-columns` of `.reg-head` and the list rows (one track per cell). `pages.css` has no global selectors, so it may also be linked inside the workbench frame for `.drop`, `.dropstrip`, `.measure`, `.ready`, `.segbar`, `dl.figs` and `.ready-r`.
- `scheme.js`: light and dark follow the OS unless the user picks one, remembered per origin in localStorage under `annealage.scheme`. It sets `<html data-theme>`, keeps the marks' `<picture>` sources in step, drives any `<button data-scheme-toggle>` (System, Light, Dark), and fires `schemechange` on `<html>` (detail `{scheme, choice}`) on every effective change. `window.annealageScheme` has `choice()`, `get()` and `set('light'|'dark'|null)`.
- `frame.js`: the page frame's driver (layout focus, the Panel button, the phone tab bar, column resizers). See "The frame driver" below.
- `palette.js`: the command palette behind the title bar's `.cmd` field, and the registry products put their commands in. See "The command palette" below.
- `icons.svg`: a sprite of 16px stroke icons with round joins, used as `<svg class="ico"><use href="icons.svg#i-pin"/></svg>`.
- `fonts/`: Instrument Sans (400, 500, 600) and Red Hat Mono (400, 500), latin and latin-ext, under the SIL Open Font License (`fonts/OFL-InstrumentSans.txt`, `fonts/OFL-RedHatMono.txt`).
- `marks/`: the parent mark and the product marks, each with a `-dark` variant. They are exported from the brand repo and used as they are, never redrawn or recoloured.
- `demo/`: the reference pages. Serve the repo root and open them (`python3 -m http.server 8793 -d .`, then `http://127.0.0.1:8793/demo/components.html`).
  - `components.html`: every component and every state, grouped and titled. This is the visual spec.
  - `workbench.html`: the frame assembled, with each product's kind of content.
  - `flow.html`: a guided setup (`#upload`, `#inventory`, `#datasheets`, `#review`).
  - `list.html`: the project register (`#list`, `#tiles`).
  - `settings.html`: an account page (`#overview`, `#usage`, `#security`, `#workspaces`, `#danger`).
  - `overview.html`: the hosted workspace overview (`#overview`, `#tree`, `#status`, `#missing`). `?state=` takes a comma list (the page's comment lists them: `send`, `after-send`, `viewer`, `filtered`, `empty`, `many`, `compare`, `truncated`, `sent`, `failed`, `details`, ...), drawn by `overview-demo.js`.
  - Each takes `?product=loom|trace|canvas|mesh|pod|none` and `?theme=light|dark`, and has the scheme button. `demo/shots/` holds screenshots of all of them; `tools/shoot.mjs` retakes them.
- `runtime-files.txt`: what a product serves and ships (see "What a product ships"). `tools/shoot.mjs` is the port gate runner (see "Checking a port"), `tools/shot` the headless command over it with baselines and a structural check, `tools/check` the static check (see "Automated checks"); `tools/bump-style.sh` is the pin-bump template and `tools/vendor-style.sh` the copy script for a public product (see "Vendoring into a public product").
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

### The frame driver

Load `frame.js` as a classic script at the end of `<body>`. With `data-auto` (`<script src=".../frame.js" data-auto></script>`) it starts once the page has parsed and takes the tab bar from the markup; without it, call `annealageFrame({ tabs })` after building the DOM. It does nothing, and does not throw, on a page with no `.wb`, no title-bar seg, no inspector or no tab bar. Its markup hooks, all inside `.wb`:

- `.wb[data-layout="drawing|split|agent"]` and buttons `[data-layout-set="…"]` (in a `.seg`): a click sets the attribute and `aria-pressed` on the set.
- `#panelBtn`: toggles `body.panel-open` and its own `aria-pressed`. `[data-panel-close]` closes the panel. The panel starts open, whatever the viewport, until the user closes it. The theme hides `#panelBtn` at 900px and below.
- `#tabbar`: `role="tablist"` with `button[role=tab][data-tab=id][data-target=selector]`, the first selected (`aria-selected`). At 900px and below the selected tab's target is shown and the others get an inline `display:none`; crossing the breakpoint clears them. `annealageFrame({ tabs: [{ id, label, target }] })` fills `#tabbar` instead of reading it.
- Two drag handles, `div.colgrip` with `role="separator"`, are inserted before `.inspector` and `#chat, .console`. The widths are limited to 240 to 560px (inspector) and 320 to 720px (agent), and the view keeps 320px as the window narrows. Left and Right move a focused handle 16px, Home and End go to the limits, a double-click resets it. They are hidden at 900px and below and while their pane is closed.

It keeps two settings in `localStorage` per origin and per product (`<html data-product>`, else `platform`), and only after the user changes something: `annealage.frame.<product>` (`{layout, insp, chat}`) and `annealage.frame.<product>.panel` (`"open"` or `"closed"`). The widths are written as `--insp-w-user` and `--chat-w-user` on `.wb`, which the theme reads while that column is open; with nothing stored no property is written, so a product's own `--insp-w` and `--chat-w` stay the defaults.

`annealageFrame(options)` returns, and keeps as `annealageFrame.current`: `layout()`, `setLayout(v)`, `widths()` and `setWidths({insp, chat})` (pixels, or `null` for the theme's default; clamped), `panelOpen()`, `setPanelOpen(b)`, `isNarrow()`, `activeTab()`, `activateTab(id)`, `reset()` (removes both stored keys and goes back to the markup) and `destroy()`. A `framechange` event fires on `.wb` after each change, detail `{layout, insp, chat, panelOpen, activeTab}`: a canvas or WebGL view resizes on it. Options are `root`, `storage`, `product` and `tabs`. `inert`, focus rescue and `visualViewport` handling stay with the product.

### The command palette

`palette.js` is a classic script with no dependencies and one global, `annealagePalette`. It draws the box the title bar's `.cmd` button opens: a search input over a list of commands, grouped by label, in the menu's family (1px `--rule-strong`, `--shadow-menu`, no dimming, no animation). It is built on first open and is not drawn until then. A page that loads no `palette.js` draws no `.cmd`; a page that loads it and registers nothing opens a palette with one line, "No commands here". Nothing in it depends on ember.

```js
const off = annealagePalette.register([
  { id: "sheet.4", title: "Go to sheet 4", group: "Sheets", keywords: ["page"], hint: "Power supply", shortcut: "G 4",
    enabled: () => hasDesign, disabledReason: "Open a design first", run: () => openSheet(4) },
]);
off();                                   // unregister those commands
```

- A command is `{ id, title, run }` and, optionally, `group`, `keywords` (array or string), `hint`, `shortcut` (one string, drawn as a `kbd`), `icon` (the `href` of a `<use>`, such as `"/style/icons.svg#i-sheet"`), `enabled` (function or boolean, asked every time the palette opens) and `disabledReason`. A disabled command is shown with its reason as the hint and does not run (rule 11). Titles, hints and groups are set as text, never as HTML. An id registered again replaces the earlier command; a command without `id`, `title` or `run` is skipped with a console warning.
- Register what is true now and unregister what stops being true (sheets, views, steps): the list is read each time the palette opens, and redrawn at once if the registry changes while it is open (a `palettechange` event fires on `document`). One command per target for now; there is no second level.
- `run` is called after the palette has closed and focus is back on the element that had it, so a command can open a menu or a confirm row there. A `run` that throws or rejects is logged with `console.error` and nothing else; showing the failure is the product's job.
- `annealagePalette.open({ query, opener })`, `.close()` and `.isOpen()` are for a product that binds its own keys. `open` takes an optional starting query and the element to give focus back to.
- Keys: Ctrl K and Cmd K open it and close it. Up, Down, Home and End move, Enter runs, Escape and Tab close. The chord is ignored when focus is inside a `[data-palette-ignore]` container, so give that attribute to anything that uses Ctrl K itself (a CodeMirror editor, the agent composer; a product marks its own composer textarea with it, ember adds it to its own), and when an earlier handler has called `preventDefault` on it. Clicking a `.cmd` button opens it as well.
- Typing matches case-insensitively and every word must match. A word ranks best at the start of the title, then at the start of a word in the title, then anywhere in the title, then as a subsequence of the title, then in `keywords` or `group`. Ties keep registration order; an empty query lists everything in registration order.
- `.cmd`'s key label ("Ctrl K" or "Cmd K") is set by the script, so markup can carry either. At 900px and below the theme turns `.cmd` into its icon, so give the button `aria-label="Search or run a command"`; the palette opens full width under the bar at 640px and below.
- The palette is one box that counts as a menu in the box count. Its markup is documented at the top of its rules in `theme.css`; `.palette-box.static` draws it in the page flow for a specimen (`demo/components.html`).

### Canvas and WebGL colours

Canvas and WebGL code that needs a token colour should resolve it through an element rather than read the custom property. `getComputedStyle(root).getPropertyValue('--pin')` returns the unresolved `light-dark(...)` text. Instead, set `probe.style.color = 'var(--pin)'` on a hidden element and read `getComputedStyle(probe).color`. A module script doesn't wait for stylesheets, so wait for the `<link rel=stylesheet>` loads before the first read, or the colours come out as the inherited text colour. Redraw on scheme.js's `schemechange` event, which covers both the OS changing and the user's choice. `--hover`, `--press` and `--temper-wash` are translucent, so composite them over the surface beneath if the scene needs an opaque value.

Scene and editor colours have tokens too, so no product keeps literals for them:

- `--mv-axis-x`, `--mv-axis-y`, `--mv-axis-z`: the scene axes (lines, 3:1 on `--well`).
- `--sketch` and `--sketch-halo`: the sketch stroke over a scene. One value in both schemes, because it is baked into the image the agent reads. No single colour reaches 3:1 on both wells and every part, so draw the halo wider, under the stroke; `tools/contrast.py` checks that one of the two reaches 3:1 on every surface.
- `--syn-keyword`, `--syn-def`, `--syn-meta`, `--syn-comment`, `--syn-string`, `--syn-number`, `--syn-invalid`: source highlighting. `pre.src` and `ol.src` with Loom's `tok-*` classes need no product CSS. Red Hat Mono's heaviest weight is 500, so use `font-weight: 500` for keywords and `600` (which renders as 500) for a definition name, with `font-synthesis-weight: none`.

A CodeMirror 6 theme takes the same tokens: a `HighlightStyle` mapping keywords to `{ color: 'var(--syn-keyword)', fontWeight: 500 }`, definition names to `var(--syn-def)` at 600, strings to `var(--syn-string)`, numbers and constants to `var(--syn-number)`, comments to `var(--syn-comment)`, decorators and builtins to `var(--syn-meta)` and invalid text to `var(--syn-invalid)`. The selection is `var(--temper-wash)` (ink stays on it at AA), a search match is `var(--temper-wash)` too, and the current match is outlined 1.5px in `var(--temper-text)`. Do not mix temper at 25 to 65% into the selection: it falls under 4.5:1 in dark.

## What a product ships

`runtime-files.txt` is the one list of what a product serves and packages: one path or directory per line, no globs (fonts are the directory). Static routes, wheel `force-include`, Canvas's copy list and Trace's `Containerfile` read it; `demo/`, `tools/` and the `*.md` files are not on it.

`tools/bump-style.sh` is a template: copy it to `scripts/bump-style.sh` in a product. `scripts/bump-style.sh [sha-or-tag]` fetches `lib/style`, checks out the ref detached, refuses a ref that is not on `origin/main` or a submodule with changes of its own, checks the runtime list exists, stages the gitlink and prints the log between the old and new pin. It never commits.

### Vendoring into a public product

This repo is private, so a product whose source is public cannot pin it as a submodule. It vendors instead: `tools/vendor-style.sh` copies the files in `runtime-files.txt` into the product's tree, and an update from style is one command. Run it from a style checkout (not a copy of it):

```sh
tools/vendor-style.sh ../mesh/src/mesh/static/style            # vendor HEAD
tools/vendor-style.sh ../mesh/src/mesh/static/style --ref 8580d9a
tools/vendor-style.sh ../mesh/src/mesh/static/style --dry-run  # print the plan, change nothing
tools/vendor-style.sh ../mesh/src/mesh/static/style --check    # for the product's CI
```

- **What it copies.** Exactly what `runtime-files.txt` lists at the ref (a directory is every file under it), read from git, not the working tree, plus `LICENSE` and the `OFL-*.txt` beside any font. It never copies `demo/`, `tools/` or the `*.md` files, and refuses a list that names them. `runtime-files.txt` is the only list; `bump-style.sh` reads the same one.
- **What it refuses.** A ref that is not an ancestor of `origin/main` (it fetches first when it can; the default ref is `HEAD`, so push to style `main` before vendoring), and a style checkout with uncommitted or untracked changes. A refused run writes nothing.
- **Removal.** `<dest>/VENDORED.json` records the source repo, the commit, the commit's date (UTC, so a repeat run is a no-op) and the sha256 of every vendored file. The next run deletes the files the old manifest lists that the list no longer does, and any directory that leaves empty. Files in the destination that the manifest never listed are left alone.
- **`--check`.** Needs no network. It exits non-zero if a vendored file was edited or is missing, if a file was added to the destination by hand, if `VENDORED.json` disagrees with the blob at its commit, or if the commit is not an ancestor of the local `origin/main`. With `--ref` it also fails unless the destination was vendored from exactly that commit. Run it in the product's tests so nobody edits vendored files in place: change style, then vendor again.
- **Leaving paths out.** `<dest>/../vendor-style.exclude`, if present, is one path per line (a file or a directory; blank lines and `#` comments allowed), for what that product does not need, for example `marks/pod-slab.svg`. Excluded paths are neither copied nor listed, and are removed if an earlier run vendored them; `LICENSE` cannot be excluded. A line that matches nothing is warned about. Commit the file with the product.

Vendor into a directory of its own and commit the result, `VENDORED.json` included. The licence files travel with the copy, so the PolyForm and OFL terms in "Licence" below still apply to it.

## Checking a port

`tools/shoot.mjs` is the gate's shot tool. From an omp JS eval cell, with the product running:

```js
const { shoot } = await import('/path/to/style/tools/shoot.mjs');
const table = (await import('/path/to/style/tools/shots/loom.example.mjs')).default;
await shoot(browser, { base: 'http://127.0.0.1:18765', shots: table.shots, allow: table.allow, out: '/tmp/loom-shots' });
```

`shoot(browser)` alone retakes the reference pages into `demo/shots/` (serve the repo root on :8793 first). Each table entry is `{ name, path, state?, ready?, full?, viewports?, schemes?, webgl? }`; the header of `tools/shoot.mjs` documents them, and `tools/shots/loom.example.mjs` is a worked table. Each entry gives `<name>-<scheme>-<width>.png` for light and dark at 1600 and 400 wide. The page is shot once fonts, stylesheets and images are in (plus the entry's own `ready` and `state`); no test hook is needed in the product. The scheme is forced through `localStorage` and `prefers-color-scheme`, so a product that predates `scheme.js` still switches, and the stored choice is removed afterwards.

The result is `{ ok, shots, stale, text }` and `text` is also printed. A shot is clean only if it became ready (20 s limit, then `ready: false`), logged no console error, made no request that failed, answered 4xx/5xx or left the origin, and shows no old look: a computed `font-family` containing Chivo, or a stylesheet reference to `var(--chrome`, `--panel`, `--view`, `--rule-2`, `--code`, `--font` or `--console-h`. A table's `allow` list (`{ match, reason }`) lets a known refusal through, for instance the agent socket in a no-backend run; allowed items are listed per shot. `ok` is true when every shot is clean, so the gate needs no judgement; an agent then reads the PNGs beside `demo/shots/`. PNGs from an earlier run are deleted before shooting, and any left in the folder from a renamed entry are listed as `stale`.

Bumping a product's pin without porting it reports the same faults (old markup under the new theme), which is the point of the probe. Board and 3D views need WebGL: run the browser under the viewer's SwiftShader launcher (`scripts/webgl-browser.sh`) and pass `{ webgl: true }`; entries marked `webgl: true` are otherwise skipped with a note rather than shot blank. The same runner and tables also run headless from the command line, with baselines and a structural check: see "Automated checks".

## Automated checks

Three tiers; an agent or a CI job runs them and reads pass or fail, not a picture.

1. **Fast, every commit** (seconds): `python3 tools/contrast.py`, `node --test tools/`, and `tools/check <product dir>` (static, no browser).
2. **Shots, per change to a screen** (under 30 s): `tools/shot --preset smoke`.
3. **Gate, before a merge** (minutes): `tools/shot --preset full --conform`, then the review agent's pass over the PNGs.

One-off setup: `npm --prefix tools ci` (from a product: `npm --prefix lib/style/tools ci`). It installs `playwright-core` (pinned to the Chromium in `~/.cache/ms-playwright`), `pixelmatch` and `pngjs`, for these tools only; nothing under `tools/` ships (`runtime-files.txt`). Everything below is run as `tools/shot`, or `lib/style/tools/shot` from a product.

### `tools/shot`

```sh
tools/shot --preset smoke                      # the reference pages, one per page shape, light, desktop
tools/shot --preset full --conform             # every reference shot, pixel diff and structural check
tools/shot --table tools/shots/loom.example.mjs --base http://127.0.0.1:18765 --preset full --conform
tools/shot --update-baseline                   # accept the shots (after review)
tools/shot --derive-conformance                # rewrite tools/conformance.json 'expected'
```

`--table` is `reference` (the library's own pages, served by the tool itself, so no server is needed) or a table module, the same format `shoot()` takes in an omp cell (`tools/shots/loom.example.mjs`); `--base` is the running product. It exits 0 when clean, 1 when a shot is not clean, differs from its baseline or fails conformance, 2 on a usage error. `tools/shot --help` lists the rest. Shots are deterministic by construction (fresh context, device scale 1, animations and transitions zeroed through a constructed stylesheet, reduced motion emulated, UTC and en-US), and two runs of the reference pages give byte-identical PNGs.

- **Baselines.** Accepted PNGs live in the product (`<product>/shots/accepted/<name>-<scheme>-<w>.png`; the table's `baseline` or `--baseline` names the directory) and for the reference pages in `demo/shots/`. They are written only by `--update-baseline`, which refuses unless the report is clean, and the commit that changes one says why. A missing baseline fails with its path; a changed shot fails and writes `<name>.diff.png` beside the new shot; a baseline no entry produces is reported as an orphan (`--update-baseline` removes it). Compare is pixelmatch at colour distance 0.02 (renders are deterministic, and 0.1 misses a one-token change of the ground) with 0.1 per cent of pixels allowed to differ; an entry may set `tolerance` only with a `toleranceReason`. `--no-compare` shoots and reports without comparing.
- **Masks.** An entry's `mask` lists CSS selectors of regions that change by design (a clock, a run time, a thumbnail); they are hidden in the shot, so baseline and run agree. Give a masked element a fixed size, or mask its container. `clock` freezes `Date` for a page that shows the time.
- **Presets.** `full` is every entry as the table defines it (the gate: both schemes and both widths for a product table). `smoke` takes the first entry of each `shape` (an entry with no `shape` is its own shape), light, first desktop viewport, and skips `webgl` entries.
- **Structural conformance** (`--conform`). For each entry with a `shape` (`workbench`, `flow`, `list`, `settings`, `overview`, `components`) the tool reads computed style for a fixed list of selectors (body font, `.wb` columns, `.titlebar`, `.vhead`, `.statusbar`, `.btn`, `.input`, `.card`) and the colour tokens (`--ground`, `--well`, ink, rules, state colours, and the product's temper from `data-product`), and compares them with `tools/conformance.json`, tolerance 1 px, per scheme and for desktop and phone. A difference is reported as selector, property, expected, got. A value that differs between two viewports of the same class (a fluid column, a height that follows the window) is not asserted. `conform: false` on an entry leaves it out; say why in a comment. A state variant that changes a selector on purpose (a collapsed inspector column, a phone tab view with no `.vhead`) declares it instead, so the rest of the shape is still checked: `conform: { reason, except?, expect? }`, where `except` is `{ '<selector>': ['prop', ...] | '*' }` (not asserted) and `expect` is `{ '<selector>': 'absent' | { prop: value } }` (asserted instead of the shape's value; a grid is an array of tracks with `null` for a fluid one). `reason` is mandatory and a selector or prop outside the check list is reported as a failure. The check list is data in the JSON file; its `expected` section is generated, so after a library change run `tools/shot --derive-conformance` and commit the diff with the change.
- **Not run in smoke or by default:** WebGL scenes (`webgl: true` entries are skipped with a note unless `--webgl` and a browser with WebGL).

### `tools/check`

`tools/check [dir] [--style <dir>] [--rules a,b] [--json]` reads a product tree without a browser and reports `file:line: [rule] message`: `old-look` (old tokens, Chivo), `inline-style` (a `style=""` attribute in markup, templates, or markup built in a script), `hex` (a hex colour outside the exceptions in `tools/conformance.json` `check`; hex in a `data-*` attribute is data), `confirm` (a `confirm()` call; use `confirm.js`), `emdash` (an em dash in a string or in markup text) and `runtime-files` (every path in `runtime-files.txt` exists, in `--style`, `lib/style` or the tree itself). A vendored library directory (one that holds `runtime-files.txt` or `VENDORED.json`, which `tools/vendor-style.sh` writes) is not scanned. A line, or the line above it, with `check-ok` and a reason is skipped. Exit 0 clean, 1 findings.

### Wiring a product

Run the fast tier from the product's own test command, and the gate before a merge:

```sh
npm --prefix lib/style/tools ci
lib/style/tools/check .
lib/style/tools/shot --table tests/shots.mjs --base http://127.0.0.1:$PORT --preset smoke --conform    # per change
lib/style/tools/shot --table tests/shots.mjs --base http://127.0.0.1:$PORT --preset full --conform     # before a merge
```

The table sets `baseline: '../shots/accepted'` (relative to the table file) and `shape` on each entry; a product with an unavoidable refusal or 404 in its test run lists it under `allow` with a reason.

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
- Fields: `.input` (on an input, select or textarea), `.inputwrap`, the command field `.cmd` and its palette (`.palette`, `.palette-box`, `.palette-input`, `.palette-list`, `.palette-group`, `.palette-row`, `.palette-title`, `.palette-hint`, `.palette-empty`), `kbd`.
- Checkboxes and radios are styled wherever they are; `input.switch` is a toggle, 36 x 20, off an outlined track with a quiet thumb, on solid ink, the global focus ring, 50% when disabled; `label.check` lays one out with its text.
- `.seg` (segmented control, `.icons`, `.sm`), `.chips` and `.chip` (`aria-pressed=true`, or `aria-current` on a chip that is a link; `.pagehead .chips` puts them in a title row), the count `.n`, the label `.tag`.
- `[data-scheme-toggle]`, the scheme button.
- `.confirm` and `confirm.js` (an ES module: `import { confirmRow } from "/style/confirm.js"` in a `<script type="module">` or with `import()`; the product serves it with the other runtime files): the inline approval row that replaces the browser's `confirm()`. `confirmRow(anchor, {title, detail, fields, action, danger, cancel, extra, into})` returns a promise that is true for the action and false for Cancel, Escape, another row opening or the anchor leaving the page. `extra` is a DOM node or an array of them, placed inside the row between the detail and the actions (a warning, a Details `.disc`); the caller builds it, and it is not parsed from a string. Inside a register row (`.reg .proj > .confirm`) it spans the row's columns (specimen: `demo/list.html`). It opens in place (a `.dt-detail` under a table row, `into`, or after the anchor), disables the opener while open and returns focus to it. A spend uses the solid ink button, a destructive action danger text; neither is ember. It is for in-page actions: a `beforeunload` guard stays with the browser's own prompt.

**Lamps, markers, readouts**
- `.lamp` with `.ok`, `.warn`, `.bad`, `.none`, `.run`; `.state[data-kind=good|busy|gap|bad|pending|waiting]` (an `a.state` is underlined as a link); `.conn[data-state]`; `.agentstatus[data-state]`.
- `.mk`, the plate marker, with `.mk--human`, `.mk--agent` (or `.open`), `.sel`, `.resolved`; severity marks `.mk--sev` with `.mk--defect` or `.mk--warning`.
- `.readout` holding a `.val` and a `.lg`; `.val.zero`, `.val.lg`.
- `.pline` (`.p10` to `.p100`, `.indet`, `.steady`), `progress.meter`.
- `.paper` for a sheet or thumbnail.

**Menus, disclosures, text**
- `.menuwrap` with a `[data-menu]` button and a `.menu`; `details.more` with a `.menu`.
- `details.disc` with `.disc-body`, stacked in `.discs`.
- `ul.tree` (a file tree: nested lists, a `<details>` per folder, `li.file`, hairline guides; names are mono paths).
- `.subhead`, `.empty`, `.hint`, `.note`, `.metaline`, and `.notice` with `--warn`, `--danger` or `--ok`.
- `dl.fields` (wrapping labelled data), `dl.fl` (label and value columns; `.ruled`, `.cols2`, and `.form` for one that holds controls: the label at the control's height, a `.choices` row of `label.check`, a `.hint` under the control), `.propshead` and `table.props`.

**Tables**
- `table.dtable` (`.num`, `.mono`, `tr[aria-current]`, `.flush`).
- The selectable grid table `.dt` with `.dt-bulk`, `.dt-head`, `.dt-row[aria-selected]`, `.dt-detail`, the expander `.exp`, and the cell roles `.dt-main`, `.dt-sub`, `.dt-state`, `.dt-act`. It stacks at 640px.

**Workbench frame**
- `.wb` with `data-rail=none`, `data-console=none`, `data-layout=drawing|split|agent`, `data-side=review|timeline`, `data-preview`; `body.panel-open` shows the inspector; `--insp-w` and `--chat-w` set the pane widths; `frame.js` drives the layout, the Panel button, the phone tab bar and the `.colgrip` drag handles.
- Title bar: `.titlebar` with `.tb-left`, `.mark`, `.prod`, `.tsep`, `.crumbs` or `.doc`, `.stageline` and `.stagebar`, `.cmd`, `.tb-right`, `.prodtabs`. `.cmd` is optional: without it the bar is two columns, so `.tb-right` (scheme toggle, account menu) stays at the right edge and `.tb-left` at the left, on a `.page` and a `.wb`, at every width. `list.html` and `settings.html` have no `.cmd`; `workbench.html?cmd=none` is the workbench specimen (`workbench-nocmd-*` shots).
- View tabs: `.vhead` with `.vtab`, `.vsep`, `.vtab.second`, `.meta`, `.right`.
- Tool rail: `.rail` with `.tool` and its shortcut `.k`.
- View: `.view`, `.canvas`, `.hud` (`--tl`, `--tr`, `--bl`, `--br`), `.subtabs` and `.subtab`, `.zoom`, `.previewbar`.
- A view's own panel: `.canvas.split` with `aside.vpanel` beside a `.stage`, holding `.chips`, `.layerlist` and `.layerrow`, `.slider`, `.query`, `.qmeta`, `.qacts`, `.results` and `.hit`.
- Pins: SVG `g.pin` (`.model`, `.resolved`, `.is-selected`, `.ring`), `.pindraft`, the HTML `.hpin` for a paper sheet, and the floating `form.composer`.
- Inspector: `.inspector`, `.ihead`, `.ptabs`, `.ipane`, `.iscroll`, `.toggles`, `details.sec` and `.secbody`, `.row` with `.rhead` (`.is-selected`), `.ifoot`.
- Timeline: `.tl` and `.ev` with `.node--msg`, `--build`, `--ev`, `--wait`, `--now`; `.ebody`, `.eh`, `.eq`, `.ed`, `.chg`, `.rp`, `.eacts`, `form.restore`, `.is-preview`. No product draws it today: Mesh's Timeline and restore are not built (Q25), so the reference pages no longer show it and a port does not add it.
- Status bar: `.statusbar` with `.conn`, `.alert`, `.push`, `.k`, `b`, `.pv`.

**Agent pane and settings** (annealage-ember's markup)
- `#chat` with its header (`.agentstatus`, `.chatwho`, `.chatusage`, `.working`, `.conn`, `.hdrbtn`, `details.more`), `.chatbanner[data-kind]`, `#chatLog` (`.turn`, `.msg.user`, `.msg.assistant`, `.msg.action`, `.segments`, `.text`, `details.thinking`, `details.toolgroup`, `details.toolcard`, `pre.toolinput`, `pre.toolresult`, `.turnerrors`, `.chathistory`, `.attachthumbs`, `.contextchip`), `.side`, `.chathint`, `#chatPending` with `.permcard`, and `#chatComposer` (`.chatmodelrow`, `.attachstrip`, `.attachchip`, `#chatComposerRow`, `.attachbtn`, `#chatInput`, `.chatbtns`).
- `.modal` (a `div` or a `<dialog class="modal">`, closed one hidden; the dialog's backdrop is not drawn, `.modal` paints the scrim; `.toolcard` single-line rows read as in `#chat`) and `.setpanel` with `.setwarn`, `.setbody`, `.setrow`, `.setlabel`, `.setinput`, `.setnote`, `.sethelp`, `.diagrow`, `.logrow`, `.logtail`, `.loginflow`.
- `#toast` (class `ok` or `err`) and `#err`, which ember's `ui.js` writes: a floating message row with a lamp.
- The project views `project.js` builds, all `pj-*` classes: `.pj-header`, `.pj-history`, `.pj-lineage`, `.pj-projects` and the `.pj-modal` dialog. The theme draws their look and layout; `demo/ember.html` shows them under ember's real `agent.css` and `project.css`.

**Review** (a product that runs a review rather than a chat)
- `section.console` with `.chead` and `.cbody`, `ol.steps` of `li.step[data-state=done|running|waiting|queued|failed|skipped|cancelled]` (cancelled is a run stopped by the user: solid grey lamp, readable text; label it "Stopped"), `pre.log`.
- `.filters` and `.frow`; `details.finding` with `.fhead`, `.sev[data-sev]`, `.fid`, `.fstat[data-status]`, `.ftri`, `.fver`, `.fstale`, `.claim`, `.subj`, `.fbody`, `ul.evidence`, `form.triageform`.
- Coverage: `.covcounts`, `.covlist`, `.covhead`.

**Pages** (`pages.css`)
- `.page` with `.pagebody`, `.pagehead`, `.lede`, `.measure`, `.pageacts`; `section.card` (a ruled section, not a box); `.linkrow`.
- `.drop` and `.dropstrip`.
- `form.inlineform`: a form opened in place under the thing it acts on (a row's `.dt-detail`, or directly in `.pagebody` under the title row): `.ch` title, `.cd` line, `dl.fl.form` fields, `details.disc` options, `.notice`, a `dl.fl.form[role=status]` result, `.cacts`. `.pagebody > .notice` and `.pagebody > .blk-h` space a notice and a section heading on a page, and `.pagebody .empty` aligns an empty line to the gutter.
- Flow: `.flow`, `.flowside`, `ol.flowsteps` of `li.flowstep[data-state=done|current|open|locked]` (the step control is an `a` or a `button`, styled alike), `.flowfacts`, `.flowmain`, `.flowview` (`.split`), `.flowscroll`, `.flowhead`, `.flowaside`, `.flowfoot`; `.ready` with `.figs`, `.ready-r` and `.segbar`; `.optlist` and `.opt`; `.besides` and `.sidenote`; `dl.fl.stack`.
- Register: `.reg[data-view=list|tiles]` with `.reg-head`, `.projs`, `.proj` and its `.p-thumb`, `.p-name`, `.p-rev`, `.p-parts`, `.p-nets`, `.p-state`, `.p-opened`, `.p-created`, `.p-act`.
- Settings: `.navpage` with `.sidenav` and `.navmain`; `.blk`, `.blk-h`, `.rows`, `.fr` (`.item`, `.sum`, `.total`), `.fr-act`; `table.dtable.fixed` with `col.c-label`, `.c-date`, `.c-act`.

## Licence

The CSS, JS and icons are under the PolyForm Noncommercial License 1.0.0 (`LICENSE`), the same as the products. The fonts are OFL (`fonts/OFL-InstrumentSans.txt`, `fonts/OFL-RedHatMono.txt`). The marks are Annealage trademarks and aren't licensed for other use.
