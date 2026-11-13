// The reference pages' switches. The query string picks the product and the
// scheme (?product=loom|trace|canvas|mesh|pod|none, ?theme=light|dark), and the
// tabs, menus and toggles work as a product's would. Nothing here is part of
// the theme; a product writes its own.
const q = new URLSearchParams(location.search);
const root = document.documentElement;
const body = document.body;
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

// ---- Product: the temper, the mark and the name.
const PRODUCTS = {
  loom: { name: "Annealage Loom", mark: "loom-weave" },
  trace: { name: "Annealage Trace", mark: "trace-net" },
  canvas: { name: "Annealage Canvas", mark: "canvas-frame" },
  mesh: { name: "Annealage Mesh", mark: "mesh-layers" },
  pod: { name: "Annealage Pod", mark: "pod-slab" },
  none: { name: "Annealage", mark: "parent-ribbon-b123d" },
};
const asked = q.get("product");
const product = PRODUCTS[asked] ? asked : root.dataset.product || "none";
if (product === "none") delete root.dataset.product;
else root.dataset.product = product;
for (const el of $$("[data-prod]")) el.textContent = PRODUCTS[product].name;
for (const el of $$("[data-mark]")) el.src = `../marks/${PRODUCTS[product].mark}.svg`;
for (const el of $$("[data-mark-dark]")) el.srcset = `../marks/${PRODUCTS[product].mark}-dark.svg`;
for (const a of $$('a[href^="?product="]')) if (a.getAttribute("href") === `?product=${product}`) a.setAttribute("aria-current", "true");
// A page can hold one <template data-for-product="loom trace"> per product; the
// matching one replaces its placeholder, the rest are dropped.
for (const slot of $$("[data-product-slot]")) {
  const pick = $$("template", slot).find((t) => (t.dataset.forProduct || "").split(" ").includes(product))
    || slot.querySelector("template[data-default]");
  if (pick) slot.replaceWith(pick.content.cloneNode(true));
  else slot.remove();
}
// The account menu's product links: the page's own product is the current one.
for (const a of $$('.menu a[href*="?product="]')) if (a.getAttribute("href").endsWith(`?product=${product}`)) a.setAttribute("aria-current", "page");
// Canvas puts its file tree in the inspector column, at the left (data-insp, theme.css).
if (product === "canvas") document.querySelector(".wb")?.setAttribute("data-insp", "left");
// ?agent=viewer-only: a run with no agent, as ember draws it. The composer and the model
// field cannot act, each with its reason.
if (q.get("agent") === "viewer-only") {
  const why = "This server runs viewer-only, with no agent, so there is nothing to send a message to.";
  for (const el of $$("#chatInput, #chatAttachBtn, #chatSend, #chatModelInput, #chatInterrupt")) { el.disabled = true; el.title = why; }
  for (const el of $$("#agentStatus")) { el.dataset.state = "unavailable"; el.textContent = "Viewer only"; }
  // No agent, so no conversation, usage or approvals.
  for (const el of $$("#chatLog, #chatPending")) el.replaceChildren();
  for (const el of $$("#chat .chatusage, #chat .chathint, .statusbar .alert")) el.hidden = true;
  for (const el of $$("#chat")) el.dataset.pending = "0";
  for (const span of $$(".statusbar > span")) if (span.firstChild?.textContent.startsWith("Agent")) span.querySelector("b").textContent = "Viewer only";
}

// ---- Scheme: ?theme= forces one for this page without touching the stored choice.
const theme = q.get("theme");
if (theme === "light" || theme === "dark") {
  // A <source media> follows the OS, not data-theme, so pick the mark here, and
  // again once scheme.js has finished its own pass over the sources at
  // DOMContentLoaded (window listeners run after document ones).
  const force = () => {
    root.dataset.theme = theme;
    for (const s of $$("picture > source")) s.media = theme === "dark" ? "all" : "not all";
  };
  force();
  window.addEventListener("DOMContentLoaded", force);
}

