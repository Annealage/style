// The reference pages' use of confirm.js. A button with data-confirm (JSON for
// confirmRow's options) opens its row when clicked; ?confirm=1 opens the first
// visible one on load so the state can be shot. data-confirm-into names a
// selector to open the row in, data-confirm-closest an ancestor to open it in.
import { confirmRow } from "../confirm.js";

const q = new URLSearchParams(location.search);
const buttons = [...document.querySelectorAll("[data-confirm]")];

function open(button) {
  const opts = JSON.parse(button.dataset.confirm);
  if (button.dataset.confirmInto) opts.into = document.querySelector(button.dataset.confirmInto);
  else if (button.dataset.confirmClosest) opts.into = button.closest(button.dataset.confirmClosest);
  return confirmRow(button, opts);
}

for (const button of buttons) button.addEventListener("click", (event) => { event.preventDefault(); open(button); });
if (q.get("confirm") === "1") {
  const first = buttons.find((b) => b.offsetParent !== null);
  if (first) open(first);
}
