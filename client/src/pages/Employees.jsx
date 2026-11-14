import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import PageHeader from '../components/PageHeader.jsx';

function Member({ member }) {
  const s = member.appealStats;
  return (
    <div className="member">
      <Avatar user={member} size={40} />
      <div className="member-info">
        <div className="employee-name">{member.name}</div>
        <div className="employee-tag">@{member.username}</div>
        {s && (
          <div className="member-stats">
            <span>
              В работе <b>{s.inProgress}</b>
            </span>
            <span>
              Рассмотрено <b>{s.reviewed}</b>
            </span>
            <span>
              Всего <b>{s.total}</b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    api
      .employees()
      .then((d) => setEmployees(d.employees))
      .catch(() => setError('Не удалось загрузить список сотрудников.'));

  useEffect(() => {
    load();
  }, []);

  const resetStats = async () => {
    if (!confirm('Обнулить счётчик рассмотренных обращений у всех сотрудников?')) return;
    try {
      await api.resetAppealStats();
      load();
    } catch {
      setError('Не удалось обнулить счётчик.');
    }
  };

  // Группируем по уровню доступа, сверху — высший.
  const tiers = useMemo(() => {
    if (!employees) return [];
    const map = new Map();
    for (const e of employees) {
      if (!map.has(e.accessLevel)) {
        map.set(e.accessLevel, { level: e.accessLevel, name: e.levelName, color: e.levelColor, members: [] });
      }
      map.get(e.accessLevel).members.push(e);
    }
    return [...map.values()].sort((a, b) => b.level - a.level);
  }, [employees]);

  return (
    <div className="page">
      <PageHeader
        title="Сотрудники"
        actions={
          user.permissions?.resetStats && (
            <button className="ghost-btn sm danger-text" onClick={resetStats}>
              Обнулить «Рассмотрено»
            </button>
          )
        }
      />

      {error && <div className="card error-text">{error}</div>}
      {!error && !employees && <div className="card empty-state">Загрузка…</div>}
      {employees && employees.length === 0 && (
        <div className="card empty-state">Пока нет сотрудников с доступом.</div>
      )}

      {tiers.map((tier) => (
        <section className="panel tier" key={tier.level} style={{ '--tier-color': tier.color }}>
          <div className="panel-head">
            <h2 className="panel-title">{tier.name}</h2>
            <span className="count-pill" title="Человек на должности">
              {tier.members.length}
            </span>
          </div>
          <div className="member-grid">
            {tier.members.map((m) => (
              <Member key={m.id} member={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
