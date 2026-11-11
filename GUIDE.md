# Annealage UI guide: Hairline + plate

This is how an Annealage product screen is designed. It applies to every web UI under the brand: the Loom, Trace, Mesh, Canvas and Pod workbenches, guided flows like Trace's setup, and the hosted front door (sign-in, project chooser, account). `tokens.css`, `theme.css` and `pages.css` implement it, `README.md` has the class names, and `MIGRATION.md` covers moving a product over from the earlier Workbench theme. This file is the reasoning, so that a screen nobody has drawn yet comes out looking like the rest.

The reference pages show it in use. Each takes `?product=loom|trace|mesh|canvas|pod` and `?theme=light|dark`:

| Page | Shows |
|---|---|
| [demo/components.html](demo/components.html) | every component and state, the visual spec |
| [demo/workbench.html](demo/workbench.html?product=loom) | a workbench ([Trace](demo/workbench.html?product=trace), [Mesh](demo/workbench.html?product=mesh), [Canvas](demo/workbench.html?product=canvas)) |
| [demo/flow.html](demo/flow.html) | a guided flow (Trace's setup) |
| [demo/list.html](demo/list.html) | the project chooser, as a register and as tiles |
| [demo/settings.html](demo/settings.html) | account and settings |

The look in one sentence: one continuous surface divided by hairlines, with the drawing as the largest thing on screen, data set as data, and the mark's 45° cut on the few things an engineer points at.

## The five rules

If you only read one section, read this one.

1. **Hairlines, not boxes.** Regions are separated by a 1px rule on a shared ground. Nothing gets a border all the way round unless it is an input, a menu, or the one thing waiting on the human.
2. **The work is the biggest thing.** The drawing, model, table or log gets the space. Chrome is two rows at the top and one at the bottom, and every pane can be closed.
3. **Data looks like data.** Refs, part numbers, nets, paths, coordinates, counts, times and costs are mono with tabular numerals, in aligned columns. Labels and sentences are never mono.
4. **Ember means "needs you", once.** At most one ember element per view, and only when something is blocked on the human. Everything else is ink, a state colour, or the product's temper.
5. **One line of help.** If a screen needs a paragraph to explain itself, the screen is wrong. Limits and legal notes go behind a disclosure.

## Surfaces

There are three tones and each has one job.

| Token | Job | Used for |
|---|---|---|
| `--ground` | the surface everything sits on | bars, panes, pages, tables, the agent log |
| `--well` | a recess | the canvas surround behind a drawing or model, the field of a readout |
| `--field` | raised, takes input or attention | inputs, menus, the approval, an expanded tool block, the command field |

A new region is ground with a hairline, not a new tone. If you find yourself wanting a fourth grey, use a hairline or spacing instead.

Paper is separate: a schematic sheet or a thumbnail of one is `--paper` in both schemes. It is never veiled, dimmed or inverted in dark, because the linework's colours carry meaning.

Dark is graphite, not black. Ground is `#16191C`, the well is darker and the field is lighter, each by a step you can see. If two neighbouring surfaces can't be told apart in dark, the step is too small; don't fix it by adding a border.

## Colour

| Role | Token | Where |
|---|---|---|
| Text and primary actions | `--ink` | body text, the primary button (solid ink), checked controls |
| Secondary text | `--ink-2` | labels, legends, secondary tabs |
| Third level | `--ink-3` | placeholders, coordinates beside a name. Not on the well or on a wash. |
| Product identity | `--temper`, `--temper-text`, `--temper-wash` | the active tab underline, the selected pin or row, the current step, the focus ring, the agent-working line |
| Needs you | `--ember` | the Allow button of a pending approval and the status bar alert that jumps to it |
| Good | `--quench` | ok, done, covered, connected, verified |
| Bad | `--danger` | errors, defects, Deny, Delete |
| Caution | `--warn` | warnings, candidates, unconfirmed |

- Temper is small. It marks selection and "where you are", never a large fill, a header band or a button. The greys carry no tint of it; the products are told apart by their mark and their temper on the selected thing.
- Platform pages (project chooser, account, sign-in) have no temper. Selection and the active tab there are ink. A product's own mark or name may appear in its colours.
- Severity is never ember. Critical is danger and major is warn. A run that failed is danger; a run that is waiting for the user's decision is ember.
- A primary button is solid ink. There is one per view, at the end of the flow (bottom right of a step, right of a title row).
- No gradients, glows, blur or tinted shadows. The only shadow is under a menu.

## Type

Instrument Sans for everything that is read, Red Hat Mono for everything that is data.

| Use | Face | Size / line | Weight |
|---|---|---|---|
| UI text, table cells, buttons | sans | 13 / 18 | 400, 500 for the active or named thing |
| Reading text (agent messages, comments) | sans | 14 / 21 | 400 |
| Table headers, section headers, status bar | sans | 12 | 400 headers in ink-2, 600 section headers |
| Page and step titles | sans | 18 | 600 |
| Data | mono | 12, tabular numerals | 400, 500 for the key value |
| Headline readouts | mono | 18 | 400 |

- Hierarchy comes from weight and ink level, not from size. Nothing on a product screen is larger than 18px.
- Sentence case everywhere. No uppercase labels, no letterspacing, no badges in capitals.
- The unit word beside a number is sans: `7` is mono, "gaps" is not.
- Mono is not a style for labels, headings or buttons. If it isn't something you could copy into a terminal, a BOM or a search box, it's sans.

## Shape

- Controls and menus have a 6px radius. Panes, bars, tables and rows have none.
- Controls are 28px high. The top bar is 40px, the tab row 34px, the status bar 24px.
- Icons are 16px, 1.5 stroke, round joins, from `icons.svg`. An icon-only button always has a `title` and an `aria-label`.
- Secondary buttons are text with a hover tone, no outline. An outline on every row action puts a box on every row.

### The plate cut

One corner clipped at 45°, taken from the mark. It goes on the things that stand for a point of attention:

- pins and callouts on a drawing, and their numbers in the list beside it
- step markers in a guided flow
- the ember Allow button and its status bar alert

It does not go on ordinary buttons, tabs, inputs, cards or panels. If it is on more than a handful of elements in a view it has stopped being a signature. One corner, never two.

A human's marker is solid ink, the agent's is a ruled outline, the selected one is temper.

### Lamps

A state is a small square lamp and a word: `■ Covered`, `■ 1 candidate`, `□ No datasheet`. Square, 8px, never round, never a pill around the word. The lamp's colour is quench, warn, danger or ink-3; an empty (outlined) lamp means "nothing yet". The word is always there, so colour is never the only signal.

### Readouts

A readout is a mono numeral in a recessed field with a plain legend beside or under it: `[ 0 ] errors`, `[ $0.41 ] cost`. Use one for a figure the engineer checks repeatedly and that summarises the state of the work:

- build or check counts in the tab row
- context and cost in the agent header
- the headline counts at the top of a step or report
- one total on a page of figures

Don't use one for a value that already sits in a table or a field list, in the status bar, or for every number on the page. When readouts were tried on the inspector's build list and the project register they added boxes and made nothing easier to find. If more than about six are visible at once, some of them should be plain mono.

## Choosing a component

| You have | Use | Not |
|---|---|---|
| A set of similar things (parts, files, projects, sessions, findings) | a table with aligned columns, hairline rows, one action per row and a `...` menu for the rest | a stack of cards with the same buttons on each |
| The same action on several rows | row checkboxes and a bulk bar that appears on selection | a button per row per action |
| Name and value pairs | a field list (label column in ink-2, value column) | a bulleted list, or a sentence joined with middle dots |
| A state | lamp and word | a pill, a badge, an icon alone |
| A few headline figures | readouts, with a proportional bar if they are parts of a whole | a dot-separated string |
| Run any action from the keyboard, or find a command by name | the command field in the title bar, which opens the palette (`palette.js`; a menu-family box that counts as a menu) | a second search box in the page, or a shortcut with no list to learn it from |
| Progress through fixed stages | the step spine (guided flow) or the stage line (workbench top bar) | bordered step buttons, a "locked" badge |
| Help | one line under the title | a note box, a banner, a paragraph |
| A caveat or limit | a disclosure, or a field list beside the action | a left-ruled callout |
| Something went wrong | an inline message row with a danger lamp, next to the thing that failed | a coloured box across the page |
| Something needs a decision from the human | the approval: the one bordered box, with the ember Allow | a modal, a toast |
| The page's own action needs confirming (a delete, leaving, a run that spends) | the inline confirm row (`confirm.js`): the approval's box opened in place, solid ink for a spend, danger text for a destructive action, no ember | the browser's `confirm()`, a modal |
| More actions than fit | a menu from a `...` or labelled button | a second row of buttons |
| Nothing to show yet | one line saying what will appear and the action that produces it | an illustration, a card with a heading |
| Choosing a file | a drop zone that is also a button, listing what is accepted as a field list | the browser's raw file input |

## Page shapes

Every page starts with the same top bar: mark, product name, breadcrumb, then page controls on the right ending with the theme switch and settings or the account menu. The mark sits in a 40px column, and the product name, the first tab, the canvas edge and page titles all start on that 40px line. Keep it; it is what makes the workbench and the front door read as one tool.

### Workbench

For working on a design with a drawing or model.

- Row 1 (40px): mark, product, breadcrumb, stage, command field, then live state, layout controls as icons, settings.
- Row 2 (34px): primary view tabs, a hairline, secondary tabs in ink-2, and the build readouts at the right.
- Body: tool rail 40px, the well with the drawing, inspector 300px, agent 400px. Inspector and agent each close with one click and the drawing takes the space.
- Sheet or document tabs, cursor and zoom sit on the well's bottom edge.
- Status bar (24px): connection, what the agent is doing, the ember alert if there is one, then the document's figures at the right.

The agent pane is a log, not a chat: messages run full width with a name label, tool calls are single lines that expand, and the only box is a pending approval.

### Guided flow

For a job with a fixed order (import, check, fill gaps, run).

- Same top bar. Left column 260px: the steps on a hairline spine, each with a plate marker and one line of state, then facts about the thing being worked on (thumbnail, field list).
- Main: title, one line of help, the content at full width, and a pinned footer with Back on the left and the one primary on the right. The footer says what happens next in a few words ("7 gaps will be carried into the report").
- A step that can't be opened yet is ink-3 with its reason as its state line. No lock icons or badges.
- The content of a step is usually a table. Use the full width; a narrow centred column is for reading text, not for work.

### List and chooser

For picking a project or any other collection.

- Title row with the count, search, sort, the List / Tiles switch, and the primary ("New project").
- One markup, two drawings: a register table (name, rev, counts, state, last opened) or tiles where the thumbnail is the tile.
- A thing that is starting or running is a row state with a lamp, not a separate waiting page.
- Creating by upload is a slim drop strip above the list, or the first tile.

### Settings and account

- A text nav on the left (216px), sections as labelled rows on hairlines on the right. Label column, value column, action at the right end of the row.
- Destructive actions live in their own section at the end, in danger text, with the consequence in one line.
- Tables whose columns mean the same thing line up with each other down the page.

### Small screens

List, guided flow and sign-in pages work at 400px: the step spine becomes a strip across the top, table rows stack into two lines with the name and state first, and the bar drops labels before it drops controls. Workbenches are desktop tools; below about 900px they show the drawing and one pane.

## Words

- Sentence case. Buttons are a verb and an object where there's room: "Request from Datum", "Continue to review".
- Say the specific thing: "7 gaps will be carried into the report", not "Some items need attention".
- Dates are `10 Nov 2026 10:35 UTC` in data and "today 09:12" in activity. Durations are `1:12`.
- No emoji, no arrows on buttons, no sparkle icons, no "AI" labels. The agent is "the agent".
- No implementation detail on screen. The user sees their design by its title, sheet name and revision, never by the file the product happens to store it in (`*.kicad_sch`, a build directory, an internal id). A file name appears only where the user handed over or asked for that file: the upload list, a download.
- Not used: revolutionary, seamless, transform, supercharge, unleash, reimagine, comprehensive, robust, cutting-edge, next-generation, paradigm.

## Motion

Almost none. A menu appears, a pane opens, a row expands, all without animation or in under 120ms. The one moving thing is the temper line under the agent header while a turn runs. Everything respects `prefers-reduced-motion`.

## What makes a screen look machine-made

Check a new screen against this list. Each of these has shipped in an Annealage UI before and was removed.

- note boxes with a left accent rule
- uppercase tracked labels and uppercase badges
- `A · B · C` strings in place of fields
- pills on everything, identical rounded cards with the same soft shadow
- gradients, glows, glass blur
- a narrow centred column with a big heading and stacked cards
- an outline button on every row
- mono used for labels
- paragraphs of caveats above the one action on the page
- every region in its own bordered box, in its own grey
- fade-and-slide on everything

## Reviewing a screen

Before a screen ships, in both schemes:

1. Squint. Is the work (drawing, table, log) the biggest and highest-contrast thing?
2. Count the boxes. Each fully bordered element should be an input, a menu, a readout or the approval.
3. Count the ember. Zero, or one with something actually blocked on the human.
4. Count the plate cuts and readouts. A handful each.
5. Read every mono string. Is it data?
6. Read every sentence. Can it be a field, a state or nothing?
7. Does text start on the 40px line, and do columns line up between neighbouring tables?
8. Tab through it. Is focus visible on every control, including the cut ones?
9. Dark: can you tell ground, well and field apart, and is the paper still paper?
10. Text contrast is AA on the surface it actually sits on (ink-3 is the one to check).

## Technical constraints

- No `style=""` attributes in markup and no external fonts or CDNs; the products run under a CSP that forbids both. Setting a style from JS is fine.
- Colours come from tokens through `light-dark()`, and `<html data-theme>` forces a scheme. Don't hard-code a hex in product CSS; if a token is missing, add it here.
- Light and dark are both designed and both checked. Neither is derived from the other by a filter.
