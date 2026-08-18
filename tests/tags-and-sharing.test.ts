import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { createDb, seedUser } from '../src/db.js';

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeader(token) };
}

describe('tags and pagination', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;
  let aliceToken: string;

  beforeEach(() => {
    db = createDb(':memory:');
    app = createApp(db);
    aliceToken = 'alice-token';
    seedUser(db, 'alice', aliceToken);
  });

  it('attaches a tag to a task and filters the task list by it', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: jsonHeaders(aliceToken),
      body: JSON.stringify({ title: '企画書を書く' }),
    });
    const created = await createRes.json();

    const tagRes = await app.request(`/tasks/${created.task.id}/tags`, {
      method: 'POST',
      headers: jsonHeaders(aliceToken),
      body: JSON.stringify({ name: 'urgent' }),
    });
    expect(tagRes.status).toBe(201);
    const tagBody = await tagRes.json();
    expect(tagBody.tag.name).toBe('urgent');

    const filteredRes = await app.request('/tasks?tag=urgent', { headers: authHeader(aliceToken) });
    expect(filteredRes.status).toBe(200);
    const filtered = await filteredRes.json();
    const found = filtered.tasks.find((t: { id: number }) => t.id === created.task.id);
    expect(found).toBeDefined();
    expect(found.tags.some((tag: { name: string }) => tag.name === 'urgent')).toBe(true);
  });

  it('detaches a tag from a task', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: jsonHeaders(aliceToken),
      body: JSON.stringify({ title: 'レビュー対応' }),
    });
    const created = await createRes.json();

    const tagRes = await app.request(`/tasks/${created.task.id}/tags`, {
      method: 'POST',
      headers: jsonHeaders(aliceToken),
      body: JSON.stringify({ name: 'review' }),
    });
    const tag = await tagRes.json();

    const detachRes = await app.request(`/tasks/${created.task.id}/tags/${tag.tag.id}`, {
      method: 'DELETE',
      headers: authHeader(aliceToken),
    });
    expect(detachRes.status).toBe(204);

    const listRes = await app.request(`/tasks/${created.task.id}`, { headers: authHeader(aliceToken) });
    const list = await listRes.json();
    expect(list.task.id).toBe(created.task.id);
  });

  it('paginates the task list when limit is given', async () => {
    for (const title of ['タスクA', 'タスクB', 'タスクC']) {
      await app.request('/tasks', {
        method: 'POST',
        headers: jsonHeaders(aliceToken),
        body: JSON.stringify({ title }),
      });
    }

    const pagedRes = await app.request('/tasks?limit=2', { headers: authHeader(aliceToken) });
    expect(pagedRes.status).toBe(200);
    const paged = await pagedRes.json();
    expect(Array.isArray(paged.tasks)).toBe(true);
    expect(paged.tasks.length).toBeLessThanOrEqual(2);
  });
});

describe('task sharing', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;
  let aliceToken: string;
  let bobToken: string;
  let bobId: number;

  beforeEach(() => {
    db = createDb(':memory:');
    app = createApp(db);
    aliceToken = 'alice-token';
    bobToken = 'bob-token';
    seedUser(db, 'alice', aliceToken);
    bobId = seedUser(db, 'bob', bobToken).id;
  });

  it('shares a task with another user and lets them see it in their shared list', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: jsonHeaders(aliceToken),
      body: JSON.stringify({ title: '共有する議事録' }),
    });
    const created = await createRes.json();

    const shareRes = await app.request(`/tasks/${created.task.id}/shares`, {
      method: 'POST',
      headers: jsonHeaders(aliceToken),
      body: JSON.stringify({ user_id: bobId }),
    });
    expect(shareRes.status).toBe(201);

    const sharedListRes = await app.request('/shared-tasks', { headers: authHeader(bobToken) });
    expect(sharedListRes.status).toBe(200);
    const sharedList = await sharedListRes.json();
    expect(sharedList.tasks.some((t: { id: number }) => t.id === created.task.id)).toBe(true);
  });

  it('rejects sharing a task that does not belong to the requester', async () => {
    const createRes = await app.request('/tasks', {
      method: 'POST',
      headers: jsonHeaders(bobToken),
      body: JSON.stringify({ title: 'ボブのタスク' }),
    });
    const created = await createRes.json();

    const shareRes = await app.request(`/tasks/${created.task.id}/shares`, {
      method: 'POST',
      headers: jsonHeaders(aliceToken),
      body: JSON.stringify({ user_id: bobId }),
    });
    expect(shareRes.status).toBe(404);
  });
});
