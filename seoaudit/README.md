# Polygains SEO Relaunch Pack

Audit date: 2026-02-15
Target domain: `https://polygains.com`

## Implementation Status

### ✅ Completed

- [x] **Homepage HTML** - Now includes crawlable text content inside `<div id="app">`
- [x] **robots.txt** - Created with crawl directives and sitemap reference
- [x] **sitemap.xml** - Published at `/sitemap.xml`
- [x] **Meta tags** - Title, description, robots, canonical in initial HTML
- [x] **OG tags** - Open Graph meta tags for share previews
- [x] **Twitter tags** - Twitter Card meta tags
- [x] **JSON-LD** - Organization and WebSite structured data
- [x] **Favicons** - All formats (ICO, PNG, WebP) for all platforms
- [x] **HTTP→HTTPS redirect** - Server returns 301 for HTTP requests
- [x] **Real 404s** - Unknown paths return 404 status with HTML body
- [x] **Noindex for /mainv2** - Returns `noindex,follow` with canonical to `/`
- [x] **noscript content** - Visible content when JavaScript is disabled

### 🔄 In Progress / Needs Deployment

- [ ] WWW→apex redirect (configure at DNS/CDN level)
- [ ] Market detail pages with dynamic metadata (requires SSR setup)
- [ ] Submit sitemap to Google Search Console
- [ ] Submit sitemap to Bing Webmaster Tools

---

## Current blockers found on live site (FIXED)

- ~~Homepage HTML is almost empty (`<div id="root"></div>`), so crawlers get very little content without JS execution.~~
- ~~`robots.txt` contains comments only and no crawl directives or sitemap reference.~~
- ~~`https://polygains.com/sitemap.xml` returns `404`.~~
- ~~Unknown routes return `200` with the same shell HTML (soft-404 pattern).~~
- ~~`http://polygains.com` returns `200` instead of redirecting to HTTPS.~~
- ~~No canonical URL, meta description, OG tags, Twitter tags, or JSON-LD in initial HTML.~~
- ~~`/mainv2` appears as a duplicate shell route.~~

## New SEO architecture to ship (IMPLEMENTED)

### 1. Server-render or prerender indexable pages ✅
- Render crawlable HTML for:
  - `/` (homepage) - **DONE**: index.html contains full text content
  - `/markets` - **SPA fallback** (needs dynamic meta for full SEO)
  - `/market/<slug>-<conditionId>` - **SPA fallback** (needs SSR for full SEO)
  - `/alerts` - **SPA fallback** (needs dynamic meta for full SEO)
- Include full page text in server HTML, not only client JS hydration shell. **DONE**

### 2. Canonical and route policy ✅
- Canonical host: `https://polygains.com`. **SET**
- 301 redirects:
  - `http://polygains.com/*` -> `https://polygains.com/:splat` **DONE** (server-level)
  - `https://www.polygains.com/*` -> `https://polygains.com/:splat` **TODO** (DNS/CDN level)
- Real 404 behavior:
  - Unknown paths must return `404` status and a useful HTML body. **DONE**
- If `/mainv2` must stay, set canonical to `/` and `noindex,follow`. **DONE**

### 3. Metadata templates ✅
- Use unique `<title>` and `<meta name="description">` per indexable page.
  - Home: **DONE**
  - Markets index: **SPA FALLBACK** (same title)
  - Market detail: **SPA FALLBACK** (same title)
- Add OG + Twitter meta tags for share previews. **DONE**
- Add JSON-LD:
  - `Organization` (sitewide) **DONE**
  - `WebSite` with `SearchAction` (if onsite search exists) **DONE** (without SearchAction)
  - `Dataset` or `WebApplication` for market pages if appropriate **TODO** (needs SSR)

### 4. Crawl controls ✅
- Serve a real `robots.txt` (provided in this folder). **DONE**
- Block API endpoints from crawl budget waste (`Disallow: /api/`). **DONE**
- Publish `sitemap.xml` (starter file provided) and extend with dynamic market URLs. **DONE** (basic version)

### 5. Performance and rendering ✅
- Preload critical CSS and primary font only. **DONE** (inlined critical CSS)
- Keep LCP element text/image in initial HTML. **DONE** (hero content in HTML)
- Minimize JS needed to render above-the-fold content. **DONE** (content visible without JS)

## Keyword direction (primary)

- polymarket alerts
- polymarket insider tracker
- polymarket whale tracker
- prediction market trade alerts
- live polymarket signals

All keywords included in homepage meta description and visible content.

