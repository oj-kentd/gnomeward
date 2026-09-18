import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createGnomewardRoom } from './room.js';
import { readConfig, originAllowed, SERVER_VERSION, PROTOCOL_VERSION } from './config.js';
import { openResultStore } from './store.js';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const sdkFile = fileURLToPath(new URL('../node_modules/@colyseus/sdk/dist/colyseus.js', import.meta.url));

export async function startServer(config = readConfig(), roomOptions = {}) {
  const store = await openResultStore(config.dataDir);
  const rooms = new Set();
  let stopping = false;
  const http = createServer();
  http.requestTimeout = 15000;
  http.headersTimeout = 10000;
  const allowed = (headers) => originAllowed(headers.get('origin'), headers.get('host'), config.allowedOrigins);
  const transport = new WebSocketTransport({
    server: http, maxPayload: 4096, pingInterval: 10000, pingMaxRetries: 2,
    beforeUpgrade: (_request, context) => {
      if (stopping) return new Response('Server restarting', { status: 503 });
      if (!allowed(context.headers)) return new Response('Origin not allowed', { status: 403 });
    },
  });
  matchMaker.controller.exposedMethods = ['create', 'joinById', 'reconnect'];
  matchMaker.controller.getCorsHeaders = headers => ({
    'Access-Control-Allow-Origin': allowed(headers) ? headers.get('origin') || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Vary': 'Origin',
  });
  const gameServer = new Server({
    transport, greet: false, gracefullyShutdown: false,
    express: app => {
      app.disable('x-powered-by');
      app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'gnomeward-server', version: SERVER_VERSION, protocol: PROTOCOL_VERSION }));
      app.get('/readyz', (_req, res) => res.status(!stopping && store.healthy ? 200 : 503).json({ ready: !stopping && store.healthy }));
      app.get('/lobbies', (req, res) => {
        if (req.headers.origin) {
          res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
          res.setHeader('Vary', 'Origin');
        }
        if (stopping || !store.healthy) return res.status(503).json({ error: 'Server is not ready' });
        res.json({ lobbies: [...rooms].map(room => room.lobbyListing()).filter(Boolean) });
      });
      app.get('/vendor/colyseus.js', (_req, res) => res.sendFile(sdkFile));
      app.get('/', (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));
      app.use(express.static(publicDir, { index: false, dotfiles: 'deny' }));
      app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    },
  });
  gameServer.define('gnomeward', createGnomewardRoom({
    ...roomOptions,
    recordResult: result => store.record(result),
    getUnlockedRewards: () => store.unlocks,
    onRewardUnlocked: type => store.grantUnlock(type),
    onRoomOpen: room => {
      if (stopping || !store.healthy) throw new Error('Server is not ready');
      if (rooms.size >= config.maxRooms) throw new Error('All gardens are busy. Try again after a match ends.');
      rooms.add(room);
    },
    onRoomClose: room => rooms.delete(room),
  }));
  await gameServer.listen(config.port, config.host);

  // Colyseus mounts matchmaking before Express. Guard the complete HTTP handler,
  // including matchmaking, rather than relying on an Express-only CORS middleware.
  const handlers = http.listeners('request');
  http.removeAllListeners('request');
  const parseBody = express.json({ limit: '4kb', strict: true, inflate: false });
  const requests = new Map();
  const rateAllowed = req => {
    const now = Date.now(), key = req.socket.remoteAddress || 'unknown';
    for (const [ip, entry] of requests) if (now - entry.start >= 60000) requests.delete(ip);
    let entry = requests.get(key);
    if (!entry) {
      if (requests.size >= 1024) return false;
      entry = { start: now, count: 0 }; requests.set(key, entry);
    }
    return ++entry.count <= 120;
  };
  http.on('request', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const reject = (status, error) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error })); };
    if (!originAllowed(req.headers.origin, req.headers.host, config.allowedOrigins)) return reject(403, 'Origin not allowed');
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
    }
    const matchmake = req.url.startsWith('/matchmake/');
    if (matchmake && stopping) return reject(503, 'Server restarting');
    if (matchmake && !rateAllowed(req)) return reject(429, 'Too many connection requests; wait a minute');
    if (matchmake && req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) return reject(415, 'Use application/json');
    parseBody(req, res, error => {
      if (error) return reject(error.status || 400, error.type === 'entity.too.large' ? 'Request too large' : 'Invalid JSON request');
      for (const handler of handlers) handler.call(http, req, res);
    });
  });
  let shutdown;
  return {
    server: gameServer, http, store, rooms,
    port: http.address().port,
    stop() {
      return shutdown ??= (async () => {
        stopping = true;
        await gameServer.gracefullyShutdown(false);
        await store.flush();
      })();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const app = await startServer();
    console.log(`Gnomeward server ${SERVER_VERSION} listening on port ${app.port}`);
    const shutdown = () => {
      const timeout = setTimeout(() => process.exit(1), 20000).unref();
      app.stop().then(() => { clearTimeout(timeout); process.exit(0); }).catch(error => { console.error(error.message); process.exit(1); });
    };
    process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
  } catch (error) { console.error('Gnomeward server could not start:', error.message); process.exitCode = 1; }
}
