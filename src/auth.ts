import type { MiddlewareHandler } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import { findUserByToken, type UserRow } from './db.js';

export interface AuthEnv {
  Variables: {
    user: UserRow;
  };
}

/**
 * `Authorization: Bearer <token>` を検証し、users テーブルと突き合わせて
 * リクエストのユーザーを特定するミドルウェア。
 */
export function authMiddleware(db: DatabaseSync): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = header.slice('Bearer '.length).trim();
    const user = findUserByToken(db, token);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('user', user);
    await next();
  };
}
