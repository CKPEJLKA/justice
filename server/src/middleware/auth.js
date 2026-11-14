import db from '../db.js';
import { isSuperuserId } from '../config.js';

// Подгружает текущего пользователя из БД по discord_id из сессии.
// isSuperuser вычисляется из ADMIN_DISCORD_IDS на каждый запрос (в БД не хранится).
export function loadUser(req, _res, next) {
  if (req.session.discordId) {
    const u = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(req.session.discordId) || null;
    if (u) u.isSuperuser = isSuperuserId(u.discord_id);
    req.user = u;
  } else {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Требует минимальный уровень доступа. Суперпользователь проходит всегда.
export function requireLevel(level) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.isSuperuser) return next();
    if (req.user.access_level < level) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
