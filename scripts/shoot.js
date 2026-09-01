const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const files = process.argv.slice(2);
const outDir = path.join(__dirname, '..', 'assets', 'previews');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const file of files) {
    const abs = path.resolve(file);
    const name = path.basename(file, '.html');
    try {
      await page.goto('file://' + abs, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1200);
      const out = path.join(outDir, name + '.png');
      await page.screenshot({ path: out });
      console.log('OK', name);
    } catch (e) {
      console.log('FAIL', name, e.message.split('\n')[0]);
    }
  }
  await browser.close();
})();
