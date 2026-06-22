import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';

function MemberCard({ member, top }) {
  return (
    <div className={'org-member' + (top ? ' org-member-top' : '')}>
      <Avatar user={member} size={top ? 76 : 54} />
      <div className="org-member-name">{member.name}</div>
      <div className="org-member-tag">@{member.username}</div>
      {member.appealStats && (
        <div className="org-member-stats" title="Обращения, где назначен прокурором">
          <span className="stat-reviewed">✅ {member.appealStats.reviewed}</span>
          <span className="stat-inwork">⏳ {member.appealStats.inProgress}</span>
        </div>
      )}
    </div>
  );
}

export default function Employees() {
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .employees()
      .then((d) => setEmployees(d.employees))
      .catch(() => setError('Не удалось загрузить список сотрудников.'));
  }, []);

  // Группируем по уровню доступа и сортируем сверху вниз (от высшего).
  const tiers = useMemo(() => {
    if (!employees) return [];
    const map = new Map();
    for (const e of employees) {
      if (!map.has(e.accessLevel)) {
        map.set(e.accessLevel, {
          level: e.accessLevel,
          name: e.levelName,
          color: e.levelColor,
          members: [],
        });
      }
      map.get(e.accessLevel).members.push(e);
    }
    return [...map.values()].sort((a, b) => b.level - a.level);
  }, [employees]);

  return (
    <div className="page">
      <header className="page-head org-head">
        <div>
          <div className="section-eyebrow">СОСТАВ</div>
          <h1 className="page-title">Структура министерства</h1>
        </div>
        {employees && <div className="count-pill">{employees.length}</div>}
      </header>

      {error && <div className="card empty-state">{error}</div>}
      {!error && !employees && <div className="card empty-state">Загрузка…</div>}
      {employees && employees.length === 0 && (
        <div className="card empty-state">Пока нет сотрудников с доступом.</div>
      )}

      {tiers.length > 0 && (
        <div className="org-structure">
          {tiers.map((tier, idx) => (
            <div className="org-tier" key={tier.level}>
              <div className="org-tier-title" style={{ color: tier.color }}>
                {tier.name}
                <span className="org-tier-count">{tier.members.length}</span>
              </div>
              <div className="org-row">
                {tier.members.map((m) => (
                  <MemberCard key={m.id} member={m} top={idx === 0} />
                ))}
              </div>
              {idx < tiers.length - 1 && <div className="org-connector" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
