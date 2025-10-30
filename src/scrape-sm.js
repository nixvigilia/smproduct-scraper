#!/usr/bin/env node
import {chromium} from "@playwright/test";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";

const argv = yargs(hideBin(process.argv))
  .usage(
    "Usage: $0 --url <categoryUrl> [--out products.json] [--headful] [--timeout 30000]"
  )
  .option("url", {
    type: "string",
    demandOption: true,
    describe: "SM Markets category URL to scrape",
  })
  .option("out", {
    type: "string",
    default: "products.json",
    describe: "Path to write JSON output",
  })
  .option("headful", {
    type: "boolean",
    default: false,
    describe: "Run browser headful (visible)",
  })
  .option("timeout", {
    type: "number",
    default: 45000,
    describe: "Navigation timeout in ms",
  })
  .help().argv;

function sanitizeText(value) {
  if (!value) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

async function autoScroll(
  page,
  {maxScrolls = 40, waitMs = 600, containerSelector}
) {
  const hasContainer = containerSelector
    ? await page.$(containerSelector)
    : null;
  if (hasContainer) {
    for (let i = 0; i < maxScrolls; i++) {
      await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return;

        // Get current scroll position
        const currentScroll = el.scrollTop;
        const clientHeight = el.clientHeight;
        const scrollHeight = el.scrollHeight;

        // Scroll the container itself
        const newScroll = Math.min(
          currentScroll + clientHeight * 0.8,
          scrollHeight
        );
        el.scrollTop = newScroll;

        // Dispatch scroll event to trigger any listeners
        el.dispatchEvent(new Event("scroll", {bubbles: true}));

        // Also scroll window as fallback
        const windowScroll = window.scrollY;
        window.scrollTo(0, windowScroll + window.innerHeight * 0.8);
        window.dispatchEvent(new Event("scroll", {bubbles: true}));

        // Try scrolling the last product into view (triggers IntersectionObserver)
        const gallery = document.querySelector('[data-role="gallery-items"]');
        if (gallery) {
          const products = gallery.querySelectorAll(".category-root-2k1");
          const lastProduct = products[products.length - 1];
          if (lastProduct && typeof lastProduct.scrollIntoView === "function") {
            lastProduct.scrollIntoView({behavior: "auto", block: "end"});
          }
        }
      }, containerSelector);
      await page.waitForTimeout(waitMs);
    }
    return;
  }
  let previousHeight = 0;
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      window.dispatchEvent(new Event("scroll", {bubbles: true}));
    });
    await page.waitForTimeout(waitMs);
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
  }
}

async function dismissOverlays(page) {
  // Try to close common consent/quickview modals if present
  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("OK")',
    'button:has-text("Got it")',
    'aside[id^="quickviewPopup"] button',
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      try {
        await btn.click({timeout: 1000});
      } catch {}
    }
  }
}

async function getProductCount(page) {
  return await page
    .$$eval(
      '[data-role="gallery-items"] .category-root-2k1',
      (els) => els.length
    )
    .catch(() => 0);
}

