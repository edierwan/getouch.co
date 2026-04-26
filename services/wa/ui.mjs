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

/* ─── App card list ─── */
.app-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem;margin-bottom:.75rem;transition:border-color .2s}
.app-card:hover{border-color:var(--accent-border)}
.app-card-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}
.app-card-hdr h4{font-size:.95rem;font-weight:700;display:flex;align-items:center;gap:.5rem}
.app-card-meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:.5rem .75rem;font-size:.78rem;color:var(--text2)}
.app-card-meta dt{color:var(--text3);font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.app-card-meta dd{margin:0 0 .25rem 0}
.app-actions{display:flex;gap:.35rem;flex-wrap:wrap}
.key-actions{display:flex;gap:.2rem;justify-content:flex-end}
.empty-val{color:var(--text3);font-style:italic}

/* ─── Config snippet ─── */
.config-block{background:var(--bg);border:1px solid var(--border);border-radius:.5rem;padding:.75rem;font-family:var(--mono);font-size:.76rem;line-height:1.7;white-space:pre-wrap;word-break:break-all;color:var(--text2);margin:.5rem 0;position:relative}
.config-block .cp{position:absolute;top:.5rem;right:.5rem}

/* ─── Auth overlay ─── */
.auth-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(6,8,18,.92);backdrop-filter:blur(8px)}
.auth-card{background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:2.5rem 2rem;width:22rem;max-width:90vw;text-align:center}
.auth-card h2{font-size:1.25rem;margin-bottom:.25rem}
.auth-card small{color:var(--text3);font-size:.78rem}
.auth-input{width:100%;margin-top:1.25rem;padding:.65rem .85rem;font-size:.85rem;font-family:var(--mono);border-radius:.5rem;border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none}
.auth-input:focus{border-color:var(--accent)}
.auth-btn{width:100%;margin-top:.75rem;padding:.65rem;font-size:.9rem;font-weight:700;border-radius:.5rem;border:none;background:var(--accent);color:#fff;cursor:pointer}
.auth-btn:hover{opacity:.9}
.auth-err{color:var(--red);font-size:.78rem;margin-top:.5rem;min-height:1.1rem}
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
  <div class="sidebar-foot">
    <span>Getouch WA v2.0${isDbReady() ? ' &middot; <span style="color:var(--green)">DB</span>' : ''}</span>
    <button class="btn-icon" title="Logout" onclick="logout()" style="float:right;font-size:.85rem">&#x1F6AA;</button>
  </div>
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
    <div class="card"><div class="card-label">Sessions</div><div class="card-val" id="ov-sessions-total">&#x2014;</div><div class="card-sub" id="ov-sessions-breakdown" style="font-size:.78rem"></div></div>
    <div class="card"><div class="card-label">Webhook</div><div class="card-val" id="ov-webhook-state" style="font-size:1rem">&#x2014;</div><div class="card-sub" id="ov-webhook-sub" style="font-size:.78rem"></div></div>
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
  <!-- Multi-tenant sessions table (Request 05 multi-session refactor, 2026-04-26) -->
  <div class="panel" style="margin-bottom:1rem">
    <div class="panel-hdr">
      <h3>&#x1F310; Multi-tenant Sessions</h3>
      <div style="display:flex;gap:.5rem;align-items:center">
        <input type="text" id="new-session-id" placeholder="sessionId (e.g. tenant-xyz)" style="padding:.4rem .6rem;background:var(--bg);border:1px solid var(--border);border-radius:.4rem;color:var(--text);font-size:.8rem"/>
        <button class="btn btn-primary btn-sm" onclick="createSession()">+ Start session</button>
        <button class="btn btn-ghost btn-sm" onclick="loadSessions()">Refresh</button>
      </div>
    </div>
    <div id="ms-summary" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;font-size:.75rem;color:var(--text2)"></div>
    <table class="tbl" id="ms-table">
      <thead><tr>
        <th>Session ID</th><th>Status</th><th>Phone</th><th>Last seen</th><th>Msgs 24h</th><th>QR</th><th>Last error</th><th style="text-align:right">Actions</th>
      </tr></thead>
      <tbody id="ms-body"><tr><td colspan="8" style="text-align:center;color:var(--text3);padding:1rem">Loading sessions&#x2026;</td></tr></tbody>
    </table>
    <div style="font-size:.7rem;color:var(--text3);margin-top:.5rem">
      Default session is auto-managed and used by legacy <code>/api/*</code> endpoints. New WAPI session contract: <code>/api/sessions/:id</code> with <code>X-WAPI-Secret</code>.
    </div>
  </div>
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
    <div class="panel-hdr"><h3>&#x1F511; API Keys</h3><button class="btn btn-primary btn-sm" onclick="openKeyModal()">+ Create Key</button></div>
    <div id="keys-empty" style="display:none;color:var(--text3);text-align:center;padding:2rem">
      <div style="font-size:2rem;margin-bottom:.5rem">&#x1F511;</div>
      <p style="font-weight:600">No API keys yet</p>
      <p style="font-size:.8rem;margin-top:.25rem">Create an API key to let your apps send WhatsApp messages through this gateway.</p>
      <button class="btn btn-primary btn-sm" style="margin-top:.75rem" onclick="openKeyModal()">+ Create First Key</button>
    </div>
    <table class="tbl" id="keys-table" style="display:none">
      <thead><tr><th>Label</th><th>Prefix</th><th>Scopes</th><th>Assigned App</th><th>Status</th><th>Last Used</th><th>Usage</th><th>Created</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody id="keys-body"></tbody>
    </table>
  </div>
</div>

<!-- ════════════ APPS ════════════ -->
<div class="page" id="p-apps">
  <div class="panel">
    <div class="panel-hdr"><h3>&#x1F4E6; Connected Apps / Domains</h3><button class="btn btn-primary btn-sm" onclick="openAppModal()">+ Register App</button></div>
    <div id="apps-empty" style="display:none;color:var(--text3);text-align:center;padding:2rem">
      <div style="font-size:2rem;margin-bottom:.5rem">&#x1F4E6;</div>
      <p style="font-weight:600">No apps registered yet</p>
      <p style="font-size:.8rem;margin-top:.25rem">Register your client app or domain so you can assign API keys and configure webhooks.</p>
      <button class="btn btn-primary btn-sm" style="margin-top:.75rem" onclick="openAppModal()">+ Register First App</button>
    </div>
    <div id="apps-list"></div>
  </div>
</div>

<!-- ════════════ MESSAGES ════════════ -->
<div class="page" id="p-messages">
  <!-- Stats cards row -->
  <div class="cards" id="msg-stat-cards">
    <div class="card"><div class="card-label">Sent</div><div class="card-val" style="color:var(--green)" id="st-sent">&#x2014;</div><div class="card-sub" id="st-sent-sub"></div></div>
    <div class="card"><div class="card-label">Received</div><div class="card-val" style="color:var(--blue)" id="st-recv">&#x2014;</div><div class="card-sub" id="st-recv-sub"></div></div>
    <div class="card"><div class="card-label">Total Messages</div><div class="card-val" id="st-total">&#x2014;</div><div class="card-sub" id="st-total-sub"></div></div>
    <div class="card"><div class="card-label">Unique Contacts</div><div class="card-val" id="st-contacts">&#x2014;</div><div class="card-sub" id="st-contacts-sub"></div></div>
  </div>
  <!-- Filters bar -->
  <div class="panel" style="padding:.75rem 1rem">
    <div style="display:flex;gap:.65rem;flex-wrap:wrap;align-items:end">
      <div class="field" style="margin:0;min-width:7rem"><label>Period</label>
        <select id="stats-days" style="padding:.4rem .5rem;font-size:.82rem;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;color:var(--text)">
          <option value="1">Today</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="90">90 days</option>
        </select>
      </div>
      <div class="field" style="margin:0;min-width:8rem"><label>App / Domain</label>
        <select id="msg-app" style="padding:.4rem .5rem;font-size:.82rem;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;color:var(--text)">
          <option value="">All Apps</option>
        </select>
      </div>
      <div class="field" style="margin:0;min-width:6rem"><label>Direction</label>
        <select id="msg-dir" style="padding:.4rem .5rem;font-size:.82rem;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;color:var(--text)">
          <option value="">All</option><option value="out">Sent</option><option value="in">Received</option>
        </select>
      </div>
      <div class="field" style="margin:0;flex:1;min-width:8rem"><label>Phone</label><input type="text" id="msg-phone" placeholder="e.g. 60192..." style="padding:.4rem .5rem"/></div>
      <button class="btn btn-primary btn-sm" onclick="applyMessageFilters()" style="height:2.1rem">&#x1F50D; Search</button>
      <button class="btn btn-ghost btn-sm" onclick="resetMessageFilters()" style="height:2.1rem">Reset</button>
    </div>
  </div>
  <!-- Per-app breakdown -->
  <div class="panel" id="app-breakdown-panel" style="display:none;margin-top:.75rem">
    <div class="panel-hdr"><h3>&#x1F4CA; Traffic by App / Domain</h3></div>
    <div id="app-breakdown"></div>
  </div>
  <!-- Daily chart -->
  <div class="panel" style="margin-top:.75rem">
    <div class="panel-hdr"><h3>&#x1F4C8; Daily Volume</h3></div>
    <div id="daily-chart" style="overflow-x:auto"></div>
  </div>
  <!-- Message history table -->
  <div class="panel" style="margin-top:.75rem">
    <div class="panel-hdr"><h3>&#x1F4AC; Message History</h3><span id="msg-count-label" style="font-size:.78rem;color:var(--text3)"></span></div>
    <div id="msg-list" style="max-height:32rem;overflow-y:auto"><div style="color:var(--text3);font-size:.82rem;padding:1rem;text-align:center">Click Search to load messages</div></div>
    <div class="pager" id="msg-pager"></div>
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
      <h4 style="margin:.4rem 0 .35rem;font-size:.78rem;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Multi-session (current contract)</h4>
      <table class="tbl">
        <thead><tr><th>Method</th><th>Endpoint</th><th>Auth</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/health</td><td style="font-size:.72rem;color:var(--green)">Public</td><td>Multi-session health snapshot</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/healthz</td><td style="font-size:.72rem;color:var(--green)">Public</td><td>Liveness probe</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/sessions/:id</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>Create / start session</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/sessions/:id/status</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>Session status</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/sessions/:id/qr</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>Per-session QR</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/sessions/:id/reset</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>Reset that session only</td></tr>
          <tr><td><span style="color:var(--red);font-weight:700;font-size:.72rem">DELETE</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/sessions/:id</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>Stop and remove session</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/sessions/:id/messages</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>Send via that session</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/sessions</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>List all sessions</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/webhook-stats</td><td style="font-size:.72rem;color:var(--yellow)">X-WAPI-Secret</td><td>Outbound webhook stats</td></tr>
        </tbody>
      </table>
      <h4 style="margin:.85rem 0 .35rem;font-size:.78rem;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Legacy (deprecated &mdash; pinned to default session)</h4>
      <table class="tbl">
        <thead><tr><th>Method</th><th>Endpoint</th><th>Auth</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/status</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span> &mdash; default-session state</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/qr-code</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span> &mdash; default-session QR</td></tr>
          <tr><td><span style="color:var(--green);font-weight:700;font-size:.72rem">GET</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/pairing-code</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span> &mdash; pairing</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/send-text</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span> &mdash; send via default</td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/send-image</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span></td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/send-document</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span></td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/logout</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span></td></tr>
          <tr><td><span style="color:var(--blue);font-weight:700;font-size:.72rem">POST</span></td><td style="font-family:var(--mono);font-size:.78rem">/api/reset</td><td style="font-size:.72rem;color:var(--yellow)">API Key</td><td><span style="color:var(--text3)">deprecated</span></td></tr>
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
    <h3 id="key-modal-title">Create API Key</h3>
    <div id="key-form">
      <div class="field"><label>Label</label><input type="text" id="key-label" placeholder="e.g. Serapod Staging"/><div class="hint">A friendly name to identify this key</div></div>
      <div class="field"><label>Scopes</label>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.25rem">
          <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer"><input type="checkbox" id="scope-send" checked/> send</label>
          <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer"><input type="checkbox" id="scope-read" checked/> read</label>
          <label style="font-size:.82rem;display:flex;align-items:center;gap:.3rem;cursor:pointer"><input type="checkbox" id="scope-admin"/> admin</label>
        </div>
        <div class="hint">send = can send messages &bull; read = can read status/messages &bull; admin = full console access</div>
      </div>
      <div class="field"><label>Assign to App (optional)</label><select id="key-app"><option value="">None &mdash; assign later</option></select><div class="hint">You can assign this key to an app later from either page</div></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeKeyModal()">Cancel</button>
        <button class="btn btn-primary" id="key-create-btn" onclick="createKey()">Create Key</button>
      </div>
    </div>
    <div id="key-created" style="display:none">
      <div style="padding:.75rem;background:var(--yellow-dim);border:1px solid var(--yellow-border);border-radius:.5rem;margin-bottom:.75rem">
        <div style="font-size:.82rem;color:var(--yellow);font-weight:700">&#x26A0; This secret will only be shown once</div>
        <div style="font-size:.75rem;color:var(--text2);margin-top:.2rem">Copy it now and store it securely. You will not be able to see it again.</div>
      </div>
      <div class="field"><label>Full API Secret</label>
        <div style="position:relative">
          <div style="font-family:var(--mono);font-size:.85rem;word-break:break-all;color:var(--text);background:var(--bg);border:1px solid var(--green-border);border-radius:.5rem;padding:.65rem .8rem;padding-right:4.5rem;user-select:all" id="key-raw"></div>
          <button class="btn btn-primary btn-sm" style="position:absolute;top:.45rem;right:.45rem" onclick="copySecret()">Copy</button>
        </div>
      </div>
      <div class="field"><label>Key Prefix</label><div style="font-family:var(--mono);font-size:.82rem;color:var(--text2)" id="key-created-prefix"></div></div>
      <div class="field"><label>Label</label><div style="font-size:.82rem;color:var(--text2)" id="key-created-label"></div></div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="closeKeyModal()">Done &mdash; I've copied the key</button>
      </div>
    </div>
  </div>
</div>

<!-- ─── Register / Edit App Modal ─── -->
<div class="modal-overlay" id="app-modal">
  <div class="modal">
    <h3 id="app-modal-title">Register App</h3>
    <input type="hidden" id="app-edit-id"/>
    <div class="field"><label>App Name</label><input type="text" id="app-name" placeholder="e.g. Serapod2U Staging"/><div class="hint">A recognizable name for this client application</div></div>
    <div class="field"><label>Domain</label><input type="text" id="app-domain" placeholder="e.g. stg.serapod2u.com" oninput="onDomainChange()"/><div class="hint">The domain where this app runs. Protocol (https://) and trailing slashes are removed automatically.</div></div>
    <div class="field"><label>Description</label><textarea id="app-desc" rows="2" placeholder="Optional &mdash; describe what this app does"></textarea></div>
    <div class="field"><label>Webhook URL <span style="color:var(--text3);font-weight:400">(optional)</span></label>
      <div style="display:flex;gap:.35rem;align-items:center"><input type="text" id="app-webhook" placeholder="https://your-domain.com/api/whatsapp/webhook" oninput="_webhookManual=true" style="flex:1"/><button class="btn btn-ghost btn-sm" type="button" onclick="resetWebhook()" title="Reset to default">&#x21BA; Reset</button></div>
      <div class="hint" id="app-webhook-hint">Auto-generated from domain. You can override it if needed.</div>
    </div>
    <div class="field"><label>Assign API Key <span style="color:var(--text3);font-weight:400">(optional)</span></label><select id="app-key"><option value="">None &mdash; assign later</option></select>
      <div class="hint">Choose an existing API key, or create the app first and assign a key later</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('app-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveApp()">Save</button>
    </div>
  </div>
</div>

<!-- ─── App Detail / Config Modal ─── -->
<div class="modal-overlay" id="app-detail-modal">
  <div class="modal" style="max-width:600px">
    <h3 id="app-detail-title">App Details</h3>
    <div id="app-detail-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('app-detail-modal')">Close</button>
    </div>
  </div>
</div>

<!-- ─── Client Config Modal ─── -->
<div class="modal-overlay" id="config-modal">
  <div class="modal" style="max-width:600px">
    <h3>&#x1F4CB; Client Configuration</h3>
    <div id="config-body"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('config-modal')">Close</button>
    </div>
  </div>
</div>

<!-- ─── Assign Key Modal ─── -->
<div class="modal-overlay" id="assign-modal">
  <div class="modal" style="max-width:400px">
    <h3 id="assign-title">Assign API Key</h3>
    <input type="hidden" id="assign-key-id"/>
    <input type="hidden" id="assign-context"/>
    <div class="field"><label>Select App / Domain</label><select id="assign-app-select"><option value="">Unassign (no app)</option></select></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal('assign-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="doAssign()">Assign</button>
    </div>
  </div>
</div>

<div class="toast-area" id="toast-area"></div>

<!-- Auth overlay -->
<div class="auth-overlay" id="auth-overlay" style="display:none">
  <div class="auth-card">
    <div style="font-size:2rem;margin-bottom:.5rem">&#x1F512;</div>
    <h2>Getouch WA</h2>
    <small>Admin Console</small>
    <input class="auth-input" id="auth-key-input" type="password" placeholder="Enter admin API key" autocomplete="off" />
    <button class="auth-btn" id="auth-btn" onclick="doAuth()">Sign In</button>
    <div class="auth-err" id="auth-err"></div>
  </div>
</div>

<script>
// ── Globals ──────────────────────────────────────────
const ADMIN_KEY = localStorage.getItem('wa_admin_key') || '';
let currentPage = 'overview';

function $(id){ return document.getElementById(id) }
function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML }
function cpSnip(btn){ const t=btn.parentElement.textContent.replace('Copy','').trim(); navigator.clipboard.writeText(t).then(()=>{btn.textContent='Copied!';setTimeout(()=>btn.textContent='Copy',1200)})}

// ── Auth key ─────────────────────────────────────────
function getAdminKey() {
  return localStorage.getItem('wa_admin_key') || '';
}
function hdr() { return { 'X-API-Key': getAdminKey() } }
function hdrJson() { return { 'X-API-Key': getAdminKey(), 'Content-Type': 'application/json' } }

function showAuth() {
  $('auth-overlay').style.display = 'flex';
  $('auth-key-input').value = '';
  $('auth-err').textContent = '';
  setTimeout(() => $('auth-key-input').focus(), 100);
}

async function doAuth() {
  const k = $('auth-key-input').value.trim();
  if (!k) { $('auth-err').textContent = 'Key cannot be empty'; return }
  $('auth-btn').disabled = true;
  $('auth-btn').textContent = 'Verifying...';
  try {
    const r = await fetch('/admin/overview', { headers: { 'X-API-Key': k } });
    if (r.ok) {
      localStorage.setItem('wa_admin_key', k);
      $('auth-overlay').style.display = 'none';
      initDashboard();
    } else {
      $('auth-err').textContent = 'Invalid key (HTTP ' + r.status + ')';
    }
  } catch(e) {
    $('auth-err').textContent = 'Connection error';
  } finally {
    $('auth-btn').disabled = false;
    $('auth-btn').textContent = 'Sign In';
  }
}

$('auth-key-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') doAuth() });

function logout() {
  localStorage.removeItem('wa_admin_key');
  showAuth();
}

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
  if (page === 'messages') { loadAppsDropdown(); loadStats(); loadMessages(0); }
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
    // The multi-session gateway reports 'connected' (new contract).
    // Older single-session gateways used 'open'. Normalize both so the UI
    // behaves consistently regardless of which gateway version is running.
    const raw = d.whatsapp || d.defaultStatus || 'unknown';
    const isConnected = raw === 'open' || raw === 'connected';
    const isConnecting = raw === 'connecting' || raw === 'pending';
    const label = isConnected ? 'Connected' : isConnecting ? 'Connecting' : (raw === 'unknown' ? 'Unknown' : 'Disconnected');
    const pillCls = isConnected ? 'pill-open' : isConnecting ? 'pill-connecting' : 'pill-closed';
    const color = isConnected ? 'var(--green)' : isConnecting ? 'var(--yellow)' : 'var(--red)';
    const phone = d.phone || d.defaultPhone || '';
    // Top bar
    const pill = $('top-status');
    pill.textContent = label.toLowerCase();
    pill.className = 'status-pill ' + pillCls;
    $('top-phone').textContent = phone ? '+'+phone : '';
    // Overview
    $('ov-status').textContent = label;
    $('ov-status').style.color = color;
    $('ov-phone').textContent = phone ? '+'+phone : 'No number paired';
    const secs = Math.floor(d.uptime||0);
    const dd=Math.floor(secs/86400),hh=Math.floor((secs%86400)/3600),mm=Math.floor((secs%3600)/60),ss=secs%60;
    $('ov-uptime').textContent = dd>0?dd+'d '+hh+'h':hh+'h '+mm+'m '+ss+'s';
    $('ov-since').textContent = 'Since ' + new Date(Date.now()-secs*1000).toLocaleString();
    // Sessions page
    $('ses-state').textContent = label;
    $('ses-state').style.color = color;
    $('ses-phone').textContent = phone ? '+'+phone : 'Not paired';
    // Multi-session aggregate cards (new contract)
    if (typeof d.sessions === 'number') {
      $('ov-sessions-total').textContent = d.sessions;
    }
    if (d.webhook) {
      const st = d.webhook.stats || {};
      $('ov-webhook-state').textContent = d.webhook.enabled ? 'enabled' : 'disabled';
      $('ov-webhook-state').style.color = d.webhook.enabled ? 'var(--green)' : 'var(--text3)';
      $('ov-webhook-sub').textContent = 'q='+(d.webhook.queueSize||0)+' ok='+(st.delivered||0)+' fail='+(st.failed||0);
    }
    if (d.lastEvent) {
      $('ov-events').innerHTML = $('ov-events').innerHTML; // keep existing
    }
  } catch(e) {}
}

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

// ── Multi-session admin (Request 05) ────────────────────────────
let msTimer = null;
async function loadSessions() {
  const key = getAdminKey();
  if (!key) return;
  try {
    const r = await fetch('/admin/sessions', { headers: { 'X-API-Key': key } });
    if (!r.ok) return;
    const d = await r.json();
    const list = d.sessions || [];
    const totals = list.reduce((a,s)=>{ a.total++; if(s.status==='connected')a.connected++; else if(s.qrAvailable||s.status==='connecting'||s.status==='pending')a.pending++; else a.disconnected++; return a; }, {total:0,connected:0,pending:0,disconnected:0});
    $('ms-summary').innerHTML =
      '<span class="status-pill pill-open">'+totals.connected+' connected</span>'+
      '<span class="status-pill pill-connecting">'+totals.pending+' pending</span>'+
      '<span class="status-pill pill-closed">'+totals.disconnected+' disconnected</span>'+
      '<span style="color:var(--text3)">total: '+totals.total+'</span>'+
      '<span style="color:var(--text3)">default: '+esc(d.defaultSessionId||'-')+'</span>'+
      '<span style="color:var(--text3)">webhook: '+(d.webhook&&d.webhook.enabled?'enabled':'disabled')+(d.webhook?(' (q='+d.webhook.queueSize+', ok='+d.webhook.stats.delivered+', fail='+d.webhook.stats.failed+')'):'')+'</span>';
    // Mirror onto Overview cards so multi-session is visible from the dashboard.
    const ovTotal = $('ov-sessions-total');
    if (ovTotal) ovTotal.textContent = totals.total;
    const ovBreak = $('ov-sessions-breakdown');
    if (ovBreak) ovBreak.textContent = totals.connected+' on / '+totals.pending+' pending / '+totals.disconnected+' off';
    if (!list.length) {
      $('ms-body').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:1rem">No sessions registered yet.</td></tr>';
      return;
    }
    $('ms-body').innerHTML = list.map(s => {
      const cls = s.status==='connected'?'pill-open':s.status==='connecting'||s.status==='pending'?'pill-connecting':'pill-closed';
      const m = s.messages24h||{inbound:0,outbound:0};
      return '<tr>'+
        '<td><strong>'+esc(s.sessionId)+'</strong></td>'+
        '<td><span class="status-pill '+cls+'">'+esc(s.status||'-')+'</span></td>'+
        '<td>'+(s.phoneNumber?('+'+esc(s.phoneNumber)):'<span style="color:var(--text3)">&#x2014;</span>')+'</td>'+
        '<td style="font-size:.75rem;color:var(--text3)">'+esc(s.lastSeenAt||'-')+'</td>'+
        '<td>'+m.inbound+' in / '+m.outbound+' out</td>'+
        '<td>'+(s.qrAvailable?'<button class="btn btn-ghost btn-sm" onclick="showSessionQr(\''+esc(s.sessionId)+'\')">View QR</button>':'<span style="color:var(--text3)">&#x2014;</span>')+'</td>'+
        '<td style="font-size:.75rem;color:var(--red)">'+esc(s.lastError||'')+'</td>'+
        '<td style="text-align:right">'+
          '<button class="btn btn-ghost btn-sm" onclick="resetSessionAdmin(\''+esc(s.sessionId)+'\')">Reset</button> '+
          '<button class="btn btn-danger btn-sm" onclick="deleteSessionAdmin(\''+esc(s.sessionId)+'\')">Delete</button>'+
        '</td>'+
      '</tr>';
    }).join('');
  } catch(e) {}
}
async function createSession() {
  const id = ($('new-session-id').value||'').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) { toast('Invalid sessionId (alnum, _-, 1-128)','err'); return; }
  const key = getAdminKey();
  try {
    const r = await fetch('/admin/sessions', { method:'POST', headers: { 'X-API-Key': key, 'Content-Type':'application/json' }, body: JSON.stringify({ sessionId: id }) });
    const d = await r.json();
    toast(r.ok ? ('Started '+id) : (d.error||'Failed'), r.ok?'ok':'err');
    if (r.ok) { $('new-session-id').value=''; loadSessions(); }
  } catch(e) { toast(e.message,'err') }
}
async function resetSessionAdmin(id) {
  if (!confirm('Reset session '+id+'? Clears its auth dir only.')) return;
  const key = getAdminKey();
  try {
    const r = await fetch('/admin/sessions/'+encodeURIComponent(id)+'/reset', { method:'POST', headers: { 'X-API-Key': key } });
    const d = await r.json();
    toast(r.ok ? ('Reset '+id) : (d.error||'Failed'), r.ok?'ok':'err');
    loadSessions();
  } catch(e) { toast(e.message,'err') }
}
async function deleteSessionAdmin(id) {
  if (!confirm('Delete session '+id+'? Only this session\'s files are removed.')) return;
  const key = getAdminKey();
  try {
    const r = await fetch('/admin/sessions/'+encodeURIComponent(id), { method:'DELETE', headers: { 'X-API-Key': key } });
    const d = await r.json();
    toast(r.ok ? ('Deleted '+id) : (d.error||'Failed'), r.ok?'ok':'err');
    loadSessions();
  } catch(e) { toast(e.message,'err') }
}
async function showSessionQr(id) {
  const key = getAdminKey();
  try {
    const r = await fetch('/admin/sessions/'+encodeURIComponent(id)+'/qr', { headers: { 'X-API-Key': key } });
    const d = await r.json();
    if (d.qr) { window.open(d.qr, '_blank'); } else { toast('No QR available for '+id,'info'); }
  } catch(e) { toast(e.message,'err') }
}
function startSessionsPoll() { clearInterval(msTimer); loadSessions(); msTimer = setInterval(loadSessions, 5000); }
startSessionsPoll();

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
    if (!r.ok) { $('ov-events').innerHTML = '<div style="color:var(--text3);font-size:.82rem">No events available</div>'; return }
    const evts = await r.json();
    if (evts.length) {
      $('ov-events').innerHTML = evts.slice(0,8).map(e => {
        const ts = new Date(e.ts).toLocaleTimeString();
        return '<div class="log-item"><span class="log-ts">'+ts+'</span><span class="log-type t-'+esc(e.type)+'">'+esc(e.type)+'</span><span class="log-detail">'+esc(e.detail||'')+'</span></div>';
      }).join('');
    } else {
      $('ov-events').innerHTML = '<div style="color:var(--text3);font-size:.82rem">No events yet</div>';
    }
  } catch(e) { $('ov-events').innerHTML = '<div style="color:var(--text3);font-size:.82rem">No events available</div>' }
}
function initDashboard() {
  loadOverview();
  // pollStatus + interval are already started at boot (public endpoint)
  startQrPoll();
}

// Boot: pollStatus() only needs the public /healthz endpoint, so paint
// the status pill and Overview Status/Sessions/Webhook cards regardless
// of whether the operator is signed in. This stops the dashboard from
// being permanently stuck on "LOADING" when the wa_admin_key cookie was
// cleared or has not been set yet for the new multi-session admin key.
pollStatus();
setInterval(pollStatus, 4000);
if (getAdminKey()) {
  $('auth-overlay').style.display = 'none';
  initDashboard();
} else {
  showAuth();
}

// ── API Keys ─────────────────────────────────────────
let _keysCache = [];

async function loadKeys() {
  try {
    const r = await fetch('/admin/api-keys', { headers: hdr() });
    if (!r.ok) { $('keys-table').style.display='none'; $('keys-empty').style.display='none'; toast(r.status+' error loading keys','err'); return }
    const keys = await r.json();
    _keysCache = keys;
    if (!keys.length) {
      $('keys-table').style.display = 'none';
      $('keys-empty').style.display = 'block';
      return;
    }
    $('keys-empty').style.display = 'none';
    $('keys-table').style.display = '';
    $('keys-body').innerHTML = keys.map(k => {
      const sc = (typeof k.scopes==='string'?JSON.parse(k.scopes):k.scopes||[]).join(', ');
      const isActive = k.status === 'active';
      const isDisabled = k.status === 'disabled';
      const appLabel = k.app_name ? esc(k.app_name) + (k.app_domain ? ' <span style="color:var(--text3);font-size:.72rem">('+esc(k.app_domain)+')</span>' : '') : '<span class="empty-val">Unassigned</span>';
      const dotClass = isActive ? 'dot-active' : isDisabled ? 'dot-inactive' : 'dot-revoked';
      // Action buttons
      let acts = '';
      if (isActive) {
        acts += '<button class="btn btn-ghost btn-sm" title="Regenerate" onclick="regenerateKey('+k.id+')">&#x1F504;</button>';
        acts += '<button class="btn btn-ghost btn-sm" title="Disable" onclick="disableKey('+k.id+')">&#x23F8;</button>';
        acts += '<button class="btn btn-ghost btn-sm" title="Assign to App" onclick="assignKey('+k.id+')">&#x1F517;</button>';
        acts += '<button class="btn btn-danger btn-sm" title="Revoke" onclick="revokeKey('+k.id+')">&#x1F6AB;</button>';
      } else if (isDisabled) {
        acts += '<button class="btn btn-ghost btn-sm" title="Re-enable" onclick="enableKey('+k.id+')">&#x25B6;</button>';
        acts += '<button class="btn btn-danger btn-sm" title="Revoke" onclick="revokeKey('+k.id+')">&#x1F6AB;</button>';
      }
      return '<tr><td>'+esc(k.label)+'</td>' +
        '<td style="font-family:var(--mono);font-size:.78rem">'+esc(k.key_prefix)+'...</td>' +
        '<td style="font-size:.78rem">'+esc(sc||'none')+'</td>' +
        '<td style="font-size:.78rem">'+appLabel+'</td>' +
        '<td><span class="status-dot '+dotClass+'"></span>'+esc(k.status)+'</td>' +
        '<td style="font-size:.78rem;color:var(--text3)">'+(k.last_used_at?new Date(k.last_used_at).toLocaleString():'<span class="empty-val">Never</span>')+'</td>' +
        '<td>'+k.usage_count+'</td>' +
        '<td style="font-size:.78rem;color:var(--text3)">'+new Date(k.created_at).toLocaleDateString()+'</td>' +
        '<td><div class="key-actions">'+acts+'</div></td></tr>';
    }).join('');
  } catch(e) { toast(e.message,'err') }
}

function openKeyModal() {
  $('key-form').style.display = '';
  $('key-created').style.display = 'none';
  $('key-label').value = '';
  $('scope-send').checked = true;
  $('scope-read').checked = true;
  $('scope-admin').checked = false;
  $('key-create-btn').disabled = false;
  // Load apps dropdown
  fetch('/admin/apps', { headers: hdr() }).then(r => r.ok ? r.json() : []).then(apps => {
    $('key-app').innerHTML = '<option value="">None — assign later</option>' + apps.filter(a=>a.status==='active').map(a => '<option value="'+a.id+'">'+esc(a.name)+(a.domain?' ('+esc(a.domain)+')':'')+'</option>').join('');
  }).catch(()=>{});
  openModal('key-modal');
}
function closeKeyModal() {
  closeModal('key-modal');
  $('key-form').style.display = '';
  $('key-created').style.display = 'none';
}
function copySecret() {
  const raw = $('key-raw').textContent;
  navigator.clipboard.writeText(raw).then(() => toast('Secret copied to clipboard','ok')).catch(() => toast('Copy failed','err'));
}

async function createKey() {
  const label = $('key-label').value.trim() || 'Unnamed Key';
  const scopes = [];
  if ($('scope-send').checked) scopes.push('send');
  if ($('scope-read').checked) scopes.push('read');
  if ($('scope-admin').checked) scopes.push('admin');
  const app_id = $('key-app').value ? parseInt($('key-app').value) : null;
  $('key-create-btn').disabled = true;
  try {
    const r = await fetch('/admin/api-keys', { method:'POST', headers: hdrJson(), body: JSON.stringify({label, scopes, app_id}) });
    const d = await r.json();
    if (r.ok) {
      // Show created state
      $('key-form').style.display = 'none';
      $('key-created').style.display = 'block';
      $('key-raw').textContent = d.raw_key;
      $('key-created-prefix').textContent = d.key_prefix + '...';
      $('key-created-label').textContent = label;
      toast('API key created','ok');
      loadKeys();
    } else { toast(d.error||'Failed','err'); $('key-create-btn').disabled = false; }
  } catch(e) { toast(e.message,'err'); $('key-create-btn').disabled = false; }
}

async function revokeKey(id) {
  if (!confirm('Revoke this API key permanently? Apps using it will lose access immediately.')) return;
  try {
    const r = await fetch('/admin/api-keys/'+id, { method:'DELETE', headers: hdr() });
    if (r.ok) { toast('Key revoked','ok'); loadKeys() }
    else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

async function regenerateKey(id) {
  if (!confirm('Regenerate this key? The old secret will stop working immediately.')) return;
  try {
    const r = await fetch('/admin/api-keys/'+id+'/regenerate', { method:'POST', headers: hdr() });
    const d = await r.json();
    if (r.ok) {
      // Show the new secret in the key modal
      $('key-form').style.display = 'none';
      $('key-created').style.display = 'block';
      $('key-raw').textContent = d.raw_key;
      $('key-created-prefix').textContent = d.key_prefix + '...';
      $('key-created-label').textContent = d.label || '';
      $('key-modal-title').textContent = 'Regenerated Key';
      openModal('key-modal');
      toast('Key regenerated — copy new secret','ok');
      loadKeys();
    } else { toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

async function disableKey(id) {
  try {
    const r = await fetch('/admin/api-keys/'+id+'/disable', { method:'POST', headers: hdr() });
    if (r.ok) { toast('Key disabled','ok'); loadKeys() }
    else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

async function enableKey(id) {
  try {
    const r = await fetch('/admin/api-keys/'+id+'/enable', { method:'POST', headers: hdr() });
    if (r.ok) { toast('Key re-enabled','ok'); loadKeys() }
    else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

async function assignKey(keyId) {
  $('assign-key-id').value = keyId;
  $('assign-context').value = 'key';
  $('assign-title').textContent = 'Assign Key to App';
  try {
    const r = await fetch('/admin/apps', { headers: hdr() });
    const apps = r.ok ? await r.json() : [];
    // Find current assignment
    const key = _keysCache.find(k => k.id === keyId);
    $('assign-app-select').innerHTML = '<option value="">Unassign (no app)</option>' + apps.filter(a=>a.status==='active').map(a => '<option value="'+a.id+'"'+(key && key.app_id==a.id?' selected':'')+'>'+esc(a.name)+(a.domain?' ('+esc(a.domain)+')':'')+'</option>').join('');
  } catch(e) {}
  openModal('assign-modal');
}

async function doAssign() {
  const keyId = $('assign-key-id').value;
  const appId = $('assign-app-select').value ? parseInt($('assign-app-select').value) : null;
  try {
    const r = await fetch('/admin/api-keys/'+keyId+'/assign', { method:'PATCH', headers: hdrJson(), body: JSON.stringify({app_id:appId}) });
    if (r.ok) {
      toast(appId ? 'Key assigned to app' : 'Key unassigned','ok');
      closeModal('assign-modal');
      loadKeys();
      loadApps();
    } else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

// ── Apps ─────────────────────────────────────────────
let _appsCache = [];

async function loadApps() {
  try {
    const r = await fetch('/admin/apps', { headers: hdr() });
    if (!r.ok) return;
    const apps = await r.json();
    _appsCache = apps;
    if (!apps.length) {
      $('apps-empty').style.display = 'block';
      $('apps-list').innerHTML = '';
      return;
    }
    $('apps-empty').style.display = 'none';
    $('apps-list').innerHTML = apps.map(a => {
      const isActive = a.status === 'active' && !!a.key_prefix;
      const dotClass = isActive ? 'dot-active' : 'dot-inactive';
      const keyInfo = a.key_prefix ? esc(a.key_prefix)+'... <span style="font-size:.68rem;color:var(--text3)">('+esc(a.key_status||'')+')</span>' : '<span class="empty-val">No key assigned</span>';
      const wh = a.webhook_url ? '<span style="font-family:var(--mono);font-size:.72rem;word-break:break-all">'+esc(a.webhook_url)+'</span>' : '<span class="empty-val">None</span>';
      return '<div class="app-card">' +
        '<div class="app-card-hdr">' +
          '<h4><span class="status-dot '+dotClass+'"></span>'+esc(a.name)+'</h4>' +
          '<div class="app-actions">' +
            '<button class="btn btn-ghost btn-sm" title="View Details" onclick="viewApp('+a.id+')">&#x1F441;</button>' +
            '<button class="btn btn-ghost btn-sm" title="Edit" onclick="editApp('+a.id+')">&#x270F;</button>' +
            '<button class="btn btn-ghost btn-sm" title="'+(isActive?'Disable':'Enable')+'" onclick="toggleApp('+a.id+')">'+(isActive?'&#x23F8;':'&#x25B6;')+'</button>' +
            '<button class="btn btn-ghost btn-sm" title="Copy Client Config" onclick="copyAppConfig('+a.id+')">&#x1F4CB;</button>' +
            '<button class="btn btn-danger btn-sm" title="Delete" onclick="deleteAppAction('+a.id+')">&#x1F5D1;</button>' +
          '</div>' +
        '</div>' +
        '<div class="app-card-meta">' +
          '<div><dt>Domain</dt><dd>'+(a.domain ? '<span style="font-family:var(--mono)">'+esc(a.domain)+'</span>' : '<span class="empty-val">Not set</span>')+'</dd></div>' +
          '<div><dt>API Key</dt><dd>'+keyInfo+'</dd></div>' +
          '<div><dt>Webhook</dt><dd>'+wh+'</dd></div>' +
          '<div><dt>Created</dt><dd>'+new Date(a.created_at).toLocaleDateString()+'</dd></div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) { toast(e.message,'err') }
}

// ── Domain → Webhook auto-populate ───────────────────
var _webhookManual = false;

function normalizeDomain(input) {
  var d = (input || '').trim();
  d = d.replace(new RegExp('^https?://', 'i'), '');
  d = d.replace(new RegExp('/+$'), '');
  d = d.split('/')[0]; // take only host part
  return d.toLowerCase();
}
function buildDefaultWebhookUrl(domain) {
  if (!domain) return '';
  return 'https://' + domain + '/api/whatsapp/webhook';
}
function onDomainChange() {
  if (_webhookManual) return;
  var d = normalizeDomain($('app-domain').value);
  $('app-webhook').value = buildDefaultWebhookUrl(d);
}
function resetWebhook() {
  _webhookManual = false;
  var d = normalizeDomain($('app-domain').value);
  $('app-webhook').value = buildDefaultWebhookUrl(d);
  toast('Webhook URL reset to default', 'info');
}

async function openAppModal(editId) {
  _webhookManual = false;
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
      $('app-key').innerHTML = '<option value="">None — assign later</option>' + keys.filter(k=>k.status==='active').map(k => '<option value="'+k.id+'">'+esc(k.label)+' ('+esc(k.key_prefix)+'...)</option>').join('');
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
      // If existing webhook differs from default, mark as manually customized
      var defaultWh = buildDefaultWebhookUrl(normalizeDomain(a.domain || ''));
      if (a.webhook_url && a.webhook_url !== defaultWh) _webhookManual = true;
    }
  } catch(e) {}
}

async function saveApp() {
  const id = $('app-edit-id').value;
  const rawDomain = $('app-domain').value.trim();
  const domain = normalizeDomain(rawDomain);
  const body = {
    name: $('app-name').value.trim(),
    domain: domain,
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
      loadKeys(); // refresh key assignments
    } else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

async function viewApp(id) {
  const a = _appsCache.find(x => x.id === id);
  if (!a) { toast('App not found','err'); return; }
  $('app-detail-title').textContent = a.name;
  const isActive = a.status === 'active';
  $('app-detail-body').innerHTML =
    '<div class="app-card-meta" style="margin-bottom:.75rem">' +
      '<div><dt>Status</dt><dd><span class="status-dot '+(isActive?'dot-active':'dot-inactive')+'"></span>'+esc(a.status)+'</dd></div>' +
      '<div><dt>Domain</dt><dd>'+(a.domain ? esc(a.domain) : '<span class="empty-val">Not set</span>')+'</dd></div>' +
      '<div><dt>API Key</dt><dd>'+(a.key_prefix ? esc(a.key_prefix)+'...' : '<span class="empty-val">None</span>')+'</dd></div>' +
      '<div><dt>Created</dt><dd>'+new Date(a.created_at).toLocaleDateString()+'</dd></div>' +
    '</div>' +
    (a.description ? '<div style="margin-bottom:.5rem"><strong style="font-size:.78rem;color:var(--text3)">Description</strong><p style="font-size:.85rem;color:var(--text2)">'+esc(a.description)+'</p></div>' : '') +
    (a.webhook_url ? '<div><strong style="font-size:.78rem;color:var(--text3)">Webhook URL</strong><div style="font-family:var(--mono);font-size:.78rem;color:var(--text2);word-break:break-all;margin-top:.15rem">'+esc(a.webhook_url)+'</div></div>' : '<div style="font-size:.82rem;color:var(--text3)">No webhook configured — this app only sends outbound messages.</div>');
  openModal('app-detail-modal');
}

function copyAppConfig(id) {
  const a = _appsCache.find(x => x.id === id);
  if (!a) { toast('App not found','err'); return; }
  const keyInfo = a.key_prefix ? a.key_prefix + '...' : '(no key assigned)';
  var NL = String.fromCharCode(10);
  var SQ = String.fromCharCode(39);
  var envBlock = ['# Getouch WhatsApp Gateway - ' + (a.name||'App'), 'WHATSAPP_GATEWAY_BASE_URL=https://wa.getouch.co', 'WHATSAPP_GATEWAY_API_KEY=your_full_api_secret_here'].join(NL);
  var curlBlock = ['curl -X POST https://wa.getouch.co/api/send-text \\\\', '  -H "Content-Type: application/json" \\\\', '  -H "X-API-Key: YOUR_KEY" \\\\', '  -d ' + SQ + '{"to":"60123456789","text":"Hello!"}' + SQ].join(NL);
  $('config-body').innerHTML =
    '<div style="margin-bottom:.75rem"><strong>App:</strong> '+esc(a.name)+(a.domain?' &middot; <span style="font-family:var(--mono);font-size:.82rem">'+esc(a.domain)+'</span>':'')+'</div>' +
    '<div style="margin-bottom:.5rem"><strong>API Key:</strong> <span style="font-family:var(--mono)">'+esc(keyInfo)+'</span></div>' +
    '<div style="margin-bottom:.75rem"><strong>Gateway URL:</strong> <span style="font-family:var(--mono)">https://wa.getouch.co</span></div>' +
    '<div style="font-weight:700;font-size:.82rem;margin-bottom:.25rem">Environment Variables (.env)</div>' +
    '<div class="config-block" id="cfg-env">'+esc(envBlock)+'<button class="btn btn-ghost btn-sm cp" onclick="cpBlock('+SQ+'cfg-env'+SQ+')">Copy</button></div>' +
    '<div style="font-weight:700;font-size:.82rem;margin-bottom:.25rem;margin-top:.75rem">cURL Example</div>' +
    '<div class="config-block" id="cfg-curl">'+esc(curlBlock)+'<button class="btn btn-ghost btn-sm cp" onclick="cpBlock('+SQ+'cfg-curl'+SQ+')">Copy</button></div>';
  openModal('config-modal');
}
function cpBlock(id) {
  const el = $(id);
  // Get text without the button text
  const btn = el.querySelector('.cp');
  const txt = el.textContent.replace(btn?btn.textContent:'','').trim();
  navigator.clipboard.writeText(txt).then(() => toast('Copied','ok')).catch(() => toast('Copy failed','err'));
}

async function toggleApp(id) {
  try {
    const r = await fetch('/admin/apps/'+id+'/toggle', { method:'POST', headers: hdr() });
    if (r.ok) { const d = await r.json(); toast('App '+(d.status==='active'?'enabled':'disabled'),'ok'); loadApps() }
    else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

async function deleteAppAction(id) {
  const a = _appsCache.find(x => x.id === id);
  if (!confirm('Delete app "'+((a&&a.name)||id)+'"? This cannot be undone.')) return;
  try {
    const r = await fetch('/admin/apps/'+id, { method:'DELETE', headers: hdr() });
    if (r.ok) { toast('App deleted','ok'); loadApps(); loadKeys() }
    else { const d = await r.json(); toast(d.error||'Failed','err') }
  } catch(e) { toast(e.message,'err') }
}

// ── Messages ─────────────────────────────────────────
let msgOffset = 0;
const MSG_LIMIT = 40;

function getMessageFilters() {
  return {
    phone: $('msg-phone').value.trim(),
    dir: $('msg-dir').value,
    appId: $('msg-app').value,
    days: $('stats-days').value,
  };
}

async function applyMessageFilters() {
  loadStats();
  loadMessages(0);
}

function resetMessageFilters() {
  $('msg-phone').value = '';
  $('msg-dir').value = '';
  $('msg-app').value = '';
  $('stats-days').value = '7';
  applyMessageFilters();
}

async function loadAppsDropdown() {
  try {
    const r = await fetch('/admin/apps', { headers: hdr() });
    if (!r.ok) return;
    const apps = await r.json();
    $('msg-app').innerHTML = '<option value="">All Apps</option>' +
      apps.filter(a => a.status === 'active').map(a =>
        '<option value="'+a.id+'">'+esc(a.name)+(a.domain?' ('+esc(a.domain)+')':'')+'</option>'
      ).join('');
  } catch(e) {}
}

async function loadMessages(offset) {
  msgOffset = offset || 0;
  const f = getMessageFilters();
  const qs = new URLSearchParams({limit:MSG_LIMIT, offset:msgOffset});
  if (f.phone) qs.set('phone', f.phone);
  if (f.dir) qs.set('direction', f.dir);
  if (f.appId) qs.set('app_id', f.appId);
  try {
    const r = await fetch('/admin/messages?'+qs, { headers: hdr() });
    if (!r.ok) { $('msg-list').innerHTML = '<div style="color:var(--red);padding:1rem;text-align:center">'+r.status+' error</div>'; return }
    const d = await r.json();
    $('msg-count-label').textContent = d.total + ' message' + (d.total !== 1 ? 's' : '');
    if (!d.rows || !d.rows.length) { $('msg-list').innerHTML = '<div style="color:var(--text3);padding:1rem;text-align:center">No messages found</div>'; $('msg-pager').innerHTML=''; return }
    $('msg-list').innerHTML = '<table class="tbl"><thead><tr><th>Time</th><th>Dir</th><th>Phone</th><th>App</th><th>Type</th><th>Content</th><th>Status</th></tr></thead><tbody>' +
      d.rows.map(m => {
        const t = new Date(m.created_at).toLocaleString();
        const dc = m.direction==='out'?'var(--green)':'var(--blue)';
        const dirIcon = m.direction==='out'?'&#x2B06;':'&#x2B07;';
        const appTag = m.app_name ? '<span style="background:var(--accent-dim);color:var(--accent);padding:.1rem .35rem;border-radius:4px;font-size:.68rem;font-weight:600">'+esc(m.app_name)+'</span>' : '<span style="color:var(--text3);font-size:.72rem">Direct</span>';
        const statusDot = m.status==='sent'||m.status==='delivered'?'dot-active':'dot-inactive';
        return '<tr><td style="white-space:nowrap;color:var(--text3);font-size:.78rem">'+t+'</td><td style="font-weight:700;color:'+dc+'">'+dirIcon+' '+m.direction.toUpperCase()+'</td><td style="font-family:var(--mono);font-size:.78rem">'+esc(m.phone||'')+'</td><td>'+appTag+'</td><td style="font-size:.78rem">'+esc(m.message_type)+'</td><td style="color:var(--text2);word-break:break-all;max-width:16rem;font-size:.78rem">'+esc((m.content||'').slice(0,100))+(m.content&&m.content.length>100?'...':'')+'</td><td><span class="status-dot '+statusDot+'"></span><span style="font-size:.72rem">'+esc(m.status)+'</span></td></tr>';
      }).join('') + '</tbody></table>';
    const pages = Math.ceil(d.total/MSG_LIMIT);
    const cur = Math.floor(msgOffset/MSG_LIMIT);
    let ph = '';
    if (cur>0) ph += '<button class="btn btn-ghost btn-sm" onclick="loadMessages('+(msgOffset-MSG_LIMIT)+')">&#x2190; Prev</button>';
    ph += '<span>Page '+(cur+1)+' of '+pages+'</span>';
    if (cur<pages-1) ph += '<button class="btn btn-ghost btn-sm" onclick="loadMessages('+(msgOffset+MSG_LIMIT)+')">Next &#x2192;</button>';
    $('msg-pager').innerHTML = ph;
  } catch(e) { $('msg-list').innerHTML = '<div style="color:var(--red);padding:1rem;text-align:center">'+e.message+'</div>' }
}

// ── Stats ────────────────────────────────────────────
async function loadStats() {
  const f = getMessageFilters();
  const qs = new URLSearchParams({days: f.days});
  if (f.appId) qs.set('app_id', f.appId);
  try {
    const r = await fetch('/admin/stats?'+qs, { headers: hdr() });
    if (!r.ok) return;
    const d = await r.json();
    if (d.summary) {
      var sent = parseInt(d.summary.sent)||0, recv = parseInt(d.summary.received)||0, total = parseInt(d.summary.total)||0, contacts = parseInt(d.summary.unique_contacts)||0;
      $('st-sent').textContent = sent;
      $('st-recv').textContent = recv;
      $('st-total').textContent = total;
      $('st-contacts').textContent = contacts;
      // Sub labels
      var pct = total > 0 ? Math.round(sent/total*100) : 0;
      $('st-sent-sub').textContent = pct + '% of total';
      $('st-recv-sub').textContent = (100-pct) + '% of total';
      $('st-total-sub').textContent = 'Last ' + f.days + ' days';
      $('st-contacts-sub').textContent = total > 0 ? (total/contacts).toFixed(1) + ' msg/contact' : '';
    }
    // Daily chart — CSS bar chart
    if (d.daily && d.daily.length) {
      var maxDay = Math.max(1, ...d.daily.map(r => parseInt(r.sent)+parseInt(r.received)));
      $('daily-chart').innerHTML = '<div style="display:flex;align-items:end;gap:3px;height:7rem;padding-top:.5rem">' +
        d.daily.map(r => {
          var s = parseInt(r.sent), rv = parseInt(r.received), h = Math.max(2, Math.round((s+rv)/maxDay*100));
          var hs = Math.round(s/(s+rv||1)*h), hr = h - hs;
          var label = new Date(r.day).toLocaleDateString('en',{month:'short',day:'numeric'});
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px" title="'+label+': '+s+' sent, '+rv+' recv">' +
            '<div style="width:100%;display:flex;flex-direction:column;gap:1px;align-items:stretch">' +
              '<div style="height:'+hr+'px;background:var(--blue);border-radius:2px 2px 0 0;min-height:'+(rv>0?'2':'0')+'px"></div>' +
              '<div style="height:'+hs+'px;background:var(--green);border-radius:0 0 2px 2px;min-height:'+(s>0?'2':'0')+'px"></div>' +
            '</div>' +
            '<span style="font-size:.58rem;color:var(--text3);white-space:nowrap;margin-top:2px">'+label+'</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div style="display:flex;gap:1rem;justify-content:center;margin-top:.5rem;font-size:.7rem;color:var(--text3)">' +
        '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--green);margin-right:3px"></span>Sent</span>' +
        '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--blue);margin-right:3px"></span>Received</span>' +
      '</div>';
    } else { $('daily-chart').innerHTML = '<div style="color:var(--text3);padding:1rem;text-align:center;font-size:.82rem">No data for this period</div>' }
    // Per-app breakdown
    if (d.byApp && d.byApp.length) {
      $('app-breakdown-panel').style.display = '';
      var maxApp = Math.max(1, ...d.byApp.map(a => parseInt(a.total)));
      $('app-breakdown').innerHTML = '<table class="tbl"><thead><tr><th>App</th><th>Domain</th><th style="text-align:right">Sent</th><th style="text-align:right">Received</th><th style="text-align:right">Total</th><th style="text-align:right">Contacts</th><th>Volume</th></tr></thead><tbody>' +
        d.byApp.map(a => {
          var pctW = Math.max(4, Math.round(parseInt(a.total)/maxApp*100));
          var sPct = Math.round(parseInt(a.sent)/(parseInt(a.total)||1)*100);
          return '<tr><td style="font-weight:600">'+esc(a.app_name||'Unknown')+'</td>' +
            '<td style="font-family:var(--mono);font-size:.78rem;color:var(--text2)">'+esc(a.app_domain||'')+'</td>' +
            '<td style="text-align:right;color:var(--green)">'+a.sent+'</td>' +
            '<td style="text-align:right;color:var(--blue)">'+a.received+'</td>' +
            '<td style="text-align:right;font-weight:600">'+a.total+'</td>' +
            '<td style="text-align:right;color:var(--text2)">'+a.unique_contacts+'</td>' +
            '<td style="min-width:6rem"><div style="height:8px;border-radius:4px;background:var(--surface2);overflow:hidden;position:relative"><div style="position:absolute;left:0;top:0;height:100%;width:'+pctW+'%;display:flex"><div style="width:'+sPct+'%;background:var(--green)"></div><div style="flex:1;background:var(--blue)"></div></div></div></td>' +
          '</tr>';
        }).join('') + '</tbody></table>';
    } else { $('app-breakdown-panel').style.display = 'none' }
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
