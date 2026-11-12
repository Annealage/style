// node --test tools/account.test.mjs
// account.js against a minimal fake DOM: what it draws from the /_front/me answer, that the menu it
// draws is the one of demo/workbench.html, the toggling, the sign out, and every case that must draw
// nothing and throw nothing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SRC = fs.readFileSync(new URL("../account.js", import.meta.url), "utf8");
const REFERENCE = fs.readFileSync(new URL("../demo/workbench.html", import.meta.url), "utf8");

// ---- A fake DOM with the selectors account.js uses: [attr] and [attr=value], comma lists.
const compound = (text) => {
  const m = /^\[([\w-]+)(?:=([^\]]*))?\]$/.exec(text.trim());
  if (!m) throw new Error(`fake DOM cannot parse selector: ${text}`);
  return { attr: m[1], value: m[2] };
};
const parse = (sel) => sel.split(",").map(compound);

class El {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tag = tag;
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.text = "";
    this.listeners = {};
    this.disabled = false;
    this.focused = false;
    const owner = this;
    this.classList = {
      list: () => (owner.getAttribute("class") || "").split(/\s+/).filter(Boolean),
      contains: (n) => owner.classList.list().includes(n),
      add: (n) => { if (!owner.classList.contains(n)) owner.setAttribute("class", [...owner.classList.list(), n].join(" ")); },
    };
  }
  get textContent() { return this.text; }
  set textContent(v) { this.text = String(v); this.children = []; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { c.remove(); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { c.remove(); return c; }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  matches(sel) { return parse(sel).some((c) => this.hasAttribute(c.attr) && (c.value === undefined || this.getAttribute(c.attr) === c.value)); }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  dispatch(ev) {
    ev.target ||= this;
    for (let n = this; n; n = n.parentNode) for (const fn of [...(n.listeners[ev.type] || [])]) fn(ev);
  }
  focus() { this.focused = true; }
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const json = (body) => Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) });
const status = (code) => Promise.resolve({ ok: false, status: code, json: async () => ({ error: { type: "unauthenticated" } }) });

const ME = {
  v: 1, display: "Alex Engineer", email: "alex@example.com",
  account_url: "settings.html", security_url: "settings.html#security", projects_url: "/",
  signout: { method: "POST", url: "/auth/logout" },
  products: [
    { key: "canvas", name: "Canvas", url: "workbench.html?product=canvas", current: false },
    { key: "trace", name: "Trace", url: "workbench.html?product=trace", current: false },
    { key: "loom", name: "Loom", url: "workbench.html?product=loom", current: true },
    { key: "mesh", name: "Mesh", url: "workbench.html?product=mesh", current: false },
  ],
};

