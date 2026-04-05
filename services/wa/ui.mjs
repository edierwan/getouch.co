/**
 * Getouch WA – Admin Console UI (v2)
 *
 * Full SPA admin console with sidebar navigation, 9 sections:
 * Overview, Sessions, API Keys, Apps, Messages, Events, Tools, Integrations, Settings
 */

import { isDbReady } from './db.mjs';

export function consoleHtml(state = {}) {
  const { connectionState = 'disconnected', pairedPhone = null, PORT = 3001 } = state;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Getouch WA Admin</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#x1F4AC;</text></svg>"/>
<style>
:root{
  --bg:#0b1120;--surface:#131c31;--surface2:#1a2540;--border:#1e2d4a;
  --text:#e2e8f0;--text2:#94a3b8;--text3:#5a657a;
  --accent:#6366f1;--accent-dim:rgba(99,102,241,.12);--accent-border:rgba(99,102,241,.25);
  --green:#22c55e;--green-dim:rgba(34,197,94,.12);--green-border:rgba(34,197,94,.25);
  --red:#ef4444;--red-dim:rgba(239,68,68,.12);--red-border:rgba(239,68,68,.25);
  --yellow:#eab308;--yellow-dim:rgba(234,179,8,.12);--yellow-border:rgba(234,179,8,.25);
  --blue:#3b82f6;--blue-dim:rgba(59,130,246,.12);--blue-border:rgba(59,130,246,.25);
  --radius:0.75rem;--font:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --mono:'SF Mono',Monaco,'Cascadia Code','Fira Code',monospace;
  --sidebar-w:240px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;line-height:1.5}
a{color:var(--accent);text-decoration:none}
button{font-family:var(--font)}

/* ─── Layout ─── */
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sidebar-w);background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;transition:transform .25s}
.sidebar-brand{padding:1.25rem 1rem;display:flex;align-items:center;gap:.65rem;border-bottom:1px solid var(--border)}
.sidebar-brand span{font-size:1.4rem}
.sidebar-brand h1{font-size:1rem;font-weight:800;letter-spacing:-.01em}
.sidebar-brand small{display:block;font-size:.65rem;color:var(--text3);font-weight:400}
.sidebar-nav{flex:1;padding:.75rem .5rem;overflow-y:auto}
.nav-section{font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;font-weight:700;padding:.75rem .75rem .35rem;margin-top:.25rem}
.nav-item{display:flex;align-items:center;gap:.6rem;padding:.55rem .75rem;border-radius:.5rem;font-size:.85rem;font-weight:500;color:var(--text2);cursor:pointer;transition:all .15s;border:none;background:none;width:100%;text-align:left}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:var(--accent-dim);color:var(--accent);font-weight:600}
.nav-item .ni{font-size:1rem;width:1.4rem;text-align:center}
.nav-item .badge{margin-left:auto;font-size:.65rem;background:var(--accent-dim);color:var(--accent);padding:.1rem .4rem;border-radius:9999px;font-weight:700}
.sidebar-foot{padding:.75rem 1rem;border-top:1px solid var(--border);font-size:.72rem;color:var(--text3)}

/* Main content */
.main{margin-left:var(--sidebar-w);flex:1;display:flex;flex-direction:column;min-height:100vh}
.topbar{display:flex;align-items:center;gap:1rem;padding:.75rem 1.5rem;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:40}
.topbar-left{display:flex;align-items:center;gap:.75rem;flex:1}
.topbar-left h2{font-size:1.1rem;font-weight:700}
.topbar-right{display:flex;align-items:center;gap:.75rem}
.status-pill{display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .65rem;border-radius:9999px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.pill-open{background:var(--green-dim);border:1px solid var(--green-border);color:var(--green)}
.pill-closed{background:var(--red-dim);border:1px solid var(--red-border);color:var(--red)}
.pill-connecting{background:var(--yellow-dim);border:1px solid var(--yellow-border);color:var(--yellow)}
.phone-tag{font-size:.78rem;color:var(--text2);font-family:var(--mono)}
.content{flex:1;padding:1.5rem;max-width:1200px;width:100%}

/* ─── Cards ─── */
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.5rem}
@media(max-width:1000px){.cards{grid-template-columns:repeat(2,1fr)}}
@media(max-width:550px){.cards{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem}
.card-label{font-size:.7rem;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:.3rem}
.card-val{font-size:1.4rem;font-weight:700}
.card-sub{font-size:.75rem;color:var(--text2);margin-top:.15rem}

/* ─── Panel / Table ─── */
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem 1.5rem;margin-bottom:1rem}
.panel-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.panel-hdr h3{font-size:1rem;font-weight:700;display:flex;align-items:center;gap:.5rem}
.tbl{width:100%;border-collapse:collapse}
.tbl th,.tbl td{text-align:left;padding:.55rem .65rem;font-size:.82rem}
.tbl th{color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:.7rem;border-bottom:1px solid var(--border)}
.tbl td{border-bottom:1px solid rgba(30,45,74,.4)}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:rgba(99,102,241,.03)}
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:.35rem}
.dot-active{background:var(--green)}
.dot-revoked,.dot-inactive{background:var(--red)}

/* ─── Buttons ─── */
.btn{display:inline-flex;align-items:center;gap:.35rem;padding:.5rem 1rem;border-radius:.5rem;font-size:.82rem;font-weight:600;border:none;cursor:pointer;transition:opacity .15s,transform .1s}
.btn:active{transform:scale(.97)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:var(--accent);color:#fff}
.btn-danger{background:var(--red);color:#fff}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border)}
.btn-ghost:hover{color:var(--text);border-color:var(--text3)}
.btn-sm{padding:.35rem .65rem;font-size:.78rem}
.btn-icon{padding:.35rem;background:none;border:none;color:var(--text3);cursor:pointer;border-radius:.35rem;font-size:.9rem}
.btn-icon:hover{color:var(--text);background:var(--surface2)}

/* ─── Forms ─── */
.field{margin-bottom:.75rem}
.field label{display:block;font-size:.78rem;color:var(--text2);margin-bottom:.25rem;font-weight:600}
.field input,.field textarea,.field select{width:100%;padding:.5rem .75rem;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;color:var(--text);font-size:.85rem;font-family:var(--font);outline:none;transition:border-color .2s}
.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--accent)}
.field textarea{resize:vertical;min-height:3rem}
.field-row{display:flex;gap:.75rem}
.field-row .field{flex:1}
.field .hint{font-size:.7rem;color:var(--text3);margin-top:.2rem}

