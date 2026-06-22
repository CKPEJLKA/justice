import { api } from '../api.js';

// Адаптер для общих разделов (Прокуратура / Генеральная прокуратура).
export const sharedDocsRepo = (scope) => ({
  list: () => api.docs(scope),
  get: (id) => api.doc(scope, id),
  createCategory: (name) => api.createCategory(scope, name),
  deleteCategory: (id) => api.deleteCategory(scope, id),
  createDoc: (body) => api.createDoc(scope, body),
  updateDoc: (id, body) => api.updateDoc(scope, id, body),
  deleteDoc: (id) => api.deleteDoc(scope, id),
});

// Адаптер для личных документов (приватные шаблоны сотрудника).
export const personalDocsRepo = {
  list: () => api.personalDocs(),
  get: (id) => api.personalDoc(id),
  createCategory: (name) => api.createPersonalCategory(name),
  deleteCategory: (id) => api.deletePersonalCategory(id),
  createDoc: (body) => api.createPersonalDoc(body),
  updateDoc: (id, body) => api.updatePersonalDoc(id, body),
  deleteDoc: (id) => api.deletePersonalDoc(id),
};
