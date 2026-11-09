import { SeaEngine } from "./src";

// ?dolphins=5 sets the pod size; ?theme=light for white cells on blue lines (default is black).
const params = new URLSearchParams(location.search);
const q = params.get("dolphins");
const theme = params.get("theme") === "light" ? "light" : "dark";
document.body.dataset.theme = theme;
new SeaEngine(document.querySelector("canvas")!, {
  dolphins: q ? Math.max(0, Math.min(10, Number(q) || 0)) : undefined,
  theme,
});
