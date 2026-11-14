import { Link } from 'react-router-dom';

// Полоса заголовка страницы: путь (для вложенных страниц), заголовок и действия справа.
// crumbs: [{ label, to? }] — без ссылки элемент выводится текстом.
export default function PageHeader({ title, crumbs, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {crumbs?.length > 0 && (
          <nav className="crumbs" aria-label="Путь">
            {crumbs.map((c, i) => (
              <span key={i} className="crumb">
                {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
              </span>
            ))}
          </nav>
        )}
        <h1 className="page-title">{title}</h1>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
