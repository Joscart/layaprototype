export const prerender = false;
export function GET() { return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'content-type': 'application/json' } }); }

