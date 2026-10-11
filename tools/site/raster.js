// Rasterises the icon SVGs from build.py into the PNGs manifests and home screens use.
//   NODE_PATH=$(npm root -g) node tools/site/raster.js [ids…]
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const dir = path.join(__dirname, "../../assets/icons/v2");
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter((f) => f.endsWith(".svg") && !f.endsWith("-mask.svg")).map((f) => f.slice(0, -4));
  const shot = async (svgFile, size, out) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>` + fs.readFileSync(path.join(dir, svgFile), "utf8"));
    await p.screenshot({ path: path.join(dir, out), omitBackground: true });
  };
  for (const id of ids) {
    for (const s of [512, 192, 180, 48]) await shot(id + ".svg", s, `${id}-${s}.png`);
    await shot(id + "-mask.svg", 512, `${id}-maskable.png`);
  }
  await b.close(); console.log("rasterised", ids.length);
})();
