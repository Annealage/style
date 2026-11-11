// The states of the Canvas Studio drawing in workbench.html?product=canvas, from ?state=a,b (the
// template's comment lists them). Demo only, like overview-demo.js: the product's own script draws
// the real ones. demo.js owns the product switch, menus and the scheme; frame.js the frame.
import { confirmRow } from "../confirm.js";

const q = new URLSearchParams(location.search);
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

if (document.documentElement.dataset.product === "canvas" && $(".wb")) draw();

function draw() {
  const states = new Set((q.get("state") || "").split(",").map((s) => s.trim()).filter(Boolean));
  // A hosted view-only session is a review, so it is signed in and shows a capture.
  if (states.has("viewonly")) { states.add("hosted"); states.add("capture"); }
  const has = (s) => states.has(s);
  const on = (el, cond) => { if (el) el.hidden = !cond; };

  // ---- Pins and the rectangle are placed in device pixels (the screen is 480 x 320).
  for (const el of $$("[data-sx]")) {
    const { sx, sy, sw, sh } = el.dataset;
    el.style.left = `${(sx / 480) * 100}%`;
    el.style.top = `${(sy / 320) * 100}%`;
    if (sw) el.style.width = `${(sw / 480) * 100}%`;
    if (sh) el.style.height = `${(sh / 320) * 100}%`;
  }

  // ---- data-only="a b": drawn in those states; data-hide="a b": not drawn in them.
  for (const el of $$("[data-only]")) el.hidden = !el.dataset.only.split(" ").some(has);
  for (const el of $$("[data-hide]")) if (el.dataset.hide.split(" ").some(has)) el.hidden = true;

  const fileState = $("#fileState");
  const setFileState = (kind, text) => { fileState.dataset.kind = kind; fileState.textContent = text; };
  const disable = (el, why) => { el.setAttribute("aria-disabled", "true"); el.title = why; };

  // ---- The screen: a capture under review (pins, a rectangle, a comment field).
  if (has("capture")) {
    $("#screenHalf").dataset.preview = "";
    $("#liveTab").removeAttribute("aria-current");
    $("[data-capture]").setAttribute("aria-current", "page");
  }

  // ---- A hosted view-only session: nothing here changes the project.
  if (has("viewonly")) {
    on($("#roLine"), true);
    on($("#readOnlyNote"), true);
    $$(".dirty").forEach((d) => { d.hidden = true; });
    setFileState("", "Read-only");
    const why = "This project is view only";
    disable($("#pinTool"), why);
    disable($("#boxTool"), why);
    $("#pinTool").setAttribute("aria-pressed", "false");
    disable($("#pauseBtn"), "Pausing isn't available in a view-only session");
    // A capture writes a snapshot into the project; Export only reads it, so it stays enabled.
    disable($("#captureBtn"), why);
    // The tree's menu is read-only too: every item is shown, none can act.
    for (const item of $$("#ctxMenu [role=menuitem]")) disable(item, why);
  }

  // ---- Standalone Studio: no agent, no snapshots, no export.
  if (has("standalone")) {
    $("#chat").replaceWith($("#chatNone").content.cloneNode(true));
    const why = "Needs a managed project";
    disable($("#captureBtn"), why);
    disable($("#exportBtn"), why);
    disable($('[data-layout-set="agent"]'), why);
    disable($("#pauseBtn"), why);
  }

  // ---- The editor.
  if (has("merge")) {
    $("#editorHalf > ol.src").hidden = true;
    on($("#mergeView"), true);
    setFileState("gap", "Resolve the conflict to save");
  }
  if (has("deleted")) {
    on($("#msgDeleted"), true);
    setFileState("bad", "Deleted from the project");
  }
  if (has("saving")) {
    $$(".dirty").forEach((d) => d.classList.add("saving"));
    setFileState("busy", "Saving");
  }

  // ---- The run state in the title bar, and the status bar's last error.
  if (has("paused")) {
    const run = $("#runState");
    run.dataset.kind = "pending";
    run.textContent = "Paused";
    const pause = $("#pauseBtn");
    pause.setAttribute("aria-pressed", "true");
    pause.title = "Resume the agent";
    $("[data-label]", pause).textContent = "Resume agent";
  }
  if (has("error")) {
    const run = $("#runState");
    run.dataset.kind = "bad";
    run.textContent = "Error";
    on($("#lastError"), true);
    const harness = $("#harnessState");
    harness.classList.remove("ok");
    harness.textContent = "stopped";
  }

  // ---- The tree: a project with no files, loading, the context menu and its prompts.
  const row = (name) => $(`#fileTree [data-file="${name}"]`);
  const prompt = $("#treeInput");
  const name = $("#treeName");
  const hint = $(".hint", prompt);
  const ask = (label, value, placeholder, text) => {
    name.value = value;
    name.placeholder = placeholder;
    name.setAttribute("aria-label", label);
    hint.textContent = text;
    prompt.hidden = false;
  };
  if (has("rename")) {
    row("widgets.py").hidden = true;
    row("widgets.py").after(prompt);
    ask("New name", "widgets.py", "", "Enter renames, Escape cancels");
  }
  if (has("newfile")) {
    $("#fileTree details > ul").prepend(prompt);
    ask("New file name", "", "File name", "Enter creates it, Escape cancels");
  }
  if (has("newfolder")) {
    row("main.py").before(prompt);
    ask("New folder name", "", "Folder name", "Enter creates it, Escape cancels");
  }
  if (has("menu")) {
    const target = row("widgets.py");
    const box = target.getBoundingClientRect();
    const menu = $("#ctxMenu");
    menu.hidden = false;
    menu.style.left = `${box.left + 56}px`;
    menu.style.top = `${box.bottom - 4}px`;
    target.setAttribute("data-context", "");
  }
  if (has("empty") || has("loading")) {
    $("#fileTree").hidden = true;
    on($("#treeEmpty"), has("empty"));
    on($("#treeLoading"), has("loading"));
    $$("#editorHalf .vtab").forEach((t) => t.remove());
    on($("#msgChanged"), false);
    $("#editorHalf > ol.src").hidden = true;
    on($("#noFiles"), true);
    for (const el of $$("#editorHalf > .subtabs, #savedNote, #unsavedNote")) el.hidden = true;
  }

  // ---- Failures: the pane's own error line, the floating messages, the whole-window states.
  if (has("screenerror")) {
    on($("#screenError"), true);
    $(".demo-screen").hidden = true;
    $(".stage .hud").hidden = true;
  }
  if (has("toast")) {
    const toast = $("#toast");
    toast.className = "err";
    toast.textContent = "Couldn't rename widgets.py. theme.py already exists.";
  }
  if (has("pausefail")) $("#err").textContent = "Couldn't pause the agent. The harness answered with an error.";
  if (has("signoutfail")) { states.add("hosted"); $$("[data-only~=hosted]").forEach((el) => { el.hidden = false; }); $("#err").textContent = "Couldn't sign out. Try again."; }
  if (has("connecting") || has("bootfail")) {
    const conn = $("#statusConn");
    conn.dataset.state = has("connecting") ? "connecting" : "down";
    conn.textContent = has("connecting") ? "Connecting" : "Disconnected";
  }
  if (has("connecting")) {
    for (const el of $$(".inspector, .view, #chat")) el.hidden = true;
    on($("#connecting"), true);
  }
  if (has("bootfail")) {
    on($("#bootError"), true);
    const harness = $("#harnessState");
    harness.classList.remove("ok");
    harness.textContent = "stopped";
  }

  // ---- Confirmations (confirm.js), opened as a click on the button would.
  const open = (button) => {
    const opts = JSON.parse(button.dataset.confirm);
    opts.into = $(button.dataset.confirmInto);
    return confirmRow(button, opts);
  };
  if (has("forcedelete")) {
    const holder = $("#treeConfirm");
    $("#fileTree > li:nth-child(2)").after(holder);
    holder.hidden = false;
    open($("#ctxForce"));
  }
  if (has("delete")) {
    const target = row("widgets.py");
    const holder = $("#treeConfirm");
    target.after(holder);
    holder.hidden = false;
    open($("#ctxDelete"));
  }
  if (has("discard")) open($('[data-file="thermostat.py"] .x'));
}
