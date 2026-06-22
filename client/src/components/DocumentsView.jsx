import { useEffect, useMemo, useState } from 'react';
import DocEditor from './DocEditor.jsx';

const NO_CATEGORY = 'none';

// Универсальный редактор документов.
// repo — адаптер с методами list/get/createCategory/deleteCategory/createDoc/updateDoc/deleteDoc.
// canManage — может ли текущий пользователь редактировать (для личных = всегда true).
// scopeKey — ключ раздела (для сброса состояния при переключении).
export default function DocumentsView({ title, eyebrow = 'ДОКУМЕНТЫ', repo, canManage, scopeKey }) {
  const [categories, setCategories] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [docId, setDocId] = useState('');

  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [modal, setModal] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftCat, setDraftCat] = useState('');

  const loadIndex = () =>
    repo.list().then((d) => {
      setCategories(d.categories);
      setDocuments(d.documents);
    });

  // Сброс при смене раздела.
  useEffect(() => {
    setCategoryId('');
    setDocId('');
    setContent('');
    setSavedContent('');
    setError(null);
    loadIndex().catch(() => setError('Не удалось загрузить документы.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const filteredDocs = useMemo(() => {
    if (categoryId === '') return [];
    if (categoryId === NO_CATEGORY) return documents.filter((d) => d.categoryId == null);
    return documents.filter((d) => String(d.categoryId) === String(categoryId));
  }, [documents, categoryId]);

  const dirty = content !== savedContent;

  const selectDoc = async (id) => {
    setDocId(id);
    setError(null);
    if (!id) {
      setContent('');
      setSavedContent('');
      return;
    }
    setLoadingDoc(true);
    try {
      const { document } = await repo.get(id);
      setContent(document.content);
      setSavedContent(document.content);
    } catch {
      setError('Не удалось загрузить документ.');
    } finally {
      setLoadingDoc(false);
    }
  };

  const onCategoryChange = (val) => {
    setCategoryId(val);
    setDocId('');
    setContent('');
    setSavedContent('');
  };

  const save = async () => {
    if (!docId) return;
    setSaving(true);
    setError(null);
    try {
      await repo.updateDoc(docId, { content });
      setSavedContent(content);
    } catch {
      setError('Не удалось сохранить документ.');
    } finally {
      setSaving(false);
    }
  };

  const submitCategory = async () => {
    const name = draftName.trim();
    if (!name) return;
    try {
      const { category } = await repo.createCategory(name);
      await loadIndex();
      setCategoryId(String(category.id));
      setDocId('');
      setModal(null);
      setDraftName('');
    } catch {
      setError('Не удалось создать категорию.');
    }
  };

  const submitDocument = async () => {
    const t = draftName.trim();
    if (!t) return;
    const cat = draftCat && draftCat !== NO_CATEGORY ? Number(draftCat) : null;
    try {
      const { document } = await repo.createDoc({ title: t, categoryId: cat });
      await loadIndex();
      setCategoryId(cat ? String(cat) : NO_CATEGORY);
      await selectDoc(document.id);
      setModal(null);
      setDraftName('');
    } catch {
      setError('Не удалось создать документ.');
    }
  };

  const deleteDocument = async () => {
    if (!docId) return;
    if (!confirm('Удалить выбранный документ безвозвратно?')) return;
    try {
      await repo.deleteDoc(docId);
      await loadIndex();
      await selectDoc('');
    } catch {
      setError('Не удалось удалить документ.');
    }
  };

  const deleteCategory = async () => {
    if (!categoryId || categoryId === NO_CATEGORY) return;
    if (!confirm('Удалить категорию? Документы из неё станут «без категории».')) return;
    try {
      await repo.deleteCategory(categoryId);
      await loadIndex();
      onCategoryChange('');
    } catch {
      setError('Не удалось удалить категорию.');
    }
  };

  const openDocModal = () => {
    setDraftName('');
    setDraftCat(categoryId && categoryId !== '' ? categoryId : NO_CATEGORY);
    setModal('document');
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="section-eyebrow">{eyebrow}</div>
          <h1 className="page-title">{title}</h1>
        </div>
      </header>

      {error && <div className="card empty-state error-text">{error}</div>}

      <section className="card doc-toolbar">
        <div className="doc-selects">
          <div className="field">
            <label>Категория</label>
            <select value={categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">— выберите категорию —</option>
              <option value={NO_CATEGORY}>Без категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Документ</label>
            <select value={docId} disabled={categoryId === ''} onChange={(e) => selectDoc(e.target.value)}>
              <option value="">
                {categoryId === '' ? 'сначала выберите категорию' : '— выберите документ —'}
              </option>
              {filteredDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canManage && (
          <div className="doc-actions">
            <button className="ghost-btn sm" onClick={() => { setDraftName(''); setModal('category'); }}>
              + Категория
            </button>
            <button className="ghost-btn sm" onClick={openDocModal}>
              + Документ
            </button>
            {categoryId && categoryId !== NO_CATEGORY && (
              <button className="ghost-btn sm danger-text" onClick={deleteCategory}>
                Удалить категорию
              </button>
            )}
            {docId && (
              <>
                <button className="ghost-btn sm danger-text" onClick={deleteDocument}>
                  Удалить документ
                </button>
                <button className="save-btn" onClick={save} disabled={saving || !dirty}>
                  {saving ? 'Сохранение…' : dirty ? 'Сохранить' : 'Сохранено'}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {docId ? (
        loadingDoc ? (
          <div className="card empty-state">Загрузка документа…</div>
        ) : (
          <DocEditor value={content} onChange={setContent} editable={canManage} />
        )
      ) : (
        <div className="card empty-state">
          Выберите документ для просмотра{canManage ? ' или создайте новый' : ''}.
        </div>
      )}

      {modal === 'category' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Новая категория</h2>
            <label className="modal-label">Название категории</label>
            <input
              className="name-input modal-select"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCategory()}
            />
            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setModal(null)}>Отмена</button>
              <button className="save-btn" onClick={submitCategory} disabled={!draftName.trim()}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'document' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Новый документ</h2>
            <label className="modal-label">Название документа</label>
            <input
              className="name-input modal-select"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitDocument()}
            />
            <label className="modal-label" style={{ marginTop: 14 }}>Категория</label>
            <select
              className="level-select modal-select"
              value={draftCat}
              onChange={(e) => setDraftCat(e.target.value)}
            >
              <option value={NO_CATEGORY}>Без категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setModal(null)}>Отмена</button>
              <button className="save-btn" onClick={submitDocument} disabled={!draftName.trim()}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
