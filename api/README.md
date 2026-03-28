# La Cumbre API (Cloudflare Worker)

This folder is a small **Cloudflare Worker API** for the Hugo site. It does **not** serve site pages, R2 CRUD, or other general backend features.

It combines two separate concerns:

1. **CMS authentication** — Who may start the CMS login flow: **Google sign-in** plus an **email allowlist** (`ALLOWED_EMAILS`). This establishes identity only.
2. **CMS authorization (credentials)** — After Google completes successfully, the worker **releases credentials** the CMS needs to act on your behalf. Today that is **GitHub authorization**: a PAT is handed to Sveltia so it can use the GitHub backend. This role is distinct from authentication and **may later grow** to include tokens or grants for **other services** (same pattern: verified identity + policy, then issuance).

## Endpoints

| Path | Role |
|------|------|
| `/auth` | Starts Google OAuth (Sveltia `backend.base_url`); begins **authentication** |
| `/callback` | Finishes Google OAuth; checks allowlist, then returns HTML that **authorizes** the CMS with the **GitHub** PAT (postMessage to Sveltia) |
| `/` | Health-style `200 OK` |

## Deployed URL

Configuration in [`wrangler.toml`](./wrangler.toml) uses **`name = "api"`**, so the default Workers URL is:

```text
https://api.<your-workers-subdomain>.workers.dev
```

To match **`https://api.lacumbre.workers.dev`**, your Cloudflare account’s **Workers subdomain** must be **`lacumbre`**. That name is chosen in the dashboard (Workers & Pages), not in this repo.

Check what Wrangler will use:

```bash
cd api
npx wrangler whoami
```

Then point Google OAuth **Authorized redirect URI** at:

```text
https://api.lacumbre.workers.dev/callback
```

(and use the same host in `static/admin/config.yml` as `backend.base_url`).

## First-time setup

From the `api/` directory:

1. **Dependencies & login**
   ```bash
   npm install
   npx wrangler login
   ```

2. **Edit `wrangler.toml`** — replace placeholders under `[vars]` (see below).

3. **Secrets** (stored encrypted at Cloudflare, not in git):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GITHUB_PAT
   ```

4. **Deploy**
   ```bash
   npm run deploy
   # same as: npx wrangler deploy
   ```

5. **Google Cloud Console** — OAuth Web client: add redirect URI  
   `https://api.<your-subdomain>.workers.dev/callback`.

6. **CMS** — set `backend.base_url` in `static/admin/config.yml` to the same worker origin (no trailing path).

## Updating plain environment variables

Values in **`[vars]`** in `wrangler.toml` (`GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`) are **non-secret**. You can update them in either of these ways:

### A — Edit `wrangler.toml` and redeploy (recommended)

1. Change `GOOGLE_CLIENT_ID` and/or `ALLOWED_EMAILS` under `[vars]`.
2. Run:
   ```bash
   cd api && npx wrangler deploy
   ```

`ALLOWED_EMAILS` is a **comma-separated** list (spaces after commas are fine):

```toml
ALLOWED_EMAILS = "alice@example.com,bob@example.com"
```

### B — One-off values on deploy (no file edit)

Pass variables at deploy time (values in `wrangler.toml` for the same keys are **overridden** by these flags):

```bash
cd api
npx wrangler deploy \
  --var GOOGLE_CLIENT_ID:your-id.apps.googleusercontent.com \
  --var ALLOWED_EMAILS:alice@example.com,bob@example.com
```

If the shell splits on commas, quote the allowlist:

```bash
npx wrangler deploy \
  --var GOOGLE_CLIENT_ID:"123....apps.googleusercontent.com" \
  --var ALLOWED_EMAILS:"alice@example.com,bob@example.com"
```

### Secrets (not in `wrangler.toml`)

To rotate **Google client secret** or **GitHub PAT**:

```bash
cd api
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_PAT
```

No redeploy is strictly required for secret updates on Workers, but redeploying after changes is safe.

You can also view or edit **vars and secrets** in **Cloudflare Dashboard → Workers & Pages → api → Settings → Variables**.

## Minimal GitHub PAT scope (authorization today)

The PAT is the current **GitHub authorization** credential issued after successful authentication. Create a fine-grained PAT for this repo with:

- Repository access: only `jiggunjer/lacumbre` (or your fork)
- Permission: **Contents** read/write

## Local development

```bash
cd api
npm run dev
```

Local secrets: `.dev.vars` (gitignored), e.g.:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_PAT=...
ALLOWED_EMAILS=you@example.com
```

## R2 / media

Sveltia talks to R2 from the browser; this worker is **not** on the media upload path. Deleting a gallery entry in the CMS only updates JSON; it does not delete R2 objects.

## Portability

This worker can be replaced with another host; keep **`backend.base_url`**, Google redirect URIs, and any future **authorization** targets aligned with how the CMS expects to receive credentials.
