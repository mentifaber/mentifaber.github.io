"""Hand-drawn icon art for the apps that still had the glyph tile, in the same style as the rest of tools/site/icons/:
a deep ground in the app's own hue, faint rings and rays, a halo, and one lit subject that says what the app does.
Writes tools/site/icons/<id>.svg (the source build.py reads); then run build.py's icons and raster.js as usual.
    python3 tools/site/icon_art.py [ids…]"""
import os, sys
from registry import HUE, ROOT

OUT = os.path.join(ROOT, "tools/site/icons")
EDGE = 'stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linejoin="round"'
THIN = 'stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linejoin="round"'


def frame(h, body, extra='<linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c4274"/><stop offset="1" stop-color="#101a36"/></linearGradient>'):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<radialGradient id="bg" cx="50%" cy="42%" r="76%"><stop offset="0" stop-color="hsl({h} 62% 26%)"/><stop offset=".55" stop-color="hsl({h + 8} 70% 11%)"/><stop offset="1" stop-color="hsl({h + 16} 80% 4%)"/></radialGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="hsl({h} 95% 68%)" stop-opacity=".5"/><stop offset="1" stop-color="hsl({h} 95% 68%)" stop-opacity="0"/></radialGradient>
<linearGradient id="L" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl({h} 95% 86%)"/><stop offset="1" stop-color="hsl({h} 70% 46%)"/></linearGradient>
<linearGradient id="M" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl({h} 80% 62%)"/><stop offset="1" stop-color="hsl({h} 72% 30%)"/></linearGradient>
<linearGradient id="D" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl({h} 55% 22%)"/><stop offset="1" stop-color="hsl({h} 60% 10%)"/></linearGradient>
<linearGradient id="P" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf7"/><stop offset="1" stop-color="#d8d0bf"/></linearGradient>
<linearGradient id="G" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a6"/><stop offset="1" stop-color="#d9861c"/></linearGradient>
<linearGradient id="R" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9c8a"/><stop offset="1" stop-color="#c42a1c"/></linearGradient>
<linearGradient id="S" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
{extra}</defs>
<rect width="512" height="512" fill="url(#bg)"/>
<g fill="none" stroke="hsl({h} 90% 72%)" stroke-opacity=".13" stroke-width="2"><circle cx="256" cy="256" r="150"/><circle cx="256" cy="256" r="212"/><path d="M256 256L40 60M256 256L472 60M256 256L40 452M256 256L472 452"/></g>
<circle cx="256" cy="256" r="178" fill="url(#halo)"/>
{body}
</svg>
"""


def lines(x, y, w, n, gap, col, sw=7, op=1):  # text lines on a page
    return "".join(f'<path d="M{x} {y + i * gap}H{x + (w if i % 3 != 2 else w * .62)}" stroke="{col}" stroke-width="{sw}" stroke-linecap="round" opacity="{op}"/>' for i in range(n))


ART = {}

# Bill Watch: this month's bill, and its last bar jumping above the rest
ART["bills"] = lambda h: f"""
<path d="M150 104H330L362 136V404L340 392 318 404 296 392 274 404 252 392 230 404 208 392 186 404 164 392 150 404Z" fill="url(#P)" {EDGE}/>
<path d="M330 104V136H362" fill="#cfc6b2"/>
{lines(176, 150, 110, 2, 22, "hsl(" + str(h) + " 40% 40%)", 7, .7)}
<path d="M176 330V292M206 330V276M236 330V286M266 330V268" stroke="hsl({h} 60% 42%)" stroke-width="20" stroke-linecap="round"/>
<path d="M300 330V222" stroke="url(#R)" stroke-width="22" stroke-linecap="round"/>
<path d="M168 350H336" stroke="hsl({h} 30% 55%)" stroke-width="4" stroke-linecap="round"/>
<circle cx="352" cy="214" r="42" fill="url(#R)" {EDGE}/><path d="M352 236V194M334 210L352 192 370 210" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>"""

# Blackout Kit: a camping lantern, lit, in the dark
ART["blackout"] = lambda h: f"""
<circle cx="256" cy="276" r="120" fill="#ffd27a" opacity=".16"/>
<path d="M216 118C216 92 296 92 296 118" fill="none" stroke="url(#G)" stroke-width="10" stroke-linecap="round"/>
<rect x="196" y="122" width="120" height="34" rx="10" fill="url(#D)" {THIN}/>
<path d="M206 156H306L320 340H192Z" fill="#fff4cf" fill-opacity=".22" {EDGE}/>
<path d="M226 156V340M286 156V340" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>
<ellipse cx="256" cy="262" rx="38" ry="58" fill="#ffe7a6"/><ellipse cx="256" cy="270" rx="20" ry="34" fill="#fff"/>
<path d="M256 214C244 236 244 254 256 266C268 254 268 236 256 214Z" fill="#ffb347"/>
<rect x="180" y="340" width="152" height="44" rx="12" fill="url(#D)" {THIN}/>
<rect x="206" y="354" width="70" height="14" rx="4" fill="#7dff9a"/><rect x="282" y="354" width="22" height="14" rx="4" fill="#7dff9a" opacity=".4"/>"""

# Care Circle: a heart held by the people looking after someone, and the day's pill
ART["care"] = lambda h: f"""
<g fill="none" stroke="hsl({h} 90% 80%)" stroke-opacity=".5" stroke-width="3" stroke-dasharray="6 10"><circle cx="256" cy="262" r="150"/></g>
<g {THIN}><circle cx="256" cy="112" r="24" fill="url(#G)"/><circle cx="386" cy="320" r="24" fill="url(#L)"/><circle cx="126" cy="320" r="24" fill="url(#L)"/></g>
<path d="M256 362C192 318 150 282 150 236C150 202 176 180 206 180C228 180 246 192 256 210C266 192 284 180 306 180C336 180 362 202 362 236C362 282 320 318 256 362Z" fill="url(#M)" {EDGE}/>
<path d="M190 222C194 206 206 198 220 198" stroke="#fff" stroke-opacity=".6" stroke-width="8" stroke-linecap="round" fill="none"/>
<g transform="rotate(-35 280 290)"><rect x="236" y="272" width="96" height="40" rx="20" fill="#fff" {THIN}/><path d="M284 272H312C323 272 332 281 332 292C332 303 323 312 312 312H284Z" fill="url(#G)"/></g>"""

# Quiet Check-in: a home at night, a steady pulse through its window, and the all-clear
ART["checkin"] = lambda h: f"""
<path d="M256 108L392 220V392H120V220Z" fill="url(#D)" {EDGE}/>
<path d="M256 108L392 220" stroke="url(#L)" stroke-width="12" stroke-linecap="round"/><path d="M256 108L120 220" stroke="url(#L)" stroke-width="12" stroke-linecap="round"/>
<rect x="160" y="236" width="192" height="104" rx="14" fill="hsl({h} 70% 14%)" stroke="hsl({h} 90% 70%)" stroke-opacity=".6" stroke-width="3"/>
<path d="M168 290H206L222 258L242 322L262 270L276 290H344" fill="none" stroke="hsl({h} 95% 70%)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M168 290H206L222 258L242 322L262 270L276 290H344" fill="none" stroke="hsl({h} 95% 70%)" stroke-width="22" stroke-opacity=".18" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="372" cy="364" r="44" fill="url(#M)" {EDGE}/><path d="M352 364L366 378 392 350" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>"""

# Claim Kit: the dispute's folder, its papers, and the stamp that says it's documented
ART["claim"] = lambda h: f"""
<path d="M124 170H214L236 192H388V378C388 388 380 396 370 396H142C132 396 124 388 124 378Z" fill="url(#D)" {THIN}/>
<rect x="160" y="128" width="170" height="210" rx="8" fill="url(#P)" transform="rotate(-8 245 233)" {THIN}/>
<rect x="186" y="140" width="170" height="210" rx="8" fill="url(#P)" transform="rotate(5 271 245)" {THIN}/>
<g transform="rotate(5 271 245)">{lines(210, 176, 120, 5, 26, "#8a8070", 7, .75)}<rect x="210" y="300" width="56" height="34" rx="4" fill="hsl({h} 60% 70%)" opacity=".6"/></g>
<path d="M124 236H388V378C388 388 380 396 370 396H142C132 396 124 388 124 378Z" fill="url(#M)" {EDGE}/>
<path d="M140 252H372" stroke="#fff" stroke-opacity=".3" stroke-width="4" stroke-linecap="round"/>
<circle cx="330" cy="320" r="40" fill="none" stroke="#fff" stroke-width="7" opacity=".9"/><path d="M312 320L326 334 350 308" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>"""

# Due Dates: a letter, and the date it was hiding, ringed on the calendar
ART["due"] = lambda h: f"""
<g transform="rotate(-10 200 300)"><rect x="104" y="232" width="190" height="128" rx="10" fill="url(#P)" {THIN}/><path d="M104 242L199 306 294 242" fill="none" stroke="#a89f8c" stroke-width="5" stroke-linejoin="round"/></g>
<rect x="196" y="128" width="200" height="210" rx="20" fill="url(#P)" {EDGE}/>
<path d="M196 148C196 137 205 128 216 128H376C387 128 396 137 396 148V180H196Z" fill="url(#M)"/>
<path d="M240 112V146M352 112V146" stroke="url(#D)" stroke-width="12" stroke-linecap="round"/>
<g fill="hsl({h} 30% 62%)">{''.join(f'<rect x="{220 + c * 40}" y="{200 + r * 38}" width="24" height="20" rx="4"/>' for r in range(3) for c in range(4) if (r, c) != (1, 2))}</g>
<rect x="300" y="238" width="24" height="20" rx="4" fill="url(#R)"/>
<ellipse cx="312" cy="248" rx="32" ry="26" fill="none" stroke="#e8322a" stroke-width="6" transform="rotate(-12 312 248)"/>"""

# Digital Estate: the key to what's left, tied to a sealed scroll
ART["estate"] = lambda h: f"""
<g transform="rotate(-18 256 256)">
<rect x="130" y="188" width="252" height="150" rx="16" fill="url(#P)" {THIN}/>
<rect x="116" y="180" width="30" height="166" rx="15" fill="#c9bfa8" {THIN}/><rect x="366" y="180" width="30" height="166" rx="15" fill="#c9bfa8" {THIN}/>
{lines(170, 222, 150, 4, 24, "#8a8070", 6, .6)}</g>
<path d="M146 396L240 302" stroke="url(#G)" stroke-width="18" stroke-linecap="round"/>
<path d="M170 372L190 392M190 352L208 370" stroke="url(#G)" stroke-width="14" stroke-linecap="round"/>
<circle cx="276" cy="266" r="56" fill="url(#G)" {EDGE}/><circle cx="276" cy="266" r="22" fill="url(#bg)"/>
<circle cx="352" cy="352" r="40" fill="url(#M)" {EDGE}/><path d="M352 334L357 346 370 347 360 355 363 368 352 361 341 368 344 355 334 347 347 346Z" fill="#fff" opacity=".9"/>"""

# Fix or Replace: the repair and the new one, weighed on scales
ART["fix"] = lambda h: f"""
<path d="M256 128V372" stroke="url(#G)" stroke-width="14" stroke-linecap="round"/>
<path d="M190 392H322" stroke="url(#G)" stroke-width="18" stroke-linecap="round"/><circle cx="256" cy="126" r="16" fill="url(#G)" {THIN}/>
<path d="M120 178L392 154" stroke="url(#G)" stroke-width="12" stroke-linecap="round"/>
<path d="M120 178L84 270M120 178L156 270M392 154L356 246M392 154L428 246" stroke="#ffe7a6" stroke-opacity=".75" stroke-width="3"/>
<path d="M70 270H170C170 300 148 320 120 320C92 320 70 300 70 270Z" fill="url(#M)" {EDGE}/>
<path d="M342 246H442C442 276 420 296 392 296C364 296 342 276 342 246Z" fill="url(#M)" {EDGE}/>
<g transform="translate(120 238) rotate(-45)"><rect x="-8" y="-6" width="16" height="58" rx="7" fill="#eef0f6" {THIN}/><path d="M-22 -26C-22 -42 22 -42 22 -26L10 -18V-6H-10V-18Z" fill="#eef0f6" {THIN}/><rect x="-6" y="-40" width="12" height="20" fill="url(#M)"/></g>
<g transform="translate(392 212) rotate(-20)"><path d="M-34 -22H18L40 0 18 22H-34Z" fill="#fff" {THIN}/><circle cx="20" cy="0" r="6" fill="url(#M)"/><text x="-10" y="9" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="26" fill="hsl({h} 70% 34%)">$</text></g>"""

# House Manual: the home's own handbook, open on its house
ART["house"] = lambda h: f"""
<path d="M256 156C214 130 160 126 112 136V378C160 368 214 372 256 398Z" fill="url(#P)" {EDGE}/>
<path d="M256 156C298 130 352 126 400 136V378C352 368 298 372 256 398Z" fill="url(#P)" {EDGE}/>
<path d="M256 156V398" stroke="#b9ae98" stroke-width="4"/>
<path d="M182 186L226 222V286H138V222Z" fill="url(#M)" {THIN}/><rect x="172" y="248" width="22" height="38" rx="3" fill="url(#D)"/><path d="M130 228L182 184 234 228" fill="none" stroke="url(#D)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
{lines(140, 314, 80, 2, 22, "#8a8070", 6, .6)}{lines(284, 186, 86, 6, 26, "#8a8070", 6, .6)}
<path d="M352 126V200L368 186 384 200V126" fill="url(#R)"/>"""

# In Case: the wallet card paramedics look for, with its code
ART["incase"] = lambda h: f"""
<rect x="104" y="156" width="304" height="200" rx="22" fill="url(#P)" {EDGE}/>
<path d="M104 178C104 166 114 156 126 156H386C398 156 408 166 408 178V206H104Z" fill="url(#M)"/>
<path d="M152 168V194M139 181H165" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
<path d="M180 182H300" stroke="#fff" stroke-opacity=".8" stroke-width="9" stroke-linecap="round"/>
{lines(130, 236, 130, 4, 26, "#8a8070", 7, .7)}
<path d="M130 236H210" stroke="url(#R)" stroke-width="8" stroke-linecap="round"/>
<rect x="290" y="226" width="92" height="92" rx="8" fill="#fff" stroke="#2a2420" stroke-width="3"/>
<g fill="#2a2420"><rect x="300" y="236" width="24" height="24"/><rect x="348" y="236" width="24" height="24"/><rect x="300" y="284" width="24" height="24"/><rect x="334" y="270" width="10" height="10"/><rect x="350" y="290" width="10" height="10"/><rect x="362" y="276" width="10" height="10"/><rect x="334" y="296" width="10" height="10"/></g>
<path d="M120 380H180L196 352 214 404 232 366H392" fill="none" stroke="url(#R)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>"""

