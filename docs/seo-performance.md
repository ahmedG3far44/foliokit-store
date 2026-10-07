# SEO and homepage performance

`npm run build` in `client` now generates homepage HTML using the same React
components as the browser. The heading, copy, navigation, and footer can paint
after CSS loads, without waiting for JavaScript, authentication, or the catalog
API. React hydrates that HTML; other routes still use the SPA fallback.

The server render is build-only: deploy `client/dist` as usual. Do not serve
`client/.prerender`. No Node server is needed to serve the homepage. Keep the
inline fallback script in the HTML if changing the deployment's CSP.

The sitemap currently lists the stable public pages. Published theme detail
pages are discovered through catalog links and have their own titles and
descriptions once data loads. Add published theme URLs to the sitemap when
expanding catalog SEO; exclude previews, account pages, and archived themes.

## After deployment

1. Confirm the raw response for `https://foliokit.store/` includes `hero-title`,
   the canonical URL, and JSON-LD. Check `/robots.txt` and `/sitemap.xml` return
   their actual files, rather than the SPA fallback.
2. Submit `https://foliokit.store/sitemap.xml` in Google Search Console. Inspect
   the homepage and request indexing. Review the queries and pages in the
   Performance report before choosing more targeted landing pages.
3. Run PageSpeed Insights on the deployed homepage for mobile and desktop.
   Compare LCP, FCP, CLS, and blocking time against the previous deployment.
   This change removes the homepage's JavaScript rendering dependency; it is
   not a measured production LCP score or a ranking guarantee.
4. Verify Nginx compresses HTML, CSS, JavaScript, SVG, and XML. Cache hashed
   `/assets/` files with `public, max-age=31536000, immutable`, but revalidate
   `index.html`, `robots.txt`, and `sitemap.xml` so new deployments appear.
5. Keep GA4's automatic history page-change tracking disabled. The existing
   React analytics integration sends one page view per route, using
   `VITE_GOOGLE_ANALYTICS_ID`; the duplicate hardcoded loader was removed.

Catalog data and authentication still require the API. A preview without the
API can verify the HTML, routing, and hydration, but cannot validate purchases
or live theme media. Cookiebot remains enabled; localhost is not an authorized
domain for the production consent banner.
