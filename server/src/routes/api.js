import express from 'express';
import db from '../db.js';
import {
  ACCESS_LEVELS,
  TOP_LEVEL,
  DEPUTY_LEVEL,
  ADVISOR_LEVEL,
  PROSECUTOR_LEVEL,
  ASSISTANT_LEVEL,
  MIN_PANEL_LEVEL,
  ADMIN_LEVEL,
  permissionsFor,
} from '../config.js';
import { requireLevel } from '../middleware/auth.js';
import { appealStatsFor } from './appeals.js';

const router = express.Router();

function avatarUrl(u) {
  if (u.avatar) {
    return `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128`;
  }
  return null;
}

function resolveName(u) {
  return u.display_name || u.global_name || u.username;
}

// Приводим запись из БД к безопасному для фронтенда виду.
function publicUser(u, { includePerms = false } = {}) {
  if (!u) return null;
  const lvl = ACCESS_LEVELS[u.access_level] || {
    name: `Уровень ${u.access_level}`,
    short: '',
    color: '#888',
  };
  const out = {
    id: u.id,
    discordId: u.discord_id,
    username: u.username,
    name: resolveName(u),
    customName: u.display_name || null,
    avatarUrl: avatarUrl(u),
    accessLevel: u.access_level,
    levelName: lvl.name,
    levelShort: lvl.short,
    levelColor: lvl.color,
    createdAt: u.created_at,
  };
  if (includePerms) out.permissions = permissionsFor(u.access_level);
  return out;
}

const countAt = (level) =>
  db.prepare('SELECT COUNT(*) c FROM users WHERE access_level = ?').get(level).c;

// Текущий пользователь (с правами).
router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user, { includePerms: true }) });
});

// Справочник уровней доступа.
router.get('/meta', (_req, res) => {
  res.json({ levels: ACCESS_LEVELS, topLevel: TOP_LEVEL, minPanelLevel: MIN_PANEL_LEVEL });
});

// Статистика для главной + текущий министр.
router.get('/stats', requireLevel(MIN_PANEL_LEVEL), (_req, res) => {
  const staff = db.prepare('SELECT COUNT(*) c FROM users WHERE access_level >= ?').get(MIN_PANEL_LEVEL).c;
  const minister = db
    .prepare('SELECT * FROM users WHERE access_level = ? ORDER BY updated_at LIMIT 1')
    .get(TOP_LEVEL);

  res.json({
    staff,
    deputies: countAt(DEPUTY_LEVEL),
    advisors: countAt(ADVISOR_LEVEL),
    prosecutors: countAt(PROSECUTOR_LEVEL),
    assistants: countAt(ASSISTANT_LEVEL),
    pending: countAt(0),
    minister: minister
      ? { name: resolveName(minister), avatarUrl: avatarUrl(minister) }
      : null,
  });
});

// Список сотрудников (с доступом). Статистику обращений видят министр/заместитель/советник.
router.get('/employees', requireLevel(MIN_PANEL_LEVEL), (req, res) => {
  const rows = db
    .prepare('SELECT * FROM users WHERE access_level >= ? ORDER BY access_level DESC, username')
    .all(MIN_PANEL_LEVEL);
  const canViewStats = req.user.access_level >= ADVISOR_LEVEL;
  const employees = rows.map((u) => {
    const pu = publicUser(u);
    if (canViewStats) pu.appealStats = appealStatsFor(u.id);
    return pu;
  });
  res.json({ employees });
});

// --- Админ: пользователи (министр / заместитель / советник) ---
router.get('/admin/users', requireLevel(ADMIN_LEVEL), (_req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY access_level DESC, created_at').all();
  res.json({ users: rows.map((u) => publicUser(u)) });
});

// Изменение имени и/или уровня доступа.
router.patch('/admin/users/:id', requireLevel(ADMIN_LEVEL), (req, res) => {
  const actor = req.user;
  const perms = permissionsFor(actor.access_level);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const params = [];

  // --- Имя ---
  if (req.body.name !== undefined) {
    if (!perms.changeNames) return res.status(403).json({ error: 'no_name_permission' });
    const newName = String(req.body.name).trim().slice(0, 60);
    updates.push('display_name = ?');
    params.push(newName.length ? newName : null); // пусто => сброс к имени из Discord
  }

  // --- Уровень доступа ---
  if (req.body.accessLevel !== undefined) {
    const newLevel = Number(req.body.accessLevel);
    if (!(newLevel in ACCESS_LEVELS)) return res.status(400).json({ error: 'invalid_level' });
    if (!perms.changeRoles) return res.status(403).json({ error: 'no_role_permission' });
    // Роль министра выдаётся только через передачу.
    if (newLevel === TOP_LEVEL || target.access_level === TOP_LEVEL) {
      return res.status(400).json({ error: 'minister_via_transfer' });
    }
    // Нельзя выдать уровень выше своего и нельзя трогать тех, кто выше тебя.
    if (newLevel > actor.access_level) return res.status(403).json({ error: 'above_your_level' });
    if (target.access_level > actor.access_level) return res.status(403).json({ error: 'target_above_you' });
    // Выдача/снятие доступа (через порог сотрудника) требует права authorizeUsers.
    const crossesAccess =
      (target.access_level < MIN_PANEL_LEVEL && newLevel >= MIN_PANEL_LEVEL) ||
      (target.access_level >= MIN_PANEL_LEVEL && newLevel < MIN_PANEL_LEVEL);
    if (crossesAccess && !perms.authorizeUsers) {
      return res.status(403).json({ error: 'no_authorize_permission' });
    }
    updates.push('access_level = ?');
    params.push(newLevel);
  }

  if (!updates.length) return res.status(400).json({ error: 'nothing_to_update' });

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
    ...params,
  );
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)) });
});

// Передача роли министра (только действующий министр).
router.post('/admin/transfer-minister', requireLevel(TOP_LEVEL), (req, res) => {
  const targetId = Number(req.body.targetId);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.discord_id === req.user.discord_id) {
    return res.status(400).json({ error: 'already_minister' });
  }

  const transfer = db.transaction(() => {
    // Действующий министр становится заместителем.
    db.prepare(`UPDATE users SET access_level = ?, updated_at = datetime('now') WHERE access_level = ?`).run(
      DEPUTY_LEVEL,
      TOP_LEVEL,
    );
    // Новый министр.
    db.prepare(`UPDATE users SET access_level = ?, updated_at = datetime('now') WHERE id = ?`).run(
      TOP_LEVEL,
      targetId,
    );
  });
  transfer();

  res.json({ ok: true, newMinister: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(targetId)) });
});

// Полное удаление пользователя из базы (полная деавторизация).
// Доступно министру и заместителю (право authorizeUsers).
router.delete('/admin/users/:id', requireLevel(DEPUTY_LEVEL), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.discord_id === req.user.discord_id) {
    return res.status(400).json({ error: 'cannot_delete_self' });
  }
  if (target.access_level === TOP_LEVEL) {
    return res.status(400).json({ error: 'cannot_delete_minister' });
  }
  if (target.access_level > req.user.access_level) {
    return res.status(403).json({ error: 'target_above_you' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
