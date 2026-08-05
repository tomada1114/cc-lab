import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import { authMiddleware, type AuthEnv } from './auth.js';
import { createTaskRoutes } from './tasks.js';

/**
 * Hono アプリを組み立てる。DB を外から注入できるようにして、
 * テストではインメモリ DB を使えるようにする。
 */
export function createApp(db: DatabaseSync): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/tasks/*', authMiddleware(db));
  app.use('/tasks', authMiddleware(db));
  app.route('/tasks', createTaskRoutes(db));

  return app;
}
