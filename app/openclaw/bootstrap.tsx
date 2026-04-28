import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

const OPENCLAW_HOST = 'openclaw.getouch.co';

export async function requireOpenClawHost() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || '')
    .split(':')[0]
    .toLowerCase();

  if (host !== OPENCLAW_HOST) {
    notFound();
  }
}

export function OpenClawBootstrapPage({
  title,
  message,
  script,
}: {
  title: string;
  message: string;
  script?: string;
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#666',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
      }}
    >
      <title>{title}</title>
      <span>{message}</span>
      {script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}
    </main>
  );
}