// A page with a title bar. `places` is what the product put in it. `answer` is a function of
// (url, init) giving fetch's promise, or an Error (the request fails), or an object (200 with it).
function page({ places = ["menu"], answer = ME, src = "../account.js", loading = false } = {}) {
  const doc = new El(null, "document");
  const make = (tag, attrs = {}, parent = null) => {
    const e = new El(doc, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent?.appendChild(e);
    return e;
  };
  const html = make("html", {}, doc);
  const body = make("body", {}, html);
  const bar = make("header", { class: "titlebar" }, body);
  const right = make("div", { class: "tb-right" }, bar);
  const els = { body, bar, right };
  for (const p of places) {
    if (p === "menu") els.menu = make("span", { "data-account-menu": "", hidden: "" }, right);
    if (p === "switch") els.switch = make("nav", { "data-product-switch": "", hidden: "" }, bar);
    if (p === "src") els.menu = make("span", { "data-account-menu": "", "data-src": "/other/me" }, right);
    if (p === "built") {  // what hosted draws itself: not empty, so not ours
      els.built = make("details", { class: "more", "data-account-menu": "" }, right);
      make("summary", {}, els.built);
    }
  }
  const calls = [];
  const assigned = [];
  const docListeners = {};
  doc.documentElement = html;
  doc.body = body;
  doc.readyState = loading ? "loading" : "complete";
  doc.currentScript = src === null ? null : { getAttribute: (k) => (k === "src" ? src : null) };
  doc.createElement = (tag) => new El(doc, tag);
  doc.createElementNS = (_ns, tag) => new El(doc, tag);
  doc.querySelectorAll = (sel) => html.querySelectorAll(sel);
  doc.querySelector = (sel) => html.querySelector(sel);
  doc.addEventListener = (t, fn) => (docListeners[t] ||= []).push(fn);
  doc.listeners = docListeners;
  const fetchStub = (url, init) => {
    calls.push({ url, init });
    if (typeof answer === "function") return answer(url, init);
    if (answer instanceof Error) return Promise.reject(answer);
    return json(answer);
  };
  const win = {
    document: doc,
    URL,
    location: { href: "https://trace.example/w/wsp_1/p/prj_1/", assign: (u) => assigned.push(u) },
    fetch: fetchStub,
  };
  win.window = win;
  doc.defaultView = win;
  const ctx = vm.createContext(win);
  const run = () => vm.runInContext(SRC, ctx);
  if (!loading) run();
  // A click reaches the element's own listeners and then the document's, as a real one bubbles up.
  const press = (el) => { el.dispatch({ type: "click" }); for (const fn of docListeners.click || []) fn({ type: "click", target: el }); };
  const key = (k) => { for (const fn of docListeners.keydown || []) fn({ type: "keydown", key: k }); };
  const ready = () => { for (const fn of docListeners.DOMContentLoaded || []) fn({}); };
  return { ctx, doc, els, calls, assigned, run, press, key, ready };
}
const place = (p, attrs = {}) => {
  const e = new El(p.doc, "span");
  e.setAttribute("data-account-menu", "");
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  p.els.right.appendChild(e);
  return e;
};
const labels = (el) => el.querySelectorAll("[role=menuitem]").map((e) => e.text);

// ---- A small HTML reader, to hold the drawn menu against the one in the reference page.
const VOID = new Set(["hr", "img", "input", "br", "source", "use", "meta", "link"]);
function readHtml(text) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([a-z][a-z0-9]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    if (m[5] !== undefined) { if (m[5].trim()) stack.at(-1).children.push(m[5]); continue; }
    if (m[1]) { stack.pop(); continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? "";
    const node = { tag: m[2].toLowerCase(), attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!VOID.has(node.tag) && !m[4]) stack.push(node);
  }
  return root.children[0];
}
const fromDom = (e) => ({ tag: e.tag, attrs: Object.fromEntries(e.attrs), children: e.text ? [e.text] : e.children.map(fromDom) });
// Canonical form: sorted attributes, and without what the page, not the markup, decides (hidden and
// data-only on the place, which product is current).
const canon = (n, top = true) => {
  if (typeof n === "string") return n;
  const attrs = { ...n.attrs };
  if (top) { delete attrs.hidden; delete attrs["data-only"]; }
  if (n.tag === "a") delete attrs["aria-current"];
  const a = Object.keys(attrs).sort().map((k) => `${k}="${attrs[k]}"`).join(" ");
  return `<${n.tag}${a ? " " + a : ""}>${n.children.map((c) => canon(c, false)).join("")}</${n.tag}>`;
};
const referenceMenus = () => [...REFERENCE.matchAll(/<span class="menuwrap" data-account-menu[^>]*>.*?Sign out<\/button><\/span><\/span>/g)].map((m) => m[0]);

test("the menu it draws is the one in the reference page, in the default and the Canvas template", async () => {
  const p = page();
  await flush();
  const built = canon(fromDom(p.els.menu));
  const found = referenceMenus();
  assert.equal(found.length, 2);
  for (const html of found) assert.equal(canon(readHtml(html)), built);
});

test("a page with no place makes no request", async () => {
  const p = page({ places: [] });
  await flush();
  assert.equal(p.calls.length, 0);
});

test("one request for every place, with the page's cookie and no cache", async () => {
  const p = page({ places: ["menu", "switch"] });
  await flush();
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].url, "/_front/me");
  assert.equal(p.calls[0].init.credentials, "same-origin");
  assert.equal(p.calls[0].init.cache, "no-store");
  assert.equal(p.calls[0].init.method, undefined);
});

test("the first place can name another URL", async () => {
  const p = page({ places: ["src"] });
  await flush();
  assert.equal(p.calls[0].url, "/other/me");
});

test("the menu shows its place, names the person and offers Account, Security, Products and Sign out", async () => {
  const p = page();
  assert.equal(p.els.menu.hasAttribute("hidden"), true);
  await flush();
  const m = p.els.menu;
  assert.equal(m.hasAttribute("hidden"), false);
  assert.ok(m.classList.contains("menuwrap"));
  const button = m.querySelector("[data-menu]");
  assert.equal(button.getAttribute("aria-label"), "Account menu, Alex Engineer");
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(button.children[1].text, "Alex Engineer");
  assert.deepEqual(labels(m), ["Account", "Security", "Canvas", "Trace", "Loom", "Mesh", "Sign out"]);
  const current = m.querySelectorAll("[aria-current]");
  assert.deepEqual(current.map((e) => e.text), ["Loom"]);
  assert.equal(current[0].getAttribute("aria-current"), "page");
});

