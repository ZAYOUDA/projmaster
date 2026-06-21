import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Dashboard from './pages/Dashboard';
import Collaborateurs from './pages/Collaborateurs';
import Parametres from './pages/Parametres';
import ProjetLayout from './pages/ProjetLayout';
import ProjetWBS from './pages/ProjetWBS';
import ProjetGantt from './pages/ProjetGantt';
import ProjetPlanning from './pages/ProjetPlanning';
import ProjetBudget from './pages/ProjetBudget';
import ProjetKanban from './pages/ProjetKanban';
import ProjetRisques from './pages/ProjetRisques';
import ProjetParametres from './pages/ProjetParametres';
import CongesEquipe from './pages/CongesEquipe';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'collaborateurs', element: <Collaborateurs /> },
      { path: 'conges', element: <CongesEquipe /> },
      { path: 'parametres', element: <Parametres /> },
      {
        path: 'projet/:id',
        element: <ProjetLayout />,
        children: [
          { path: 'wbs', element: <ProjetWBS /> },
          { path: 'planning', element: <ProjetPlanning /> },
          { path: 'gantt', element: <ProjetGantt /> },
          { path: 'budget', element: <ProjetBudget /> },
          { path: 'kanban', element: <ProjetKanban /> },
          { path: 'risques', element: <ProjetRisques /> },
          { path: 'parametres', element: <ProjetParametres /> },
        ],
      },
    ],
  },
]);
