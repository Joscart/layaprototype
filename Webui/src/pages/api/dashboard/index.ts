import { db } from '../../../lib/db.mjs';
import { requireAdmin } from '../../../lib/auth.mjs';
export const prerender = false;
export function GET(context: any) {
  const auth=requireAdmin(context); if(auth.error)return auth.error;
  const summary=db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status=200 THEN 1 ELSE 0 END) successful, ROUND(AVG(latency_ms),1) avg_latency, SUM(input_tokens) input_tokens FROM traffic`).get();
  const traffic=db.prepare(`SELECT strftime('%Y-%m-%d %H:00', recorded_at) hour, COUNT(*) count, SUM(CASE WHEN status>=400 THEN 1 ELSE 0 END) errors FROM traffic WHERE recorded_at >= datetime('now','-24 hours') GROUP BY hour ORDER BY hour`).all();
  const health=db.prepare('SELECT recorded_at,status,latency_ms FROM health ORDER BY id DESC LIMIT 120').all().reverse();
  const recent=db.prepare('SELECT recorded_at,company,mode,status,latency_ms,input_tokens,history,error FROM traffic ORDER BY id DESC LIMIT 30').all();
  return Response.json({summary,traffic,health,recent});
}
