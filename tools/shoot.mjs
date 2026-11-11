// The port gate tool: shoot a running product (or the reference pages) in light
// and dark at desktop and phone width, and report whether each shot is clean.
//
// From an omp JS eval cell (it needs the `browser` global):
//
//   const { shoot } = await import('/path/to/style/tools/shoot.mjs');
//
//   // The reference pages; serve the repo root first:
//   //   python3 -m http.server 8793 --bind 127.0.0.1 -d .
//   await shoot(browser);
//   await shoot(browser, { only: ['workbench-loom-dark'] });
//
//   // A product:
//   await shoot(browser, { base: 'http://127.0.0.1:18765', shots: table, out: '/tmp/loom-shots' });
//
// A shot table is an array of entries:
//
//   { name, path, state?, ready?, full?, viewports?, schemes?, webgl?, shape?, mask?, clock?, tolerance?, toleranceReason?, conform? }
//
//   name       file stem; the PNGs are <name>-<scheme>-<width>.png
//   path       URL path (and query) under `base`
//   state      async (tab) => {...} that puts the page into the state to shoot
//   ready      a CSS selector that must exist, or a function evaluated in the page
//              that must return true, after the generic readiness below
//   full       full-page shot
//   viewports  [[w, h], ...], default [[1600, 1000], [400, 860]]
//   schemes    default ['light', 'dark']
//   webgl      the view needs WebGL; skipped with a note unless shoot() gets {webgl: true}
//   shape      page shape for the presets and the structural check: workbench | flow |
//              list | settings | components (tools/shot, tools/conformance.json)
//   mask       CSS selectors of regions that change by design (a clock, a run time, a
//              thumbnail); they are hidden (visibility) in the shot, so the baseline
//              diff ignores them. Give a mask a fixed size, or mask its container.
//   clock      ISO time to freeze Date at (a page that shows the time)
//   tolerance  fraction of pixels allowed to differ from the baseline (default 0.001),
//              with toleranceReason, a mandatory comment saying why it is loosened
//   conform    false to leave the entry out of the structural check (give a reason in a comment), or
//              an override { reason, except?, expect? } for a state variant that differs from its
//              shape on purpose, so the rest of the shape is still checked:
//                except  { '<selector>': ['prop', ...] | '*' }   not asserted
//                expect  { '<selector>': 'absent' | { prop: value } }   asserted instead of the shape's value
//              a selector is one of `checks` in tools/conformance.json; a value is a string, or an array
//              of tracks with null for a fluid one; reason is mandatory (tools/lib/conform.mjs)
//
// Generic readiness: document.fonts.ready, every <link rel=stylesheet> loaded, every
// <img> complete, window.__shotReady === true when the page defines it, then the entry's
// own `ready`, then a settle delay. Nothing is added to the product's pages.
//
// Result: { ok, shots: [{ name, file, ready, errors, failed, allowed, fonts, oldLook, clean }],
// stale, text }. A shot is clean when it became ready, logged no console error, made no
// request that failed (4xx, 5xx, no response) or left the origin, and shows none of the
// old look (a Chivo font-family, or a reference to an old custom property). `allow` entries,
// { match: string | RegExp, reason }, move a console error or failed request into `allowed`.
// `stale` lists PNGs in `out` this run did not write. No result is ever a judgement call:
// `ok` is true only when every shot is clean.
//
// Every shot is deterministic by construction: animations and transitions are zeroed (a
// constructed stylesheet, so a style-src 'self' policy does not block it) and
// prefers-reduced-motion is emulated; the caret is hidden. The cache is off.
//
// The scheme is forced twice: localStorage['annealage.scheme'] is set before the page
// loads (scheme.js reads it) and prefers-color-scheme is emulated (pages without
// scheme.js follow the OS). The stored value is removed again when the shot is done.

import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const SCHEME_KEY = 'annealage.scheme';
const DEFAULT_VIEWPORTS = [[1600, 1000], [400, 860]];
const DEFAULT_SCHEMES = ['light', 'dark'];
const READY_TIMEOUT_MS = 20000;
const SETTLE_MS = 300;