// ---- Hash routes: <body data-routes="a b c" data-default="a">; sections carry data-view.
const routes = (body.dataset.routes || "").split(" ").filter(Boolean);
const FLOW = { // how far the guided setup has got at each step
  upload: ["3 files staged", "After upload", "After upload", "After upload"],
  inventory: ["3 files", "25 parts, 50 nets", "After inventory check", "After inventory check"],
  datasheets: ["3 files", "25 parts, 50 nets", "7 gaps", "Not started"],
  review: ["3 files", "25 parts, 50 nets", "7 gaps carried", "Not started"],
};
function applyRoute() {
  if (!routes.length) return;
  const hash = location.hash.slice(1);
  const route = routes.includes(hash) ? hash : body.dataset.default || routes[0];
  body.dataset.route = route;
  for (const view of $$("section[data-view], main[data-view]")) view.hidden = view.dataset.view !== route;
  for (const reg of $$(".reg[data-view]")) reg.dataset.view = route;
  for (const link of $$("[data-route-link]")) {
    const on = link.getAttribute("href") === `#${route}`;
    if (link.hasAttribute("aria-pressed")) link.setAttribute("aria-pressed", String(on));
    else if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (FLOW[route]) {
    const at = routes.indexOf(route);
    const reach = route === "datasheets" ? 3 : at; // Review opens once the inventory is checked
    $$(".flowstep").forEach((step, i) => {
      step.dataset.state = i < at ? "done" : i === at ? "current" : i > reach ? "locked" : "open";
      step.querySelector(".detail").textContent = FLOW[route][i];
      const a = step.querySelector("a");
      if (i > reach) a.setAttribute("aria-disabled", "true");
      else a.removeAttribute("aria-disabled");
    });
    const imported = route !== "upload";
    for (const el of $$("[data-imported]")) el.hidden = (el.dataset.imported === "yes") !== imported;
    for (const el of $$("[data-needs-import]")) el.disabled = !imported;
  }
}
window.addEventListener("hashchange", applyRoute);
applyRoute();

// ---- Menus: a [data-menu] button toggles data-open on its .menuwrap.
function closeMenus(except) {
  for (const wrap of $$(".menuwrap[data-open]")) {
    if (wrap === except || wrap.classList.contains("static")) continue;
    wrap.removeAttribute("data-open");
    wrap.querySelector("[data-menu]")?.setAttribute("aria-expanded", "false");
  }
}
// One menu is shown open on load where the page asks, so the menu is in the
// reference shots; ?menus=0 leaves them all closed.
for (const wrap of $$("[data-demo-open]")) {
  if (q.get("menus") === "0" || window.innerWidth <= 640) continue;
  if (wrap.dataset.demoOpen && wrap.dataset.demoOpen !== body.dataset.route) continue;
  wrap.setAttribute("data-open", "");
}

document.addEventListener("click", (e) => {
  if (e.target.closest('[aria-disabled="true"]')) e.preventDefault();

  const trigger = e.target.closest("[data-menu]");
  const wrap = trigger?.closest(".menuwrap");
  closeMenus(wrap);
  if (wrap) trigger.setAttribute("aria-expanded", String(wrap.toggleAttribute("data-open")));

  // Inspector tabs: aria-controls switches .ipane.
  const tab = e.target.closest(".ptabs button");
  if (tab?.getAttribute("aria-controls")) {
    for (const b of $$("button", tab.parentElement)) {
      b.setAttribute("aria-selected", String(b === tab));
      document.getElementById(b.getAttribute("aria-controls")).hidden = b !== tab;
    }
  }
  // Previewing an earlier state (.previewbar).
  const act = e.target.closest("[data-act]");
  if (act?.dataset.act === "preview") document.querySelector(".wb").dataset.preview = "";
  if (act?.dataset.act === "now") delete document.querySelector(".wb").dataset.preview;
  // A table row's expander.
  const exp = e.target.closest(".exp");
  if (exp) {
    const open = exp.getAttribute("aria-expanded") !== "true";
    exp.setAttribute("aria-expanded", String(open));
    const row = exp.closest(".dt-row");
    row.classList.toggle("is-open", open);
    if (row.nextElementSibling?.classList.contains("dt-detail")) row.nextElementSibling.hidden = !open;
  }
  // Two-way choices inside a .seg.
  const choice = e.target.closest(".seg > button[aria-checked]");
  if (choice) for (const b of choice.parentElement.children) b.setAttribute("aria-checked", String(b === choice));
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
document.addEventListener("change", (e) => {
  if (e.target.name === "stage") for (const out of $$("[data-stage-out]")) out.textContent = e.target.value;
});

// The frame (layout focus, Panel button, phone tab bar, column resizers) is
// ../frame.js, loaded by the page.

// ---- States the query string can ask for.
const wb = document.querySelector(".wb");
if (wb && q.get("preview")) wb.dataset.preview = "";
// ?cmd=none: a title bar without the command field (its right-hand controls stay at the right edge).
if (q.get("cmd") === "none") document.querySelector(".titlebar > .cmd")?.remove();
for (const box of $$("[data-indeterminate]")) box.indeterminate = true;
for (const s of $$(".swatch[data-c]")) s.style.background = s.dataset.c;

// ---- Overlays on a sheet are placed in sheet millimetres (210 x 148).
for (const el of $$("[data-x]")) {
  const { x, y, x2, y2 } = el.dataset;
  el.style.left = `${(x / 210) * 100}%`;
  el.style.top = `${(y / 148) * 100}%`;
  if (x2) el.style.width = `${((x2 - x) / 210) * 100}%`;
  if (y2) el.style.height = `${((y2 - y) / 148) * 100}%`;
}

const log = document.getElementById("chatLog");
const pin = () => { if (log && !body.classList.contains("spec")) log.scrollTop = log.scrollHeight; };
pin();

// ---- Command palette (../palette.js, loaded by the page). These are SAMPLE
// commands built from controls that exist on the page, so the reference shows
// the palette with real rows; a product registers its own. ?palette=1 opens it
// on load, and any other ?palette= value opens it with that as the query.
const palette = window.annealagePalette;
if (palette) {
  const visible = (btn) => btn.offsetParent !== null;
  const sample = [
    { id: "sample.scheme.system", title: "Follow the system colours", group: "View", keywords: ["theme", "scheme", "auto"], run: () => window.annealageScheme?.set("system") },
    { id: "sample.scheme.light", title: "Use light colours", group: "View", keywords: ["theme", "scheme"], run: () => window.annealageScheme?.set("light") },
    { id: "sample.scheme.dark", title: "Use dark colours", group: "View", keywords: ["theme", "scheme"], run: () => window.annealageScheme?.set("dark") },
  ];
  for (const btn of $$("[data-layout-set]")) {
    sample.push({
      id: `sample.layout.${btn.dataset.layoutSet}`, title: `Layout: ${btn.getAttribute("aria-label")}`, group: "View", keywords: ["focus", "pane"],
      enabled: () => visible(btn), disabledReason: "One pane at a time at this width", run: () => btn.click(),
    });
  }
  const panelBtn = document.getElementById("panelBtn");
  if (panelBtn) {
    sample.push({
      id: "sample.panel", title: `Toggle ${panelBtn.getAttribute("aria-label").toLowerCase()}`, group: "View", keywords: ["panel", "inspector"],
      enabled: () => visible(panelBtn), disabledReason: "Not shown at this width", run: () => panelBtn.click(),
    });
  }
  for (const route of routes) {
    sample.push({ id: `sample.go.${route}`, title: `Go to ${route[0].toUpperCase()}${route.slice(1)}`, group: "Go to", keywords: ["step"], run: () => { location.hash = route; } });
  }
  sample.push({ id: "sample.export", title: "Export report", group: "Actions", keywords: ["download", "pdf"], enabled: false, disabledReason: "Nothing reviewed yet", run: () => {} });
  palette.register(sample);
  const ask = q.get("palette");
  if (ask) palette.open({ query: ask === "1" ? "" : ask });
}

// ---- For the screenshot script: fonts in, every image decoded.
const images = $$("img").map((img) => img.complete ? Promise.resolve() : new Promise((done) => {
  img.addEventListener("load", done, { once: true });
  img.addEventListener("error", done, { once: true });
}));
Promise.all([document.fonts.ready, ...images]).then(() => { pin(); requestAnimationFrame(() => { window.__shotReady = true; }); });
