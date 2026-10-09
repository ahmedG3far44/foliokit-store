# Theme categories

Admins manage category names, URL slugs, descriptions, image uploads or public HTTPS image URLs, and display order at `/dashboard/categories`. Categories with assigned themes cannot be deleted until those themes are reassigned.

New themes require a category selected from the dropdown in the theme editor. Existing uncategorized themes remain visible in the main catalog; select a category when editing them.

The homepage displays category cards before featured themes. Cards open `/themes/<category-slug>` with the existing catalog search, stack filters, sorting, and pagination scoped to that category. Theme detail URLs continue to work, and category/theme URL slug collisions are rejected.

Run `npm run seed` from `server/` to create the four requested categories: Creatives, Agencies, Developer's (`developers`), and E-commerce. The seed is repeatable, preserves existing categories, and assigns the six demo themes to categories only when they do not already have a category. Seed images are generated PNGs stored in R2, so the category cards do not depend on a remote placeholder service. Old seeded category placeholders are migrated on the next seed run; admin images are preserved.

The existing seed command also provisions the configured admin and demo theme assets; use the environment intended for seeding. New demo themes remain drafts. Each gets two gallery PNGs, a separate preview PNG, one 12-second H.264 MP4 explaining template setup, and a ZIP containing a working responsive static HTML/CSS starter (`index.html`, `styles.css`, `README.md`). The starter demonstrates the catalog; it is not the advertised React/Next.js/Astro implementation. Replace it with the full production theme before selling.

R2 must be configured for the seed command. Files are uploaded before being marked ready, and a failed upload stops the seed rather than creating incomplete records. Rerunning upgrades earlier seeded images and fills missing previews/tutorials/ZIPs while retaining custom assets and theme publishing status.
