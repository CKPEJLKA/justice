import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Clock from '../components/Clock.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatStrip from '../components/StatStrip.jsx';
import TransferMinisterModal from '../components/TransferMinisterModal.jsx';

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [stats, setStats] = useState(null);
  const [mine, setMine] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);

  const loadStats = useCallback(() => {
    api.stats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    loadStats();
    api.myAppealStats().then((d) => setMine(d.stats)).catch(() => setMine(null));
  }, [loadStats]);

  const onTransferDone = async () => {
    setShowTransfer(false);
    await refresh(); // права текущего пользователя изменились
    loadStats();
  };

  const minister = stats?.minister;
  const staffItems = [
    { label: 'Сотрудников', value: stats?.staff },
    { label: 'Заместителей', value: stats?.deputies },
    { label: 'Советников', value: stats?.advisors },
    { label: 'Прокуроров', value: stats?.prosecutors },
    { label: 'Помощников', value: stats?.assistants },
  ];
  if (user.permissions?.seePending) {
    staffItems.push({
      label: 'Ожидают доступа',
      value: stats?.pending,
      tone: stats?.pending > 0 ? 'warn' : undefined,
      title: 'Вошли на сайт, но доступ ещё не выдан',
    });
  }

  return (
    <div className="page">
      <PageHeader title="Главная" actions={<Clock />} />

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Министр юстиции</h2>
            {user.permissions?.transferMinister && (
              <div className="panel-tools">
                <button className="danger-btn sm" onClick={() => setShowTransfer(true)}>
                  Передать роль министра
                </button>
              </div>
            )}
          </div>
          <div className="minister">
            {minister ? (
              <>
                <Avatar user={minister} size={52} />
                <div>
                  <div className="minister-name">{minister.name}</div>
                  <div className="minister-role">Генеральный прокурор штата</div>
                </div>
              </>
            ) : (
              <div className="minister-name vacant">Должность вакантна</div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Мои обращения</h2>
            <div className="panel-tools">
              <Link to="/appeals" className="ghost-btn sm">
                Все обращения
              </Link>
            </div>
          </div>
          <StatStrip
            items={[
              { label: 'В работе', value: mine?.inProgress },
              {
                label: 'Рассмотрено',
                value: mine?.reviewed,
                tone: mine?.reviewed > 0 ? 'ok' : undefined,
                title: 'Включая отказанные',
              },
              { label: 'Всего назначено', value: mine?.total },
            ]}
          />
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Состав министерства</h2>
          <div className="panel-tools">
            <Link to="/employees" className="ghost-btn sm">
              Структура
            </Link>
          </div>
        </div>
        <StatStrip items={staffItems} />
      </section>

      {showTransfer && (
        <TransferMinisterModal
          currentUser={user}
          onClose={() => setShowTransfer(false)}
          onDone={onTransferDone}
        />
      )}
    </div>
  );
}