/* ─── Modal ─── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:none;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);width:90%;max-width:520px;max-height:85vh;overflow-y:auto;padding:1.5rem}
.modal h3{font-size:1.1rem;font-weight:700;margin-bottom:1rem}
.modal-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1.25rem}

/* ─── Toast ─── */
.toast-area{position:fixed;top:1rem;right:1rem;z-index:200;display:flex;flex-direction:column;gap:.5rem}
.toast{padding:.65rem 1rem;border-radius:.5rem;font-size:.82rem;font-weight:500;animation:fadeIn .2s;max-width:380px}
.toast-ok{background:var(--green-dim);border:1px solid var(--green-border);color:var(--green)}
.toast-err{background:var(--red-dim);border:1px solid var(--red-border);color:var(--red)}
.toast-info{background:var(--blue-dim);border:1px solid var(--blue-border);color:var(--blue)}
@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}

/* ─── QR ─── */
.qr-box{display:flex;flex-direction:column;align-items:center;gap:.75rem;padding:1rem 0}
.qr-box img{border-radius:.5rem;border:3px solid var(--border);background:#fff}
.qr-placeholder{width:280px;height:280px;display:flex;align-items:center;justify-content:center;border-radius:.5rem;border:2px dashed var(--border);color:var(--text3);font-size:.82rem;text-align:center;padding:1rem}

/* ─── Tabs ─── */
.tab-row{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:1rem}
.tab-btn{padding:.5rem 1rem;font-size:.82rem;font-weight:600;background:none;border:none;color:var(--text3);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s,border-color .15s}
.tab-btn.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab-pane{display:none}.tab-pane.active{display:block}

/* ─── Event log ─── */
.log-list{max-height:24rem;overflow-y:auto}
.log-item{display:flex;gap:.5rem;padding:.35rem 0;border-bottom:1px solid rgba(30,45,74,.35);font-size:.8rem}
.log-item:last-child{border-bottom:none}
.log-ts{color:var(--text3);font-family:var(--mono);font-size:.72rem;white-space:nowrap;min-width:5rem}
.log-type{font-weight:600;min-width:5.5rem;font-size:.72rem;text-transform:uppercase}
.log-type.t-connected,.log-type.t-message_out{color:var(--green)}
.log-type.t-disconnected,.log-type.t-error{color:var(--red)}
.log-type.t-connection,.log-type.t-qr,.log-type.t-pairing{color:var(--yellow)}
.log-type.t-message_in{color:var(--blue)}
.log-detail{color:var(--text2);word-break:break-all;flex:1}

/* ─── Snippets ─── */
.snippet{position:relative;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;padding:.6rem .8rem;padding-right:3rem;font-family:var(--mono);font-size:.76rem;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:var(--text2);margin-bottom:.5rem}
.snippet .cp{position:absolute;top:.4rem;right:.4rem;background:var(--surface2);border:1px solid var(--border);color:var(--text2);border-radius:.3rem;padding:.15rem .4rem;font-size:.68rem;cursor:pointer}
.snippet .cp:hover{color:var(--text)}

/* ─── Callout ─── */
.callout{background:var(--surface2);border:1px solid var(--border);border-radius:.5rem;padding:.7rem .9rem;font-size:.8rem;color:var(--text2);line-height:1.6}
.callout strong{color:var(--text)}
.callout ol{margin:.3rem 0 0 1.1rem}

/* Spinner */
.spin{display:inline-block;width:.8rem;height:.8rem;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:sp .6s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

/* ─── Pager ─── */
.pager{display:flex;gap:.5rem;justify-content:center;align-items:center;margin-top:.75rem;font-size:.78rem;color:var(--text3)}

/* ─── Responsive ─── */
.menu-btn{display:none;background:none;border:none;color:var(--text);font-size:1.4rem;cursor:pointer;padding:.25rem}
@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .main{margin-left:0}
  .menu-btn{display:block}
  .cards{grid-template-columns:1fr}
}

/* ─── Page sections ─── */
.page{display:none}.page.active{display:block}
</style>
</head>
<body>
<div class="layout">
<!-- ─── Sidebar ─── -->
<aside class="sidebar" id="sidebar">
  <div class="sidebar-brand">
    <span>&#x1F4AC;</span>
    <div><h1>Getouch WA</h1><small>Admin Console</small></div>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-section">Dashboard</div>
    <button class="nav-item active" onclick="go('overview')"><span class="ni">&#x1F3E0;</span> Overview</button>
    <button class="nav-item" onclick="go('sessions')"><span class="ni">&#x1F4F1;</span> Sessions</button>
    <div class="nav-section">Management</div>
    <button class="nav-item" onclick="go('apikeys')"><span class="ni">&#x1F511;</span> API Keys</button>
    <button class="nav-item" onclick="go('apps')"><span class="ni">&#x1F4E6;</span> Apps / Domains</button>
    <div class="nav-section">Analytics</div>
    <button class="nav-item" onclick="go('messages')"><span class="ni">&#x1F4AC;</span> Messages</button>
    <button class="nav-item" onclick="go('events')"><span class="ni">&#x1F4CB;</span> Events</button>
    <div class="nav-section">Operations</div>
    <button class="nav-item" onclick="go('tools')"><span class="ni">&#x1F6E0;</span> Tools</button>
    <button class="nav-item" onclick="go('integrations')"><span class="ni">&#x1F517;</span> Integrations</button>
    <button class="nav-item" onclick="go('settings')"><span class="ni">&#x2699;</span> Settings</button>
  </nav>
  <div class="sidebar-foot">Getouch WA v2.0${isDbReady() ? ' &middot; <span style="color:var(--green)">DB</span>' : ''}</div>
</aside>

<!-- ─── Main ─── -->
<div class="main">
  <div class="topbar">
    <div class="topbar-left">
      <button class="menu-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">&#9776;</button>
      <h2 id="page-title">Overview</h2>
    </div>
    <div class="topbar-right">
      <span class="phone-tag" id="top-phone"></span>
      <span class="status-pill pill-closed" id="top-status">loading</span>
    </div>
  </div>
  <div class="content">

<!-- ════════════ OVERVIEW ════════════ -->
<div class="page active" id="p-overview">
  <div class="cards" id="ov-cards">
    <div class="card"><div class="card-label">Status</div><div class="card-val" id="ov-status" style="color:var(--red)">&#x2014;</div><div class="card-sub" id="ov-phone"></div></div>
    <div class="card"><div class="card-label">Uptime</div><div class="card-val" id="ov-uptime">&#x2014;</div><div class="card-sub" id="ov-since"></div></div>
    <div class="card"><div class="card-label">Messages (24h)</div><div class="card-val" id="ov-msgs24">&#x2014;</div><div class="card-sub" id="ov-msgstotal"></div></div>
    <div class="card"><div class="card-label">Active Keys</div><div class="card-val" id="ov-keys">&#x2014;</div><div class="card-sub" id="ov-apps"></div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
    <div class="panel">
      <div class="panel-hdr"><h3>&#x1F4CA; Quick Stats</h3><button class="btn btn-ghost btn-sm" onclick="loadOverview()">Refresh</button></div>
      <div class="cards" style="grid-template-columns:1fr 1fr;margin-bottom:0">
        <div class="card"><div class="card-label">Sent</div><div class="card-val" style="color:var(--green)" id="ov-sent">0</div></div>
        <div class="card"><div class="card-label">Received</div><div class="card-val" style="color:var(--blue)" id="ov-recv">0</div></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-hdr"><h3>&#x1F4CB; Recent Events</h3></div>
      <div class="log-list" id="ov-events" style="max-height:14rem"><div style="color:var(--text3);font-size:.82rem">Loading&#x2026;</div></div>
    </div>
  </div>
</div>

<!-- ════════════ SESSIONS ════════════ -->
<div class="page" id="p-sessions">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
    <div class="panel">
      <div class="panel-hdr"><h3>&#x1F4F1; WhatsApp Session</h3></div>
      <div class="cards" style="grid-template-columns:1fr;margin-bottom:.75rem">
        <div class="card"><div class="card-label">Connection</div><div class="card-val" id="ses-state">&#x2014;</div><div class="card-sub" id="ses-phone"></div></div>
      </div>
      <div class="tab-row">
        <button class="tab-btn active" onclick="sesTab('qr')">&#x1F4F7; QR Code</button>
        <button class="tab-btn" onclick="sesTab('phone')">&#x1F4F1; Phone</button>
      </div>
      <div class="tab-pane active" id="ses-tab-qr">
        <div class="qr-box" id="qr-box">
          <div class="qr-placeholder"><span>QR code will appear<br/>when WhatsApp is ready</span></div>
        </div>
        <div style="display:flex;gap:.5rem;justify-content:center;margin-top:.5rem">
          <button class="btn btn-primary btn-sm" onclick="refreshQR()">Refresh QR</button>
          <button class="btn btn-danger btn-sm" onclick="doLogout()">Logout</button>
          <button class="btn btn-ghost btn-sm" onclick="doReset()">Reset Session</button>
        </div>
        <div class="callout" style="margin-top:.75rem"><strong>How to pair:</strong><ol>
          <li>Wait for QR above</li><li>WhatsApp &rarr; Linked Devices &rarr; Link a Device</li><li>Scan the QR code</li></ol>
          <div style="margin-top:.35rem;color:var(--yellow)"><strong>Tip:</strong> QR refreshes ~20s. Click Refresh QR if expired.</div>
        </div>
      </div>
      <div class="tab-pane" id="ses-tab-phone">
        <div class="field"><label>Phone number</label><input type="text" id="pair-phone" placeholder="0192277233" maxlength="15"/><div class="hint">Malaysian numbers auto-converted: 019... &rarr; 6019...</div></div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-primary" onclick="doPair()">Request Pairing Code</button>
          <button class="btn btn-danger btn-sm" onclick="doLogout()">Logout</button>
          <button class="btn btn-ghost btn-sm" onclick="doReset()">Reset Session</button>
        </div>
        <div id="pair-result" style="margin-top:.5rem"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-hdr"><h3>&#x2709; Send Test Message</h3></div>
      <div class="field"><label>Recipient</label><input type="text" id="send-to" placeholder="0192277233" maxlength="15"/></div>
      <div class="field"><label>Message</label><textarea id="send-text" rows="3" placeholder="Hello from Getouch!"></textarea></div>
      <button class="btn btn-primary" id="send-btn" onclick="doSend()">Send Message</button>
      <div id="send-result" style="margin-top:.5rem"></div>
    </div>
  </div>
</div>

<!-- ════════════ API KEYS ════════════ -->
<div class="page" id="p-apikeys">
  <div class="panel">
    <div class="panel-hdr"><h3>&#x1F511; API Keys</h3><button class="btn btn-primary btn-sm" onclick="openModal('key-modal')">+ Create Key</button></div>
    <table class="tbl" id="keys-table">
      <thead><tr><th>Prefix</th><th>Label</th><th>Scopes</th><th>Status</th><th>Last Used</th><th>Usage</th><th>Created</th><th></th></tr></thead>
      <tbody id="keys-body"><tr><td colspan="8" style="color:var(--text3);text-align:center;padding:1.5rem">Loading&#x2026;</td></tr></tbody>
    </table>
  </div>
</div>

<!-- ════════════ APPS ════════════ -->
<div class="page" id="p-apps">
  <div class="panel">
    <div class="panel-hdr"><h3>&#x1F4E6; Connected Apps / Domains</h3><button class="btn btn-primary btn-sm" onclick="openAppModal()">+ Register App</button></div>
    <table class="tbl">
      <thead><tr><th>Name</th><th>Domain</th><th>API Key</th><th>Status</th><th>Webhook</th><th>Created</th><th></th></tr></thead>
      <tbody id="apps-body"><tr><td colspan="7" style="color:var(--text3);text-align:center;padding:1.5rem">Loading&#x2026;</td></tr></tbody>
    </table>
  </div>
</div>

<!-- ════════════ MESSAGES ════════════ -->
<div class="page" id="p-messages">
  <div class="panel">
    <div class="panel-hdr"><h3>&#x1F4AC; Message History</h3></div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;align-items:end">
      <div class="field" style="margin:0;flex:1;min-width:8rem"><label>Phone filter</label><input type="text" id="msg-phone" placeholder="e.g. 60192..."/></div>
      <div class="field" style="margin:0"><label>Direction</label><select id="msg-dir"><option value="">All</option><option value="in">Incoming</option><option value="out">Outgoing</option></select></div>
      <button class="btn btn-primary btn-sm" onclick="loadMessages(0)">Search</button>
    </div>
    <div id="msg-list" style="max-height:28rem;overflow-y:auto"><div style="color:var(--text3);font-size:.82rem;padding:1rem;text-align:center">Click Search to load messages</div></div>
    <div class="pager" id="msg-pager"></div>
  </div>
  <div class="panel">
    <div class="panel-hdr"><h3>&#x1F4CA; Message Stats</h3></div>
    <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem">
      <label style="font-size:.82rem;color:var(--text2)">Period</label>
      <select id="stats-days" style="padding:.35rem .5rem;font-size:.82rem;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;color:var(--text)">
        <option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="loadStats()">Refresh</button>
    </div>
    <div class="cards" style="grid-template-columns:repeat(4,1fr);margin-bottom:.75rem">
      <div class="card"><div class="card-label">Sent</div><div class="card-val" style="color:var(--green)" id="st-sent">&#x2014;</div></div>
      <div class="card"><div class="card-label">Received</div><div class="card-val" style="color:var(--blue)" id="st-recv">&#x2014;</div></div>
      <div class="card"><div class="card-label">Total</div><div class="card-val" id="st-total">&#x2014;</div></div>
      <div class="card"><div class="card-label">Contacts</div><div class="card-val" id="st-contacts">&#x2014;</div></div>
    </div>
    <div id="stats-daily" style="font-size:.82rem;color:var(--text2)"></div>
  </div>
</div>

<!-- ════════════ EVENTS ════════════ -->
<div class="page" id="p-events">
  <div class="panel">
    <div class="panel-hdr"><h3>&#x1F4CB; Event Log</h3><button class="btn btn-ghost btn-sm" onclick="loadEvents()">Refresh</button></div>
    <div class="log-list" id="evt-list" style="max-height:40rem"><div style="color:var(--text3);font-size:.82rem;padding:1rem;text-align:center">Loading&#x2026;</div></div>
  </div>
</div>

<!-- ════════════ TOOLS ════════════ -->
<div class="page" id="p-tools">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
    <div class="panel">
      <div class="panel-hdr"><h3>&#x26A1; API Endpoints</h3></div>
      <table class="tbl">
        <thead><tr><th>Method</th><th>Endpoint</th><th>Auth</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/healthz</td><td style="font-size:.72rem;color:var(--green)">Public</td><td>Health check</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/status</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Connection state</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/qr-code</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Get QR code</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/pairing-code</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Pairing code</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/send-text</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Send text</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/send-image</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Send image</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/send-document</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Send document</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/logout</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Logout session</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/reset</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td>Force-reset</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <div class="panel-hdr"><h3>&#x1F4CB; cURL Examples</h3></div>
      <div class="snippet">curl https://wa.getouch.co/healthz<button class="cp" onclick="cpSnip(this)">Copy</button></div>
      <div class="snippet">curl -H "X-API-Key: YOUR_KEY" \\
  https://wa.getouch.co/api/status<button class="cp" onclick="cpSnip(this)">Copy</button></div>
      <div class="snippet">curl -X POST https://wa.getouch.co/api/send-text \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"to":"60123456789","text":"Hello!"}'<button class="cp" onclick="cpSnip(this)">Copy</button></div>
    </div>
  </div>
</div>

<!-- ════════════ INTEGRATIONS ════════════ -->
<div class="page" id="p-integrations">
  <div class="panel">
    <div class="panel-hdr"><h3>&#x1F517; Integrations</h3></div>
    <div style="color:var(--text3);padding:2rem;text-align:center">
      <div style="font-size:2rem;margin-bottom:.5rem">&#x1F517;</div>
      <p>Webhook and third-party integrations coming soon.</p>
      <p style="font-size:.8rem;margin-top:.5rem">Configure webhooks per-app in the Apps section.</p>
    </div>
  </div>
</div>

<!-- ════════════ SETTINGS ════════════ -->
<div class="page" id="p-settings">
  <div class="panel">
    <div class="panel-hdr"><h3>&#x2699; Settings</h3><button class="btn btn-primary btn-sm" onclick="saveSettings()">Save</button></div>
    <div class="field"><label>Admin Console Title</label><input type="text" id="set-title" value="Getouch WA"/></div>
    <div class="field"><label>Default Rate Limit (msg/min)</label><input type="number" id="set-ratelimit" value="60"/></div>
    <div class="field"><label>Log Retention Days</label><input type="number" id="set-retention" value="90"/></div>
    <div class="field"><label>Webhook Timeout (ms)</label><input type="number" id="set-wh-timeout" value="5000"/></div>
    <div id="set-result"></div>
  </div>
</div>

</div><!-- content -->
</div><!-- main -->
</div><!-- layout -->

<!-- ─── Create API Key Modal ─── -->
<div class="modal-overlay" id="key-modal">
  <div class="modal">
    <h3>Create API Key</h3>
    <div class="field"><label>Label</label><input type="text" id="key-label" placeholder="e.g. Serapod Staging"/></div>
    <div class="field"><label>Scopes</label>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.25rem">
        <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer"><input type="checkbox" id="scope-send" checked/> send</label>
        <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer"><input type="checkbox" id="scope-read" checked/> read</label>
        <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer"><input type="checkbox" id="scope-admin"/> admin</label>
      </div>
    </div>
    <div id="key-created" style="display:none;margin-top:.75rem;padding:.75rem;background:var(--green-dim);border:1px solid var(--green-border);border-radius:.5rem">
      <div style="font-size:.78rem;color:var(--green);font-weight:700;margin-bottom:.35rem">Key Created! Copy it now &#x2014; it won't be shown again.</div>
      <div style="font-family:var(--mono);font-size:.85rem;word-break:break-all;color:var(--text);user-select:all" id="key-raw"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('key-modal')">Cancel</button>
      <button class="btn btn-primary" id="key-create-btn" onclick="createKey()">Create</button>
    </div>
  </div>
</div>

<!-- ─── Register App Modal ─── -->
<div class="modal-overlay" id="app-modal">
  <div class="modal">
    <h3 id="app-modal-title">Register App</h3>
    <input type="hidden" id="app-edit-id"/>
    <div class="field"><label>App Name</label><input type="text" id="app-name" placeholder="e.g. Serapod2U"/></div>
    <div class="field"><label>Domain</label><input type="text" id="app-domain" placeholder="e.g. stg.serapod2u.com"/></div>
    <div class="field"><label>Description</label><textarea id="app-desc" rows="2" placeholder="Optional description"></textarea></div>
    <div class="field"><label>Webhook URL</label><input type="text" id="app-webhook" placeholder="https://..."/></div>
    <div class="field"><label>API Key</label><select id="app-key"><option value="">None</option></select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('app-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveApp()">Save</button>
    </div>
  </div>
</div>

<div class="toast-area" id="toast-area"></div>

<script>
// ── Globals ──────────────────────────────────────────
const ADMIN_KEY = localStorage.getItem('wa_admin_key') || '';
let currentPage = 'overview';

function $(id){ return document.getElementById(id) }
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML }
function cpSnip(btn){ const t=btn.parentElement.textContent.replace('Copy','').trim(); navigator.clipboard.writeText(t).then(()=>{btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy',1200)})}

// ── Auth key ─────────────────────────────────────────
function getAdminKey() {
  let k = localStorage.getItem('wa_admin_key');
  if (!k) {
    k = prompt('Enter your Admin API Key (WA_ADMIN_KEY):');
    if (k) localStorage.setItem('wa_admin_key', k);
  }
  return k || '';
}
function hdr() { return { 'X-API-Key': getAdminKey() } }
function hdrJson() { return { 'X-API-Key': getAdminKey(), 'Content-Type': 'application/json' } }

// ── Toast ────────────────────────────────────────────
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  $('toast-area').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Modal ────────────────────────────────────────────
function openModal(id) { $(id).classList.add('open') }
function closeModal(id) { $(id).classList.remove('open'); }

// ── Navigation ───────────────────────────────────────
function go(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = $('p-' + page);
  if (target) target.classList.add('active');
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => { if (n.textContent.toLowerCase().includes(pageLabel(page))) n.classList.add('active') });
  $('page-title').textContent = pageTitles[page] || page;
  // Close mobile sidebar
  $('sidebar').classList.remove('open');
  // Load data for page
  if (page === 'overview') loadOverview();
  if (page === 'apikeys') loadKeys();
  if (page === 'apps') loadApps();
  if (page === 'events') loadEvents();
  if (page === 'settings') loadSettings();
}
const pageTitles = { overview:'Overview', sessions:'Sessions', apikeys:'API Keys', apps:'Apps / Domains', messages:'Messages', events:'Events', tools:'Tools', integrations:'Integrations', settings:'Settings' };
function pageLabel(p) { return { overview:'overview', sessions:'sessions', apikeys:'api keys', apps:'apps', messages:'messages', events:'events', tools:'tools', integrations:'integrations', settings:'settings' }[p] || p }

// ── Session tabs ─────────────────────────────────────
function sesTab(tab) {
  document.querySelectorAll('#p-sessions .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#p-sessions .tab-pane').forEach(p => p.classList.remove('active'));
  $('ses-tab-' + tab).classList.add('active');
  document.querySelectorAll('#p-sessions .tab-btn').forEach(b => { if(b.textContent.toLowerCase().includes(tab)) b.classList.add('active') });
}

// ── Status polling ───────────────────────────────────
async function pollStatus() {
  try {
    const r = await fetch('/healthz');
    const d = await r.json();
    const st = d.whatsapp || 'unknown';
    // Top bar
    const pill = $('top-status');
    pill.textContent = st;
    pill.className = 'status-pill ' + (st==='open'?'pill-open':st==='connecting'?'pill-connecting':'pill-closed');
    $('top-phone').textContent = d.phone ? '+'+d.phone : '';
    // Overview
    $('ov-status').textContent = st==='open'?'Connected':st==='connecting'?'Connecting':'Disconnected';
    $('ov-status').style.color = st==='open'?'var(--green)':st==='connecting'?'var(--yellow)':'var(--red)';
    $('ov-phone').textContent = d.phone ? '+'+d.phone : 'No number paired';
    const secs = Math.floor(d.uptime||0);
    const dd=Math.floor(secs/86400),hh=Math.floor((secs%86400)/3600),mm=Math.floor((secs%3600)/60),ss=secs%60;
    $('ov-uptime').textContent = dd>0?dd+'d '+hh+'h':hh+'h '+mm+'m '+ss+'s';
    $('ov-since').textContent = 'Since ' + new Date(Date.now()-secs*1000).toLocaleString();
    // Sessions page
    $('ses-state').textContent = st==='open'?'Connected':st==='connecting'?'Connecting':'Disconnected';
    $('ses-state').style.color = st==='open'?'var(--green)':st==='connecting'?'var(--yellow)':'var(--red)';
    $('ses-phone').textContent = d.phone ? '+'+d.phone : 'Not paired';
    if (d.lastEvent) {
      $('ov-events').innerHTML = $('ov-events').innerHTML; // keep existing
    }
  } catch(e) {}
}
pollStatus();
setInterval(pollStatus, 4000);

// ── QR polling ───────────────────────────────────────
let qrTimer = null;
function startQrPoll() { clearInterval(qrTimer); fetchQR(); qrTimer = setInterval(fetchQR, 3000) }
async function fetchQR() {
  const key = getAdminKey();
  if (!key) return;
  try {
    const r = await fetch('/api/qr-code', { headers: {'X-API-Key': key} });
    const d = await r.json();
    if (r.ok && d.available && d.qr) {
      $('qr-box').innerHTML = '<img src="'+d.qr+'" alt="QR" width="280" height="280"/><div style="font-size:.75rem;color:var(--text3)">Scan now &#x2014; refreshes automatically</div>';
    } else if (d.error && d.error.includes('Already connected')) {
      $('qr-box').innerHTML = '<div class="qr-placeholder" style="border-color:var(--green-border);color:var(--green)"><span>&#x2705; Connected!<br/>Logout first to re-pair.</span></div>';
      clearInterval(qrTimer);
    } else {
      $('qr-box').innerHTML = '<div class="qr-placeholder"><span class="spin" style="width:1.2rem;height:1.2rem;display:inline-block;margin-bottom:.5rem"></span><br/>Waiting for QR&#x2026;</div>';
    }
  } catch(e) {}
}
function refreshQR() { fetchQR(); toast('QR refreshed', 'info') }
startQrPoll();

// ── Session actions ──────────────────────────────────
async function doPair() {
  const phone = $('pair-phone').value.trim().replace(/[^0-9]/g,'');
  if (!phone) { toast('Enter phone number','err'); return }
  try {
    const r = await fetch('/api/pairing-code?phone='+phone, { headers: hdr() });
    const d = await r.json();
    if (r.ok) {
      $('pair-result').innerHTML = '<div style="padding:.65rem;background:var(--green-dim);border:1px solid var(--green-border);border-radius:.5rem;color:var(--green);font-size:.85rem"><strong>Pairing Code: '+esc(d.pairingCode)+'</strong><br/>Phone: +'+esc(d.phone)+'<br/>'+esc(d.instructions)+'</div>';
    } else {
      toast(d.error || 'Failed','err');
    }
  } catch(e) { toast(e.message,'err') }
}
async function doLogout() {
  if (!confirm('Logout WhatsApp session?')) return;
  try {
    const r = await fetch('/api/logout', { method:'POST', headers: hdr() });
    const d = await r.json();
    toast(r.ok ? d.message : (d.error||'Failed'), r.ok?'ok':'err');
    setTimeout(()=> { pollStatus(); startQrPoll() }, 1500);
  } catch(e) { toast(e.message,'err') }
}
async function doReset() {
  if (!confirm('Force-reset session? Clears auth and reconnects.')) return;
  try {
    const r = await fetch('/api/reset', { method:'POST', headers: hdr() });
    const d = await r.json();
    toast(r.ok ? d.message : (d.error||'Failed'), r.ok?'ok':'err');
    setTimeout(()=> { pollStatus(); startQrPoll() }, 2000);
  } catch(e) { toast(e.message,'err') }
}
async function doSend() {
  const to = $('send-to').value.trim().replace(/[^0-9]/g,'');
  const text = $('send-text').value.trim();
  if (!to || !text) { toast('Enter recipient and message','err'); return }
  $('send-btn').disabled = true;
  try {
    const r = await fetch('/api/send-text', { method:'POST', headers: hdrJson(), body: JSON.stringify({to,text}) });
    const d = await r.json();
    if (r.ok) {
      $('send-result').innerHTML = '<div style="padding:.5rem;background:var(--green-dim);border:1px solid var(--green-border);border-radius:.5rem;color:var(--green);font-size:.82rem">Sent! ID: '+esc(d.messageId)+'</div>';
      toast('Message sent','ok');
    } else { toast(d.error||'Send failed','err') }
  } catch(e) { toast(e.message,'err') }
  $('send-btn').disabled = false;
}

// ── Overview ─────────────────────────────────────────
async function loadOverview() {
  try {
    const r = await fetch('/admin/overview', { headers: hdr() });
    if (!r.ok) return;
    const d = await r.json();
    if (d.messages) {
      $('ov-msgs24').textContent = d.messages.last_24h || 0;
      $('ov-msgstotal').textContent = 'Total: ' + (d.messages.total || 0);
      $('ov-sent').textContent = d.messages.sent || 0;
      $('ov-recv').textContent = d.messages.received || 0;
    }
    if (d.apiKeys) $('ov-keys').textContent = d.apiKeys.active || 0;
    if (d.apps) $('ov-apps').textContent = (d.apps.active||0) + ' apps';
  } catch(e) {}
  // Events
  try {
    const r = await fetch('/api/events', { headers: hdr() });
    if (!r.ok) return;
    const evts = await r.json();
    if (evts.length) {
      $('ov-events').innerHTML = evts.slice(0,8).map(e => {
        const ts = new Date(e.ts).toLocaleTimeString();
        return '<div class="log-item"><span class="log-ts">'+ts+'</span><span class="log-type t-'+esc(e.type)+'">'+esc(e.type)+'</span><span class="log-detail">'+esc(e.detail||'')+'</span></div>';
      }).join('');
    }
  } catch(e) {}
}
loadOverview();

// ── API Keys ─────────────────────────────────────────
async function loadKeys() {
  try {
    const r = await fetch('/admin/api-keys', { headers: hdr() });
    if (!r.ok) { $('keys-body').innerHTML = '<tr><td colspan="8" style="color:var(--red);text-align:center;padding:1rem">'+r.status+' error</td></tr>'; return }
    const keys = await r.json();
    if (!keys.length) { $('keys-body').innerHTML = '<tr><td colspan="8" style="color:var(--text3);text-align:center;padding:1.5rem">No API keys yet. Click + Create Key.</td></tr>'; return }
    $('keys-body').innerHTML = keys.map(k => {
      const st = k.status === 'active';
      return '<tr><td style="font-family:var(--mono);font-size:.78rem">'+esc(k.key_prefix)+'...</td><td>'+esc(k.label)+'</td><td style="font-size:.78rem">'+esc(JSON.parse(k.scopes||'[]').join(', '))+'</td><td><span class="status-dot '+(st?'dot-active':'dot-revoked')+'"></span>'+esc(k.status)+'</td><td style="font-size:.78rem;color:var(--text3)">'+(k.last_used_at?new Date(k.last_used_at).toLocaleString():'Never')+'</td><td>'+k.usage_count+'</td><td style="font-size:.78rem;color:var(--text3)">'+new Date(k.created_at).toLocaleDateString()+'</td><td>'+(st?'<button class="btn-icon" title="Revoke" onclick="revokeKey('+k.id+')">&#x1F6AB;</button>':'')+'</td></tr>';
    }).join('');
  } catch(e) { toast(e.message,'err') }
}

async function createKey() {
  const label = $('key-label').value.trim() || 'Unnamed Key';
  const scopes = [];
  if ($('scope-send').checked) scopes.push('send');
  if ($('scope-read').checked) scopes.push('read');
  if ($('scope-admin').checked) scopes.push('admin');
  $('key-create-btn').disabled = true;
  try {
    const r = await fetch('/admin/api-keys', { method:'POST', headers: hdrJson(), body: JSON.stringify({label, scopes}) });
    const d = await r.json();
    if (r.ok) {
      $('key-raw').textContent = d.raw_key;
      $('key-created').style.display = 'block';
      toast('API key created','ok');
      loadKeys();
    } else { toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
  $('key-create-btn').disabled = false;
}

async function revokeKey(id) {
  if (!confirm('Revoke this API key? Apps using it will lose access.')) return;
  try {
    const r = await fetch('/admin/api-keys/'+id, { method:'DELETE', headers: hdr() });
    if (r.ok) { toast('Key revoked','ok'); loadKeys() }
    else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

// ── Apps ─────────────────────────────────────────────
async function loadApps() {
  try {
    const r = await fetch('/admin/apps', { headers: hdr() });
    if (!r.ok) return;
    const apps = await r.json();
    if (!apps.length) { $('apps-body').innerHTML = '<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:1.5rem">No apps registered yet.</td></tr>'; return }
    $('apps-body').innerHTML = apps.map(a => {
      const st = a.status === 'active';
      return '<tr><td><strong>'+esc(a.name)+'</strong></td><td style="font-family:var(--mono);font-size:.78rem">'+esc(a.domain||'&#x2014;')+'</td><td style="font-size:.78rem">'+(a.key_prefix?esc(a.key_prefix)+'...':'&#x2014;')+'</td><td><span class="status-dot '+(st?'dot-active':'dot-inactive')+'"></span>'+esc(a.status)+'</td><td style="font-size:.78rem;color:var(--text3)">'+esc(a.webhook_url||'&#x2014;')+'</td><td style="font-size:.78rem;color:var(--text3)">'+new Date(a.created_at).toLocaleDateString()+'</td><td><button class="btn-icon" title="Edit" onclick="editApp('+a.id+')">&#x270F;</button></td></tr>';
    }).join('');
  } catch(e) { toast(e.message,'err') }
}

async function openAppModal(editId) {
  // Reset form
  $('app-edit-id').value = '';
  $('app-name').value = '';
  $('app-domain').value = '';
  $('app-desc').value = '';
  $('app-webhook').value = '';
  $('app-modal-title').textContent = 'Register App';
  // Load keys for dropdown
  try {
    const kr = await fetch('/admin/api-keys', { headers: hdr() });
    if (kr.ok) {
      const keys = await kr.json();
      $('app-key').innerHTML = '<option value="">None</option>' + keys.filter(k=>k.status==='active').map(k => '<option value="'+k.id+'">'+esc(k.label)+' ('+esc(k.key_prefix)+'...)</option>').join('');
    }
  } catch(e) {}
  openModal('app-modal');
}

async function editApp(id) {
  await openAppModal();
  try {
    const r = await fetch('/admin/apps/'+id, { headers: hdr() });
    if (r.ok) {
      const a = await r.json();
      $('app-edit-id').value = a.id;
      $('app-name').value = a.name || '';
      $('app-domain').value = a.domain || '';
      $('app-desc').value = a.description || '';
      $('app-webhook').value = a.webhook_url || '';
      $('app-key').value = a.api_key_id || '';
      $('app-modal-title').textContent = 'Edit App';
    }
  } catch(e) {}
}

async function saveApp() {
  const id = $('app-edit-id').value;
  const body = {
    name: $('app-name').value.trim(),
    domain: $('app-domain').value.trim(),
    description: $('app-desc').value.trim(),
    webhook_url: $('app-webhook').value.trim(),
    api_key_id: $('app-key').value ? parseInt($('app-key').value) : null,
  };
  if (!body.name) { toast('App name required','err'); return }
  try {
    const url = id ? '/admin/apps/'+id : '/admin/apps';
    const method = id ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: hdrJson(), body: JSON.stringify(body) });
    if (r.ok) {
      toast(id?'App updated':'App registered','ok');
      closeModal('app-modal');
      loadApps();
    } else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

// ── Messages ─────────────────────────────────────────
let msgOffset = 0;
const MSG_LIMIT = 40;
async function loadMessages(offset) {
  msgOffset = offset || 0;
  const phone = $('msg-phone').value.trim();
  const dir = $('msg-dir').value;
  const qs = new URLSearchParams({limit:MSG_LIMIT, offset:msgOffset});
  if (phone) qs.set('phone', phone);
  if (dir) qs.set('direction', dir);
  try {
    const r = await fetch('/admin/messages?'+qs, { headers: hdr() });
    if (!r.ok) { $('msg-list').innerHTML = '<div style="color:var(--red);padding:1rem;text-align:center">'+r.status+' error</div>'; return }
    const d = await r.json();
    if (!d.rows || !d.rows.length) { $('msg-list').innerHTML = '<div style="color:var(--text3);padding:1rem;text-align:center">No messages found</div>'; $('msg-pager').innerHTML=''; return }
    $('msg-list').innerHTML = '<table class="tbl"><thead><tr><th>Time</th><th>Dir</th><th>Phone</th><th>Type</th><th>Content</th></tr></thead><tbody>' +
      d.rows.map(m => {
        const t = new Date(m.created_at).toLocaleString();
        const dc = m.direction==='out'?'var(--green)':'var(--blue)';
        return '<tr><td style="white-space:nowrap;color:var(--text3)">'+t+'</td><td style="font-weight:700;color:'+dc+'">'+m.direction.toUpperCase()+'</td><td style="font-family:var(--mono)">'+esc(m.phone||'')+'</td><td>'+esc(m.message_type)+'</td><td style="color:var(--text2);word-break:break-all">'+esc((m.content||'').slice(0,120))+'</td></tr>';
      }).join('') + '</tbody></table>';
    const pages = Math.ceil(d.total/MSG_LIMIT);
    const cur = Math.floor(msgOffset/MSG_LIMIT);
    let ph = '';
    if (cur>0) ph += '<button class="btn btn-ghost btn-sm" onclick="loadMessages('+(msgOffset-MSG_LIMIT)+')">&#x2190; Prev</button>';
    ph += '<span>Page '+(cur+1)+' of '+pages+' ('+d.total+' messages)</span>';
    if (cur<pages-1) ph += '<button class="btn btn-ghost btn-sm" onclick="loadMessages('+(msgOffset+MSG_LIMIT)+')">Next &#x2192;</button>';
    $('msg-pager').innerHTML = ph;
  } catch(e) { $('msg-list').innerHTML = '<div style="color:var(--red);padding:1rem;text-align:center">'+e.message+'</div>' }
}

// ── Stats ────────────────────────────────────────────
async function loadStats() {
  const days = $('stats-days').value;
  try {
    const r = await fetch('/admin/stats?days='+days, { headers: hdr() });
    if (!r.ok) return;
    const d = await r.json();
    if (d.summary) {
      $('st-sent').textContent = d.summary.sent || 0;
      $('st-recv').textContent = d.summary.received || 0;
      $('st-total').textContent = d.summary.total || 0;
      $('st-contacts').textContent = d.summary.unique_contacts || 0;
    }
    if (d.daily && d.daily.length) {
      $('stats-daily').innerHTML = '<table class="tbl"><thead><tr><th>Date</th><th style="text-align:right">Sent</th><th style="text-align:right">Received</th></tr></thead><tbody>' +
        d.daily.map(r => '<tr><td>'+r.day+'</td><td style="text-align:right;color:var(--green)">'+r.sent+'</td><td style="text-align:right;color:var(--blue)">'+r.received+'</td></tr>').join('') + '</tbody></table>';
    } else { $('stats-daily').innerHTML = '<div style="color:var(--text3);padding:.5rem">No data</div>' }
  } catch(e) {}
}

// ── Events ───────────────────────────────────────────
async function loadEvents() {
  try {
    const r = await fetch('/admin/events?limit=200', { headers: hdr() });
    if (!r.ok) return;
    const evts = await r.json();
    if (!evts.length) { $('evt-list').innerHTML = '<div style="color:var(--text3);padding:1rem;text-align:center">No events yet</div>'; return }
    $('evt-list').innerHTML = evts.map(e => {
      const ts = new Date(e.ts).toLocaleString();
      return '<div class="log-item"><span class="log-ts">'+ts+'</span><span class="log-type t-'+esc(e.type)+'">'+esc(e.type)+'</span><span class="log-detail">'+esc(e.detail||'')+'</span></div>';
    }).join('');
  } catch(e) {}
}

// ── Settings ─────────────────────────────────────────
async function loadSettings() {
  try {
    const r = await fetch('/admin/settings', { headers: hdr() });
    if (!r.ok) return;
    const s = await r.json();
    if (s.console_title) $('set-title').value = s.console_title;
    if (s.rate_limit) $('set-ratelimit').value = s.rate_limit;
    if (s.log_retention_days) $('set-retention').value = s.log_retention_days;
    if (s.webhook_timeout) $('set-wh-timeout').value = s.webhook_timeout;
  } catch(e) {}
}
async function saveSettings() {
  const body = {
    console_title: $('set-title').value.trim(),
    rate_limit: parseInt($('set-ratelimit').value) || 60,
    log_retention_days: parseInt($('set-retention').value) || 90,
    webhook_timeout: parseInt($('set-wh-timeout').value) || 5000,
  };
  try {
    const r = await fetch('/admin/settings', { method: 'PUT', headers: hdrJson(), body: JSON.stringify(body) });
    if (r.ok) toast('Settings saved','ok');
    else toast('Failed to save','err');
  } catch(e) { toast(e.message,'err') }
}
</script>
</body>
</html>`;
}
