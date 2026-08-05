import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// node:sqlite はまだ experimental で、バンドラ(Vite/Vitest)の組み込みモジュール判定に
// 含まれていないことがあるため、静的 import ではなく process.getBuiltinModule 経由で
// 実体を取得する（型だけ静的 import し、コンパイル時に消える type-only import にする）。
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface UserRow {
  id: number;
  name: string;
  token: string;
}

export interface TaskRow {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
`;

/**
 * DB を初期化する。テスト用にインメモリ(':memory:')を渡せる。
 */
export function createDb(path: string = 'data.sqlite3'): DatabaseSyncType {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export function seedUser(db: DatabaseSyncType, name: string, token: string): UserRow {
  const stmt = db.prepare('INSERT INTO users (name, token) VALUES (?, ?)');
  const result = stmt.run(name, token);
  return { id: Number(result.lastInsertRowid), name, token };
}

export function findUserByToken(db: DatabaseSyncType, token: string): UserRow | undefined {
  const stmt = db.prepare('SELECT id, name, token FROM users WHERE token = ?');
  return stmt.get(token) as unknown as UserRow | undefined;
}
