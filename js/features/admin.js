import { state } from "../state.js";
import { toast } from "../app.js";
import { apiFetch } from "../api.js";

/* =========================================================
   CAMPUSPOOL — FUTURISTIC ADMIN CONTROL DESK
   DARK NAVY + EMERALD
========================================================= */

const MAX_ADMINS = 5;
const LIMIT = 20;

const TABS = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["rides", "Rides"],
  ["bookings", "Bookings"],
  ["safety", "Safety Center"],
  ["resets", "Password Resets"],
  ["logs", "Activity Logs"]
];

let requestSeq = 0;
let overview = {};
let analytics = null;

let users = [];
let rides = [];
let bookings = [];
let alerts = [];
let resetRequests = [];
let logs = [];

let pages = {
  users: { page: 1, limit: LIMIT, total: 0, pages: 1 },
  rides: { page: 1, limit: LIMIT, total: 0, pages: 1 },
  bookings: { page: 1, limit: LIMIT, total: 0, pages: 1 }
};

let filters = {
  users: { q: "", role: "", status: "" },
  rides: { q: "", status: "" },
  bookings: { q: "", status: "" },
  sos: "active"
};

const $ = (selector, root = document) =>
  root.querySelector(selector);

const esc = value =>
  String(value ?? "—").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

const n = value =>
  (Number(value) || 0).toLocaleString();

const date = value => {
  if (!value) return "—";

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? esc(value)
    : d.toLocaleString();
};

function localDayKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const val = (obj, ...keys) => {
  for (const key of keys) {
    if (
      obj?.[key] !== undefined &&
      obj?.[key] !== null &&
      obj[key] !== ""
    ) {
      return obj[key];
    }
  }

  return "—";
};

const unwrap = result => {
  let data = result;

  for (let i = 0; i < 2; i++) {
    if (data?.data && typeof data.data === "object") {
      data = data.data;
    } else {
      break;
    }
  }

  return data || {};
};

const notify = message => {
  if (typeof toast === "function") toast(message);
};

const me = () =>
  Number(localStorage.getItem("campuspool_user_id")) ||
  Number(state.user?.id) ||
  Number(state.currentUser?.id) ||
  0;

const tabNow = () =>
  TABS.some(item => item[0] === state.currentAdminTab)
    ? state.currentAdminTab
    : "overview";

const isHere = tab =>
  state.currentView === "admin" && tabNow() === tab;

/* =========================================================
   DESIGN SYSTEM
========================================================= */

