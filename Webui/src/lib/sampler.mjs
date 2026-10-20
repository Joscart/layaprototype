import { db } from './db.mjs';

async function sample() {
  const start = performance.now();
  let status = 'down';
  let detail = null;
  try {
    const response = await fetch(`${process.env.MODEL_URL || 'http://localhost:8000'}/health`, { signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    status = response.ok && body.status === 'ok' ? 'up' : 'down';
    detail = JSON.stringify(body);
  } catch (error) { detail = String(error); }
  db.prepare('INSERT INTO health(status, latency_ms, detail) VALUES (?,?,?)').run(status, Math.round(performance.now() - start), detail);
}
setTimeout(sample, 2000);
setInterval(sample, 60000);

