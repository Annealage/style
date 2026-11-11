// The states of overview.html, from ?state=a,b (the page's comment lists them). Demo only, like
// confirm-demo.js: the hosted product's own script draws the real ones. demo.js owns routes,
// menus and the scheme.
const q = new URLSearchParams(location.search);
const states = new Set((q.get("state") || "").split(",").map((s) => s.trim()).filter(Boolean));
const has = (s) => states.has(s);
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
const route = document.body.dataset.route;
const SEND_WHY = "Sending needs an editor or owner role";

// ---- A viewer: Send to is disabled with its reason, once on each page; Cancel send likewise.
if (has("viewer")) {
  $("[data-role]").textContent = "Viewer";
  for (const id of ["send-note", "tree-send-note", "cancel-note"]) $(`#${id}`).hidden = false;
  for (const b of $$("[data-send]")) if (!b.disabled) { b.disabled = true; b.title = SEND_WHY; }
  const cancel = $("#cancel-send");
  cancel.disabled = true;
  cancel.title = "Only an editor or owner can cancel a send";
}

// ---- The project list.
const rows = () => $$("#projects > .dt-row");
const detailOf = (row) => (row.nextElementSibling?.matches("[data-lineage]") ? row.nextElementSibling : null);
function collapse(row) {
  row.querySelector(".exp")?.setAttribute("aria-expanded", "false");
  row.classList.remove("is-open");
  const d = detailOf(row);
  if (d) d.hidden = true;
}
if (["send", "after-send", "existing", "viewer", "filtered", "many", "empty", "history"].some(has)) collapse(rows()[0]);

function filterTo(product) {
  for (const row of rows()) {
    const show = !product || row.dataset.product === product;
    row.hidden = !show;
    const d = detailOf(row);
    if (d && !show) d.hidden = true;
  }
  for (const chip of $$(".chips .chip")) {
    if ((chip.dataset.filter || "") === (product || "")) chip.setAttribute("aria-current", "true");
    else chip.removeAttribute("aria-current");
  }
}
for (const chip of $$(".chips .chip")) chip.addEventListener("click", (e) => { e.preventDefault(); filterTo(chip.dataset.filter || ""); });
if (has("filtered")) filterTo("loom");

if (has("many")) { // 44 projects, one with a long name, to see the table at the size the ticket asks for
  const list = $("#projects");
  const source = rows().slice(1, 11);
  for (let n = 2; n <= 4; n++) {
    for (const row of source) {
      const copy = row.cloneNode(true);
      copy.removeAttribute("data-project");
      for (const wrap of $$("[data-demo-open]", copy)) wrap.removeAttribute("data-demo-open");
      const exp = $(".exp", copy);
      if (exp) { const gap = document.createElement("span"); gap.className = "exp-none"; gap.setAttribute("aria-hidden", "true"); exp.replaceWith(gap); }
      const name = $(".dt-main", copy);
      name.textContent = `${name.textContent} ${n}`;
      list.append(copy);
    }
  }
  const long = rows()[1].cloneNode(true);
  $(".dt-main", long).textContent = "Dual stepper driver with the carrier board for the fixture, revision B, after the review";
  rows()[1].after(long);
  $("[data-project-count]").textContent = String(rows().length);
  for (const chip of $$(".chips .chip")) {
    $(".n", chip).textContent = String(chip.dataset.filter ? rows().filter((r) => r.dataset.product === chip.dataset.filter).length : rows().length);
  }
}

if (has("empty")) {
  $("#projects").hidden = true;
  $(".chips").hidden = true;
  $("#h-sent").hidden = true;
  $("#sends").hidden = true;
  $("#no-projects").hidden = false;
  $("[data-project-count]").textContent = "0";
  $("[data-unread-total]").textContent = "0";
}

if (has("history")) requestAnimationFrame(() => $("#h-sent").scrollIntoView({ block: "start" }));

// ---- Sent to other products: every state reads "Checking" until the first answer arrives.
const CHECKING = ["pending", "Checking"];
function setState(el, [kind, label]) {
  if (kind) el.dataset.kind = kind; else el.removeAttribute("data-kind");
  el.textContent = label;
}
if (has("checking")) for (const el of $$("#sends .state")) setState(el, CHECKING);

// ---- The send form, opened in place under the row (or under the title row on the tree page).
const form = $("#send-form");
const product = $("#send-product");
const target = $("#send-target");
const hint = $("#send-target-hint");
const radios = $$('input[name="dest"]', form);
const dest = () => radios.find((r) => r.checked)?.value ?? "new";
let current = { product: "loom" };

