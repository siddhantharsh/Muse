// ============================================================
// Muse — LAN Sync Server
// Serves the frontend + REST API for phone/tablet access
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SYNC_PORT = 3456;
const DATA_DIR = path.join(os.homedir(), '.muse');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PIN_FILE = path.join(DATA_DIR, 'sync_pin.txt');

// MIME types for static serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.apk': 'application/vnd.android.package-archive',
};

let server = null;
let stateVersion = Date.now();
let activePort = SYNC_PORT;

// ---- PIN Authentication ----

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4-digit PIN
}

function readPin() {
  ensureDataDir();
  try {
    if (fs.existsSync(PIN_FILE)) {
      return fs.readFileSync(PIN_FILE, 'utf-8').trim();
    }
  } catch {}
  // Generate a new PIN if none exists
  const pin = generatePin();
  fs.writeFileSync(PIN_FILE, pin, 'utf-8');
  return pin;
}

function resetPin() {
  ensureDataDir();
  const pin = generatePin();
  fs.writeFileSync(PIN_FILE, pin, 'utf-8');
  return pin;
}

function checkAuth(req) {
  const pin = readPin();
  // Check Authorization header: "Bearer <pin>"
  const authHeader = req.headers['authorization'] || '';
  if (authHeader === `Bearer ${pin}`) return true;
  // Check query param: ?pin=<pin>
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.searchParams.get('pin') === pin) return true;
  } catch {}
  return false;
}

function sendUnauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Invalid PIN' }));
}

// ---- File-based persistence ----

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readSyncData() {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[Sync] Failed to read data file:', e.message);
  }
  return null;
}

function writeSyncData(data) {
  ensureDataDir();
  try {
    stateVersion = Date.now();
    const wrapped = { ...data, _version: stateVersion };
    fs.writeFileSync(DATA_FILE, JSON.stringify(wrapped), 'utf-8');
    return true;
  } catch (e) {
    console.error('[Sync] Failed to write data file:', e.message);
    return false;
  }
}

// ---- Get LAN IP addresses ----

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// ---- Static file server ----

function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ---- HTTP Server ----

function startSyncServer(distPath) {
  if (server) return;

  ensureDataDir();

  // Initialize version from existing data
  const existing = readSyncData();
  if (existing && existing._version) {
    stateVersion = existing._version;
  }

  server = http.createServer((req, res) => {
    // CORS headers for any origin on the same network
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // ---- Public routes (no auth needed) ----
    // Static files (HTML, CSS, JS, images) are served without auth
    // Only API data routes require PIN auth

    // PIN verification endpoint (public — lets phone check if PIN is correct)
    if (pathname === '/api/auth' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const { pin } = JSON.parse(body);
          const correctPin = readPin();
          if (pin === correctPin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Wrong PIN' }));
          }
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid request' }));
        }
      });
      return;
    }

    // ---- API Routes (require PIN auth) ----

    // All /api/* data routes require authentication
    if (pathname.startsWith('/api/') && pathname !== '/api/auth') {
      if (!checkAuth(req)) {
        sendUnauthorized(res);
        return;
      }
    }

    // GET /api/state — full state download
    if (pathname === '/api/state' && req.method === 'GET') {
      const data = readSyncData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data || { tasks: [], events: [], lists: [], settings: null, _version: 0 }));
      return;
    }

    // GET /api/version — just the version stamp
    if (pathname === '/api/version' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: stateVersion }));
      return;
    }

    // POST /api/state — push state from any client
    if (pathname === '/api/state' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const ok = writeSyncData(data);
          if (ok) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, version: stateVersion }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Write failed' }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // GET /download-app — serve the APK for easy phone install
    if (pathname === '/download-app' && req.method === 'GET') {
      const apkPath = path.join(DATA_DIR, 'Muse.apk');
      if (fs.existsSync(apkPath)) {
        const stat = fs.statSync(apkPath);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="Muse.apk"',
          'Content-Length': stat.size,
        });
        fs.createReadStream(apkPath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('APK not found. Place Muse.apk in ~/.muse/');
      }
      return;
    }

    // GET /api/info — server info for the UI
    if (pathname === '/api/info' && req.method === 'GET') {
      const addresses = getLanAddresses();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        port: SYNC_PORT,
        addresses: addresses,
        urls: addresses.map(a => `http://${a}:${SYNC_PORT}`),
      }));
      return;
    }

    // ---- Static file serving (for phone browser) ----

    // Serve manifest.json
    if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
      const manifestPath = path.join(distPath, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        serveStaticFile(res, manifestPath);
      } else {
        // Generate on the fly
        const manifest = {
          name: 'Muse',
          short_name: 'Muse',
          description: 'Autonomous Task Scheduler',
          start_url: '/',
          display: 'standalone',
          background_color: '#2E3440',
          theme_color: '#88C0D0',
          icons: [
            { src: '/icon-64.png', sizes: '64x64', type: 'image/png' },
            { src: '/icon-128.png', sizes: '128x128', type: 'image/png' },
            { src: '/icon-256.png', sizes: '256x256', type: 'image/png' },
          ],
        };
        res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
        res.end(JSON.stringify(manifest));
      }
      return;
    }

    // Map / to /index.html
    let filePath = pathname === '/' ? '/index.html' : pathname;
    // Security: prevent directory traversal
    filePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(distPath, filePath);

    // Try serving the file; if not found, serve index.html (SPA fallback)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      serveStaticFile(res, fullPath);
    } else {
      // SPA fallback
      serveStaticFile(res, path.join(distPath, 'index.html'));
    }
  });

  let currentPort = SYNC_PORT;
  const MAX_PORT = SYNC_PORT + 10; // Try up to 10 ports

  function tryListen(port) {
    if (port > MAX_PORT) {
      console.error(`[Sync] Could not find a free port (tried ${SYNC_PORT}-${MAX_PORT}). Sync server disabled.`);
      server = null;
      return;
    }
    currentPort = port;
    server.listen(port, '0.0.0.0');
  }

  server.on('listening', () => {
    activePort = currentPort;
    const addrs = getLanAddresses();
    console.log(`[Sync] Server running on port ${activePort}`);
    addrs.forEach(a => console.log(`[Sync]   http://${a}:${activePort}`));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Sync] Port ${currentPort} already in use, trying ${currentPort + 1}...`);
      tryListen(currentPort + 1);
    } else {
      console.error('[Sync] Server error:', err);
    }
  });

  tryListen(SYNC_PORT);
}

function stopSyncServer() {
  if (server) {
    server.close();
    server = null;
    console.log('[Sync] Server stopped');
  }
}

function getSyncInfo() {
  const addresses = getLanAddresses();
  return {
    port: activePort,
    addresses,
    urls: addresses.map(a => `http://${a}:${activePort}`),
    running: !!server,
  };
}

module.exports = {
  startSyncServer,
  stopSyncServer,
  getSyncInfo,
  readSyncData,
  writeSyncData,
  readPin,
  resetPin,
  SYNC_PORT,
  DATA_FILE,
};
