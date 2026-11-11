// node --test tools/palette.test.mjs
// palette.js against a minimal fake DOM: the registry, matching and ranking,
// keyboard operation, focus handling, the escape hatch for editors, literal
// text, and the cases that must not throw.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SRC = fs.readFileSync(new URL("../palette.js", import.meta.url), "utf8");

// ---- A fake DOM with the selectors palette.js uses: tag, #id, .class, [attr],
// [attr=value] in one compound, and comma lists.
function compound(text) {
  const c = { tag: null, id: null, classes: [], attrs: [] };
  const re = /^([a-z][a-z0-9-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=("?)([^\]"]*)\5)?\]/i;
  let rest = text.trim();
  while (rest) {
    const m = re.exec(rest);
    if (!m) throw new Error(`fake DOM cannot parse selector: ${text}`);
    if (m[1]) c.tag = m[1].toLowerCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else c.attrs.push([m[4], m[6]]);
    rest = rest.slice(m[0].length);
  }
  return c;
}
const parse = (sel) => sel.split(",").map(compound);

class El {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tag = tag;
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.listeners = {};
  }
  get id() { return this.getAttribute("id") || ""; }
  set id(v) { this.setAttribute("id", v); }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { for (let n = this; n; n = n.parentNode) if (n === this.ownerDocument || n.tag === "document") return true; return false; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { c.remove(); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { c.remove(); return c; }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
  matches(sel) {
    const classes = this.className.split(/\s+/).filter(Boolean);
    return parse(sel).some((c) =>
      (!c.tag || c.tag === this.tag) &&
      (!c.id || c.id === this.id) &&
      c.classes.every((k) => classes.includes(k)) &&
      c.attrs.every(([k, v]) => this.hasAttribute(k) && (v === undefined || this.getAttribute(k) === v)));
  }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches && n.matches(sel)) return n; return null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  dispatchEvent(ev) {
    ev.target ||= this;
    ev.defaultPrevented = false;
    ev.preventDefault = () => { ev.defaultPrevented = true; };
    for (let n = this; n; n = n.parentNode) {
      for (const fn of [...(n.listeners[ev.type] || [])]) fn(ev);
      if (!ev.bubbles) break;
    }
    return !ev.defaultPrevented;
  }
  click() { this.dispatchEvent({ type: "click", bubbles: true }); }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
}

// A page with a title bar and its .cmd button (options turn parts off) and a
// fresh script context.
function page({ cmd = true, titlebar = true, body = true, platform = "Linux x86_64", readyState = "complete" } = {}) {
  const doc = new El(null, "document");
  doc.ownerDocument = doc;
  const make = (tag, attrs = {}, parent = null) => {
    const e = new El(doc, tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else e.setAttribute(k, v); }
    parent?.appendChild(e);
    return e;
  };
  const html = make("html", {}, doc);
  const bodyEl = body ? make("body", {}, html) : null;
  const els = { html, body: bodyEl };
  if (bodyEl && titlebar) {
    els.bar = make("header", { class: "titlebar" }, bodyEl);
    if (cmd) {
      els.cmd = make("button", { class: "cmd" }, els.bar);
      els.kbd = make("kbd", {}, els.cmd);
      els.kbd.textContent = "Ctrl K";
    }
    els.other = make("button", { id: "other" }, els.bar);
  }
  if (bodyEl) {
    els.editor = make("div", { "data-palette-ignore": "" }, bodyEl);
    els.editorInput = make("textarea", {}, els.editor);
  }
  doc.documentElement = html;
  doc.body = bodyEl;
  doc.activeElement = bodyEl;
  doc.readyState = readyState;
  doc.createElement = (tag) => new El(doc, tag);
  doc.createElementNS = (_ns, tag) => new El(doc, tag);

  const logged = { warn: [], error: [] };
  const win = {
    document: doc,
    navigator: { platform },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.bubbles = !!init.bubbles; this.detail = init.detail; } },
    console: { warn: (...a) => logged.warn.push(a), error: (...a) => logged.error.push(a) },
  };
  win.window = win;
  doc.defaultView = win;
  const ctx = vm.createContext(win);
  vm.runInContext(SRC, ctx);
  const api = ctx.annealagePalette;

  const p = {
    ctx, doc, els, api, logged,
    key(key, props = {}, target = doc.activeElement || bodyEl || doc) {
      const ev = { type: "keydown", bubbles: true, key, ...props };
      target.dispatchEvent(ev);
      return ev;
    },
    ctrlK(target) { return p.key("k", { ctrlKey: true }, target); },
    get input() { return doc.querySelector(".palette-input"); },
    get layer() { return doc.querySelector(".palette"); },
    rows: () => doc.querySelectorAll(".palette-row"),
    titles: () => doc.querySelectorAll(".palette-row").map((r) => r.querySelector(".palette-title").textContent),
    groups: () => doc.querySelectorAll(".palette-group").map((g) => g.textContent),
    selected: () => doc.querySelectorAll(".palette-row").findIndex((r) => r.getAttribute("aria-selected") === "true"),
    type(text) { p.input.value = text; p.input.dispatchEvent({ type: "input", bubbles: true }); },
    live: () => doc.querySelector(".sr").textContent,
  };
  return p;
}
const cmd = (id, title, extra = {}) => ({ id, title, run: () => {}, ...extra });

