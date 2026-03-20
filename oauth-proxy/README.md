# La Cumbre CMS OAuth Proxy

Cloudflare Worker that authenticates CMS users with Google, checks an email allowlist, and returns a GitHub token payload to Sveltia CMS.

## What this service does

1. User clicks Sign In on `/admin/`
2. Sveltia opens `backend.base_url` (`/auth`) in a popup
3. Worker redirects to Google OAuth
4. Worker validates Google email against `ALLOWED_EMAILS`
5. Worker returns `authorization:github:success:{ token, provider }` to Sveltia
6. Sveltia commits CMS edits to this repo through GitHub backend

The worker handles auth only. It does not do R2 CRUD.

## Required secrets and vars

- `GOOGLE_CLIENT_ID` (var)
- `GOOGLE_CLIENT_SECRET` (secret)
- `GITHUB_PAT` (secret)
- `ALLOWED_EMAILS` (var, comma-delimited string)

Example:

`ALLOWED_EMAILS=admin@example.com,backup@example.com`

## Minimal GitHub PAT scope

Create a fine-grained PAT for `jiggunjer/lacumbre` with:

- Repository access: only this repository
- Repository permission: `Contents` read/write

## Setup order (recommended)

From the `oauth-proxy/` directory:

1. Install deps and log in to Cloudflare:
   - `npm install`
   - `npx wrangler login`
2. Deploy once to get your worker URL:
   - `npx wrangler deploy`
3. In Google Cloud Console, create OAuth Web App credentials and set redirect URI:
   - `https://<your-worker-domain>/callback`
4. Configure worker secrets:
   - `npx wrangler secret put GOOGLE_CLIENT_SECRET`
   - `npx wrangler secret put GITHUB_PAT`
5. Configure vars (dashboard or config):
   - `GOOGLE_CLIENT_ID`
   - `ALLOWED_EMAILS`
6. Redeploy:
   - `npx wrangler deploy`
7. Update `static/admin/config.yml`:
   - `backend.base_url: https://<your-worker-domain>`

Notes:

- `npm run deploy` also works only after `npm install` (it runs `wrangler deploy` from `package.json` scripts).
- Use `npx wrangler whoami` to confirm account/subdomain.
- Use `npx wrangler tail` for live logs.

## Local development

- Start local worker: `npm run dev`
- Keep local secrets in `.dev.vars` or `.dev.vars.*` (gitignored)

## R2 media notes

Sveltia talks to R2 directly from the browser. The worker is not in the media upload path.

- `access_key_id` is configured in CMS config
- `secret_access_key` should not be committed; Sveltia prompts for it in the UI and stores it in browser local storage

Deleting a gallery item in CMS removes only the JSON reference; it does not delete the object from R2.

## Portability

- This auth proxy can be replaced with another host/runtime
- Media provider can switch from R2 to S3/Cloudinary/Uploadcare by changing `static/admin/config.yml`
