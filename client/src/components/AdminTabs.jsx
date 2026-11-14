import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Вкладки админ-панели — склеенная группа кнопок. Каждая видна только при наличии права.
const TABS = [
  { to: '/admin', label: 'Пользователи', end: true },
  { to: '/admin/audit', label: 'Журнал действий', perm: 'viewAudit' },
  { to: '/admin/settings', label: 'Настройки сайта', perm: 'manageSettings' },
];

export default function AdminTabs() {
  const { user } = useAuth();
  const tabs = TABS.filter((t) => !t.perm || user.permissions?.[t.perm]);
  if (tabs.length < 2) return null; // одна вкладка — переключатель не нужен

  return (
    <nav className="segmented" aria-label="Разделы админ-панели">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => 'segmented-item' + (isActive ? ' active' : '')}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
