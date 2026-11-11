// node --test tools/frame.test.mjs
// frame.js against a minimal fake DOM: layout focus, the Panel button, the phone
// tab bar, the column handles, the stored settings and the cases that must not throw.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SRC = fs.readFileSync(new URL("../frame.js", import.meta.url), "utf8");

// ---- A fake DOM, with just the selectors frame.js uses: tag, #id, .class,
// [attr], [attr=value] in one compound, and comma lists.
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
    this.listeners = {};
    const props = new Map();
    this.style = {
      display: "",
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
      getPropertyValue: (k) => (props.has(k) ? props.get(k) : ""),
    };
    const owner = this;
    this.classList = {
      list: () => owner.className.split(/\s+/).filter(Boolean),
      contains: (n) => owner.classList.list().includes(n),
      add: (n) => { if (!owner.classList.contains(n)) owner.className = [...owner.classList.list(), n].join(" "); },
      remove: (n) => { owner.className = owner.classList.list().filter((c) => c !== n).join(" "); },
      toggle: (n, force) => {
        const on = force === undefined ? !owner.classList.contains(n) : force;
        owner.classList[on ? "add" : "remove"](n);
        return on;
      },
    };
  }
  get id() { return this.getAttribute("id") || ""; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { const i = this.parentNode.children.indexOf(this); return this.parentNode.children[i + 1] || null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    c.remove();
    c.parentNode = this;
    this.children.splice(ref ? this.children.indexOf(ref) : this.children.length, 0, c);
    return c;
  }
  removeChild(c) { c.remove(); return c; }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 0, height: 0 }; }
  matches(sel) {
    return parse(sel).some((c) =>
      (!c.tag || c.tag === this.tag) &&
      (!c.id || c.id === this.id) &&
      c.classes.every((k) => this.classList.contains(k)) &&
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
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); }
  dispatchEvent(ev) {
    ev.target ||= this;
    ev.preventDefault ||= () => { ev.defaultPrevented = true; };
    for (let n = this; n; n = n.parentNode) {
      for (const fn of [...(n.listeners[ev.type] || [])]) fn(ev);
      if (!ev.bubbles) break;
    }
    return !ev.defaultPrevented;
  }
  click() { this.dispatchEvent({ type: "click", bubbles: true }); }
  setPointerCapture() {}
}

