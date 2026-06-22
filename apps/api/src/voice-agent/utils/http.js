import { env } from '../config/env.js';

export function absoluteUrl(req, path) {
  if (env.PUBLIC_BASE_URL) {
    return `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}${path}`;
  }
  const protocol = req.protocol || (req.headers['x-forwarded-proto'] || 'https');
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost';
  return `${protocol}://${host}${path}`;
}

export function wsUrl(req, path) {
  if (env.PUBLIC_BASE_URL) {
    const isSecure = env.PUBLIC_BASE_URL.startsWith('https');
    const wsProto = isSecure ? 'wss' : 'ws';
    return env.PUBLIC_BASE_URL.replace(/^https?:\/\//, `${wsProto}://`).replace(/\/$/, '') + path;
  }
  const protocol = (req.headers['x-forwarded-proto'] || 'https') === 'https' ? 'wss' : 'ws';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost';
  return `${protocol}://${host}${path}`;
}