test("register, replace, unregister and skip what is invalid", () => {
  const p = page();
  const off = p.api.register([cmd("a", "Alpha"), cmd("b", "Beta")]);
  p.api.open();
  assert.deepEqual(p.titles(), ["Alpha", "Beta"]);
  p.api.close();

  const replaced = p.api.register(cmd("a", "Alpha two"));
  p.api.open();
  assert.deepEqual(p.titles(), ["Alpha two", "Beta"]);
  p.api.close();
  off(); // the first registration's "a" was replaced, so only "b" goes
  p.api.open();
  assert.deepEqual(p.titles(), ["Alpha two"]);
  p.api.close();
  replaced();
  off(); // idempotent
  p.api.open();
  assert.deepEqual(p.titles(), []);
  assert.equal(p.doc.querySelector(".palette-empty").textContent, "No commands here");
  p.api.close();

  p.api.register([{ id: "x", title: "No run" }, { title: "No id", run() {} }, null, cmd("ok", "Fine")]);
  assert.equal(p.logged.warn.length, 3);
  p.api.open();
  assert.deepEqual(p.titles(), ["Fine"]);
});

test("an empty query lists in registration order, grouped by first appearance", () => {
  const p = page();
  p.api.register([cmd("1", "One", { group: "Second" }), cmd("2", "Two", { group: "First" }), cmd("3", "Three", { group: "Second" }), cmd("4", "Loose")]);
  p.api.open();
  assert.deepEqual(p.titles(), ["One", "Three", "Two", "Loose"]);
  assert.deepEqual(p.groups(), ["Second", "First"]);
  assert.equal(p.live(), "4 commands");
});

test("ranking: prefix, word start, substring, subsequence, keyword", () => {
  const p = page();
  p.api.register([
    cmd("e", "Zoom", { keywords: ["sheet"] }),
    cmd("d", "Save history"),
    cmd("c", "Reshape"),
    cmd("b", "Go to sheet"),
    cmd("a", "Sheet list"),
  ]);
  p.api.open();
  p.type("sh");
  assert.deepEqual(p.titles(), ["Sheet list", "Go to sheet", "Reshape", "Save history", "Zoom"]);
  assert.equal(p.live(), "5 commands");
  // A group name matches like a keyword.
  p.api.register(cmd("f", "Other", { group: "Shell" }));
  assert.deepEqual(p.titles().at(-1), "Other");
});

test("every term must match; case does not matter; ties keep registration order", () => {
  const p = page();
  p.api.register([cmd("1", "Go to sheet"), cmd("2", "Go home"), cmd("3", "Sheet music")]);
  p.api.open();
  p.type("GO SHEET");
  assert.deepEqual(p.titles(), ["Go to sheet"]);
  p.type("go");
  assert.deepEqual(p.titles(), ["Go to sheet", "Go home"]);
  p.type("nothing like it");
  assert.deepEqual(p.titles(), []);
  assert.equal(p.doc.querySelector(".palette-empty").textContent, "No commands match");
  assert.equal(p.live(), "No commands");
  p.type("sheet");
  assert.equal(p.live(), "2 commands");
});

test("a disabled command shows its reason, does not run, and enabled() is read at each open", () => {
  const p = page();
  let ran = 0, asked = 0, ok = false;
  p.api.register([
    cmd("a", "Locked", { enabled: () => { asked++; return ok; }, disabledReason: "Open a design first", run: () => { ran++; } }),
    cmd("b", "Fixed", { enabled: false, run: () => { ran++; } }),
    cmd("c", "Fine", { run: () => { ran++; } }),
  ]);
  p.api.open();
  assert.equal(asked, 1);
  const [locked, fixed] = p.rows();
  assert.equal(locked.getAttribute("aria-disabled"), "true");
  assert.equal(locked.querySelector(".palette-hint").textContent, "Open a design first");
  assert.equal(fixed.getAttribute("aria-disabled"), "true");
  assert.equal(p.selected(), 2, "the first enabled row is selected");
  // Move onto a disabled row and press Enter: nothing runs, the palette stays.
  p.key("ArrowUp");
  p.key("ArrowUp");
  assert.equal(p.selected(), 0);
  p.key("Enter");
  assert.equal(ran, 0);
  assert.equal(p.api.isOpen(), true);
  p.api.close();
  ok = true;
  p.api.open();
  assert.equal(asked, 2);
  assert.equal(p.rows()[0].getAttribute("aria-disabled"), null);
  p.key("Home");
  p.key("Enter");
  assert.equal(ran, 1);
});

