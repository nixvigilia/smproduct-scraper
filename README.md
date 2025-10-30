# SM Markets Product Scraper

A Node.js scraper for SM Markets category pages using Playwright. Automatically scrolls through infinite lists, saves progress incrementally to JSON, and can resume from where it left off if interrupted.

## Features

- ✅ **Incremental Saving**: Saves JSON file every 5 scroll iterations (no data loss if interrupted)
- ✅ **Resume Support**: Automatically resumes from existing JSON file if restarted
- ✅ **Deduplication**: Prevents duplicate products (based on URL)
- ✅ **Progress Tracking**: Real-time console logs showing scraped product count
- ✅ **Headful Mode**: Watch the scraper in action with visible browser
- ✅ **JSON + CSV**: Separate conversion script for CSV export
- ✅ **Metadata**: Tracks source URL, scrape timestamp, and total products

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install Playwright browsers:

```bash
npm run playwright:install
```

## Quick Start

**Scrape with default settings:**

```bash
npm run scrape:bonus
```

**Watch it scrape (headful mode):**

```bash
npm run scrape:headful
```

**Convert JSON to CSV:**

```bash
npm run convert
```

## Usage

### Scraping

**Basic usage:**

```bash
npm run scrape -- --url "https://smmarkets.ph/category.html" --out products.json
```

**With visible browser:**

```bash
npm run scrape -- --url "https://smmarkets.ph/category.html" --headful
```

**Options:**

- `--url` (required): SM Markets category URL to scrape
- `--out`: JSON output path (default: `products.json`)
- `--headful`: Run browser in visible mode (default: headless)
- `--timeout`: Navigation timeout in ms (default: `45000`)

### CSV Conversion

**Convert default JSON file:**

```bash
npm run convert
```

**Convert custom files:**

```bash
npm run convert -- --json products.json --csv output.csv
```

**Options:**

- `--json`: Path to JSON file (default: `products.json`)
- `--csv`: Path to CSV output (default: JSON filename with `.csv` extension)

## Available Scripts

- `npm run scrape` - Run scraper with custom URL
- `npm run scrape:bonus` - Scrape "Only in SM Markets" category (headless)
- `npm run scrape:headful` - Scrape with visible browser
- `npm run convert` - Convert JSON to CSV
- `npm run playwright:install` - Install Playwright browsers

## Output Format

### JSON Structure

```json
{
  "metadata": {
    "sourceUrl": "https://smmarkets.ph/...",
    "scrapedAt": "2024-01-15T10:30:00.000Z",
    "totalProducts": 1234,
    "lastSavedAt": "2024-01-15T10:35:00.000Z",
    "completed": true
  },
  "products": [
    {
      "name": "Product Name",
      "url": "https://smmarkets.ph/product.html",
      "uom": "1kg",
      "price": 125.0,
      "priceText": "₱125",
      "weightedPriceText": "",
      "image": "https://smmarkets.ph/image.png",
      "scrapedAt": "2024-01-15T10:30:00.000Z",
      "sourceUrl": "https://smmarkets.ph/..."
    }
  ]
}
```

### CSV Columns

- `name` - Product name
- `url` - Product detail URL
- `uom` - Unit of measure
- `price` - Parsed numeric price
- `priceText` - Raw price text (e.g., "₱125")
- `weightedPriceText` - Weighted price (e.g., "₱190/KG")
- `image` - Product image URL
- `scrapedAt` - ISO timestamp when scraped
- `sourceUrl` - Original category URL

## How It Works

1. **Loads the page** and waits for product grid to appear
2. **Scrolls incrementally** through the infinite scroll container
3. **Saves progress** every 5 scroll iterations (or when new products detected)
4. **Resumes automatically** if you restart - loads existing JSON and appends new products
5. **Deduplicates** products by URL to prevent duplicates
6. **Waits for stabilization** - stops when product count doesn't increase for 6 iterations

## Incremental Saving

The scraper saves JSON files incrementally during scraping:

- Saves every **5 scroll iterations**
- Saves when **new products are detected**
- Allows **resuming** if the scraper is interrupted
- **No duplicate products** (based on URL)

Example output:

```
✓ Saved 12 new products (total: 124) to products.json
Scrolling... Found 156 products so far (iteration 15)
✓ Saved 8 new products (total: 164) to products.json
```

## Resuming a Scrape

If the scraper stops (network error, manual stop, etc.), simply restart it:

```bash
npm run scrape:bonus
```

It will:

1. Load existing products from `products.json`
2. Continue scrolling from where it left off
3. Only add new products (no duplicates)
4. Update the JSON file incrementally

## Troubleshooting

**No products found:**

- Check if the URL is a valid category page
- Try running with `--headful` to see what's happening
- Increase `--timeout` if page loads slowly

**Scraper stops early:**

- Check console logs for error messages
- Verify the page structure hasn't changed
- Try `--headful` to watch the scrolling behavior

**Playwright browser not found:**

```bash
npm run playwright:install
```

## Notes

- Selectors are based on SM Markets HTML structure and may need updates if the site changes
- The scraper waits for network idle between scroll batches
- Large categories may take several minutes to fully scrape
- All scraped data includes timestamps for tracking

## License

Private project - for personal use only.