# House Kitty: the shared jar, coins going in
ART["kitty"] = lambda h: f"""
<rect x="176" y="118" width="160" height="34" rx="10" fill="url(#G)" {THIN}/>
<path d="M186 152H326C326 172 350 184 350 214V362C350 384 332 400 310 400H202C180 400 162 384 162 362V214C162 184 186 172 186 152Z" fill="hsl({h} 70% 70%)" fill-opacity=".22" {EDGE}/>
<g {THIN}><ellipse cx="226" cy="370" rx="40" ry="14" fill="url(#G)"/><ellipse cx="290" cy="372" rx="40" ry="14" fill="url(#G)"/><ellipse cx="256" cy="350" rx="40" ry="14" fill="url(#G)"/><ellipse cx="236" cy="328" rx="40" ry="14" fill="url(#G)"/><ellipse cx="282" cy="308" rx="40" ry="14" fill="url(#G)"/></g>
<path d="M188 210V340" stroke="#fff" stroke-opacity=".45" stroke-width="10" stroke-linecap="round"/>
<g transform="rotate(-20 312 96)"><ellipse cx="312" cy="96" rx="34" ry="34" fill="url(#G)" {EDGE}/><g transform="translate(312 96)"><text x="0" y="12" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="36" fill="#8a4a08">$</text></g></g>"""