// Determinism: zero animations and transitions, hide the caret. A constructed
// stylesheet is not blocked by a style-src 'self' policy, unlike a <style> element.
const CALM_CSS = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}';
const adopt = (css) => `(() => { try { const s = new CSSStyleSheet(); s.replaceSync(${JSON.stringify(css)}); document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; } catch (e) {} })()`;
const clockScript = (iso) => `(() => { const T = new Date(${JSON.stringify(iso)}).getTime(); const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } } window.Date = F; })()`;

const ref = (name, path, scheme, w, h, shape, extra = {}) => ({ name, file: name, path, schemes: [scheme], viewports: [[w, h]], shape, ...extra });
const wb = (product, scheme) => ref(`workbench-${product}-${scheme}`, `workbench.html?product=${product}&theme=${scheme}`, scheme, 1600, 1000, 'workbench');

// Structural conformance for a state variant: what it changes on purpose, as an override of its shape (see `conform` above).
// .wb columns are [rail, centre, inspector, agent]; 'drawing' and 'agent' are the layout focus buttons (the rail stays, the other columns collapse or take the width).
const wbCols = (cols, reason) => ({ reason, expect: { '.wb': { gridTemplateColumns: cols } } });
const FOCUS_DRAWING = wbCols(['40px', null, '300px', '0px'], 'layout focus "drawing" closes the agent column; the inspector keeps its width');
const FOCUS_AGENT = wbCols(['0px', '0px', '0px', null], 'layout focus "agent" gives the agent column the whole window and collapses the rail, centre and inspector');
const INSPECTOR_CLOSED = wbCols(['40px', null, '0px', '400px'], 'the inspector toggle collapses the inspector column; the centre takes its width');
const INSPECTOR_WIDE = wbCols(['40px', null, '428px', '400px'], 'inspector column dragged (8 steps of the handle) from 300px to 428px');
const AGENT_WIDE = wbCols(['40px', null, '300px', '592px'], 'agent column dragged (12 steps of the handle) from 400px to 592px');
const PHONE_TAB = { reason: 'a phone tab view fills the page below the title bar; the desktop .vhead is not drawn', expect: { '.vhead': 'absent' } };

