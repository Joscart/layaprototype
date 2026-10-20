import { db, getSetting } from '../../../lib/db.mjs';
import { internalAuthorized } from '../../../lib/auth.mjs';
export const prerender = false;
export async function POST({ request }: any) {
  if (!internalAuthorized(request)) return new Response('No autorizado', { status: 401 });
  const body = await request.json();
  if (!['decision','rank','both'].includes(body.mode) || typeof body.status !== 'number') return new Response('Telemetría no válida', { status: 422 });
  const saveHistory = getSetting('save_history') === 'true';
  const history = saveHistory && typeof body.history === 'string' ? body.history : null;
  const modelOutput = saveHistory && body.model_output ? JSON.stringify(body.model_output) : null;
  db.prepare('INSERT INTO traffic(company,mode,status,latency_ms,input_tokens,history,model_output_json,error) VALUES (?,?,?,?,?,?,?,?)')
    .run(String(body.company || 'default'), body.mode, body.status, Number(body.latency_ms || 0), Number(body.input_tokens || 0), history, modelOutput, body.error ? String(body.error) : null);
  return Response.json({ saved: true });
}

