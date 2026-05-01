import { Suspense } from 'react';
import { DashboardContent, DashboardLoading } from './DashboardContent';

export const dynamic = 'force-dynamic';

export default function AdminDashboardPage() {
  return (
    <div className="portal-body">
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