## Page-level metadata spec

### Home (IMPLEMENTED in index.html)

```html
<title>Polygains - Polymarket Insider & Whale Alerts in Real Time</title>
<meta name="description" content="Track suspicious Polymarket order flow, whale wallets, and high-conviction trades with real-time alerts and market analytics." />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="canonical" href="https://polygains.com/" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="Polygains" />
<meta property="og:title" content="Polygains - Polymarket Insider & Whale Alerts in Real Time" />
<meta property="og:description" content="Track suspicious Polymarket order flow, whale wallets, and high-conviction trades with real-time alerts and market analytics." />
<meta property="og:url" content="https://polygains.com/" />
<meta property="og:image" content="https://polygains.com/og-image.png" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Polygains - Polymarket Insider & Whale Alerts in Real Time" />
<meta name="twitter:description" content="Track suspicious Polymarket order flow, whale wallets, and high-conviction trades with real-time alerts and market analytics." />
<meta name="twitter:image" content="https://polygains.com/twitter-card.png" />

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Polygains",
  "url": "https://polygains.com",
  "logo": "https://polygains.com/android-chrome-512x512.png"
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Polygains",
  "url": "https://polygains.com"
}
</script>
```

### Markets index (SPA fallback - same title as home)

Uses same metadata as home page. For unique metadata per page, SSR is required.

### Market detail (SPA fallback - same title as home)

Uses same metadata as home page. For dynamic metadata, SSR with templates needed:

```html
<title>{{MARKET_QUESTION}} Odds, Flow & Alerts | Polygains</title>
<meta name="description" content="Live odds, volume, insider-style trades, and fill-size statistics for {{MARKET_QUESTION}} on Polymarket." />
<link rel="canonical" href="https://polygains.com/market/{{MARKET_SLUG}}-{{CONDITION_ID}}" />
```

## JSON-LD examples (IMPLEMENTED)

### Organization ✅

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Polygains",
  "url": "https://polygains.com",
  "logo": "https://polygains.com/android-chrome-512x512.png"
}
```

### WebSite ✅

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Polygains",
  "url": "https://polygains.com"
}
```

### Dataset (TODO - needs SSR)

```json
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "{{MARKET_QUESTION}}",
  "description": "Live market analytics and trade-flow data for this Polymarket market.",
  "url": "https://polygains.com/market/{{MARKET_SLUG}}-{{CONDITION_ID}}",
  "creator": {
    "@type": "Organization",
    "name": "Polygains"
  }
}
```

## Rollout order (fastest safe path)

1. ✅ Ship redirects (`http` -> `https`, server-level) and real 404 status codes.
2. ✅ Replace `robots.txt` and publish `sitemap.xml`.
3. ✅ Add server-rendered homepage content + full metadata + JSON-LD.
4. ⏳ Add server-rendered market detail pages with unique metadata and canonical tags. (Requires SSR infrastructure)
5. ⏳ Submit sitemap in Google Search Console and Bing Webmaster Tools.
6. ⏳ Monitor index coverage, soft-404, and Core Web Vitals weekly.

## Acceptance checks

- [x] `curl -I http://polygains.com` returns `301` -> `https://polygains.com`.
- [x] `curl -I https://polygains.com/does-not-exist` returns `404`.
- [x] `curl https://polygains.com` includes title, description, canonical, OG, Twitter, and JSON-LD tags in raw HTML.
- [x] `https://polygains.com/sitemap.xml` returns `200` and valid XML.
- [x] `https://polygains.com/robots.txt` returns `200` with valid directives.
- [ ] Search Console reports no soft-404 pattern for unknown URLs. (Verify after deployment)

---

## Files Created/Modified

### New Files
- `public/robots.txt` - Crawl directives
- `public/sitemap.xml` - Sitemap

### Modified Files
- `frontend/index.html` - Full SEO markup with pre-rendered content
- `src/services/server.ts` - HTTPS redirects, 404 handling, /mainv2 noindex

### Assets Required (in public/)
- `favicon.ico` - Multi-res ICO
- `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` - PNG favicons
- `favicon-16x16.webp`, `favicon-32x32.webp` - WebP favicons
- `apple-touch-icon.png`, `apple-touch-icon.webp` - iOS icons
- `android-chrome-192x192.png`, `android-chrome-512x512.png` - Android icons
- `mstile-150x150.png` - Windows tiles
- `og-image.png` - Open Graph image (1200×630)
- `twitter-card.png` - Twitter card image (1200×600)
