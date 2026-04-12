import Link from 'next/link';
import type { DetailCard, InfoRow, QuickLinkGroup, ResourceRow, StatusTone, SummaryCard } from './data';

function statusClassName(tone: StatusTone) {
  if (tone === 'warning') return 'portal-status portal-status-warning';
  if (tone === 'active') return 'portal-status portal-status-active';
  return 'portal-status portal-status-good';
}

export function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="portal-page-header">
      <div>
        <h2 className="portal-page-title">{title}</h2>
        <p className="portal-page-sub">{subtitle}</p>
      </div>
    </div>
  );
}

export function SummaryGrid({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="portal-summary-grid">
      {cards.map((card) => (
        <section key={card.label} className="portal-summary-card">
          <div className="portal-summary-head">
            <span className="portal-summary-label">{card.label}</span>
            <span className="portal-summary-icon">{card.icon}</span>
          </div>
          <div className={`portal-summary-value${card.tone ? ` portal-summary-value-${card.tone}` : ''}`}>{card.value}</div>
        </section>
      ))}
    </div>
  );
}

export function ActionBar({ actions }: { actions: Array<{ label: string; href: string; external?: boolean }> }) {
  return (
    <section className="portal-panel">
      <h3 className="portal-panel-label">QUICK ACTIONS</h3>
      <div className="portal-action-row">
        {actions.map((action) =>
          action.external ? (
            <a key={action.label} href={action.href} target="_blank" rel="noopener noreferrer" className="portal-action-link">
              {action.label}
            </a>
          ) : (
            <Link key={action.label} href={action.href} className="portal-action-link">
              {action.label}
            </Link>
          )
        )}
      </div>
    </section>
  );
}

export function ServicePanel({ title, rows }: { title: string; rows: ResourceRow[] }) {
  return (
    <section className="portal-panel portal-panel-fill">
      <h3 className="portal-panel-label">{title}</h3>
      <div className="portal-resource-list">
        {rows.map((row) => (
          <div key={row.name} className="portal-resource-row">
            <div className="portal-resource-copy">
              <div className="portal-resource-name">{row.name}</div>
              <div className="portal-resource-desc">{row.description}</div>
            </div>
            <div className="portal-resource-meta">
              <span className="portal-resource-type">{row.type}</span>
              <span className={statusClassName(row.tone)}>{row.status}</span>
              {row.href ? (
                <a href={row.href} target="_blank" rel="noopener noreferrer" className="portal-resource-link">
                  ↗
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function InfoPanel({ title, rows }: { title: string; rows: InfoRow[] }) {
  return (
    <section className="portal-panel">
      <h3 className="portal-panel-label">{title}</h3>
      <div className="portal-info-table">
        {rows.map((row) => (
          <div key={row.label} className="portal-info-table-row">
            <span className="portal-info-table-label">{row.label}</span>
            <span className="portal-info-table-value">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ActivityPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="portal-panel">
      <h3 className="portal-panel-label">{title}</h3>
      <div className="portal-activity-list">
        {items.map((item) => (
          <div key={item} className="portal-activity-item">{item}</div>
        ))}
      </div>
    </section>
  );
}

export function DetailCardGrid({ cards }: { cards: DetailCard[] }) {
  return (
    <div className="portal-detail-grid">
      {cards.map((card) => (
        <section key={card.title} className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">{card.title}</h3>
            <span className={statusClassName(card.tone)}>{card.status}</span>
          </div>
          <div className="portal-info-table">
            {card.rows.map((row) => (
              <div key={row.label} className="portal-info-table-row">
                <span className="portal-info-table-label">{row.label}</span>
                <span className="portal-info-table-value">{row.value}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function QuickLinkGroups({ groups }: { groups: QuickLinkGroup[] }) {
  return (
    <div className="portal-detail-grid">
      {groups.map((group) => (
        <section key={group.title} className="portal-panel">
          <h3 className="portal-panel-label">{group.title}</h3>
          <div className="portal-quick-link-stack">
            {group.links.map((link) =>
              link.external ? (
                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="portal-action-link portal-action-link-block">
                  {link.label}
                </a>
              ) : (
                <Link key={link.label} href={link.href} className="portal-action-link portal-action-link-block">
                  {link.label}
                </Link>
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AnchorSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="portal-anchor-section">
      <div className="portal-anchor-title">{title}</div>
      {children}
    </section>
  );
}

export function MetricStrip({ rows }: { rows: InfoRow[] }) {
  return (
    <section className="portal-panel portal-metric-strip">
      {rows.map((row) => (
        <div key={row.label} className="portal-metric-cell">
          <div className="portal-metric-label">{row.label}</div>
          <div className="portal-metric-value">{row.value}</div>
        </div>
      ))}
    </section>
  );
}