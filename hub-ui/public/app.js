/* Lazybutts Hub dashboard frontend. Vanilla JS, no deps. */

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  apps: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  ops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/><path d="M12 15h5"/></svg>',
  dev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 6-6 6 6 6"/><path d="m16 6 6 6-6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.82-.33 1.6 1.6 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1-1.51 1.6 1.6 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .33-1.82 1.6 1.6 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.6 1.6 0 0 0 1.51-1 1.6 1.6 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.82.33h0a1.6 1.6 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 1 1.51h0a1.6 1.6 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.33 1.82v0a1.6 1.6 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.51 1Z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>',
  ram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11v2M10 11v2M14 11v2M18 11v2M4 17v3M8 17v3M12 17v3M16 17v3M20 17v3"/></svg>',
  disk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="16.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M3 12h9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  net: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4-8 3 14 3-10 4 4"/></svg>',
  waveform: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 8v8"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 8h7M9 11h5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m6 15 4-5 3 3 5-7"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.7 1.4 5 3.6 6.6V22l3.5-2c.9.2 1.9.4 2.9.4 5.5 0 10-3.9 10-8.7S17.5 3 12 3Z"/></svg>',
  logs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>',
  fork: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3"/><path d="M12 12v9"/><circle cx="6" cy="3" r="1.5" fill="currentColor"/><circle cx="18" cy="3" r="1.5" fill="currentColor"/><circle cx="12" cy="21" r="1.5" fill="currentColor"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 18a5 5 0 0 1-.9-9.9A7 7 0 0 1 19.8 10 4.5 4.5 0 0 1 18.5 18H7Z"/></svg>',
  sleep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h6L4 11h6"/><path d="M13 9h5l-5 5h5"/><path d="M16 16h4l-4 4h4" opacity="0.7"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.9-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1a3.6 3.6 0 0 1 .1 2.7 3.9 3.9 0 0 1 1 2.7c0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>',
  package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Z"/><path d="M12 22v-9.5"/><path d="m4 6.5 8 6 8-6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v4h-4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5-13-7.5Z"/></svg>',
};

const STAT_TINTS = { cpu: 'tint-blue', ram: 'tint-green', disk: 'tint-purple', clock: 'tint-slate', net: 'tint-teal' };

function el(id) { return document.getElementById(id); }

function fmtBytes(n, dp = 1) {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : dp)} ${units[i]}`;
}

function fmtRate(n) { return `${fmtBytes(n, 1)}/s`; }

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

function sparkline(values, color) {
  if (!values || values.length < 2) return '';
  const w = 160;
  const h = 34;
  const max = Math.max(...values, 1e-9);
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - (v / max) * (h - 8)).toFixed(1)}`)
    .join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function statCard({ icon, label, valueHTML, bodyHTML }) {
  return `<div class="stat">
    <div class="stat-top">
      <span class="stat-icon ${STAT_TINTS[icon]}">${ICONS[icon]}</span>
      <div><div class="stat-label">${label}</div><div class="stat-value">${valueHTML}</div></div>
    </div>
    ${bodyHTML}
  </div>`;
}