async function loadAllProducts(
  page,
  {isHeadful = false, jsonPath, sourceUrl, saveInterval = 5}
) {
  let previousCount = -1;
  let stableIterations = 0;
  const maxStable = 6;
  const waitMs = isHeadful ? 800 : 600; // Slower scrolling in headful mode for visibility

  console.log("Starting to load products by scrolling...");
  const initialCount = await getProductCount(page);
  console.log(`Initial product count: ${initialCount}`);

  // Check for existing products from previous run
  const existing = loadExistingProducts(jsonPath);
  if (existing.length > 0) {
    console.log(
      `Found ${existing.length} existing products in ${jsonPath} - will resume and append`
    );
  }

  for (let i = 0; i < 500; i++) {
    // Scroll multiple times in sequence to ensure content loads
    await autoScroll(page, {
      maxScrolls: 5,
      waitMs: waitMs,
      containerSelector: ".infinite-scroll-component",
    });

    // Wait a bit longer for network requests
    await page.waitForTimeout(waitMs * 0.5);

    // Wait for count to change (new items appended)
    const before = await getProductCount(page);

    // Wait up to 5 seconds for new content to appear
    await page
      .waitForFunction(
        (sel, prev) => {
          const root = document.querySelector('[data-role="gallery-items"]');
          const count = root
            ? root.querySelectorAll(".category-root-2k1").length
            : 0;
          return count > prev;
        },
        {timeout: 5000},
        '[data-role="gallery-items"]',
        before
      )
      .catch(() => {});

    // Allow any pending network activity to settle
    await page.waitForLoadState("networkidle").catch(() => {});

    const currentCount = await getProductCount(page);

    // Save incrementally every N iterations or when count increases
    if (jsonPath && (i % saveInterval === 0 || currentCount > previousCount)) {
      const products = await scrapeCategory(page);
      await saveProductsIncremental(products, {
        jsonPath,
        sourceUrl,
        lastSavedCount: previousCount,
      });
    }

    // Log progress every time count increases or every 5 iterations
    if (currentCount > previousCount || i % 5 === 0) {
      console.log(
        `Scrolling... Found ${currentCount} products so far (iteration ${
          i + 1
        })`
      );
    }

    if (currentCount <= previousCount) {
      stableIterations++;
      if (stableIterations >= maxStable) {
        console.log(
          `Stopped scrolling: product count stabilized at ${currentCount} (no change for ${stableIterations} iterations)`
        );
        break;
      }
    } else {
      stableIterations = 0; // Reset counter when we see new products
    }
    previousCount = currentCount;
  }
  const finalCount = await getProductCount(page);
  console.log(`Finished loading. Total products found: ${finalCount}`);
}

async function scrapeCategory(page) {
  // Selectors from the provided HTML sample
  const itemSelector = '[data-role="gallery-items"] .category-root-2k1';
  const nameSelector = "a.item-name-23v span";
  const urlSelector = "a.item-name-23v";
  const uomSelector = ".item-productInfo-1X5 .item-uom-12l";
  const priceSelector = ".item-price-xqn";
  const weightedPriceSelector = ".item-weightedPrice-1Ys";
  const imageSelector = ".item-imageContainer-2mg img.image-loaded-ktU";

  return await page.$$eval(
    itemSelector,
    (cards, sel) => {
      function getText(el, selector) {
        const node = el.querySelector(selector);
        return node ? node.textContent : "";
      }
      function getHref(el, selector) {
        const node = el.querySelector(selector);
        return node ? node.getAttribute("href") : "";
      }
      function getImg(el, selector) {
        const node = el.querySelector(selector);
        return node ? node.getAttribute("src") || "" : "";
      }
      return cards.map((card) => {
        const name = getText(card, sel.nameSelector);
        const url = getHref(card, sel.urlSelector);
        const uom = getText(card, sel.uomSelector);
        const priceText = getText(card, sel.priceSelector);
        const weightedText = getText(card, sel.weightedPriceSelector);
        const image = getImg(card, sel.imageSelector);
        return {
          name: name ? name.replace(/\s+/g, " ").trim() : "",
          url,
          uom: uom ? uom.replace(/\s+/g, " ").trim() : "",
          priceText: priceText ? priceText.replace(/\s+/g, " ").trim() : "",
          weightedPriceText: weightedText
            ? weightedText.replace(/\s+/g, " ").trim()
            : "",
          image,
        };
      });
    },
    {
      itemSelector,
      nameSelector,
      urlSelector,
      uomSelector,
      priceSelector,
      weightedPriceSelector,
      imageSelector,
    }
  );
}

function loadExistingProducts(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    return data.products || [];
  } catch (err) {
    console.log(`Warning: Could not load existing JSON, starting fresh.`);
    return [];
  }
}

function normalizeProduct(p, sourceUrl, scrapeTimestamp) {
  return {
    name: sanitizeText(p.name),
    url: p.url,
    uom: sanitizeText(p.uom),
    price: parsePrice(p.priceText),
    priceText: sanitizeText(p.priceText),
    weightedPriceText: sanitizeText(p.weightedPriceText),
    image: p.image,
    scrapedAt: scrapeTimestamp || new Date().toISOString(),
    sourceUrl: sourceUrl,
  };
}

