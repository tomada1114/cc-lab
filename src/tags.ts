import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

export interface TagRow {
  id: number;
  name: string;
}

/**
 * 名前でタグを探し、無ければ作成する。
 */
export function findOrCreateTag(db: DatabaseSyncType, name: string): TagRow {
  const existing = db.prepare('SELECT id, name FROM tags WHERE name = ?').get(name) as unknown as
    | TagRow
    | undefined;
  if (existing) {
    return existing;
  }

  const result = db.prepare('INSERT INTO tags (name) VALUES (?)').run(name);
  return { id: Number(result.lastInsertRowid), name };
}

export function attachTag(db: DatabaseSyncType, taskId: number, tagId: number): void {
  db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(taskId, tagId);
}

export function detachTag(db: DatabaseSyncType, taskId: number, tagId: number): void {
  db.prepare('DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?').run(taskId, tagId);
}

/**
 * タスクに紐づくタグ一覧を取得する。
 * タグ取得で失敗してもタスク一覧そのものは返したいので、失敗時はタグなし扱いにする。
 */
export function getTagsForTask(db: DatabaseSyncType, taskId: number): TagRow[] {
  try {
    const stmt = db.prepare(`
      SELECT tags.id, tags.name
      FROM tags
      JOIN task_tags ON task_tags.tag_id = tags.id
      WHERE task_tags.task_id = ?
    `);
    return stmt.all(taskId) as unknown as TagRow[];
  } catch {
    return [];
  }
}
