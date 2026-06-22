import express from 'express';
import db from '../db.js';
import { MIN_PANEL_LEVEL } from '../config.js';
import { requireLevel } from '../middleware/auth.js';

const router = express.Router();
// Личные документы — у каждого сотрудника свои; доступны любому с доступом к панели.
const requireStaff = requireLevel(MIN_PANEL_LEVEL);

const toCategory = (c) => ({ id: c.id, name: c.name });
const toDocMeta = (d) => ({ id: d.id, title: d.title, categoryId: d.category_id });
const toDocFull = (d) => ({
  id: d.id,
  title: d.title,
  categoryId: d.category_id,
  content: d.content,
  updatedAt: d.updated_at,
});

const ownsCategory = (id, uid) =>
  !!db.prepare('SELECT 1 FROM personal_doc_categories WHERE id = ? AND user_id = ?').get(id, uid);

// Список своих категорий и документов.
router.get('/', requireStaff, (req, res) => {
  const uid = req.user.id;
  const categories = db
    .prepare('SELECT * FROM personal_doc_categories WHERE user_id = ? ORDER BY name')
    .all(uid)
    .map(toCategory);
  const documents = db
    .prepare('SELECT * FROM personal_documents WHERE user_id = ? ORDER BY title')
    .all(uid)
    .map(toDocMeta);
  res.json({ categories, documents });
});

router.get('/documents/:id', requireStaff, (req, res) => {
  const d = db
    .prepare('SELECT * FROM personal_documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!d) return res.status(404).json({ error: 'not_found' });
  res.json({ document: toDocFull(d) });
});

router.post('/categories', requireStaff, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'empty_name' });
  const info = db
    .prepare('INSERT INTO personal_doc_categories (user_id, name) VALUES (?, ?)')
    .run(req.user.id, name);
  res.json({
    category: toCategory(db.prepare('SELECT * FROM personal_doc_categories WHERE id = ?').get(info.lastInsertRowid)),
  });
});

router.delete('/categories/:id', requireStaff, (req, res) => {
  db.prepare('UPDATE personal_documents SET category_id = NULL WHERE category_id = ? AND user_id = ?').run(
    req.params.id,
    req.user.id,
  );
  db.prepare('DELETE FROM personal_doc_categories WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/documents', requireStaff, (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120);
  if (!title) return res.status(400).json({ error: 'empty_title' });
  let categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
  if (categoryId && !ownsCategory(categoryId, req.user.id)) categoryId = null;
  const info = db
    .prepare('INSERT INTO personal_documents (user_id, category_id, title, content) VALUES (?, ?, ?, ?)')
    .run(req.user.id, categoryId, title, String(req.body.content || ''));
  res.json({ document: toDocFull(db.prepare('SELECT * FROM personal_documents WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/documents/:id', requireStaff, (req, res) => {
  const d = db
    .prepare('SELECT * FROM personal_documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
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
    if (c && !ownsCategory(c, req.user.id)) c = null;
    updates.push('category_id = ?');
    params.push(c);
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing_to_update' });

  params.push(req.params.id, req.user.id);
  db.prepare(
    `UPDATE personal_documents SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
  ).run(...params);
  res.json({ document: toDocFull(db.prepare('SELECT * FROM personal_documents WHERE id = ?').get(req.params.id)) });
});

router.delete('/documents/:id', requireStaff, (req, res) => {
  db.prepare('DELETE FROM personal_documents WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
