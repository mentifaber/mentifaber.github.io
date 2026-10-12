/* The Monstrosity · the console. The homelab from build log 001, opened up: the stack as layers you can click, a request
   traced hop by hop, a troubleshooter that obeys the log's one rule (isolate the layer before you debug it, bottom up,
   never guessing across layers), the ignition checklist, and a starter compose file in the same shape. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

// ── the stack, top to bottom ──
const LAYERS = [
  ["outside", "Outside", "where requests start"], ["tunnel", "Tunnel", "the only door"], ["proxy", "Proxy", "routes by name"],
  ["containers", "Containers", "one service each"], ["share", "Share", "one namespace"], ["drives", "Drives", "and the wire between them"],
];
const N = {
  away: { l: "outside", t: "You, away", s: "phone on mobile data", what: "Anything outside the house. It only ever reaches the services you chose to route through the tunnel, and only by name.", logs: null },
  home: { l: "outside", t: "You, at home", s: "on the LAN", what: "Inside the house, names like weaver.lan resolve straight to fedora-01. These requests never touch Cloudflare.", logs: null },
  cf: { l: "tunnel", t: "Cloudflare edge", s: "TLS ends here", what: "Public DNS points at Cloudflare, not at the house. TLS terminates at the edge, which looks up which tunnel serves the hostname and sends the request down it.", health: "Zero Trust → Networks → Tunnels: the tunnel should read Healthy.", fails: "Error 1033: the tunnel isn't connected. Error 502: the tunnel is up but the service it maps to isn't reachable.", trade: "Cloudflare sits in the middle of this traffic. The log calls it a convenience worth revisiting." },
  fw: { l: "tunnel", t: "Home firewall", s: "0 inbound ports", wall: true, what: "Nothing is forwarded in. The tunnel works because cloudflared dials out; the firewall never opens a door.", health: "Your router's port-forwarding page should be empty.", logs: "sudo firewall-cmd --list-all" },
  cfd: { l: "tunnel", t: "cloudflared", s: "on fedora-01, dials out", what: "Holds four outbound connections to the edge and hands each request to http://traefik:80 on the proxy network.", logs: "docker logs --tail 50 cloudflared", health: "Look for “Registered tunnel connection” in the log, four times.", fails: "Tunnels drop quietly on network blips. A restart reconnects: docker restart cloudflared." },
  dns: { l: "proxy", t: "Local DNS", s: "*.lan → fedora-01", what: "Router DNS or hosts entries send internal names to the master node, so internal services are never exposed further than they need to be.", health: "getent hosts weaver.lan", fails: "A name that resolves elsewhere (or not at all) looks like a dead service. Check the name before the service." },
  traefik: { l: "proxy", t: "Traefik", s: "routes by Host, from labels", what: "Watches the Docker socket. A container appears with traefik.enable=true and a Host rule, and Traefik routes it, with no proxy file to edit, ever.", logs: "docker logs --tail 100 traefik", health: "curl -sI -H 'Host: cloud.example.com' http://127.0.0.1", fails: "Labels fail silently. A 404 from Traefik means no router matched the name you used." },
  nc: { l: "containers", t: "NextCloud", s: "the first tenant", what: "Files, calendar, contacts. Its data is a bind mount on the pool, so the container can die and be recreated without losing anything.", logs: "docker logs --tail 100 nextcloud", health: "docker compose ps nextcloud" },
  weaver: { l: "containers", t: "Weaver UI", s: "LAN only", what: "Whatever Weaver exposes as a web UI, routed by Traefik on the LAN and never put in the tunnel.", logs: "docker logs --tail 100 weaver" },
  muse: { l: "containers", t: "muse UI", s: "LAN only", what: "The same, for muse. Each service sits in its own container: start, stop or kill one without touching the rest.", logs: "docker logs --tail 100 muse" },
  smb: { l: "share", t: "Samba", s: "on fedora-01", what: "Pulls the scattered drives into one shared namespace that the other two boxes mount over the private line.", logs: "journalctl -u smb -n 50 --no-pager", health: "testparm -s && smbclient -L //fedora-01 -U youruser", fails: "On Fedora, SELinux is the usual surprise: paths need the samba_share_t label, or samba_export_all_rw switched on." },
  pool: { l: "share", t: "/srv/pool", s: "the mount tenants use", what: "Where the shared storage is mounted on the master. Every tenant's data lives under it as a bind mount.", health: "findmnt /srv/pool", fails: "Mount by label or UUID, never /dev/sdX: device names shift on reboot." },
  f01: { l: "drives", t: "fedora-01", s: "master node", what: "The anchor: Samba, Docker, Traefik and cloudflared all run here.", logs: "journalctl -k -b | grep -iE 'ata[0-9]+|usb|reset|I/O error'" },
  b2: { l: "drives", t: "box 2", s: "drives", what: "Its drives join the namespace; it reaches the master over the switch, never the internet." },
  b3: { l: "drives", t: "box 3", s: "drives", what: "The same. Three machines, one private segment." },
  sw: { l: "drives", t: "Gigabit switch", s: "one private line", what: "All three machines share one segment, so machine-to-machine traffic never touches the open internet. Static leases keep addresses from drifting on reboot.", health: "ethtool <iface> | grep Speed   (expect 1000Mb/s)" },
  disks: { l: "drives", t: "10 drives · 3 SSDs", s: "labels: an open thread", what: "Scattered across the three boxes. The naming scheme is decided before anything mounts, and that is still the open thread in the log.", health: "lsblk -f && sudo smartctl -H /dev/sdX", fails: "A drive that goes dark is usually power or cable before it's ever the filesystem." },
};
const BAND = { outside: ["away", "home"], tunnel: ["cf", "fw", "cfd"], proxy: ["dns", "traefik"], containers: ["nc", "weaver", "muse"], share: ["smb", "pool"], drives: ["f01", "sw", "b2", "b3", "disks"] };
function drawStack(el, onPick) {
  el.innerHTML = LAYERS.map(([k, t, s], i) => (i ? '<div class="arrow" aria-hidden="true">▲ ▼</div>' : "") + '<div class="band" data-l="' + k + '"><span class="bl">' + t + "<small>" + s + '</small></span><div class="nodes">' + BAND[k].map((id) => '<button class="n' + (N[id].wall ? " wall" : "") + '" data-n="' + id + '"><b>' + esc(N[id].t) + "</b><small>" + esc(N[id].s) + "</small></button>").join("") + "</div></div>").join("");
  el.addEventListener("click", (e) => { const b = e.target.closest("[data-n]"); if (b && onPick) onPick(b.dataset.n); });
}
function info(id) {
  const n = N[id]; document.querySelectorAll("#stack .n").forEach((b) => b.classList.toggle("sel", b.dataset.n === id));
  $("info").innerHTML = '<span class="layer">' + esc(LAYERS.find((l) => l[0] === n.l)[1]) + " layer</span><h2>" + esc(n.t) + "</h2><p>" + esc(n.what) + "</p>" +
    (n.logs ? '<span class="layer">its logs</span><code class="cmd">' + esc(n.logs) + "</code>" : "") + (n.health ? '<span class="layer">is it healthy?</span><code class="cmd">' + esc(n.health) + "</code>" : "") +
    (n.fails ? '<span class="layer">how it fails</span><p>' + esc(n.fails) + "</p>" : "") + (n.trade ? '<span class="layer">trade-off</span><p>' + esc(n.trade) + "</p>" : "");
}

// ── trace a request ──
const ROUTES = {
  out: [["away", "Your phone asks DNS for <b>cloud.example.com</b>. Cloudflare answers with its own edge address, never your home's."], ["cf", "TLS ends at the <b>edge</b>, which finds the tunnel that serves this hostname."], ["fw", "Nothing comes in through the <b>firewall</b>: there's no open port to come in through."], ["cfd", "The request rides down a connection <b>cloudflared</b> opened outbound, and is handed to http://traefik:80."], ["traefik", "<b>Traefik</b> matches Host(`cloud.example.com`) against the routers it built from container labels."], ["nc", "<b>NextCloud</b> answers. It trusts the name (NEXTCLOUD_TRUSTED_DOMAINS) and knows it's really https (OVERWRITEPROTOCOL)."], ["pool", "Your file is read from <b>/srv/pool/nextcloud</b>, a bind mount on the pooled storage…"], ["disks", "…which lives on one of the <b>drives</b> behind it."]],
  lan: [["home", "At home, your laptop asks for <b>weaver.lan</b>."], ["dns", "<b>Local DNS</b> sends it straight to fedora-01. Cloudflare never sees this request."], ["traefik", "<b>Traefik</b> matches Host(`weaver.lan`). Weaver isn't in the tunnel at all: it doesn't exist from outside."], ["weaver", "<b>Weaver's UI</b> answers from its own container."], ["smb", "What it reads and writes goes through <b>Samba</b>'s namespace…"], ["sw", "…across the <b>private gigabit line</b> to whichever box holds it."], ["disks", "Down to a <b>drive</b>."]],
};
let route = "out", hop = -1, playT = 0;
function drawHops() { $("hops").innerHTML = ROUTES[route].map(([, t], i) => '<li class="' + (i === hop ? "on" : "") + '">' + t + "</li>").join(""); }
function light() { const r = ROUTES[route]; document.querySelectorAll("#stack2 .n").forEach((b) => b.classList.toggle("lit", hop >= 0 && r.slice(0, hop + 1).some(([id]) => id === b.dataset.n))); document.querySelectorAll("#stack2 .band").forEach((b) => b.classList.toggle("hot", hop >= 0 && N[r[hop][0]].l === b.dataset.l)); drawHops(); }
function step() { hop = (hop + 1) % ROUTES[route].length; light(); }
$("stepb").onclick = () => { clearInterval(playT); step(); };
$("play").onclick = () => { clearInterval(playT); hop = -1; step(); playT = setInterval(() => { if (hop >= ROUTES[route].length - 1) return clearInterval(playT); step(); }, 1500); };
$("routes").onclick = (e) => { const b = e.target.closest("[data-r]"); if (!b) return; route = b.dataset.r; document.querySelectorAll("#routes button").forEach((x) => x.classList.toggle("on", x === b)); clearInterval(playT); hop = -1; light(); };

// ── isolate the layer: bottom up, one check at a time ──
const C = {
  lsblk: { l: "drives", q: "Is the disk still on the bus?", cmd: "lsblk -f", ok: "the drive and its filesystem label are listed", no: "It's power or cable before it's ever the filesystem. Reseat it, swap the cable or port, then read the kernel log." },
  kern: { l: "drives", q: "What did the kernel say?", cmd: "journalctl -k -b | grep -iE 'ata[0-9]+|usb|reset|I/O error' | tail -20", ok: "no link resets, no I/O errors", no: "Link resets mean cable, power or port. I/O errors on one disk mean the disk itself: check its health next." },
  smart: { l: "drives", q: "Is the drive healthy?", cmd: "sudo smartctl -H /dev/sdX", ok: "SMART overall-health: PASSED", no: "Copy what you can off it now, then replace it. Look at Reallocated_Sector_Ct in smartctl -a to see how fast it's going." },
  mount: { l: "share", q: "Is the pool mounted where everything expects it?", cmd: "findmnt /srv/pool", ok: "a real mount, not an empty directory", no: "Mount by label or UUID in /etc/fstab (never /dev/sdX: names shift on reboot), then sudo mount -a." },
  smbup: { l: "share", q: "Is Samba running?", cmd: "systemctl status smb", ok: "active (running)", no: "sudo systemctl enable --now smb, then read journalctl -u smb -n 50 for why it stopped." },
  testparm: { l: "share", q: "Is the config valid?", cmd: "testparm -s", ok: "Loaded services file OK.", no: "Fix the line testparm names, then sudo systemctl restart smb." },
  fwsmb: { l: "share", q: "Does the firewall let the LAN in?", cmd: "sudo firewall-cmd --list-all", ok: "samba is listed under services, on the LAN's zone", no: "sudo firewall-cmd --permanent --add-service=samba && sudo firewall-cmd --reload (on the LAN zone only, never the public one)." },
  selsmb: { l: "share", q: "Is SELinux blocking Samba?", cmd: "ls -Zd /srv/pool; getsebool samba_export_all_rw", ok: "samba_share_t on the path, or samba_export_all_rw --> on", no: "Label it: sudo semanage fcontext -a -t samba_share_t '/srv/pool(/.*)?' && sudo restorecon -Rv /srv/pool. If containers use the same files, sudo setsebool -P samba_export_all_rw on instead, and mount them into containers with :z." },
  smbc: { l: "share", q: "Does another box see it?", cmd: "smbclient -L //fedora-01 -U youruser", ok: "your shares are listed", no: "Credentials: sudo smbpasswd -a youruser on fedora-01 (Samba keeps its own passwords)." },
  ps: { l: "containers", q: "Is the container running?", cmd: "docker compose ps", ok: "running (healthy, if it has a health check)", no: "Read its log next; restarting or exited means it's crashing on its own." },
  dlogs: { l: "containers", q: "What does its log say?", cmd: "docker logs --tail 100 nextcloud", ok: "no crash loop, no permission errors", no: "Fix what the log names. It's nearly always config, permissions, or a volume path that doesn't exist." },
  avc: { l: "containers", q: "Is SELinux denying its volume?", cmd: "sudo ausearch -m avc -ts recent | tail", ok: "no denials for the container", no: "Add :z (shared) or :Z (private) to the bind mount so the files get a label containers may use." },
  net: { l: "proxy", q: "Is it on Traefik's network?", cmd: "docker network inspect proxy --format '{{range .Containers}}{{.Name}} {{end}}'", ok: "both traefik and the new container", no: "Add networks: [proxy] to the service and docker compose up -d. Traefik can only route to what it can reach." },
  labels: { l: "proxy", q: "Are the labels exactly right?", cmd: "docker inspect nextcloud --format '{{json .Config.Labels}}'", ok: "traefik.enable=true, a rule Host(`name`) with backticks, and the service port", no: "Labels fail silently: one typo and Traefik ignores the container. With exposedbydefault=false, traefik.enable=true is required." },
  tlogs: { l: "proxy", q: "What does Traefik say?", cmd: "docker logs traefik 2>&1 | grep -iE 'error|level=err' | tail", ok: "nothing about this router", no: "It names the router or label it can't parse. Fix that one." },
  curl: { l: "proxy", q: "Does it answer from the box itself?", cmd: "curl -sI -H 'Host: cloud.example.com' http://127.0.0.1", ok: "HTTP 200 or 302 from the app (not 404)", no: "A 404 from Traefik means no router matched: the Host rule doesn't match the name you're using." },
  cfdlog: { l: "tunnel", q: "Is cloudflared connected?", cmd: "docker logs --tail 50 cloudflared", ok: "“Registered tunnel connection”, four times", no: "Check TUNNEL_TOKEN and that the box has internet. Tunnels drop quietly on blips: docker restart cloudflared." },
  cferr: { l: "tunnel", q: "Which error does the browser show?", cmd: null, ok: "neither 1033 nor 502", no: "1033 means the tunnel isn't connected (back one step). 502 means the tunnel is up but can't reach the service: it should be http://traefik:80, with cloudflared on the proxy network." },
  host: { l: "tunnel", q: "Is the hostname routed to the tunnel?", cmd: "Zero Trust → Networks → Tunnels → your tunnel → Public hostnames", ok: "cloud.example.com → HTTP → traefik:80", no: "Add the public hostname. Only services that need outside reach go here; everything else stays on the LAN." },
};
const SYM = [
  ["drive", "A drive went dark", "a mount is empty, or I/O errors", ["lsblk", "kern", "smart", "mount"]],
  ["share", "The share won't answer", "the other boxes can't mount it", ["mount", "smbup", "testparm", "fwsmb", "selsmb", "smbc"]],
  ["ctr", "A container won't rise", "restarting, exited, or missing", ["mount", "ps", "dlogs", "avc"]],
  ["traefik", "Traefik ignores a new service", "404 page not found", ["ps", "net", "labels", "tlogs", "curl"]],
  ["out", "Outside access fails", "a Cloudflare error page, the LAN works", ["curl", "cfdlog", "cferr", "host"]],
];
let walk = null; // { sym, i: the step being asked, fault: the step that failed, done: every step passed }
function drawWalk() {
  const el = $("walk"); if (!walk) { el.innerHTML = ""; return; }
  const ids = SYM.find((s) => s[0] === walk.sym)[3], last = walk.done ? ids.length - 1 : walk.i;
  el.innerHTML = ids.slice(0, last + 1).map((id, k) => { const c = C[id], fault = walk.fault === k, cur = !walk.done && walk.fault == null && k === walk.i;
    return '<div class="step ' + (fault ? "fault" : cur ? "cur" : "ok") + '"><div class="sh"><span class="lay">' + c.l + "</span><h3>" + esc(c.q) + '</h3><span class="res">' + (fault ? "✕ here" : cur ? "" : "✓") + "</span></div>" +
      (c.cmd ? '<code class="cmd">' + esc(c.cmd) + "</code>" : "") + "<p>Expect: <b>" + esc(c.ok) + "</b></p>" +
      (cur ? '<div class="row"><button class="btn good" data-ok>That\'s what I see</button><button class="btn no" data-no>Not that</button></div>' : "") +
      (fault ? "<p>" + esc(c.no) + "</p>" : "") + "</div>"; }).join("") +
    (walk.fault != null ? '<div class="verdict"><h3>It\'s the ' + C[ids[walk.fault]].l + " layer.</h3><p>Everything below it checked out. Fix it here, then run the checks again from the bottom.</p></div>" : "") +
    (walk.done ? '<div class="verdict okv"><h3>Every layer checked out.</h3><p>' + (walk.sym === "ctr" ? "If it's running and still unreachable, Traefik never saw it: try “Traefik ignores a new service”." : walk.sym === "drive" ? "The drive layer is fine: move up to the share." : "Then it's above the layers this checks: look at the app's own settings.") + "</p></div>" : "");
  const sc = el.querySelector(".step.cur, .verdict"); if (sc && sc.scrollIntoView) sc.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
$("symptoms").innerHTML = SYM.map(([k, t, s]) => '<button data-s="' + k + '"><b>' + esc(t) + "</b><small>" + esc(s) + "</small></button>").join("");
$("symptoms").onclick = (e) => { const b = e.target.closest("[data-s]"); if (!b) return; document.querySelectorAll("#symptoms button").forEach((x) => x.classList.toggle("on", x === b)); walk = { sym: b.dataset.s, i: 0, fault: null, done: false }; drawWalk(); };
$("walk").onclick = (e) => { if (!walk) return; const ids = SYM.find((s) => s[0] === walk.sym)[3];
  if (e.target.closest("[data-ok]")) { if (walk.i >= ids.length - 1) walk.done = true; else walk.i++; drawWalk(); }
  else if (e.target.closest("[data-no]")) { walk.fault = walk.i; drawWalk(); } };

// ── ignition ──
const IGN = ["Network split: three machines, one private line", "Fedora confirmed as master, Samba installed", "Drives labeled and mounted", "Docker installed on the master node", "First container, NextCloud, running", "Traefik live and auto-discovering", "Cloudflare Tunnel open for external access", "First node officially alive"];
function ign() {
  let st = []; try { st = JSON.parse(store.get("mon:ignition") || "[]"); } catch (e) {}
  $("checks").innerHTML = IGN.map((t, i) => '<li><label><input type="checkbox" data-i="' + i + '"' + (st[i] ? " checked" : "") + "><span>" + esc(t) + "</span></label></li>").join("");
  const n = st.filter(Boolean).length, alive = n === IGN.length;
  $("ringFg").style.strokeDashoffset = 326.7 * (1 - n / IGN.length); $("ringN").textContent = n + "/" + IGN.length; $("ringL").textContent = alive ? "alive" : n ? "igniting" : "pre-ignition";
  document.querySelector(".ring").classList.toggle("alive", alive);
  $("status").textContent = alive ? "node alive" : n ? "igniting · " + n + "/" + IGN.length : "pre-ignition"; $("status").classList.toggle("alive", alive);
}
$("checks").onchange = (e) => { const i = +e.target.dataset.i; let st = []; try { st = JSON.parse(store.get("mon:ignition") || "[]"); } catch (er) {} st[i] = e.target.checked; store.set("mon:ignition", JSON.stringify(st)); ign(); };

// ── a starter stack in the same shape ──
const clean = (v, d) => (v || "").trim().replace(/[^a-zA-Z0-9.\-\/_]/g, "") || d;
function gen() {
  const dom = clean($("dom").value, "example.com"), sub = clean($("sub").value, "cloud"), pool = clean($("pool").value, "/srv/pool").replace(/\/+$/, ""), lan = clean($("lan").value, "lan"), host = sub + "." + dom;
  $("yml").textContent = `# The Monstrosity · starter stack. Traefik watches Docker; NextCloud is the first tenant;
# a Cloudflare Tunnel is the only door. Nothing is forwarded through the home firewall.
services:
  traefik:
    image: traefik:v3.1
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false   # nothing is routed unless it asks to be
      - --providers.docker.network=proxy
      - --entrypoints.web.address=:80
      - --api.dashboard=true
    ports:
      - "80:80"                  # for the LAN; the router forwards nothing in
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    security_opt:
      - label=disable            # Fedora/SELinux: lets Traefik read the Docker socket
    networks: [proxy]
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.http.routers.dashboard.rule=Host(\`traefik.${lan}\`)
      - traefik.http.routers.dashboard.service=api@internal

  nextcloud:
    image: nextcloud:29
    environment:
      - NEXTCLOUD_TRUSTED_DOMAINS=${host} nextcloud.${lan}
      - OVERWRITEPROTOCOL=https  # TLS ends at Cloudflare's edge
      - TRUSTED_PROXIES=172.16.0.0/12
    volumes:
      - ${pool}/nextcloud:/var/www/html:z   # :z so SELinux lets the container use the pool
    networks: [proxy]
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.http.routers.nextcloud.rule=Host(\`${host}\`) || Host(\`nextcloud.${lan}\`)
      - traefik.http.services.nextcloud.loadbalancer.server.port=80

  whoami:                        # a LAN-only test tenant: proves routing without touching the tunnel
    image: traefik/whoami:v1.10
    networks: [proxy]
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.http.routers.whoami.rule=Host(\`whoami.${lan}\`)

  cloudflared:
    image: cloudflare/cloudflared:2024.10.0
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=\${TUNNEL_TOKEN}
    networks: [proxy]
    restart: unless-stopped

networks:
  proxy:
    name: proxy
`;
  $("env").textContent = "# keep this file out of git\nTUNNEL_TOKEN=paste-the-token-from-the-Cloudflare-dashboard\n";
  $("cf").textContent = `1. Zero Trust → Networks → Tunnels → Create a tunnel (Cloudflared), name it monstrosity,
   and copy its token into .env.
2. Public hostname: ${host}  →  Service: HTTP  →  traefik:80
   (only what needs outside reach goes here; Weaver and muse stay on the LAN)
3. docker compose up -d, then docker logs cloudflared: look for
   "Registered tunnel connection", four times.
4. Local DNS: point *.${lan} at fedora-01 (router DNS, or hosts entries on each client):
   192.168.1.10  traefik.${lan} nextcloud.${lan} whoami.${lan}
5. Shared with Samba too? sudo setsebool -P samba_export_all_rw on
`;
}
["dom", "sub", "pool", "lan"].forEach((id) => $(id).addEventListener("input", gen));
document.querySelector(".files").addEventListener("click", (e) => { const b = e.target.closest("[data-copy]"); if (!b) return; const t = $(b.dataset.copy).textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); }, () => { b.textContent = "Select it by hand"; }); });

// ── tabs ──
function tab(t) { document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); ["stack", "trace", "iso", "ign", "gen"].forEach((x) => ($("t-" + x).hidden = x !== t)); try { history.replaceState(null, "", "#" + t); } catch (e) {} }
$("tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) tab(b.dataset.t); };
drawStack($("stack"), info); drawStack($("stack2"), null); info("traefik"); drawHops(); ign(); gen();
const h = location.hash.slice(1); if (["stack", "trace", "iso", "ign", "gen"].includes(h)) tab(h);
window.Monstrosity = { N, C, SYM, tab };
})();
