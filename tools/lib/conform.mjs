// Structural conformance: read computed style of a fixed list of selectors and the
// colour tokens from a page, and compare with the values tools/conformance.json
// holds for that page shape. The check list is hand-written data in the JSON file;
// its `expected` section is written by `tools/shot --derive-conformance`, which reads
// the reference pages, so a library change is one command, not a hand edit.
import { readFileSync, writeFileSync } from 'node:fs';

export const CONFORMANCE_PATH = new URL('../conformance.json', import.meta.url).pathname;
export const loadConformance = (path = CONFORMANCE_PATH) => JSON.parse(readFileSync(path, 'utf8'));

export const classOf = (doc, w) => (w <= doc.phoneMaxWidth ? 'phone' : 'desktop');

// Runs in the page. Returns { product, checks: {id: props | null}, tokens, productTokens }.
// A token is read as a colour through a probe element's inline custom-property
// reference (a CSSOM write, so it passes a style-src 'self' policy): getPropertyValue
// would return light-dark() unresolved. A token that is not defined reads back null.
function pageRead(spec) {
  const out = { product: document.documentElement.dataset.product || null, checks: {}, tokens: {}, productTokens: {} };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const c of spec.checks) {
    const el = [...document.querySelectorAll(c.selector)].find(visible);
    if (!el) { out.checks[c.id] = null; continue; }
    const cs = getComputedStyle(el);
    const props = {};
    for (const p of c.props) props[p] = cs[p];
    out.checks[c.id] = props;
  }
  const SENTINEL = 'rgb(1, 2, 3)';
  const probe = document.createElement('span');
  probe.hidden = false;
  document.body.appendChild(probe);
  const colour = (name) => {
    probe.style.setProperty('color', SENTINEL);
    probe.style.setProperty('color', `var(${name}, ${SENTINEL})`);
    const v = getComputedStyle(probe).color;
    return v === SENTINEL ? null : v;
  };
  for (const t of spec.tokens) out.tokens[t] = colour(t);
  for (const t of spec.productTokens) out.productTokens[t] = colour(t);
  probe.remove();
  return out;
}

export const readSpec = (doc) => ({ checks: doc.checks, tokens: doc.tokens, productTokens: doc.productTokens });

// A `collect` hook for shoot().
export const collector = (doc) => (tab) => tab.evaluate(`(${pageRead})(${JSON.stringify(readSpec(doc))})`);

const PX = /^-?\d+(\.\d+)?px$/;
const sameValue = (exp, act, tol) => {
  if (PX.test(exp) && PX.test(act)) return Math.abs(parseFloat(exp) - parseFloat(act)) <= tol;
  return exp === act;
};

// Expected values: a string, an array of strings (grid tracks) or null (not asserted).
function diffValue(exp, act, tol) {
  if (exp === null || exp === undefined) return null;
  if (Array.isArray(exp)) {
    const parts = typeof act === 'string' ? act.split(/\s+/) : [];
    if (parts.length !== exp.length) return { expected: exp.map((v) => v ?? '*').join(' '), actual: String(act) };
    const bad = exp.some((v, i) => v !== null && !sameValue(v, parts[i], tol));
    return bad ? { expected: exp.map((v) => v ?? '*').join(' '), actual: String(act) } : null;
  }
  return sameValue(exp, act, tol) ? null : { expected: exp, actual: String(act) };
}

// An entry's `conform` override says what a state variant changes on purpose, so the rest
// of the page shape is still checked. Shape (every key optional, `reason` required):
//   { reason: 'why',
//     except: { '<check selector>': ['prop', ...] | '*' },     // not asserted (a prop, or the whole selector)
//     expect: { '<check selector>': 'absent' | { prop: value } } }  // asserted instead of the shape's value
// A selector is the `selector` of an entry in `checks`; a prop is one of that check's `props`.
// A value is a string, or an array of strings with null for a track not asserted (grid tracks).
// 'absent' says the element is not drawn (a phone tab view has no .vhead).
function checkOverride(doc, o) {
  const bad = (msg) => [{ selector: '(entry)', prop: 'conform', expected: 'a valid override', actual: msg }];
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return { error: bad('conform must be false or an object { reason, except?, expect? }') };
  if (typeof o.reason !== 'string' || !o.reason.trim()) return { error: bad('conform override has no reason') };
  const unknown = Object.keys(o).filter((k) => !['reason', 'except', 'expect'].includes(k));
  if (unknown.length) return { error: bad(`unknown conform key ${unknown.join(', ')}`) };
  const bySel = new Map(doc.checks.map((c) => [c.selector, c]));
  const clean = { except: new Map(), expect: new Map() };
  for (const [sel, props] of Object.entries(o.except ?? {})) {
    const c = bySel.get(sel);
    if (!c) return { error: bad(`except: no check with selector ${sel}`) };
    if (props !== '*' && !(Array.isArray(props) && props.length && props.every((p) => c.props.includes(p)))) return { error: bad(`except ${sel}: '*' or a list of ${c.props.join(', ')}`) };
    clean.except.set(c.id, props === '*' ? new Set(c.props) : new Set(props));
  }
  for (const [sel, want] of Object.entries(o.expect ?? {})) {
    const c = bySel.get(sel);
    if (!c) return { error: bad(`expect: no check with selector ${sel}`) };
    if (want !== 'absent' && !(typeof want === 'object' && want !== null && !Array.isArray(want) && Object.keys(want).length && Object.keys(want).every((p) => c.props.includes(p)))) return { error: bad(`expect ${sel}: 'absent' or { prop: value } with props of ${c.props.join(', ')}`) };
    clean.expect.set(c.id, want);
  }
  return clean;
}

