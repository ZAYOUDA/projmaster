import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Collaborateurs from './pages/Collaborateurs';
import Parametres from './pages/Parametres';
import ProjetLayout from './pages/ProjetLayout';
import ProjetWBS from './pages/ProjetWBS';
import ProjetGantt from './pages/ProjetGantt';
import ProjetPlanning from './pages/ProjetPlanning';
import ProjetBudget from './pages/ProjetBudget';
import ProjetKanban from './pages/ProjetKanban';
import ProjetRiad from './pages/ProjetRiad';
import ProjetParametres from './pages/ProjetParametres';
import ProjetStakeholders from './pages/ProjetStakeholders';
import ProjetFacturation from './pages/ProjetFacturation';
import SuiviMensuelRun from './pages/SuiviMensuelRun';
import ImportCRA from './pages/ImportCRA';
import ImportWbsPage from './pages/ImportWbsPage';
import CongesEquipe from './pages/CongesEquipe';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminRoute from './components/auth/AdminRoute';
import ConsoleAdmin from './pages/ConsoleAdmin';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'admin', element: <AdminRoute><ConsoleAdmin /></AdminRoute> },
      { path: 'import-cra', element: <AdminRoute><ImportCRA /></AdminRoute> },
      { path: 'collaborateurs', element: <Collaborateurs /> },
      { path: 'conges', element: <CongesEquipe /> },
      { path: 'parametres', element: <Parametres /> },
      { path: 'projet/:id/import-wbs', element: <AdminRoute><ImportWbsPage /></AdminRoute> },
      {
        path: 'projet/:id',
        element: <ProjetLayout />,
        children: [
          { path: 'wbs',          element: <ProjetWBS /> },
          { path: 'planning',     element: <ProjetPlanning /> },
          { path: 'gantt',        element: <ProjetGantt /> },
          { path: 'budget',       element: <ProjetBudget /> },
          { path: 'kanban',       element: <ProjetKanban /> },
          { path: 'suivi-mensuel',element: <SuiviMensuelRun /> },
          { path: 'risques',      element: <ProjetRiad /> },
          { path: 'stakeholders', element: <ProjetStakeholders /> },
          { path: 'facturation',  element: <ProjetFacturation /> },
          { path: 'parametres',   element: <ProjetParametres /> },
        ],
      },
    ],
  },
]);