// States for the reference table: click a selector; press ArrowLeft n times on a column handle (n = 0 only focuses it, by keyboard).
const click = (sel) => async (tab) => { await tab.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`); };
const grip = (key, n) => async (tab) => {
  await tab.run(async ({ page }, k, times) => {
    await page.keyboard.press('Shift');
    await page.evaluate((kk) => document.querySelector(`[data-grip="${kk}"]`).focus(), k);
    for (let i = 0; i < times; i++) await page.keyboard.press('ArrowLeft');
  }, { args: [key, n] });
};

export const SHOTS_REFERENCE = [
  ref('components-light', 'components.html?theme=light', 'light', 1440, 1000, 'components', { full: true }),
  ref('components-dark', 'components.html?theme=dark', 'dark', 1440, 1000, 'components', { full: true }),
  wb('loom', 'light'), wb('loom', 'dark'),
  wb('trace', 'light'), wb('trace', 'dark'),
  wb('canvas', 'light'), wb('canvas', 'dark'),
  wb('mesh', 'light'), wb('mesh', 'dark'),
  ref('workbench-loom-phone', 'workbench.html?product=loom&theme=light', 'light', 400, 860, 'workbench'),
  ref('flow-upload-light', 'flow.html?theme=light#upload', 'light', 1440, 1000, 'flow'),
  ref('flow-datasheets-light', 'flow.html?theme=light#datasheets', 'light', 1440, 1000, 'flow'),
  ref('flow-datasheets-dark', 'flow.html?theme=dark#datasheets', 'dark', 1440, 1000, 'flow'),
  ref('flow-review-light', 'flow.html?theme=light#review', 'light', 1440, 1000, 'flow'),
  ref('flow-phone-light', 'flow.html?theme=light#datasheets', 'light', 400, 860, 'flow'),
  ref('flow-phone-dark', 'flow.html?theme=dark#datasheets', 'dark', 400, 860, 'flow'),
  ref('list-list-light', 'list.html?theme=light#list', 'light', 1440, 1000, 'list'),
  ref('list-list-dark', 'list.html?theme=dark#list', 'dark', 1440, 1000, 'list'),
  ref('list-tiles-light', 'list.html?theme=light#tiles', 'light', 1440, 1000, 'list'),
  ref('list-tiles-dark', 'list.html?theme=dark#tiles', 'dark', 1440, 1000, 'list'),
  ref('list-phone-light', 'list.html?theme=light#list', 'light', 400, 860, 'list'),
  ref('settings-overview-light', 'settings.html?theme=light#overview', 'light', 1440, 1000, 'settings'),
  ref('settings-security-dark', 'settings.html?theme=dark#security', 'dark', 1440, 1000, 'settings'),
  // Ember's reference page (S1): its four routes, and ?ember=0 (ember's own sheets dropped).
  // Shape 'ember' has no entry in conformance.json: the page is a workbench with ember's views, so it is left out of the structural check.
  ...['project', 'rename', 'dialog', 'settings'].map((r) => ref(`ember-${r}`, `ember.html?product=loom#${r}`, 'light', 1600, 1000, 'ember', { conform: false })),
  ...['project', 'rename', 'dialog', 'settings'].map((r) => ref(`ember-${r}-dark`, `ember.html?product=loom&theme=dark#${r}`, 'dark', 1600, 1000, 'ember', { conform: false })),
  ref('ember-project-phone', 'ember.html?product=loom#project', 'light', 400, 860, 'ember', { conform: false }),
  ref('ember-noember-light', 'ember.html?product=loom&ember=0#project', 'light', 1600, 1000, 'ember', { conform: false }),
  ref('ember-noember-dark', 'ember.html?product=loom&theme=dark&ember=0#project', 'dark', 1600, 1000, 'ember', { conform: false }),
  // Confirm row (S3): ?confirm=1 opens the first visible one.
  ref('flow-confirm-light', 'flow.html?theme=light&confirm=1#datasheets', 'light', 1440, 1000, 'flow'),
  ref('flow-confirm-dark', 'flow.html?theme=dark&confirm=1#datasheets', 'dark', 1440, 1000, 'flow'),
  ref('settings-confirm-light', 'settings.html?theme=light&confirm=1#security', 'light', 1440, 1000, 'settings'),
  ref('settings-confirm-dark', 'settings.html?theme=dark&confirm=1#security', 'dark', 1440, 1000, 'settings'),
  ref('workbench-confirm-light', 'workbench.html?product=loom&theme=light&confirm=1', 'light', 1600, 1000, 'workbench'),
  ref('workbench-confirm-dark', 'workbench.html?product=loom&theme=dark&confirm=1', 'dark', 1600, 1000, 'workbench'),
  ref('components-confirm-light', 'components.html?theme=light&confirm=1', 'light', 1440, 1000, 'components', { full: true }),
  // Palette (S12): open, filtered ("la"), and the go-to query; desktop and phone.
  ...['workbench.html?product=loom&', 'flow.html?', 'components.html?'].flatMap((p) => {
    const page = p.split('.')[0];
    const shape = page;
    return ['1', 'la', 'go'].flatMap((v) => [[1600, 1000], [400, 860]].flatMap(([w, h]) => ['light', 'dark'].map((s) =>
      ref(`${page}-palette-${v === '1' ? 'open' : v}-${s}-${w}`, `${p}theme=${s}&palette=${v}${page === 'flow' ? '#datasheets' : ''}`, s, w, h, shape, { ready: '.palette-box' }))));
  }),
  // Frame (S2): layout focus, inspector closed and reopened, dragged columns, keyboard focus on a handle, phone tab bar.
  ...[['drawing', 'drawing'], ['agent', 'agent']].flatMap(([id]) => ['light', 'dark'].map((s) =>
    ref(`workbench-layout-${id}-${s}`, `workbench.html?product=loom&theme=${s}`, s, 1600, 1000, 'workbench', { state: click(`[data-layout-set="${id}"]`), conform: id === 'drawing' ? FOCUS_DRAWING : FOCUS_AGENT }))),
  ...['light', 'dark'].flatMap((s) => [
    ref(`workbench-inspector-closed-${s}`, `workbench.html?product=loom&theme=${s}`, s, 1600, 1000, 'workbench', { state: click('#panelBtn'), conform: INSPECTOR_CLOSED }),
    ref(`workbench-inspector-wide-${s}`, `workbench.html?product=loom&theme=${s}`, s, 1600, 1000, 'workbench', { state: grip('insp', 8), conform: INSPECTOR_WIDE }),
    ref(`workbench-agent-wide-${s}`, `workbench.html?product=loom&theme=${s}`, s, 1600, 1000, 'workbench', { state: grip('chat', 12), conform: AGENT_WIDE }),
    ref(`workbench-grip-focus-${s}`, `workbench.html?product=loom&theme=${s}`, s, 1600, 1000, 'workbench', { state: grip('insp', 0) }),
  ]),
  ...['review', 'agent'].flatMap((t) => ['light', 'dark'].map((s) =>
    ref(`workbench-phone-tab-${t}-${s}`, `workbench.html?product=loom&theme=${s}`, s, 400, 860, 'workbench', { state: click(`#tabbar [data-tab="${t}"]`), conform: PHONE_TAB }))),
];

