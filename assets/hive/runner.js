// Genesis · runner: what the Swarm makes, running. A result's fenced blocks become files; the one marked to run (or the
// best candidate) runs in a sandboxed frame: an HTML page as is, plain JavaScript in a blank page, Python through Pyodide.
// A shim in the frame hands console output and every error back, so the page can show it and ask the Swarm to fix it,
// and stands in for what a sandbox refuses (storage, service workers, cookies) so ordinary apps don't crash on load.
(() => {
"use strict";
const EXT = { html: "html", htm: "html", xml: "xml", svg: "svg", css: "css", js: "js", javascript: "js", mjs: "js", jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", json: "json", py: "py", python: "py", sh: "sh", bash: "sh", shell: "sh", sql: "sql", md: "md", markdown: "md", yaml: "yaml", yml: "yaml", toml: "toml", rs: "rs", rust: "rs", go: "go", java: "java", c: "c", cpp: "cpp", cs: "cs", rb: "rb", php: "php", swift: "swift", kt: "kt", txt: "txt", text: "txt", csv: "csv", ini: "ini", dockerfile: "Dockerfile" };
const DEF = { html: "index.html", css: "style.css", js: "script.js", py: "main.py", json: "data.json", svg: "image.svg", md: "README.md", sh: "run.sh", sql: "schema.sql" };
// ```lang [run] [file=name | title="name"]  — or a first line like "// file: app.js", "<!-- file: index.html -->", "# file: main.py"
function files(text) {
  const out = [], used = new Set(), re = /```([^\n`]*)\n([\s\S]*?)```/g; let m;
  while ((m = re.exec(String(text || "")))) {
    const info = m[1].trim(), lang0 = (info.split(/\s+/)[0] || "").toLowerCase(), ext = EXT[lang0] || (lang0.includes(".") ? lang0.split(".").pop() : lang0) || "txt";
    let code = m[2], name = (/(?:file|title|name)\s*=\s*"?([\w./-]+)"?/.exec(info) || [])[1];
    const head = /^\s*(?:\/\/|#|<!--|\/\*|--)\s*(?:file(?:name)?|path)\s*:\s*([\w./-]+)\s*(?:-->|\*\/)?\s*\n/i.exec(code);
    if (!name && head) { name = head[1]; code = code.slice(head[0].length); }
    if (!name && /^[\w-]+\.\w{1,5}$/.test(lang0)) name = lang0;
    if (!name) { const base = DEF[ext] || "file." + ext; name = base; for (let k = 2; used.has(name); k++) name = base.replace(/(\.\w+)?$/, "-" + k + "$1"); }
    if (used.has(name)) { const b = name; for (let k = 2; used.has(name); k++) name = b.replace(/(\.\w+)?$/, "-" + k + "$1"); }
    used.add(name); out.push({ name, lang: ext === "javascript" ? "js" : ext, code, run: /\brun\b/.test(info.split(/\s+/).slice(1).join(" ")) || /\brun\b/.test(lang0 === "run" ? "run" : "") });
  }
  return out;
}
// the one to run: marked "run", else a whole HTML page, else any HTML, else Python, else JavaScript that does something on
// its own (not a module of exports, Node or Worker code: in a page those run and show nothing). strict: only one marked to run
const LIBJS = /\bexport\s+(default|async|function|const|let|class|\{)|module\.exports|\brequire\(\s*["']|\bprocess\.(env|argv|exit)|addEventListener\(\s*["']fetch|\benv\.[A-Z_]{2,}|this\.(sql|ctx|env|state)\b|ctx\.storage|from\s+["'](node:|fs["']|path["']|http["']|express["'])/;
function entry(fs, strict) {
  const by = (f) => fs.find(f);
  return by((f) => f.run && /^(html|py|js)$/.test(f.lang)) || (strict ? null : by((f) => f.lang === "html" && /<!doctype|<html[\s>]/i.test(f.code)) || by((f) => f.lang === "html") || by((f) => f.lang === "py" && !/^\s*(from \w+ import|import \w+)?\s*$/.test(f.code)) || by((f) => f.lang === "js" && !LIBJS.test(f.code))) || null;
}
// local scripts and styles a page refers to by name are folded in, so a multi-file result runs from one document
function inline(html, fs) {
  const get = (n) => fs.find((f) => f.name === String(n).replace(/^\.\//, ""));
  return html.replace(/<script([^>]*)\bsrc=["']([^"':]+)["']([^>]*)><\/script>/gi, (all, a, src, b) => { const f = get(src); return f ? "<script" + a + b + ">\n" + f.code.replace(/<\/script/gi, "<\\/script") + "\n</script>" : all; })
    .replace(/<link([^>]*)\bhref=["']([^"':]+\.css)["']([^>]*)>/gi, (all, a, href) => { const f = get(href); return f && /stylesheet/i.test(all) ? "<style>\n" + f.code + "\n</style>" : all; });
}
const SHIM = (id) => "<script>(function(){var I=" + JSON.stringify(id) + ",send=function(t,a){try{parent.postMessage({__hiveRun:I,t:t,a:String(a).slice(0,4000)},'*')}catch(e){}};" +
  "var mem=function(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};" +
  "['localStorage','sessionStorage'].forEach(function(k){try{window[k].length}catch(e){try{Object.defineProperty(window,k,{value:mem(),configurable:true})}catch(x){}}});" +
  "try{navigator.serviceWorker}catch(e){try{Object.defineProperty(Navigator.prototype,'serviceWorker',{configurable:true,get:function(){return{register:function(){return Promise.reject(new Error('service workers do not run in the preview'))},getRegistration:function(){return Promise.resolve(undefined)},getRegistrations:function(){return Promise.resolve([])},addEventListener:function(){},controller:null,ready:new Promise(function(){})}}})}catch(x){}}" +
  "try{document.cookie}catch(e){try{Object.defineProperty(document,'cookie',{configurable:true,get:function(){return''},set:function(){}})}catch(x){}}" +
  "try{window.indexedDB&&window.indexedDB.open}catch(e){}" +
  "var fmt=function(x){try{return typeof x==='string'?x:x instanceof Error?(x.stack||x.message):typeof x==='undefined'?'undefined':JSON.stringify(x)}catch(e){return String(x)}};" +
  "['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){send(k,[].slice.call(arguments).map(fmt).join(' '));return o&&o.apply(console,arguments)}});" +
  "addEventListener('error',function(e){if(e.target&&e.target!==window&&(e.target.src||e.target.href)){send('error','could not load '+(e.target.src||e.target.href));return}send('exception',(e.message||'error')+(e.lineno?' (line '+e.lineno+(e.colno?':'+e.colno:'')+')':''))},true);" +
  "addEventListener('unhandledrejection',function(e){var r=e.reason;send('exception','Unhandled promise rejection: '+(r&&(r.stack||r.message)||r))});" +
  "window.__hiveShape=function(){try{var b=document.body,o=document.getElementById('hive-out');send('shape',JSON.stringify({text:b?(b.innerText||'').trim().length:0,els:b?b.getElementsByTagName('*').length:0,media:document.querySelectorAll('canvas,svg,img,video,iframe,object,embed').length,out:o?o.childNodes.length:-1,py:!!document.getElementById('hive-py')}))}catch(e){}};" +
  "addEventListener('load',function(){send('loaded','');if(!document.getElementById('hive-py'))setTimeout(window.__hiveShape,1500)})})();</script>";
function page(f, fs, id) {
  if (f.lang === "html") { let h = inline(f.code, fs); if (!/<html[\s>]|<!doctype/i.test(h)) h = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body>" + h + "</body></html>";
    return /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => m + SHIM(id)) : h.replace(/<html[^>]*>/i, (m) => m + "<head>" + SHIM(id) + "</head>"); }
  const look = "<style>html{color-scheme:dark light}body{margin:0;font:13px/1.55 ui-monospace,Menlo,Consolas,monospace;background:#0d0f12;color:#d8dde3;padding:14px}#hive-out{white-space:pre-wrap;word-break:break-word}.err{color:#ff7b72}.dim{color:#7d8590}img{max-width:100%;background:#fff;margin:8px 0}</style>";
  if (f.lang === "js") return "<!doctype html><html><head><meta charset='utf-8'>" + SHIM(id) + look + "</head><body><div class='dim'>JavaScript · output below and in the console</div><div id='hive-out'></div><script>(function(){var o=document.getElementById('hive-out');['log','info','warn','error'].forEach(function(k){var c=console[k];console[k]=function(){var d=document.createElement('div');if(k==='error')d.className='err';d.textContent=[].slice.call(arguments).map(function(x){return typeof x==='string'?x:JSON.stringify(x)}).join(' ');o.appendChild(d);return c.apply(console,arguments)}})})()</script><script type='module'>\n" + f.code.replace(/<\/script/gi, "<\\/script") + "\n</script></body></html>";
  // Python: Pyodide in the frame; packages it imports (numpy, pandas, matplotlib…) load on demand; matplotlib figures are shown as images
  const py = JSON.stringify(f.code), others = JSON.stringify(fs.filter((x) => x !== f && x.lang === "py").map((x) => [x.name, x.code]));
  return "<!doctype html><html><head><meta charset='utf-8'>" + SHIM(id) + look + "</head><body><div class='dim' id='st'>Python · loading (first run takes a few seconds)…</div><div id='hive-out'></div><i id='hive-py' hidden></i>" +
    "<script src='https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js'></script><script>(async function(){var o=document.getElementById('hive-out'),st=document.getElementById('st'),line=function(t,c){var d=document.createElement('div');if(c)d.className=c;d.textContent=t;o.appendChild(d)};" +
    "try{var py=await loadPyodide({stdout:function(s){line(s);console.log(s)},stderr:function(s){line(s,'err');console.warn(s)}});st.textContent='Python · running';" +
    "var files=" + others + ";files.forEach(function(f){try{py.FS.writeFile(f[0],f[1])}catch(e){}});var code=" + py + ";await py.loadPackagesFromImports(code);" +
    "py.runPython(\"import sys\\ntry:\\n import matplotlib\\n matplotlib.use('AGG')\\nexcept Exception: pass\");" +
    "var t0=performance.now();await py.runPythonAsync(code);" +
    "var img=py.runPython(\"import io,base64\\nres=''\\ntry:\\n import matplotlib.pyplot as plt\\n if plt.get_fignums():\\n  b=io.BytesIO(); plt.savefig(b, format='png', bbox_inches='tight'); res=base64.b64encode(b.getvalue()).decode()\\nexcept Exception: pass\\nres\");" +
    "if(img){var i=document.createElement('img');i.src='data:image/png;base64,'+img;o.appendChild(i)}st.textContent='Python · finished in '+Math.round(performance.now()-t0)+' ms';window.__hiveShape&&window.__hiveShape()}" +
    "catch(e){st.textContent='Python · stopped with an error';line(String(e.message||e),'err');console.error(String(e.message||e).split('\\n').slice(-3).join('\\n'))}})()</script></body></html>";
}
// run f in the frame; onEvent(kind, text) for console lines, errors and "loaded"
function run(frame, f, fs, onEvent) {
  const id = Math.random().toString(36).slice(2);
  if (frame._hiveListen) removeEventListener("message", frame._hiveListen);
  frame._hiveListen = (e) => { const d = e.data; if (d && d.__hiveRun === id && e.source === frame.contentWindow) onEvent(d.t, d.a); };
  addEventListener("message", frame._hiveListen);
  frame.srcdoc = page(f, fs || [f], id);
  return id;
}
const popout = (f, fs) => { const u = URL.createObjectURL(new Blob([page(f, fs, "popout")], { type: "text/html" })); open(u, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(u), 60000); };
// every file in one .zip (stored, no compression: small, and no library needed)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(list) {
  const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()) & 0xffff, tm = (d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1)) & 0xffff;
  for (const f of list) {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(h, name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    dir.push(c, name); off += 30 + name.length + data.length;
  }
  const size = dir.reduce((a, x) => a + (x.byteLength || x.length), 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, list.length, true); e.setUint16(10, list.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...dir, e], { type: "application/zip" });
}
window.HiveRun = { files, entry, inline, page, run, popout, zip, crc32 };
})();
