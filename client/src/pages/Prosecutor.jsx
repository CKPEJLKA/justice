import DocumentsView from '../components/DocumentsView.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { sharedDocsRepo } from '../lib/docsRepo.js';

export default function Prosecutor() {
  const { user } = useAuth();
  return (
    <DocumentsView
      scopeKey="prosecutor"
      title="Прокуратура"
      repo={sharedDocsRepo('prosecutor')}
      canManage={!!user.permissions?.manageDocs}
    />
  );
}
