import db from '../db.js';

// Подгружает текущего пользователя из БД по discord_id из сессии.
export function loadUser(req, _res, next) {
  if (req.session.discordId) {
    req.user =
      db.prepare('SELECT * FROM users WHERE discord_id = ?').get(req.session.discordId) ||
      null;
  } else {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Требует минимальный уровень доступа.
export function requireLevel(level) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.access_level < level) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
