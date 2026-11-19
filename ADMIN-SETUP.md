# FIREON Studio: подключение админ-панели

Админка находится по адресу:

`https://evgenus222.github.io/FireOn/admin.html`

Она не будет работать до подключения Cloudflare Worker. Это сделано специально: GitHub OAuth и ключи доступа нельзя безопасно хранить в обычном JavaScript на GitHub Pages.

## 1. Подготовить Cloudflare Worker

1. Войди в Cloudflare и открой **Workers & Pages**.
2. Создай Worker с именем `fireon-admin-api`.
3. Открой его редактор кода и замени стартовый код содержимым файла `cloudflare/worker.js` из этого репозитория.
4. Нажми **Deploy**. Запомни адрес Worker, он будет выглядеть примерно так: `https://fireon-admin-api.ТВОЙ-АККАУНТ.workers.dev`.

## 2. Создать KV для сессий

1. В Cloudflare открой **Storage & databases → KV**.
2. Создай namespace, например `FIREON_ADMIN_SESSIONS`.
3. Вернись в Worker → **Settings → Bindings**.
4. Добавь **KV namespace**:
   - Variable name: `SESSIONS`
   - KV namespace: `FIREON_ADMIN_SESSIONS`

## 3. Добавить переменные Worker

В Worker открой **Settings → Variables and Secrets** и добавь:

| Имя | Значение |
|---|---|
| `GITHUB_REPO` | `evgenus222/FireOn` |
| `ALLOWED_GITHUB_USER` | `evgenus222` |
| `SITE_URL` | `https://evgenus222.github.io/FireOn` |
| `ADMIN_ORIGIN` | `https://evgenus222.github.io` |

Пока не добавляй `GITHUB_CLIENT_ID` и `GITHUB_CLIENT_SECRET` - они появятся на следующем шаге.

## 4. Создать GitHub OAuth App

1. Открой GitHub → **Settings → Developer settings → OAuth Apps**.
2. Нажми **New OAuth App**.
3. Заполни:
   - Application name: `FIREON Studio`
   - Homepage URL: `https://evgenus222.github.io/FireOn`
   - Authorization callback URL: адрес Worker + `/auth/callback`. Например: `https://fireon-admin-api.ТВОЙ-АККАУНТ.workers.dev/auth/callback`
4. Создай приложение и скопируй **Client ID**.
5. Нажми **Generate a new client secret** и скопируй секрет.

Вернись в настройки Worker и добавь:
- `GITHUB_CLIENT_ID` - обычная переменная со значением Client ID.
- `GITHUB_CLIENT_SECRET` - именно Secret, не обычная переменная.

Не отправляй Client Secret в чат и не добавляй его в файлы сайта.

## 5. Подключить Worker к странице админки

Открой `admin-config.js` и замени пример:

```js
window.FIREON_ADMIN_API = "https://YOUR-WORKER.workers.dev";
```

на реальный адрес своего Worker. Сохрани файл в ветку `main` репозитория.

После публикации сайта открой `https://evgenus222.github.io/FireOn/admin.html` и нажми **Войти через GitHub**.

## Что уже предусмотрено

- Войти может только GitHub-аккаунт `evgenus222`.
- GitHub Client Secret и OAuth-токен не попадают в публичный код сайта.
- Сессии хранятся в Cloudflare KV и автоматически истекают через 7 дней.
- Изображения принимаются в PNG, JPG, WEBP и GIF, размером до 5 МБ.
- Админка сохраняет изменения в репозиторий `evgenus222/FireOn` через GitHub API.
- После коммита GitHub Pages самостоятельно обновляет публичный сайт.

Если Worker или OAuth ещё не настроены, админка покажет экран входа с подсказкой, а не откроет редактор без защиты.
