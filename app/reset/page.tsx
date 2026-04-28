import { OpenClawBootstrapPage, requireOpenClawHost } from '../openclaw/bootstrap';

export const dynamic = 'force-dynamic';

const resetScript = `(function () {
  var explicitKeys = [
    'openclaw-device-identity-v1',
    'openclaw.device.auth.v1',
    'openclaw.control.settings.v1',
    'openclaw.control.settings.v1:wss://openclaw.getouch.co',
    'openclaw.control.settings.v1:wss://openclaw.getouch.co/chat',
    'openclaw.control.token.v1',
    'openclaw.control.token.v1:wss://openclaw.getouch.co',
    'openclaw.control.token.v1:wss://openclaw.getouch.co/chat'
  ];

  try {
    explicitKeys.forEach(function (key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    var keys = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (key && key.indexOf('openclaw') === 0) keys.push(key);
    }
    keys.forEach(function (key) {
      localStorage.removeItem(key);
    });
  } catch (_) {}

  document.cookie = 'openclaw_boot=; Max-Age=0; Path=/; SameSite=Lax';
  window.location.replace('/chat?session=main');
})();`;

export default async function OpenClawResetPage() {
  await requireOpenClawHost();

  return (
    <OpenClawBootstrapPage
      title="OpenClaw - Resetting"
      message="Clearing OpenClaw session data..."
      script={resetScript}
    />
  );
}