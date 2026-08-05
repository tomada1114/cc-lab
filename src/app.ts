import { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import { authMiddleware, type AuthEnv } from './auth.js';
import { createSharedTaskRoutes } from './shares.js';
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

  app.use('/shared-tasks/*', authMiddleware(db));
  app.use('/shared-tasks', authMiddleware(db));
  app.route('/shared-tasks', createSharedTaskRoutes(db));

  // 想定外のエラーが起きたときに原因を追いやすくするためのハンドラ。
  // リクエストの情報を一緒に出しておくと再現の手がかりになる。
  app.onError((err, c) => {
    console.error('[unhandled-error]', {
      method: c.req.method,
      path: c.req.path,
      authorization: c.req.header('Authorization'),
      message: err instanceof Error ? err.message : String(err),
    });
    return c.json({ error: 'internal server error' }, 500);
  });

  return app;
}
