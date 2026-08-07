import express from 'express';
import crypto from 'node:crypto';
import { config, TOP_LEVEL } from '../config.js';
import db from '../db.js';

const router = express.Router();
const DISCORD_API = 'https://discord.com/api';

// Создаёт/обновляет пользователя по данным из Discord, возвращает его discord_id.
function upsertDiscordUser(du) {
  const isAdmin = config.adminDiscordIds.includes(du.id);
  const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(du.id);
  if (existing) {
    const level = isAdmin ? TOP_LEVEL : existing.access_level;
    db.prepare(
      `UPDATE users SET username = ?, global_name = ?, avatar = ?, access_level = ?, updated_at = datetime('now')
       WHERE discord_id = ?`,
    ).run(du.username, du.global_name || null, du.avatar || null, level, du.id);
  } else {
    const level = isAdmin ? TOP_LEVEL : 0;
    db.prepare(
      `INSERT INTO users (discord_id, username, global_name, avatar, access_level) VALUES (?, ?, ?, ?, ?)`,
    ).run(du.id, du.username, du.global_name || null, du.avatar || null, level);
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
