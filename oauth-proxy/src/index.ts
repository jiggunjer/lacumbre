interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_PAT: string;
  ALLOWED_EMAILS: string;
}

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type TokenInfoResponse = {
  email?: string;
  email_verified?: string;
};

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/$/, "") || "/";

      if (pathname === "/auth") {
        return handleAuth(request, env);
      }

      if (pathname === "/callback") {
        return handleCallback(request, env);
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      return new Response(`Unhandled error: ${String(error)}`, { status: 500 });
    }
  },
};

function handleAuth(request: Request, env: Env): Response {
  ensureEnv(env);

  const reqUrl = new URL(request.url);
  const provider = reqUrl.searchParams.get("provider") || "github";
  if (provider !== "github") {
    return new Response("Unsupported provider", { status: 400 });
  }

  const state = randomHex(32);
  const cmsOrigin = sanitizeOrigin(reqUrl.searchParams.get("origin"));
  const redirectUri = `${reqUrl.origin}/callback`;

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);

  const headers = new Headers({
    Location: authUrl.toString(),
    "Cache-Control": "no-store",
  });

  headers.append("Set-Cookie", createCookie("oauth_state", state, 600));
  if (cmsOrigin) {
    headers.append("Set-Cookie", createCookie("oauth_origin", cmsOrigin, 600));
  }

  return new Response(null, { status: 302, headers });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  ensureEnv(env);

  const reqUrl = new URL(request.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");

  const cookies = parseCookies(request.headers.get("Cookie"));
  if (!code || !state || cookies.oauth_state !== state) {
    return renderFailure("Invalid or expired OAuth session.");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${reqUrl.origin}/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return renderFailure(`Google token exchange failed (${tokenRes.status}).`);
  }

  const tokenData = (await tokenRes.json()) as TokenResponse;
  if (!tokenData.id_token) {
    return renderFailure(tokenData.error_description || "Missing Google ID token.");
  }

  const tokenInfoUrl = new URL(GOOGLE_TOKEN_INFO_ENDPOINT);
  tokenInfoUrl.searchParams.set("id_token", tokenData.id_token);

  const tokenInfoRes = await fetch(tokenInfoUrl);
  if (!tokenInfoRes.ok) {
    return renderFailure(`Unable to verify Google identity (${tokenInfoRes.status}).`);
  }

  const tokenInfo = (await tokenInfoRes.json()) as TokenInfoResponse;
  const email = (tokenInfo.email || "").trim().toLowerCase();
  const emailVerified = tokenInfo.email_verified === "true";

  if (!email || !emailVerified) {
    return renderFailure("Your Google account email is not verified.");
  }

  const allowedEmails = parseAllowedEmails(env.ALLOWED_EMAILS);
  if (!allowedEmails.has(email)) {
    return renderFailure("This Google account is not permitted to access the CMS.");
  }

  const payload = {
    token: env.GITHUB_PAT,
    provider: "github",
  };

  const cmsOrigin = cookies.oauth_origin || "";
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", clearCookie("oauth_state"));
  headers.append("Set-Cookie", clearCookie("oauth_origin"));

  return new Response(renderSuccessHtml(payload, cmsOrigin), {
    status: 200,
    headers,
  });
}

function renderSuccessHtml(payload: { token: string; provider: string }, cmsOrigin: string): string {
  const serializedPayload = JSON.stringify(payload);
  const serializedOrigin = JSON.stringify(cmsOrigin || "");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>CMS Login</title>
  </head>
  <body>
    <script>
      (function() {
        var payload = ${serializedPayload};
        var configuredOrigin = ${serializedOrigin};
        var hasSent = false;

        function send(targetOrigin) {
          if (hasSent || !window.opener || !targetOrigin) {
            return;
          }
          hasSent = true;
          window.opener.postMessage(
            "authorization:github:success:" + JSON.stringify(payload),
            targetOrigin
          );
          window.close();
        }

        window.opener && window.opener.postMessage("authorizing:github", "*");

        window.addEventListener("message", function(event) {
          send(event.origin);
        });

        // Fallback if opener does not respond quickly.
        setTimeout(function() {
          if (configuredOrigin) {
            send(configuredOrigin);
          }
        }, 300);
      })();
    </script>
    <p>Authentication successful. You can close this window.</p>
  </body>
</html>`;
}

function renderFailure(message: string): Response {
  const safeMessage = escapeHtml(message);
  return new Response(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>CMS Login Failed</title>
  </head>
  <body>
    <h1>Authentication failed</h1>
    <p>${safeMessage}</p>
  </body>
</html>`,
    {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
}

function parseAllowedEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseCookies(headerValue: string | null): Record<string, string> {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(";").reduce<Record<string, string>>((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key || rest.length === 0) {
      return acc;
    }
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function createCookie(name: string, value: string, maxAgeSeconds: number): string {
  const encoded = encodeURIComponent(value);
  return `${name}=${encoded}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function sanitizeOrigin(origin: string | null): string {
  if (!origin) {
    return "";
  }

  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.origin;
    }
    return "";
  } catch {
    return "";
  }
}

function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (v) => v.toString(16).padStart(2, "0")).join("");
}

function ensureEnv(env: Env): void {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_PAT",
    "ALLOWED_EMAILS",
  ] as const;

  for (const key of required) {
    if (!env[key] || !env[key].trim()) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
