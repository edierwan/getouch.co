import http from 'node:http';
import { URL } from 'node:url';
import { rm } from 'node:fs/promises';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from 'baileys';
import pino from 'pino';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.WA_API_KEY || '';
const AUTH_DIR = process.env.WA_AUTH_DIR || '/app/data/auth';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = pino({ level: LOG_LEVEL });

if (!API_KEY) {
  logger.warn('WA_API_KEY is not set — protected endpoints will reject all requests');
}

// ---------------------------------------------------------------------------
// Event log (in-memory ring buffer)
// ---------------------------------------------------------------------------
const MAX_EVENTS = 80;
const events = [];
function addEvent(type, detail) {
  events.unshift({ ts: new Date().toISOString(), type, detail });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

// ---------------------------------------------------------------------------
// WhatsApp connection state
// ---------------------------------------------------------------------------
let sock = null;
let connectionState = 'disconnected'; // disconnected | connecting | open
let lastDisconnect = null;
let pairedPhone = null;
let qrCode = null;
let pairingRequested = false;
let startTime = Date.now();

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  connectionState = 'connecting';
  qrCode = null;
  addEvent('connection', 'Connecting to WhatsApp…');

  sock = makeWASocket.default({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['Getouch WA', 'Server', '1.0.0'],
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect: ld, qr } = update;

    if (qr) {
      qrCode = qr;
      addEvent('qr', 'QR code generated — use pairing code instead');
      logger.info('New QR code generated (use /api/pairing-code endpoint instead)');
    }

    if (connection === 'open') {
      connectionState = 'open';
      qrCode = null;
      pairingRequested = false;
      // Try to extract paired phone from creds
      try {
        const me = sock.user;
        if (me?.id) pairedPhone = me.id.split(':')[0].split('@')[0];
      } catch {}
      addEvent('connected', `WhatsApp connected${pairedPhone ? ' as ' + pairedPhone : ''}`);
      logger.info('WhatsApp connection opened');
    }

    if (connection === 'close') {
      connectionState = 'disconnected';
      lastDisconnect = ld;
      const statusCode = ld?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      addEvent('disconnected', `Closed (code ${statusCode})${shouldReconnect ? ' — reconnecting' : ' — logged out'}`);
      logger.info({ statusCode, shouldReconnect }, 'Connection closed');

      if (shouldReconnect) {
        setTimeout(() => startWhatsApp(), 3000);
      } else {
        pairedPhone = null;
        logger.info('Logged out — clearing auth state');
        await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
        const sender = msg.key.remoteJid;
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          '';
        addEvent('message_in', `From ${sender}: ${text.slice(0, 80)}`);
        logger.info({ sender, text: text.slice(0, 100) }, 'Incoming message');
      }
    }
  });
}

