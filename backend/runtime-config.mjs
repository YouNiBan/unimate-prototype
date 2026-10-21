import { isAbsolute, resolve } from 'node:path';
import { isIP } from 'node:net';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
function exactOrigin(value, name, hosted) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a complete origin.`); }
  if (url.username || url.password || url.hostname.includes('*') || url.pathname !== '/' || url.search || url.hash
      || !['http:', 'https:'].includes(url.protocol)
      || (hosted && url.protocol !== 'https:')
      || (!hosted && url.protocol === 'http:' && !localHosts.has(url.hostname))) {
    throw new Error(`${name} must be an exact HTTPS origin (HTTP is allowed only on localhost).`);
  }
  return url.origin;
}

export function runtimeConfig(env = process.env) {
  const hosted = env.UNIMATE_MODE === 'hosted';
  if (env.NODE_ENV === 'production' && !hosted) {
    throw new Error('Production requires explicit UNIMATE_MODE=hosted and deployment configuration.');
  }
  const port = Number(env.PORT || env.ADMIN_PORT || 8090);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid server port.');
  const dataDirectory = env.UNIMATE_DATA_DIR || resolve('data');
  if (hosted && (!env.UNIMATE_DATA_DIR || !isAbsolute(dataDirectory))) {
    throw new Error('Hosted mode requires an absolute UNIMATE_DATA_DIR on persistent storage.');
  }
  const apiOrigin = exactOrigin(env.UNIMATE_API_ORIGIN || (hosted ? '' : `http://localhost:${port}`), 'UNIMATE_API_ORIGIN', hosted);
  const adminOrigin = exactOrigin(env.UNIMATE_ADMIN_ORIGIN || apiOrigin, 'UNIMATE_ADMIN_ORIGIN', hosted);
  const webOrigin = exactOrigin(env.UNIMATE_WEB_ORIGIN || (hosted ? '' : 'http://localhost:8083'), 'UNIMATE_WEB_ORIGIN', hosted);
  const appOrigins = [webOrigin];
  for (const origin of (env.UNIMATE_EXTRA_WEB_ORIGINS || '').split(',').filter(Boolean)) {
    appOrigins.push(exactOrigin(origin.trim(), 'UNIMATE_EXTRA_WEB_ORIGINS', hosted));
  }
  const healthHost = env.RENDER_EXTERNAL_HOSTNAME || '';
  if (healthHost && !/^[a-z0-9-]+\.onrender\.com$/.test(healthHost)) throw new Error('Invalid Render health hostname.');
  return {
    hosted, port, apiOrigin, adminOrigin, webOrigin, appOrigins,
    filename: resolve(dataDirectory, 'unimate.sqlite'),
    mediaDirectory: resolve(dataDirectory, 'media'),
    backupDirectory: resolve(dataDirectory, 'backups'),
    healthHost,
    trustProxy: hosted && env.UNIMATE_TRUST_PROXY === '1',
    allowRegistration: env.UNIMATE_REGISTRATION_ENABLED === 'true',
  };
}

// A hosted service has exactly one trusted ingress proxy. Ignore all forwarded
// headers locally; for the hosted proxy, only its appended final address counts.
export function requestAddress(req, trustProxy = false) {
  if (trustProxy) {
    const value = String(req.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim();
    if (value && isIP(value)) return value;
  }
  return req.socket.remoteAddress || 'unknown';
}

export function applyRequestBoundary(req, res, runtime, localPort) {
  const localOrigin = `http://localhost:${localPort}`;
  const alternateOrigin = `http://127.0.0.1:${localPort}`;
  const serverOrigins = runtime ? [runtime.apiOrigin, runtime.adminOrigin] : [localOrigin, alternateOrigin];
  const url = new URL(req.url, serverOrigins[0]);
  const host = req.headers.host;
  const validHosts = serverOrigins.map(origin => new URL(origin).host);
  const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
  const health = req.method === 'GET' && url.pathname === '/api/health';
  if (!validHosts.includes(host) && !(health && runtime?.healthHost === host)) fail(403, 'Invalid host.');
  const memberRoute = url.pathname.startsWith('/api/member/');
  const allowedOrigins = memberRoute ? [...serverOrigins, ...(runtime?.appOrigins || ['http://localhost:8083'])] : serverOrigins;
  const origin = req.headers.origin;
  // Stripe and the local Stripe CLI authenticate with a signature over the raw
  // request. This one server-to-server route has no browser Origin or cookies.
  const signedWebhookRoute = req.method === 'POST' && url.pathname === '/api/payments/stripe-webhook' && !origin && !req.headers['sec-fetch-site'];
  if (origin && !allowedOrigins.includes(origin)) fail(403, 'Origin not allowed.');
  if (!['GET', 'POST', 'OPTIONS'].includes(req.method)) fail(405, 'Method not allowed.');
  if (req.method === 'POST' && !signedWebhookRoute && !allowedOrigins.includes(origin)) fail(403, 'Same-origin request required.');
  if (!memberRoute && req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Cross-site request blocked.');
  if (origin && memberRoute) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (runtime?.hosted) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (!health && !(req.socket.encrypted || (runtime.trustProxy && req.headers['x-forwarded-proto'] === 'https'))) {
      fail(403, 'HTTPS is required.');
    }
  }
  if (req.method === 'OPTIONS') {
    const requestedHeaders = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (!memberRoute || !allowedOrigins.includes(origin)
        || !['GET', 'POST'].includes(req.headers['access-control-request-method'])
        || requestedHeaders.some(name => !['content-type', 'x-csrf-token'].includes(name))) {
      fail(403, 'Preflight not allowed.');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
    res.setHeader('Access-Control-Max-Age', '600');
    res.writeHead(204); res.end();
    return null;
  }
  return url;
}
