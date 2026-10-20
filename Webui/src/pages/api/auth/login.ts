import { db, verifyPassword } from '../../../lib/db.mjs';
import { createSession, setSession } from '../../../lib/auth.mjs';
export const prerender = false;
export async function POST({ request, cookies }: any) {
  const { username, password } = await request.json();
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !verifyPassword(String(password || ''), admin.password_hash)) return Response.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
  setSession(cookies, createSession(admin));
  return Response.json({ must_change_password: !!admin.must_change_password });
}

