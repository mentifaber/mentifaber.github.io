/* Mentifaber system icons: one line glyph per system, drawn on a tile in the
   system's own hue. Used by the homepage and the "Related systems" strip. */
(function () {
  var ICONS = {
 "arsenal": "<path d=\"M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.1-.6-.6-2.1z\"/>",
 "ballast": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15\" rx=\"2.5\"/><path d=\"M3.5 9.5h17M8 3v4M16 3v4\"/><circle cx=\"12\" cy=\"14.8\" r=\"2.6\"/>",
 "vigil": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"4.5\"/><path d=\"M12 12l6-6\"/><circle cx=\"15.6\" cy=\"15.2\" r=\"1.1\" fill=\"currentColor\"/>",
 "orbit": "<ellipse cx=\"12\" cy=\"12\" rx=\"9.5\" ry=\"4\" transform=\"rotate(-25 12 12)\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\"/><circle cx=\"19.6\" cy=\"8.3\" r=\"1.4\" fill=\"currentColor\"/>",
 "cartograph": "<circle cx=\"12\" cy=\"12\" r=\"5\"/><path d=\"M2.8 16.3c1.6 1.6 7.4.4 12.4-3.1s7.4-7.6 6-8.4c-.8-.5-2.5-.1-4.4.8\"/><path d=\"M5 5.5h.01M19.5 19h.01M8 20h.01\"/>",
 "weaver": "<path d=\"M4 6c4 0 4 12 8 12s4-12 8-12\"/><path d=\"M4 18c4 0 4-12 8-12s4 12 8 12\"/><path d=\"M4 12h16\"/>",
 "pi": "<path d=\"M4 12h.5M7 9.5v5M10 6v12M13 8.5v7M16 10.5v3M19.5 12h.5\"/>",
 "muse": "<path d=\"M9 18V5.5l10-2V16\"/><circle cx=\"6.5\" cy=\"18\" r=\"2.5\"/><circle cx=\"16.5\" cy=\"16\" r=\"2.5\"/><path d=\"M9 9.5l10-2\"/>",
 "omnilogos": "<path d=\"M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5z\"/><path d=\"M12 6.5v13\"/>",
 "novarac": "<path d=\"M12 21V11M9 21h6\"/><circle cx=\"12\" cy=\"9\" r=\"1.6\"/><path d=\"M8.2 5.5a5.5 5.5 0 0 0 0 7M15.8 5.5a5.5 5.5 0 0 1 0 7M5.4 3a9.5 9.5 0 0 0 0 12M18.6 3a9.5 9.5 0 0 1 0 12\"/>",
 "meshnet": "<circle cx=\"5\" cy=\"7\" r=\"2\"/><circle cx=\"19\" cy=\"6\" r=\"2\"/><circle cx=\"12\" cy=\"13\" r=\"2.2\"/><circle cx=\"6\" cy=\"19\" r=\"2\"/><circle cx=\"18\" cy=\"18.5\" r=\"2\"/><path d=\"M6.6 8.4l3.8 3.2M17.4 7.3l-3.8 4.2M10.5 14.6l-3 3M13.7 14.5l2.9 2.7M7 6.9l10-.8\"/>",
 "proximity": "<circle cx=\"9\" cy=\"8\" r=\"2.6\"/><path d=\"M4 20c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5\"/><path d=\"M16.5 6.5a4 4 0 0 1 0 6M19.3 4a8 8 0 0 1 0 11\"/>",
 "watchyourgrass": "<path d=\"M3.5 20h17\"/><path d=\"M6 20c0-5 1-9 3-12M10.5 20c0-4 .5-7 2-10M14.5 20c0-6 2-10 5-13M18 20c-.3-3-1.5-5-3.5-6.5\"/>",
 "worm-eater": "<path d=\"M4 7.5V5h3M17 5h3v2.5M20 16.5V19h-3M7 19H4v-2.5\"/><path d=\"M7.5 8.5v7M10 8.5v7M13 8.5v7M15.5 8.5v7M17 8.5v7\"/>",
 "cryptovault": "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.5\"/><path d=\"M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5\"/>",
 "phone-mcp": "<rect x=\"6.5\" y=\"3\" width=\"11\" height=\"18\" rx=\"2.5\"/><path d=\"M10.5 18h3M10 7.5v2M14 7.5v2M9.3 9.5h5.4v1.2a2.7 2.7 0 0 1-5.4 0z\"/>",
 "crime-dashboard": "<path d=\"M12 3l7.5 3v5.5c0 4.8-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.7-7.5-9.5V6z\"/><path d=\"M9 12l2.2 2.2L15.5 10\"/>",
 "sonicveil": "<path d=\"M4 15v-2a8 8 0 0 1 16 0v2\"/><rect x=\"3.5\" y=\"14\" width=\"4\" height=\"6.5\" rx=\"1.6\"/><rect x=\"16.5\" y=\"14\" width=\"4\" height=\"6.5\" rx=\"1.6\"/>",
 "duely": "<path d=\"M18.5 12.5V7L15 3.5H6v17h6\"/><path d=\"M9 9h5M9 12.5h3\"/><circle cx=\"17\" cy=\"17.5\" r=\"3.5\"/><path d=\"M17 16v1.7l1.1.9\"/>",
 "tether": "<circle cx=\"6\" cy=\"5\" r=\"2\"/><path d=\"M6 7l9 10\"/><circle cx=\"16.5\" cy=\"18\" r=\"3\"/><path d=\"M3 21h18\"/>",
 "sideways": "<rect x=\"5\" y=\"8\" width=\"14\" height=\"8\" rx=\"2\" transform=\"rotate(-20 12 12)\"/><path d=\"M3 19c3-1 5-1 8 0M2 15c2-.6 3-.6 5 0\"/>",
 "rootcause": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6\"/><path d=\"M15 15l5.5 5.5\"/><path d=\"M7.5 10.5h1.5l1-2 1.5 4 1-2h1.5\"/>",
 "graveyard": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9.5\" ry=\"4\" transform=\"rotate(-25 12 12)\"/><rect x=\"18.6\" y=\"6.6\" width=\"2.8\" height=\"2.8\" rx=\".4\"/>",
 "flutterbloom": "<path d=\"M12 7.5v11\"/><path d=\"M12 9.5C9.2 4 3.8 4.3 4.1 8.6c.3 3 3.8 4.2 7.9 3.4M12 9.5c2.8-5.5 8.2-5.2 7.9-.9-.3 3-3.8 4.2-7.9 3.4\"/><path d=\"M12 12.5c-3.3.6-6.3 2.6-5.3 5.4.8 2.1 3.8 1.2 5.3-1.9M12 12.5c3.3.6 6.3 2.6 5.3 5.4-.8 2.1-3.8 1.2-5.3-1.9\"/><path d=\"M11.2 6 9.8 3.8M12.8 6l1.4-2.2\"/>",
 "verel": "<path d=\"M11 3c.6 4.5 2.5 6.4 7 7-4.5.6-6.4 2.5-7 7-.6-4.5-2.5-6.4-7-7 4.5-.6 6.4-2.5 7-7z\"/><path d=\"M18.5 15.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z\"/>",
 "conflict-atlas": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M3.5 12h17M12 3.5c2.5 2.5 3.5 5.3 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.3-3.5-8.5s1-6 3.5-8.5z\"/>",
 "neural-sim": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 9V4.5M12 4.5 10 3M12 4.5 14 3M9.4 13.5 5 16.5M5 16.5l-.5 2.4M5 16.5l-2.3-.3M14.6 13.5l4.4 3M19 16.5l.5 2.4M19 16.5l2.3-.3\"/>",
 "shop": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><circle cx=\"12\" cy=\"12\" r=\"6.5\"/><path d=\"M12 2.8v2.7M12 18.5v2.7M21.2 12h-2.7M5.5 12H2.8M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9M18.5 18.5l-1.9-1.9M7.4 7.4 5.5 5.5\"/>",
 "frames": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"1.5\"/><rect x=\"6.5\" y=\"7.5\" width=\"11\" height=\"9\" rx=\".5\"/><path d=\"M6.5 14.5l3-3 2.5 2.5 2-2 3.5 3.5\"/>",
 "sketches": "<path d=\"M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z\"/><path d=\"M13.5 7l3 3\"/>",
 "moon-compatibility": "<path d=\"M10 4a6.5 6.5 0 1 0 5 11.2A7 7 0 0 1 10 4z\"/><circle cx=\"17\" cy=\"8\" r=\"3.5\"/>",
 "monstrosity": "<rect x=\"4\" y=\"4\" width=\"16\" height=\"5\" rx=\"1.5\"/><rect x=\"4\" y=\"10\" width=\"16\" height=\"5\" rx=\"1.5\"/><rect x=\"4\" y=\"16\" width=\"16\" height=\"4.5\" rx=\"1.5\"/><path d=\"M7 6.5h.01M7 12.5h.01M7 18.2h.01M11 6.5h6M11 12.5h6\"/>",
 "bubble-editor": "<circle cx=\"15\" cy=\"9\" r=\"5.5\"/><path d=\"M14.1 7.4l1.4-1v5.3\"/><path d=\"M11 13 4 20M4 16.5V20h3.5\"/>",
 "sleep-compression": "<path d=\"M13.5 4a8.5 8.5 0 1 0 6.5 12.4A7 7 0 0 1 13.5 4z\"/><path d=\"M16 3.5h3.5L16 7.5h3.5\"/>",
 "doccrawler": "<path d=\"M17.5 10V8l-4.5-4.5H6.5v17h6\"/><path d=\"M13 3.5V8h4.5M9 9.5h2M9 13h3\"/><circle cx=\"16\" cy=\"15.5\" r=\"3.3\"/><path d=\"M18.4 17.9 21 20.5\"/>",
 "roku": "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M8.5 20h7M12 16.5V20M10.5 8.3v4.4l3.8-2.2z\"/>",
 "_": "<circle cx=\"12\" cy=\"12\" r=\"7\"/><path d=\"M12 8v8M8 12h8\"/>"
};
  var HUES = {"arsenal": 183, "ballast": 116, "vigil": 6, "cartograph": 228, "weaver": 6, "pi": 143, "muse": 281, "omnilogos": 58, "novarac": 196, "meshnet": 333, "proximity": 111, "watchyourgrass": 248, "worm-eater": 26, "cryptovault": 163, "phone-mcp": 301, "crime-dashboard": 78, "sonicveil": 216, "duely": 353, "flutterbloom": 330, "graveyard": 190, "rootcause": 0, "sideways": 28, "tether": 285, "verel": 268, "conflict-atlas": 46, "neural-sim": 183, "shop": 321, "frames": 98, "sketches": 236, "moon-compatibility": 255, "monstrosity": 28, "bubble-editor": 350, "roku": 252, "doccrawler": 52, "sleep-compression": 205, "orbit": 200};
  function key(k) { k = String(k || "").replace(/^.*\//, "").replace(/\.html.*$/, ""); return k === "#" || !k ? "orbit" : k; }
  window.MF_ICONS = ICONS;
  window.mfIcon = function (k, cls) {
    k = key(k);
    var h = HUES[k] != null ? HUES[k] : 40, p = ICONS[k] || ICONS._;
    return '<span class="mf-ico' + (cls ? " " + cls : "") + '" style="--h:' + h + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg></span>";
  };
})();
