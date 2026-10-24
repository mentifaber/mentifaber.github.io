// Loads src/store.js under Node: the Worker imports android/apps.json directly (wrangler bundles it), Node wants it read.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const REPO = new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), OUT = new URL("./src/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "store.js", readFileSync(REPO + "/src/store.js", "utf8").replace(/^import SHELF from "\.\.\/android\/apps\.json";$/m, 'const SHELF = ' + readFileSync(REPO + "/android/apps.json", "utf8").trim() + ";"));
export const S = await import(OUT + "store.js"); export const SHELF = JSON.parse(readFileSync(REPO + "/android/apps.json", "utf8")); export { REPO };
