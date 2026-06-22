import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import StatCard from '../components/StatCard.jsx';

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(d);
}

export default function Profile() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.myAppealStats().then((d) => setStats(d.stats)).catch(() => setStats(null));
  }, []);

  return (
    <div className="page">
      <header className="hero card">
        <Avatar user={user} size={88} />
        <div className="hero-info">
          <div className="hero-eyebrow">ПРОФИЛЬ</div>
          <h1 className="hero-name">{user.name}</h1>
          <div className="hero-role" style={{ color: user.levelColor }}>
            {user.levelName}
          </div>
        </div>
      </header>

      <section className="card">
        <div className="section-eyebrow">ОБРАЩЕНИЯ</div>
        <h2 className="section-title">Моя статистика</h2>
        <p className="section-sub">Обращения, на которые вы были назначены прокурором.</p>
        <div className="stat-grid">
          <StatCard icon="✅" label="Рассмотрено" value={stats?.reviewed ?? '—'} accent="#6cc18e" />
          <StatCard icon="⏳" label="В работе" value={stats?.inProgress ?? '—'} />
          <StatCard icon="📨" label="Всего назначено" value={stats?.total ?? '—'} />
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Личные данные</h2>
        <dl className="info-list">
          <div className="info-row">
            <dt>Отображаемое имя</dt>
            <dd>{user.name}</dd>
          </div>
          <div className="info-row">
            <dt>Discord username</dt>
            <dd>@{user.username}</dd>
          </div>
          <div className="info-row">
            <dt>Discord ID</dt>
            <dd className="mono">{user.discordId}</dd>
          </div>
          <div className="info-row">
            <dt>Должность</dt>
            <dd>
              <span className="level-badge" style={{ borderColor: user.levelColor, color: user.levelColor }}>
                {user.levelName}
              </span>
            </dd>
          </div>
          <div className="info-row">
            <dt>В системе с</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