// Every PNG a table produces: one job per entry, scheme and viewport.
export function jobsOf(table) {
  const jobs = [];
  for (const entry of table) {
    for (const scheme of entry.schemes ?? DEFAULT_SCHEMES) {
      for (const [w, h] of entry.viewports ?? DEFAULT_VIEWPORTS) {
        jobs.push({ entry, scheme, w, h, file: entry.file ?? `${entry.name}-${scheme}-${w}` });
      }
    }
  }
  return jobs;
}

export { DEFAULT_SCHEMES, DEFAULT_VIEWPORTS };

// Runs in the page: everything the generic readiness waits for.
const pageReady = () => {
  if (window.__shotReady !== undefined && window.__shotReady !== true) return false;
  if (document.fonts && document.fonts.status !== 'loaded') return false;
  for (const l of document.querySelectorAll('link[rel~=stylesheet]')) if (!l.sheet) return false;
  for (const i of document.images) if (!i.complete) return false;
  return true;
};

// Runs in the page: font families in use and the old-look probe.
const pageProbe = () => {
  const fonts = new Set();
  for (const f of document.fonts) if (f.status === 'loaded') fonts.add(f.family.replace(/^["']|["']$/g, ''));
  const chivo = new Set();
  for (const el of document.querySelectorAll('*')) {
    const ff = getComputedStyle(el).fontFamily;
    if (/chivo/i.test(ff)) chivo.add(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + el.classList[0] : ''));
  }
  const old = /var\(\s*(--(?:chrome|panel|view|rule-2|code|font|console-h))(?![\w-])/g;
  const tokens = new Set();
  const sheets = [];
  for (const s of document.styleSheets) {
    let text = '';
    try { for (const r of s.cssRules) text += r.cssText + '\n'; } catch { sheets.push(s.href || 'inline (unreadable)'); continue; }
    for (const m of text.matchAll(old)) tokens.add(m[1]);
  }
  for (const el of document.querySelectorAll('[style]')) {
    for (const m of el.getAttribute('style').matchAll(old)) tokens.add(m[1]);
  }
  return { fonts: [...fonts].sort(), chivo: [...chivo].slice(0, 20), tokens: [...tokens].sort(), unreadable: sheets };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll `fn` in the page until it returns true or `ms` pass. Never throws on a page error.
async function until(tab, fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await tab.evaluate(fn) === true) return true; } catch { /* navigating */ }
    await sleep(50);
  }
  return false;
}

const allowed = (allow, text) => (allow || []).find((a) => (a.match instanceof RegExp ? a.match.test(text) : text.includes(a.match)));

async function shootOne(browser, { base, entry, scheme, w, h, outPath, allow, tabName, readyTimeout, settle, screenshot, collect, clock }) {
  const origin = new URL(base).origin;
  const tab = await browser.open({ name: tabName, viewport: { width: w, height: h } });
  const errors = [];
  const failed = [];
  const okAllowed = [];
  let ready = false;
  let collected;
  let probe = { fonts: [], chivo: [], tokens: [], unreadable: [] };
  try {
    await tab.run(async ({ page }, sch) => {
      // Puppeteer (the omp browser) and Playwright (tools/shot) name these differently.
      if (page.setCacheEnabled) await page.setCacheEnabled(false);
      if (page.emulateMediaFeatures) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: sch }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
      } else {
        await page.emulateMedia({ colorScheme: sch, reducedMotion: 'reduce' });
      }
    }, { args: [scheme] });
    await tab.addInitScript(`try { localStorage.setItem(${JSON.stringify(SCHEME_KEY)}, ${JSON.stringify(scheme)}); } catch (e) {}`);
    await tab.addInitScript(adopt(CALM_CSS));
    const frozen = entry.clock ?? clock;
    if (frozen) await tab.addInitScript(clockScript(frozen));
    try {
      await tab.goto(new URL(entry.path.replace(/^\//, ''), base.replace(/\/?$/, '/')).href);
    } catch (e) {
      errors.push(`goto: ${e.message || e}`);
    }
    ready = await until(tab, pageReady, readyTimeout);
    if (ready && entry.ready) {
      ready = typeof entry.ready === 'string'
        ? await until(tab, `!!document.querySelector(${JSON.stringify(entry.ready)})`, readyTimeout)
        : await until(tab, entry.ready, readyTimeout);
    }
    if (entry.state) {
      try { await entry.state(tab); } catch (e) { errors.push(`state: ${e.message || e}`); }
    }
    if (entry.mask?.length) {
      await tab.evaluate(adopt(`${entry.mask.join(',')}{visibility:hidden!important}`));
    }
    await sleep(settle);
    try { probe = await tab.evaluate(pageProbe); } catch (e) { errors.push(`probe: ${e.message || e}`); }
    if (collect) {
      try { collected = await collect(tab, { entry, scheme, w, h }); } catch (e) { errors.push(`collect: ${e.message || e}`); }
    }
    const log = (await tab.errors()).entries.map((e) => e.text || e.message || String(e));
    const reqs = await tab.requests();
    const list = Array.isArray(reqs) ? reqs : reqs.entries ?? [];
    for (const r of list) {
      if (/^(data|blob|about):/.test(r.url)) continue;
      const bad = !(r.status > 0 && r.status < 400) || !r.url.startsWith(origin);
      if (bad) log.push(`request ${r.status ?? 'no response'} ${r.url}`);
    }
    for (const text of [...errors.splice(0), ...log]) {
      const a = allowed(allow, text);
      if (a) okAllowed.push({ text, reason: a.reason });
      else (text.startsWith('request ') ? failed : errors).push(text.replace(/^request /, ''));
    }
    if (screenshot) {
      await tab.run(async ({ page }, p, full) => { await page.screenshot({ path: p, type: 'png', fullPage: !!full }); }, { args: [outPath, !!entry.full] });
    }
    try { await tab.evaluate(`localStorage.removeItem(${JSON.stringify(SCHEME_KEY)})`); } catch { /* page gone */ }
  } finally {
    await browser.close({ name: tabName });
  }
  const oldLook = { chivo: probe.chivo, tokens: probe.tokens };
  const clean = ready && errors.length === 0 && failed.length === 0 && oldLook.chivo.length === 0 && oldLook.tokens.length === 0;
  return { ready, errors, failed, allowed: okAllowed, fonts: probe.fonts, oldLook, unreadableSheets: probe.unreadable, collected, clean };
}

// Options: base, shots, out, only, allow, webgl, plus (all optional)
//   readyTimeout  ms to wait for each readiness stage, default 20000
//   settle        ms after ready before the shot, default 300
//   concurrency   shots in flight, default 1 (the omp browser); tools/shot uses more
//   screenshot    false reads the page without writing PNGs
//   collect       async (tab, {entry, scheme, w, h}) => any, called once the page is
//                 in its state; the value is returned as shot.collected
//   clock         ISO time to freeze Date at for every entry
export async function shoot(browser, opts = {}) {
  if (Array.isArray(opts)) opts = { only: opts };
  const isRef = !opts.shots;
  const base = opts.base ?? 'http://127.0.0.1:8793/demo';
  const table = opts.shots ?? SHOTS_REFERENCE;
  const out = opts.out ?? (isRef ? join(ROOT, 'demo/shots') : join(process.cwd(), 'shots', new Date().toISOString().slice(0, 10)));
  const screenshot = opts.screenshot !== false;
  mkdirSync(out, { recursive: true });

  const jobs = jobsOf(table).filter((j) => !opts.only || opts.only.includes(j.entry.name));
  // A PNG from an earlier run is never evidence: remove what this run will write.
  if (screenshot) for (const j of jobs) rmSync(join(out, `${j.file}.png`), { force: true });

  const shots = new Array(jobs.length);
  let next = 0;
  const worker = async (id) => {
    for (;;) {
      const n = next++;
      if (n >= jobs.length) return;
      const j = jobs[n];
      const outPath = join(out, `${j.file}.png`);
      const meta = { name: j.file, entry: j.entry.name, shape: j.entry.shape, scheme: j.scheme, w: j.w, h: j.h };
      if (j.entry.webgl && !opts.webgl) {
        shots[n] = { ...meta, file: null, skipped: 'needs WebGL (pass {webgl: true} under a SwiftShader browser)', clean: true };
        continue;
      }
      let r;
      try {
        r = await shootOne(browser, {
          base, entry: j.entry, scheme: j.scheme, w: j.w, h: j.h, outPath, allow: opts.allow,
          tabName: `style-shoot-${id}`, readyTimeout: opts.readyTimeout ?? READY_TIMEOUT_MS, settle: opts.settle ?? SETTLE_MS,
          screenshot, collect: opts.collect, clock: opts.clock,
        });
      } catch (e) {
        r = { ready: false, errors: [`shoot: ${e.message || e}`], failed: [], allowed: [], fonts: [], oldLook: { chivo: [], tokens: [] }, clean: false };
      }
      if (screenshot && !existsSync(outPath)) r = { ...r, clean: false, errors: [...r.errors, 'no PNG written'] };
      shots[n] = { ...meta, file: screenshot && existsSync(outPath) ? outPath : null, ...r };
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, (_, id) => worker(id)));

  const written = new Set(shots.map((s) => `${s.name}.png`));
  const stale = screenshot ? readdirSync(out).filter((f) => f.endsWith('.png') && !f.endsWith('.diff.png') && !written.has(f)) : [];
  const bad = shots.filter((s) => !s.clean);
  const lines = [`${shots.length - bad.length}/${shots.length} shots clean, ${out}`];
  for (const s of shots.filter((x) => x.skipped)) lines.push(`skipped ${s.name}: ${s.skipped}`);
  for (const s of bad) {
    lines.push(`NOT CLEAN ${s.name}${s.ready ? '' : ' (not ready)'}`);
    for (const e of s.errors) lines.push(`  console: ${e}`);
    for (const f of s.failed) lines.push(`  request: ${f}`);
    if (s.oldLook.chivo.length) lines.push(`  old look: Chivo on ${s.oldLook.chivo.join(', ')}`);
    if (s.oldLook.tokens.length) lines.push(`  old look: var(${s.oldLook.tokens.join('), var(')})`);
  }
  if (stale.length) lines.push(`stale PNGs (not from this run): ${stale.join(', ')}`);
  const text = lines.join('\n');
  if (!opts.quiet) console.log(text);
  return { ok: bad.length === 0, shots, stale, text };
}
