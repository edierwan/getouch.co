'use client';

import { useEffect, useState } from 'react';
import {
  BAAS_MODULES,
  DATABASE_MODULES,
  INFRASTRUCTURE_PROXY_ROWS,
  INFRASTRUCTURE_SECTION_LINKS,
  INFRASTRUCTURE_SERVER_ROWS,
  INFRASTRUCTURE_SUMMARY,
  PROXY_MODULES,
  SERVER_CARDS,
  type InfrastructureSectionId,
} from '../data';
import {
  AnchorSection,
  DetailCardGrid,
  MetricStrip,
  ModuleCardGrid,
  PageIntro,
  SectionPills,
  SummaryGrid,
} from '../ui';

const SECTION_IDS: InfrastructureSectionId[] = ['servers', 'databases', 'reverse-proxy', 'baas'];

function readHash(): InfrastructureSectionId | null {
  if (typeof window === 'undefined') return null;

  const rawValue = window.location.hash.replace('#', '');
  let value = rawValue;

  try {
    value = decodeURIComponent(rawValue);
  } catch {
    return null;
  }

  return SECTION_IDS.includes(value as InfrastructureSectionId) ? (value as InfrastructureSectionId) : null;
}

export default function InfrastructureClient() {
  const [activeSection, setActiveSection] = useState<InfrastructureSectionId | null>(null);

  useEffect(() => {
    const sync = () => setActiveSection(readHash());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return (
    <div className="portal-body">
      <PageIntro
        title="Infrastructure"
        subtitle="Servers, databases, networking, and platform modules running behind getouch.co."
      />

      <SummaryGrid cards={INFRASTRUCTURE_SUMMARY} />
      <SectionPills links={INFRASTRUCTURE_SECTION_LINKS} activeId={activeSection} />

      <AnchorSection
        id="servers"
        title="SERVERS & NODES"
        subtitle="Primary VPS capacity, ingress topology, and runtime health for the main production node."
        focused={activeSection === 'servers'}
      >
        <MetricStrip rows={INFRASTRUCTURE_SERVER_ROWS} />
        <DetailCardGrid cards={SERVER_CARDS} />
      </AnchorSection>

      <AnchorSection
        id="databases"
        title="DATABASES"
        subtitle="Database and self-hosted Supabase surfaces. External modules open in a new tab for direct access."
        focused={activeSection === 'databases'}
      >
        <ModuleCardGrid modules={DATABASE_MODULES} />
      </AnchorSection>

      <AnchorSection
        id="reverse-proxy"
        title="REVERSE PROXY / NETWORKING"
        subtitle="Public ingress, TLS, and private operator access paths for the production stack."
        focused={activeSection === 'reverse-proxy'}
      >
        <MetricStrip rows={INFRASTRUCTURE_PROXY_ROWS} />
        <ModuleCardGrid modules={PROXY_MODULES} />
      </AnchorSection>

      <AnchorSection
        id="baas"
        title="BACKEND-AS-A-SERVICE"
        subtitle="Operator-facing BaaS modules for auth, storage, API access, and realtime workloads."
        focused={activeSection === 'baas'}
      >
        <ModuleCardGrid modules={BAAS_MODULES} />
      </AnchorSection>
    </div>
  );
}
