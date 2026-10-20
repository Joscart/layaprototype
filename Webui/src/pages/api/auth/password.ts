import { db, hashPassword, verifyPassword } from '../../../lib/db.mjs';
import { createSession, readSession, setSession } from '../../../lib/auth.mjs';
export const prerender = false;
export async function POST({ request, cookies }: any) {
  const admin = readSession(cookies);
  if (!admin) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const { current_password, new_password } = await request.json();
  const row = db.prepare('SELECT * FROM admins WHERE username = ?').get(admin.username);
  if (!verifyPassword(String(current_password || ''), row.password_hash)) return Response.json({ error: 'La contraseña actual es incorrecta' }, { status: 422 });
  if (typeof new_password !== 'string' || new_password.length < 12 || new_password === current_password) return Response.json({ error: 'Usa una contraseña nueva de al menos 12 caracteres' }, { status: 422 });
  db.prepare('UPDATE admins SET password_hash=?, must_change_password=0, session_version=session_version+1 WHERE username=?').run(hashPassword(new_password), admin.username);
  const updated = db.prepare('SELECT * FROM admins WHERE username=?').get(admin.username);
  setSession(cookies, createSession(updated));
  return Response.json({ changed: true });
}

