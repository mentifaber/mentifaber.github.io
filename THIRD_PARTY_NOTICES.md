# Third-party notices

Mentifaber's own work is covered by `LICENSE`. The components below belong to others and are used under their own
licences or terms, which still apply. The public credits are at mentifaber.org/credits.

## Libraries (loaded from public CDNs unless noted)

| Component | Version | Licence | Used in |
|---|---|---|---|
| Leaflet | 1.9.4 | BSD-2-Clause | maps (Vigil, Unlit, Per Capita, Overhead…) |
| three.js | 0.169.0 | MIT | 3D scenes (Atlas, globe views) |
| GSAP (GreenSock) | 3.12.5 | GreenSock Standard "No Charge" License | scroll animation (Atlas Classic) |
| PDF.js | 3.11.174 | Apache-2.0 | DocCrawler |
| Mammoth | 1.6.0 | BSD-2-Clause | DocCrawler (.docx) |
| Tesseract.js | 5.0.4 | Apache-2.0 | text recognition (Worm Eater) |
| Pyodide | 0.26.4 | MPL-2.0 | Python in Genesis's runner |
| satellite.js | 5.0.0 | MIT (bundled: `assets/orbit/satellite.min.js`, notice kept in the file) | Overhead |
| Font Awesome Free | 6.5.0 | icons CC BY 4.0, fonts SIL OFL 1.1, code MIT | icons |
| llama.cpp | — | MIT | MENTIFABER AGENT container |

## Fonts

- Self-hosted: Literata, Schibsted Grotesk, Martian Mono, Azeret Mono: SIL Open Font License 1.1.
- From Google Fonts: Bricolage Grotesque, Bungee, Cinzel, Cormorant Garamond, DM Mono, EB Garamond, IBM Plex Mono,
  JetBrains Mono, Newsreader, Nunito, Orbitron, Playfair Display, Plus Jakarta Sans, Rajdhani, Share Tech Mono,
  Space Grotesk, Syncopate, Unbounded: SIL Open Font License 1.1 or Apache-2.0, as published by Google Fonts.
- Mentifaber Display and Hive Strata are original typefaces drawn by our own scripts (covered by `LICENSE`).

## Maps

- Map data © OpenStreetMap contributors (ODbL 1.0); basemap tiles © CARTO; satellite imagery © Esri (World Imagery);
  land shapes from Natural Earth (public domain); radar from RainViewer.

## Data

| Source | Terms | Notes |
|---|---|---|
| NOAA SWPC, NWS (api.weather.gov), USGS earthquakes and volcanoes, NASA | U.S. government work, public domain | credited as sources |
| Open-Meteo (weather, geocoding) | data CC BY 4.0; free API for non-commercial use | attribution required; commercial use needs their paid plan |
| GDELT Project | free to use with citation | Vigil, Genesis's world record |
| CelesTrak | free, with attribution | Overhead |
| The Space Devs (Launch Library 2) | free tier, with attribution | launches |
| Where the ISS at? | free API | ISS position |
| GDACS (European Commission JRC) | with attribution | disaster alerts |
| adsb.lol | ODbL 1.0 | aircraft positions |
| adsb.fi | open data, terms on adsb.fi | aircraft positions |
| OpenSky Network | non-commercial research and personal use; commercial use needs their licence | aircraft positions |
| Planespotters.net | photos © their photographers, shown with credit and link | aircraft photos |
| CoinGecko | free API with attribution ("Data provided by CoinGecko") | prices |
| Coinbase, Yahoo Finance | their terms of service | prices |
| Frankfurter | open (European Central Bank rates) | currency |
| Open Food Facts, Open Beauty Facts | database ODbL 1.0, images CC BY-SA | Worm Eater |
| Wikipedia | text CC BY-SA 4.0 | excerpts, with links |
| arXiv | metadata CC0; papers under their own licences | Genesis knowledge |
| OpenAlex | CC0 | Genesis knowledge |
| Hugging Face Hub | each dataset and model under its own licence, shown on its page | Genesis knowledge |

## AI models and services

- Cloudflare Workers AI, used under Cloudflare's terms, plus each model's own licence:
  - Llama 3.1, 3.2, 3.3 and 4 (Meta): Llama Community License and Acceptable Use Policy. **Built with Llama.**
  - Gemma and SEA-LION (Gemma-based): Gemma Terms of Use and Prohibited Use Policy.
  - Qwen (Qwen3, Qwen2.5 Coder, QwQ): Apache-2.0 / Qwen licence. Mistral 7B and Small 3.1: Apache-2.0.
  - GPT-OSS 20B and 120B: Apache-2.0. DeepSeek R1 Distill Qwen 32B: MIT. Granite 4.0: Apache-2.0.
  - FLUX.1 [schnell]: Apache-2.0. Whisper: MIT. MeloTTS: MIT. BGE: MIT. LLaVA 1.5: Llama 2 Community License.
    Hermes 2 Pro: Apache-2.0. Deepgram Aura and Flux: Deepgram, via Cloudflare.
- MENTIFABER AGENT runs Qwen3 8B / 14B (Apache-2.0) in llama.cpp.
- Optional providers the owner adds keys for (OpenAI, Anthropic, Google Gemini, Groq, Mistral, OpenRouter,
  Hugging Face, ElevenLabs, Tavily, Brave, Serper, Exa and others) are used under each provider's own terms and
  usage policies.

If you believe something here is missing or wrongly credited, write to anders@mentifaber.org.