function styles() {
  if ($("#cp-admin-v6-style")) return;

  const style = document.createElement("style");
  style.id = "cp-admin-v6-style";

  style.textContent = `
  #view-root .cp-admin-v6 {
    --bg:#06131f;
    --surface:#0b1d2b;
    --surface2:#102638;
    --surface3:#153247;
    --ink:#e7f5f0;
    --muted:#91a7b5;
    --line:#203b4c;
    --green:#10b981;
    --green2:#34d399;
    --green3:#6ee7b7;
    --red:#fb6474;
    --yellow:#fbbf24;
    --blue:#38bdf8;

    color:var(--ink);
    font-family:inherit;
    font-size:13px;
    width:100%;
  }

  #view-root .cp-admin-v6 * { box-sizing:border-box; }

  #view-root .cp-admin-v6 button,
  #view-root .cp-admin-v6 input,
  #view-root .cp-admin-v6 select { font:inherit; }

  #view-root .cp-admin-v6 button { cursor:pointer; }

  #view-root .cp-admin-v6 .wrap {
    background:
      radial-gradient(ellipse at 85% 0%,rgba(16,185,129,.09),transparent 35%),
      var(--bg);
    padding:22px;
    border:1px solid var(--line);
    border-radius:16px;
    min-height:600px;
    box-shadow:0 20px 70px rgba(0,0,0,.25);
  }

  #view-root .cp-admin-v6 .top {
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:16px;
    margin-bottom:24px;
    padding-bottom:20px;
    border-bottom:1px solid var(--line);
  }

  #view-root .cp-admin-v6 .brand {
    font-weight:950;
    font-size:20px;
    letter-spacing:-.7px;
    color:#f0fdf8;
  }

  #view-root .cp-admin-v6 .brand small {
    display:block;
    color:var(--green2);
    font-size:9px;
    letter-spacing:2.2px;
    font-weight:850;
    margin-top:5px;
  }

  #view-root .cp-admin-v6 .nav {
    display:flex;
    gap:6px;
    flex-wrap:wrap;
    border-bottom:1px solid var(--line);
    padding-bottom:14px;
    margin-bottom:25px;
  }

  #view-root .cp-admin-v6 .nav button {
    border:1px solid transparent;
    background:transparent;
    padding:10px 14px;
    border-radius:8px;
    color:var(--muted);
    font-size:11px;
    font-weight:800;
    transition:.2s;
  }

  #view-root .cp-admin-v6 .nav button:hover {
    color:var(--green2);
    background:rgba(16,185,129,.08);
    border-color:rgba(16,185,129,.15);
  }

  #view-root .cp-admin-v6 .nav button.active {
    background:rgba(16,185,129,.14);
    color:var(--green2);
    border-color:rgba(52,211,153,.35);
    box-shadow:0 0 18px rgba(16,185,129,.08);
  }

  #view-root .cp-admin-v6 .head {
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    gap:15px;
    margin-bottom:20px;
  }

  #view-root .cp-admin-v6 .eyebrow {
    font-size:9px;
    font-weight:950;
    letter-spacing:2px;
    color:var(--green2);
    margin-bottom:9px;
  }

  #view-root .cp-admin-v6 h1 {
    font-size:clamp(24px,3vw,34px);
    line-height:1.1;
    letter-spacing:-1.3px;
    margin:0;
    font-weight:950;
    color:#f0fdf8;
  }

  #view-root .cp-admin-v6 h2 {
    font-size:13px;
    margin:0;
    font-weight:850;
    color:#e5f5ef;
  }

  #view-root .cp-admin-v6 .sub {
    color:var(--muted);
    font-size:11px;
    margin:8px 0 0;
  }

  #view-root .cp-admin-v6 .grid {
    display:grid;
    gap:13px;
  }

  #view-root .cp-admin-v6 .g2 {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }

  #view-root .cp-admin-v6 .g3 {
    grid-template-columns:repeat(3,minmax(0,1fr));
  }

  #view-root .cp-admin-v6 .g4 {
    grid-template-columns:repeat(4,minmax(0,1fr));
  }

  #view-root .cp-admin-v6 .panel {
    background:linear-gradient(145deg,#102638,#0b1d2b);
    border:1px solid #203b4c;
    border-radius:13px;
    padding:17px;
    min-width:0;
    box-shadow:0 8px 24px rgba(0,0,0,.12);
    transition:border-color .2s,transform .2s;
  }

  #view-root .cp-admin-v6 .panel:hover {
    border-color:rgba(52,211,153,.35);
    transform:translateY(-1px);
  }

  #view-root .cp-admin-v6 .panel-head {
    display:flex;
    justify-content:space-between;
    gap:10px;
    align-items:flex-start;
    margin-bottom:14px;
  }

  #view-root .cp-admin-v6 .muted {
    color:var(--muted);
    font-size:10px;
  }

  #view-root .cp-admin-v6 .stat {
    padding:18px;
    background:linear-gradient(145deg,#102b3d,#0b1d2b);
    border:1px solid #244456;
    border-radius:13px;
    position:relative;
    overflow:hidden;
  }

  #view-root .cp-admin-v6 .stat:after {
    content:"";
    position:absolute;
    width:90px;
    height:90px;
    right:-35px;
    top:-35px;
    background:rgba(16,185,129,.12);
    filter:blur(22px);
    border-radius:50%;
  }

  #view-root .cp-admin-v6 .stat label {
    display:block;
    color:#9bb2bf;
    font-size:10px;
    font-weight:800;
    letter-spacing:.5px;
  }

  #view-root .cp-admin-v6 .stat strong {
    display:block;
    font-size:30px;
    letter-spacing:-1px;
    margin:7px 0;
    color:#eafff6;
    position:relative;
    z-index:1;
  }

  #view-root .cp-admin-v6 .stat small {
    color:var(--green2);
    font-size:9px;
  }

  #view-root .cp-admin-v6 .charts {
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:14px;
    margin-top:15px;
  }

  #view-root .cp-admin-v6 .viz {
    width:100%;
    min-height:180px;
    display:block;
    overflow:visible;
  }

  #view-root .cp-admin-v6 .viz text {
    font-family:inherit;
    fill:#9bb2bf;
    font-size:10px;
  }

  #view-root .cp-admin-v6 .viz .big {
    font-size:22px;
    font-weight:950;
    fill:#ecfdf5;
  }

  #view-root .cp-admin-v6 .legend {
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    margin-top:8px;
    color:#9bb2bf;
    font-size:9px;
  }

  #view-root .cp-admin-v6 .dot {
    display:inline-block;
    width:8px;
    height:8px;
    border-radius:2px;
    margin-right:4px;
  }

  #view-root .cp-admin-v6 .table-wrap {
    overflow:auto;
    border:1px solid var(--line);
    border-radius:10px;
    background:#0b1d2b;
  }

  #view-root .cp-admin-v6 table {
    width:100%;
    min-width:720px;
    border-collapse:collapse;
    font-size:10px;
  }

  #view-root .cp-admin-v6 th {
    text-align:left;
    background:#102638;
    color:#8fa9b7;
    padding:13px;
    font-size:8px;
    letter-spacing:1px;
    text-transform:uppercase;
    white-space:nowrap;
  }

  #view-root .cp-admin-v6 td {
    padding:13px;
    border-top:1px solid #1a3546;
    color:#b4c8d2;
    vertical-align:middle;
  }

  #view-root .cp-admin-v6 tbody tr:hover {
    background:rgba(16,185,129,.055);
  }

  #view-root .cp-admin-v6 td strong {
    display:block;
    color:#e7f5f0;
    font-size:10px;
  }

  #view-root .cp-admin-v6 td small {
    display:block;
    color:#829ba9;
    margin-top:3px;
    font-size:9px;
  }

  #view-root .cp-admin-v6 .toolbar {
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    margin-bottom:13px;
  }

  #view-root .cp-admin-v6 input,
  #view-root .cp-admin-v6 select {
    border:1px solid #29495a;
    background:#0b1d2b;
    border-radius:8px;
    padding:10px 12px;
    color:#e7f5f0;
    font-size:10px;
    min-width:120px;
    outline:none;
  }

  #view-root .cp-admin-v6 input::placeholder {
    color:#718b99;
  }

  #view-root .cp-admin-v6 input:focus,
  #view-root .cp-admin-v6 select:focus {
    border-color:var(--green);
    box-shadow:0 0 0 3px rgba(16,185,129,.1);
  }

  #view-root .cp-admin-v6 select option {
    background:#102638;
    color:#e7f5f0;
  }

  #view-root .cp-admin-v6 input { flex:1; }

  #view-root .cp-admin-v6 .btn {
    border:1px solid #29495a;
    background:#102638;
    color:#b7cbd5;
    border-radius:8px;
    padding:9px 12px;
    font-size:9px;
    font-weight:850;
    transition:.2s;
  }

  #view-root .cp-admin-v6 .btn:hover:not(:disabled) {
    border-color:var(--green);
    color:var(--green2);
    background:#123347;
  }

  #view-root .cp-admin-v6 .btn.primary {
    background:linear-gradient(135deg,#059669,#10b981);
    border-color:#10b981;
    color:#031b14;
    box-shadow:0 4px 16px rgba(16,185,129,.16);
  }

  #view-root .cp-admin-v6 .btn.danger {
    color:#ff8290;
    border-color:#63323e;
    background:#291a25;
  }

  #view-root .cp-admin-v6 .btn:disabled {
    opacity:.35;
    cursor:not-allowed;
  }

  #view-root .cp-admin-v6 .pill {
    display:inline-block;
    border-radius:5px;
    padding:5px 8px;
    background:#203747;
    color:#b6c9d3;
    font-size:8px;
    font-weight:900;
    text-transform:uppercase;
    border:1px solid #2c4a5a;
  }

  #view-root .cp-admin-v6 .pill.green {
    background:rgba(16,185,129,.13);
    color:#6ee7b7;
    border-color:rgba(52,211,153,.25);
  }

  #view-root .cp-admin-v6 .pill.red {
    background:rgba(251,100,116,.12);
    color:#ff8290;
    border-color:rgba(251,100,116,.22);
  }

  #view-root .cp-admin-v6 .pill.yellow {
    background:rgba(251,191,36,.12);
    color:#fcd34d;
    border-color:rgba(251,191,36,.22);
  }

  #view-root .cp-admin-v6 .pill.blue {
    background:rgba(56,189,248,.12);
    color:#7dd3fc;
    border-color:rgba(56,189,248,.22);
  }

  #view-root .cp-admin-v6 .actions {
    display:flex;
    gap:5px;
    flex-wrap:wrap;
  }

  #view-root .cp-admin-v6 .pagination {
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-top:13px;
    color:var(--muted);
    font-size:9px;
  }

  #view-root .cp-admin-v6 .empty,
  #view-root .cp-admin-v6 .loading {
    padding:28px;
    text-align:center;
    color:var(--muted);
    font-size:11px;
  }

  #view-root .cp-admin-v6 .sos-banner {
    padding:14px 16px;
    background:rgba(251,100,116,.1);
    border:1px solid rgba(251,100,116,.3);
    border-radius:10px;
    color:#ff8793;
    margin-bottom:14px;
    font-weight:850;
  }

  #view-root .cp-admin-v6 .heat {
    display:grid;
    grid-template-columns:repeat(15,minmax(8px,1fr));
    gap:4px;
  }

  #view-root .cp-admin-v6 .heat-cell {
    height:17px;
    border-radius:3px;
    background:#1c3444;
    border:1px solid rgba(255,255,255,.025);
  }

  #view-root .cp-admin-v6 .heat-cell[data-level="1"] { background:#164e43; }
  #view-root .cp-admin-v6 .heat-cell[data-level="2"] { background:#087b5b; }
  #view-root .cp-admin-v6 .heat-cell[data-level="3"] { background:#0da77a; }
  #view-root .cp-admin-v6 .heat-cell[data-level="4"] {
    background:#34d399;
    box-shadow:0 0 9px rgba(52,211,153,.3);
  }

  #view-root .cp-admin-v6 .flow {
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:wrap;
  }

  #view-root .cp-admin-v6 .flow-node {
    padding:9px 12px;
    border-radius:8px;
    background:rgba(16,185,129,.12);
    border:1px solid rgba(52,211,153,.25);
    color:#6ee7b7;
    font-size:10px;
    font-weight:850;
  }

  #view-root .cp-admin-v6 .flow-arrow {
    color:#34d399;
    font-weight:950;
  }

  #view-root .cp-admin-v6 .mini-list {
    display:grid;
    gap:9px;
  }

  #view-root .cp-admin-v6 .mini-row {
    display:flex;
    justify-content:space-between;
    gap:10px;
    font-size:10px;
    color:#b7cbd5;
  }

  #view-root .cp-admin-v6 .mini-row b { color:#e7f5f0; }

  #view-root .cp-admin-v6 .barline {
    height:7px;
    border-radius:10px;
    background:#203b4c;
    overflow:hidden;
    margin-top:5px;
  }

  #view-root .cp-admin-v6 .barline span {
    display:block;
    height:100%;
    background:linear-gradient(90deg,#059669,#34d399);
    border-radius:10px;
    box-shadow:0 0 10px rgba(52,211,153,.25);
  }

  @media(max-width:900px) {
    #view-root .cp-admin-v6 .g4 {
      grid-template-columns:repeat(2,minmax(0,1fr));
    }

    #view-root .cp-admin-v6 .g3 {
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
  }

  @media(max-width:620px) {
    #view-root .cp-admin-v6 .wrap { padding:12px; }

    #view-root .cp-admin-v6 .g2,
    #view-root .cp-admin-v6 .g3,
    #view-root .cp-admin-v6 .charts {
      grid-template-columns:1fr;
    }

    #view-root .cp-admin-v6 .head,
    #view-root .cp-admin-v6 .top {
      align-items:flex-start;
      flex-direction:column;
    }
  }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   COMMON UI HELPERS
========================================================= */

function badge(status) {
  const x = String(status || "unknown").toLowerCase();

  const color =
    ["active","open","confirmed","resolved","admin"].includes(x)
      ? "green"
      : ["banned","rejected","cancelled","expired"].includes(x)
        ? "red"
        : ["pending","suspended","full"].includes(x)
          ? "yellow"
          : x === "student" ? "blue" : "";

  return `<span class="pill ${color}">${esc(status || "Unknown")}</span>`;
}

function heading(kicker, title, description, extra = "") {
  return `
    <div class="head">
      <div>
        <div class="eyebrow">${esc(kicker)}</div>
        <h1>${esc(title)}</h1>
        <p class="sub">${esc(description)}</p>
      </div>
      ${extra}
    </div>
  `;
}

function panel(title, description, body, extra = "") {
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>${esc(title)}</h2>
          <div class="muted">${esc(description || "")}</div>
        </div>
        ${extra}
      </div>
      ${body}
    </section>
  `;
}

