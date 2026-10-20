import { readSession } from '../../../lib/auth.mjs';
export const prerender = false;
export function GET({ cookies }: any) {
  const admin = readSession(cookies);
  return Response.json({ authenticated: !!admin, must_change_password: !!admin?.must_change_password, username: admin?.username || null });
}

