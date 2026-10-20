import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const path = process.env.DATABASE_PATH || './webui.db';
mkdirSync(dirname(path), { recursive: true });
export const db = new Database(path);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  name TEXT PRIMARY KEY,
  rules TEXT NOT NULL DEFAULT '',
  instruction_decision TEXT NOT NULL DEFAULT '',
  instruction_rank TEXT NOT NULL DEFAULT '',
  options_json TEXT NOT NULL,
  rank_limits_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admins (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS traffic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  company TEXT NOT NULL,
  mode TEXT NOT NULL,
  status INTEGER NOT NULL,
  latency_ms REAL NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  history TEXT,
  model_output_json TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS traffic_time_idx ON traffic(recorded_at);
CREATE TABLE IF NOT EXISTS health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL,
  latency_ms REAL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS health_time_idx ON health(recorded_at);
`);
if (!db.prepare('PRAGMA table_info(traffic)').all().some(column => column.name === 'model_output_json')) {
  db.exec('ALTER TABLE traffic ADD COLUMN model_output_json TEXT');
}
for (const column of ['instruction_decision', 'instruction_rank']) {
  if (!db.prepare('PRAGMA table_info(companies)').all().some(item => item.name === column)) {
    db.exec(`ALTER TABLE companies ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
}

const defaultOptions = ['aprobar', 'revision_manual', 'rechazar'];
const defaultRanks = ['muy_bajo', 'bajo', 'medio', 'alto', 'muy_alto'];
const defaultRules = 'Evalúa únicamente el historial crediticio proporcionado. Si faltan datos o hay información contradictoria, prefiere revision_manual. La respuesta es una recomendación para revisión humana.';
const defaultInstructionDecision = '¿Qué decisión crediticia corresponde según las reglas y el historial proporcionados?';
const defaultInstructionRank = '¿Qué nivel de riesgo crediticio corresponde según las reglas y el historial proporcionados?';
db.prepare('INSERT OR IGNORE INTO companies(name, rules, instruction_decision, instruction_rank, options_json, rank_limits_json) VALUES (?, ?, ?, ?, ?, ?)').run('default', defaultRules, defaultInstructionDecision, defaultInstructionRank, JSON.stringify(defaultOptions), JSON.stringify(defaultRanks));
db.prepare("UPDATE companies SET instruction_decision = ? WHERE instruction_decision = ''").run(defaultInstructionDecision);
db.prepare("UPDATE companies SET instruction_rank = ? WHERE instruction_rank = ''").run(defaultInstructionRank);
const previousRules = 'Assess only the supplied credit history. If evidence is missing or contradictory, prefer manual_review. Return a recommendation for human review.';
db.prepare('UPDATE companies SET rules = ? WHERE rules = ?').run(defaultRules, previousRules);
db.prepare('UPDATE companies SET options_json = ? WHERE options_json = ?').run(JSON.stringify(defaultOptions), JSON.stringify(['approve', 'manual_review', 'decline']));
db.prepare('UPDATE companies SET rank_limits_json = ? WHERE rank_limits_json = ?').run(JSON.stringify(defaultRanks), JSON.stringify(['very_low', 'low', 'medium', 'high', 'very_high']));
db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run('save_history', 'false');

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
if (!db.prepare('SELECT username FROM admins WHERE username = ?').get('admin')) {
  if (!initialPassword || initialPassword.length < 12 || initialPassword === 'change-this-before-starting') {
    throw new Error('Configura ADMIN_INITIAL_PASSWORD en .env con una clave única de al menos 12 caracteres antes del primer inicio');
  }
  db.prepare('INSERT INTO admins(username,password_hash,must_change_password) VALUES (?,?,1)').run('admin', hashPassword(initialPassword));
}

export function getCompany(name) {
  const row = db.prepare('SELECT name, rules, instruction_decision, instruction_rank, options_json, rank_limits_json FROM companies WHERE name = ?').get(name)
    || db.prepare('SELECT name, rules, instruction_decision, instruction_rank, options_json, rank_limits_json FROM companies WHERE name = ?').get('default');
  return { company: row.name, rules: row.rules, instruction_decision: row.instruction_decision, instruction_rank: row.instruction_rank, options: JSON.parse(row.options_json), rank_limits: JSON.parse(row.rank_limits_json) };
}

export function getSetting(key) { return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value; }
export function setSetting(key, value) { db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value); }