// Start on boot
startWhatsApp().catch((err) => {
  addEvent('error', `Failed to start: ${err.message}`);
  logger.error(err, 'Failed to start WhatsApp');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function requireAuth(req, res) {
  if (!API_KEY) {
    json(res, 500, { error: 'API key not configured on server' });
    return false;
  }
  const provided = req.headers['x-api-key'];
  if (!provided || provided !== API_KEY) {
    json(res, 401, { error: 'Unauthorized — invalid or missing X-API-Key' });
    return false;
  }
  return true;
}

function requireConnected(res) {
  if (connectionState !== 'open' || !sock) {
    json(res, 503, { error: 'WhatsApp not connected', state: connectionState });
    return false;
  }
  return true;
}

function toJid(phone) {
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `${digits}@s.whatsapp.net`;
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

// ---------------------------------------------------------------------------
// Console UI (server-rendered HTML)
// ---------------------------------------------------------------------------
function consoleHtml() {
  const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Getouch WhatsApp Console</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💬</text></svg>"/>
<style>
:root{
  --bg:#0b1120;--surface:#131c31;--surface2:#1a2540;--border:#1e2d4a;
  --text:#e2e8f0;--text2:#94a3b8;--text3:#5a657a;
  --accent:#6366f1;--accent-dim:rgba(99,102,241,.12);
  --green:#22c55e;--green-dim:rgba(34,197,94,.12);--green-border:rgba(34,197,94,.25);
  --red:#ef4444;--red-dim:rgba(239,68,68,.12);--red-border:rgba(239,68,68,.25);
  --yellow:#eab308;--yellow-dim:rgba(234,179,8,.12);--yellow-border:rgba(234,179,8,.25);
  --blue:#3b82f6;--blue-dim:rgba(59,130,246,.12);
  --radius:0.75rem;--font:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --mono:'SF Mono',Monaco,'Cascadia Code','Fira Code',monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;line-height:1.5}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

/* Layout */
.shell{max-width:72rem;margin:0 auto;padding:1.5rem}
@media(min-width:768px){.shell{padding:2rem 2.5rem}}

/* Header */
.hdr{display:flex;align-items:center;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}
.hdr-icon{font-size:2rem}
.hdr-titles{flex:1;min-width:0}
.hdr-titles h1{font-size:1.5rem;font-weight:800;letter-spacing:-.02em}
.hdr-titles p{color:var(--text2);font-size:.85rem;margin-top:.1rem}
.hdr-badge{padding:.25rem .7rem;border-radius:9999px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.badge-open{background:var(--green-dim);border:1px solid var(--green-border);color:var(--green)}
.badge-closed{background:var(--red-dim);border:1px solid var(--red-border);color:var(--red)}
.badge-connecting{background:var(--yellow-dim);border:1px solid var(--yellow-border);color:var(--yellow)}

/* Summary cards */
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.5rem}
@media(max-width:900px){.summary{grid-template-columns:repeat(2,1fr)}}
@media(max-width:500px){.summary{grid-template-columns:1fr}}
.scard{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem}
.scard-label{font-size:.72rem;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.35rem}
.scard-val{font-size:1.35rem;font-weight:700}
.scard-sub{font-size:.78rem;color:var(--text2);margin-top:.2rem}

/* Panels */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem}
@media(max-width:700px){.grid2{grid-template-columns:1fr}}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem 1.5rem;margin-bottom:1rem}
.panel h2{font-size:1rem;font-weight:700;margin-bottom:.85rem;display:flex;align-items:center;gap:.5rem}
.panel h2 .pi{font-size:1.1rem}

/* Forms */
.field{margin-bottom:.75rem}
.field label{display:block;font-size:.78rem;color:var(--text2);margin-bottom:.25rem;font-weight:600}
.field input,.field textarea{width:100%;padding:.55rem .75rem;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;color:var(--text);font-size:.88rem;font-family:var(--font);outline:none;transition:border-color .2s}
.field input:focus,.field textarea:focus{border-color:var(--accent)}
.field textarea{resize:vertical;min-height:3.5rem}
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1.1rem;border-radius:.5rem;font-size:.85rem;font-weight:600;border:none;cursor:pointer;transition:opacity .2s,transform .1s}
.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:var(--accent);color:#fff}
.btn-danger{background:var(--red);color:#fff}
.btn-sm{padding:.4rem .8rem;font-size:.8rem}
.result{margin-top:.75rem;padding:.65rem .85rem;border-radius:.5rem;font-size:.82rem;font-family:var(--mono);white-space:pre-wrap;word-break:break-all;max-height:12rem;overflow-y:auto;display:none}
.result.show{display:block}
.result-ok{background:var(--green-dim);border:1px solid var(--green-border);color:var(--green)}
.result-err{background:var(--red-dim);border:1px solid var(--red-border);color:var(--red)}
.result-info{background:var(--blue-dim);border:1px solid rgba(59,130,246,.25);color:var(--blue)}

/* Instructions callout */
.callout{background:var(--surface2);border:1px solid var(--border);border-radius:.5rem;padding:.75rem 1rem;font-size:.82rem;color:var(--text2);margin-top:.5rem;line-height:1.6}
.callout strong{color:var(--text)}
.callout ol{margin:.35rem 0 0 1.2rem}

/* Endpoints table */
.ep-table{width:100%;border-collapse:collapse}
.ep-table th,.ep-table td{text-align:left;padding:.5rem .65rem;font-size:.82rem}
.ep-table th{color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:.7rem;border-bottom:1px solid var(--border)}
.ep-table td{border-bottom:1px solid rgba(30,45,74,.5)}
.ep-table tr:last-child td{border-bottom:none}
.mtag{display:inline-block;padding:.12rem .45rem;border-radius:.25rem;font-size:.7rem;font-weight:700;letter-spacing:.03em;min-width:2.8rem;text-align:center}
.mtag-get{background:var(--green-dim);color:var(--green)}
.mtag-post{background:var(--blue-dim);color:var(--blue)}
.auth-tag{font-size:.7rem;font-weight:600}
.auth-key{color:var(--yellow)}
.auth-pub{color:var(--green)}

/* Curl snippets */
.snippet{position:relative;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;padding:.7rem .85rem;font-family:var(--mono);font-size:.78rem;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:var(--text2);margin-bottom:.65rem;padding-right:3rem}
.snippet .copy-btn{position:absolute;top:.45rem;right:.45rem;background:var(--surface2);border:1px solid var(--border);color:var(--text2);border-radius:.35rem;padding:.2rem .45rem;font-size:.7rem;cursor:pointer;transition:color .2s}
.snippet .copy-btn:hover{color:var(--text)}

/* Event log */
.log-list{max-height:20rem;overflow-y:auto}
.log-item{display:flex;gap:.65rem;padding:.4rem 0;border-bottom:1px solid rgba(30,45,74,.4);font-size:.8rem}
.log-item:last-child{border-bottom:none}
.log-ts{color:var(--text3);font-family:var(--mono);font-size:.72rem;white-space:nowrap;min-width:5rem}
.log-type{font-weight:600;min-width:5.5rem;font-size:.72rem;text-transform:uppercase}
.log-type.t-connected,.log-type.t-message_out{color:var(--green)}
.log-type.t-disconnected,.log-type.t-error{color:var(--red)}
.log-type.t-connection,.log-type.t-qr,.log-type.t-pairing{color:var(--yellow)}
.log-type.t-message_in{color:var(--blue)}
.log-type.t-logout{color:var(--red)}
.log-detail{color:var(--text2);word-break:break-all}

/* Footer */
.ft{text-align:center;color:var(--text3);font-size:.75rem;padding:2rem 0 1rem;border-top:1px solid var(--border);margin-top:1.5rem}

/* Spinner */
.spin{display:inline-block;width:.85rem;height:.85rem;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:sp .6s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="shell">
  <!-- Header -->
  <div class="hdr">
    <span class="hdr-icon">💬</span>
    <div class="hdr-titles">
      <h1>Getouch WhatsApp Console</h1>
      <p>Baileys-powered messaging gateway &middot; wa.getouch.co</p>
    </div>
    <span class="hdr-badge badge-closed" id="hdr-badge">loading…</span>
  </div>

  <!-- Summary Cards -->
  <div class="summary">
    <div class="scard">
      <div class="scard-label">Service</div>
      <div class="scard-val" style="color:var(--green)" id="s-service">getouch-wa</div>
      <div class="scard-sub">Port ${PORT} &middot; Baileys</div>
    </div>
    <div class="scard">
      <div class="scard-label">Session</div>
      <div class="scard-val" id="s-session">—</div>
      <div class="scard-sub" id="s-phone"></div>
    </div>
    <div class="scard">
      <div class="scard-label">Uptime</div>
      <div class="scard-val" id="s-uptime">—</div>
      <div class="scard-sub" id="s-since"></div>
    </div>
    <div class="scard">
      <div class="scard-label">Last Event</div>
      <div class="scard-val" id="s-event" style="font-size:1rem">—</div>
      <div class="scard-sub" id="s-event-time"></div>
    </div>
  </div>

  <!-- Pair + Send Test -->
  <div class="grid2">
    <!-- Pair Number -->
    <div class="panel">
      <h2><span class="pi">🔗</span> Pair / Connect Number</h2>
      <div class="field">
        <label for="pair-phone">Phone number (with country code)</label>
        <input type="text" id="pair-phone" placeholder="60123456789" maxlength="15"/>
      </div>
      <div class="field">
        <label for="pair-key">API Key</label>
        <input type="password" id="pair-key" placeholder="your WA_API_KEY"/>
      </div>
      <button class="btn btn-primary" id="pair-btn" onclick="doPair()">Request Pairing Code</button>
      <button class="btn btn-danger btn-sm" style="margin-left:.5rem" id="logout-btn" onclick="doLogout()">Logout</button>
      <div class="result" id="pair-result"></div>
      <div class="callout" style="margin-top:.75rem">
        <strong>How to pair:</strong>
        <ol>
          <li>Enter your phone number above and click <strong>Request Pairing Code</strong></li>
          <li>Open WhatsApp on your phone</li>
          <li>Go to <strong>Linked Devices</strong></li>
          <li>Tap <strong>Link a Device</strong></li>
          <li>Choose <strong>Link with Phone Number</strong></li>
          <li>Enter the pairing code shown above</li>
        </ol>
      </div>
    </div>

    <!-- Send Test Message -->
    <div class="panel">
      <h2><span class="pi">✉️</span> Send Test Message</h2>
      <div class="field">
        <label for="send-to">Recipient phone number</label>
        <input type="text" id="send-to" placeholder="60123456789" maxlength="15"/>
      </div>
      <div class="field">
        <label for="send-text">Message</label>
        <textarea id="send-text" rows="3" placeholder="Hello from Getouch!"></textarea>
      </div>
      <div class="field">
        <label for="send-key">API Key</label>
        <input type="password" id="send-key" placeholder="your WA_API_KEY"/>
      </div>
      <button class="btn btn-primary" id="send-btn" onclick="doSend()">Send Message</button>
      <div class="result" id="send-result"></div>
    </div>
  </div>

  <!-- API Endpoints -->
  <div class="panel">
    <h2><span class="pi">⚡</span> API Endpoints</h2>
    <table class="ep-table">
      <thead><tr><th>Method</th><th>Endpoint</th><th>Auth</th><th style="width:40%">Description</th></tr></thead>
      <tbody>
        <tr><td><span class="mtag mtag-get">GET</span></td><td><code>/healthz</code></td><td><span class="auth-tag auth-pub">Public</span></td><td>Container health check</td></tr>
        <tr><td><span class="mtag mtag-get">GET</span></td><td><code>/api/status</code></td><td><span class="auth-tag auth-key">X-API-Key</span></td><td>Connection state &amp; session details</td></tr>
        <tr><td><span class="mtag mtag-get">GET</span></td><td><code>/api/pairing-code?phone=6012…</code></td><td><span class="auth-tag auth-key">X-API-Key</span></td><td>Generate WhatsApp pairing code</td></tr>
        <tr><td><span class="mtag mtag-post">POST</span></td><td><code>/api/send-text</code></td><td><span class="auth-tag auth-key">X-API-Key</span></td><td>Send text message</td></tr>
        <tr><td><span class="mtag mtag-post">POST</span></td><td><code>/api/send-image</code></td><td><span class="auth-tag auth-key">X-API-Key</span></td><td>Send image with optional caption</td></tr>
        <tr><td><span class="mtag mtag-post">POST</span></td><td><code>/api/send-document</code></td><td><span class="auth-tag auth-key">X-API-Key</span></td><td>Send document/file</td></tr>
        <tr><td><span class="mtag mtag-post">POST</span></td><td><code>/api/logout</code></td><td><span class="auth-tag auth-key">X-API-Key</span></td><td>Logout &amp; clear session</td></tr>
        <tr><td><span class="mtag mtag-get">GET</span></td><td><code>/api/events</code></td><td><span class="auth-tag auth-key">X-API-Key</span></td><td>Recent service events/logs</td></tr>
      </tbody>
    </table>

    <h3 style="font-size:.88rem;margin-top:1.25rem;margin-bottom:.5rem;color:var(--text2)">cURL Examples</h3>

    <div class="snippet">curl https://wa.getouch.co/healthz<button class="copy-btn" onclick="copySnippet(this)">Copy</button></div>

    <div class="snippet">curl -H "X-API-Key: YOUR_KEY" \\
  https://wa.getouch.co/api/status<button class="copy-btn" onclick="copySnippet(this)">Copy</button></div>

    <div class="snippet">curl -H "X-API-Key: YOUR_KEY" \\
  "https://wa.getouch.co/api/pairing-code?phone=60123456789"<button class="copy-btn" onclick="copySnippet(this)">Copy</button></div>

    <div class="snippet">curl -X POST https://wa.getouch.co/api/send-text \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"to":"60123456789","text":"Hello from Getouch!"}'<button class="copy-btn" onclick="copySnippet(this)">Copy</button></div>

    <div class="snippet">curl -X POST https://wa.getouch.co/api/send-image \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"to":"60123456789","imageUrl":"https://example.com/photo.jpg","caption":"Check this"}'<button class="copy-btn" onclick="copySnippet(this)">Copy</button></div>

    <div class="snippet">curl -X POST https://wa.getouch.co/api/send-document \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"to":"60123456789","fileUrl":"https://example.com/file.pdf","fileName":"report.pdf"}'<button class="copy-btn" onclick="copySnippet(this)">Copy</button></div>
  </div>

  <!-- Recent Events -->
  <div class="panel">
    <h2><span class="pi">📋</span> Recent Events</h2>
    <div class="log-list" id="log-list">
      <div style="color:var(--text3);font-size:.82rem;padding:.5rem 0">Loading events…</div>
    </div>
  </div>

  <div class="ft">Getouch WhatsApp Console &middot; Powered by <a href="https://github.com/WhiskeySockets/Baileys" target="_blank">Baileys</a></div>
</div>

<script>
// ── Helpers ──────────────────────────────────────────
function $(id){return document.getElementById(id)}
function show(el,cls,text){el.className='result show '+cls;el.textContent=text}
function copySnippet(btn){
  const t=btn.parentElement.textContent.replace('Copy','').trim();
  navigator.clipboard.writeText(t).then(()=>{btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy',1200)});
}
function savedKey(){return localStorage.getItem('wa_api_key')||''}
function saveKey(v){if(v)localStorage.setItem('wa_api_key',v)}
function getKey(fieldId){const v=$(fieldId).value.trim();if(v)saveKey(v);return v||savedKey()}

// Pre-fill API key fields from localStorage
window.addEventListener('DOMContentLoaded',()=>{
  const k=savedKey();
  if(k){$('pair-key').value=k;$('send-key').value=k}
});

// ── Status polling ──────────────────────────────────
async function refreshStatus(){
  try{
    const r=await fetch('/healthz');
    const d=await r.json();
    const st=d.whatsapp||'unknown';
    const badge=$('hdr-badge');
    badge.textContent=st;
    badge.className='hdr-badge '+(st==='open'?'badge-open':st==='connecting'?'badge-connecting':'badge-closed');
    $('s-session').textContent=st==='open'?'Connected':st==='connecting'?'Connecting…':'Disconnected';
    $('s-session').style.color=st==='open'?'var(--green)':st==='connecting'?'var(--yellow)':'var(--red)';
    $('s-phone').textContent=d.phone?'+'+d.phone:'No number paired';
    const secs=Math.floor(d.uptime||0);
    const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
    const dd=Math.floor(secs/86400);
    $('s-uptime').textContent=dd>0?dd+'d '+h+'h':h+'h '+m+'m '+s+'s';
    $('s-since').textContent='Since '+new Date(Date.now()-secs*1000).toLocaleString();
    if(d.lastEvent){
      $('s-event').textContent=d.lastEvent.type;
      $('s-event-time').textContent=new Date(d.lastEvent.ts).toLocaleTimeString();
    }
  }catch(e){}
}
refreshStatus();
setInterval(refreshStatus,4000);

// ── Events polling ──────────────────────────────────
async function refreshEvents(){
  const key=savedKey();
  if(!key){$('log-list').innerHTML='<div style="color:var(--text3);font-size:.82rem;padding:.5rem 0">Enter API key above to view events</div>';return}
  try{
    const r=await fetch('/api/events',{headers:{'X-API-Key':key}});
    if(!r.ok){$('log-list').innerHTML='<div style="color:var(--red);font-size:.82rem;padding:.5rem 0">Failed to load events ('+r.status+')</div>';return}
    const evts=await r.json();
    if(!evts.length){$('log-list').innerHTML='<div style="color:var(--text3);font-size:.82rem;padding:.5rem 0">No events yet</div>';return}
    $('log-list').innerHTML=evts.map(e=>{
      const t=new Date(e.ts);
      const ts=t.toLocaleTimeString();
      return '<div class="log-item"><span class="log-ts">'+ts+'</span><span class="log-type t-'+e.type+'">'+e.type+'</span><span class="log-detail">'+esc(e.detail)+'</span></div>';
    }).join('');
  }catch(e){}
}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
refreshEvents();
setInterval(refreshEvents,5000);

// ── Pair ─────────────────────────────────────────────
async function doPair(){
  const phone=$('pair-phone').value.trim().replace(/[^0-9]/g,'');
  const key=getKey('pair-key');
  const res=$('pair-result');
  if(!phone){show(res,'result-err','Enter a phone number');return}
  if(!key){show(res,'result-err','Enter your API key');return}
  $('pair-btn').disabled=true;$('pair-btn').innerHTML='<span class="spin"></span> Requesting…';
  try{
    const r=await fetch('/api/pairing-code?phone='+phone,{headers:{'X-API-Key':key}});
    const d=await r.json();
    if(r.ok){
      show(res,'result-ok','Pairing Code: '+d.pairingCode+'\\n\\nPhone: +'+d.phone+'\\n\\n'+d.instructions);
    }else{
      show(res,'result-err',d.error||(r.status+' error'));
    }
  }catch(e){show(res,'result-err','Request failed: '+e.message)}
  $('pair-btn').disabled=false;$('pair-btn').textContent='Request Pairing Code';
  refreshStatus();refreshEvents();
}

// ── Logout ──────────────────────────────────────────
async function doLogout(){
  const key=getKey('pair-key');
  const res=$('pair-result');
  if(!key){show(res,'result-err','Enter your API key');return}
  if(!confirm('Logout current WhatsApp session?'))return;
  $('logout-btn').disabled=true;
  try{
    const r=await fetch('/api/logout',{method:'POST',headers:{'X-API-Key':key}});
    const d=await r.json();
    show(res,r.ok?'result-info':'result-err',r.ok?d.message:(d.error||'Logout failed'));
  }catch(e){show(res,'result-err','Request failed: '+e.message)}
  $('logout-btn').disabled=false;
  setTimeout(()=>{refreshStatus();refreshEvents()},1500);
}

// ── Send ─────────────────────────────────────────────
async function doSend(){
  const to=$('send-to').value.trim().replace(/[^0-9]/g,'');
  const text=$('send-text').value.trim();
  const key=getKey('send-key');
  const res=$('send-result');
  if(!to){show(res,'result-err','Enter recipient number');return}
  if(!text){show(res,'result-err','Enter a message');return}
  if(!key){show(res,'result-err','Enter your API key');return}
  $('send-btn').disabled=true;$('send-btn').innerHTML='<span class="spin"></span> Sending…';
  try{
    const r=await fetch('/api/send-text',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':key},body:JSON.stringify({to,text})});
    const d=await r.json();
    if(r.ok){
      show(res,'result-ok','Sent! Message ID: '+d.messageId+'\\nTo: '+d.to);
    }else{
      show(res,'result-err',d.error||(r.status+' error'));
    }
  }catch(e){show(res,'result-err','Request failed: '+e.message)}
  $('send-btn').disabled=false;$('send-btn').textContent='Send Message';
  refreshEvents();
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = parsed.pathname;
  const method = req.method;

  try {
    // ── Public ──────────────────────────────────────────

    // Health check (public — used by Docker healthcheck & Caddy)
    if (path === '/healthz' && method === 'GET') {
      return json(res, 200, {
        status: 'ok',
        service: 'getouch-wa',
        whatsapp: connectionState,
        phone: pairedPhone || null,
        uptime: (Date.now() - startTime) / 1000,
        lastEvent: events[0] || null,
      });
    }

    // Console UI
    if (path === '/' && method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(consoleHtml());
    }

    // ── API: require X-API-Key ──────────────────────────

    // GET /api/status
    if (path === '/api/status' && method === 'GET') {
      if (!requireAuth(req, res)) return;
      return json(res, 200, {
        state: connectionState,
        authenticated: connectionState === 'open',
        phone: pairedPhone || null,
        uptime: (Date.now() - startTime) / 1000,
        uptimeHuman: fmtUptime(Date.now() - startTime),
        lastDisconnect: lastDisconnect
          ? { code: lastDisconnect?.error?.output?.statusCode, reason: lastDisconnect?.error?.message }
          : null,
      });
    }

    // GET /api/events — recent in-memory events
    if (path === '/api/events' && method === 'GET') {
      if (!requireAuth(req, res)) return;
      return json(res, 200, events);
    }

    // GET /api/pairing-code?phone=6012xxxxxxx
    if (path === '/api/pairing-code' && method === 'GET') {
      if (!requireAuth(req, res)) return;
      const phone = parsed.searchParams.get('phone');
      if (!phone || !/^[0-9]{8,15}$/.test(phone.replace(/[^0-9]/g, ''))) {
        return json(res, 400, { error: 'Invalid phone number — provide digits only, 8-15 chars (e.g. 60123456789)' });
      }
      if (!sock) {
        return json(res, 503, { error: 'WhatsApp socket not initialized — wait a moment and retry' });
      }
      if (connectionState === 'open') {
        return json(res, 400, { error: 'Already connected — logout first to re-pair' });
      }

      try {
        const digits = phone.replace(/[^0-9]/g, '');
        addEvent('pairing', `Pairing code requested for +${digits}`);
        const code = await sock.requestPairingCode(digits);
        addEvent('pairing', `Pairing code generated for +${digits}: ${code}`);
        return json(res, 200, {
          pairingCode: code,
          phone: digits,
          instructions: 'Open WhatsApp > Linked Devices > Link a Device > Link with Phone Number, then enter the pairing code',
        });
      } catch (err) {
        addEvent('error', `Pairing failed: ${err.message}`);
        logger.error(err, 'Pairing code request failed');
        return json(res, 500, { error: 'Failed to generate pairing code', detail: err.message });
      }
    }

    // POST /api/send-text
    if (path === '/api/send-text' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      if (!requireConnected(res)) return;
      const body = await readBody(req);
      const { to, text } = body;
      if (!to || !text) return json(res, 400, { error: 'Missing required fields: to, text' });
      const jid = toJid(to);
      if (!jid) return json(res, 400, { error: 'Invalid phone number format' });

      const result = await sock.sendMessage(jid, { text });
      addEvent('message_out', `Text to ${jid}: ${text.slice(0, 60)}`);
      logger.info({ to: jid }, 'Text message sent');
      return json(res, 200, { success: true, messageId: result.key.id, to: jid });
    }

    // POST /api/send-image
    if (path === '/api/send-image' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      if (!requireConnected(res)) return;
      const body = await readBody(req);
      const { to, imageUrl, caption } = body;
      if (!to || !imageUrl) return json(res, 400, { error: 'Missing required fields: to, imageUrl' });
      const jid = toJid(to);
      if (!jid) return json(res, 400, { error: 'Invalid phone number format' });

      const msg = { image: { url: imageUrl } };
      if (caption) msg.caption = caption;
      const result = await sock.sendMessage(jid, msg);
      addEvent('message_out', `Image to ${jid}`);
      logger.info({ to: jid }, 'Image message sent');
      return json(res, 200, { success: true, messageId: result.key.id, to: jid });
    }

    // POST /api/send-document
    if (path === '/api/send-document' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      if (!requireConnected(res)) return;
      const body = await readBody(req);
      const { to, fileUrl, fileName, caption } = body;
      if (!to || !fileUrl || !fileName) return json(res, 400, { error: 'Missing required fields: to, fileUrl, fileName' });
      const jid = toJid(to);
      if (!jid) return json(res, 400, { error: 'Invalid phone number format' });

      const msg = { document: { url: fileUrl }, mimetype: 'application/octet-stream', fileName };
      if (caption) msg.caption = caption;
      const result = await sock.sendMessage(jid, msg);
      addEvent('message_out', `Document "${fileName}" to ${jid}`);
      logger.info({ to: jid, fileName }, 'Document message sent');
      return json(res, 200, { success: true, messageId: result.key.id, to: jid });
    }

    // POST /api/logout
    if (path === '/api/logout' && method === 'POST') {
      if (!requireAuth(req, res)) return;
      try {
        if (sock) await sock.logout();
        await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
        connectionState = 'disconnected';
        pairedPhone = null;
        sock = null;
        addEvent('logout', 'Session cleared');
        logger.info('Logged out and cleared session');
        setTimeout(() => startWhatsApp(), 1000);
        return json(res, 200, { success: true, message: 'Logged out — session cleared' });
      } catch (err) {
        logger.error(err, 'Logout failed');
        await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
        connectionState = 'disconnected';
        pairedPhone = null;
        sock = null;
        addEvent('logout', 'Force-cleared session');
        setTimeout(() => startWhatsApp(), 1000);
        return json(res, 200, { success: true, message: 'Force logged out — session cleared' });
      }
    }

    // 404
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    logger.error(err, 'Request handler error');
    json(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Getouch WhatsApp Console listening on port ${PORT}`);
});