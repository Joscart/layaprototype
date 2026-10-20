import { getCompany } from '../../../lib/db.mjs';
import { internalAuthorized } from '../../../lib/auth.mjs';
export const prerender = false;
export function GET({ request, url }: any) {
  if (!internalAuthorized(request)) return new Response('No autorizado', { status: 401 });
  return Response.json(getCompany(url.searchParams.get('company') || 'default'));
}

