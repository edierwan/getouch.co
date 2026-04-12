import {
  BAAS_ROWS,
  DATABASE_ROWS,
  INFRASTRUCTURE_PROXY_ROWS,
  INFRASTRUCTURE_SERVER_ROWS,
  INFRASTRUCTURE_SUMMARY,
  REVERSE_PROXY_ROWS,
  SERVER_CARDS,
} from '../data';
import {
  AnchorSection,
  DetailCardGrid,
  MetricStrip,
  PageIntro,
  ServicePanel,
  SummaryGrid,
} from '../ui';

export default function InfrastructurePage() {
  return (
    <div className="portal-body">
      <PageIntro
        title="Infrastructure"
        subtitle="Servers, databases, networking, and core platform services running under getouch.co."
      />

      <SummaryGrid cards={INFRASTRUCTURE_SUMMARY} />

      <AnchorSection id="servers" title="SERVER / NODE">
        <MetricStrip rows={INFRASTRUCTURE_SERVER_ROWS} />
        <DetailCardGrid cards={SERVER_CARDS} />
      </AnchorSection>

      <AnchorSection id="databases" title="DATABASES">
        <ServicePanel title="DATABASE SERVICES" rows={DATABASE_ROWS} />
      </AnchorSection>

      <AnchorSection id="reverse-proxy" title="REVERSE PROXY / NETWORKING">
        <MetricStrip rows={INFRASTRUCTURE_PROXY_ROWS} />
        <ServicePanel title="PROXY STACK" rows={REVERSE_PROXY_ROWS} />
      </AnchorSection>

      <AnchorSection id="baas" title="BACKEND-AS-A-SERVICE">
        <ServicePanel title="BAAS SERVICES" rows={BAAS_ROWS} />
      </AnchorSection>
    </div>
  );
}