function renderStats(s) {
  if (!s || !s.cpu) return;
  const memPct = s.memory.total ? (s.memory.used / s.memory.total) * 100 : 0;
  const diskUsed = s.disk.total - s.disk.free;
  const diskPct = s.disk.total ? (diskUsed / s.disk.total) * 100 : 0;
  const since = new Date(Date.now() - s.uptime * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  el('stats-row').innerHTML = [
    statCard({
      icon: 'cpu',
      label: 'CPU Load',
      valueHTML: `${s.cpu.pct.toFixed(0)}%`,
      bodyHTML: `<div class="stat-spark">${sparkline(s.history.cpu, 'var(--tint-blue-fg)')}</div>`,
    }),
    statCard({
      icon: 'ram',
      label: 'Memory',
      valueHTML: `${fmtBytes(s.memory.used)} <small>/ ${fmtBytes(s.memory.total)}</small>`,
      bodyHTML: `<div class="meter-pct" style="color:var(--tint-green-fg)">${memPct.toFixed(0)}%</div>
        <div class="meter"><div class="meter-fill" style="width:${memPct}%;background:var(--tint-green-fg)"></div></div>`,
    }),
    statCard({
      icon: 'disk',
      label: 'Storage',
      valueHTML: `${fmtBytes(s.disk.free)} <small>free / ${fmtBytes(s.disk.total)}</small>`,
      bodyHTML: `<div class="meter-pct" style="color:var(--tint-purple-fg)">${diskPct.toFixed(0)}%</div>
        <div class="meter"><div class="meter-fill" style="width:${diskPct}%;background:var(--tint-purple-fg)"></div></div>`,
    }),
    statCard({
      icon: 'clock',
      label: 'Uptime',
      valueHTML: fmtUptime(s.uptime),
      bodyHTML: `<div class="stat-sub">Since ${since}</div>`,
    }),
    statCard({
      icon: 'net',
      label: 'Network',
      valueHTML: `<small>↑ ${fmtRate(s.net.tx)}&nbsp;&nbsp;↓ ${fmtRate(s.net.rx)}</small>`,
      bodyHTML: `<div class="stat-spark">${sparkline(s.history.net, 'var(--tint-teal-fg)')}</div>`,
    }),
  ].join('');
}

function serviceCard(svc, info) {
  const running = info && info.state === 'running';
  const dot = `<span class="card-dot dot ${running ? 'dot--green' : 'dot--amber'}"></span>`;
  const action = svc.container
    ? `<button type="button" class="card-action" data-restart="${svc.container}" title="${running ? 'Restart' : 'Start'}">${running ? ICONS.restart : ICONS.play}</button>`
    : '';
  const head = `<div class="card-head">
      <span class="card-icon tint-${svc.tint}">${ICONS[svc.icon] || ''}</span>
      <div><div class="card-name">${svc.name}</div><div class="card-desc">${svc.desc}</div></div>
    </div>${dot}${action}`;

  let body = '';
  if (running && info.cpuPct !== undefined) {
    body = `<div class="card-stats">
      <div class="card-stat"><b>${info.cpuPct.toFixed(0)}%</b><span>CPU</span></div>
      <div class="card-stat"><b>${fmtBytes(info.mem, 0)}</b><span>MEM</span></div>
      <div class="card-stat"><b>${fmtBytes(info.rx, 0)}</b><span>RX</span></div>
      <div class="card-stat"><b>${fmtBytes(info.tx, 0)}</b><span>TX</span></div>
    </div>`;
  } else if (!running) {
    body = `<div class="card-offline"><b>Offline</b><span>STATUS</span></div>`;
  }

  const inner = head + body;
  return svc.href
    ? `<a class="card" href="${svc.href}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="card">${inner}</div>`;
}

let lastContainers = {};
let currentView = 'top';

const settings = {
  get showOffline() { try { return localStorage.getItem('hub.showOffline') === '1'; } catch { return false; } },
  set showOffline(v) { try { localStorage.setItem('hub.showOffline', v ? '1' : '0'); } catch {} },
  get refreshSec() { try { return Number(localStorage.getItem('hub.refresh')) || 5; } catch { return 5; } },
  set refreshSec(v) { try { localStorage.setItem('hub.refresh', String(v)); } catch {} },
};

// Home shows only what is awake (unless the setting says otherwise); the
// Apps/Ops views list everything.
function renderServices(containers) {
  lastContainers = containers;
  const onlineOnly = currentView === 'top' && !settings.showOffline;
  const filter = (list) =>
    onlineOnly ? list.filter((s) => containers[s.container]?.state === 'running') : list;

  const apps = filter(CONFIG.apps);
  const ops = filter(CONFIG.ops);
  el('apps-grid').innerHTML = apps.length
    ? apps.map((s) => serviceCard(s, containers[s.container])).join('')
    : '<p class="grid-empty">All apps are asleep — open one via its link to wake it.</p>';
  el('ops-grid').innerHTML = ops.length
    ? ops.map((s) => serviceCard(s, containers[s.container])).join('')
    : '<p class="grid-empty">Nothing running.</p>';

  const coreOk = CONFIG.ops.every((s) => containers[s.container]?.state === 'running')
    && containers[CONFIG.apps.find((a) => a.name === 'Chat')?.container]?.state === 'running';
  el('health').innerHTML = `<span class="dot ${coreOk ? 'dot--green' : 'dot--amber'}"></span><span>${coreOk ? 'Healthy' : 'Degraded'}</span>`;
}

const VIEW_SECTIONS = {
  top: ['hero', 'stats-row', 'apps', 'ops', 'dev'],
  apps: ['apps'],
  ops: ['ops'],
  dev: ['dev'],
};

function applyView(view) {
  currentView = view;
  for (const id of ['hero', 'stats-row', 'apps', 'ops', 'dev']) {
    el(id).style.display = VIEW_SECTIONS[view].includes(id) ? '' : 'none';
  }
  renderServices(lastContainers);
}

function renderDev() {
  el('dev-list').innerHTML = CONFIG.dev
    .map(
      (d) => `<a class="dev-row" href="${d.href}" target="_blank" rel="noopener">
        <span class="dev-icon">${ICONS[d.icon] || ''}</span>
        <span class="dev-name">${d.name}</span>
        <span class="dev-domain">${d.domain}</span>
        <span class="dev-ext">${ICONS.ext}</span>
      </a>`,
    )
    .join('');
}

function renderClock() {
  const now = new Date();
  el('date-label').textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  el('time-label').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const h = now.getHours();
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  el('hero-date').textContent = now
    .toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
  el('hero-greeting').textContent = `Good ${part}, Quyen.`;
}

function renderHeroSub(containers) {
  const total = CONFIG.apps.length;
  const awake = CONFIG.apps.filter((s) => containers[s.container]?.state === 'running').length;
  el('hero-sub').textContent =
    awake === total
      ? 'Your Mac mini is wide awake. Everything is within reach.'
      : `Your Mac mini is running quietly — ${awake}/${total} apps awake. Everything is within reach.`;
}

async function restartContainer(btn) {
  const name = btn.dataset.restart;
  btn.disabled = true;
  btn.classList.add('card-action--busy');
  btn.innerHTML = ICONS.restart;
  try {
    const r = await fetch(`/api/restart/${encodeURIComponent(name)}`, { method: 'POST' });
    if (!r.ok) throw new Error(`restart -> ${r.status}`);
  } catch (err) {
    console.error(err);
  } finally {
    await refresh();
  }
}

async function refresh() {
  try {
    const [stats, containers] = await Promise.all([
      fetch('/api/stats').then((r) => r.json()),
      fetch('/api/containers').then((r) => r.json()),
    ]);
    renderStats(stats);
    renderServices(containers);
    renderHeroSub(containers);
  } catch (err) {
    console.error('refresh failed', err);
  }
}

// ---------- boot ----------

let CONFIG = { apps: [], ops: [], dev: [], title: 'Hub', host: '' };

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  el('theme-label').textContent = theme === 'dark' ? 'Light' : 'Dark';
  try { localStorage.setItem('hub.theme', theme); } catch {}
}

