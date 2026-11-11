// node --test tools/confirm.test.mjs
// confirm.js against a minimal fake DOM: outcomes, focus, one row at a time,
// anchor removal, placement and that text is never parsed as markup.
import test from "node:test";
import assert from "node:assert/strict";

class Node {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tag = tag;
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.className = "";
    this.textContent = "";
    this.id = "";
    this.listeners = {};
    const owner = this;
    this.classList = {
      list: () => owner.className.split(/\s+/).filter(Boolean),
      contains: (name) => owner.classList.list().includes(name),
      add: (name) => { if (!owner.classList.contains(name)) owner.className = [...owner.classList.list(), name].join(" "); },
      remove: (name) => { owner.className = owner.classList.list().filter((c) => c !== name).join(" "); },
    };
  }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument.documentElement; }
  get nextSibling() { const i = this.parentNode.children.indexOf(this); return this.parentNode.children[i + 1] || null; }
  appendChild(child) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, ref) {
    child.remove();
    child.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : this.children.length;
    this.children.splice(i, 0, child);
    return child;
  }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  removeAttribute(name) { this.attrs.delete(name); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  dispatch(type, event = {}) { for (const fn of [...(this.listeners[type] || [])]) fn({ preventDefault() {}, ...event }); }
  click() { this.dispatch("click"); }
  focus() { this.ownerDocument.activeElement = this; }
  closest(selector) {
    const cls = selector.slice(1);
    for (let n = this; n; n = n.parentNode) if (n.classList.contains(cls)) return n;
    return null;
  }
  find(cls) {
    for (const c of this.children) {
      if (c.classList.contains(cls)) return c;
      const found = c.find(cls);
      if (found) return found;
    }
    return null;
  }
}

class Doc extends Node {
  constructor() {
    super(null, "#document");
    this.ownerDocument = this;
    this.documentElement = new Node(this, "html");
    this.documentElement.parentNode = null;
    this.body = this.documentElement.appendChild(new Node(this, "body"));
    this.activeElement = null;
  }
  createElement(tag) { return new Node(this, tag); }
}

class FakeObserver {
  static all = [];
  constructor(fn) { this.fn = fn; this.live = false; FakeObserver.all.push(this); }
  observe() { this.live = true; }
  disconnect() { this.live = false; }
}
globalThis.MutationObserver = FakeObserver;

const { confirmRow } = await import("../confirm.js");

function page() {
  FakeObserver.all = [];
  const doc = new Doc();
  const anchor = doc.body.appendChild(doc.createElement("button"));
  anchor.disabled = false;
  return { doc, anchor };
}
const opts = { title: "Delete 3 pins", action: "Delete", danger: true };

test("resolves true on the action", async () => {
  const { doc, anchor } = page();
  const result = confirmRow(anchor, opts);
  const row = doc.body.find("confirm");
  row.find("cacts").children[1].click();
  assert.equal(await result, true);
  assert.equal(doc.body.find("confirm"), null);
});

test("resolves false on Cancel and returns focus to the opener", async () => {
  const { doc, anchor } = page();
  const result = confirmRow(anchor, opts);
  assert.equal(anchor.disabled, true);
  doc.body.find("cacts").children[0].click();
  assert.equal(await result, false);
  assert.equal(anchor.disabled, false);
  assert.equal(doc.activeElement, anchor);
});

test("resolves false on Escape", async () => {
  const { doc, anchor } = page();
  const result = confirmRow(anchor, opts);
  doc.dispatch("keydown", { key: "Enter" });
  doc.dispatch("keydown", { key: "Escape" });
  assert.equal(await result, false);
  assert.equal(doc.activeElement, anchor);
});

test("a second open resolves the first as false", async () => {
  const { doc, anchor } = page();
  const other = doc.body.appendChild(doc.createElement("button"));
  other.disabled = false;
  const first = confirmRow(anchor, opts);
  const second = confirmRow(other, { title: "Start review", action: "Start" });
  assert.equal(await first, false);
  assert.equal(anchor.disabled, false);
  doc.body.find("cacts").children[1].click();
  assert.equal(await second, true);
});

test("resolves false when the anchor leaves the page", async () => {
  const { doc, anchor } = page();
  const result = confirmRow(anchor, opts);
  anchor.remove();
  FakeObserver.all.find((o) => o.live).fn();
  assert.equal(await result, false);
  assert.equal(doc.body.find("confirm"), null);
});

test("focus starts on Cancel for a destructive action and on the action for a spend", () => {
  let { doc, anchor } = page();
  confirmRow(anchor, opts);
  const danger = doc.body.find("cacts");
  assert.equal(doc.activeElement, danger.children[0]);
  assert.equal(doc.body.find("confirm").getAttribute("data-kind"), "danger");
  assert.equal(danger.children[1].className, "btn danger");
  ({ doc, anchor } = page());
  confirmRow(anchor, { title: "Start review", action: "Start", fields: [["Model", "m"]] });
  const spend = doc.body.find("cacts");
  assert.equal(doc.activeElement, spend.children[1]);
  assert.equal(spend.children[1].className, "btn primary");
  assert.equal(doc.body.find("fl").children.length, 2);
});

test("text is set literally, never as markup", () => {
  const { doc, anchor } = page();
  confirmRow(anchor, { title: "Delete <b>3</b> pins", detail: "<img src=x>", action: "<i>Go</i>", fields: [["<u>k</u>", "<s>v</s>"]] });
  const row = doc.body.find("confirm");
  assert.equal(row.find("ch").textContent, "Delete <b>3</b> pins");
  assert.equal(row.find("cd").textContent, "<img src=x>");
  assert.equal(row.find("cacts").children[1].textContent, "<i>Go</i>");
  assert.equal(row.find("fl").children[1].textContent, "<s>v</s>");
  for (const node of [row, ...row.children]) assert.equal(node.children.every((c) => !c.tag.startsWith("<")), true);
});

test("is a labelled polite group and a long detail goes behind a disclosure", () => {
  const { doc, anchor } = page();
  confirmRow(anchor, { ...opts, detail: "x".repeat(300) });
  const row = doc.body.find("confirm");
  assert.equal(row.getAttribute("role"), "group");
  assert.equal(row.getAttribute("aria-live"), "polite");
  assert.equal(row.getAttribute("aria-labelledby"), row.find("ch").id);
  assert.equal(row.find("cd"), null);
  assert.ok(row.find("disc"));
});

test("opens in a .dt-detail under a table row and cleans up", async () => {
  const doc = new Doc();
  const table = doc.body.appendChild(doc.createElement("div"));
  const dtRow = table.appendChild(doc.createElement("div"));
  dtRow.className = "dt-row";
  const anchor = dtRow.appendChild(doc.createElement("button"));
  anchor.disabled = false;
  const result = confirmRow(anchor, opts);
  const detail = dtRow.nextSibling;
  assert.equal(detail.className, "dt-detail");
  assert.ok(dtRow.classList.contains("is-open"));
  detail.find("cacts").children[0].click();
  await result;
  assert.equal(table.children.length, 1);
  assert.equal(dtRow.classList.contains("is-open"), false);
});

test("opens into a given element", async () => {
  const { doc, anchor } = page();
  const panel = doc.body.appendChild(doc.createElement("aside"));
  const result = confirmRow(anchor, { ...opts, into: panel });
  assert.equal(panel.children[0].className, "confirm");
  panel.find("cacts").children[0].click();
  await result;
  assert.equal(panel.children.length, 0);
});
