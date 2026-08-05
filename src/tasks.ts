import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthEnv } from './auth.js';
import type { TaskRow, TaskStatus } from './db.js';

const VALID_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

interface CreateTaskBody {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  due_at?: unknown;
}

function isValidStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (VALID_STATUSES as string[]).includes(value);
}

function getTaskForUser(db: DatabaseSync, id: number, userId: number): TaskRow | undefined {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?');
  return stmt.get(id, userId) as unknown as TaskRow | undefined;
}

/**
 * タスクの CRUD ルート一式を組み立てる。
 * すべてのルートで「自分のタスクかどうか」を user_id で確認してから操作する。
 */
export function createTaskRoutes(db: DatabaseSync): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  // 一覧取得
  app.get('/', (c) => {
    const user = c.get('user');
    const stmt = db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id ASC');
    const rows = stmt.all(user.id) as unknown as TaskRow[];
    return c.json({ tasks: rows });
  });

  // 新規作成
  app.post('/', async (c) => {
    const user = c.get('user');
    const body = await c.req.json<CreateTaskBody>().catch(() => ({}) as CreateTaskBody);

    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return c.json({ error: 'title is required' }, 400);
    }

    const status = isValidStatus(body.status) ? body.status : 'todo';
    const description = typeof body.description === 'string' ? body.description : null;
    const dueAt = typeof body.due_at === 'string' ? body.due_at : null;
    const now = new Date().toISOString();

    const stmt = db.prepare(
      `INSERT INTO tasks (user_id, title, description, status, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(user.id, body.title, description, status, dueAt, now, now);

    const created = getTaskForUser(db, Number(result.lastInsertRowid), user.id);
    return c.json({ task: created }, 201);
  });

  // 個別取得
  app.get('/:id', (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const task = getTaskForUser(db, id, user.id);
    if (!task) {
      return c.json({ error: 'not found' }, 404);
    }
    return c.json({ task });
  });

  // 更新
  app.patch('/:id', async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const existing = getTaskForUser(db, id, user.id);
    if (!existing) {
      return c.json({ error: 'not found' }, 404);
    }

    const body = await c.req.json<CreateTaskBody>().catch(() => ({}) as CreateTaskBody);

    const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title : existing.title;
    const description = typeof body.description === 'string' ? body.description : existing.description;
    const status = isValidStatus(body.status) ? body.status : existing.status;
    const dueAt = typeof body.due_at === 'string' ? body.due_at : existing.due_at;
    const now = new Date().toISOString();

    const stmt = db.prepare(
      `UPDATE tasks SET title = ?, description = ?, status = ?, due_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    );
    stmt.run(title, description, status, dueAt, now, id, user.id);

    const updated = getTaskForUser(db, id, user.id);
    return c.json({ task: updated });
  });

  // 削除
  app.delete('/:id', (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const existing = getTaskForUser(db, id, user.id);
    if (!existing) {
      return c.json({ error: 'not found' }, 404);
    }

    const stmt = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
    stmt.run(id, user.id);
    return c.body(null, 204);
  });

  return app;
}
