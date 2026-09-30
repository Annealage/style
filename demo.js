// The reference page's switches: the query string picks the product, the
// scheme and the state shown, and the side tabs and Preview work as a
// product's would. Nothing here is part of the theme.
const q = new URLSearchParams(location.search);
const root = document.documentElement;
const wb = document.querySelector(".wb");
const chat = document.getElementById("chat");

const PRODUCTS = {
  mesh: { name: "Annealage Mesh", mark: "mesh-layers" },
  loom: { name: "Annealage Loom", mark: "loom-weave" },
  trace: { name: "Annealage Trace", mark: "trace-net" },
};
const product = PRODUCTS[q.get("product")] ? q.get("product") : "mesh";
root.dataset.product = product;
document.querySelector("[data-prod]").textContent = PRODUCTS[product].name;
document.querySelector("[data-mark]").src = `marks/${PRODUCTS[product].mark}.svg`;
document.querySelector("[data-mark-dark]").srcset = `marks/${PRODUCTS[product].mark}-dark.svg`;

const theme = q.get("theme");
if (theme === "light" || theme === "dark") {
  root.dataset.theme = theme;
  // The <source media> follows the OS, not data-theme, so pick the mark here.
  document.querySelector("[data-mark-dark]").media = theme === "dark" ? "all" : "not all";
}

function setSide(side) {
  wb.dataset.side = side;
  document.querySelectorAll(".ptabs button").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.side === side));
  });
}
function setPreview(on) {
  if (on) wb.dataset.preview = "";
  else delete wb.dataset.preview;
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".ptabs button");
  if (tab) setSide(tab.dataset.side);
  const act = e.target.closest("[data-act]");
  if (act?.dataset.act === "preview") setPreview(true);
  if (act?.dataset.act === "now") setPreview(false);
  if (e.target.closest("#panelBtn")) {
    document.body.classList.toggle("panel-open");
    document.getElementById("panelBtn").classList.toggle("on");
  }
});

if (q.get("side") === "timeline") setSide("timeline");
if (q.get("preview")) setPreview(true);
if (q.get("working")) {
  chat.dataset.working = "";
  chat.dataset.turnStarted = String(Date.now() - 72000);
}
if (q.get("banner")) document.getElementById("chatBanner").hidden = false;
if (q.get("view") === "board") {
  document.querySelector(".view > .canvas").replaceWith(document.getElementById("boardCanvas").content.cloneNode(true));
  document.querySelectorAll(".swatch[data-c]").forEach((s) => { s.style.background = s.dataset.c; });
  document.querySelector("#review .iscroll").prepend(document.getElementById("boardSel").content.cloneNode(true));
  document.querySelector(".vtab code").textContent = "board";
}