function stat(label, value, note) {
  return `
    <div class="stat">
      <label>${esc(label)}</label>
      <strong>${n(value)}</strong>
      <small>${esc(note || "")}</small>
    </div>
  `;
}

function empty(message) {
  return `<div class="empty">${esc(message)}</div>`;
}

function tableEmpty(columns, message) {
  return `<tr><td colspan="${columns}">${empty(message)}</td></tr>`;
}

function paginationHtml(type, label) {
  const p = pages[type];
  const max = Math.max(1, Number(p.pages) || 1);

  return `
    <div class="pagination">
      <span>Page ${n(p.page)} / ${n(max)} · ${n(p.total)} ${esc(label)}</span>

      <div>
        <button class="btn"
          data-page="${type}:${p.page - 1}"
          ${p.page <= 1 ? "disabled" : ""}>← Prev</button>

        <button class="btn"
          data-page="${type}:${p.page + 1}"
          ${p.page >= max ? "disabled" : ""}>Next →</button>
      </div>
    </div>
  `;
}

function syncPage(type, incoming = {}) {
  pages[type] = {
    ...pages[type],
    ...incoming,
    page: Number(incoming.page) || pages[type].page,
    total: Number(incoming.total) || 0,
    pages: Number(incoming.pages ?? incoming.total_pages) || 1
  };
}