# Sealed Letters: an envelope under wax, and the hourglass it's waiting on
ART["letters"] = lambda h: f"""
<rect x="104" y="160" width="270" height="190" rx="14" fill="url(#P)" {EDGE}/>
<path d="M104 172L239 270 374 172" fill="none" stroke="#b5ab96" stroke-width="5" stroke-linejoin="round"/>
<path d="M104 350L204 262M374 350L274 262" stroke="#cfc6b2" stroke-width="4"/>
<circle cx="239" cy="270" r="36" fill="url(#R)" {EDGE}/><path d="M239 250L245 264 260 265 248 274 252 289 239 281 226 289 230 274 218 265 233 264Z" fill="#fff" opacity=".75"/>
<g transform="translate(360 300)"><path d="M-34 -78H34M-34 78H34" stroke="url(#G)" stroke-width="10" stroke-linecap="round"/>
<path d="M-28 -78C-28 -30 28 -24 28 0C28 24 -28 30 -28 78H28C28 30 -28 24 -28 0C-28 -24 28 -30 28 -78Z" fill="#fff" fill-opacity=".25" {THIN}/>
<path d="M-18 -60H18C18 -40 0 -24 0 -14C0 -24 -18 -40 -18 -60Z" fill="url(#G)"/><path d="M-22 68C-14 52 14 52 22 68Z" fill="url(#G)"/></g>"""

