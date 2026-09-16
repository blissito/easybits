// Picker de elementos para la vista previa del creador de sitios (/dash/sitios).
// Se inyecta en /s/<slug>/?eb_edit=1. Resalta al pasar el mouse el ancestro más
// cercano con data-eb-id; al hacer clic lo selecciona y avisa al padre por
// postMessage {type:"eb-selected", id, tag}. Un solo seleccionado; Escape lo quita.
// Port mínimo de dyad/worker/dyad-component-selector-client.js (Apache-2).
(function () {
  if (window.top === window) return; // solo dentro del iframe del editor
  var COLOR = "#7c3aed";
  var selected = null;
  var hover = mk("2px dashed " + COLOR, "rgba(124,58,237,.06)");
  var sel = mk("2px solid " + COLOR, "rgba(124,58,237,.10)");
  var label = document.createElement("div");
  css(label, { position: "absolute", top: "-22px", left: "-2px", padding: "2px 6px", font: "11px/1.4 ui-monospace,monospace", color: "#fff", background: COLOR, borderRadius: "4px", whiteSpace: "nowrap" });
  sel.appendChild(label);

  function mk(border, bg) {
    var d = document.createElement("div");
    css(d, { position: "absolute", pointerEvents: "none", zIndex: "2147483646", display: "none", border: border, background: bg, boxSizing: "border-box" });
    document.documentElement.appendChild(d);
    return d;
  }
  function css(el, s) { for (var k in s) el.style[k] = s[k]; }
  function target(e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-eb-id]") : null;
    return el;
  }
  function place(box, el) {
    var r = el.getBoundingClientRect();
    css(box, { top: r.top + window.scrollY + "px", left: r.left + window.scrollX + "px", width: r.width + "px", height: r.height + "px", display: "block" });
  }
  function reposition() {
    if (selected) place(sel, selected);
  }
  document.addEventListener("mousemove", function (e) {
    var el = target(e);
    if (!el || el === selected) { hover.style.display = "none"; return; }
    place(hover, el);
  }, true);
  document.addEventListener("mouseleave", function () { hover.style.display = "none"; }, true);
  document.addEventListener("click", function (e) {
    var el = target(e);
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    selected = el;
    hover.style.display = "none";
    place(sel, el);
    label.textContent = "<" + el.tagName.toLowerCase() + "> " + el.getAttribute("data-eb-id");
    window.parent.postMessage({ type: "eb-selected", id: el.getAttribute("data-eb-id"), tag: el.tagName.toLowerCase() }, "*");
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    selected = null; sel.style.display = "none";
    window.parent.postMessage({ type: "eb-deselected" }, "*");
  });
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "eb-deselect") { selected = null; sel.style.display = "none"; }
  });
})();
