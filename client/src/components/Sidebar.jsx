import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSite } from '../context/SiteContext.jsx';
import { MINISTRY_NAME } from '../constants.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

// Группы меню разделены линией: ежедневная работа, состав, управление.
const GROUPS = [
  [
    { to: '/', label: 'Главная', icon: 'home', end: true },
    { to: '/appeals', label: 'Обращения', icon: 'appeals' },
    { to: '/prosecutor', label: 'Прокуратура', icon: 'docs' },
    { to: '/general-prosecutor', label: 'Генеральная прокуратура', icon: 'general', perm: 'viewGeneral' },
    { to: '/my-templates', label: 'Мои шаблоны', icon: 'templates' },
  ],
  [
    { to: '/employees', label: 'Сотрудники', icon: 'staff' },
    { to: '/profile', label: 'Профиль', icon: 'profile' },
  ],
  [{ to: '/admin', label: 'Админ-панель', icon: 'admin', perm: 'accessAdmin' }],
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { stateName } = useSite();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const groups = GROUPS.map((g) => g.filter((i) => !i.perm || user.permissions?.[i.perm])).filter(
    (g) => g.length,
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Icon name="emblem" />
        </div>
        <div className="brand-text">
          <div className="brand-title">{MINISTRY_NAME}</div>
          {stateName && <div className="brand-sub">{stateName}</div>}
        </div>
      </div>

      <nav className="nav">
        {groups.map((g, gi) => (
          <div className="nav-group" key={gi}>
            {g.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              >
                <Icon name={item.icon} className="nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <Avatar user={user} size={34} />
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role" style={{ color: user.levelColor }}>
            {user.levelName}
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout} title="Выйти" aria-label="Выйти">
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}