test("the icons come from the sprite beside the script, and data-icons wins", async () => {
  const p = page({ src: "/w/wsp_1/p/prj_1/style/account.js?v=3" });
  await flush();
  const uses = (el) => el.querySelectorAll("[href]").filter((e) => e.tag === "use").map((e) => e.getAttribute("href"));
  assert.deepEqual(uses(p.els.menu), ["/w/wsp_1/p/prj_1/style/icons.svg#i-user", "/w/wsp_1/p/prj_1/style/icons.svg#i-chev-d"]);
  const q = page({ src: null });
  await flush();
  assert.equal(uses(q.els.menu)[0], "/style/icons.svg#i-user");
  const r = page({ places: [] });
  const mine = place(r, { "data-icons": "/other/icons.svg" });
  r.ctx.annealageAccount.draw();
  await flush();
  assert.equal(uses(mine)[0], "/other/icons.svg#i-user");
});

test("a name or an email with markup is text, never elements", async () => {
  const evil = '<img src=x onerror="alert(1)">"><script>1</script>';
  const p = page({ answer: { ...ME, display: evil, email: evil } });
  await flush();
  const m = p.els.menu;
  const button = m.querySelector("[data-menu]");
  assert.equal(button.getAttribute("aria-label"), `Account menu, ${evil}`);
  assert.equal(button.children[1].text, evil);
  assert.equal(button.children[1].children.length, 0);
  const note = m.querySelector("[role=menu]").children[0];
  assert.equal(note.text, evil);
  assert.equal(note.children.length, 0);
  const all = [];
  const walk = (e) => { all.push(e.tag); e.children.forEach(walk); };
  walk(m);
  assert.ok(!all.includes("img") && !all.includes("script"));
});

test("a link that is not http, https or relative is not drawn", async () => {
  const p = page({ answer: { ...ME, account_url: "javascript:alert(1)", security_url: "data:text/html,x", products: [
    { name: "Trace", url: "https://trace.example/", current: true }, { name: "Evil", url: "javascript:1" }, { name: "Loom", url: "https://loom.example/" },
  ] } });
  await flush();
  assert.deepEqual(labels(p.els.menu), ["Trace", "Loom", "Sign out"]);
});

test("a sign-out the answer does not describe as a same-origin POST is not offered", async () => {
  for (const signout of [undefined, null, { method: "GET", url: "/auth/logout" }, { method: "POST", url: "https://evil.example/x" }, { method: "POST", url: "//evil.example/x" }]) {
    const p = page({ answer: { ...ME, signout } });
    await flush();
    assert.equal(labels(p.els.menu).includes("Sign out"), false);
    assert.equal(labels(p.els.menu).includes("Account"), true);
  }
});

test("a lone product, or a page with a product switch, gets no Products group", async () => {
  const one = page({ answer: { ...ME, products: [ME.products[2]] } });
  await flush();
  assert.deepEqual(labels(one.els.menu), ["Account", "Security", "Sign out"]);
  const both = page({ places: ["menu", "switch"] });
  await flush();
  assert.deepEqual(labels(both.els.menu), ["Account", "Security", "Sign out"]);
});

test("the product switch holds a link per product and marks the current one", async () => {
  const p = page({ places: ["switch"] });
  await flush();
  const nav = p.els.switch;
  assert.equal(nav.hasAttribute("hidden"), false);
  assert.ok(nav.classList.contains("prodtabs"));
  assert.equal(nav.getAttribute("aria-label"), "Product");
  assert.deepEqual(nav.children.map((a) => a.text), ["Canvas", "Trace", "Loom", "Mesh"]);
  assert.deepEqual(nav.children.map((a) => a.getAttribute("aria-current")), [null, null, "page", null]);
  assert.equal(nav.children[0].getAttribute("href"), "workbench.html?product=canvas");
});

test("the menu opens and closes by its button, a click outside, and Escape", async () => {
  const p = page();
  await flush();
  const m = p.els.menu;
  const button = m.querySelector("[data-menu]");
  p.press(button);
  assert.equal(m.hasAttribute("data-open"), true);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  p.press(m.querySelector("[role=menu]"));  // inside the menu: stays
  assert.equal(m.hasAttribute("data-open"), true);
  p.press(p.els.right);  // outside
  assert.equal(m.hasAttribute("data-open"), false);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  p.press(button);
  p.key("a");
  assert.equal(m.hasAttribute("data-open"), true);
  p.key("Escape");
  assert.equal(m.hasAttribute("data-open"), false);
  assert.equal(button.focused, true);
  p.key("Escape");  // closed already: nothing happens
  p.press(button);
  p.press(button);
  assert.equal(m.hasAttribute("data-open"), false);
});

const signoutAnswer = (post) => (url, init) => (init && init.method === "POST" ? post() : json(ME));
const click = (p, el) => { if (!el.disabled) p.press(el); };

