import { requireAdmin } from '../../../lib/auth.mjs';
export const prerender = false;
export async function POST(context: any) {
  const auth = requireAdmin(context); if (auth.error) return auth.error;
  const body = await context.request.text();
  try {
    const response = await fetch(`${process.env.MODEL_URL || 'http://localhost:8000'}/v1/decide`, { method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${process.env.MODEL_API_KEY || ''}` }, body, signal:AbortSignal.timeout(120000) });
    return new Response(await response.text(), { status:response.status, headers:{ 'content-type':'application/json' } });
  } catch { return Response.json({ error:'No se pudo conectar con el modelo' }, { status:503 }); }
}

