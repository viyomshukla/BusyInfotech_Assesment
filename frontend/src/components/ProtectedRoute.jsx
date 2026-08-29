import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, frontDeskOnly = false }) {
  const { user, loading, isFrontDesk } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (frontDeskOnly && !isFrontDesk) {
    return (
      <div className="mx-auto max-w-md p-12 text-center">
        <h2 className="text-lg font-semibold">Front desk only</h2>
        <p className="mt-2 text-sm text-muted">
          This page is for reception staff. Your schedule is on the Appointments page.
        </p>
      </div>
    );
  }

  return children;
}