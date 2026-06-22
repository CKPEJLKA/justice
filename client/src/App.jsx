import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { MIN_PANEL_LEVEL } from './constants.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Employees from './pages/Employees.jsx';
import Prosecutor from './pages/Prosecutor.jsx';
import GeneralProsecutor from './pages/GeneralProsecutor.jsx';
import PersonalDocs from './pages/PersonalDocs.jsx';
import Appeals from './pages/Appeals.jsx';
import AppealProfile from './pages/AppealProfile.jsx';
import Admin from './pages/Admin.jsx';
import NoAccess from './pages/NoAccess.jsx';

function FullLoader() {
  return <div className="full-loader">Загрузка…</div>;
}

function Forbidden() {
  return (
    <div className="page">
      <div className="card empty-state">Недостаточно прав для просмотра этого раздела.</div>
    </div>
  );
}

// Гард доступа к панели.
function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.accessLevel < MIN_PANEL_LEVEL) return <NoAccess />;
  return children;
}

// Гард по конкретному праву.
function RequirePerm({ perm, children }) {
  const { user } = useAuth();
  if (!user?.permissions?.[perm]) return <Forbidden />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <FullLoader /> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/my-templates" element={<PersonalDocs />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/prosecutor" element={<Prosecutor />} />
        <Route path="/appeals" element={<Appeals />} />
        <Route path="/appeals/:id" element={<AppealProfile />} />
        <Route
          path="/general-prosecutor"
          element={
            <RequirePerm perm="viewGeneral">
              <GeneralProsecutor />
            </RequirePerm>
          }
        />
        <Route
          path="/admin"
          element={
            <RequirePerm perm="accessAdmin">
              <Admin />
            </RequirePerm>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
