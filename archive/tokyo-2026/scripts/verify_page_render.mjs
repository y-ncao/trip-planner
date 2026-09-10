import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const repoRoot = path.resolve(import.meta.dirname, "..");
const url = pathToFileURL(path.join(repoRoot, "index.html")).toString();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.goto(url, { waitUntil: "load" });

const result = await page.evaluate(() => {
  const brokenImages = Array.from(document.images)
    .filter((img) => img.getAttribute("src"))
    .filter((img) => img.naturalWidth === 0 || img.naturalHeight === 0)
    .map((img) => img.getAttribute("src"));

  const overflowingCells = Array.from(document.querySelectorAll(".itinerary-table-wrap td"))
    .filter((td) => td.scrollWidth > td.clientWidth + 2 || td.scrollHeight > td.clientHeight + 2)
    .map((td) => ({
      text: td.innerText.replace(/\s+/g, " ").trim().slice(0, 90),
      scrollWidth: td.scrollWidth,
      clientWidth: td.clientWidth,
      scrollHeight: td.scrollHeight,
      clientHeight: td.clientHeight,
    }));

  return {
    images: document.images.length,
    brokenImages,
    overflowingCells,
  };
});

await browser.close();

console.log(JSON.stringify(result, null, 2));
if (result.brokenImages.length || result.overflowingCells.length) {
  process.exit(1);
}
