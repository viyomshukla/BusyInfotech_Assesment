import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AppointmentsPage from './pages/AppointmentsPage';
import AppointmentDetailPage from './pages/AppointmentDetailPage';
import DayPage from './pages/DayPage';
import AvailabilityPage from './pages/AvailabilityPage';
import AlertsPage from './pages/AlertsPage';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

function Placeholder({ title }) {
  return <div className="p-10 text-sm text-muted">{title} — coming next</div>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            
            <Route path="/login" element={<LoginPage />} />
           <Route path="/" element={<DashboardPage />} />
           <Route path="/appointments/:id" element={<AppointmentDetailPage />} />
           <Route path="/day" element={<DayPage />} />
          <Route
          path="/availability"
          element={<ProtectedRoute frontDeskOnly><AvailabilityPage /></ProtectedRoute>}
          />
           <Route path="/appointments" element={<AppointmentsPage />} />
           <Route path="/alerts" element={<AlertsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}