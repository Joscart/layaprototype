import { db, getCompany } from '../../../lib/db.mjs';
import { requireAdmin } from '../../../lib/auth.mjs';
export const prerender = false;
export async function PUT(context: any) {
  const auth = requireAdmin(context); if (auth.error) return auth.error;
  const name = context.params.name;
  if (!db.prepare('SELECT 1 FROM companies WHERE name=?').get(name)) return Response.json({ error:'No se encontró la empresa' }, { status:404 });
  const body = await context.request.json();
  const rules = body.rules;
  const existing = getCompany(name);
  const instructionDecision = body.instruction_decision ?? existing.instruction_decision;
  const instructionRank = body.instruction_rank ?? existing.instruction_rank;
  const options = body.options;
  const ranks = body.rank_limits;
  if (typeof instructionDecision !== 'string' || !instructionDecision.trim() || instructionDecision.length > 250 || typeof instructionRank !== 'string' || !instructionRank.trim() || instructionRank.length > 250) return Response.json({ error:'Cada instrucción debe contener entre 1 y 250 caracteres' }, { status:422 });
  if (typeof rules !== 'string' || rules.length > 5000 || !Array.isArray(options) || options.length < 2 || options.length > 64 || !options.every((x: any) => typeof x === 'string' && x.trim()) || new Set(options).size !== options.length || !Array.isArray(ranks) || ranks.length < 2 || ranks.length > 32 || !ranks.every((x: any) => typeof x === 'string' && x.trim())) return Response.json({ error:'Las reglas admiten hasta 5.000 caracteres; se requieren entre 2 y 64 opciones y entre 2 y 32 niveles de rango' }, { status:422 });
  db.prepare('UPDATE companies SET rules=?,instruction_decision=?,instruction_rank=?,options_json=?,rank_limits_json=? WHERE name=?').run(rules,instructionDecision,instructionRank,JSON.stringify(options),JSON.stringify(ranks),name);
  return Response.json(getCompany(name));
}

