# FIREON Studio: настройка парольного входа

FIREON Studio открывается с сайта по адресу:

`https://evgenus222.github.io/FireOn/admin.html`

Сайт остаётся на GitHub Pages. Vercel используется только как небольшой закрытый API для проверки пароля и отправки изменений в GitHub. Cloudflare и Pages CMS не нужны.

## 1. Создай серверную часть на Vercel

1. Открой https://vercel.com/ и войди через GitHub.
2. Нажми **Add New → Project** и импортируй репозиторий `evgenus222/FireOn`.
3. В настройках проекта укажи **Root Directory**: `backend`.
4. Framework Preset: **Other**. Сборка для этого API не требуется.
5. Нажми Deploy. Если первый деплой завершится ошибкой из-за отсутствующих переменных, добавь переменные из следующего раздела и повтори Deploy.

## 2. Добавь секретные переменные

Открой Vercel → Project → Settings → Environment Variables. Добавь:

| Переменная | Значение |
|---|---|
| `ADMIN_PASSWORD` | Придуманный тобой пароль для входа в Studio |
| `SESSION_SECRET` | Случайная длинная строка не менее 32 символов |
| `GITHUB_TOKEN` | Fine-grained Personal Access Token из GitHub |
| `GITHUB_REPO` | `evgenus222/FireOn` |
| `ALLOWED_ORIGIN` | `https://evgenus222.github.io` |

Для `SESSION_SECRET` можно сгенерировать случайную строку в менеджере паролей. Не используй пароль от GitHub.

**Важно:** `ADMIN_PASSWORD`, `SESSION_SECRET` и `GITHUB_TOKEN` добавляй именно в Environment Variables Vercel, а не в файлы репозитория и не в `admin-config.js`. Vercel хранит эти значения как настройки окружения, серверная функция не отдаёт их посетителям сайта.

### Как создать GitHub Token

1. Открой GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Нажми **Generate new token**.
3. Repository access: **Only select repositories** → выбери `FireOn`.
4. Repository permissions: **Contents: Read and write**.
5. Создай токен и вставь его в Vercel как `GITHUB_TOKEN`.

Не присылай токен или пароль в чат. Если токен когда-либо попадёт в публичный файл, отзови его в GitHub и создай новый.

## 3. Подключи адрес API к сайту

После первого успешного Deploy скопируй домен проекта Vercel, например `https://fireon-studio-api.vercel.app`.

Открой файл `admin-config.js` в репозитории и замени адрес-заглушку на домен своего проекта:

```js
window.FIREON_ADMIN_API = "https://fireon-studio-api.vercel.app";
```

Сохрани изменение в ветку `main`. GitHub Pages обновит сайт автоматически.

## 4. Вход

Открой:

`https://evgenus222.github.io/FireOn/admin.html`

Введи пароль, который указал в переменной `ADMIN_PASSWORD`. Сессия действует 12 часов и хранится в текущей вкладке браузера.

## Как сменить пароль

Vercel → Project → Settings → Environment Variables → измени `ADMIN_PASSWORD` → сохрани → сделай Redeploy последней версии проекта. Старые сессии можно завершить, изменив также `SESSION_SECRET`.

## Что умеет Studio

- Визуально редактировать главную, вики, обновления и страницу «Как начать».
- Создавать, изменять и удалять публикации.
- Редактировать происхождения.
- Загружать изображения.
- Сохранять изменения напрямую в ветку `main`. После этого GitHub Pages обновляет сайт.

API разрешает изменения только для владельца, у кого есть пароль, и только для перечисленных файлов и папки изображений. Это простая защита от случайных изменений посторонними, а не замена полноценной корпоративной системы безопасности.