class FakeStorage {
  constructor(init = {}) { this.map = new Map(Object.entries(init)); this.writes = 0; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.writes++; this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
const BROKEN = {
  getItem() { throw new Error("private mode"); },
  setItem() { throw new Error("private mode"); },
  removeItem() { throw new Error("private mode"); },
};

// A page: .wb with a title-bar seg, #panelBtn, #tabbar, .view, .inspector and #chat, and a
// fresh script context. Options turn parts off. `wide` is the window width the
// computed grid is worked out from (null: no layout to measure).
function page({ product = "loom", inspector = true, chat = true, seg = true, panelBtn = true, tabbar = true, bodyOpen = true, narrow = false, wide = null, storage = new FakeStorage(), auto = false, wb = true, tabs = "markup", localStorageThrows = false, left = false, split = false, hostWidth = 900 } = {}) {
  const doc = new El(null, "document");
  const make = (tag, attrs = {}, parent = null) => {
    const e = new El(doc, tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === "class") e.className = v; else e.setAttribute(k, v); }
    parent?.appendChild(e);
    return e;
  };
  const html = make("html", product ? { "data-product": product } : {}, doc);
  const body = make("body", { class: bodyOpen ? "panel-open" : "" }, html);
  const root = wb ? make("div", { class: "wb", "data-layout": "split", ...(left ? { "data-insp": "left" } : {}) }, body) : null;
  const els = { html, body, root };
  if (root) {
    const bar = make("header", { class: "titlebar" }, root);
    if (seg) for (const v of ["drawing", "split", "agent"]) els[`set_${v}`] = make("button", { "data-layout-set": v, "aria-pressed": String(v === "split") }, bar);
    if (panelBtn) els.panelBtn = make("button", { id: "panelBtn", "aria-pressed": String(bodyOpen) }, bar);
    if (tabbar) {
      els.tabbar = make("nav", { id: "tabbar" }, root);
      if (tabs === "markup") {
        els.tab_drawing = make("button", { "data-tab": "drawing", "data-target": ".view" }, els.tabbar);
        els.tab_drawing.textContent = "Drawing";
        els.tab_review = make("button", { "data-tab": "review", "data-target": ".inspector" }, els.tabbar);
        els.tab_review.textContent = "Review";
        els.tab_agent = make("button", { "data-tab": "agent", "data-target": "#chat, .console" }, els.tabbar);
        els.tab_agent.textContent = "Agent";
      }
    }
    els.view = make("main", { class: "view" }, root);
    if (split) {
      els.host = make("div", { class: "canvas split even" }, els.view);
      els.host.rect = { left: 260, top: 0, width: hostWidth, height: 600 };
      els.half_a = make("section", { class: "half" }, els.host);
      els.half_b = make("section", { class: "half" }, els.host);
    }
    if (inspector) els.inspector = make("aside", { class: "inspector" }, root);
    if (chat) els.chat = make("aside", { id: "chat" }, root);
  }

  const queue = [];
  const winListeners = {};
  const mq = { matches: narrow, listeners: [], addEventListener(_, fn) { this.listeners.push(fn); }, removeEventListener(_, fn) { this.listeners = this.listeners.filter((f) => f !== fn); } };
  doc.documentElement = html;
  doc.body = body;
  doc.currentScript = auto ? { hasAttribute: (k) => k === "data-auto" } : null;
  doc.readyState = auto ? "loading" : "complete";
  doc.createElement = (tag) => new El(doc, tag);
  doc.querySelector = (sel) => doc.querySelectorAll(sel)[0] || null;
  const win = {
    document: doc,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.bubbles = !!init.bubbles; this.detail = init.detail; } },
    matchMedia: () => mq,
    requestAnimationFrame: (f) => queue.push(f),
    addEventListener: (t, fn) => (winListeners[t] ||= []).push(fn),
    removeEventListener: (t, fn) => { winListeners[t] = (winListeners[t] || []).filter((f) => f !== fn); },
    // The grid frame.js measures: rail 48, then view, inspector, agent pane, as the theme would give them
    // (inspector, view, agent pane with the inspector on the left, and no rail).
    getComputedStyle: (el) => {
      if (wide === null || el !== root) return { gridTemplateColumns: "" };
      const user = (k, def) => { const v = parseFloat(root.style.getPropertyValue(k)); return Number.isFinite(v) ? v : def; };
      const insp = body.classList.contains("panel-open") ? user("--insp-w-user", 300) : 0;
      const layout = root.getAttribute("data-layout");
      const chatW = layout === "drawing" ? 0 : user("--chat-w-user", 400);
      if (left) return { gridTemplateColumns: `${insp}px ${wide - insp - chatW}px ${chatW}px` };
      return { gridTemplateColumns: `48px ${wide - 48 - insp - chatW}px ${insp}px ${chatW}px` };
    },
  };
  if (localStorageThrows) Object.defineProperty(win, "localStorage", { get() { throw new Error("denied"); } });
  else win.localStorage = storage;
  win.window = win;
  doc.defaultView = win;
  const ctx = vm.createContext(win);
  vm.runInContext(SRC, ctx);
  const frame = ctx.annealageFrame;
  const events = [];
  root?.addEventListener("framechange", (e) => events.push(e.detail));
  return {
    ctx, doc, els, root, storage, frame, events, mq,
    init: (opts = {}) => frame({ storage, ...opts }),
    flush: () => { while (queue.length) queue.shift()(); },
    setNarrow(v) { mq.matches = v; for (const fn of [...mq.listeners]) fn({ matches: v }); },
    fire(el, type, props = {}) { return el.dispatchEvent({ type, bubbles: false, ...props }); },
    stored: (k = `annealage.frame.${product}`) => storage.getItem(k),
  };
}

// Objects frame.js makes live in the script's own realm; compare them as data.
const plain = (x) => JSON.parse(JSON.stringify(x));
const grip = (p, key) => p.root.querySelector(`[data-grip=${key}]`);

test("layout focus: a seg click sets the attribute, aria-pressed and the stored choice", () => {
  const p = page();
  const f = p.init();
  assert.equal(f.layout(), "split");
  p.els.set_agent.click();
  assert.equal(p.root.getAttribute("data-layout"), "agent");
  assert.equal(f.layout(), "agent");
  assert.equal(p.els.set_agent.getAttribute("aria-pressed"), "true");
  assert.equal(p.els.set_split.getAttribute("aria-pressed"), "false");
  assert.deepEqual(JSON.parse(p.stored()), { layout: "agent" });
  f.setLayout("nonsense");
  assert.equal(f.layout(), "agent");
});

test("layout focus: the stored choice is restored on load", () => {
  const p = page({ storage: new FakeStorage({ "annealage.frame.loom": JSON.stringify({ layout: "drawing" }) }) });
  const f = p.init();
  assert.equal(p.root.getAttribute("data-layout"), "drawing");
  assert.equal(f.layout(), "drawing");
  assert.equal(p.els.set_drawing.getAttribute("aria-pressed"), "true");
  assert.equal(p.els.set_split.getAttribute("aria-pressed"), "false");
});

