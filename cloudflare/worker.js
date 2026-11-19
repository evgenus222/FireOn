const COOKIE = "fireon_admin_session";
const SESSION_TTL = 60 * 60 * 24 * 7;
const ALLOWED_PAGES = new Set(["index.html", "wiki.html", "data/mechanics.json"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function headers(env, extra = {}) {
  return {
    "Access-Control-Allow-Origin": env.ADMIN_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    ...extra
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: headers(env, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  });
}

function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const match = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : "";
}

function randomHex(bytes) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, x => x.toString(16).padStart(2, "0")).join("");
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function getSession(request, env) {
  const id = cookieValue(request, COOKIE);
  if (!id) return null;
  const raw = await env.SESSIONS.get("session:" + id);
  if (!raw) return null;
  try {
    return { id, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

async function github(token, url, options) {
  return fetch(url, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "FIREON-Admin",
      ...(options && options.headers ? options.headers : {})
    }
  });
}

function redirect(url, cookie) {
  const h = new Headers({ "Location": url, "Cache-Control": "no-store" });
  if (cookie) h.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers: h });
}

async function saveToGitHub(session, env, path, content, message) {
  const base = "https://api.github.com/repos/" + env.GITHUB_REPO + "/contents/" + path;
  const current = await github(session.accessToken, base + "?ref=main");
  let sha;
  if (current.ok) {
    const data = await current.json();
    sha = data.sha;
  } else if (current.status !== 404) {
    return { ok: false, status: current.status, message: "Не удалось проверить текущую версию файла в GitHub." };
  }

  const payload = {
    message: message || "Обновление сайта FIREON через админ-панель",
    content: base64Utf8(content),
    branch: "main"
  };
  if (sha) payload.sha = sha;

  const result = await github(session.accessToken, base, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    return { ok: false, status: result.status, message: data.message || "GitHub не принял изменения." };
  }
  return { ok: true, commit: data.commit && data.commit.sha, path };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      if (origin !== env.ADMIN_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: headers(env) });
    }

    if (url.pathname === "/auth/login" && request.method === "GET") {
      const state = randomHex(24);
      await env.SESSIONS.put("oauth-state:" + state, "1", { expirationTtl: 600 });
      const callback = url.origin + "/auth/callback";
      const authorize = new URL("https://github.com/login/oauth/authorize");
      authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      authorize.searchParams.set("redirect_uri", callback);
      authorize.searchParams.set("scope", "public_repo");
      authorize.searchParams.set("state", state);
      return redirect(authorize.toString());
    }

    if (url.pathname === "/auth/callback" && request.method === "GET") {
      const state = url.searchParams.get("state") || "";
      const code = url.searchParams.get("code") || "";
      const validState = state && await env.SESSIONS.get("oauth-state:" + state);
      if (!validState || !code) return redirect(env.SITE_URL + "/admin.html?auth=failed");
      await env.SESSIONS.delete("oauth-state:" + state);

      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: url.origin + "/auth/callback"
        })
      });
      const tokenData = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenData.access_token) {
        return redirect(env.SITE_URL + "/admin.html?auth=failed");
      }

      const userResponse = await github(tokenData.access_token, "https://api.github.com/user");
      const user = await userResponse.json().catch(() => ({}));
      if (!userResponse.ok || String(user.login || "").toLowerCase() !== String(env.ALLOWED_GITHUB_USER || "").toLowerCase()) {
        return redirect(env.SITE_URL + "/admin.html?auth=denied");
      }

      const id = randomHex(32);
      await env.SESSIONS.put("session:" + id, JSON.stringify({
        accessToken: tokenData.access_token,
        login: user.login
      }), { expirationTtl: SESSION_TTL });
      const cookie = COOKIE + "=" + encodeURIComponent(id) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + SESSION_TTL;
      return redirect(env.SITE_URL + "/admin.html", cookie);
    }

    if (origin !== env.ADMIN_ORIGIN) return json({ error: "Недопустимый источник запроса." }, 403, env);

    if (url.pathname === "/api/me" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session) return json({ authenticated: false }, 401, env);
      return json({ authenticated: true, login: session.login }, 200, env);
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      const session = await getSession(request, env);
      if (session) await env.SESSIONS.delete("session:" + session.id);
      const response = json({ ok: true }, 200, env);
      response.headers.append("Set-Cookie", COOKIE + "=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
      return response;
    }

    if (url.pathname === "/api/save" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) return json({ error: "Сессия закончилась. Войдите снова." }, 401, env);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Некорректный запрос." }, 400, env); }
      const path = String(body.path || "");
      const content = String(body.content || "");
      if (!ALLOWED_PAGES.has(path)) return json({ error: "Этот файл нельзя редактировать через админку." }, 400, env);
      if (content.length > 1500000) return json({ error: "Файл слишком большой для публикации." }, 413, env);
      if (path === "data/mechanics.json") {
        try { if (!Array.isArray(JSON.parse(content))) throw new Error("not-array"); }
        catch { return json({ error: "Публикации должны быть корректным списком JSON." }, 400, env); }
      }
      const result = await saveToGitHub(session, env, path, content, "Обновление " + path + " через FIREON Studio");
      if (!result.ok) return json({ error: result.message }, result.status >= 400 ? result.status : 502, env);
      return json({ ok: true, path: result.path, commit: result.commit }, 200, env);
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      const session = await getSession(request, env);
      if (!session) return json({ error: "Сессия закончилась. Войдите снова." }, 401, env);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Некорректный запрос." }, 400, env); }
      const mime = String(body.mime || "").toLowerCase();
      const base64 = String(body.base64 || "").replace(/^data:[^,]+,/, "");
      const original = String(body.name || "image").toLowerCase();
      const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "";
      if (!ALLOWED_IMAGE_TYPES.has(mime) || !extension) return json({ error: "Поддерживаются PNG, JPG, WEBP и GIF." }, 400, env);
      if (!base64 || base64.length > 7 * 1024 * 1024) return json({ error: "Изображение должно быть меньше 5 МБ." }, 413, env);
      const safeName = original.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "image";
      const path = "media/uploads/" + Date.now() + "-" + safeName + "." + extension;
      const result = await saveToGitHub(session, env, path, base64, "Загрузка изображения " + path);
      if (!result.ok) return json({ error: result.message }, result.status >= 400 ? result.status : 502, env);
      return json({ ok: true, path, commit: result.commit }, 200, env);
    }

    return json({ error: "Маршрут не найден." }, 404, env);
  }
};