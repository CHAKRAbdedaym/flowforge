import type { DB } from './index.js';

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

/**
 * Ordered schema migrations. NEVER edit a migration after it has been committed:
 * add a new one instead. Timestamps are ISO-8601 strings (UTC).
 */
export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'users_sessions_settings',
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        first_name    TEXT NOT NULL,
        last_name     TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'owner',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token_hash   TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        user_agent   TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(db: DB, migrations: Migration[] = MIGRATIONS): number {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: number }[]).map((row) => row.id),
  );
  const record = db.prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)');
  let count = 0;
  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.id, migration.name, new Date().toISOString());
    })();
    count++;
  }
  return count;
}