test("widths: clamped at both limits, in the call and in storage", () => {
  const p = page();
  const f = p.init();
  f.setWidths({ insp: 5000, chat: 10 });
  assert.deepEqual(plain(f.widths()), { insp: 560, chat: 320 });
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "560px");
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "320px");
  f.setWidths({ insp: 1, chat: 9999 });
  assert.deepEqual(plain(f.widths()), { insp: 240, chat: 720 });
  const q = page({ storage: new FakeStorage({ "annealage.frame.loom": JSON.stringify({ insp: 5000, chat: -4 }) }) });
  const g = q.init();
  assert.deepEqual(plain(g.widths()), { insp: 560, chat: 320 });
  assert.equal(q.root.style.getPropertyValue("--insp-w-user"), "560px");
  f.setWidths({ insp: null });
  assert.equal(f.widths().insp, null);
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
});

test("nothing is written when storage is empty, and no width property is set", () => {
  const p = page();
  p.init();
  assert.equal(p.storage.writes, 0);
  assert.equal(p.storage.map.size, 0);
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "");
});

test("storage unavailable (private mode) does not throw", () => {
  const p = page({ storage: BROKEN });
  const f = p.init();
  assert.doesNotThrow(() => { f.setLayout("agent"); f.setWidths({ insp: 400 }); f.setPanelOpen(false); f.reset(); });
  const q = page({ localStorageThrows: true });
  assert.doesNotThrow(() => q.frame());
  assert.doesNotThrow(() => q.frame().setLayout("drawing"));
  const r = page({ storage: new FakeStorage({ "annealage.frame.loom": "{not json", "annealage.frame.loom.panel": "closed" }) });
  assert.doesNotThrow(() => r.init());
  assert.equal(r.doc.body.classList.contains("panel-open"), false);
});

test("no .wb: nothing throws and the returned API is inert", () => {
  const p = page({ wb: false });
  const f = p.init();
  assert.doesNotThrow(() => { f.setLayout("agent"); f.setWidths({ insp: 300 }); f.setPanelOpen(true); f.activateTab("x"); f.reset(); f.destroy(); });
  assert.equal(f.layout(), "split");
  assert.equal(f.isNarrow(), false);
  assert.equal(f.activeTab(), null);
  assert.equal(p.storage.writes, 0);
});

test("a page with no seg, no inspector, no panel button and no tab bar does not throw", () => {
  const p = page({ seg: false, inspector: false, chat: false, panelBtn: false, tabbar: false, bodyOpen: false });
  const f = p.init();
  assert.equal(p.doc.body.classList.contains("panel-open"), false, "a page without an inspector keeps its body class");
  assert.equal(p.root.querySelector(".colgrip"), null);
  assert.doesNotThrow(() => { p.root.click(); f.activateTab("drawing"); f.setLayout("drawing"); p.setNarrow(true); p.setNarrow(false); });
  assert.equal(f.activeTab(), null);
});

test("reset() removes both keys and goes back to the markup", () => {
  const p = page();
  const f = p.init();
  f.setLayout("drawing");
  f.setWidths({ insp: 400, chat: 500 });
  f.setPanelOpen(false);
  assert.ok(p.stored());
  assert.equal(p.stored("annealage.frame.loom.panel"), "closed");
  f.reset();
  assert.equal(p.stored(), null);
  assert.equal(p.stored("annealage.frame.loom.panel"), null);
  assert.equal(f.layout(), "split");
  assert.equal(p.els.set_split.getAttribute("aria-pressed"), "true");
  assert.deepEqual(plain(f.widths()), { insp: null, chat: null });
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
  assert.equal(f.panelOpen(), true);
});

test("Panel button: toggles body.panel-open and aria-pressed, writes the .panel key, a reload restores it", () => {
  const p = page();
  const f = p.init();
  assert.equal(p.stored("annealage.frame.loom.panel"), null);
  assert.equal(f.panelOpen(), true);
  p.els.panelBtn.click();
  assert.equal(p.doc.body.classList.contains("panel-open"), false);
  assert.equal(p.els.panelBtn.getAttribute("aria-pressed"), "false");
  assert.equal(p.stored("annealage.frame.loom.panel"), "closed");
  assert.equal(f.panelOpen(), false);
  const q = page({ storage: p.storage });
  const g = q.init();
  assert.equal(g.panelOpen(), false);
  assert.equal(q.doc.body.classList.contains("panel-open"), false);
  assert.equal(q.els.panelBtn.getAttribute("aria-pressed"), "false");
  q.els.panelBtn.click();
  assert.equal(q.doc.body.classList.contains("panel-open"), true);
  assert.equal(q.els.panelBtn.getAttribute("aria-pressed"), "true");
  assert.equal(q.stored("annealage.frame.loom.panel"), "open");
  g.setPanelOpen(false);
  assert.equal(g.panelOpen(), false);
});