# Street Library: the little box on a post, full of things to borrow
ART["library"] = lambda h: f"""
<path d="M244 330H268V408H244Z" fill="url(#D)" {THIN}/><path d="M204 408H308" stroke="url(#D)" stroke-width="12" stroke-linecap="round"/>
<path d="M140 176L256 104 372 176Z" fill="url(#M)" {EDGE}/>
<rect x="152" y="176" width="208" height="160" rx="10" fill="url(#D)" {EDGE}/>
<rect x="170" y="194" width="172" height="124" rx="6" fill="hsl({h} 60% 8%)"/>
<g {THIN}><rect x="180" y="222" width="22" height="88" rx="3" fill="url(#R)"/><rect x="206" y="210" width="20" height="100" rx="3" fill="url(#G)"/><rect x="230" y="230" width="24" height="80" rx="3" fill="url(#L)"/><rect x="258" y="216" width="18" height="94" rx="3" fill="#9ad8ff"/>
<path d="M286 310L304 222 320 226 304 312Z" fill="#c8f0a6"/></g>
<path d="M330 240V300M318 240H342M318 260H342M318 280H342M318 300H342" stroke="#fff" stroke-opacity=".85" stroke-width="4" stroke-linecap="round"/>"""

# AutoFaber Offline: the mind on the phone itself, and no cloud needed
ART["local-ai"] = lambda h: f"""
<rect x="166" y="118" width="180" height="300" rx="30" fill="url(#D)" {EDGE}/>
<rect x="180" y="146" width="152" height="240" rx="14" fill="hsl({h} 70% 8%)"/>
<rect x="226" y="126" width="60" height="8" rx="4" fill="#fff" opacity=".35"/>
<g stroke="hsl({h} 95% 78%)" stroke-width="5" stroke-linecap="round"><path d="M226 244H210M226 284H210M286 244H302M286 284H302M240 230V214M272 230V214M240 298V314M272 298V314"/></g>
<rect x="224" y="230" width="64" height="68" rx="12" fill="url(#L)" {THIN}/>
<path d="M256 252L264 264H248Z M248 272H264" fill="none" stroke="url(#D)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="256" cy="264" r="70" fill="none" stroke="hsl({h} 95% 78%)" stroke-opacity=".3" stroke-width="3"/>
<g transform="translate(356 128)"><path d="M-46 22C-62 22 -64 0 -50 -6C-50 -26 -24 -32 -14 -18C-6 -34 22 -32 26 -12C44 -14 50 22 30 22Z" fill="#fff" fill-opacity=".85" {THIN}/>
<path d="M-56 -36L44 40" stroke="url(#R)" stroke-width="10" stroke-linecap="round"/></g>"""

# Move-in, Move-out: the door, its keys, and the condition checked twice
ART["movein"] = lambda h: f"""
<rect x="142" y="108" width="172" height="296" rx="10" fill="url(#D)" {EDGE}/>
<path d="M156 122H300V404L156 390Z" fill="url(#M)" {THIN}/>
<rect x="176" y="146" width="104" height="86" rx="8" fill="#fff" fill-opacity=".18"/><rect x="176" y="250" width="104" height="110" rx="8" fill="#fff" fill-opacity=".12"/>
<circle cx="282" cy="270" r="9" fill="url(#G)"/>
<g transform="translate(260 300)"><circle cx="0" cy="0" r="22" fill="none" stroke="url(#G)" stroke-width="8"/><path d="M16 16L60 60M44 44L56 32M54 54L66 42" stroke="url(#G)" stroke-width="10" stroke-linecap="round"/></g>
<rect x="300" y="196" width="104" height="138" rx="12" fill="url(#P)" {EDGE}/><rect x="330" y="186" width="44" height="20" rx="6" fill="url(#D)"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M318 236L328 246 344 228M318 280L328 290 344 272" stroke="hsl({h} 70% 40%)" stroke-width="7"/><path d="M356 238H388M356 282H388" stroke="#8a8070" stroke-width="6" opacity=".7"/></g>"""

