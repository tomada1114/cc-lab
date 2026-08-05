import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthEnv } from './auth.js';
import { findUserById, type TaskRow, type TaskStatus } from './db.js';
import { attachTag, detachTag, findOrCreateTag, getTagsForTask } from './tags.js';

const VALID_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];
const DEFAULT_PAGE = 1;

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
  // page/limit を指定するとページネーションされる。page は 1 始まり。
  // どちらも指定しない場合は従来どおり全件を返す。
  app.get('/', (c) => {
    const user = c.get('user');
    const tag = c.req.query('tag');
    const limitParam = c.req.query('limit');

    let rows: TaskRow[];

    if (limitParam) {
      const page = Number(c.req.query('page') ?? DEFAULT_PAGE);
      const limit = Number(limitParam);
      const offset = page * limit;

      rows = tag
        ? (db
            .prepare(
              `SELECT tasks.* FROM tasks
               JOIN task_tags ON task_tags.task_id = tasks.id
               JOIN tags ON tags.id = task_tags.tag_id
               WHERE tasks.user_id = ? AND tags.name = ?
               ORDER BY tasks.id ASC LIMIT ? OFFSET ?`
            )
            .all(user.id, tag, limit, offset) as unknown as TaskRow[])
        : (db
            .prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id ASC LIMIT ? OFFSET ?')
            .all(user.id, limit, offset) as unknown as TaskRow[]);
    } else {
      rows = tag
        ? (db
            .prepare(
              `SELECT tasks.* FROM tasks
               JOIN task_tags ON task_tags.task_id = tasks.id
               JOIN tags ON tags.id = task_tags.tag_id
               WHERE tasks.user_id = ? AND tags.name = ?
               ORDER BY tasks.id ASC`
            )
            .all(user.id, tag) as unknown as TaskRow[])
        : (db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id ASC').all(user.id) as unknown as TaskRow[]);
    }

    const tasksWithTags = [];
    for (const task of rows) {
      tasksWithTags.push({ ...task, tags: getTagsForTask(db, task.id) });
    }

    return c.json({ tasks: tasksWithTags });
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

  // タグ付け
  app.post('/:id/tags', async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const task = getTaskForUser(db, id, user.id);
    if (!task) {
      return c.json({ error: 'not found' }, 404);
    }

    const body = await c.req.json<{ name?: unknown }>().catch(() => ({}) as { name?: unknown });
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return c.json({ error: 'name is required' }, 400);
    }

    const tag = findOrCreateTag(db, body.name.trim());
    attachTag(db, id, tag.id);

    return c.json({ tag }, 201);
  });

  // タグ解除
  app.delete('/:id/tags/:tagId', (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    const tagId = Number(c.req.param('tagId'));
    if (!Number.isInteger(id) || !Number.isInteger(tagId)) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const task = getTaskForUser(db, id, user.id);
    if (!task) {
      return c.json({ error: 'not found' }, 404);
    }

    detachTag(db, id, tagId);
    return c.body(null, 204);
  });

  // タスクを他ユーザーに共有する
  app.post('/:id/shares', async (c) => {
    const user = c.get('user');
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const task = getTaskForUser(db, id, user.id);
    if (!task) {
      return c.json({ error: 'not found' }, 404);
    }

    const body = await c.req.json<{ user_id?: unknown }>().catch(() => ({}) as { user_id?: unknown });
    const targetUserId = Number(body.user_id);
    if (!Number.isInteger(targetUserId)) {
      return c.json({ error: 'user_id is required' }, 400);
    }

    const targetUser = findUserById(db, targetUserId);
    if (!targetUser) {
      return c.json({ error: 'target user not found' }, 400);
    }

    const already = db
      .prepare('SELECT id FROM task_shares WHERE task_id = ? AND shared_with_user_id = ?')
      .get(id, targetUserId);
    if (already) {
      return c.json({ error: 'already shared' }, 409);
    }

    const now = new Date().toISOString();
    const result = db
      .prepare('INSERT INTO task_shares (task_id, shared_with_user_id, created_at) VALUES (?, ?, ?)')
      .run(id, targetUserId, now);

    return c.json({ share: { id: Number(result.lastInsertRowid), task_id: id, shared_with_user_id: targetUserId, created_at: now } }, 201);
  });

  // タスクの共有先一覧
  app.get('/:id/shares', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as TaskRow | undefined;
    if (!task) {
      return c.json({ error: 'not found' }, 404);
    }

    const shares = db
      .prepare('SELECT id, task_id, shared_with_user_id, created_at FROM task_shares WHERE task_id = ?')
      .all(id);

    return c.json({ task, shares });
  });

  return app;
}