test("the panel starts open with nothing stored, and a close button closes it", () => {
  const p = page({ bodyOpen: false });
  const f = p.init();
  assert.equal(f.panelOpen(), true);
  assert.equal(p.els.panelBtn.getAttribute("aria-pressed"), "true");
  const close = p.els.inspector.appendChild(new El(p.doc, "button"));
  close.setAttribute("data-panel-close", "");
  close.click();
  assert.equal(f.panelOpen(), false);
});

test("tab bar: role=tablist, the first tab aria-selected, from the markup", () => {
  const p = page();
  const f = p.init();
  assert.equal(p.els.tabbar.getAttribute("role"), "tablist");
  for (const id of ["drawing", "review", "agent"]) assert.equal(p.els[`tab_${id}`].getAttribute("role"), "tab");
  assert.equal(p.els.tab_drawing.getAttribute("aria-selected"), "true");
  assert.equal(p.els.tab_review.getAttribute("aria-selected"), "false");
  assert.equal(p.els.tab_agent.getAttribute("aria-selected"), "false");
  assert.equal(f.activeTab(), "drawing");
});

test("tab bar: initFrame({tabs}) fills #tabbar with button[data-tab]", () => {
  const p = page({ tabs: "none" });
  const tabs = [{ id: "a", label: "A", target: ".view" }, { id: "b", label: "B", target: ".inspector" }, { id: "c", label: "C", target: "#chat" }, { id: "d", label: "D", target: ".nothing" }];
  const f = p.init({ tabs });
  const buttons = p.els.tabbar.querySelectorAll("[data-tab]");
  assert.deepEqual(buttons.map((b) => b.getAttribute("data-tab")), ["a", "b", "c", "d"]);
  assert.deepEqual(buttons.map((b) => b.textContent), ["A", "B", "C", "D"]);
  assert.deepEqual(buttons.map((b) => b.getAttribute("aria-selected")), ["true", "false", "false", "false"]);
  assert.equal(p.els.tabbar.getAttribute("role"), "tablist");
  p.setNarrow(true);
  buttons[3].click();
  assert.equal(f.activeTab(), "d");
  assert.equal(p.els.view.style.display, "none");
  // Calling it again replaces the first run's buttons and listeners.
  p.init({ tabs: tabs.slice(0, 2) });
  assert.equal(p.els.tabbar.querySelectorAll("[data-tab]").length, 2);
});

test("tab click at 900px and below shows one pane and clears the others' inline display", () => {
  const p = page({ narrow: true });
  const f = p.init();
  assert.equal(p.els.view.style.display, "");
  assert.equal(p.els.inspector.style.display, "none");
  assert.equal(p.els.chat.style.display, "none");
  p.els.tab_review.click();
  assert.equal(p.els.view.style.display, "none");
  assert.equal(p.els.inspector.style.display, "");
  assert.equal(p.els.chat.style.display, "none");
  assert.equal(p.els.tab_review.getAttribute("aria-selected"), "true");
  assert.equal(p.els.tab_drawing.getAttribute("aria-selected"), "false");
  f.activateTab("agent");
  assert.equal(p.els.chat.style.display, "");
  assert.equal(p.els.inspector.style.display, "none");
  f.activateTab("missing");
  assert.equal(f.activeTab(), "agent");
});

test("tab click at wide widths records the tab but hides no pane", () => {
  const p = page();
  const f = p.init();
  p.els.tab_agent.click();
  assert.equal(f.activeTab(), "agent");
  assert.equal(p.els.tab_agent.getAttribute("aria-selected"), "true");
  for (const el of [p.els.view, p.els.inspector, p.els.chat]) assert.equal(el.style.display, "");
});

test("crossing the breakpoint clears the inline display, and back re-applies it", () => {
  const p = page({ narrow: true });
  const f = p.init();
  p.els.tab_review.click();
  assert.equal(p.els.view.style.display, "none");
  p.setNarrow(false);
  for (const el of [p.els.view, p.els.inspector, p.els.chat]) assert.equal(el.style.display, "");
  assert.equal(f.isNarrow(), false);
  p.setNarrow(true);
  assert.equal(p.els.view.style.display, "none");
  assert.equal(p.els.inspector.style.display, "");
  assert.equal(f.activeTab(), "review");
});

test("framechange fires on .wb with {layout, insp, chat, panelOpen, activeTab}", () => {
  const p = page();
  const f = p.init();
  p.els.set_drawing.click();
  assert.deepEqual(plain(p.events.at(-1)), { layout: "drawing", insp: null, chat: null, panelOpen: true, activeTab: "drawing" });
  f.setWidths({ insp: 400 });
  assert.equal(p.events.at(-1).insp, 400);
  p.els.panelBtn.click();
  assert.equal(p.events.at(-1).panelOpen, false);
  p.els.tab_agent.click();
  assert.equal(p.events.at(-1).activeTab, "agent");
});

