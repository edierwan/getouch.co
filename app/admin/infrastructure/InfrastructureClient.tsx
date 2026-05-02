'use client';

import { useEffect, useState } from 'react';
import type { InfrastructureStorageSnapshot } from '@/lib/infrastructure';
import {
  BAAS_MODULES,
  DATABASE_MODULES,
  INFRASTRUCTURE_SECTION_LINKS,
  INFRASTRUCTURE_SERVER_ROWS,
  INFRASTRUCTURE_SUMMARY,
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
import type { SummaryCard } from '../data';

const SECTION_IDS: InfrastructureSectionId[] = ['servers', 'databases', 'baas'];

function formatStorage(bytes: number) {
  if (bytes <= 0) return '0 GB';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatUsage(usedBytes: number, totalBytes: number) {
  return `${formatStorage(usedBytes)} / ${formatStorage(totalBytes)}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}% used`;
}

function formatDriveClass(bytes: number) {
  if (bytes <= 0) return null;

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatBackingDisk(volume: InfrastructureStorageSnapshot['volumes'][number]) {
  if (!volume.physicalTotalBytes) return null;

  const parts = [formatDriveClass(volume.physicalTotalBytes)];

  if (volume.transport) {
    parts.push(volume.transport.toUpperCase());
  }

  if (volume.deviceModel) {
    parts.push(volume.deviceModel);
  }

  return parts.filter(Boolean).join(' · ');
}

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

function StorageBreakdown({ storage }: { storage: InfrastructureStorageSnapshot }) {
  if (!storage.available) {
    return (
      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Storage Overview</h3>
            <p className="portal-page-sub">Live storage telemetry is temporarily unavailable.</p>
          </div>
        </div>
        <div className="portal-storage-unavailable">{storage.error || 'Unavailable'}</div>
      </section>
    );
  }

  return (
    <section className="portal-panel">
      <div className="portal-panel-head">
        <div>
          <h3 className="portal-panel-title">Storage Overview</h3>
          <p className="portal-page-sub">Live usage for the real mounted filesystems on this server: <strong>/</strong>, <strong>/srv</strong>, and <strong>/srv/archive</strong>.</p>
        </div>
      </div>

      <div className="portal-storage-note">
        Mounted filesystem capacity is not the same thing as raw disk size. The card headline shows the live mounted filesystem usage; the backing disk line shows the physical device behind that mount, which can be shared by multiple mount points.
      </div>

      <div className="portal-storage-grid">
        {storage.volumes.map((volume) => (
          <section key={volume.id} className="portal-storage-card">
            <div className="portal-storage-head">
              <div>
                <div className="portal-storage-name">{volume.name}</div>
                <div className="portal-storage-meta">{volume.descriptor}</div>
              </div>
              <div className="portal-storage-percent">{formatPercent(volume.percentUsed)}</div>
            </div>
            <div className="portal-storage-usage">{formatUsage(volume.usedBytes, volume.totalBytes)}</div>
            {formatBackingDisk(volume) ? (
              <div className="portal-storage-note">
                Mounted filesystem: {formatStorage(volume.totalBytes)} on {volume.mountPoint}. Backing disk: {formatBackingDisk(volume)}.
              </div>
            ) : (
              <div className="portal-storage-note">
                Mounted filesystem: {formatStorage(volume.totalBytes)} on {volume.mountPoint}.
              </div>
            )}
            <div className="portal-storage-bar" aria-hidden="true">
              <span className="portal-storage-bar-fill" style={{ width: `${Math.min(volume.percentUsed, 100)}%` }} />
            </div>
            <div className="portal-storage-foot">{volume.mountPoint} · {volume.filesystem} · {volume.device}</div>
          </section>
        ))}
      </div>
    </section>
  );
}

export default function InfrastructureClient({ storage }: { storage: InfrastructureStorageSnapshot }) {
  const [activeSection, setActiveSection] = useState<InfrastructureSectionId | null>(null);

  const summaryCards: SummaryCard[] = [
    INFRASTRUCTURE_SUMMARY[0],
    INFRASTRUCTURE_SUMMARY[1],
    INFRASTRUCTURE_SUMMARY[2],
    {
      ...INFRASTRUCTURE_SUMMARY[3],
      tone: storage.available ? 'active' : 'warning',
      value: storage.available ? formatStorage(storage.total.totalBytes) : 'Unavailable',
      detail: storage.available
        ? `Tracked filesystems: ${formatUsage(storage.total.usedBytes, storage.total.totalBytes)}`
        : (storage.error || 'Live metrics unavailable'),
    },
  ];

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
        subtitle="Servers, databases, storage, and platform modules running behind getouch.co."
      />

      <SummaryGrid cards={summaryCards} />
      <SectionPills links={INFRASTRUCTURE_SECTION_LINKS} activeId={activeSection} />
      <StorageBreakdown storage={storage} />

      <AnchorSection
        id="servers"
        title="PLATFORM OVERVIEW"
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
