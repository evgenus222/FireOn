(() => {
  const API = String(window.FIREON_ADMIN_API || "").replace(/\/+$/, "");
  const $ = id => document.getElementById(id);
  const loginScreen = $("login-screen"), app = $("app"), loginMessage = $("login-message");
  const loginButton = $("login-button"), frame = $("site-frame"), picker = $("image-picker");
  let currentPage = "index.html", dirty = false, editorEnabled = true, selectedElement = null;
  let pickerMode = "page", posts = [], activePost = -1, origins = [], activeOrigin = -1;
  const SESSION_KEY = "fireon_admin_session";

  function status(message, isDirty) {
    const statusEl = $("save-status");
    const publishEl = $("publish-button");
    if (statusEl) { statusEl.textContent = message; statusEl.classList?.toggle("dirty", !!isDirty); }
    if (publishEl) publishEl.disabled = !dirty;
  }
  function markDirty() { dirty = true; status("Есть неопубликованные изменения", true); }
  function api(path, options) {
    return fetch(API + path, {
      credentials: "omit", ...options,
      headers: { "Content-Type": "application/json", ...(sessionStorage.getItem(SESSION_KEY) ? { "Authorization": "Bearer " + sessionStorage.getItem(SESSION_KEY) } : {}), ...(options && options.headers || {}) }
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Ошибка запроса (" + response.status + ")");
      return data;
    });
  }
  function showLogin(message) {
    loginScreen.hidden = false; app.hidden = true;
    loginMessage.textContent = message || "Введи пароль администратора, чтобы открыть редактор.";
    loginButton.disabled = !API || API.includes("YOUR-VERCEL-PROJECT");
    if (loginButton.disabled) loginMessage.textContent = "Сначала подключи серверную часть по инструкции ADMIN-SETUP.md.";
  }
  async function boot() {
    if (!API || API.includes("YOUR-VERCEL-PROJECT")) return showLogin();
    try {
      const me = await api("/api/me");
      if (!me.authenticated) return showLogin();
      $("user-login").textContent = me.login;
      loginScreen.hidden = true; app.hidden = false;
      loadPage("index.html", true);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      showLogin("Введи пароль администратора, чтобы открыть редактор.");
    }
  }
  $("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("login-password").value;
    if (!password || !API || API.includes("YOUR-VERCEL-PROJECT")) return;
    loginButton.disabled = true;
    loginMessage.textContent = "Проверяем пароль…";
    try {
      const result = await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
      sessionStorage.setItem(SESSION_KEY, result.token);
      $("login-password").value = "";
      await boot();
    } catch (error) {
      loginMessage.textContent = error.message;
      $("login-password").select();
    } finally {
      loginButton.disabled = false;
    }
  });
  $("logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin("Вы вышли из админ-панели.");
  });

  function setActiveNav(view, page) {
    document.querySelectorAll(".nav-item[data-view]").forEach(button => {
      if (button?.classList) button.classList.toggle("active", button.dataset.view === view && (view !== "page" || button.dataset.page === page));
    });
  }
  function loadPage(path, force) {
    if (!force && dirty && !confirm("Есть неопубликованные изменения. Переключиться без сохранения?")) return;
    dirty = false; status("Загрузка страницы…", false); currentPage = path; selectedElement = null;
    $("view-title").textContent = ({ "index.html": "Главная страница", "wiki.html": "Вики", "updates.html": "Обновления", "join.html": "Как начать" })[path] || path;
    $("current-file").textContent = path;
    $("page-editor").hidden = false; $("posts-editor").hidden = true;
    $("preview-button").hidden = false; $("publish-button").hidden = false;
    $("preview-button").textContent = editorEnabled ? "Предпросмотр" : "Вернуться к редактированию";
    $("origins-button").disabled = path !== "wiki.html";
    $("origins-button").style.opacity = path === "wiki.html" ? "1" : ".4";
    setActiveNav("page", path);
    frame.src = path + "?editor-preview=" + Date.now();
    status("Страница загружается…", false);
  }
  document.querySelectorAll(".nav-item[data-view=page]").forEach(button => {
    button.addEventListener("click", () => loadPage(button.dataset.page));
  });

  function injectEditor() {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) return;
    const style = doc.createElement("style");
    style.id = "fireon-editor-style";
    style.textContent = "body.fireon-editor-active [contenteditable=true]{outline:1px dashed rgba(255,106,0,.34);outline-offset:3px;cursor:text}" +
      "body.fireon-editor-active [contenteditable=true]:hover{outline:1px solid #ff6a00;background-color:rgba(255,106,0,.035)}" +
      "body.fireon-editor-active img{cursor:pointer;outline:1px dashed rgba(182,102,214,.3);outline-offset:3px}" +
      "body.fireon-editor-active img:hover{outline:2px solid #b666d6}" +
      "body.fireon-editor-active .fireon-selected{outline:2px solid #b666d6!important;outline-offset:4px}";
    doc.head.appendChild(style);
    doc.body?.classList?.add("fireon-editor-active");
    const selectors = "h1,h2,h3,h4,p,li,.logo,.caption,.wiki-card-title,.rule-item,.wiki-note,.wiki-card-body > div:not(.rule-item),.wiki-card-body > span,.contact-info strong,.contact-info a,nav a,.cta .btn-text,.cta .ip-text,.donate-btn,footer p";
    doc.querySelectorAll(selectors).forEach(el => {
      if (el.closest("script,style,button")) return;
      el.contentEditable = editorEnabled ? "true" : "false";
      el.spellcheck = true; el.dataset.fireonEditable = "1";
    });
    doc.querySelectorAll("img").forEach(img => {
      img.dataset.fireonImage = "1";
    });
    doc.addEventListener("input", markDirty);
    doc.addEventListener("click", event => {
      const image = event.target.closest && event.target.closest("img[data-fireon-image]");
      if (image && editorEnabled) {
        event.preventDefault(); event.stopPropagation();
        if (image.id === "origin-img" && currentPage === "wiki.html") { openOrigins(); return; }
        selectElement(image); pickerMode = "page"; picker.click(); return;
      }
      if (event.target.closest && event.target.closest("#origin-name,#origin-desc") && currentPage === "wiki.html") {
        event.preventDefault(); event.stopPropagation(); openOrigins(); return;
      }
      const link = event.target.closest && event.target.closest("a");
      if (link) event.preventDefault();
      const target = event.target.closest && event.target.closest("[data-fireon-editable],.wiki-card,.gallery-item,.rule-chapter");
      if (target) selectElement(target);
    }, true);
    if (!editorEnabled) disableEditing(doc);
    dirty = false; status("Страница готова к редактированию", false);
  }
  function disableEditing(doc) {
    doc.body?.classList?.remove("fireon-editor-active");
    doc.querySelectorAll("[data-fireon-editable]").forEach(el => el.contentEditable = "false");
  }
  function enableEditing(doc) {
    doc.body.classList.add("fireon-editor-active");
    doc.querySelectorAll("[data-fireon-editable]").forEach(el => el.contentEditable = "true");
  }
  function selectElement(el) {
    if (selectedElement?.classList) selectedElement.classList.remove("fireon-selected");
    selectedElement = el?.classList ? el : null;
    if (selectedElement?.classList) selectedElement.classList.add("fireon-selected");
  }
  frame.addEventListener("load", injectEditor);

  document.querySelectorAll("[data-command]").forEach(button => button.addEventListener("click", () => {
    const doc = frame.contentDocument;
    if (!doc || !editorEnabled) return;
    doc.body.focus(); doc.execCommand(button.dataset.command, false, null); markDirty();
  }));
  $("link-button").addEventListener("click", () => {
    const doc = frame.contentDocument;
    if (!doc || !editorEnabled) return;
    const url = prompt("Вставь адрес ссылки:");
    if (url) { doc.execCommand("createLink", false, url); markDirty(); }
  });
  $("insert-image-button").addEventListener("click", () => {
    if (currentPage !== "wiki.html") return alert("Открой Вики, чтобы вставить изображение в блок.");
    pickerMode = "page-inline"; picker.click();
  });
  $("add-wiki-block-button").addEventListener("click", () => {
    if (currentPage !== "wiki.html") return alert("Новый блок можно добавить на странице Вики.");
    const doc = frame.contentDocument;
    const container = selectedElement?.closest?.(".wiki-plugins-container") || doc.querySelector(".wiki-plugins-container");
    if (!container) return alert("Не удалось найти область карточек Вики.");
    const card = doc.createElement("article"); card.className = "wiki-card rule-chapter wiki-searchable";
    card.innerHTML = '<div class="wiki-card-title">Новый раздел</div><div class="wiki-card-body"><p>Добавь описание нового раздела. Нажми на текст, чтобы изменить его.</p></div>';
    card.querySelectorAll(".wiki-card-title,p").forEach(el => { el.contentEditable = "true"; el.dataset.fireonEditable = "1"; });
    container.appendChild(card); selectElement(card.querySelector(".wiki-card-title")); markDirty(); card.scrollIntoView({behavior:"smooth",block:"center"});
  });
  $("add-text-button").addEventListener("click", () => {
    if (!selectedElement) return alert("Сначала нажми на раздел, в который нужно добавить текст.");
    const doc = frame.contentDocument;
    const container = selectedElement.closest(".wiki-card-body,.hero-content,.contact-info,.section,.wiki-plugins-container,.cooking-section") || selectedElement.parentElement;
    if (!container) return;
    const p = doc.createElement("p");
    p.textContent = "Новый текст. Нажми сюда, чтобы изменить.";
    p.contentEditable = "true"; p.dataset.fireonEditable = "1";
    container.appendChild(p); selectElement(p); p.focus(); markDirty();
  });
  $("duplicate-button").addEventListener("click", () => {
    if (!selectedElement) return alert("Сначала выбери блок.");
    const clone = selectedElement.cloneNode(true);
    clone.classList?.remove("fireon-selected");
    clone.querySelectorAll("[contenteditable]").forEach(el => el.contentEditable = "true");
    selectedElement.after(clone); selectElement(clone); markDirty();
  });
  $("delete-button").addEventListener("click", () => {
    if (!selectedElement) return alert("Сначала выбери блок.");
    const target = selectedElement;
    if (target === frame.contentDocument.body || (target.tagName === "SECTION" && target.id === "origins")) return;
    if (!confirm("Удалить выбранный блок?")) return;
    target.remove(); selectedElement = null; markDirty();
  });
  $("preview-button").addEventListener("click", () => {
    editorEnabled = !editorEnabled;
    const doc = frame.contentDocument;
    if (!doc) return;
    if (editorEnabled) {
      enableEditing(doc); $("preview-button").textContent = "Предпросмотр";
      status(dirty ? "Есть неопубликованные изменения" : "Режим редактирования", dirty);
    } else {
      disableEditing(doc); $("preview-button").textContent = "Вернуться к редактированию";
      status(dirty ? "Предпросмотр изменений" : "Режим предпросмотра", dirty);
    }
  });

  function cleanHtml() {
    const clone = frame.contentDocument.documentElement.cloneNode(true);
    clone.querySelector("#fireon-editor-style")?.remove();
    clone.body?.classList?.remove("fireon-editor-active");
    clone.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
    clone.querySelectorAll("[data-fireon-editable],[data-fireon-image]").forEach(el => {
      el.removeAttribute("data-fireon-editable"); el.removeAttribute("data-fireon-image");
    });
    clone.querySelectorAll(".fireon-selected").forEach(el => el.classList?.remove("fireon-selected"));
    let html = "<!DOCTYPE html>\n" + clone.outerHTML;
    if (currentPage === "wiki.html" && frame.contentWindow.__fireonOrigins) {
      const data = JSON.stringify(frame.contentWindow.__fireonOrigins, null, 4).replace(/<\/script/gi, "<\\/script");
      html = html.replace(/\/\* FIREON_ORIGINS_START \*\/[\s\S]*?\/\* FIREON_ORIGINS_END \*\//,
        "/* FIREON_ORIGINS_START */ " + data + " /* FIREON_ORIGINS_END */");
    }
    return html;
  }
  $("publish-button").addEventListener("click", async () => {
    if (!dirty) return;
    const button = $("publish-button");
    button.disabled = true; button.textContent = "Публикация…"; status("Отправляем изменения в GitHub…", true);
    try {
      await api("/api/save", { method: "POST", body: JSON.stringify({ path: currentPage, content: cleanHtml() }) });
      dirty = false; status("Опубликовано. Сайт обновится автоматически.", false);
      button.textContent = "Опубликовано";
      setTimeout(() => { button.textContent = "Опубликовать"; }, 2200);
    } catch (error) {
      status(error.message, true); button.textContent = "Повторить публикацию"; button.disabled = false;
    }
  });

  async function uploadImage(file) {
    if (!file) return null;
    if (file.size > 3 * 1024 * 1024) throw new Error("Изображение должно быть меньше 3 МБ.");
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject; reader.readAsDataURL(file);
    });
    const result = await api("/api/upload", { method: "POST", body: JSON.stringify({ name: file.name, mime: file.type, base64 }) });
    return result.path;
  }
  picker.addEventListener("change", async () => {
    const file = picker.files && picker.files[0]; picker.value = "";
    if (!file) return;
    try {
      const path = await uploadImage(file);
      if (pickerMode === "page" && selectedElement && selectedElement.tagName === "IMG") selectedElement.setAttribute("src", path);
      else if (pickerMode === "page-inline") {
        const doc = frame.contentDocument;
        const container = selectedElement?.closest?.(".wiki-card-body,.wiki-card,.wiki-plugins-container,.wiki-content") || doc.querySelector(".wiki-plugins-container") || doc.querySelector(".wiki-content");
        if (!container) throw new Error("Не найден блок для изображения. Сначала выбери карточку в Вики.");
        const img = doc.createElement("img"); img.src = path; img.alt = "Иллюстрация"; img.loading = "lazy";
        img.style.cssText = "display:block;width:100%;max-height:360px;object-fit:cover;border-radius:16px;margin:18px 0;box-shadow:0 12px 32px rgba(0,0,0,.22)";
        container.appendChild(img); selectElement(img);
      }
      else if (pickerMode === "origin") $("origin-image-field").value = path;
      else if (pickerMode === "post") $("post-image").value = path;
      else if (pickerMode === "post-inline") {
        $("post-body").focus();
        const img = document.createElement("img"); img.src = path; img.alt = "Иллюстрация";
        img.style.cssText = "display:block;max-width:100%;height:auto;max-height:420px;object-fit:contain;border-radius:14px;margin:16px auto";
        const sel = window.getSelection();
        if (sel && sel.rangeCount && $("post-body").contains(sel.anchorNode)) sel.getRangeAt(0).insertNode(img);
        else $("post-body").appendChild(img);
      }
      if (pickerMode !== "post") markDirty();
      if (pickerMode === "post" || pickerMode === "post-inline") updatePostImagePreview();
      $("post-message").textContent = "Изображение загружено: " + path;
    } catch (error) { alert(error.message); }
  });

  $("origins-button").addEventListener("click", openOrigins);
  function openOrigins() {
    if (currentPage !== "wiki.html" || !frame.contentWindow.__fireonOrigins) {
      alert("Открой страницу Вики, чтобы редактировать происхождения."); return;
    }
    origins = JSON.parse(JSON.stringify(frame.contentWindow.__fireonOrigins));
    const current = typeof frame.contentWindow.__fireonCurrentOrigin === "function" ? frame.contentWindow.__fireonCurrentOrigin() : 0;
    activeOrigin = origins.length ? Math.min(current, origins.length - 1) : -1;
    renderOriginList(); renderOriginForm(); $("origin-modal").hidden = false;
  }
  function renderOriginList() {
    const list = $("origin-list"); list.innerHTML = "";
    origins.forEach((origin, index) => {
      const button = document.createElement("button");
      button.className = "origin-choice" + (index === activeOrigin ? " active" : "");
      button.textContent = origin.name || "Без названия";
      button.addEventListener("click", () => {
        applyOriginFields(); activeOrigin = index; renderOriginList(); renderOriginForm();
      });
      list.appendChild(button);
    });
  }
  function renderOriginForm() {
    const origin = origins[activeOrigin], disabled = !origin;
    ["origin-name-field","origin-desc-field","origin-image-field","save-origin-button","delete-origin-button","origin-image-button"].forEach(id => $(id).disabled = disabled);
    $("origin-name-field").value = origin ? origin.name || "" : "";
    $("origin-desc-field").value = origin ? origin.desc || "" : "";
    $("origin-image-field").value = origin ? origin.img || "" : "";
  }
  function applyOriginFields() {
    if (activeOrigin < 0 || !origins[activeOrigin]) return;
    origins[activeOrigin] = { name: $("origin-name-field").value.trim(), desc: $("origin-desc-field").value, img: $("origin-image-field").value.trim() };
  }
  $("save-origin-button").addEventListener("click", () => {
    applyOriginFields(); frame.contentWindow.__fireonSetOrigins(origins); renderOriginList(); renderOriginForm(); markDirty();
  });
  $("add-origin-button").addEventListener("click", () => {
    applyOriginFields(); origins.push({ name: "Новое происхождение", desc: "Описание происхождения", img: "" });
    activeOrigin = origins.length - 1; frame.contentWindow.__fireonSetOrigins(origins); renderOriginList(); renderOriginForm(); markDirty();
  });
  $("delete-origin-button").addEventListener("click", () => {
    if (origins.length <= 1) return alert("В списке должно остаться хотя бы одно происхождение.");
    if (activeOrigin < 0 || !confirm("Удалить это происхождение?")) return;
    origins.splice(activeOrigin, 1); activeOrigin = Math.min(activeOrigin, origins.length - 1);
    frame.contentWindow.__fireonSetOrigins(origins); renderOriginList(); renderOriginForm(); markDirty();
  });
  $("origin-image-button").addEventListener("click", () => { pickerMode = "origin"; picker.click(); });
  $("close-origin-modal").addEventListener("click", () => {
    applyOriginFields(); frame.contentWindow.__fireonSetOrigins(origins);
    markDirty();
    $("origin-modal").hidden = true;
  });

  async function loadPosts() {
    const response = await fetch("data/mechanics.json?cache=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить публикации.");
    posts = await response.json(); if (!Array.isArray(posts)) posts = [];
    renderPostList(); if (posts.length) selectPost(0); else newPost();
  }
  function renderPostList() {
    const list = $("post-list"), q = $("post-search").value.trim().toLowerCase();
    list.innerHTML = "";
    posts.forEach((post, index) => {
      if (q && ![post.title, ...(post.tags || [])].join(" ").toLowerCase().includes(q)) return;
      const button = document.createElement("button");
      button.className = "post-item" + (index === activePost ? " active" : "");
      button.textContent = post.title || "Без названия";
      const small = document.createElement("small"); small.textContent = post.date || "Без даты";
      button.appendChild(small); button.addEventListener("click", () => selectPost(index)); list.appendChild(button);
    });
    if (!list.children.length) list.textContent = "Публикаций пока нет.";
  }
  function updatePostImagePreview() {
    const preview = $("post-image-preview"), src = $("post-image").value.trim();
    preview.hidden = !src; preview.innerHTML = "";
    if (src) { const img = document.createElement("img"); img.src = src; img.alt = "Предпросмотр обложки"; preview.appendChild(img); }
  }
  function selectPost(index) {
    activePost = index; const post = posts[index] || {};
    $("post-form-title").textContent = "Редактирование публикации";
    $("post-title").value = post.title || ""; $("post-date").value = post.date || "";
    $("post-tags").value = (post.tags || []).join(", "); $("post-image").value = post.image || ""; updatePostImagePreview();
    $("post-body").innerHTML = post.body || ""; $("delete-post-button").disabled = false; renderPostList();
  }
  function newPost() {
    activePost = -1; $("post-form-title").textContent = "Новая публикация";
    $("post-title").value = ""; $("post-date").value = new Date().toISOString().slice(0, 10);
    $("post-tags").value = ""; $("post-image").value = ""; updatePostImagePreview(); $("post-body").innerHTML = "";
    $("delete-post-button").disabled = true; renderPostList();
  }
  async function persistPosts() {
    await api("/api/save", { method: "POST", body: JSON.stringify({ path: "data/mechanics.json", content: JSON.stringify(posts, null, 2) }) });
    $("post-message").textContent = "Публикация сохранена. Сайт обновится автоматически.";
  }
  $("new-post-button").addEventListener("click", newPost);
  $("post-search").addEventListener("input", renderPostList);
  $("save-post-button").addEventListener("click", async () => {
    const title = $("post-title").value.trim(), body = $("post-body").innerHTML.trim();
    if (!title || !body) return alert("Добавь название и текст публикации.");
    const post = { title, date: $("post-date").value, tags: $("post-tags").value.split(",").map(x => x.trim()).filter(Boolean), image: $("post-image").value.trim(), body };
    try {
      $("save-post-button").disabled = true;
      if (activePost < 0) { posts.unshift(post); activePost = 0; } else posts[activePost] = post;
      await persistPosts(); renderPostList(); selectPost(activePost);
    } catch (error) { $("post-message").textContent = error.message; }
    finally { $("save-post-button").disabled = false; }
  });
  $("delete-post-button").addEventListener("click", async () => {
    if (activePost < 0 || !confirm("Удалить публикацию?")) return;
    const previous = posts.slice(); posts.splice(activePost, 1);
    try {
      await persistPosts();
      if (posts.length) selectPost(Math.min(activePost, posts.length - 1)); else newPost();
      renderPostList();
    } catch (error) { posts = previous; $("post-message").textContent = error.message; }
  });
  $("post-image-button").addEventListener("click", () => { pickerMode = "post"; picker.click(); });
  $("post-image").addEventListener("input", updatePostImagePreview);
  $("post-inline-image-button").addEventListener("click", () => { pickerMode = "post-inline"; picker.click(); });
  $("post-body").addEventListener("input", () => { $("post-message").textContent = "Есть несохранённые изменения"; });
  document.querySelectorAll("[data-post-command]").forEach(button => button.addEventListener("click", () => {
    $("post-body").focus(); const command = button.dataset.postCommand;
    if (command === "createLink") { const url = prompt("Адрес ссылки:"); if (url) document.execCommand(command, false, url); }
    else if (command === "formatBlock") document.execCommand(command, false, button.dataset.postValue || "h2");
    else document.execCommand(command, false, null);
  }));

  document.querySelector('[data-view="posts"]').addEventListener("click", async () => {
    if (dirty && !confirm("Есть неопубликованные изменения на странице. Перейти к публикациям без сохранения?")) return;
    dirty = false; status("Загрузка публикаций…", false);
    $("page-editor").hidden = true; $("posts-editor").hidden = false;
    $("preview-button").hidden = true; $("publish-button").hidden = true; $("origins-button").disabled = true;
    $("view-title").textContent = "Публикации сервера"; setActiveNav("posts");
    try { await loadPosts(); status("Публикации загружены", false); }
    catch (error) { $("post-message").textContent = error.message; }
  });
  boot();
})();