# Device Passport: a booklet of stamps for a phone's repairs
ART["passport"] = lambda h: f"""
<rect x="128" y="104" width="226" height="304" rx="16" fill="url(#navy)" {EDGE}/>
<path d="M128 120C128 111 135 104 144 104H170V408H144C135 408 128 401 128 392Z" fill="#000" opacity=".25"/>
<rect x="210" y="146" width="96" height="160" rx="16" fill="none" stroke="url(#G)" stroke-width="7"/><path d="M240 160H276" stroke="url(#G)" stroke-width="6" stroke-linecap="round"/><circle cx="258" cy="290" r="6" fill="url(#G)"/>
<path d="M234 232L250 248 284 212" fill="none" stroke="url(#G)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M200 344H316M220 370H296" stroke="url(#G)" stroke-width="6" stroke-linecap="round" opacity=".8"/>
<g transform="rotate(14 358 352)"><circle cx="358" cy="352" r="50" fill="none" stroke="url(#R)" stroke-width="6"/><circle cx="358" cy="352" r="38" fill="url(#R)" fill-opacity=".2" stroke="#ff9c8a" stroke-width="2" stroke-dasharray="4 5"/>
<path d="M330 344H386M330 360H386" stroke="#ff9c8a" stroke-width="5" stroke-linecap="round"/></g>"""

# Recall Watch: the kettle in the kitchen, and the warning that comes with it
ART["recall"] = lambda h: f"""
<path d="M150 210C150 176 188 160 228 160H252C292 160 330 176 330 210L344 368C344 382 334 392 320 392H160C146 392 136 382 136 368Z" fill="url(#L)" {EDGE}/>
<path d="M190 160C190 128 290 128 290 160" fill="none" stroke="url(#D)" stroke-width="16" stroke-linecap="round"/>
<path d="M150 226C122 230 100 246 92 268L118 278C126 262 138 254 150 252Z" fill="url(#M)" {THIN}/>
<path d="M182 210V352" stroke="#fff" stroke-opacity=".55" stroke-width="12" stroke-linecap="round"/>
<rect x="136" y="374" width="208" height="22" rx="8" fill="url(#D)"/>
<path d="M352 182L424 310H280Z" fill="#ffd23a" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linejoin="round"/>
<path d="M352 226V268" stroke="#3a2600" stroke-width="12" stroke-linecap="round"/><circle cx="352" cy="290" r="7" fill="#3a2600"/>"""

# The Home Record: the house's service history, entry by entry
ART["record"] = lambda h: f"""
<rect x="128" y="124" width="256" height="288" rx="18" fill="url(#P)" {EDGE}/>
<path d="M128 142C128 132 136 124 146 124H366C376 124 384 132 384 142V196H128Z" fill="url(#M)"/>
<path d="M256 136L310 178V190H202V178Z" fill="#fff" fill-opacity=".9"/><rect x="246" y="168" width="20" height="22" rx="3" fill="url(#D)"/>
<path d="M168 226V384" stroke="hsl({h} 40% 70%)" stroke-width="5"/>
{''.join(f'<circle cx="168" cy="{238 + i * 48}" r="12" fill="url(#M)" stroke="#fff" stroke-width="3"/><path d="M196 {232 + i * 48}H{340 - i * 24}M196 {250 + i * 48}H{290 - i * 10}" stroke="#8a8070" stroke-width="6" stroke-linecap="round" opacity="{.8 - i * .1}"/>' for i in range(4))}
<circle cx="372" cy="384" r="40" fill="url(#G)" {EDGE}/><path d="M354 384L368 398 392 372" fill="none" stroke="#5a3200" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>"""

# Repair Café: a cup of tea and a screwdriver at the fixing table, in the shop's gear
ART["repair"] = lambda h: f"""
<g transform="translate(256 248)"><path d="{''.join(('M' if k == 0 else 'L') + f'{(150 if k % 2 == 0 else 128) * __import__("math").cos(k * __import__("math").pi / 12):.1f} {(150 if k % 2 == 0 else 128) * __import__("math").sin(k * __import__("math").pi / 12):.1f}' for k in range(24))}Z" fill="none" stroke="hsl({h} 90% 72%)" stroke-opacity=".35" stroke-width="6" stroke-linejoin="round"/></g>
<path d="M150 214H306V316C306 352 278 380 242 380H214C178 380 150 352 150 316Z" fill="url(#P)" {EDGE}/>
<path d="M306 240C342 240 352 264 352 280C352 300 336 318 306 318" fill="none" stroke="url(#P)" stroke-width="18"/>
<path d="M164 230H292" stroke="hsl({h} 50% 30%)" stroke-width="10" stroke-linecap="round" opacity=".8"/>
<path d="M198 186C190 170 206 160 198 140M232 186C224 170 240 160 232 140M266 186C258 170 274 160 266 140" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="7" stroke-linecap="round"/>
<path d="M124 404H388" stroke="url(#D)" stroke-width="14" stroke-linecap="round"/>
<g transform="rotate(-40 350 330)"><rect x="336" y="248" width="28" height="70" rx="10" fill="url(#M)" {THIN}/><path d="M350 318V392" stroke="#e8e8f0" stroke-width="10" stroke-linecap="round"/><path d="M344 392H356" stroke="#e8e8f0" stroke-width="6"/></g>"""

