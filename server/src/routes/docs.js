import express from 'express';
import db from '../db.js';
import { MIN_PANEL_LEVEL, ADVISOR_LEVEL, DEPUTY_LEVEL } from '../config.js';
import { requireLevel } from '../middleware/auth.js';

const router = express.Router();

// Уровень, нужный для просмотра каждого раздела.
const SCOPES = {
  prosecutor: { view: MIN_PANEL_LEVEL }, // все сотрудники
  general: { view: ADVISOR_LEVEL }, // министр, заместитель, советник
};

// Проверка доступа к разделу (по :scope).
function scopeView(req, res, next) {
  const cfg = SCOPES[req.params.scope];
  if (!cfg) return res.status(404).json({ error: 'unknown_scope' });
  if (!req.user || req.user.access_level < cfg.view) {
    return res.status(403).json({ error: 'forbidden' });
  }
  req.scope = req.params.scope;
  next();
}

// Управление документами/категориями — министр и заместитель.
const requireManage = requireLevel(DEPUTY_LEVEL);

const toCategory = (c) => ({ id: c.id, name: c.name });
const toDocMeta = (d) => ({ id: d.id, title: d.title, categoryId: d.category_id });
const toDocFull = (d) => ({
  id: d.id,
  title: d.title,
  categoryId: d.category_id,
  content: d.content,
  updatedAt: d.updated_at,
});

const categoryExists = (id, scope) =>
  !!db.prepare('SELECT 1 FROM doc_categories WHERE id = ? AND scope = ?').get(id, scope);

// Категории + список документов раздела (без содержимого).
router.get('/:scope', scopeView, (req, res) => {
  const categories = db
    .prepare('SELECT * FROM doc_categories WHERE scope = ? ORDER BY name')
    .all(req.scope)
    .map(toCategory);
  const documents = db
    .prepare('SELECT * FROM documents WHERE scope = ? ORDER BY title')
    .all(req.scope)
    .map(toDocMeta);
  res.json({ categories, documents });
});

// Полный документ.
router.get('/:scope/documents/:id', scopeView, (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ? AND scope = ?').get(req.params.id, req.scope);
  if (!d) return res.status(404).json({ error: 'not_found' });
  res.json({ document: toDocFull(d) });
});

// --- Категории ---
router.post('/:scope/categories', scopeView, requireManage, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'empty_name' });
  const info = db
    .prepare('INSERT INTO doc_categories (scope, name) VALUES (?, ?)')
    .run(req.scope, name);
  res.json({
    category: toCategory(db.prepare('SELECT * FROM doc_categories WHERE id = ?').get(info.lastInsertRowid)),
  });
});

router.delete('/:scope/categories/:id', scopeView, requireManage, (req, res) => {
  db.prepare('UPDATE documents SET category_id = NULL WHERE category_id = ? AND scope = ?').run(
    req.params.id,
    req.scope,
  );
  db.prepare('DELETE FROM doc_categories WHERE id = ? AND scope = ?').run(req.params.id, req.scope);
  res.json({ ok: true });
});

// --- Документы ---
router.post('/:scope/documents', scopeView, requireManage, (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120);
  if (!title) return res.status(400).json({ error: 'empty_title' });
  let categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
  if (categoryId && !categoryExists(categoryId, req.scope)) categoryId = null;
  const info = db
    .prepare('INSERT INTO documents (scope, category_id, title, content) VALUES (?, ?, ?, ?)')
    .run(req.scope, categoryId, title, String(req.body.content || ''));
  res.json({ document: toDocFull(db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/:scope/documents/:id', scopeView, requireManage, (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ? AND scope = ?').get(req.params.id, req.scope);
  if (!d) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const params = [];
  if (req.body.title !== undefined) {
    const t = String(req.body.title).trim().slice(0, 120);
    if (!t) return res.status(400).json({ error: 'empty_title' });
    updates.push('title = ?');
    params.push(t);
  }
  if (req.body.content !== undefined) {
    updates.push('content = ?');
    params.push(String(req.body.content));
  }
  if (req.body.categoryId !== undefined) {
    let c = req.body.categoryId ? Number(req.body.categoryId) : null;
    if (c && !categoryExists(c, req.scope)) c = null;
    updates.push('category_id = ?');
    params.push(c);
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing_to_update' });

  params.push(req.params.id);
  db.prepare(`UPDATE documents SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
    ...params,
  );
  res.json({ document: toDocFull(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id)) });
});

router.delete('/:scope/documents/:id', scopeView, requireManage, (req, res) => {
  db.prepare('DELETE FROM documents WHERE id = ? AND scope = ?').run(req.params.id, req.scope);
  res.json({ ok: true });
});

export default router;