function table(headers, rows, columns) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr>
        </thead>
        <tbody>${rows || tableEmpty(columns, "No records found.")}</tbody>
      </table>
    </div>
  `;
}

/* =========================================================
   DASHBOARD LAYOUT
========================================================= */

function layout(tab, body) {
  return `
    <div class="cp-admin-v6">
      <div class="wrap">

        <header class="top">
          <div class="brand">
            CampusPool
            <small>ADMINISTRATION / CONTROL DESK</small>
          </div>

          <div class="muted">● Secure admin session</div>
        </header>

        <nav class="nav">
          ${TABS.map(([id, label]) => `
            <button type="button"
              data-cp-tab="${id}"
              class="${id === tab ? "active" : ""}">
              ${esc(label)}
            </button>
          `).join("")}
        </nav>

        ${body}

      </div>
    </div>
  `;
}

/* =========================================================
   RADIAL GAUGE
========================================================= */

function gauge(title, value, max, unit = "", note = "") {
  const m = Math.max(1, Number(max) || 1);
  const v = Math.max(0, Number(value) || 0);
  const pct = Math.min(100, v / m * 100);

  const radius = 57;
  const circumference = 2 * Math.PI * radius;

  return panel(title, note, `
    <svg class="viz" viewBox="0 0 180 150"
      role="img" aria-label="${esc(title)}">

      <defs>
        <filter id="cpGlowGauge">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <circle cx="90" cy="70" r="${radius}"
        fill="none" stroke="#203b4c" stroke-width="13"/>

      <circle cx="90" cy="70" r="${radius}"
        fill="none" stroke="#10b981" stroke-width="13"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${circumference * (1-pct/100)}"
        transform="rotate(-90 90 70)"
        filter="url(#cpGlowGauge)"/>

      <text x="90" y="70" text-anchor="middle" class="big">${esc(n(v))}</text>
      <text x="90" y="89" text-anchor="middle">${esc(unit || `${pct.toFixed(0)}%`)}</text>
      <text x="90" y="145" text-anchor="middle">${esc(`${pct.toFixed(1)}% capacity`)}</text>

    </svg>
  `);
}

/* =========================================================
   TREEMAP
========================================================= */

function treemap(title, items) {
  const valid = items
    .map(item => ({
      ...item,
      value: Math.max(0, Number(item.value) || 0)
    }))
    .filter(item => item.value > 0);

  const total = valid.reduce((sum, item) => sum + item.value, 0);

  const colors = [
    "#10b981","#34d399","#059669",
    "#38bdf8","#fbbf24","#8b9cf6",
    "#0f766e","#14b8a6"
  ];

  const body = total ? `
    <div style="
      display:grid;
      grid-template-columns:repeat(12,minmax(0,1fr));
      grid-auto-rows:48px;
      gap:5px">

      ${valid.map((item,index) => {
        const span = Math.max(1, Math.round(item.value / total * 12));

        return `
          <div style="
            grid-column:span ${span};
            min-width:0;
            border-radius:7px;
            background:${colors[index % colors.length]};
            color:#032319;
            padding:8px;
            overflow:hidden;
            display:flex;
            flex-direction:column;
            justify-content:center">

            <b style="font-size:13px">${n(item.value)}</b>

            <div style="font-size:9px;font-weight:750;overflow:hidden;text-overflow:ellipsis">
              ${esc(item.label)}
            </div>

          </div>
        `;
      }).join("")}

    </div>
  ` : empty("No data for treemap.");

  return panel(title, "Proportional status distribution", body);
}

/* =========================================================
   CIRCULAR / CHORD-STYLE VISUALIZATION
========================================================= */

function circular(title, items, chord = false) {
  const valid = items
    .map(item => ({
      ...item,
      value: Math.max(0, Number(item.value) || 0)
    }))
    .filter(item => item.value > 0);

  const total = valid.reduce((sum, item) => sum + item.value, 0);

  const colors = [
    "#10b981","#34d399","#38bdf8","#fbbf24","#8b9cf6"
  ];

  const radius = 48;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  const rings = valid.map((item,index) => {
    const portion = total ? item.value / total : 0;
    const dash = portion * circumference;
    const current = offset;

    offset += dash;

    return `
      <circle cx="85" cy="75" r="${radius}"
        fill="none"
        stroke="${colors[index % colors.length]}"
        stroke-width="${chord ? 16 : 20}"
        stroke-dasharray="${dash} ${circumference-dash}"
        stroke-dashoffset="${-current}"
        transform="rotate(-90 85 75)"/>
    `;
  }).join("");

  const legend = `
    <div class="legend">
      ${valid.map((item,index) => `
        <span>
          <i class="dot" style="background:${colors[index % colors.length]}"></i>
          ${esc(item.label)}: ${n(item.value)}
        </span>
      `).join("")}
    </div>
  `;

  const chords = chord && valid.length > 1 ? `
    <g fill="none" stroke="#34d399" opacity=".35" stroke-width="1.5">
      <path d="M85 27 Q150 75 85 123"/>
      <path d="M43 51 Q85 140 127 51"/>
      <path d="M43 99 Q85 10 127 99"/>
    </g>
  ` : "";

  return panel(
    title,
    chord ? "Booking outcome composition" : "Category distribution",
    `
      <svg class="viz" viewBox="0 0 170 155">
        <circle cx="85" cy="75" r="48"
          fill="none" stroke="#203b4c" stroke-width="20"/>

        ${rings}
        ${chords}

        <text x="85" y="72" text-anchor="middle" class="big">${n(total)}</text>
        <text x="85" y="89" text-anchor="middle">TOTAL</text>
      </svg>

      ${legend}
    `
  );
}

/* =========================================================
   FLOW VISUALIZATION
========================================================= */

function sankey(title, items, description) {
  const valid = items.map(item => ({
    ...item,
    value: Math.max(0, Number(item.value) || 0)
  }));

  const total = valid.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(1, ...valid.map(item => item.value));

  const colors = ["#10b981","#34d399","#38bdf8","#fbbf24"];

  const rows = valid.map((item,index) => `
    <div style="margin:12px 0">

      <div class="mini-row">
        <b>${esc(item.label)}</b>
        <b>${n(item.value)}</b>
      </div>

      <div class="barline">
        <span style="
          width:${item.value/max*100}%;
          background:${colors[index%colors.length]}">
        </span>
      </div>

    </div>
  `).join("");

  return panel(title, description || "Flow distribution", `
    <div class="flow">
      <span class="flow-node">Total · ${n(total)}</span>
      <span class="flow-arrow">→</span>
      <span class="flow-node">${valid.length} outcomes</span>
    </div>

    <div style="margin-top:14px">
      ${rows || empty("No flow data available.")}
    </div>
  `);
}

/* =========================================================
   ACTIVITY HEATMAP
========================================================= */

function heatmap(title, series) {
  const counts = new Map();

  (Array.isArray(series) ? series : []).forEach(item => {
    const day = String(item.date || item.day || "").slice(0, 10);

    if (!day) return;

    counts.set(
      day,
      (counts.get(day) || 0) +
      (Number(item.count ?? item.total) || 0)
    );
  });

  const today = new Date();
  const cells = [];

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    const key = localDayKey(d);

    cells.push({
      key,
      value: counts.get(key) || 0
    });
  }

  const max = Math.max(1, ...cells.map(item => item.value));

  return panel(title, "Daily activity · last 90 days", `
    <div class="heat">
      ${cells.map(item => {
        const level = item.value === 0
          ? 0
          : Math.min(4, Math.ceil(item.value / max * 4));

        return `
          <span class="heat-cell"
            data-level="${level}"
            title="${esc(item.key)}: ${n(item.value)}">
          </span>
        `;
      }).join("")}
    </div>

    <div class="legend">
      <span>Less</span>

      ${[0,1,2,3,4].map(index => `
        <i class="dot" style="background:${
          ["#1c3444","#164e43","#087b5b","#0da77a","#34d399"][index]
        }"></i>
      `).join("")}

      <span>More</span>
    </div>
  `);
}

/* =========================================================
   DAILY ACTIVITY DATA
========================================================= */

function growthHeat(data) {
  const list = Array.isArray(data) ? data : [];

  return list.map(item => ({
    date: String(item.date || "").slice(0, 10),
    count: Math.max(0, Number(item.total) || 0)
  }));
}

/* =========================================================
   OVERVIEW
========================================================= */

function renderOverview() {
  const u = overview.users || {};
  const r = overview.rides || {};
  const b = overview.bookings || {};

  const cap = overview.admin_capacity || analytics?.admin_capacity || {};

  const sosTotal = Number(
    overview.active_sos ?? overview.sos?.active ?? analytics?.sos?.active
  ) || 0;

  const daily = analytics?.statistics?.daily || {};

  const journey = [
    { label:"Rides posted", value:r.total },
    { label:"Bookings created", value:b.total },
    { label:"Confirmed", value:b.confirmed },
    {
      label:"Other outcomes",
      value:
        (Number(b.pending)||0) +
        (Number(b.rejected)||0) +
        (Number(b.cancelled)||0)
    }
  ];

  const activity = [
    ...growthHeat(analytics?.growth?.users),
    ...growthHeat(analytics?.growth?.rides),
    ...growthHeat(analytics?.growth?.bookings)
  ];

  return `
    ${heading(
      "PLATFORM OVERVIEW",
      "CampusPool at a glance",
      "A live snapshot of people, rides, bookings and safety.",
      `<button class="btn" data-refresh>↻ Refresh</button>`
    )}

    <div class="grid g4">
      ${stat("Total users",u.total,"All registered accounts")}
      ${stat("Total rides",r.total,"All posted rides")}
      ${stat("Total bookings",b.total,"All reservations")}
      ${stat("Active SOS",sosTotal,"Emergency alerts requiring attention")}
    </div>

    <div class="charts">

      ${gauge(
        "Radial Gauge · Admin Capacity",
        cap.current,
        cap.maximum ?? 0,
        "admins",
        cap.maximum != null
          ? "Maximum administrator accounts"
          : "Admin capacity information unavailable"
      )}

      ${sankey(
        "Sankey Flow · Ride-to-Booking Journey",
        journey,
        "Aggregate platform status distribution"
      )}

      ${heatmap(
        "Activity Heatmap · Daily Platform Activity",
        activity
      )}

      ${treemap(
        "Treemap · User / Ride / Booking Status",
        [
          {label:"Active users",value:u.active},
          {label:"Suspended",value:u.suspended},
          {label:"Banned",value:u.banned},
          {label:"Open rides",value:r.open},
          {label:"Full rides",value:r.full},
          {label:"Cancelled rides",value:r.cancelled},
          {label:"Pending bookings",value:b.pending},
          {label:"Confirmed bookings",value:b.confirmed},
          {label:"Rejected bookings",value:b.rejected},
          {label:"Cancelled bookings",value:b.cancelled}
        ]
      )}

      ${circular(
        "Circular Chord-style · Booking Outcomes",
        [
          {label:"Confirmed",value:b.confirmed},
          {label:"Pending",value:b.pending},
          {label:"Rejected",value:b.rejected},
          {label:"Cancelled",value:b.cancelled}
        ],
        true
      )}

    </div>

    <div class="grid g3" style="margin-top:14px">

      ${panel("Users","Account status",`
        <div class="mini-list">
          ${["active","suspended","banned"].map(key => `
            <div class="mini-row">
              <span>${esc(key)}</span>
              <b>${n(u[key])}</b>
            </div>
          `).join("")}
        </div>
      `)}

      ${panel("Rides","Ride status",`
        <div class="mini-list">
          ${["open","full","cancelled","expired"].map(key => `
            <div class="mini-row">
              <span>${esc(key)}</span>
              <b>${n(r[key])}</b>
            </div>
          `).join("")}
        </div>
      `)}

      ${panel("Bookings","Booking status",`
        <div class="mini-list">
          ${["pending","confirmed","rejected","cancelled"].map(key => `
            <div class="mini-row">
              <span>${esc(key)}</span>
              <b>${n(b[key])}</b>
            </div>
          `).join("")}
        </div>
      `)}

    </div>

    <div class="muted" style="margin-top:12px">
      Daily statistics:
      Users ${n(daily.users)}
      · Rides ${n(daily.rides)}
      · Bookings ${n(daily.bookings)}
    </div>
  `;
}

/* =========================================================
   USER MANAGEMENT
========================================================= */

function renderUsers() {
  const cap = overview.admin_capacity || {
    current: null,
    maximum: null
  };

  const rows = users.map(user => {
    const id = Number(val(user,"id","user_id"));
    const self = id === me();
    const admin = user.role === "admin";
    const status = val(user,"account_status","status");

    const capacityFull =
      cap.current != null &&
      cap.maximum != null &&
      Number(cap.current) >= Number(cap.maximum);

    return `
      <tr>

        <td>
          <strong>${esc(val(user,"name","full_name","user_name"))}</strong>
          <small>${esc(val(user,"email","student_id"))}</small>
        </td>

        <td>${esc(val(user,"student_id"))}</td>
        <td>${esc(val(user,"department"))}</td>
        <td>${badge(user.role)}</td>
        <td>${badge(status)}</td>
        <td>${date(user.created_at)}</td>

        <td>
          <div class="actions">

            <button class="btn"
              data-role="${id}"
              data-value="${admin ? "student" : "admin"}"
              ${self || (!admin && capacityFull) ? "disabled" : ""}>
              ${admin ? "Make Student" : "Make Admin"}
            </button>

            <button class="btn"
              data-user-status="${id}"
              data-value="${status==="active"?"suspended":"active"}"
              ${self ? "disabled" : ""}>
              ${status==="active"?"Suspend":"Activate"}
            </button>

            <button class="btn danger"
              data-user-status="${id}"
              data-value="banned"
              ${self || status==="banned" ? "disabled" : ""}>
              Ban
            </button>

          </div>
        </td>

      </tr>
    `;
  }).join("");

  const growth = analytics?.growth?.users || [];

  const currentAdmins = users.filter(user => user.role==="admin").length;
  const currentStudents = users.filter(user => user.role!=="admin").length;

  return `
    ${heading(
      "PEOPLE & PERMISSIONS",
      "User Management",
      "Accounts, access levels and registration patterns.",
      `<span class="pill green">${
        cap.current != null && cap.maximum != null
          ? `${n(cap.current)} / ${n(cap.maximum)} ADMINS`
          : "CAPACITY UNAVAILABLE"
      }</span>`
    )}

    <div class="charts">

      ${gauge(
        "Radial Gauge · Admin Capacity",
        cap.current,
        cap.maximum ?? 0,
        "admins",
        cap.maximum != null
          ? "Maximum administrator accounts"
          : "Admin capacity information unavailable"
      )}

      ${treemap(
        "Treemap · User Status",
        [
          {label:"Active",value:overview.users?.active},
          {label:"Suspended",value:overview.users?.suspended},
          {label:"Banned",value:overview.users?.banned}
        ]
      )}

      ${heatmap(
        "Activity Heatmap · Registration Activity",
        growthHeat(growth)
      )}

      ${circular(
        "Circular Visualization · Role Distribution",
        [
          {label:"Admins on this page",value:currentAdmins},
          {label:"Students on this page",value:currentStudents}
        ]
      )}

      ${sankey(
        "Sankey Flow · Student to Admin Role Distribution",
        [
          {label:"Students on this page",value:currentStudents},
          {label:"Admins on this page",value:currentAdmins}
        ],
        "Role distribution on the current page"
      )}

    </div>

    <section class="panel" style="margin-top:14px">

      <div class="toolbar">

        <input id="uq"
          placeholder="Search name, ID or department"
          value="${esc(filters.users.q)}">

        <select id="ur">
          <option value="">All roles</option>
          <option value="student" ${filters.users.role==="student"?"selected":""}>Student</option>
          <option value="admin" ${filters.users.role==="admin"?"selected":""}>Admin</option>
        </select>

        <select id="us">
          <option value="">All statuses</option>
          ${["active","suspended","banned"].map(value => `
            <option value="${value}" ${filters.users.status===value?"selected":""}>
              ${value}
            </option>
          `).join("")}
        </select>

        <button class="btn primary" data-search="users">Search</button>
        <button class="btn" data-reset="users">Reset</button>

      </div>

      ${table(
        ["User","Student ID","Department","Role","Status","Joined","Actions"],
        rows,
        7
      )}

      ${paginationHtml("users","users")}

    </section>
  `;
}

/* =========================================================
   RIDE MANAGEMENT
========================================================= */

function renderRides() {
  const rows = rides.map(ride => {
    const id = Number(val(ride,"id","ride_id"));
    const status = ride.status;

    return `
      <tr>

        <td>
          <strong>${esc(val(ride,"driver_name","owner_name","name"))}</strong>
          <small>${esc(val(ride,"driver_student_id","owner_student_id"))}</small>
        </td>

        <td>
          ${esc(val(ride,"from_location","from"))}
          → ${esc(val(ride,"to_location","to"))}
        </td>

        <td>${date(val(ride,"departure_at","ride_date"))}</td>
        <td>${esc(val(ride,"vehicle","vehicle_type"))}</td>
        <td>${n(val(ride,"seats_total","total_seats"))}</td>
        <td>${n(val(ride,"booking_count","total_bookings"))}</td>
        <td>${badge(status)}</td>

        <td>
          ${
            ["open","full"].includes(status)
              ? `<button class="btn danger" data-ride="${id}" data-value="cancelled">Cancel</button>`
              : status==="cancelled"
                ? `<button class="btn" data-ride="${id}" data-value="open">Reopen</button>`
                : "—"
          }
        </td>

      </tr>
    `;
  }).join("");

  return `
    ${heading(
      "TRANSPORT OPERATIONS",
      "Ride Management",
      "Review routes, schedules and ride status."
    )}

    <section class="panel">

      <div class="toolbar">

        <input id="rq"
          placeholder="Search route or driver"
          value="${esc(filters.rides.q)}">

        <select id="rs">
          <option value="">All statuses</option>
          ${["open","full","cancelled","expired"].map(value => `
            <option value="${value}" ${filters.rides.status===value?"selected":""}>
              ${value}
            </option>
          `).join("")}
        </select>

        <button class="btn primary" data-search="rides">Search</button>
        <button class="btn" data-reset="rides">Reset</button>

      </div>

      ${table(
        ["Driver","Route","Departure","Vehicle","Seats","Bookings","Status","Actions"],
        rows,
        8
      )}

      ${paginationHtml("rides","rides")}

    </section>
  `;
}

/* =========================================================
   BOOKING MANAGEMENT
========================================================= */

function renderBookings() {
  const b = overview.bookings || {};

  const outcomes = [
    {label:"Confirmed",value:b.confirmed},
    {label:"Pending",value:b.pending},
    {label:"Rejected",value:b.rejected},
    {label:"Cancelled",value:b.cancelled}
  ];

  const rows = bookings.map(item => {
    const id = Number(val(item,"id","booking_id"));
    const status = item.status;

    return `
      <tr>

        <td><strong>#${n(id)}</strong></td>

        <td>
          ${esc(val(item,"passenger_name","user_name"))}
          <small>${esc(val(item,"passenger_student_id"))}</small>
        </td>

        <td>${esc(val(item,"driver_name"))}</td>

        <td>
          ${esc(val(item,"from_location","from"))}
          → ${esc(val(item,"to_location","to"))}
        </td>

        <td>${n(item.seats)}</td>
        <td>${badge(status)}</td>
        <td>${date(item.created_at)}</td>

        <td>
          <div class="actions">

            ${
              status==="pending"
                ? `
                  <button class="btn" data-booking="${id}" data-value="confirmed">Confirm</button>
                  <button class="btn danger" data-booking="${id}" data-value="rejected">Reject</button>
                `
                : ""
            }

            ${
              ["pending","confirmed"].includes(status)
                ? `<button class="btn danger" data-booking="${id}" data-value="cancelled">Cancel</button>`
                : "—"
            }

          </div>
        </td>

      </tr>
    `;
  }).join("");

  const growth = analytics?.growth?.bookings || [];

  const confirmRate = Number(b.total)
    ? Number(b.confirmed||0)/Number(b.total)*100
    : 0;

  return `
    ${heading(
      "RESERVATION OPERATIONS",
      "Booking Management",
      "Understand booking outcomes and manage reservations."
    )}

    <div class="charts">

      ${sankey(
        "Sankey Flow · Booking Outcomes",
        outcomes,
        "Booking status distribution"
      )}

      ${gauge(
        "Radial Gauge · Confirmation Rate",
        confirmRate,
        100,
        "%",
        "Confirmed bookings / all bookings"
      )}

      ${heatmap(
        "Activity Heatmap · Booking Activity",
        growthHeat(growth)
      )}

      ${treemap(
        "Treemap · Booking Status Distribution",
        outcomes
      )}

      ${circular(
        "Circular Chord-style · Booking Outcome Relationship",
        outcomes,
        true
      )}

    </div>

    <section class="panel" style="margin-top:14px">

      <div class="toolbar">

        <input id="bq"
          placeholder="Search passenger, driver or route"
          value="${esc(filters.bookings.q)}">

        <select id="bs">
          <option value="">All statuses</option>
          ${["pending","confirmed","rejected","cancelled"].map(value => `
            <option value="${value}" ${filters.bookings.status===value?"selected":""}>
              ${value}
            </option>
          `).join("")}
        </select>

        <button class="btn primary" data-search="bookings">Search</button>
        <button class="btn" data-reset="bookings">Reset</button>

      </div>

      ${table(
        ["Booking","Passenger","Driver","Route","Seats","Status","Created","Actions"],
        rows,
        8
      )}

      ${paginationHtml("bookings","bookings")}

    </section>
  `;
}

/* =========================================================
   SAFETY CENTER
========================================================= */

function renderSafety() {
  const active = alerts.filter(item => item.status==="active").length;

  const rows = alerts.map(item => {

    const independent =
      item.alert_type === "independent" ||
      item.type === "independent" ||
      item.source === "independent";

    const id = Number(val(item,"id","sos_id"));

    return `
      <tr>

        <td>#${n(id)}</td>

        <td>
          <strong>${esc(val(
            item,
            "sender_name",
            "triggered_by_name",
            "passenger_name"
          ))}</strong>

          <small>${independent?"Independent SOS":"Booking SOS"}</small>
        </td>

        <td>${esc(item.message || "Emergency alert")}</td>

        <td>
          ${esc(item.latitude ?? "—")},
          ${esc(item.longitude ?? "—")}
        </td>

        <td>${date(item.created_at)}</td>
        <td>${badge(item.status)}</td>

        <td>
          ${
            item.status==="active"
              ? `<button class="btn danger"
                  data-resolve="${id}"
                  data-independent="${independent?"1":"0"}">
                  Resolve
                </button>`
              : "—"
          }
        </td>

      </tr>
    `;
  }).join("");

  return `
    ${heading(
      "EMERGENCY RESPONSE",
      "Safety Center",
      "Monitor active incidents and close resolved alerts."
    )}

    <div class="sos-banner">
      ⚑ ${n(active)} ACTIVE SOS ALERTS —
      verify the incident before resolving.
    </div>

    <section class="panel">

      <div class="toolbar">
        ${["active","resolved",""].map(value => `
          <button class="btn ${filters.sos===value?"primary":""}"
            data-sos-filter="${value}">
            ${value||"all"} alerts
          </button>
        `).join("")}
      </div>

      ${table(
        ["ID","Sender","Message","Coordinates","Created","Status","Action"],
        rows,
        7
      )}

    </section>
  `;
}

/* =========================================================
   PASSWORD RESETS
========================================================= */

function renderPasswordResets() {
  const rows = resetRequests.map(req => `
    <tr>
      <td>
        <strong>${esc(req.name || "Unknown")}</strong>
        <small>${esc(req.student_id || "—")}</small>
      </td>
      <td>${esc(req.department || "—")}</td>
      <td>${date(req.created_at)}</td>
      <td>
        <button class="btn primary" data-reset-password="${req.id}">Reset Password</button>
      </td>
    </tr>
  `).join("");

  return `
    ${heading(
      "SECURITY & ACCESS",
      "Password Reset Requests",
      "Users who requested a password reset. Resetting will generate a new temporary password.",
      `<button class="btn" data-refresh>↻ Refresh</button>`
    )}

    <section class="panel">
      ${table(
        ["User", "Department", "Requested On", "Action"],
        rows,
        4
      )}
    </section>
  `;
}

/* =========================================================
   ACTIVITY LOGS
========================================================= */

function renderLogs() {
  const counts = {};

  logs.forEach(item => {
    const key = String(item.action || "Other");
    counts[key] = (counts[key]||0)+1;
  });

  const items = Object.entries(counts).map(
    ([label,value]) => ({label,value})
  );

  const rows = logs.map(item => `
    <tr>

      <td>
        <strong>${esc(item.action||"Admin action")}</strong>
        <small>${esc(item.details||"")}</small>
      </td>

      <td>
        ${esc(item.actor_name||"Unknown")}
        <small>${esc(item.actor_student_id||"—")}</small>
      </td>

      <td>
        ${esc(item.target_name||"—")}
        <small>${esc(item.target_student_id||"")}</small>
      </td>

      <td>${date(item.created_at)}</td>

    </tr>
  `).join("");

  const activeDays = logs.map(item => ({
    date:String(item.created_at||"").slice(0,10),
    count:1
  }));

  return `
    ${heading(
      "AUDIT & TRANSPARENCY",
      "Activity Logs",
      "Trace administrative actions across CampusPool.",
      `<button class="btn" data-refresh>↻ Refresh</button>`
    )}

    <div class="charts">

      ${heatmap(
        "Activity Heatmap · Admin Activity by Date",
        activeDays
      )}

      ${sankey(
        "Sankey Flow · Admin Action Flow",
        items,
        "Action categories recorded in the current log feed"
      )}

      ${treemap(
        "Treemap · Action Category Distribution",
        items
      )}

      ${gauge(
        "Radial Gauge · Activity Summary",
        logs.length,
        30,
        "logs",
        "Latest activity records loaded"
      )}

      ${circular(
        "Circular Visualization · Admin Action Distribution",
        items
      )}

    </div>

    <section class="panel" style="margin-top:14px">
      ${table(["Action","Admin","Target","Time"],rows,4)}
    </section>
  `;
}

/* =========================================================
   CONTENT ROUTER
========================================================= */

function content(tab) {
  if (tab==="overview") return renderOverview();
  if (tab==="users") return renderUsers();
  if (tab==="rides") return renderRides();
  if (tab==="bookings") return renderBookings();
  if (tab==="safety") return renderSafety();
  if (tab==="resets") return renderPasswordResets();
  return renderLogs();
}

function mount(tab, body) {
  const root = $("#view-root");

  if (root && isHere(tab)) {
    root.innerHTML = layout(tab,body);
  }
}

/* =========================================================
   API HELPERS
========================================================= */

async function get(path) {
  return unwrap(await apiFetch(path));
}

async function patch(path, body) {
  return unwrap(await apiFetch(path,{
    method:"PATCH",
    ...(body===undefined
      ? {}
      : {body:JSON.stringify(body)})
  }));
}

function queryFor(type) {
  const page = pages[type];
  const filter = filters[type];

  const query = new URLSearchParams({
    page:String(page.page),
    limit:String(page.limit)
  });

  if (filter.q) query.set("q",filter.q);
  if (filter.role) query.set("role",filter.role);
  if (filter.status) query.set("status",filter.status);

  return query.toString();
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadTab(tab) {
  const sequence = ++requestSeq;
  const root = $("#view-root");

  if (root && isHere(tab)) {
    root.innerHTML = layout(
      tab,
      `<div class="loading">Loading ${esc(tab)}…</div>`
    );
  }

  try {

    if (tab==="overview") {
      overview = await get("/admin/overview");

      try {
        analytics = await get("/admin/analytics");
      } catch (error) {
        analytics = null;
        console.warn("Admin analytics unavailable:",error);
      }
    }

    else if (tab==="users") {
      const [overviewResult,result] = await Promise.all([
        get("/admin/overview"),
        get(`/admin/users?${queryFor("users")}`)
      ]);

      overview = overviewResult || {};
      users = Array.isArray(result.users) ? result.users : [];

      syncPage("users",result.pagination||{});

      if (result.admin_capacity) {
        overview.admin_capacity = result.admin_capacity;
      }

      try {
        analytics = await get("/admin/analytics");
      } catch {
        analytics = null;
      }
    }

    else if (tab==="rides") {
      const result = await get(`/admin/rides?${queryFor("rides")}`);

      rides = Array.isArray(result.rides) ? result.rides : [];

      syncPage("rides",result.pagination||{});
    }

    else if (tab==="bookings") {
      const [overviewResult,result] = await Promise.all([
        get("/admin/overview"),
        get(`/admin/bookings?${queryFor("bookings")}`)
      ]);

      overview = overviewResult || {};
      bookings = Array.isArray(result.bookings) ? result.bookings : [];

      syncPage("bookings",result.pagination||{});

      try {
        analytics = await get("/admin/analytics");
      } catch {
        analytics = null;
      }
    }

    else if (tab==="safety") {
      const query = new URLSearchParams();

      if (filters.sos) {
        query.set("status",filters.sos);
      }

      const result = await get(`/admin/sos?${query}`);

      alerts = Array.isArray(result.alerts) ? result.alerts : [];
    }

    else if (tab==="resets") {
      const result = await get("/admin/password-reset-requests");
      resetRequests = Array.isArray(result.requests) ? result.requests : [];
    }

    else if (tab==="logs") {
      const result = await get("/admin/activity-logs?limit=30");

      logs = Array.isArray(result.logs) ? result.logs : [];
    }

    if (sequence!==requestSeq || !isHere(tab)) return;

    mount(tab,content(tab));

  } catch (error) {

    if (sequence!==requestSeq || !isHere(tab)) return;

    mount(tab,`
      ${heading(
        "SYSTEM MESSAGE",
        "Unable to load this section",
        error.message||"Please try again."
      )}

      <button class="btn primary" data-refresh>Try again</button>
    `);

    notify(error.message||"Could not load admin data.");
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function go(tab) {
  if (!TABS.some(item => item[0]===tab)) return;

  state.currentAdminTab = tab;

  if ($("#view-root") && state.currentView==="admin") {
    loadTab(tab);
    return;
  }

  const sidebarButton = document.querySelector(
    `[data-view="admin"][data-admin-tab="${tab}"]`
  );

  sidebarButton?.click();
}

/* =========================================================
   FILTERS
========================================================= */

function updateFilters(type) {
  if (type==="users") {
    filters.users = {
      q:$("#uq")?.value.trim()||"",
      role:$("#ur")?.value||"",
      status:$("#us")?.value||""
    };
  }

  if (type==="rides") {
    filters.rides = {
      q:$("#rq")?.value.trim()||"",
      status:$("#rs")?.value||""
    };
  }

  if (type==="bookings") {
    filters.bookings = {
      q:$("#bq")?.value.trim()||"",
      status:$("#bs")?.value||""
    };
  }

  pages[type].page = 1;
}

/* =========================================================
   MUTATIONS
========================================================= */

async function mutate(path,body,success,tab) {
  try {
    const result = await patch(path,body);

    notify(result.message||success);

    await loadTab(tab);

  } catch (error) {
    notify(error.message||"Action failed.");
  }
}

/* =========================================================
   CLICK EVENTS
========================================================= */

document.addEventListener("click",async event => {
  const target = event.target instanceof Element
    ? event.target
    : null;

  if (!target) return;

  const nav = target.closest("[data-cp-tab]");

  if (nav) {
    go(nav.dataset.cpTab);
    return;
  }

  if (target.closest("[data-refresh]")) {
    loadTab(tabNow());
    return;
  }

  const search = target.closest("[data-search]");

  if (search) {
    const type = search.dataset.search;

    updateFilters(type);
    loadTab(type);

    return;
  }

  const reset = target.closest("[data-reset]");

  if (reset) {
    const type = reset.dataset.reset;

    filters[type] = type==="users"
      ? {q:"",role:"",status:""}
      : {q:"",status:""};

    pages[type].page = 1;

    loadTab(type);

    return;
  }

  const page = target.closest("[data-page]");

  if (page) {
    const [type,pageNumber] = page.dataset.page.split(":");

    if (pages[type]) {
      const next = Number(pageNumber);
      const max = Math.max(1,pages[type].pages);

      if (next>=1 && next<=max) {
        pages[type].page = next;
        loadTab(type);
      }
    }

    return;
  }

  const role = target.closest("[data-role]");

  if (role) {
    const id = Number(role.dataset.role);
    const value = role.dataset.value;

    if (!id || id===me()) return;

    if (!confirm(`এই ব্যবহারকারীর role ${value} করতে চাও?`)) return;

    await mutate(
      `/admin/users/${id}/role`,
      {role:value},
      "User role updated.",
      "users"
    );

    return;
  }

  const userStatus = target.closest("[data-user-status]");

  if (userStatus) {
    const id = Number(userStatus.dataset.userStatus);
    const value = userStatus.dataset.value;

    if (!id || id===me()) return;

    if (!confirm(`এই account-এর status ${value} করতে চাও?`)) return;

    await mutate(
      `/admin/users/${id}/status`,
      {status:value},
      "Account status updated.",
      "users"
    );

    return;
  }

  const ride = target.closest("[data-ride]");

  if (ride) {
    const id = Number(ride.dataset.ride);
    const value = ride.dataset.value;

    if (!id) return;

    if (!confirm(`Ride ${value} করতে চাও?`)) return;

    await mutate(
      `/admin/rides/${id}/status`,
      {status:value},
      "Ride status updated.",
      "rides"
    );

    return;
  }

  const booking = target.closest("[data-booking]");

  if (booking) {
    const id = Number(booking.dataset.booking);
    const value = booking.dataset.value;

    if (!id) return;

    if (!confirm(`Booking ${value} করতে চাও?`)) return;

    await mutate(
      `/admin/bookings/${id}/status`,
      {status:value},
      "Booking status updated.",
      "bookings"
    );

    return;
  }

  const resolve = target.closest("[data-resolve]");

  if (resolve) {
    const id = Number(resolve.dataset.resolve);
    const independent = resolve.dataset.independent==="1";

    if (!id) return;

    if (!confirm("এই SOS alert resolve করতে চাও?")) return;

    await mutate(
      independent
        ? `/admin/independent-sos/${id}/resolve`
        : `/admin/sos/${id}/resolve`,
      undefined,
      "SOS resolved.",
      "safety"
    );

    return;
  }

  const sosFilter = target.closest("[data-sos-filter]");

  if (sosFilter) {
    filters.sos = sosFilter.dataset.sosFilter;

    loadTab("safety");
  }

  const resetPassword = target.closest("[data-reset-password]");

  if (resetPassword) {
    const requestId = Number(resetPassword.dataset.resetPassword);
    if (!requestId) return;

    if (!confirm("Reset this user's password? A new temporary password will be generated.")) return;

    try {
      const result = await patch(`/admin/reset-password/${requestId}`);
      notify(`Password reset! New password: ${result.newPassword}`);
      await loadTab("resets");
    } catch (error) {
      notify(error.message || "Could not reset password.");
    }

    return;
  }
});

/* =========================================================
   PUBLIC RENDER FUNCTION
========================================================= */

export function renderAdmin() {
  styles();

  const tab = tabNow();

  Promise.resolve().then(() => loadTab(tab));

  return layout(
    tab,
    `<div class="loading">Preparing CampusPool Admin…</div>`
  );
}
