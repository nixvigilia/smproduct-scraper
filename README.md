## SM Markets Scraper (Node.js)

Scrape product listings from SM Markets category pages using Playwright. It loads the page, scrolls to fetch items in infinite lists, and exports JSON (and optional CSV).

### Setup

1. Install dependencies:

```
npm install
```

2. Install Playwright browsers (first run may prompt automatically). If needed:

```
npx playwright install chromium
```

### Usage

```
npm run scrape -- --url "https://smmarkets.ph/sm-bonus.html" --out products.json --csv products.csv
```

Options:
- `--url` (required): SM Markets category URL
- `--out`: JSON output path (default: products.json)
- `--csv`: Optional CSV output path
- `--headful`: Show the browser
- `--timeout`: Navigation/wait timeout in ms (default: 45000)

### Output Fields

- `name`: Product name
- `url`: Product detail URL
- `uom`: Unit of measure
- `price`: Parsed numeric price (if available)
- `priceText`: Raw price text (e.g., "₱129.5")
- `weightedPriceText`: Raw weighted price text (e.g., "₱190/KG")
- `image`: Product image URL

### Notes

- Selectors are based on observed class names in SM Markets markup and may change.
- The script scrolls to attempt loading all products; adjust `maxScrolls`/`waitMs` if needed in `src/scrape-sm.js`.