test("handles: inserted before their panes, separators, only for panes that exist", () => {
  const p = page();
  p.init();
  const gi = grip(p, "insp");
  const gc = grip(p, "chat");
  assert.equal(gi.nextSibling, p.els.inspector);
  assert.equal(gc.nextSibling, p.els.chat);
  assert.equal(gi.getAttribute("role"), "separator");
  assert.equal(gi.getAttribute("aria-orientation"), "vertical");
  assert.equal(gi.getAttribute("tabindex"), "0");
  assert.equal(gi.getAttribute("aria-valuemin"), "240");
  assert.equal(gi.getAttribute("aria-valuemax"), "560");
  assert.equal(gc.getAttribute("aria-valuemin"), "320");
  assert.equal(gc.getAttribute("aria-valuemax"), "720");
  const q = page({ inspector: false });
  q.init();
  assert.equal(grip(q, "insp"), null);
  assert.ok(grip(q, "chat"));
});

test("handles: keys move 16px, Home and End go to the limits, double-click resets", () => {
  const p = page();
  const f = p.init();
  const g = grip(p, "insp");
  p.fire(g, "keydown", { key: "ArrowLeft" });
  assert.equal(f.widths().insp, 316);
  assert.equal(g.getAttribute("aria-valuenow"), "316");
  p.fire(g, "keydown", { key: "ArrowRight" });
  p.fire(g, "keydown", { key: "ArrowRight" });
  assert.equal(f.widths().insp, 284);
  p.fire(g, "keydown", { key: "Home" });
  assert.equal(f.widths().insp, 240);
  p.fire(g, "keydown", { key: "ArrowRight" });
  assert.equal(f.widths().insp, 240);
  p.fire(g, "keydown", { key: "End" });
  assert.equal(f.widths().insp, 560);
  assert.deepEqual(JSON.parse(p.stored()), { layout: "split", insp: 560 });
  assert.equal(p.fire(g, "keydown", { key: "a" }), true);
  p.fire(g, "dblclick");
  assert.equal(f.widths().insp, null);
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
  assert.deepEqual(JSON.parse(p.stored()), { layout: "split" });
});

test("handles: a pointer drag widens the pane, clamped, and stores on release", () => {
  const p = page();
  const f = p.init();
  const g = grip(p, "chat");
  p.fire(g, "pointerdown", { clientX: 1000, pointerId: 1 });
  assert.equal(g.hasAttribute("data-dragging"), true);
  p.fire(g, "pointermove", { clientX: 900 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "500px");
  p.fire(g, "pointermove", { clientX: -4000 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "720px");
  p.fire(g, "pointermove", { clientX: 5000 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "320px");
  assert.equal(p.stored(), null, "nothing stored while dragging");
  p.fire(g, "pointerup", { clientX: 5000 });
  assert.equal(g.hasAttribute("data-dragging"), false);
  assert.equal(f.widths().chat, 320);
  assert.deepEqual(JSON.parse(p.stored()), { layout: "split", chat: 320 });
  // After release a stray lostpointercapture changes nothing.
  p.fire(g, "lostpointercapture", {});
  assert.equal(p.storage.writes, 1);
});

test("the view keeps 320px: a wide stored width is cut back as the window narrows, and returns", () => {
  const stored = new FakeStorage({ "annealage.frame.loom": JSON.stringify({ insp: 560 }) });
  const wide = page({ wide: 1600, storage: stored });
  wide.init();
  assert.equal(wide.root.style.getPropertyValue("--insp-w-user"), "560px");
  const small = page({ wide: 1000, storage: stored });
  const f = small.init();
  // 952 shared by view, inspector and agent (400): the inspector gives way, but not below its default.
  assert.equal(small.root.style.getPropertyValue("--insp-w-user"), "300px");
  assert.equal(f.widths().insp, 560, "the stored choice is kept");
  assert.equal(small.root.style.getPropertyValue("--chat-w-user"), "", "a column with nothing stored is left to the theme");
  const mid = page({ wide: 1200, storage: stored });
  mid.init();
  // 1152 - 400 - 320 = 432 for the inspector.
  assert.equal(mid.root.style.getPropertyValue("--insp-w-user"), "432px");
});

test("widths are written only while the column is open, and not at 900px and below", () => {
  const p = page({ wide: 1600 });
  const f = p.init();
  f.setWidths({ insp: 420, chat: 560 });
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "420px");
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "560px");
  p.els.panelBtn.click();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "", "closed inspector: no inline width");
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "560px");
  p.els.panelBtn.click();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "420px", "reopens at the dragged width");
  p.els.set_drawing.click();
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "", "agent pane closed by drawing focus");
  p.els.set_agent.click();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
  p.els.set_split.click();
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "560px");
  p.setNarrow(true);
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "");
  assert.deepEqual(plain(f.widths()), { insp: 420, chat: 560 });
  p.setNarrow(false);
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "420px");
});

