import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { createDb, seedUser } from '../src/db.js';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe('task API', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;
  let aliceToken: string;
  let bobToken: string;

  beforeEach(() => {
    db = createDb(':memory:');
    app = createApp(db);
    aliceToken = 'alice-token';
    bobToken = 'bob-token';
    seedUser(db, 'alice', aliceToken);
    seedUser(db, 'bob', bobToken);
  });

  it('rejects requests without a token', async () => {
    const res = await app.request('/tasks');
    expect(res.status).toBe(401);
  });

  it('creates and lists a task for the authenticated user', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(aliceToken) },
      body: JSON.stringify({ title: '買い物に行く', description: '牛乳を買う' }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.task.title).toBe('買い物に行く');
    expect(created.task.status).toBe('todo');

    const listRes = await app.request('/tasks', { headers: authHeader(aliceToken) });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0].title).toBe('買い物に行く');
  });

  it('rejects task creation without a title', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(aliceToken) },
      body: JSON.stringify({ description: 'no title' }),
    });
    expect(res.status).toBe(400);
  });

  it('gets a single task by id', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(aliceToken) },
      body: JSON.stringify({ title: 'レポート作成' }),
    });
    const created = await createRes.json();

    const getRes = await app.request(`/tasks/${created.task.id}`, { headers: authHeader(aliceToken) });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.task.id).toBe(created.task.id);
  });

  it('updates a task', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(aliceToken) },
      body: JSON.stringify({ title: '掃除する' }),
    });
    const created = await createRes.json();

    const updateRes = await app.request(`/tasks/${created.task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader(aliceToken) },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.task.status).toBe('done');
  });

  it('deletes a task', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(aliceToken) },
      body: JSON.stringify({ title: '一時的なタスク' }),
    });
    const created = await createRes.json();

    const deleteRes = await app.request(`/tasks/${created.task.id}`, {
      method: 'DELETE',
      headers: authHeader(aliceToken),
    });
    expect(deleteRes.status).toBe(204);

    const getRes = await app.request(`/tasks/${created.task.id}`, { headers: authHeader(aliceToken) });
    expect(getRes.status).toBe(404);
  });

  it('does not let a user access another user’s task', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(aliceToken) },
      body: JSON.stringify({ title: 'アリスの秘密のタスク' }),
    });
    const created = await createRes.json();

    const getRes = await app.request(`/tasks/${created.task.id}`, { headers: authHeader(bobToken) });
    expect(getRes.status).toBe(404);

    const updateRes = await app.request(`/tasks/${created.task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader(bobToken) },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(updateRes.status).toBe(404);

    const deleteRes = await app.request(`/tasks/${created.task.id}`, {
      method: 'DELETE',
      headers: authHeader(bobToken),
    });
    expect(deleteRes.status).toBe(404);
  });
});
