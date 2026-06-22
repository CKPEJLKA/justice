import DocumentsView from '../components/DocumentsView.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sharedDocsRepo } from '../lib/docsRepo.js';

export default function GeneralProsecutor() {
  const { user } = useAuth();
  return (
    <DocumentsView
      scopeKey="general"
      title="Генеральная прокуратура"
      repo={sharedDocsRepo('general')}
      canManage={!!user.permissions?.manageDocs}
    />
  );
}