test("sign out posts to the named URL and then goes to the front page", async () => {
  const p = page({ answer: signoutAnswer(() => json({ signed_out: true })) });
  await flush();
  const out = p.els.menu.querySelectorAll("[role=menuitem]").at(-1);
  click(p, out);
  assert.equal(out.disabled, true);
  await flush();
  const post = p.calls.at(-1);
  assert.equal(post.url, "/auth/logout");
  assert.equal(post.init.method, "POST");
  assert.equal(post.init.credentials, "same-origin");
  assert.deepEqual(p.assigned, ["/"]);
});

for (const [name, fail] of [["a refusal", () => status(403)], ["a network failure", () => Promise.reject(new Error("offline"))]]) {
  test(`sign out after ${name} says so in the menu, stays on the page, and can be tried again`, async () => {
    let refuse = true;
    const p = page({ answer: signoutAnswer(() => (refuse ? fail() : json({}))) });
    await flush();
    const menu = p.els.menu.querySelector("[role=menu]");
    const out = p.els.menu.querySelectorAll("[role=menuitem]").at(-1);
    click(p, out);
    await flush();
    assert.deepEqual(p.assigned, []);
    assert.equal(out.disabled, false);
    const notes = menu.querySelectorAll("[role=alert]");
    assert.equal(notes.length, 1);
    assert.equal(notes[0].text, "Couldn't sign out. Try again.");
    refuse = false;
    click(p, out);
    await flush();
    assert.equal(menu.querySelectorAll("[role=alert]").length, 0);
    assert.deepEqual(p.assigned, ["/"]);
  });
}

for (const [name, answer] of [
  ["a signed-out visitor (401)", () => status(401)],
  ["a standalone product (404)", () => status(404)],
  ["a server fault", () => status(500)],
  ["a failed request", new Error("offline")],
  ["a body that is not JSON", () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("x"); } })],
  ["a body of null", () => json(null)],
  ["another version", { ...ME, v: 2 }],
  ["no name", { ...ME, display: 7 }],
]) {
  test(`${name}: nothing is drawn, nothing is thrown, the place stays as it was`, async () => {
    const p = page({ places: ["menu", "switch"], answer });
    await flush();
    assert.equal(p.els.menu.children.length, 0);
    assert.equal(p.els.switch.children.length, 0);
    assert.equal(p.els.menu.hasAttribute("hidden"), true);
    assert.equal(p.els.switch.hasAttribute("hidden"), true);
    assert.equal(p.calls.length, 1);
    assert.equal((p.doc.listeners.click || []).length, 0);
  });
}

test("a slow answer draws nothing until it comes", async () => {
  let release;
  const p = page({ answer: () => new Promise((resolve) => { release = () => resolve(json(ME)); }) });
  await flush();
  assert.equal(p.els.menu.children.length, 0);
  assert.equal(p.els.menu.hasAttribute("hidden"), true);
  release();
  await flush();
  assert.equal(p.els.menu.children.length, 2);
});

test("a place a page filled itself is left alone, and makes no request", async () => {
  const p = page({ places: ["built"] });
  await flush();
  assert.equal(p.calls.length, 0);
  assert.equal(p.els.built.children.length, 1);
});

test("a page still loading is drawn once it has parsed", async () => {
  const p = page({ loading: true });
  p.run();
  await flush();
  assert.equal(p.calls.length, 0);
  p.ready();
  await flush();
  assert.equal(p.calls.length, 1);
  assert.equal(p.els.menu.children.length, 2);
});

test("a title bar drawn later is filled by draw(), from the one answer, and never twice", async () => {
  const p = page();
  await flush();
  const later = place(p);
  p.ctx.annealageAccount.draw(p.els.right);
  p.ctx.annealageAccount.draw(p.els.right);
  await flush();
  assert.equal(p.calls.length, 1);
  assert.equal(later.children.length, 2);
  assert.equal(p.els.menu.children.length, 2);
  p.ctx.annealageAccount.draw();
  await flush();
  assert.equal(p.els.menu.children.length, 2);
  assert.equal(later.children.length, 2);
});

test("without fetch there is nothing to do and nothing thrown", async () => {
  const p = page({ places: [] });
  const mine = place(p);
  delete p.ctx.fetch;
  p.ctx.annealageAccount.draw();
  await flush();
  assert.equal(mine.children.length, 0);
});

test("an email of null leaves the note out, and an empty name falls back to the email, then Account", async () => {
  const a = page({ answer: { ...ME, email: null } });
  await flush();
  assert.equal(a.els.menu.querySelector("[role=menu]").children[0].text, "Account");
  const b = page({ answer: { ...ME, display: "" } });
  await flush();
  assert.equal(b.els.menu.querySelector("[data-menu]").children[1].text, "alex@example.com");
  const c = page({ answer: { ...ME, display: "", email: null } });
  await flush();
  assert.equal(c.els.menu.querySelector("[data-menu]").children[1].text, "Account");
});
