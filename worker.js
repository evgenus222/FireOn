const encoder = new TextEncoder();
const decoder = new TextDecoder();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = origin === env.SITE_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed ? origin : env.SITE_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function encryptSession(payload, secret) {
  const rawKey = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return b64url(iv) + "." + b64url(new Uint8Array(encrypted));
}
async function decryptSession(token, secret) {
  const [ivPart, dataPart] = String(token || "").split(".");
  if (!ivPart || !dataPart) throw new Error("Invalid session");
  const rawKey = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(ivPart) }, key, unb64url(dataPart));
  const payload = JSON.parse(decoder.decode(clear));
  if (!payload.exp || payload.exp < Date.now()) throw new Error("Session expired");
  if (payload.login !== envAdminLogin) throw new Error("Not allowed");
  return payload;
}
let envAdminLogin = "";

function cookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function githubHeaders(token) {
  return {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "FIREON-Studio"
  };
}
async function githubApi(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...githubHeaders(token), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "GitHub API error " + response.status);
  return data;
}
function base64Utf8(value) {
  const bytes = encoder.encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
function redirect(url, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", ...headers } });
}
function config(env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET ||
      !env.GITHUB_OWNER || !env.GITHUB_REPO || !env.SITE_ORIGIN || !env.SITE_URL || !env.GITHUB_CALLBACK_URL) {
    throw new Error("Worker configuration is incomplete");
  }
}
async function authorize(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const payload = await decryptSession(token, env.SESSION_SECRET);
  if (payload.login !== env.ADMIN_GITHUB_LOGIN) throw new Error("Forbidden");
  return payload;
}
async function saveFile(path, content, session, env) {
  const allowed = new Set(["index.html", "wiki.html", "updates.html", "join.html", "data/mechanics.json"]);
  if (!allowed.has(path)) throw new Error("This file cannot be edited from Studio");
  if (typeof content !== "string" || content.length > 1_500_000) throw new Error("Invalid or oversized file content");
  if (path.endsWith(".json")) JSON.parse(content);
  const apiUrl = "https://api.github.com/repos/" + env.GITHUB_OWNER + "/" + env.GITHUB_REPO + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  let sha;
  try {
    const current = await githubApi(apiUrl + "?ref=" + encodeURIComponent(env.GITHUB_BRANCH || "main"), session.accessToken);
    sha = current.sha;
  } catch (error) {
    if (!String(error.message).includes("Not Found")) throw error;
  }
  const body = {
    message: "FIREON Studio: update " + path,
    content: base64Utf8(content),
    branch: env.GITHUB_BRANCH || "main"
  };
  if (sha) body.sha = sha;
  await githubApi(apiUrl, session.accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
async function uploadImage(input, session, env) {
  if (!input || typeof input.name !== "string" || typeof input.base64 !== "string") throw new Error("Invalid image");
  const mimeToExt = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
  const ext = mimeToExt[input.mime];
  if (!ext) throw new Error("Only PNG, JPG, WEBP and GIF images are allowed");
  if (input.base64.length > 7_000_000) throw new Error("Image is too large (maximum 5 MB)");
  const cleanName = input.name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/\.(png|jpe?g|webp|gif)$/i, "") || "image";
  const filename = Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8) + "-" + cleanName + "." + ext;
  const path = "media/uploads/" + filename;
  const apiUrl = "https://api.github.com/repos/" + env.GITHUB_OWNER + "/" + env.GITHUB_REPO + "/contents/" + path;
  const binary = Uint8Array.from(atob(input.base64), c => c.charCodeAt(0));
  if (binary.byteLength > 5 * 1024 * 1024) throw new Error("Image is too large (maximum 5 MB)");
  await githubApi(apiUrl, session.accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "FIREON Studio: upload image",
      content: b64url(binary).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - b64url(binary).length % 4) % 4),
      branch: env.GITHUB_BRANCH || "main"
    })
  });
  return "/" + env.GITHUB_REPO + "/" + path;
}

export default {
  async fetch(request, env) {
    try {
      config(env);
      const url = new URL(request.url);
      const headers = cors(request, env);
      if (request.method === "OPTIONS") {
        if (request.headers.get("Origin") !== env.SITE_ORIGIN) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers });
      }
      if (url.pathname === "/health") return json({ ok: true, service: "FIREON Studio API" }, 200, headers);

      if (url.pathname === "/auth/login" && request.method === "GET") {
        const nonce = b64url(crypto.getRandomValues(new Uint8Array(24)));
        const signature = b64url(await hmac(nonce, env.SESSION_SECRET));
        const state = nonce + "." + signature;
        const params = new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID,
          redirect_uri: env.GITHUB_CALLBACK_URL,
          scope: "public_repo read:user",
          state
        });
        return redirect("https://github.com/login/oauth/authorize?" + params.toString(), {
          "Set-Cookie": "fireon_oauth_state=" + encodeURIComponent(state) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600"
        });
      }

      if (url.pathname === "/auth/callback" && request.method === "GET") {
        const state = url.searchParams.get("state") || "";
        const stored = cookie(request, "fireon_oauth_state");
        const [nonce, signature] = state.split(".");
        const expected = b64url(await hmac(nonce || "", env.SESSION_SECRET));
        if (!stored || !safeEqual(state, stored) || !signature || !safeEqual(signature, expected)) {
          return redirect(env.SITE_URL + "?auth=denied", { "Set-Cookie": "fireon_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
        }
        const code = url.searchParams.get("code");
        if (!code) return redirect(env.SITE_URL + "?auth=denied");
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: env.GITHUB_CALLBACK_URL })
        });
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) return redirect(env.SITE_URL + "?auth=denied");
        const user = await fetch("https://api.github.com/user", { headers: githubHeaders(tokenData.access_token) }).then(r => r.json());
        if (!user.login || user.login.toLowerCase() !== env.ADMIN_GITHUB_LOGIN.toLowerCase()) {
          return redirect(env.SITE_URL + "?auth=denied", { "Set-Cookie": "fireon_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
        }
        const session = await encryptSession({
          login: user.login,
          accessToken: tokenData.access_token,
          exp: Date.now() + 6 * 60 * 60 * 1000
        }, env.SESSION_SECRET);
        return redirect(env.SITE_URL + "#fireon_session=" + encodeURIComponent(session), {
          "Set-Cookie": "fireon_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        });
      }

      if (url.pathname.startsWith("/api/")) {
        if (request.headers.get("Origin") !== env.SITE_ORIGIN) return json({ error: "Origin not allowed" }, 403, headers);
        let session;
        try { session = await authorize(request, env); }
        catch (error) { return json({ error: error.message === "Forbidden" ? "Forbidden" : "Unauthorized" }, 401, headers); }

        if (url.pathname === "/api/me" && request.method === "GET") return json({ authenticated: true, login: session.login }, 200, headers);
        if (url.pathname === "/api/logout" && request.method === "POST") return json({ ok: true }, 200, headers);
        if (url.pathname === "/api/save" && request.method === "POST") {
          const body = await request.json();
          await saveFile(body.path, body.content, session, env);
          return json({ ok: true, path: body.path }, 200, headers);
        }
        if (url.pathname === "/api/upload" && request.method === "POST") {
          const body = await request.json();
          const path = await uploadImage(body, session, env);
          return json({ ok: true, path }, 200, headers);
        }
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      return json({ error: error.message || "Internal server error" }, 500);
    }
  }
};
