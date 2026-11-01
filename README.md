# Neon Reels

A free, dependency-free slot machine that runs entirely in the browser — and a worked example of
shipping a static game page that is simultaneously search-engine and generative-engine optimised.

**Live:** https://vip-4.github.io/free-neon-reels/

## Mirrors

The source is hosted on three platforms with identical history. Only one origin is the canonical
website — the rest are code mirrors, so search engines never see duplicate pages.

| Platform | Repository | Serves the site? |
|---|---|---|
| GitHub | https://github.com/vip-4/free-neon-reels | **Yes** — canonical origin via GitHub Pages |
| Gitee | https://gitee.com/vip882/free-neon-reels | No — source mirror only |
| AtomGit | https://atomgit.com/zzw1208/free-neon-reels | No — source mirror only |

Neither Gitee nor AtomGit exposes a usable static-hosting service for this account, so the mirrors
deliberately do not serve the page. If a mirror ever does start serving it, it must carry a
`rel="canonical"` pointing at the GitHub Pages origin.

A Cloudflare Workers deployment (R2 + edge worker, stricter security headers) exists as a second
live origin at `https://neon-reels.1911717517.workers.dev/`; its HTML canonicalises to the GitHub
Pages origin, so the two never compete in search results.

## What it is

- 3 reels × 3 rows, 5 fixed paylines, plus a diamond scatter
- Theoretical RTP **91.36%** (line wins 88.17% + scatter 3.19%), house edge 8.64%
- 1,000 starting virtual credits, unlimited free top-ups — no real money, no cash value
- Zero dependencies: no framework, no web font, no analytics, no third-party request
- ~62 KB uncompressed / ~17.5 KB gzipped for the whole page
- Keyboard operable, screen-reader narrated, honours `prefers-reduced-motion`
- State lives in `localStorage` only; nothing leaves the device

## Files

```
index.html            Semantic page, meta tags, 4 JSON-LD blocks, the game markup
404.html              Self-contained error page (no external assets by design)
llms.txt              Machine-readable summary for generative engines
robots.txt            Crawl policy, explicitly welcomes AI crawlers
sitemap.xml           Single-URL sitemap
site.webmanifest      PWA metadata
favicon.svg           Scalable icon
assets/styles.css     The only stylesheet
assets/game.js        The only script — RNG, payline evaluation, rendering
img/og-cover.png      1200×630 social card
img/apple-touch-icon.png
```

## Run locally

Any static file server works; the page has no build step.

```bash
python -m http.server 8000
# then open http://127.0.0.1:8000/
```

## How the maths works

Each symbol is drawn from a weighted pool totalling 100 units, independently per cell. Three matching
symbols on one payline therefore have probability `(weight / 100)³`. Summing that probability times the
symbol's multiplier across all six symbols gives the expected return of a single payline: **17.634%**.
Five paylines return `5 × 17.634% = 88.17%`. The diamond scatter adds **3.19%** (2× on 1.25% of spins,
5× on 0.12%, and progressively rarer higher tiers). Total: **91.36%**.

Every probability printed on the page is that exact figure — not a simulation estimate.

## SEO / GEO notes

- One `<h1>`; heading order follows document structure; landmarks (`header` / `main` / `footer` / `nav`) are explicit
- `title` 58 chars, `description` 158 chars, canonical, Open Graph and Twitter Card all present
- JSON-LD: `WebSite`, `VideoGame`, `FAQPage`, `BreadcrumbList` — the FAQ answers are textually identical to the visible copy
- `robots.txt` explicitly allows `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `CCBot`
- `llms.txt` gives summarisers a condensed, quotable fact set and warns against misreading RTP
- Answers are placed before elaboration (a "Quick answer" block under the `<h1>`), which is what extraction systems reward

## Licence

MIT for the source code. All art is CSS and emoji — no third-party assets.
