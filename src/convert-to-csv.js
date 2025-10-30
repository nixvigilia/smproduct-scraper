#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {createObjectCsvWriter} from "csv-writer";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";

const argv = yargs(hideBin(process.argv))
  .usage("Usage: $0 [--json products.json] [--csv products.csv]")
  .option("json", {
    type: "string",
    default: "products.json",
    describe: "Path to JSON file to convert",
  })
  .option("csv", {
    type: "string",
    describe: "Path to CSV output file (defaults to JSON filename with .csv extension)",
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

async function convertJsonToCsv(jsonPath, csvPath) {
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: JSON file not found: ${jsonPath}`);
    process.exit(1);
  }

  console.log(`Reading JSON file: ${jsonPath}`);
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const products = jsonData.products || [];
  if (products.length === 0) {
    console.error("Error: No products found in JSON file");
    process.exit(1);
  }

  console.log(`Found ${products.length} products`);
  console.log(`Converting to CSV...`);

  const normalized = products.map((p) => ({
    name: sanitizeText(p.name),
    url: p.url || "",
    uom: sanitizeText(p.uom),
    price: p.price !== undefined ? p.price : parsePrice(p.priceText),
    priceText: sanitizeText(p.priceText || ""),
    weightedPriceText: sanitizeText(p.weightedPriceText || ""),
    image: p.image || "",
    scrapedAt: p.scrapedAt || "",
    sourceUrl: p.sourceUrl || jsonData.metadata?.sourceUrl || "",
  }));

  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      {id: "name", title: "name"},
      {id: "url", title: "url"},
      {id: "uom", title: "uom"},
      {id: "price", title: "price"},
      {id: "priceText", title: "priceText"},
      {id: "weightedPriceText", title: "weightedPriceText"},
      {id: "image", title: "image"},
      {id: "scrapedAt", title: "scrapedAt"},
      {id: "sourceUrl", title: "sourceUrl"},
    ],
  });

  await csvWriter.writeRecords(normalized);
  console.log(`✓ CSV file saved: ${csvPath}`);
  console.log(`  Total rows: ${normalized.length}`);
}

async function main() {
  const jsonPath = path.resolve(argv.json);
  const csvPath = argv.csv
    ? path.resolve(argv.csv)
    : jsonPath.replace(/\.json$/, ".csv");

  console.log("=".repeat(60));
  console.log("JSON to CSV Converter");
  console.log("=".repeat(60));
  console.log(`Input JSON: ${jsonPath}`);
  console.log(`Output CSV: ${csvPath}`);
  console.log("");

  await convertJsonToCsv(jsonPath, csvPath);

  console.log("");
  console.log("=".repeat(60));
  console.log("✓ Conversion complete!");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

