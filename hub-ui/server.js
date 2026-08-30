// Lazybutts Hub dashboard backend. Zero dependencies.
//
// Serves the static frontend plus two JSON endpoints:
//   /api/stats      — host stats (CPU, memory, disk, uptime, network) with
//                     60-sample history for sparklines; sampled every 5s.
//   /api/containers — docker state + one-shot stats for the containers named
//                     in config.json, via the read-only docker socket.
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync, promises as fs } from 'node:fs';
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG = JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT || 8090);
const DOCKER_SOCK = process.env.DOCKER_SOCK || '/var/run/docker.sock';
const HISTORY_LEN = 60;
const SAMPLE_MS = 5000;
const BOOT_VERSION = String(Date.now());

// ---------- host stats sampling ----------

const history = { cpu: [], net: [] };
let prevCpu = null;
let prevNet = null;
let latest = null;

function readProc(file) {
  return readFileSync(`/proc/${file}`, 'utf8');
}

function cpuTimes() {
  const parts = readProc('stat').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + parts[4];
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function netBytes() {
  // Sum all non-loopback interfaces.
  let rx = 0;
  let tx = 0;
  for (const line of readProc('net/dev').split('\n').slice(2)) {
    const m = line.trim().split(/[:\s]+/);
    if (m.length < 10 || m[0] === 'lo') continue;
    rx += Number(m[1]);
    tx += Number(m[9]);
  }
  return { rx, tx };
}

async function sample() {
  try {
    const cpu = cpuTimes();
    let cpuPct = 0;
    if (prevCpu) {
      const dTotal = cpu.total - prevCpu.total;
      const dIdle = cpu.idle - prevCpu.idle;
      cpuPct = dTotal > 0 ? Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100)) : 0;
    }
    prevCpu = cpu;

    const net = netBytes();
    let rxRate = 0;
    let txRate = 0;
    if (prevNet) {
      rxRate = Math.max(0, (net.rx - prevNet.rx) / (SAMPLE_MS / 1000));
      txRate = Math.max(0, (net.tx - prevNet.tx) / (SAMPLE_MS / 1000));
    }
    prevNet = net;

    const mem = {};
    for (const line of readProc('meminfo').split('\n')) {
      const m = line.match(/^(\w+):\s+(\d+) kB/);
      if (m) mem[m[1]] = Number(m[2]) * 1024;
    }

    const loadavg = Number(readProc('loadavg').split(' ')[0]);
    const uptimeSec = Number(readProc('uptime').split(' ')[0]);
    const fsStat = await statfs('/');

    latest = {
      time: Date.now(),
      cpu: { pct: cpuPct, load: loadavg },
      memory: { total: mem.MemTotal || 0, used: (mem.MemTotal || 0) - (mem.MemAvailable || 0) },
      disk: {
        total: fsStat.blocks * fsStat.bsize,
        free: fsStat.bavail * fsStat.bsize,
      },
      uptime: uptimeSec,
      net: { rx: rxRate, tx: txRate },
    };

    history.cpu.push(cpuPct);
    history.net.push(rxRate + txRate);
    if (history.cpu.length > HISTORY_LEN) history.cpu.shift();
    if (history.net.length > HISTORY_LEN) history.net.shift();
  } catch (err) {
    console.error('sample failed:', err.message);
  }
}

sample();
setInterval(sample, SAMPLE_MS);

// ---------- docker ----------

function dockerCall(apiPath, method = 'GET', timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { socketPath: DOCKER_SOCK, path: apiPath, method },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`docker ${apiPath} -> ${res.statusCode}`));
            return;
          }
          if (!body) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('docker timeout')));
    req.end();
  });
}

const dockerGet = (apiPath) => dockerCall(apiPath, 'GET');

function containerCpuPct(stats) {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const sysDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats.system_cpu_usage || 0);
  const ncpu = stats.cpu_stats.online_cpus || 1;
  if (cpuDelta > 0 && sysDelta > 0) return (cpuDelta / sysDelta) * ncpu * 100;
  return 0;
}

async function containerInfo() {
  const wanted = new Set(
    [...CONFIG.apps, ...CONFIG.ops].map((s) => s.container).filter(Boolean),
  );
  const list = await dockerGet('/v1.44/containers/json?all=1');
  const byName = new Map();
  for (const c of list) {
    const name = (c.Names?.[0] || '').replace(/^\//, '');
    if (wanted.has(name)) byName.set(name, c);
  }

  const out = {};
  await Promise.all(
    [...wanted].map(async (name) => {
      const c = byName.get(name);
      if (!c) {
        out[name] = { state: 'missing' };
        return;
      }
      const entry = { state: c.State, status: c.Status };
      if (c.State === 'running') {
        try {
          const s = await dockerGet(`/v1.44/containers/${c.Id}/stats?stream=false&one-shot=false`);
          entry.cpuPct = containerCpuPct(s);
          entry.mem = s.memory_stats?.usage || 0;
          const nets = s.networks || {};
          entry.rx = Object.values(nets).reduce((a, n) => a + (n.rx_bytes || 0), 0);
          entry.tx = Object.values(nets).reduce((a, n) => a + (n.tx_bytes || 0), 0);
        } catch {
          /* stats are best-effort */
        }
      }
      out[name] = entry;
    }),
  );

  await Promise.all(
    [...CONFIG.apps, ...CONFIG.ops]
      .filter((s) => !s.container && s.health)
      .map(async (s) => {
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 3000);
          const r = await fetch(s.health, { signal: ctl.signal });
          clearTimeout(t);
          out[s.name] = { state: r.ok ? 'running' : 'exited' };
        } catch {
          out[s.name] = { state: 'exited' };
        }
      }),
  );

  return out;
}

// ---------- http ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/stats') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ...latest, history }));
      return;
    }
    if (url.pathname === '/api/containers') {
      const containers = await containerInfo();
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(containers));
      return;
    }
    if (url.pathname.startsWith('/api/restart/') && req.method === 'POST') {
      const name = decodeURIComponent(url.pathname.slice('/api/restart/'.length));
      // Only containers this dashboard manages — never arbitrary names.
      const known = [...CONFIG.apps, ...CONFIG.ops].some((s) => s.container === name);
      if (!known) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unknown_container' }));
        return;
      }
      await dockerCall(`/v1.44/containers/${encodeURIComponent(name)}/restart?t=5`, 'POST', 30000);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === '/api/config') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(CONFIG));
      return;
    }

    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const abs = path.join(PUBLIC_DIR, filePath);
    if (!abs.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end();
      return;
    }
    let data = await fs.readFile(abs);
    const headers = { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' };
    if (abs.endsWith('index.html')) {
      // Per-deploy asset version so Cloudflare's edge cache can never serve a
      // stale app.js/style.css: URLs change on every container start, and the
      // HTML itself is never cached.
      data = data.toString().replaceAll('__V__', BOOT_VERSION);
      headers['cache-control'] = 'no-store';
    } else {
      headers['cache-control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    } else {
      console.error(err);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`hub-ui listening on :${PORT}`);
});
