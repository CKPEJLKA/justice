import express from 'express';
import db from '../db.js';
import { DEPUTY_LEVEL, permissionsFor } from '../config.js';
import { requireLevel } from '../middleware/auth.js';
import { AUDIT_CATEGORIES } from '../audit.js';

const router = express.Router();
const permsOf = (u) => permissionsFor(u.access_level, u.isSuperuser);

// Журнал: министр, заместитель (и суперпользователь — проходит requireLevel всегда).
// ?category=user|minister|appeal|doc|settings  ?before=<id> — постраничная подгрузка.
router.get('/', requireLevel(DEPUTY_LEVEL), (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const where = [];
  const params = [];

  // Записи об Администраторах — только тем, кто может ими управлять.
  if (!permsOf(req.user).manageAdmins) where.push('sensitive = 0');

  const category = String(req.query.category || '');
  if (AUDIT_CATEGORIES[category]) {
    where.push('action LIKE ?');
    params.push(`${category}.%`);
  }
  const before = Number(req.query.before);
  if (before > 0) {
    where.push('id < ?');
    params.push(before);
  }

  const rows = db
    .prepare(
      `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY id DESC LIMIT ?`,
    )
    .all(...params, limit + 1);

  const entries = rows.slice(0, limit).map((r) => {
    const cat = r.action.split('.')[0];
    return {
      id: r.id,
      createdAt: r.created_at,
      actorName: r.actor_name,
      action: r.action,
      category: cat,
      categoryLabel: AUDIT_CATEGORIES[cat] || cat,
      summary: r.summary,
    };
  });
  res.json({ entries, hasMore: rows.length > limit, categories: AUDIT_CATEGORIES });
});

// Удаление записи — только суперпользователь. Само удаление в журнал не пишется.
router.delete('/:id', requireLevel(DEPUTY_LEVEL), (req, res) => {
  if (!permsOf(req.user).deleteAudit) return res.status(403).json({ error: 'forbidden' });
  const info = db.prepare('DELETE FROM audit_log WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

export default router;
