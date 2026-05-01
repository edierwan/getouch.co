import { Breadcrumb, PageIntro } from '../../ui';
import {
  describeLiteLlm,
  formatRuntimeSource,
  resolveRuntimeSource,
} from '@/lib/platform-service-shared';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';

export const dynamic = 'force-dynamic';

function statusClassName(tone: 'healthy' | 'active' | 'warning' | 'critical' | 'info') {
  if (tone === 'warning' || tone === 'critical') return 'portal-status portal-status-warning';
  if (tone === 'healthy' || tone === 'active') return 'portal-status portal-status-good';
  return 'portal-status portal-status-active';
}

function formatOriginStatus(code: number | null) {
  if (code === null) return 'Unknown';
  if (code === 421) return 'Not served by origin';
  return String(code);
}

export default async function LiteLlmServiceEndpointPage() {
  const snapshot = await getPlatformServicesSnapshot();
  const status = describeLiteLlm(snapshot);
  const primary = snapshot.litellm.containers[0] || null;

  return (
    <div className="portal-body">
      <Breadcrumb category="AI Services" page="LiteLLM Gateway" />
      <PageIntro
        title="LiteLLM Gateway"
        subtitle="OpenAI-compatible model proxy and routing layer for multiple model providers."
      />

      <section className="portal-panel">
        <div className="portal-panel-head portal-panel-head-inline">
          <div>
            <h3 className="portal-panel-title">Runtime Status</h3>
            <p className="portal-page-sub">Live runtime audit from the platform host, combined with the reserved public-domain plan.</p>
          </div>
          <span className={statusClassName(status.tone)}>{status.label}</span>
        </div>

        <div className="portal-info-table">
          <div className="portal-info-table-row"><span className="portal-info-table-label">Purpose</span><span className="portal-info-table-value">Model routing layer between clients and model providers.</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Public endpoint</span><span className="portal-info-table-value">{snapshot.litellm.publicUrl || 'Reserved only'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Origin route</span><span className="portal-info-table-value">litellm.getouch.co ({formatOriginStatus(snapshot.litellm.publicOriginCode)})</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Database</span><span className="portal-info-table-value">litellm</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Internal endpoint</span><span className="portal-info-table-value">{snapshot.litellm.internalUrl || 'Awaiting deployment'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime source</span><span className="portal-info-table-value">{formatRuntimeSource(resolveRuntimeSource(primary))}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Container</span><span className="portal-info-table-value">{primary?.name || 'None detected'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Health check</span><span className="portal-info-table-value">{primary?.health || primary?.status || 'No live runtime detected'}</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Health URLs</span><span className="portal-info-table-value">https://litellm.getouch.co/health · /health/liveliness · /v1/models</span></div>
        </div>
      </section>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Model Routing Role</h3>
            <p className="portal-page-sub">LiteLLM is tracked as the future routing layer, not as the underlying model runtime.</p>
          </div>
        </div>
        <div className="portal-info-table">
          <div className="portal-info-table-row"><span className="portal-info-table-label">Canonical slug</span><span className="portal-info-table-value">litellm</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">vLLM backend</span><span className="portal-info-table-value">Planned backend target</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Ollama backend</span><span className="portal-info-table-value">Awaiting integration decision</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">OpenRouter / OpenAI</span><span className="portal-info-table-value">No provider config detected</span></div>
          <div className="portal-info-table-row"><span className="portal-info-table-label">Notes</span><span className="portal-info-table-value">{status.detail}</span></div>
        </div>
      </section>
    </div>
  );
}