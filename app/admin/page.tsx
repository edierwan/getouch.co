import { Suspense } from 'react';
import { DashboardContent, DashboardLoading } from './dashboard/DashboardContent';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <div className="portal-body">
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
