import { db, getCompany } from '../../../lib/db.mjs';
import { requireAdmin } from '../../../lib/auth.mjs';
export const prerender = false;
export function GET(context: any) {
  const auth = requireAdmin(context); if (auth.error) return auth.error;
  return Response.json(db.prepare('SELECT name, rules, instruction_decision, instruction_rank, options_json, rank_limits_json, created_at FROM companies ORDER BY name').all().map((x: any) => ({ name:x.name, rules:x.rules, instruction_decision:x.instruction_decision, instruction_rank:x.instruction_rank, options:JSON.parse(x.options_json), rank_limits:JSON.parse(x.rank_limits_json), created_at:x.created_at })));
}
export async function POST(context: any) {
  const auth = requireAdmin(context); if (auth.error) return auth.error;
  const body = await context.request.json();
  const name = String(body.name || '').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,79}$/u.test(name)) return Response.json({ error:'El nombre debe tener entre 1 y 80 letras, números, espacios, _ o -' }, { status:422 });
  const fallback = getCompany('default');
  try {
    db.prepare('INSERT INTO companies(name,rules,instruction_decision,instruction_rank,options_json,rank_limits_json) VALUES (?,?,?,?,?,?)').run(name, fallback.rules, fallback.instruction_decision, fallback.instruction_rank, JSON.stringify(fallback.options), JSON.stringify(fallback.rank_limits));
    return Response.json(getCompany(name), { status:201 });
  } catch { return Response.json({ error:'La empresa ya existe' }, { status:409 }); }
}