function refreshTargets() {
  const usable = $$("option", target).filter((o) => o.dataset.product === product.value);
  for (const o of $$("option", target)) { o.hidden = !usable.includes(o); o.disabled = !usable.includes(o); }
  radios[1].disabled = usable.length === 0;
  if (usable.length === 0 && radios[1].checked) radios[0].checked = true;
  if (usable.length && !usable.includes(target.selectedOptions[0])) target.value = usable[0].value;
  target.disabled = dest() !== "existing";
  target.title = target.disabled ? "Choose Existing project to pick one" : "";
  hint.textContent = usable.length === 0 ? "You have no other project of this product to send into." : "";
}
function closeSend() {
  const holder = form.parentElement;
  form.hidden = true;
  $("main[data-view=overview]").append(form);
  if (holder.classList.contains("send")) {
    const row = holder.previousElementSibling?.matches("[data-lineage]") ? holder.previousElementSibling.previousElementSibling : holder.previousElementSibling;
    holder.remove();
    if (row && row.querySelector(".exp")?.getAttribute("aria-expanded") !== "true") row.classList.remove("is-open");
  }
}
function openSend(button) {
  closeSend();
  current = { product: button.dataset.product };
  $("#send-source-name").textContent = button.dataset.name;
  $("#send-source-rev").textContent = `latest revision, changed ${button.dataset.changed}`;
  product.value = current.product === "trace" ? "loom" : "trace";
  $("#send-error").hidden = true;
  $("#send-result").hidden = true;
  $("#send-submit").disabled = false;
  $("#send-submit").removeAttribute("title");
  const row = button.closest(".dt-row");
  if (row) {
    const holder = document.createElement("div");
    holder.className = "dt-detail send";
    holder.append(form);
    (detailOf(row) ?? row).after(holder);
    row.classList.add("is-open");
  } else {
    const main = button.closest("main");
    main.insertBefore(form, $(".compare", main));
  }
  form.hidden = false;
  radios[0].checked = true;
  refreshTargets();
  product.focus({ preventScroll: true });
}
product.addEventListener("change", refreshTargets);
for (const r of radios) r.addEventListener("change", refreshTargets);
$("[data-close]", form).addEventListener("click", closeSend);
form.addEventListener("submit", (e) => {
  e.preventDefault();
  $("#send-submit").disabled = true;
  $("#send-submit").title = "This send is already queued";
  $("#send-result").hidden = false;
});
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-send]");
  if (button && !button.disabled) openSend(button);
});

if (has("send") || has("after-send") || has("existing")) {
  const button = route === "tree" ? $("#tree-send") : $('[data-project="3"] [data-send]');
  openSend(button);
  if (has("options")) $("#send-options").open = true;
  if (has("existing")) {
    radios[0].disabled = true;
    radios[0].title = "You can't start a new project in this workspace";
    radios[0].closest("label").title = radios[0].title;
    product.value = "trace";
    radios[1].checked = true;
    refreshTargets();
  }
  if (has("after-send")) form.requestSubmit();
  if (has("error")) {
    if (has("existing")) target.selectedIndex = -1;
    $("#send-error").textContent = "Choose a project to send into.";
    $("#send-error").hidden = false;
  }
} else if (has("options")) $("#send-options").open = true;

// ---- The file tree.
if (has("compare")) {
  $(".treepanes").dataset.count = "2";
  $('[data-pane="compare"]').hidden = false;
} else {
  $("#compare").value = "";
}
if (has("revisions")) $("#revisions").open = true;
if (has("pane2")) requestAnimationFrame(() => $('[data-pane="compare"]').scrollIntoView({ block: "start" }));
function swapPane(name, title) {
  $('[data-pane="main"]').hidden = true;
  $(`[data-pane="${name}"]`).hidden = false;
  $(".crumbs [data-tree-name]").textContent = title;
}
if (has("truncated")) swapPane("truncated", "Thermal camera mount");
if (has("norev")) {
  swapPane("norev", "Rack panel");
  $("#revisions").closest(".discs").hidden = true;
  const send = $("#tree-send");
  send.disabled = true;
  send.title = "This project has no revision to send yet";
  for (const b of [...$$("[data-tree-toggle]"), $("#compare-show")]) {
    b.disabled = true;
    b.title = "This project has no revision yet";
  }
}
// Show compares, so it waits for a project.
const compare = $("#compare");
const show = $("#compare-show");
if (!has("norev")) {
  const sync = () => { show.disabled = !compare.value; show.title = compare.value ? "" : "Choose a project to compare with"; };
  compare.addEventListener("change", sync);
  sync();
}
for (const b of $$("[data-tree-toggle]")) b.addEventListener("click", () => {
  for (const d of $$(".tree details")) d.open = b.dataset.treeToggle === "open";
});

// ---- Send status.
const STATUS = {
  queued: ["pending", "Queued"], sending: ["busy", "Sending"], finishing: ["busy", "Finishing"],
  sent: ["good", "Sent"], failed: ["bad", "Failed"], cancelled: [null, "Cancelled"], checking: CHECKING,
};
const picked = Object.keys(STATUS).find(has) ?? "sending";
setState($('[data-field="state"]'), STATUS[picked]);
const terminal = ["sent", "failed", "cancelled"].includes(picked);
$("main[data-view=status]").dataset.state = picked;
$("#cancel-send").hidden = terminal;
if (picked === "checking") {
  $("#cancel-send").disabled = true;
  $("#cancel-send").title = "Checking the state of this send";
}
if (has("details")) $("#st-details").open = true;
if (has("error")) $("#derivation-error").hidden = false;
if (has("unreadable")) {
  const source = $("#st-source");
  source.textContent = "Unavailable project";
  source.title = "You can no longer open the source project";
}
