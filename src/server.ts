import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createDb, seedUser, findUserByToken } from './db.js';

const DB_PATH = process.env.DB_PATH ?? 'data.sqlite3';
const db = createDb(DB_PATH);

// 開発用の初期ユーザーが居なければ作る（トークンは環境変数で上書き可能）
const devToken = process.env.DEV_TOKEN ?? 'dev-token';
if (!findUserByToken(db, devToken)) {
  seedUser(db, 'dev-user', devToken);
}

const app = createApp(db);
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`cc-lab task API listening on http://localhost:${info.port}`);
});
