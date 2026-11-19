const crypto = require("node:crypto");

const COOKIE_TTL = 60 * 60 * 12;
const ALLOWED_FILES = new Set([
  "index.html",
  "wiki.html",
  "updates.html",
  "join.html",
  "data/mechanics.json"
]);
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

function send(res, status, data) {
  res.status(status).json(data);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + signature;
}

function verify(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function githubHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "FIREON-Studio"
  };
}

async function saveFile(path, content, message, isBase64) {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error("На сервере не настроено подключение к GitHub.");
  const apiUrl = "https://api.github.com/repos/" + repo + "/contents/" +
    path.split("/").map(encodeURIComponent).join("/");
  const current = await fetch(apiUrl + "?ref=main", { headers: githubHeaders(token) });
  let sha;
  if (current.ok) {
    const file = await current.json();
    sha = file.sha;
  } else if (current.status !== 404) {
    throw new Error("Не удалось проверить файл в GitHub.");
  }

  const payload = {
    message: message || "Обновление сайта через FIREON Studio",
    content: isBase64 ? content : Buffer.from(content, "utf8").toString("base64"),
    branch: "main"
  };
  if (sha) payload.sha = sha;

  const result = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    const error = new Error(data.message || "GitHub не принял изменения.");
    error.status = result.status;
    throw error;
  }
  return { path, commit: data.commit && data.commit.sha };
}

module.exports = async (req, res) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://evgenus222.github.io";
  const origin = req.headers.origin || "";
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (origin === allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  if (req.method === "OPTIONS") {
    if (origin !== allowedOrigin) return res.status(403).end();
    return res.status(204).end();
  }
  if (origin !== allowedOrigin) return send(res, 403, { error: "Недопустимый источник запроса." });

  const pathname = new URL(req.url, "https://fireon.invalid").pathname;
  const route = pathname.replace(/^\/api\/?/, "");
  const body = getBody(req);

  if (route === "login" && req.method === "POST") {
    const password = process.env.ADMIN_PASSWORD;
    const secret = process.env.SESSION_SECRET;
    if (!password || !secret) return send(res, 503, { error: "Авторизация ещё не настроена на сервере." });
    if (!safeEqual(body.password, password)) return send(res, 401, { error: "Неверный пароль." });
    const now = Math.floor(Date.now() / 1000);
    const token = sign({ sub: "evgenus222", iat: now, exp: now + COOKIE_TTL }, secret);
    return send(res, 200, { ok: true, token, login: "evgenus222" });
  }

  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = verify(token, process.env.SESSION_SECRET);
  if (route === "me" && req.method === "GET") {
    if (!session) return send(res, 401, { authenticated: false });
    return send(res, 200, { authenticated: true, login: session.sub });
  }
  if (route === "logout" && req.method === "POST") {
    return send(res, 200, { ok: true });
  }
  if (!session) return send(res, 401, { error: "Сессия закончилась. Войдите снова." });

  if (route === "save" && req.method === "POST") {
    const path = String(body.path || "");
    const content = typeof body.content === "string" ? body.content : "";
    if (!ALLOWED_FILES.has(path)) return send(res, 400, { error: "Этот файл нельзя редактировать через админку." });
    if (content.length > 1500000) return send(res, 413, { error: "Файл слишком большой для публикации." });
    if (path === "data/mechanics.json") {
      try { if (!Array.isArray(JSON.parse(content))) throw new Error("invalid"); }
      catch { return send(res, 400, { error: "Публикации должны быть корректным списком JSON." }); }
    }
    try {
      const result = await saveFile(path, content, "Обновление " + path + " через FIREON Studio", false);
      return send(res, 200, { ok: true, ...result });
    } catch (error) {
      return send(res, error.status || 502, { error: error.message });
    }
  }

  if (route === "upload" && req.method === "POST") {
    const mime = String(body.mime || "").toLowerCase();
    const extension = IMAGE_TYPES[mime];
    const base64 = String(body.base64 || "").replace(/^data:[^,]+,/, "");
    const original = String(body.name || "image").toLowerCase();
    if (!extension) return send(res, 400, { error: "Поддерживаются PNG, JPG, WEBP и GIF." });
    if (!base64 || base64.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
      return send(res, 413, { error: "Изображение должно быть меньше 5 МБ." });
    }
    const safeName = original.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "image";
    const path = "media/uploads/" + Date.now() + "-" + safeName + "." + extension;
    try {
      const result = await saveFile(path, base64, "Загрузка изображения " + path, true);
      return send(res, 200, { ok: true, ...result });
    } catch (error) {
      return send(res, error.status || 502, { error: error.message });
    }
  }

  return send(res, 404, { error: "Маршрут не найден." });
};
