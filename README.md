# Министерство юстиции штата Senora (GTA5RP)

Веб-панель министерства: авторизация через **Discord** (идентификация по Discord ID),
уровни доступа, список сотрудников и админ-панель.

- **Бэкенд:** Node.js + Express + SQLite (`server/`)
- **Фронтенд:** React + Vite (`client/`)
- **Авторизация:** Discord OAuth2 (scope `identify`)

> Сейчас создан только **один, высший уровень доступа — «Министр юстиции» (100)**.
> Остальные пользователи входят со статусом «Без доступа» (ожидают выдачи уровня).
> Добавить новые уровни позже можно в `server/src/config.js` (`ACCESS_LEVELS`)
> и `client/src/constants.js`.

---

## 1. Создание Discord-приложения (OAuth)

1. Откройте https://discord.com/developers/applications → **New Application**, задайте имя.
2. Слева → вкладка **OAuth2**.
3. Скопируйте **Client ID** и нажмите **Reset Secret** → скопируйте **Client Secret**.
4. В разделе **Redirects** добавьте точно такой URL:
   ```
   http://localhost:3001/api/auth/discord/callback
   ```
   Нажмите **Save Changes**.
5. Узнайте свой **Discord ID**: в Discord включите *Настройки → Расширенные → Режим разработчика*,
   затем ПКМ по своему профилю → **Копировать ID пользователя**. Это нужно, чтобы выдать себе
   высший уровень.

## 2. Настройка переменных окружения

**`server/.env`** (скопируйте из `server/.env.example`):

```env
PORT=3001
CLIENT_URL=http://localhost:5173
SESSION_SECRET=любая-длинная-случайная-строка
DISCORD_CLIENT_ID=ваш_client_id
DISCORD_CLIENT_SECRET=ваш_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/api/auth/discord/callback
ADMIN_DISCORD_IDS=ваш_discord_id
```

> `ADMIN_DISCORD_IDS` — кому при первом входе сразу выдаётся уровень «Министр».
> Можно указать несколько ID через запятую.

**`client/.env`** (опционально, по умолчанию и так работает):

```env
VITE_API_URL=http://localhost:3001
```

## 3. Установка и запуск

В корне проекта (`D:\my\projects\justice`):

```powershell
# установить зависимости сервера и клиента
npm run install:all

# (опционально) установить concurrently для запуска одной командой
npm install

# запустить сервер и клиент вместе
npm run dev
```

Либо в двух отдельных терминалах:

```powershell
npm run server   # http://localhost:3001
npm run client   # http://localhost:5173
```

Откройте **http://localhost:5173**, нажмите «Войти через Discord».

- Если ваш Discord ID указан в `ADMIN_DISCORD_IDS` — сразу попадёте как **Министр**.
- Иначе увидите экран «Ожидание доступа»; министр выдаёт уровень в **Админ-панели**.

---

## Структура

```
justice/
├── server/                 # Node.js + Express API
│   ├── src/
│   │   ├── index.js        # точка входа, сессии, middleware
│   │   ├── config.js       # конфиг + уровни доступа (ACCESS_LEVELS)
│   │   ├── db.js           # SQLite (better-sqlite3), таблица users
│   │   ├── auth/discord.js # OAuth2: вход, callback, выход
│   │   ├── middleware/auth.js
│   │   ├── routes/api.js   # /me, /stats, /employees, /admin/*
│   │   └── routes/docs.js  # /docs/* — категории и документы (BB-Code)
│   └── data/justice.db     # БД (создаётся автоматически, в .gitignore)
└── client/                 # React + Vite
    └── src/
        ├── pages/          # Login, Dashboard, Profile, Employees, Admin, NoAccess
        ├── components/     # Sidebar, Layout, Avatar, Clock, StatCard
        ├── context/        # AuthContext
        └── styles.css      # тёмная тема с золотыми акцентами
```

## Уровни доступа и права

| Ур. | Название                       | Админ-панель | Менять роли | Выдавать доступ новым | Менять имена | Передать роль министра |
|----:|--------------------------------|:------------:|:-----------:|:---------------------:|:------------:|:----------------------:|
| 100 | Министр юстиции (единственный) | ✅           | ✅          | ✅                    | ✅           | ✅                     |
| 90  | Заместитель министра юстиции   | ✅           | ✅          | ✅                    | ✅           | —                      |
| 80  | Советник министра юстиции      | ✅           | ✅          | —                     | —            | —                      |
| 50  | Прокурор                       | —            | —           | —                     | —            | —                      |
| 40  | Помощник прокурора             | —            | —           | —                     | —            | —                      |
| 0   | Без доступа (по умолчанию)     | —            | —           | —                     | —            | —                      |

Примечания:
- **Министр** — единственный. Роль не выдаётся через выпадающий список, а **передаётся**
  красной кнопкой на главной странице (видит только министр). Прежний министр становится
  заместителем.
- **Советник** может менять роли только существующим сотрудникам и не выше своего уровня;
  не может авторизовывать новых пользователей и менять имена.
- **Имена** берутся из Discord, но министр и заместитель могут переопределить их в админ-панели
  (хранится в `display_name`).
- Ячейку «Ожидают доступа» на главной видят только министр, заместитель и советник.

Уровни и права настраиваются в `server/src/config.js` (`ACCESS_LEVELS`, `permissionsFor`).