# Second Opinion: a quote under the glass, and the one line that doesn't add up
ART["second"] = lambda h: f"""
<rect x="120" y="108" width="226" height="292" rx="14" fill="url(#P)" {EDGE}/>
<path d="M146 146H260" stroke="url(#M)" stroke-width="12" stroke-linecap="round"/>
{lines(146, 190, 120, 6, 30, "#8a8070", 6, .65)}
<g fill="#8a8070" opacity=".75"><rect x="290" y="184" width="30" height="12" rx="4"/><rect x="290" y="214" width="30" height="12" rx="4"/><rect x="290" y="274" width="30" height="12" rx="4"/><rect x="290" y="304" width="30" height="12" rx="4"/></g>
<rect x="280" y="240" width="48" height="24" rx="6" fill="url(#R)"/>
<circle cx="312" cy="262" r="70" fill="hsl({h} 90% 80%)" fill-opacity=".22" stroke="url(#L)" stroke-width="16"/>
<path d="M276 220C286 208 302 202 316 204" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="7" stroke-linecap="round"/>
<path d="M362 314L410 362" stroke="url(#D)" stroke-width="26" stroke-linecap="round"/><path d="M362 314L410 362" stroke="#fff" stroke-opacity=".25" stroke-width="8" stroke-linecap="round"/>"""

# Street Skills: the street's toolbox, and what its neighbours can do coming out of it
ART["skills"] = lambda h: f"""
<path d="M216 236V214C216 202 226 194 238 194H274C286 194 296 202 296 214V236" fill="none" stroke="url(#D)" stroke-width="14"/>
<rect x="124" y="236" width="264" height="160" rx="18" fill="url(#M)" {EDGE}/>
<path d="M124 288H388" stroke="url(#D)" stroke-width="10"/><rect x="234" y="276" width="44" height="26" rx="6" fill="url(#G)" {THIN}/>
<path d="M142 254H370" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>
<path d="M170 214L150 176M256 190V140M342 214L362 176" stroke="#fff" stroke-opacity=".3" stroke-width="4" stroke-dasharray="4 8" stroke-linecap="round"/>
<g transform="translate(140 140)"><circle r="44" fill="url(#P)" {EDGE}/><g transform="rotate(-45)"><rect x="-6" y="-4" width="12" height="40" rx="5" fill="#5a5048"/><path d="M-18 -18C-18 -32 18 -32 18 -18L8 -12V-2H-8V-12Z" fill="#5a5048"/></g></g>
<g transform="translate(256 106)"><circle r="44" fill="url(#P)" {EDGE}/><path d="M0 24C-30 4 -24 -22 -8 -22C0 -22 0 -14 0 -14C0 -14 0 -22 8 -22C24 -22 30 4 0 24Z" fill="url(#R)"/></g>
<g transform="translate(372 140)"><circle r="44" fill="url(#P)" {EDGE}/><g transform="rotate(40)"><rect x="-6" y="-6" width="12" height="38" rx="5" fill="#8a6a40"/><rect x="-8" y="-14" width="16" height="10" fill="#b9bcc8"/><path d="M-9 -14C-9 -30 9 -30 9 -14Z" fill="url(#M)"/></g></g>"""

# Sky Lens: the phone held up to the night, finding the shapes in it
ART["skylens"] = lambda h: f"""
<g fill="#fff">{''.join(f'<circle cx="{x}" cy="{y}" r="{r}" opacity="{o}"/>' for x, y, r, o in [(90, 96, 2.5, .8), (420, 80, 2, .7), (452, 200, 2.5, .6), (70, 240, 2, .6), (110, 410, 2, .5), (430, 430, 2.5, .6), (380, 60, 1.6, .6), (60, 150, 1.6, .5)])}</g>
<g fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.5"><path d="M122 140L182 104 250 122 300 86 372 112"/></g>
<g fill="#fff"><circle cx="122" cy="140" r="5"/><circle cx="182" cy="104" r="6"/><circle cx="250" cy="122" r="4"/><circle cx="300" cy="86" r="6"/><circle cx="372" cy="112" r="5"/></g>
<g transform="rotate(-12 256 300)"><rect x="170" y="176" width="172" height="250" rx="28" fill="url(#D)" {EDGE}/>
<rect x="184" y="196" width="144" height="200" rx="12" fill="hsl({h} 70% 10%)"/>
<path d="M204 344L232 276 270 300 300 232" fill="none" stroke="hsl({h} 95% 72%)" stroke-width="4"/>
<g fill="#fff"><circle cx="204" cy="344" r="6"/><circle cx="232" cy="276" r="7"/><circle cx="270" cy="300" r="5"/><circle cx="300" cy="232" r="8"/></g>
<circle cx="300" cy="232" r="20" fill="none" stroke="url(#G)" stroke-width="4"/><path d="M200 378H262" stroke="url(#G)" stroke-width="6" stroke-linecap="round"/></g>"""

