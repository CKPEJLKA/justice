import DocumentsView from '../components/DocumentsView.jsx';
import { personalDocsRepo } from '../lib/docsRepo.js';

export default function PersonalDocs() {
  return (
    <DocumentsView
      scopeKey="personal"
      title="Мои шаблоны"
      eyebrow="ЛИЧНЫЕ ДОКУМЕНТЫ"
      repo={personalDocsRepo}
      canManage={true}
    />
  );
}
