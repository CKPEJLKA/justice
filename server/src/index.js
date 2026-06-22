import express from 'express';
import session from 'express-session';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SqliteStoreFactory from 'better-sqlite3-session-store';

import { config } from './config.js';
import db from './db.js';
import { loadUser } from './middleware/auth.js';
import authRouter from './auth/discord.js';
import apiRouter from './routes/api.js';
import docsRouter from './routes/docs.js';
import personalDocsRouter from './routes/personalDocs.js';
import appealsRouter from './routes/appeals.js';
import { startForumSync } from './forumSync.js';

const app = express();
const SqliteStore = SqliteStoreFactory(session);

app.set('trust proxy', 1);

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  }),
);
app.use(express.json());

app.use(
  session({
    store: new SqliteStore({
      client: db,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // в проде за HTTPS поставьте true
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(loadUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/docs', docsRouter);
app.use('/api/personal-docs', personalDocsRouter);
app.use('/api/appeals', appealsRouter);
app.use('/api', apiRouter);

// Одно-портовый режим: отдаём собранный React (client/dist), если он есть.
// Тогда весь сайт (фронтенд + API) работает на одном порту/домене.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  // SPA-fallback: любые не-API маршруты отдают index.html (роутинг на клиенте).
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('  Статика клиента: client/dist (одно-портовый режим)');
}

app.listen(config.port, () => {
  console.log(`\n  Министерство юстиции — сервер запущен: http://localhost:${config.port}`);
  if (!config.discord.clientId || !config.discord.clientSecret) {
    console.warn('  ⚠  Discord OAuth не настроен — заполните server/.env (DISCORD_CLIENT_ID / SECRET).');
  }
  if (config.adminDiscordIds.length === 0) {
    console.warn('  ⚠  ADMIN_DISCORD_IDS пуст — никто не получит высший уровень автоматически.');
  }
  console.log('');
  startForumSync();
});
