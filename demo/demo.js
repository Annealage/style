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
  for (const view of $$("section[data-view]")) view.hidden = view.dataset.view !== route;
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

  // Layout focus and the inspector.
  const lay = e.target.closest("[data-layout-set]");
  if (lay) {
    document.querySelector(".wb").dataset.layout = lay.dataset.layoutSet;
    for (const b of $$("[data-layout-set]")) b.setAttribute("aria-pressed", String(b === lay));
  }
  if (e.target.closest("#panelBtn, [data-panel-close]")) {
    const open = body.classList.toggle("panel-open");
    document.getElementById("panelBtn")?.setAttribute("aria-pressed", String(open));
  }
  // Inspector tabs: data-side switches #review and #timeline, aria-controls switches .ipane.
  const tab = e.target.closest(".ptabs button");
  if (tab?.dataset.side) {
    document.querySelector(".wb").dataset.side = tab.dataset.side;
    for (const b of $$(".ptabs button[data-side]")) b.setAttribute("aria-selected", String(b.dataset.side === tab.dataset.side));
  } else if (tab?.getAttribute("aria-controls")) {
    for (const b of $$("button", tab.parentElement)) {
      b.setAttribute("aria-selected", String(b === tab));
      document.getElementById(b.getAttribute("aria-controls")).hidden = b !== tab;
    }
  }
  // Timeline preview.
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

// ---- At 900px and below the agent layer's layout.js shows one pane at a time from
// #tabbar, hiding the others with an inline display:none. This stands in for it.
const tabbar = document.getElementById("tabbar");
const narrow = window.matchMedia("(max-width: 900px)");
function showPane(i) {
  const panes = [".view", ".inspector:not(#timeline)", "#chat, .console"].map((sel) => document.querySelector(sel));
  [...tabbar.children].forEach((b, n) => b.classList.toggle("on", n === i));
  panes.forEach((pane, n) => { if (pane) pane.style.display = narrow.matches && n !== i ? "none" : ""; });
}
if (tabbar) {
  tabbar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) showPane([...tabbar.children].indexOf(b)); });
  narrow.addEventListener("change", () => showPane(0));
  showPane(0);
}

// ---- States the query string can ask for.
const wb = document.querySelector(".wb");
if (wb && q.get("side") === "timeline") wb.dataset.side = "timeline";
if (wb && q.get("preview")) wb.dataset.preview = "";
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

// ---- For the screenshot script: fonts in, every image decoded.
const images = $$("img").map((img) => img.complete ? Promise.resolve() : new Promise((done) => {
  img.addEventListener("load", done, { once: true });
  img.addEventListener("error", done, { once: true });
}));
Promise.all([document.fonts.ready, ...images]).then(() => { pin(); requestAnimationFrame(() => { window.__shotReady = true; }); });
