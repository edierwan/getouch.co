import { DATABASE_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function DatabasesPage() {
  return (
    <div className="portal-body">
      <PageIntro title="Databases" subtitle="Database engines, admin tools, and Supabase-backed stacks running on the platform." />
      <ServicePanel title="DATABASE SERVICES" rows={DATABASE_ROWS} />
    </div>
  );
}