test("run is called after the palette closed and focus is back on the opener", () => {
  const p = page();
  const seen = [];
  p.api.register(cmd("a", "Do it", { run: () => seen.push({ open: p.api.isOpen(), focus: p.doc.activeElement, hidden: p.layer.hidden }) }));
  p.els.other.focus();
  p.ctrlK();
  assert.equal(p.api.isOpen(), true);
  assert.equal(p.doc.activeElement, p.input);
  p.key("Enter");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].open, false);
  assert.equal(seen[0].hidden, true);
  assert.equal(seen[0].focus, p.els.other);

  // Through the field's button.
  p.els.cmd.click();
  assert.equal(p.api.isOpen(), true);
  p.rows()[0].dispatchEvent({ type: "click", bubbles: true });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].focus, p.els.cmd);
});

test("Escape and Tab close and return focus; the layer click closes; Ctrl K toggles", () => {
  const p = page();
  p.api.register(cmd("a", "Alpha"));
  p.els.other.focus();
  p.ctrlK();
  p.key("Escape");
  assert.equal(p.api.isOpen(), false);
  assert.equal(p.doc.activeElement, p.els.other);

  p.ctrlK();
  p.key("Tab");
  assert.equal(p.api.isOpen(), false);
  assert.equal(p.doc.activeElement, p.els.other);

  p.key("k", { metaKey: true });
  assert.equal(p.api.isOpen(), true);
  p.ctrlK(p.input);
  assert.equal(p.api.isOpen(), false);

  p.ctrlK();
  p.layer.dispatchEvent({ type: "click", bubbles: true });
  assert.equal(p.api.isOpen(), false);
  assert.equal(p.doc.activeElement, p.els.other);
  assert.equal(p.layer.hidden, true);
});

test("Ctrl K inside [data-palette-ignore] or already handled does nothing", () => {
  const p = page();
  p.api.register(cmd("a", "Alpha"));
  p.els.editorInput.focus();
  const ev = p.ctrlK(p.els.editorInput);
  assert.equal(p.api.isOpen(), false);
  assert.equal(ev.defaultPrevented, false);

  // A handler that ran first and took the key.
  p.doc.body.addEventListener("keydown", (e) => e.preventDefault());
  p.ctrlK(p.els.other);
  assert.equal(p.api.isOpen(), false);

  // Other chords are left alone.
  const q = page();
  q.key("k", { ctrlKey: true, shiftKey: true });
  q.key("k", { ctrlKey: true, altKey: true });
  q.key("k");
  assert.equal(q.api.isOpen(), false);
  assert.equal(q.ctrlK().defaultPrevented, true, "an opening Ctrl K is consumed");
  assert.equal(q.api.isOpen(), true);
});

test("Up and Down wrap, Home and End jump, and the combobox points at the active option", () => {
  const p = page();
  p.api.register([cmd("a", "A1"), cmd("b", "B1"), cmd("c", "C1")]);
  p.api.open();
  assert.equal(p.selected(), 0);
  assert.equal(p.input.getAttribute("aria-activedescendant"), p.rows()[0].id);
  p.key("ArrowDown");
  p.key("ArrowDown");
  assert.equal(p.selected(), 2);
  p.key("ArrowDown");
  assert.equal(p.selected(), 0);
  p.key("ArrowUp");
  assert.equal(p.selected(), 2);
  p.key("Home");
  assert.equal(p.selected(), 0);
  p.key("End");
  assert.equal(p.selected(), 2);
  assert.equal(p.input.getAttribute("aria-activedescendant"), p.rows()[2].id);
  assert.equal(p.input.getAttribute("aria-expanded"), "true");
  assert.equal(p.input.getAttribute("role"), "combobox");
  assert.equal(p.doc.querySelector(".palette-list").getAttribute("role"), "listbox");
  assert.equal(p.rows()[0].getAttribute("role"), "option");
  assert.equal(p.input.getAttribute("aria-controls"), p.doc.querySelector(".palette-list").id);
  p.api.close();
  assert.equal(p.input.getAttribute("aria-expanded"), "false");
  assert.equal(p.input.getAttribute("aria-activedescendant"), null);
});

