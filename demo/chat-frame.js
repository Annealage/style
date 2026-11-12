// Frames chatpage.html at ?w= (240 to 600) and passes the other query parameters on.
const q = new URLSearchParams(location.search);
const frame = document.querySelector(".cf-frame");
const width = Math.min(600, Math.max(240, Number(q.get("w")) || 320));
frame.setAttribute("width", String(width));
q.delete("w");
frame.src = "chatpage.html" + (q.toString() ? "?" + q.toString() : "");