// -> [{ selector, prop, expected, actual }] (selector is a CSS selector or a token name)
// `override` is the entry's `conform` object (see checkOverride); false is handled by the caller.
export function compareShot(doc, shot, override) {
  const diffs = [];
  const got = shot.collected;
  if (!got) return [{ selector: '(page)', prop: 'read', expected: 'computed style', actual: 'not read' }];
  const exp = doc.expected[shot.shape]?.[classOf(doc, shot.w)]?.[shot.scheme];
  if (!exp) return [{ selector: shot.shape, prop: 'shape', expected: `an entry in tools/conformance.json for ${shot.scheme} ${classOf(doc, shot.w)}`, actual: 'none (shape not derived)' }];
  const ov = override === undefined ? null : checkOverride(doc, override);
  if (ov?.error) return ov.error;
  for (const c of doc.checks) {
    const have = got.checks[c.id];
    const instead = ov?.expect.get(c.id);
    if (instead === 'absent') {
      if (have) diffs.push({ selector: c.selector, prop: '(element)', expected: 'absent', actual: 'present' });
      continue;
    }
    const skip = ov?.except.get(c.id);
    const want = instead ? { ...(exp.checks[c.id] ?? {}), ...instead } : exp.checks[c.id];
    if (!want) continue; // the reference page of this shape does not draw it
    if (!have) { if (!(skip && c.props.every((p) => skip.has(p)))) diffs.push({ selector: c.selector, prop: '(element)', expected: 'present', actual: 'missing' }); continue; }
    for (const [p, v] of Object.entries(want)) {
      if (skip?.has(p)) continue;
      const d = diffValue(v, have[p], c.tolerancePx ?? doc.tolerancePx);
      if (d) diffs.push({ selector: c.selector, prop: p, ...d });
    }
  }
  const tokenDiffs = (want, have) => {
    for (const [t, v] of Object.entries(want ?? {})) {
      if (v !== have?.[t]) diffs.push({ selector: t, prop: 'colour', expected: v, actual: String(have?.[t] ?? 'undefined') });
    }
  };
  tokenDiffs(exp.tokens, got.tokens);
  if (got.product) {
    const pe = doc.expected.products?.[got.product]?.[shot.scheme];
    if (pe) tokenDiffs(pe, got.productTokens);
    else diffs.push({ selector: `[data-product=${got.product}]`, prop: 'temper', expected: `a product in ${Object.keys(doc.expected.products ?? {}).join(', ')}`, actual: got.product });
  }
  return diffs;
}

// Values that differ between two viewports of the same class depend on the viewport
// (a fluid track, a height that follows the window); they are not asserted.
const merge = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length ? a.map((v, i) => (v === b[i] ? v : null)) : null;
  return a === b ? a : null;
};
// A grid-template-columns value is stored as an array of tracks; read gives a string.
const tracksOrValue = (p, v) => (p === 'gridTemplateColumns' || p === 'gridTemplateRows') && typeof v === 'string' ? v.split(/\s+/) : v;

function mergeReads(doc, reads) {
  const [first, ...rest] = reads;
  const checks = {};
  for (const c of doc.checks) {
    if (!first.checks[c.id] || rest.some((r) => !r.checks[c.id])) { checks[c.id] = null; continue; }
    const props = {};
    for (const p of c.props) {
      let v = tracksOrValue(p, first.checks[c.id][p]);
      for (const r of rest) v = merge(v, tracksOrValue(p, r.checks[c.id][p]));
      props[p] = v;
    }
    checks[c.id] = props;
  }
  const tokens = {};
  for (const t of doc.tokens) tokens[t] = reads.every((r) => r.tokens[t] === first.tokens[t]) ? first.tokens[t] : null;
  return { checks, tokens };
}

// Read the reference pages through shoot() and rewrite the `expected` section of the
// JSON file. `run(table, collect)` is shoot() bound to a base URL; it returns shots.
export async function derive(doc, run) {
  const entries = [];
  const jobs = [];
  for (const [shape, page] of Object.entries(doc.shapes)) {
    for (const cls of ['desktop', 'phone']) entries.push({ name: shape, shape, path: page, viewports: doc.viewports[cls] });
    jobs.push(shape);
  }
  for (const product of doc.products) {
    entries.push({ name: `product-${product}`, product, path: doc.productPage.replace('{product}', product), viewports: [doc.viewports.desktop[0]] });
  }
  const shots = await run(entries, collector(doc));
  const bad = shots.filter((s) => !s.ready || !s.collected);
  if (bad.length) throw new Error(`reference pages did not read: ${bad.map((s) => s.name).join(', ')}`);

  const expected = {};
  for (const shape of Object.keys(doc.shapes)) {
    expected[shape] = {};
    for (const cls of ['desktop', 'phone']) {
      expected[shape][cls] = {};
      for (const scheme of ['light', 'dark']) {
        const reads = shots.filter((s) => s.entry === shape && s.scheme === scheme && classOf(doc, s.w) === cls).map((s) => s.collected);
        expected[shape][cls][scheme] = mergeReads(doc, reads);
      }
    }
  }
  expected.products = {};
  for (const product of doc.products) {
    expected.products[product] = {};
    for (const scheme of ['light', 'dark']) {
      const s = shots.find((x) => x.entry === `product-${product}` && x.scheme === scheme);
      expected.products[product][scheme] = s.collected.productTokens;
    }
  }
  return expected;
}

export function writeExpected(expected, path = CONFORMANCE_PATH) {
  const doc = loadConformance(path);
  doc.expected = expected;
  writeFileSync(path, JSON.stringify(doc, null, 2).replace(/\[\n\s+([^\][{}]*?)\n\s+\]/g, (m, body) => `[${body.replace(/\n\s+/g, ' ')}]`) + '\n');
}
