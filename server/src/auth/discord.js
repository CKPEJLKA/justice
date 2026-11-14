import express from 'express';
import crypto from 'node:crypto';
import { config, TOP_LEVEL, isSuperuserId } from '../config.js';
import db from '../db.js';
import { logAudit } from '../audit.js';

const router = express.Router();
const DISCORD_API = 'https://discord.com/api';

// Создаёт/обновляет пользователя по данным из Discord, возвращает его discord_id.
// Уровень существующего пользователя при входе НЕ меняется (в т.ч. у суперпользователя —
// его абсолютные права не зависят от уровня, а уровень определяет только отображаемую роль).
function upsertDiscordUser(du) {
  const isSuperuser = isSuperuserId(du.id);
  const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(du.id);
  if (existing) {
    db.prepare(
      `UPDATE users SET username = ?, global_name = ?, avatar = ?, updated_at = datetime('now')
       WHERE discord_id = ?`,
    ).run(du.username, du.global_name || null, du.avatar || null, du.id);
  } else {
    // Первичная настройка: новый суперпользователь становится министром, если министра ещё нет.
    const ministerExists = db.prepare('SELECT 1 FROM users WHERE access_level = ?').get(TOP_LEVEL);
    const level = isSuperuser && !ministerExists ? TOP_LEVEL : 0;
    const info = db
      .prepare(
        `INSERT INTO users (discord_id, username, global_name, avatar, access_level) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(du.id, du.username, du.global_name || null, du.avatar || null, level);
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    logAudit(
      created,
      'user.register',
      level === TOP_LEVEL
        ? 'Первый вход на сайт — назначен министром (первичная настройка)'
        : 'Первый вход на сайт — ожидает выдачи доступа',
    );
  }
  return du.id;
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`user fetch failed: ${res.status}`);
  return res.json();
}

// ===== Обычный сайт: OAuth2 через редирект (сессионная кука) =====

// Шаг 1: редирект на страницу авторизации Discord.
router.get('/discord', (req, res) => {
  if (!config.discord.clientId) {
    return res.redirect(`${config.clientUrl}/login?error=not_configured`);
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

// Шаг 2: Discord возвращает пользователя сюда с кодом.
router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.oauthState) {
    return res.redirect(`${config.clientUrl}/login?error=state`);
  }
  delete req.session.oauthState;

  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: config.discord.redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const token = await tokenRes.json();

    const du = await fetchDiscordUser(token.access_token);
    req.session.discordId = upsertDiscordUser(du);
    res.redirect(`${config.clientUrl}/`);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect(`${config.clientUrl}/login?error=oauth`);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

export default router;
