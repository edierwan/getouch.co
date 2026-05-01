const platformServices = [
  {
    name: 'Portal',
    description: 'Admin and control-plane access for Getouch infrastructure and service endpoints.',
    href: 'https://portal.getouch.co',
    status: 'Live',
  },
  {
    name: 'Dify',
    description: 'Native Dify workspace UI and API for orchestration, apps, and workflows.',
    href: 'https://dify.getouch.co/apps',
    status: 'Live',
  },
  {
    name: 'vLLM Gateway',
    description: 'OpenAI-compatible inference endpoint managed from the Getouch portal.',
    href: 'https://vllm.getouch.co/v1/models',
    status: 'Live',
  },
  {
    name: 'Evolution Gateway',
    description: 'Evolution API service endpoint for WhatsApp operations.',
    href: 'https://evo.getouch.co',
    status: 'Live',
  },
  {
    name: 'Baileys Gateway',
    description: 'WhatsApp gateway endpoint exposed at wa.getouch.co.',
    href: 'https://wa.getouch.co',
    status: 'Live',
  },
  {
    name: 'Open WebUI',
    description: 'Operator and end-user AI interface running on the Getouch stack.',
    href: 'https://ai.getouch.co',
    status: 'Live',
  },
];

const infrastructureRows = [
  ['Runtime', 'Next.js on Node.js'],
  ['Primary branch', 'main'],
  ['Environment mode', 'Production'],
  ['Edge', 'Cloudflare + Caddy'],
  ['Control plane', 'portal.getouch.co'],
];

export default function ServicesPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#09090c', color: '#eef2ff' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '3rem 1.25rem 4rem' }}>
        <header style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
          <a href="/" style={{ color: '#95a2ff', textDecoration: 'none', fontSize: '0.95rem' }}>
            Getouch
          </a>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ color: '#8d93ac', fontSize: '0.78rem', letterSpacing: '0.16em', fontWeight: 700 }}>
              SERVICE INDEX
            </div>
            <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)', lineHeight: 1.04, letterSpacing: '-0.04em' }}>
              All service access is now served by the Node app.
            </h1>
            <p style={{ color: '#aeb5cc', maxWidth: '760px', fontSize: '1rem', lineHeight: 1.7 }}>
              This page replaces the old static HTML service index. Production should use the Node/Next runtime on the main branch,
              with the Getouch portal as the control plane for service endpoints and operations.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <a
              href="https://portal.getouch.co"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '42px',
                padding: '0.7rem 1rem',
                borderRadius: '12px',
                background: '#f4f7ff',
                color: '#0d1020',
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Open Portal
            </a>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '42px',
                padding: '0.7rem 1rem',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#d8def3',
                textDecoration: 'none',
                fontWeight: 600,
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              Back Home
            </a>
          </div>
        </header>

        <section
          style={{
            display: 'grid',
            gap: '0.95rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            marginBottom: '1.75rem',
          }}
        >
          {platformServices.map((service) => (
            <a
              key={service.name}
              href={service.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'grid',
                gap: '0.85rem',
                padding: '1rem 1.05rem',
                borderRadius: '18px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, rgba(23,24,30,0.96), rgba(14,15,21,0.98))',
                color: '#eef2ff',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <strong style={{ fontSize: '1rem' }}>{service.name}</strong>
                <span
                  style={{
                    borderRadius: '999px',
                    padding: '0.2rem 0.55rem',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: '#2ee281',
                    background: 'rgba(46,226,129,0.12)',
                  }}
                >
                  {service.status}
                </span>
              </div>
              <p style={{ color: '#aeb5cc', fontSize: '0.92rem', lineHeight: 1.6 }}>{service.description}</p>
              <span style={{ color: '#8ea1ff', fontSize: '0.84rem' }}>{service.href}</span>
            </a>
          ))}
        </section>

        <section
          style={{
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(180deg, rgba(23,24,30,0.96), rgba(14,15,21,0.98))',
            padding: '1.15rem 1.2rem',
          }}
        >
          <div style={{ marginBottom: '0.9rem', color: '#8d93ac', fontSize: '0.78rem', letterSpacing: '0.14em', fontWeight: 700 }}>
            PLATFORM STATE
          </div>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {infrastructureRows.map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{ color: '#8d93ac', fontSize: '0.84rem' }}>{label}</span>
                <span style={{ color: '#eef2ff', fontSize: '0.92rem', textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}