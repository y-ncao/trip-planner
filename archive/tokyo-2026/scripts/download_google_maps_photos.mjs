import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

const inputPath = process.argv[2] || "/private/tmp/tokyo_itinerary_image_targets.json";
const outDir = path.resolve(repoRoot, process.argv[3] || "assets/itinerary-photos");
const resultPrefix = process.env.RESULT_PREFIX || "_download";
const limit = Number(process.env.LIMIT || "0");
const start = Number(process.env.START || "0");

function slugify(input) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "place";
}

function extFromContentType(contentType) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
}

function cleanGoogleImageUrl(url) {
  if (!url.includes("googleusercontent.com")) return url;
  return url.replace(/=w\d+-h\d+[^&]*/i, "=w1600-h1200-k-no");
}

function scoreImage(candidate) {
  const area = (candidate.width || 0) * (candidate.height || 0);
  const sizeScore = Math.min(candidate.bytes || 0, 2_000_000) / 1000;
  const displayedScore = candidate.displayed ? 250 : 0;
  const googleScore = candidate.url.includes("googleusercontent.com") ? 500 : 0;
  const badPenalty =
    /streetviewpixels|maps\/vt|khms|marker|transparent|sprite|logo|gen_204/i.test(candidate.url) ? 5000 : 0;
  return area / 1000 + sizeScore + displayedScore + googleScore - badPenalty;
}

async function acceptCookies(page) {
  const labels = ["Accept all", "I agree", "同意全部", "全部接受"];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label });
    if (await button.count().catch(() => 0)) {
      await button.first().click().catch(() => {});
      await page.waitForTimeout(700);
      return;
    }
  }
}

async function collectDisplayedImages(page) {
  return await page.evaluate(() => {
    return Array.from(document.images)
      .map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          url: img.currentSrc || img.src,
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0,
          displayed: rect.width > 120 && rect.height > 90,
          rectWidth: Math.round(rect.width),
          rectHeight: Math.round(rect.height),
        };
      })
      .filter((img) => img.url && img.width >= 120 && img.height >= 90);
  });
}

async function clickLikelyPhoto(page) {
  const selectors = [
    'button[aria-label*="Photo"]',
    'button[aria-label*="照片"]',
    'button[aria-label*="圖片"]',
    'button[jsaction*="pane.placePhotos"]',
    'img[src*="googleusercontent.com"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      await locator.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    }
  }
  return false;
}

async function downloadCandidate(context, candidate, fileBase) {
  const url = cleanGoogleImageUrl(candidate.url);
  const response = await context.request.get(url, {
    headers: {
      referer: "https://www.google.com/maps",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
    timeout: 30000,
  });
  if (!response.ok()) {
    throw new Error(`download failed ${response.status()} ${url.slice(0, 120)}`);
  }
  const contentType = response.headers()["content-type"] || "";
  const ext = extFromContentType(contentType);
  const body = await response.body();
  if (body.length < 20_000) {
    throw new Error(`download too small ${body.length} ${url.slice(0, 120)}`);
  }
  const outPath = path.join(outDir, `${fileBase}${ext}`);
  await fs.writeFile(outPath, body);
  return { outPath, bytes: body.length, url };
}

async function runOne(browser, target, index) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: "en-US",
  });
  const page = await context.newPage();
  const networkImages = [];
  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.startsWith("image/")) return;
    if (!/googleusercontent\.com|gstatic\.com/i.test(url)) return;
    try {
      const headers = response.headers();
      const len = Number(headers["content-length"] || "0");
      networkImages.push({
        url,
        width: 0,
        height: 0,
        bytes: len,
        displayed: false,
      });
    } catch {
      // Ignore ephemeral response failures.
    }
  });

  const query = target.query || target.place;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await acceptCookies(page);
  await page.waitForTimeout(2600);
  await clickLikelyPhoto(page);
  await page.waitForTimeout(1800);
  const displayed = await collectDisplayedImages(page);

  const all = [...displayed, ...networkImages]
    .filter((img) => /googleusercontent\.com/i.test(img.url))
    .filter((img, i, arr) => arr.findIndex((other) => other.url === img.url) === i)
    .sort((a, b) => scoreImage(b) - scoreImage(a));

  if (!all.length) {
    await page.screenshot({
      path: path.join(outDir, `_debug-${String(index + 1).padStart(3, "0")}.png`),
      fullPage: true,
    });
    await context.close();
    throw new Error(`no usable image candidates for ${query}`);
  }

  const fileBase = target.outputBase || `${String(index + 1).padStart(3, "0")}-${slugify(query)}`;
  let lastError;
  for (const candidate of all.slice(0, 8)) {
    try {
      const downloaded = await downloadCandidate(context, candidate, fileBase);
      await context.close();
      return {
        ...target,
        query,
        downloaded: path.relative(repoRoot, downloaded.outPath),
        bytes: downloaded.bytes,
        sourceUrl: downloaded.url,
        candidate: {
          width: candidate.width,
          height: candidate.height,
          displayed: candidate.displayed,
          rectWidth: candidate.rectWidth,
          rectHeight: candidate.rectHeight,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }
  await context.close();
  throw lastError || new Error(`failed downloading candidates for ${query}`);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const rawTargets = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const targets = rawTargets.slice(start, limit ? start + limit : undefined);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const globalIndex = start + i;
    process.stdout.write(`[${globalIndex + 1}/${rawTargets.length}] ${target.query || target.place} ... `);
    try {
      const result = await runOne(browser, target, globalIndex);
      results.push(result);
      process.stdout.write(`${result.downloaded} (${Math.round(result.bytes / 1024)} KB)\n`);
    } catch (error) {
      failures.push({ ...target, error: error.message });
      process.stdout.write(`FAILED: ${error.message}\n`);
    }
  }
  await browser.close();
  await fs.writeFile(path.join(outDir, `${resultPrefix}-results.json`), JSON.stringify(results, null, 2));
  await fs.writeFile(path.join(outDir, `${resultPrefix}-failures.json`), JSON.stringify(failures, null, 2));
  if (failures.length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