async function saveProductsIncremental(
  products,
  {jsonPath, sourceUrl, lastSavedCount}
) {
  const scrapeTimestamp = new Date().toISOString();

  const normalized = products
    .filter((p) => p.name && p.url)
    .map((p) => normalizeProduct(p, sourceUrl, scrapeTimestamp));

  // Load existing to merge
  const existing = loadExistingProducts(jsonPath);
  const existingUrls = new Set(existing.map((p) => p.url));

  // Only add new products (avoid duplicates)
  const newProducts = normalized.filter((p) => !existingUrls.has(p.url));
  const allProducts = [...existing, ...newProducts];

  const outputData = {
    metadata: {
      sourceUrl: sourceUrl,
      scrapedAt: scrapeTimestamp,
      totalProducts: allProducts.length,
      lastSavedAt: scrapeTimestamp,
    },
    products: allProducts,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(outputData, null, 2), "utf8");

  const addedCount = newProducts.length;
  if (addedCount > 0) {
    console.log(
      `✓ Saved ${addedCount} new products (total: ${allProducts.length}) to ${jsonPath}`
    );
  }

  return allProducts.length;
}

async function writeFinalOutput(products, {jsonPath, sourceUrl}) {
  const scrapeTimestamp = new Date().toISOString();

  const normalized = products
    .filter((p) => p.name && p.url)
    .map((p) => normalizeProduct(p, sourceUrl, scrapeTimestamp));

  const outputData = {
    metadata: {
      sourceUrl: sourceUrl,
      scrapedAt: scrapeTimestamp,
      totalProducts: normalized.length,
      completed: true,
    },
    products: normalized,
  };

  console.log(`Writing final ${normalized.length} products to ${jsonPath}...`);
  fs.writeFileSync(jsonPath, JSON.stringify(outputData, null, 2), "utf8");
  console.log(`✓ Final JSON file saved: ${jsonPath}`);

  return normalized.length;
}

async function main() {
  console.log("=".repeat(60));
  console.log("SM Markets Product Scraper");
  console.log("=".repeat(60));
  console.log(`Target URL: ${argv.url}`);
  console.log(`Mode: ${argv.headful ? "Headful (visible)" : "Headless"}`);
  console.log(`Timeout: ${argv.timeout}ms`);
  console.log("");

  console.log("Launching browser...");
  const browser = await chromium.launch({headless: !argv.headful});
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    locale: "en-PH",
    timezoneId: "Asia/Manila",
    viewport: {width: 1366, height: 900},
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(argv.timeout);
  console.log("✓ Browser launched");

  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    // Keep images to allow intersection/lazy-load triggers
    if (type === "media" || type === "font") return route.abort();
    return route.continue();
  });

  console.log(`Navigating to ${argv.url}...`);
  await page.goto(argv.url, {waitUntil: "domcontentloaded"});
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log("✓ Page loaded");

  console.log("Dismissing any overlays/popups...");
  await dismissOverlays(page);
  console.log("✓ Overlays dismissed");

  // Wait for at least one product grid item to appear
  console.log("Waiting for product grid to appear...");
  await page
    .waitForSelector(
      "[data-role=gallery-items], .category-items-2Qm, .category-root-2k1",
      {
        timeout: argv.timeout,
      }
    )
    .catch(() => {});
  console.log("✓ Product grid detected");

  const jsonPath = path.resolve(argv.out);
  console.log(`Output JSON: ${jsonPath}`);

  // Attempt to load all items by scrolling until count stabilizes (saves incrementally)
  await loadAllProducts(page, {
    isHeadful: argv.headful,
    jsonPath: jsonPath,
    sourceUrl: argv.url,
    saveInterval: 5, // Save every 5 scroll iterations
  });

  console.log("");
  console.log("Extracting final product data...");
  const products = await scrapeCategory(page);
  console.log(`✓ Extracted ${products.length} product(s)`);

  // Write final consolidated output
  const count = await writeFinalOutput(products, {
    jsonPath,
    sourceUrl: argv.url,
  });

  console.log("");
  console.log("=".repeat(60));
  console.log(`✓ Scraping complete! Found ${count} products`);
  console.log(`✓ JSON saved to: ${jsonPath}`);
  console.log(`  Run 'npm run convert' to generate CSV from JSON`);
  console.log("=".repeat(60));

  // Keep browser open briefly in headful mode so user can see final result
  if (argv.headful) {
    console.log("Keeping browser open for 3 seconds...");
    await page.waitForTimeout(3000);
  }

  console.log("Closing browser...");
  await browser.close();
  console.log("✓ Browser closed");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
