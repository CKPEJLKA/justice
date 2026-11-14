import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import AdminTabs from '../components/AdminTabs.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';

const PAGE = 50;

function formatTime(s) {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(d);
}

export default function AuditLog() {
  const { user } = useAuth();
  const canDelete = !!user.permissions?.deleteAudit;
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState({});
  const [entries, setEntries] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (cat) => {
    setEntries(null);
    setError(null);
    try {
      const d = await api.audit({ category: cat, limit: PAGE });
      setEntries(d.entries);
      setHasMore(d.hasMore);
      setCategories(d.categories);
    } catch {
      setError('Не удалось загрузить журнал.');
    }
  }, []);

  useEffect(() => {
    load(category);
  }, [category, load]);

  const loadMore = async () => {
    if (!entries?.length) return;
    setLoadingMore(true);
    try {
      const d = await api.audit({ category, limit: PAGE, before: entries[entries.length - 1].id });
      setEntries([...entries, ...d.entries]);
      setHasMore(d.hasMore);
    } catch {
      setError('Не удалось загрузить записи.');
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = async (e) => {
    if (!confirm('Удалить эту запись из журнала? Восстановить её будет нельзя.')) return;
    try {
      await api.deleteAuditEntry(e.id);
      setEntries((list) => list.filter((x) => x.id !== e.id));
    } catch {
      setError('Не удалось удалить запись.');
    }
  };

  return (
    <div className="page">
      <PageHeader title="Журнал действий" crumbs={[{ label: 'Админ-панель', to: '/admin' }]} />
      <AdminTabs />

      {error && <div className="card error-text">{error}</div>}

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Записи</h2>
          <div className="panel-tools">
            <label className="employee-tag" htmlFor="audit-cat">
              Раздел
            </label>
            <select
              id="audit-cat"
              className="level-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Все действия</option>
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!entries && !error && <div className="card empty-state" style={{ border: 'none' }}>Загрузка…</div>}
        {entries && entries.length === 0 && (
          <div className="card empty-state" style={{ border: 'none' }}>Записей нет.</div>
        )}

        {entries && entries.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Время, МСК</th>
                  <th>Раздел</th>
                  <th>Кто</th>
                  <th>Действие</th>
                  {canDelete && <th aria-label="Удаление" />}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="audit-time">{formatTime(e.createdAt)}</td>
                    <td>
                      <span className={`tag audit-cat audit-cat-${e.category}`}>{e.categoryLabel}</span>
                    </td>
                    <td className="audit-actor">{e.actorName}</td>
                    <td className="audit-summary">{e.summary}</td>
                    {canDelete && (
                      <td>
                        <button
                          className="mini-btn danger"
                          title="Удалить запись"
                          aria-label="Удалить запись"
                          onClick={() => remove(e)}
                        >
                          <Icon name="trash" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="audit-more">
            <button className="ghost-btn sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Загрузка…' : 'Показать ещё 50'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
