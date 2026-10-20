import { getSetting, setSetting } from '../../../lib/db.mjs';
import { requireAdmin } from '../../../lib/auth.mjs';
export const prerender = false;
export function GET(context: any) { const auth=requireAdmin(context); if(auth.error)return auth.error; return Response.json({ save_history:getSetting('save_history')==='true' }); }
export async function PUT(context: any) { const auth=requireAdmin(context); if(auth.error)return auth.error; const body=await context.request.json(); if(typeof body.save_history!=='boolean')return Response.json({error:'save_history debe ser verdadero o falso'},{status:422}); setSetting('save_history',String(body.save_history)); return Response.json({save_history:body.save_history}); }