# Street Board: the corkboard by the shop, notices pinned to it
ART["street"] = lambda h: f"""
<path d="M176 390L196 318M336 390L316 318" stroke="url(#D)" stroke-width="16" stroke-linecap="round"/>
<rect x="110" y="122" width="292" height="210" rx="16" fill="url(#D)" {EDGE}/>
<rect x="126" y="138" width="260" height="178" rx="8" fill="#b9864a"/><rect x="126" y="138" width="260" height="178" rx="8" fill="url(#S)"/>
<g transform="rotate(-6 186 206)"><rect x="146" y="160" width="84" height="94" rx="4" fill="url(#P)" {THIN}/>{lines(158, 190, 56, 3, 18, "#8a8070", 5, .7)}</g>
<g transform="rotate(5 300 204)"><rect x="254" y="156" width="108" height="72" rx="4" fill="#ffe28a" {THIN}/>{lines(268, 182, 74, 2, 18, "#8a6a20", 5, .7)}</g>
<g transform="rotate(-3 300 280)"><rect x="252" y="244" width="96" height="60" rx="4" fill="#bfe6ff" {THIN}/>{lines(266, 266, 64, 2, 16, "#3a6080", 5, .7)}</g>
<g transform="rotate(4 190 286)"><rect x="152" y="268" width="76" height="40" rx="4" fill="#ffc2b8" {THIN}/></g>
<g fill="url(#R)" stroke="#fff" stroke-width="2"><circle cx="186" cy="164" r="8"/><circle cx="308" cy="160" r="8"/><circle cx="300" cy="248" r="8"/><circle cx="190" cy="272" r="7"/></g>"""

# Subscription Sweep: the card, and the charge that keeps coming round
ART["subs"] = lambda h: f"""
<path d="M256 96A160 160 0 1 1 112 186" fill="none" stroke="url(#L)" stroke-width="14" stroke-linecap="round"/>
<path d="M88 160L114 196 150 170" fill="none" stroke="url(#L)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
<g transform="rotate(-10 256 266)"><rect x="140" y="194" width="232" height="146" rx="18" fill="url(#M)" {EDGE}/>
<path d="M140 232H372" stroke="url(#D)" stroke-width="24"/><rect x="164" y="262" width="40" height="30" rx="6" fill="url(#G)"/>
<path d="M164 312H260" stroke="#fff" stroke-opacity=".6" stroke-width="7" stroke-linecap="round"/>
<path d="M152 204C200 200 300 200 360 206" stroke="#fff" stroke-opacity=".4" stroke-width="4" stroke-linecap="round"/></g>
<g transform="translate(372 120)"><circle r="34" fill="url(#G)" {EDGE}/><text x="0" y="12" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="36" fill="#8a4a08">$</text></g>"""

# Witness: the camera, and the seal that proves when the photo was taken
ART["witness"] = lambda h: f"""
<path d="M196 176L214 144H298L316 176Z" fill="url(#D)" {THIN}/>
<rect x="112" y="170" width="288" height="196" rx="26" fill="url(#D)" {EDGE}/>
<path d="M126 196H386" stroke="#fff" stroke-opacity=".25" stroke-width="5" stroke-linecap="round"/>
<circle cx="256" cy="268" r="74" fill="url(#M)" {EDGE}/><circle cx="256" cy="268" r="46" fill="hsl({h} 70% 10%)"/><circle cx="242" cy="252" r="14" fill="#fff" opacity=".6"/>
<rect x="340" y="192" width="34" height="18" rx="5" fill="url(#G)"/>
<g transform="translate(366 352)"><path d="M0 -50L40 -36V-2C40 26 22 44 0 54C-22 44 -40 26 -40 -2V-36Z" fill="url(#G)" {EDGE}/>
<circle cx="0" cy="2" r="22" fill="none" stroke="#5a3200" stroke-width="6"/><path d="M0 -10V3L9 9" fill="none" stroke="#5a3200" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>"""

# ── icons outside the app registry: FaberOS's own apps, its Privacy page, and private pages ──
HUE_EXTRA = {"os-about": 38, "os-shelf": 30, "os-routines": 150, "os-settings": 215, "privacy": 196, "angels": 48, "nest": 28}

# About FaberOS: the hexagon the OS is built on, lit from inside
ART["os-about"] = lambda h: f"""
<path d="M256 96L394 176V336L256 416 118 336V176Z" fill="url(#D)" {EDGE}/>
<path d="M256 136L360 196V316L256 376 152 316V196Z" fill="none" stroke="url(#L)" stroke-width="8" stroke-linejoin="round"/>
<path d="M256 96V136M394 176L360 196M394 336L360 316M256 416V376M118 336L152 316M118 176L152 196" stroke="hsl({h} 90% 72%)" stroke-opacity=".5" stroke-width="4"/>
<circle cx="256" cy="256" r="58" fill="url(#G)" {EDGE}/>
<path d="M240 226H276M240 226V288M240 254H268" fill="none" stroke="#5a3200" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>"""

# Shelf: a lit shelf, with the apps a person keeps on it
ART["os-shelf"] = lambda h: f"""
<rect x="112" y="112" width="288" height="296" rx="18" fill="url(#D)" {EDGE}/>
<path d="M128 236H384M128 368H384" stroke="url(#G)" stroke-width="12" stroke-linecap="round"/>
<g {THIN}><rect x="150" y="150" width="70" height="78" rx="16" fill="url(#L)"/><rect x="232" y="150" width="70" height="78" rx="16" fill="url(#R)"/><rect x="314" y="170" width="54" height="58" rx="14" fill="#9ad8ff"/>
<rect x="150" y="282" width="54" height="78" rx="14" fill="#c8f0a6"/><rect x="216" y="282" width="70" height="78" rx="16" fill="url(#G)"/><rect x="298" y="282" width="70" height="78" rx="16" fill="url(#M)"/></g>
<path d="M162 162H208M244 162H290" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>"""

