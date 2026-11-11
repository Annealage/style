// The ember reference page's switches: #rename shows the toast as an error and
// the persistent error line, #project shows an ok toast, the dialog and the
// settings window have neither; ?ember=0 removes ember's own two stylesheets
// to show the page as it reads once ember has none (demo.js sets the route).
const q = new URLSearchParams(location.search);
if (q.get("ember") === "0") for (const link of document.querySelectorAll("link[data-ember]")) link.remove();

const toast = document.getElementById("toast");
const err = document.getElementById("err");
const LONG = "Could not rename the project: the id rp2040_stepper_controller_revision_b is already used by another project in this workspace, and ids must be unique.";
function apply() {
  const route = document.body.dataset.route;
  toast.className = route === "project" ? "ok" : "err";
  toast.textContent = route === "project" ? "Restored to before turn 4" : route === "rename" ? "Could not rename the project." : "";
  err.textContent = route === "rename" ? LONG : "";
}
window.addEventListener("hashchange", apply);
apply();
