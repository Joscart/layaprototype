import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.mjs';

const cookieName = 'laya_session';
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32 || secret === 'replace-with-a-different-long-random-secret') throw new Error('Configura SESSION_SECRET con un valor único de al menos 32 caracteres');

function sign(value) { return createHmac('sha256', secret).update(value).digest('hex'); }

export function createSession(admin) {
  const payload = Buffer.from(JSON.stringify({ user: admin.username, version: admin.session_version, expires: Date.now() + 7 * 86400000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSession(cookies) {
  const token = cookies.get(cookieName)?.value;
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature.length !== 64 || !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (claims.expires < Date.now()) return null;
    const admin = db.prepare('SELECT username,must_change_password,session_version FROM admins WHERE username = ?').get(claims.user);
    return admin?.session_version === claims.version ? admin : null;
  } catch { return null; }
}

export function setSession(cookies, value) { cookies.set(cookieName, value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 86400 }); }
export function clearSession(cookies) { cookies.delete(cookieName, { path: '/' }); }
export function requireAdmin(context) {
  const admin = readSession(context.cookies);
  if (!admin) return { error: new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 }) };
  if (admin.must_change_password && context.url.pathname !== '/api/auth/password') return { error: new Response(JSON.stringify({ error: 'Debes cambiar la contraseña' }), { status: 403 }) };
  return { admin };
}
export function internalAuthorized(request) {
  const token = process.env.INTERNAL_API_TOKEN || '';
  const supplied = request.headers.get('x-internal-token') || '';
  return token.length >= 24 && supplied.length === token.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}

