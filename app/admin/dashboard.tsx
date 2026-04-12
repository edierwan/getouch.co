import {
  DASHBOARD_ACTIVITY,
  DASHBOARD_ENVIRONMENT,
  DASHBOARD_NETWORK,
  DASHBOARD_SERVICES,
  DASHBOARD_SUMMARY,
  QUICK_ACTIONS,
} from './data';
import { ActionBar, ActivityPanel, InfoPanel, PageIntro, ServicePanel, SummaryGrid } from './ui';
export default function PortalDashboard() {
  return (
    <div className="portal-body">
      <PageIntro title="Dashboard" subtitle="Infrastructure overview and quick access to all services." />
      <SummaryGrid cards={DASHBOARD_SUMMARY} />
      <ActionBar actions={QUICK_ACTIONS} />

      <div className="portal-dashboard-grid">
        <ServicePanel title="SERVICE HEALTH" rows={DASHBOARD_SERVICES} />
        <div className="portal-sidebar-stack">
          <InfoPanel title="NETWORK" rows={DASHBOARD_NETWORK} />
          <InfoPanel title="ENVIRONMENT" rows={DASHBOARD_ENVIRONMENT} />
          <ActivityPanel title="RECENT ACTIVITY" items={DASHBOARD_ACTIVITY} />
        </div>
      </div>
    </div>
  );
}
