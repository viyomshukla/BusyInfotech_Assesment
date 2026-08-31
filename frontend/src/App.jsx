import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  QueryClient, QueryClientProvider, useIsFetching, useIsMutating,
} from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';

// The login screen is the first thing an unauthenticated visitor needs, so it
// ships in the main bundle. Everything behind the session is split out — the
// dashboard alone pulls in the whole charting library, and nobody should pay
// for that while they are still typing a password.
import LoginPage from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const AppointmentDetailPage = lazy(() => import('./pages/AppointmentDetailPage'));
const DayPage = lazy(() => import('./pages/DayPage'));
const AvailabilityPage = lazy(() => import('./pages/AvailabilityPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const StaffPage = lazy(() => import('./pages/StaffPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

// A hairline across the top of the window whenever the app is actually talking
// to the API — any query fetching or any mutation in flight. It covers the
// background refetches, which are too quick and too frequent to justify
// blanking out a panel that already has good data in it.
function GlobalProgress() {
  const busy = useIsFetching() + useIsMutating();
  if (!busy) return null;

  return (
    <div
      aria-hidden
      className="animate-fade pointer-events-none fixed inset-x-0 top-0 z-60 h-0.5 overflow-hidden
                 bg-accent-soft"
    >
      <div className="progress-sweep h-full w-full bg-accent" />
    </div>
  );
}

// Shown while a route's chunk is still downloading, inside the shell so the
// sidebar stays put and only the working area waits.
function RouteFallback() {
  return (
    <div className="mx-auto max-w-6xl rounded-xl border border-rule bg-surface shadow-card">
      <Loading hint="Opening the page." />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalProgress />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Page><DashboardPage /></Page>} />
              <Route path="/day" element={<Page><DayPage /></Page>} />
              <Route path="/appointments" element={<Page><AppointmentsPage /></Page>} />
              <Route path="/appointments/:id" element={<Page><AppointmentDetailPage /></Page>} />
              <Route path="/alerts" element={<Page><AlertsPage /></Page>} />
              <Route
                path="/availability"
                element={
                  <ProtectedRoute frontDeskOnly>
                    <Page><AvailabilityPage /></Page>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff"
                element={
                  <ProtectedRoute frontDeskOnly>
                    <Page><StaffPage /></Page>
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Page({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

