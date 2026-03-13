# Getouch WhatsApp Console

Baileys-powered WhatsApp messaging gateway with built-in admin console for the Getouch platform.

## Environment Variables

| Variable | Required | Default | Description |
|--|--|--|--|
| `WA_API_KEY` | **Yes** | — | API key for protected endpoints (set in platform.env) |
| `WA_PORT` | No | `3001` | HTTP listen port |
| `WA_AUTH_DIR` | No | `/app/data/auth` | Path to auth session storage |
| `WA_LOG_LEVEL` | No | `info` | Pino log level (debug/info/warn/error) |

## Quick Start

### 1. Add API key to platform.env

```bash
# On the VPS
WA_KEY=$(openssl rand -hex 24)
echo "WA_API_KEY=${WA_KEY}" >> /data/getouch/platform.env
echo "Your WA API key: ${WA_KEY}"
mkdir -p /data/getouch/wa
```

### 2. Build and start

```bash
cd ~/apps/getouch.co
source /data/getouch/platform.env && export $(grep -v '^#' /data/getouch/platform.env | cut -d= -f1)
docker compose build wa
docker compose up -d wa
```

### 3. Open the Console

Visit **https://wa.getouch.co** — the console dashboard shows connection status, pairing, test messaging, API docs, and event log.

### 4. Pair your phone

Either use the console UI or curl:

```bash
curl -H "X-API-Key: YOUR_KEY" \
  "https://wa.getouch.co/api/pairing-code?phone=60123456789"
```

Then on your phone:
1. Open WhatsApp
2. Go to **Linked Devices**
3. Tap **Link a Device**
4. Choose **Link with Phone Number**
5. Enter the pairing code

The session persists across container restarts (stored in `/data/getouch/wa/auth` on the host).

## Console UI

The root page at `wa.getouch.co` provides:
- **Service status** — live connection state, uptime, paired number
- **Pair / Connect** — enter phone, get pairing code, follow instructions
- **Send Test Message** — send a text via the UI
- **API Endpoints** — full endpoint reference with curl examples
- **Recent Events** — live in-memory event log (connections, messages, errors)

## API Endpoints

All API routes are under `/api/*` and require `X-API-Key` header (except `/healthz`).

| Method | Path | Auth | Description |
|--|--|--|--|
| GET | `/` | Public | Console dashboard UI |
| GET | `/healthz` | Public | Container health check |
| GET | `/api/status` | X-API-Key | Connection state & session details |
| GET | `/api/events` | X-API-Key | Recent service events (in-memory) |
| GET | `/api/pairing-code?phone=...` | X-API-Key | Generate WhatsApp pairing code |
| POST | `/api/send-text` | X-API-Key | Send text message |
| POST | `/api/send-image` | X-API-Key | Send image with optional caption |
| POST | `/api/send-document` | X-API-Key | Send document/file |
| POST | `/api/logout` | X-API-Key | Logout & clear session |

## cURL Examples

```bash
# Health check
curl https://wa.getouch.co/healthz

# Status
curl -H "X-API-Key: YOUR_KEY" https://wa.getouch.co/api/status

# Pairing
curl -H "X-API-Key: YOUR_KEY" \
  "https://wa.getouch.co/api/pairing-code?phone=60123456789"

# Send text
curl -X POST https://wa.getouch.co/api/send-text \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"to": "60123456789", "text": "Hello from Getouch!"}'

# Send image
curl -X POST https://wa.getouch.co/api/send-image \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"to": "60123456789", "imageUrl": "https://example.com/photo.jpg", "caption": "Check this"}'

# Send document
curl -X POST https://wa.getouch.co/api/send-document \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"to": "60123456789", "fileUrl": "https://example.com/file.pdf", "fileName": "report.pdf"}'

# Logout
curl -X POST https://wa.getouch.co/api/logout \
  -H "X-API-Key: YOUR_KEY"
```

## Using from Other Websites

Any backend or frontend can call the API endpoints with the `X-API-Key` header:

```javascript
const res = await fetch('https://wa.getouch.co/api/send-text', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'YOUR_KEY',
  },
  body: JSON.stringify({ to: '60123456789', text: 'Hello!' }),
});
const data = await res.json();
```

## Architecture

- **Engine**: [Baileys](https://github.com/WhiskeySockets/Baileys) (unofficial WhatsApp Web API)
- **Runtime**: Node.js 22 (Alpine)
- **Auth storage**: Multi-file auth state in Docker volume `/data/getouch/wa`
- **Access**: Internal only — public access via Caddy reverse proxy at `wa.getouch.co`
- **Console**: Server-rendered HTML dashboard with live-polling JS