test("a title with markup is drawn literally, never parsed", () => {
  const p = page();
  p.api.register(cmd("x", "<b>Bold</b> & <img src=x>", { group: "<i>G</i>", hint: "<u>h</u>" }));
  p.api.open();
  const row = p.rows()[0];
  assert.equal(row.querySelector(".palette-title").textContent, "<b>Bold</b> & <img src=x>");
  assert.equal(row.querySelector(".palette-title").children.length, 0);
  assert.equal(row.querySelector(".palette-hint").textContent, "<u>h</u>");
  assert.equal(p.groups()[0], "<i>G</i>");
  assert.equal(p.doc.querySelectorAll("b").length + p.doc.querySelectorAll("img").length + p.doc.querySelectorAll("i").length, 0);
});

test("a run that throws or rejects is logged and leaves the palette usable", async () => {
  const p = page();
  p.api.register([
    cmd("sync", "Throws", { run: () => { throw new Error("boom"); } }),
    cmd("async", "Rejects", { run: () => Promise.reject(new Error("later")) }),
  ]);
  p.ctrlK();
  p.key("Enter");
  assert.equal(p.api.isOpen(), false);
  assert.equal(p.logged.error.length, 1);
  p.ctrlK();
  p.key("ArrowDown");
  p.key("Enter");
  await new Promise((r) => setImmediate(r));
  assert.equal(p.logged.error.length, 2);
  assert.equal(p.api.isOpen(), false);
  p.ctrlK();
  assert.equal(p.api.isOpen(), true);
});

test("a registry change while open redraws the list and fires palettechange", () => {
  const p = page();
  let fired = 0;
  p.doc.addEventListener("palettechange", () => fired++);
  const off = p.api.register(cmd("a", "Alpha"));
  assert.equal(fired, 0, "nothing while closed");
  p.api.open();
  p.api.register(cmd("b", "Beta"));
  assert.equal(fired, 1);
  assert.deepEqual(p.titles(), ["Alpha", "Beta"]);
  p.key("ArrowDown");
  off();
  assert.equal(fired, 2);
  assert.deepEqual(p.titles(), ["Beta"]);
  assert.equal(p.selected(), 0);
});

test("the field's key label and aria come from the script", () => {
  const linux = page();
  assert.equal(linux.els.kbd.textContent, "Ctrl K");
  assert.equal(linux.els.cmd.getAttribute("aria-haspopup"), "dialog");
  assert.equal(linux.els.cmd.getAttribute("aria-expanded"), "false");
  linux.api.open();
  assert.equal(linux.els.cmd.getAttribute("aria-expanded"), "true");

  const mac = page({ platform: "MacIntel" });
  assert.equal(mac.els.kbd.textContent, "Cmd K");
});

test("200 commands, a 200-character title and open with a query", () => {
  const p = page();
  const long = "L".repeat(200);
  p.api.register(Array.from({ length: 200 }, (_, i) => cmd(`c${i}`, i === 7 ? long : `Command ${i}`)));
  p.api.open({ query: "command 19" });
  assert.equal(p.input.value, "command 19");
  assert.equal(p.titles()[0], "Command 19");
  assert.ok(p.rows().length < 200, "fewer rows than commands, fuzzy matches included");
  p.type("");
  assert.equal(p.rows().length, 200);
  assert.equal(p.rows()[7].querySelector(".palette-title").textContent, long);
  p.api.close();
  p.api.open();
  assert.equal(p.input.value, "", "reopening starts clean");
});

test("nothing throws without a .cmd, a title bar, a body or any commands", () => {
  const bare = page({ cmd: false, titlebar: false });
  assert.doesNotThrow(() => { bare.api.open(); bare.ctrlK(); bare.api.close(); bare.api.close(); });
  assert.equal(bare.doc.querySelector(".palette-empty").textContent, "No commands here");

  const nobody = page({ body: false });
  assert.equal(nobody.api.open(), false);
  assert.equal(nobody.api.isOpen(), false);
  assert.doesNotThrow(() => nobody.api.register(cmd("a", "A")));
  assert.doesNotThrow(() => nobody.api.close());
  assert.doesNotThrow(() => nobody.key("k", { ctrlKey: true }, nobody.doc));

  const loading = page({ readyState: "loading" });
  assert.equal(loading.doc.listeners.DOMContentLoaded.length, 1);
  assert.doesNotThrow(() => loading.doc.listeners.DOMContentLoaded[0]());
  assert.equal(loading.els.kbd.textContent, "Ctrl K");
});

test("an icon is drawn as a sprite reference, and only when given", () => {
  const p = page();
  p.api.register([cmd("a", "With", { icon: "/style/icons.svg#i-search" }), cmd("b", "Without")]);
  p.api.open();
  const [a, b] = p.rows();
  const use = a.querySelector("use");
  assert.equal(use.getAttribute("href"), "/style/icons.svg#i-search");
  assert.equal(b.querySelector("use"), null);
});
