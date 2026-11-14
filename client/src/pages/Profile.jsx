import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatStrip from '../components/StatStrip.jsx';

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
      <PageHeader title="Профиль" />

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Личные данные</h2>
        </div>
        <div className="profile">
          <Avatar user={user} size={96} />
          <dl className="info-list">
            <div className="info-row">
              <dt>Имя</dt>
              <dd>
                <b>{user.name}</b>
              </dd>
            </div>
            <div className="info-row">
              <dt>Должность</dt>
              <dd>
                <span className="level-badge" style={{ color: user.levelColor }}>
                  {user.levelName}
                </span>
                {user.isSuperuser && (
                  <span
                    className="tag superuser-badge"
                    style={{ marginLeft: 8 }}
                    title="Абсолютные права независимо от должности. Эту метку видите только вы."
                  >
                    <Icon name="key" />
                    Суперпользователь
                  </span>
                )}
              </dd>
            </div>
            <div className="info-row">
              <dt>Discord</dt>
              <dd>@{user.username}</dd>
            </div>
            <div className="info-row">
              <dt>Discord ID</dt>
              <dd className="mono">{user.discordId}</dd>
            </div>
            <div className="info-row">
              <dt>В системе с</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Мои обращения</h2>
        </div>
        <p className="panel-note">Обращения, на которые вы были назначены прокурором.</p>
        <StatStrip
          items={[
            { label: 'В работе', value: stats?.inProgress },
            {
              label: 'Рассмотрено',
              value: stats?.reviewed,
              tone: stats?.reviewed > 0 ? 'ok' : undefined,
              title: 'Включая отказанные',
            },
            { label: 'Всего назначено', value: stats?.total },
          ]}
        />
      </section>
    </div>
  );
}
