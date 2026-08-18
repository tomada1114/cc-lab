import { Hono } from 'hono';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import type { AuthEnv } from './auth.js';
import type { TaskRow } from './db.js';

/**
 * 自分に共有されたタスク一覧を返すルート。
 */
export function createSharedTaskRoutes(db: DatabaseSyncType): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  app.get('/', (c) => {
    const user = c.get('user');
    const stmt = db.prepare(`
      SELECT tasks.*
      FROM tasks
      JOIN task_shares ON task_shares.task_id = tasks.id
      WHERE task_shares.shared_with_user_id = ?
      ORDER BY tasks.id ASC
    `);
    const rows = stmt.all(user.id) as unknown as TaskRow[];
    return c.json({ tasks: rows });
  });

  return app;
}
