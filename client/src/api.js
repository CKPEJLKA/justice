// Пусто => запросы идут на тот же адрес, откуда открыт сайт (одно-портовый режим).
// В dev-режиме (Vite на 5173 + сервер на 3001) задаётся в client/.env.development.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function req(path, opts = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error || 'Ошибка запроса'), { status: res.status });
  }
  return res.json();
}

export const api = {
  me: () => req('/me'),
  meta: () => req('/meta'),
  stats: () => req('/stats'),
  employees: () => req('/employees'),
  adminUsers: () => req('/admin/users'),
  // body: { accessLevel?, name? }
  updateUser: (id, body) => req(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  transferMinister: (targetId) =>
    req('/admin/transfer-minister', { method: 'POST', body: JSON.stringify({ targetId }) }),
  deleteUser: (id) => req(`/admin/users/${id}`, { method: 'DELETE' }),

  // --- Обращения ---
  appeals: () => req('/appeals'),
  appeal: (id) => req(`/appeals/${id}`),
  createAppeal: (body) => req('/appeals', { method: 'POST', body: JSON.stringify(body) }),
  updateAppeal: (id, body) => req(`/appeals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAppeal: (id) => req(`/appeals/${id}`, { method: 'DELETE' }),
  myAppealStats: () => req('/appeals/my-stats'),
  logout: () => req('/auth/logout', { method: 'POST' }),
  loginUrl: `${API_BASE}/api/auth/discord`,

  // --- Документы (scope: 'prosecutor' | 'general') ---
  docs: (scope) => req(`/docs/${scope}`),
  doc: (scope, id) => req(`/docs/${scope}/documents/${id}`),
  createCategory: (scope, name) =>
    req(`/docs/${scope}/categories`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCategory: (scope, id) => req(`/docs/${scope}/categories/${id}`, { method: 'DELETE' }),
  createDoc: (scope, body) => req(`/docs/${scope}/documents`, { method: 'POST', body: JSON.stringify(body) }),
  updateDoc: (scope, id, body) =>
    req(`/docs/${scope}/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteDoc: (scope, id) => req(`/docs/${scope}/documents/${id}`, { method: 'DELETE' }),

  // --- Личные документы/шаблоны ---
  personalDocs: () => req('/personal-docs'),
  personalDoc: (id) => req(`/personal-docs/documents/${id}`),
  createPersonalCategory: (name) =>
    req('/personal-docs/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  deletePersonalCategory: (id) => req(`/personal-docs/categories/${id}`, { method: 'DELETE' }),
  createPersonalDoc: (body) => req('/personal-docs/documents', { method: 'POST', body: JSON.stringify(body) }),
  updatePersonalDoc: (id, body) =>
    req(`/personal-docs/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePersonalDoc: (id) => req(`/personal-docs/documents/${id}`, { method: 'DELETE' }),
};
