# Retired 2026-11-03

Headshots with a Bird no longer takes orders. The site stays up as a free static page set on Vercel.

- `public/` is the whole site. `.vercelignore` deploys only that folder and `vercel.json`.
- `vercel.json` serves `/dogshow-sitemap.xml` and `/dollarbets-sitemap.xml` as rewrites to those sites' own sitemaps, replacing the proxies in `server.js`.
- The Node app (`server.js`, `lib/`) and `render.yaml` stay in the repo for reference and do not run.
- The removed homepage flow is in git history before this commit.