test("two products on one origin keep separate settings", () => {
  const storage = new FakeStorage();
  const a = page({ product: "loom", storage });
  const b = page({ product: "mesh", storage });
  const none = page({ product: null, storage });
  a.init().setWidths({ insp: 400 });
  b.init().setWidths({ insp: 500 });
  none.init().setLayout("drawing");
  assert.equal(JSON.parse(storage.getItem("annealage.frame.loom")).insp, 400);
  assert.equal(JSON.parse(storage.getItem("annealage.frame.mesh")).insp, 500);
  assert.equal(JSON.parse(storage.getItem("annealage.frame.platform")).layout, "drawing");
  const again = page({ product: "mesh", storage });
  assert.equal(again.init().widths().insp, 500);
});

test("data-auto starts it once the page has parsed", () => {
  const p = page({ auto: true });
  assert.equal(p.ctx.annealageFrame.current, null);
  p.doc.dispatchEvent({ type: "DOMContentLoaded" });
  const f = p.ctx.annealageFrame.current;
  assert.ok(f);
  assert.equal(f.activeTab(), "drawing");
  assert.equal(p.els.tabbar.getAttribute("role"), "tablist");
  assert.ok(grip(p, "insp"));
  const q = page({ auto: true, wb: false });
  assert.doesNotThrow(() => q.doc.dispatchEvent({ type: "DOMContentLoaded" }));
});

test("destroy() removes the handles, listeners and inline widths", () => {
  const p = page({ wide: 1600 });
  const f = p.init();
  f.setWidths({ insp: 400 });
  p.setNarrow(true);
  f.destroy();
  assert.equal(p.root.querySelector(".colgrip"), null);
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
  for (const el of [p.els.view, p.els.inspector, p.els.chat]) assert.equal(el.style.display, "");
  assert.equal(p.mq.listeners.length, 0);
  p.els.set_agent.click();
  assert.equal(p.root.getAttribute("data-layout"), "split");
});

// ---- The inspector on the left (data-insp="left") and the split between two halves.

