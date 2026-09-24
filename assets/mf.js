// Shared Mentifaber enhancement layer: aurora, cursor spotlight, progress bar,
// card tilt, and scroll reveal for pages that don't already have their own.
const MF_SYS = {"arsenal": ["Mechanic's Arsenal", 183, "Machines you can take apart in the browser: a 2008 Volvo XC70 and a FANUC robot arm you can jog and run."], "ballast": ["Ballast", 116, "Every bill on a real calendar, ninety days projected forward, and one honest number: what's safe to spend today."], "vigil": ["Vigil", 6, "A private command screen: weather, markets, space weather, quakes, satellites and conflict, all live."], "cartograph": ["Cartograph", 228, "A live 3D atlas of everything — 312+ objects across ten views, from the planets out to deep-universe structure…"], "weaver": ["Weaver", 6, "A persistent, autonomous entity running locally — one model to think, one to act, and an archive of everything…"], "pi": ["Pi", 143, "A voice assistant that runs on the phone itself, not in an app store."], "muse": ["muse", 281, "An AI that writes, plays and sings its own music on its own schedule."], "omnilogos": ["Omnilogos", 58, "933,573 verses across thirty translations, wired into one navigable graph — the most comprehensive concordance…"], "novarac": ["NovarAC", 196, "HF radio chat that works with the internet switched off — a browser VARA client verified to make zero external…"], "meshnet": ["MeshNet", 333, "A browser front-end for a Meshtastic LoRa mesh."], "proximity": ["Proximity", 111, "Detects a person walking through a house from the shadow their body casts on ambient WiFi."], "watchyourgrass": ["Watch Your Grass", 248, "Arena defense on a 6×6 lawn — ten plant and terrain types, six player classes, drawn up on paper before a line…"], "worm-eater": ["Worm Eater", 26, "An ingredient scanner for food, cosmetics and personal care that says \"I don't know\" instead of quietly scoring…"], "cryptovault": ["CryptoVault", 163, "Hybrid RSA-4096 + AES-256-GCM encryption in a single HTML file — the browser's own crypto engine, no server, no…"], "phone-mcp": ["Phone MCP", 301, "A model on the internet driving a real Android phone — MCP over a Cloudflare tunnel, down a USB cable, into ADB."], "crime-dashboard": ["Crime Intelligence", 78, "Forty-three US cities, four crime categories, FBI data projected to 2025 — ranked by rate per 100,000, not raw counts, in…"], "sonicveil": ["Sonic Veil", 216, "Composer since 2016 — ambient, experimental and electronic."], "duely": ["Duely", 353, "Overdue invoices, collected on contingency — you pay nothing unless your client does."], "flutterbloom": ["Flutterbloom", 131, "A tap-and-tend garden grown as a gift for one person — butterflies, helpers, a fairy that works while she's…"], "verel": ["Verel", 268, "A word coined for genuine presence without provable aliveness — because every argument about AI minds kept…"], "conflict-atlas": ["Conflict Atlas", 46, "Twenty-eight active conflicts, tiered by scale rather than by how much coverage they get."], "neural-sim": ["Neural Sim", 183, "Simulations of emotional state and a consciousness protocol — with a straight account of what the runs do not…"], "shop": ["The Shop", 321, "CNC, G-code and steel — the machines that don't accept an approximately right answer."], "frames": ["Frames", 98, "Twenty-eight photographs kept as a series."], "sketches": ["Sketches", 236, "Small builds, made in an afternoon and kept as sketches."], "moon-compatibility": ["Moon Compatibility", 255, "Any two dates, two moons — overlaid on the synodic cycle and read."], "monstrosity": ["The Monstrosity", 28, "A bolted-together homelab: three machines, ten drives, Traefik, and a tunnel as the only door."], "bubble-editor": ["Bubble Editor", 350, "Ballooning an engineering drawing for inspection — drag, number, export."], "sleep-compression": ["Sleep Compression", 205, "A sleep-restriction protocol turned tracker, with the Obsidian vault included."]};
const MF_REL = {"pi": ["weaver", "phone-mcp", "muse"], "phone-mcp": ["pi", "weaver", "vigil"], "weaver": ["verel", "neural-sim", "monstrosity"], "verel": ["weaver", "neural-sim", "muse"], "neural-sim": ["verel", "weaver", "muse"], "muse": ["weaver", "sonicveil", "pi"], "sonicveil": ["muse", "frames", "sketches"], "meshnet": ["novarac", "proximity", "vigil"], "novarac": ["meshnet", "proximity", "phone-mcp"], "proximity": ["meshnet", "novarac", "vigil"], "cartograph": ["vigil", "conflict-atlas", "sketches"], "vigil": ["cartograph", "conflict-atlas", "crime-dashboard"], "conflict-atlas": ["vigil", "crime-dashboard", "cartograph"], "crime-dashboard": ["conflict-atlas", "vigil", "ballast"], "ballast": ["duely", "arsenal", "cryptovault"], "duely": ["ballast", "cryptovault", "worm-eater"], "cryptovault": ["phone-mcp", "novarac", "ballast"], "worm-eater": ["crime-dashboard", "omnilogos", "ballast"], "omnilogos": ["cartograph", "worm-eater", "verel"], "watchyourgrass": ["sketches", "flutterbloom", "arsenal"], "flutterbloom": ["watchyourgrass", "sketches", "muse"], "arsenal": ["shop", "cartograph", "ballast"], "shop": ["arsenal", "bubble-editor", "frames"], "frames": ["shop", "sonicveil", "sketches"], "sketches": ["moon-compatibility", "bubble-editor", "monstrosity"], "moon-compatibility": ["cartograph", "sonicveil", "flutterbloom"], "monstrosity": ["weaver", "phone-mcp", "muse"], "bubble-editor": ["shop", "arsenal", "sketches"], "sleep-compression": ["ballast", "omnilogos", "pi"]};
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const body = document.body;

  const aurora = document.createElement('div');
  aurora.className = 'mf-aurora';
  aurora.innerHTML = '<i></i><i></i><i></i>';
  body.prepend(aurora);

  if (fine && !reduce) {
    const spot = document.createElement('div');
    spot.className = 'mf-spot';
    body.prepend(spot);
    addEventListener('pointermove', e => {
      spot.style.setProperty('--mx', e.clientX + 'px');
      spot.style.setProperty('--my', e.clientY + 'px');
      spot.classList.add('on');
    }, { passive: true });
    document.addEventListener('pointerleave', () => spot.classList.remove('on'));
  }

  if (!document.getElementById('bar')) {
    const bar = document.createElement('div');
    bar.id = 'mf-bar';
    body.appendChild(bar);
    const upd = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? scrollY / h * 100 : 0) + '%';
    };
    addEventListener('scroll', upd, { passive: true });
    upd();
  }

  if (fine && !reduce) {
    document.querySelectorAll('.card, .frag, .mf-launch, .tile, .panel-card').forEach(el => {
      if (el.closest('.mf-launch') && el !== el.closest('.mf-launch')) return;
      el.classList.add('mf-tilt');
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = `perspective(900px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg) translateY(-2px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  // scroll reveal only where the page has none of its own, and only below the fold
  if (!document.querySelector('.rv') && 'IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('mf-in'); io.unobserve(e.target); }
    }), { threshold: .12 });
    document.querySelectorAll('.frag, section > .card, .mf-launch-wrap').forEach(el => {
      if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('mf-rv'); io.observe(el); }
    });
  }
  // "related systems" strip before the footer
  const page = location.pathname.split('/').pop().replace('.html', '') || 'index';
  const rel = MF_REL[page];
  const foot = document.querySelector('footer');
  if (rel && foot) {
    const wrap = document.createElement('section');
    wrap.className = 'mf-related';
    wrap.innerHTML = '<div class="mf-rel-head">Related systems</div><div class="mf-rel-grid">' + rel.map(k => {
      const [name, hue, line] = MF_SYS[k];
      return `<a class="mf-rel" href="${k}.html" style="--h:${hue}"><span class="mf-rel-shot" style="background-image:url(assets/previews/${k}.png)"></span>` +
             `<span class="mf-rel-name">${name}</span><span class="mf-rel-line">${line}</span></a>`;
    }).join('') + '</div>';
    foot.parentNode.insertBefore(wrap, foot);
  }
})();