async function boot() {
  document.querySelectorAll('[data-icon]').forEach((n) => { n.innerHTML = ICONS[n.dataset.icon] || ''; });

  let theme = 'light';
  try { theme = localStorage.getItem('hub.theme') || 'light'; } catch {}
  applyTheme(theme);

  el('theme-btn').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  el('hamburger').addEventListener('click', () => el('sidebar').classList.toggle('sidebar--open'));
  document.querySelectorAll('.nav-item[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item[data-nav]').forEach((n) => n.classList.remove('nav-item--active'));
      a.classList.add('nav-item--active');
      el('sidebar').classList.remove('sidebar--open');
      applyView(a.dataset.nav);
      window.scrollTo({ top: 0 });
    });
  });

  el('settings-btn').addEventListener('click', () => { syncSettingsUI(); el('settings-modal').hidden = false; });
  el('settings-close').addEventListener('click', () => { el('settings-modal').hidden = true; });
  el('settings-modal').addEventListener('click', (e) => { if (e.target === el('settings-modal')) el('settings-modal').hidden = true; });

  document.querySelectorAll('[data-theme-opt]').forEach((b) => {
    b.addEventListener('click', () => { applyTheme(b.dataset.themeOpt); syncSettingsUI(); });
  });
  document.querySelectorAll('[data-refresh]').forEach((b) => {
    b.addEventListener('click', () => { settings.refreshSec = Number(b.dataset.refresh); armRefresh(); syncSettingsUI(); });
  });
  el('opt-show-offline').addEventListener('change', (e) => {
    settings.showOffline = e.target.checked;
    renderServices(lastContainers);
  });

  // Restart buttons live inside <a class="card"> — swallow the navigation.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.card-action');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    restartContainer(btn);
  });

  CONFIG = await fetch('/api/config').then((r) => r.json());
  document.title = CONFIG.title;
  el('host-chip').textContent = CONFIG.host;
  renderDev();
  renderClock();
  setInterval(renderClock, 15000);
  await refresh();
  armRefresh();
}

let refreshTimer = null;
function armRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refresh, settings.refreshSec * 1000);
}

function syncSettingsUI() {
  const theme = document.documentElement.dataset.theme;
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.classList.toggle('seg--on', b.dataset.themeOpt === theme));
  document.querySelectorAll('[data-refresh]').forEach((b) => b.classList.toggle('seg--on', Number(b.dataset.refresh) === settings.refreshSec));
  el('opt-show-offline').checked = settings.showOffline;
}

boot();
