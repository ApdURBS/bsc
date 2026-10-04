import NotificationsPage from './pages/Notifications';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { ChangePassword, ForgotPassword, Login, ResetPassword } from './pages/Auth';
import ImportPage from './pages/Import';
import ReportsPage from './pages/Reports';
import { DocumentosPage, OcorrenciasPage } from './pages/Fase5';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import { AtividadesPage, EtapasPage, MovimentacoesPage } from './pages/Lists';
import { AuditPage, SettingsPage, UsersPage } from './pages/Admin';

function Protected({ perm, children }: { perm?: string; children: React.ReactNode }) {
  const { can } = useAuth();
  if (perm && !can(perm)) return <div className="py-20 text-center text-sm text-slate-500">Você não tem permissão para acessar esta área.</div>;
  return <>{children}</>;
}

export default function App() {
  const { me, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><Loading /></div>;
  if (!me) return (
    <Routes>
      <Route path="/login" element={<Login />} /><Route path="/esqueci-senha" element={<ForgotPassword />} /><Route path="/redefinir-senha" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
  if (me.mustChangePassword) return <Routes><Route path="*" element={<ChangePassword />} /></Routes>;
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/trocar-senha" element={<ChangePassword />} />
      <Route element={<Layout />}>
        <Route index element={<Protected perm="dashboard.view"><Dashboard /></Protected>} />
        <Route path="projetos" element={<Protected perm="projects.view"><Projects /></Protected>} />
        <Route path="projetos/:id" element={<Protected perm="projects.view"><ProjectDetail /></Protected>} />
        <Route path="etapas" element={<Protected perm="stages.view"><EtapasPage /></Protected>} />
        <Route path="atividades" element={<Protected perm="activities.view"><AtividadesPage /></Protected>} />
        <Route path="movimentacoes" element={<Protected perm="movements.view"><MovimentacoesPage /></Protected>} />
        <Route path="prazos" element={<Navigate to="/?aba=prazos" replace />} />
        <Route path="documentos" element={<Protected perm="documents.view"><DocumentosPage /></Protected>} />
        <Route path="ocorrencias" element={<Protected perm="occurrences.view"><OcorrenciasPage /></Protected>} />
        <Route path="notificacoes" element={<NotificationsPage />} />
        <Route path="relatorios" element={<Protected perm="reports.view"><ReportsPage /></Protected>} />
        <Route path="importar" element={<Protected perm="import.manage"><ImportPage /></Protected>} />
        <Route path="usuarios" element={<Protected perm="users.view"><UsersPage /></Protected>} />
        <Route path="auditoria" element={<Protected perm="audit.view"><AuditPage /></Protected>} />
        <Route path="configuracoes" element={<Protected perm="settings.manage"><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
