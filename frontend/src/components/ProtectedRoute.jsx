import { Navigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageLoader, EmptyState } from './ui';

export function ProtectedRoute({ children, frontDeskOnly = false }) {
  const { user, loading, isFrontDesk } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoader label="Please wait…" hint="Checking your clinic session." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (frontDeskOnly && !isFrontDesk) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-rule bg-surface shadow-card">
        <EmptyState
          icon={ShieldCheck}
          title="Front desk only"
          hint="This page is for reception staff. Your own schedule is on the Appointments page."
        />
      </div>
    );
  }

  return children;
}