# Routines: the day's steps going round on their own
ART["os-routines"] = lambda h: f"""
<path d="M256 112A144 144 0 0 1 392 208" fill="none" stroke="url(#L)" stroke-width="16" stroke-linecap="round"/><path d="M372 176L394 214 430 190" fill="none" stroke="url(#L)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M256 400A144 144 0 0 1 120 304" fill="none" stroke="url(#L)" stroke-width="16" stroke-linecap="round"/><path d="M140 336L118 298 82 322" fill="none" stroke="url(#L)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="176" y="166" width="160" height="180" rx="18" fill="url(#P)" {EDGE}/>
{''.join(f'<rect x="196" y="{192 + k * 46}" width="24" height="24" rx="6" fill="{"url(#M)" if k < 2 else "none"}" stroke="hsl({h} 60% 40%)" stroke-width="4"/>' + (f'<path d="M201 {204 + k * 46}L207 {210 + k * 46} 216 {198 + k * 46}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' if k < 2 else '') + f'<path d="M234 {204 + k * 46}H{316 - k * 14}" stroke="#8a8070" stroke-width="7" stroke-linecap="round" opacity=".7"/>' for k in range(3))}"""

# Settings: the gear that tunes it
ART["os-settings"] = lambda h: f"""
<g transform="translate(256 256)"><path d="{''.join(('M' if k == 0 else 'L') + f'{(150 if (k // 2) % 2 == 0 else 116) * __import__("math").cos((k - .5) * __import__("math").pi / 16):.1f} {(150 if (k // 2) % 2 == 0 else 116) * __import__("math").sin((k - .5) * __import__("math").pi / 16):.1f}' for k in range(32))}Z" fill="url(#M)" {EDGE}/>
<circle r="92" fill="url(#D)" stroke="#fff" stroke-opacity=".3" stroke-width="3"/><circle r="50" fill="url(#L)" {EDGE}/><circle r="20" fill="url(#D)"/>
<path d="M-112 -40A120 120 0 0 1 -40 -112" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="10" stroke-linecap="round"/></g>"""

# Privacy: the shield, and the keyhole only you have the key to
ART["privacy"] = lambda h: f"""
<path d="M256 98L384 146V254C384 330 330 386 256 416C182 386 128 330 128 254V146Z" fill="url(#M)" {EDGE}/>
<path d="M256 128L356 166V254C356 314 314 360 256 386Z" fill="#fff" opacity=".12"/>
<circle cx="256" cy="236" r="34" fill="url(#D)"/><path d="M242 256H270L280 324H232Z" fill="url(#D)"/>
<path d="M162 168L256 132" stroke="#fff" stroke-opacity=".5" stroke-width="8" stroke-linecap="round"/>"""

# Be Not Afraid: wings, and the halo above them
ART["angels"] = lambda h: f"""
<ellipse cx="256" cy="134" rx="76" ry="22" fill="none" stroke="url(#G)" stroke-width="12"/><ellipse cx="256" cy="134" rx="76" ry="22" fill="none" stroke="#fff3c4" stroke-opacity=".5" stroke-width="3"/>
{''.join(f'<path d="M{256 + side * 18} 214C{256 + side * 70} {170 - k * 8} {256 + side * (150 - k * 6)} {184 + k * 30} {256 + side * (176 - k * 20)} {262 + k * 40}C{256 + side * (130 - k * 14)} {250 + k * 36} {256 + side * 70} {262 + k * 22} {256 + side * 18} {300 + k * 10}Z" fill="{"url(#P)" if k == 0 else ("url(#G)" if k == 1 else "url(#L)")}" opacity="{1 - k * .12}" {THIN}/>' for side in (-1, 1) for k in (2, 1, 0))}
<path d="M256 196C272 230 272 330 256 392C240 330 240 230 256 196Z" fill="#fff8e0" {THIN}/>"""

# The Nest Registry: the nest, an egg waiting in it, tied with a gift's ribbon
ART["nest"] = lambda h: f"""
<ellipse cx="256" cy="242" rx="58" ry="74" fill="url(#P)" {EDGE}/><ellipse cx="236" cy="214" rx="14" ry="22" fill="#fff" opacity=".7"/>
<path d="M256 150L204 118C190 110 178 120 182 136C186 152 206 158 256 150Z" fill="url(#R)" {THIN}/><path d="M256 150L308 118C322 110 334 120 330 136C326 152 306 158 256 150Z" fill="url(#R)" {THIN}/>
<path d="M248 154L226 196M264 154L286 196" stroke="url(#R)" stroke-width="10" stroke-linecap="round"/><circle cx="256" cy="150" r="13" fill="url(#R)" {THIN}/>
<path d="M104 280C112 362 176 400 256 400C336 400 400 362 408 280C360 310 152 310 104 280Z" fill="url(#M)" {EDGE}/>
<g fill="none" stroke="url(#D)" stroke-width="7" stroke-linecap="round" opacity=".8"><path d="M120 300C190 330 320 330 392 300"/><path d="M136 330C200 356 312 356 376 330"/><path d="M166 362C220 380 292 380 346 362"/><path d="M110 286L150 270M402 286L362 270M180 310L210 340M300 316L276 346"/></g>"""


SCALE = {"fix": .84, "skills": .88}  # drawn wide: kept inside a round launcher mask

if __name__ == "__main__":
    ids = sys.argv[1:] or sorted(ART)
    for i in ids:
        h = HUE_EXTRA.get(i, HUE.get(i))
        body = ART[i](h)
        if i in SCALE: body = f'<g transform="translate(256 256) scale({SCALE[i]}) translate(-256 -256)">{body}</g>'
        open(os.path.join(OUT, i + ".svg"), "w").write(frame(h, body))
    print("drew", len(ids))
