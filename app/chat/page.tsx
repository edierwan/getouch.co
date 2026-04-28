import { OpenClawBootstrapPage, requireOpenClawHost } from '../openclaw/bootstrap';

export const dynamic = 'force-dynamic';

export default async function OpenClawChatGuardPage() {
  await requireOpenClawHost();

  const token = process.env.OPENCLAW_GATEWAY_TOKEN || '';

  if (!token) {
    return (
      <OpenClawBootstrapPage
        title="OpenClaw - Token Missing"
        message="OpenClaw bootstrap token is not configured on this runtime."
      />
    );
  }

  const guardScript = `(function () {
    var token = ${JSON.stringify(token)};
    var rootTokenKey = 'openclaw.control.token.v1:wss://openclaw.getouch.co';
    var chatTokenKey = 'openclaw.control.token.v1:wss://openclaw.getouch.co/chat';
    var hasToken = false;

    try {
      hasToken = !!(localStorage.getItem(rootTokenKey) || localStorage.getItem(chatTokenKey));
    } catch (_) {}

    document.cookie = 'openclaw_boot=1; Max-Age=15; Path=/; SameSite=Lax';

    if (window.location.hash.indexOf('token=') !== -1) {
      window.location.reload();
      return;
    }

    if (hasToken) {
      window.location.reload();
      return;
    }

    window.location.hash = 'token=' + token;
    window.location.reload();
  })();`;

  return (
    <OpenClawBootstrapPage
      title="OpenClaw - Bootstrapping"
      message="Preparing OpenClaw..."
      script={guardScript}
    />
  );
}