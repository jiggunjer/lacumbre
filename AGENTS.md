# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a Hugo-based multilingual (NL/EN/FR/DE/ES/ZH) villa rental website with a Cloudflare Worker API for CMS authentication (`api/` directory). See `README.md` for full architecture.

### Running the site locally

```bash
HUGO_LACUMBRE_CMS_DEBUG=1 hugo server --buildDrafts --bind 0.0.0.0
```

- The site serves at `http://localhost:1313`
- Default language is Dutch (`/nl/`); English at `/en/`, etc.
- Debug mode bypasses OAuth, GitHub API, and Cloudflare R2 — no secrets needed for local dev.

### Lint / Type-check

- **API worker**: `cd api && npm run check` (runs `tsc --noEmit`)
- **Hugo build**: `hugo --minify` (catches template errors)
- There is no separate linter configured (no ESLint, no pre-commit hooks).

### Build

```bash
hugo --minify
```

Output goes to `./public/`.

### API worker (Cloudflare Worker)

- Dependencies: `cd api && npm install`
- Type-check: `cd api && npm run check`
- Local dev (requires `.dev.vars` with secrets): `cd api && npm run dev`
- The worker is only needed for CMS OAuth flows; the main site works without it.
