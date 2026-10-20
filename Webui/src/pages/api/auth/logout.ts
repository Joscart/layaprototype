import { clearSession } from '../../../lib/auth.mjs';
export const prerender = false;
export function POST({ cookies }: any) { clearSession(cookies); return Response.json({ logged_out: true }); }

