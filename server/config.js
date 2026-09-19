export const SERVER_VERSION = '0.2.8';
export const PROTOCOL_VERSION = 1;

function integer(value, fallback, min, max, name) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return n;
}
export function readConfig(env = process.env) {
  const defaults = 'https://gnomeward.thekents.org,http://gnomeward.thekents.org,https://oj-kentd.github.io,https://multiplayer.lightsoutphotos.com,http://localhost:5173,http://localhost:5174';
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS ?? defaults).split(',').filter(Boolean).map(value => {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.trim()) throw new Error('ALLOWED_ORIGINS must contain exact http(s) origins, without paths or trailing slashes');
    return url.origin;
  }));
  return {
    port: integer(env.PORT, 2567, 0, 65535, 'PORT'),
    host: env.HOST || '0.0.0.0',
    dataDir: env.DATA_DIR || './server-data',
    maxRooms: integer(env.MAX_ROOMS, 8, 1, 100, 'MAX_ROOMS'),
    allowedOrigins,
  };
}

// Same-origin access permits the local connection-check page on the Unraid LAN IP.
// These checks protect browser origins, not player identity or private room access.
export function originAllowed(origin, host, allowedOrigins) {
  if (!origin) return true; // native clients and curl have no browser Origin
  if (allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === origin && url.host === host;
  } catch { return false; }
}