test("left inspector: the handle sits after the pane, a pointer drag to the right widens it", () => {
  const p = page({ left: true, wide: 1600 });
  const f = p.init();
  const g = grip(p, "insp");
  assert.equal(p.root.children[p.root.children.indexOf(g) - 1], p.els.inspector, "right after the inspector");
  assert.equal(grip(p, "chat").nextSibling, p.els.chat, "the agent pane's handle stays before its pane");
  assert.equal(g.getAttribute("aria-label"), "Resize the left pane");
  p.fire(g, "pointerdown", { clientX: 300, pointerId: 1 });
  p.fire(g, "pointermove", { clientX: 380 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "380px");
  p.fire(g, "pointermove", { clientX: 5000 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "560px");
  p.fire(g, "pointermove", { clientX: -5000 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "240px");
  p.fire(g, "pointerup", {});
  assert.equal(f.widths().insp, 240);
  assert.deepEqual(JSON.parse(p.stored()), { layout: "split", insp: 240 });
});

test("left inspector: Right grows, Left shrinks, Home and End go to the limits, double-click resets", () => {
  const p = page({ left: true, wide: 1600 });
  const f = p.init();
  const g = grip(p, "insp");
  p.fire(g, "keydown", { key: "ArrowRight" });
  assert.equal(f.widths().insp, 316);
  assert.equal(g.getAttribute("aria-valuenow"), "316");
  p.fire(g, "keydown", { key: "ArrowLeft" });
  p.fire(g, "keydown", { key: "ArrowLeft" });
  assert.equal(f.widths().insp, 284);
  p.fire(g, "keydown", { key: "Home" });
  assert.equal(f.widths().insp, 240);
  p.fire(g, "keydown", { key: "End" });
  assert.equal(f.widths().insp, 560);
  assert.equal(p.fire(g, "keydown", { key: "ArrowUp" }), true, "other keys are left alone");
  p.fire(g, "dblclick");
  assert.equal(f.widths().insp, null);
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
});

test("left inspector: the view keeps 320px, measured on three columns with no rail", () => {
  const stored = new FakeStorage({ "annealage.frame.loom": JSON.stringify({ insp: 560, chat: 600 }) });
  const wide = page({ left: true, wide: 1600, storage: stored });
  wide.init();
  assert.equal(wide.root.style.getPropertyValue("--insp-w-user"), "560px");
  assert.equal(wide.root.style.getPropertyValue("--chat-w-user"), "600px");
  // 1200 shared by inspector, view and agent: the agent pane gives way first, not below its default.
  const mid = page({ left: true, wide: 1200, storage: stored });
  mid.init();
  assert.equal(mid.root.style.getPropertyValue("--chat-w-user"), "400px");
  assert.equal(mid.root.style.getPropertyValue("--insp-w-user"), "480px");
  // The same widths on a page with the rail leave the rail out of the sum.
  const rail = page({ wide: 1200, storage: stored });
  rail.init();
  assert.equal(rail.root.style.getPropertyValue("--chat-w-user"), "400px");
  assert.equal(rail.root.style.getPropertyValue("--insp-w-user"), "432px");
});

test("left inspector: closed it takes no inline width, and the layout focus closes the agent column", () => {
  const p = page({ left: true, wide: 1600 });
  const f = p.init();
  f.setWidths({ insp: 420, chat: 560 });
  p.els.panelBtn.click();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "560px");
  p.els.panelBtn.click();
  p.els.set_drawing.click();
  assert.equal(p.root.style.getPropertyValue("--chat-w-user"), "");
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "420px");
  p.els.set_agent.click();
  assert.equal(p.root.style.getPropertyValue("--insp-w-user"), "");
});

test("split: one handle between the halves, a separator with a range, none without a split", () => {
  const p = page({ split: true });
  const f = p.init();
  const g = grip(p, "split");
  assert.equal(g.parentNode, p.els.host);
  assert.equal(g.nextSibling, p.els.half_b);
  assert.equal(g.getAttribute("role"), "separator");
  assert.equal(g.getAttribute("aria-orientation"), "vertical");
  assert.equal(g.getAttribute("tabindex"), "0");
  assert.equal(g.getAttribute("aria-valuemin"), "27", "each half keeps 240px of 900");
  assert.equal(g.getAttribute("aria-valuemax"), "73");
  assert.equal(g.getAttribute("aria-valuenow"), "50");
  assert.equal(f.split(), null);
  const q = page();
  const h = q.init();
  assert.equal(grip(q, "split"), null);
  assert.equal(h.split(), null);
  h.setSplit(0.4);
  assert.equal(h.split(), null, "a page with no split keeps none");
  assert.equal(q.stored(), null);
  assert.equal(q.storage.writes, 0);
});

test("split: keys move 16px of the host, Home and End go to the limits, double-click resets", () => {
  const p = page({ split: true });
  const f = p.init();
  const g = grip(p, "split");
  p.fire(g, "keydown", { key: "ArrowRight" });
  assert.ok(Math.abs(f.split() - (0.5 + 16 / 900)) < 1e-3);
  assert.equal(p.root.style.getPropertyValue("--split-user"), `${Math.round((0.5 + 16 / 900) * 10000) / 100}%`);
  p.fire(g, "keydown", { key: "ArrowLeft" });
  p.fire(g, "keydown", { key: "ArrowLeft" });
  assert.ok(Math.abs(f.split() - (0.5 - 16 / 900)) < 1e-3);
  p.fire(g, "keydown", { key: "Home" });
  assert.ok(Math.abs(f.split() - 240 / 900) < 1e-3);
  p.fire(g, "keydown", { key: "End" });
  assert.ok(Math.abs(f.split() - (1 - 240 / 900)) < 1e-3);
  assert.equal(g.getAttribute("aria-valuenow"), "73");
  assert.equal(p.fire(g, "keydown", { key: "x" }), true);
  assert.deepEqual(Object.keys(JSON.parse(p.stored())).sort(), ["layout", "split"]);
  p.fire(g, "dblclick");
  assert.equal(f.split(), null);
  assert.equal(p.root.style.getPropertyValue("--split-user"), "");
  assert.deepEqual(JSON.parse(p.stored()), { layout: "split" });
});

test("split: a pointer drag moves the seam by the pointer, clamped, and stores on release", () => {
  const p = page({ split: true });
  const f = p.init();
  const g = grip(p, "split");
  p.fire(g, "pointerdown", { clientX: 710, pointerId: 1 });
  assert.equal(g.hasAttribute("data-dragging"), true);
  p.fire(g, "pointermove", { clientX: 800 }); // 90px of 900
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--split-user"), "60%");
  p.fire(g, "pointermove", { clientX: -4000 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--split-user"), "26.67%");
  p.fire(g, "pointermove", { clientX: 9000 });
  p.flush();
  assert.equal(p.root.style.getPropertyValue("--split-user"), "73.33%");
  assert.equal(p.stored(), null, "nothing stored while dragging");
  p.fire(g, "pointerup", {});
  assert.equal(g.hasAttribute("data-dragging"), false);
  assert.ok(Math.abs(f.split() - (1 - 240 / 900)) < 1e-3);
  assert.equal(JSON.parse(p.stored()).split, f.split());
  p.fire(g, "lostpointercapture", {});
  assert.equal(p.storage.writes, 1, "a stray lostpointercapture changes nothing");
});

test("split: restored from storage and clamped, kept as stored when the window is small", () => {
  const stored = new FakeStorage({ "annealage.frame.loom": JSON.stringify({ split: 0.35 }) });
  const p = page({ split: true, storage: stored });
  const f = p.init();
  assert.equal(f.split(), 0.35);
  assert.equal(p.root.style.getPropertyValue("--split-user"), "35%");
  const wild = page({ split: true, storage: new FakeStorage({ "annealage.frame.loom": JSON.stringify({ split: 5 }) }) });
  assert.equal(wild.init().split(), 0.8, "clamped to the stored range");
  assert.equal(wild.root.style.getPropertyValue("--split-user"), "73.33%", "and to what 900px can hold");
  const small = page({ split: true, hostWidth: 400, storage: new FakeStorage({ "annealage.frame.loom": JSON.stringify({ split: 0.2 }) }) });
  const g = small.init();
  assert.equal(g.split(), 0.2);
  assert.equal(small.root.style.getPropertyValue("--split-user"), "50%", "400px holds two halves of 240 only if they are equal");
  const nosplit = page({ storage: new FakeStorage({ "annealage.frame.loom": JSON.stringify({ split: 0.3 }) }) });
  assert.equal(nosplit.init().split(), null);
  assert.equal(nosplit.root.style.getPropertyValue("--split-user"), "");
});

test("split: not applied at 900px and below or in the agent layout, and back after", () => {
  const p = page({ split: true, wide: 1600 });
  const f = p.init();
  f.setSplit(0.4);
  assert.equal(p.root.style.getPropertyValue("--split-user"), "40%");
  p.setNarrow(true);
  assert.equal(p.root.style.getPropertyValue("--split-user"), "");
  assert.equal(f.split(), 0.4);
  p.setNarrow(false);
  assert.equal(p.root.style.getPropertyValue("--split-user"), "40%");
  p.els.set_agent.click();
  assert.equal(p.root.style.getPropertyValue("--split-user"), "");
  p.els.set_split.click();
  assert.equal(p.root.style.getPropertyValue("--split-user"), "40%");
});

test("split: setSplit clamps, null clears, and the share rides in framechange; the column widths are untouched", () => {
  const p = page({ split: true, wide: 1600 });
  const f = p.init();
  f.setSplit(0.05);
  assert.equal(f.split(), 0.2);
  f.setSplit(0.9);
  assert.equal(f.split(), 0.8);
  f.setSplit(0.45);
  assert.deepEqual(plain(p.events.at(-1)), { layout: "split", insp: null, chat: null, split: 0.45, panelOpen: true, activeTab: "drawing" });
  assert.deepEqual(plain(f.widths()), { insp: null, chat: null });
  f.setSplit(null);
  assert.equal(f.split(), null);
  f.setSplit(NaN);
  assert.equal(f.split(), null);
  f.setWidths({ insp: 400 });
  f.setSplit(0.3);
  assert.deepEqual(JSON.parse(p.stored()), { layout: "split", insp: 400, split: 0.3 });
});

test("split: reset() and destroy() forget it, and destroy removes the handle", () => {
  const p = page({ split: true, wide: 1600 });
  const f = p.init();
  f.setSplit(0.4);
  f.reset();
  assert.equal(f.split(), null);
  assert.equal(p.stored(), null);
  assert.equal(p.root.style.getPropertyValue("--split-user"), "");
  f.setSplit(0.4);
  f.destroy();
  assert.equal(grip(p, "split"), null);
  assert.equal(p.root.style.getPropertyValue("--split-user"), "");
});

test("a layout button that is aria-disabled does nothing", () => {
  const p = page();
  const f = p.init();
  p.els.set_agent.setAttribute("aria-disabled", "true");
  p.els.set_agent.click();
  assert.equal(f.layout(), "split");
  assert.equal(p.stored(), null);
  p.els.set_drawing.click();
  assert.equal(f.layout(), "drawing");
});

test("a page with no split or left inspector writes and reports what it did before", () => {
  const p = page({ wide: 1600 });
  const f = p.init();
  f.setWidths({ insp: 400 });
  assert.deepEqual(JSON.parse(p.stored()), { layout: "split", insp: 400 });
  assert.equal("split" in p.events.at(-1), false);
  assert.equal(p.root.querySelector("[data-grip=split]"), null);
});
