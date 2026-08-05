# cc-lab PR#1 (feature/task-tags-and-sharing) 仕込んだ欠陥 正解リスト

- リポジトリ: tomada1114/cc-lab
- PR: https://github.com/tomada1114/cc-lab/pull/1
- 比較対象コミット: `main` (65e78c7) → `feature/task-tags-and-sharing` (f645582)
- 本ファイルはレビュー検証の正解データ。**レビュアー側のコンテキストには絶対に見せないこと。**

## 1. 認可チェック漏れ（IDOR）

- **ファイル/行**: `src/tasks.ts:253-267`（特に259行目）
- **抜粋**:
  ```ts
  app.get('/:id/shares', (c) => {
    ...
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as TaskRow | undefined;
  ```
- **影響**: `GET /tasks/:id/shares` は認証（トークン）は要求するが、リクエストしたユーザーがそのタスクの所有者か共有先かを一切確認していない。認証済みの任意のユーザーが、他人の任意のタスクの内容（title/description等）と共有先一覧を `id` を変えるだけで閲覧できる。実機検証済み（bobトークンでaliceのタスクを取得できることを確認）。
- **重大度**: critical

## 2. 秘密情報のログ出力（Authorization ヘッダのログ出力）

- **ファイル/行**: `src/app.ts:26-34`（特に30行目 `authorization: c.req.header('Authorization')`）
- **抜粋**:
  ```ts
  app.onError((err, c) => {
    console.error('[unhandled-error]', {
      method: c.req.method,
      path: c.req.path,
      authorization: c.req.header('Authorization'),
  ```
- **影響**: 未処理エラー発生時、`Authorization: Bearer <token>` を含むヘッダをそのまま `console.error` に出力する。ログ基盤に転送されると生トークンが漏洩し、トークンを知る第三者がなりすましできる。
- **重大度**: high

## 3. エラーの握り潰し（空 catch）

- **ファイル/行**: `src/tags.ts:35-47`（特に44-46行目の `catch { return []; }`）
- **抜粋**:
  ```ts
  export function getTagsForTask(db: DatabaseSyncType, taskId: number): TagRow[] {
    try {
      ...
    } catch {
      return [];
    }
  }
  ```
- **影響**: タグ取得でDBエラー（ロック、破損、スキーマ不整合等）が起きても例外を握り潰し、「タグ0件」として正常応答してしまう。障害がサイレントに隠蔽され、監視・アラートに引っかからない。
- **重大度**: medium

## 4. off-by-one（ページネーション）

- **ファイル/行**: `src/tasks.ts:44-46`
- **抜粋**:
  ```ts
  const page = Number(c.req.query('page') ?? DEFAULT_PAGE);
  const limit = Number(limitParam);
  const offset = page * limit;
  ```
- **仕様の記載箇所**: `README.md`（「`?page=&limit=` でページネーション（**page は 1 始まり**）」）、および `src/tasks.ts:34` のコメント「page/limit を指定するとページネーションされる。page は 1 始まり。」
- **影響**: `page` は1始まりの仕様なのに `offset = page * limit` としているため、`page=1` を指定すると本来先頭であるべき1ページ目が丸ごとスキップされる（正しくは `(page - 1) * limit`）。実機検証済み（タスク1件・`limit=10`・page省略=1扱いで一覧が空になることを確認）。
- **重大度**: high

## 5. 入力バリデーション欠落（limit の未クランプ）

- **ファイル/行**: `src/tasks.ts:45`（`const limit = Number(limitParam);`）
- **抜粋**:
  ```ts
  const limit = Number(limitParam);
  const offset = page * limit;
  ...
  .all(user.id, tag, limit, offset)
  ```
- **影響**: `limit` クエリパラメータを上限クランプなし・NaN未処理でそのままSQLの `LIMIT`/`OFFSET` に渡している。巨大な値（例: `limit=999999999`）や非数値文字列（`Number('abc')` → `NaN`）がそのままバインドされ、リソース枯渇やDB側の予期しない挙動を招きうる。
- **重大度**: medium

## 6. N+1 クエリ

- **ファイル/行**: `src/tasks.ts:75-78`（`getTagsForTask` 自体は `src/tags.ts:35-47`）
- **抜粋**:
  ```ts
  const tasksWithTags = [];
  for (const task of rows) {
    tasksWithTags.push({ ...task, tags: getTagsForTask(db, task.id) });
  }
  ```
- **影響**: タスク一覧取得後、取得件数分だけ `for` ループ内でタグ取得の SELECT を1件ずつ発行している（`getTagsForTask` は呼び出しごとに独立したクエリ）。一覧取得がタスク件数に比例したクエリ数になり、件数増加でレイテンシが線形悪化する。
- **重大度**: low

## 7. 競合状態（check-then-act, 共有の重複挿入）

- **ファイル/行**: `src/tasks.ts:237-247`
- **抜粋**:
  ```ts
  const already = db
    .prepare('SELECT id FROM task_shares WHERE task_id = ? AND shared_with_user_id = ?')
    .get(id, targetUserId);
  if (already) {
    return c.json({ error: 'already shared' }, 409);
  }
  ...
  const result = db
    .prepare('INSERT INTO task_shares (task_id, shared_with_user_id, created_at) VALUES (?, ?, ?)')
    .run(id, targetUserId, now);
  ```
- **スキーマ**: `src/db.ts` の `task_shares` テーブル定義に `UNIQUE(task_id, shared_with_user_id)` 制約なし（同ファイル内、`CREATE TABLE IF NOT EXISTS task_shares (...)` ブロック）。
- **影響**: 「既存共有のSELECT → 無ければINSERT」をトランザクションなし・DB側のUNIQUE制約なしで実装している。同一タスク・同一共有先への共有リクエストが同時に複数来た場合、両方がSELECT時点で「未共有」と判定し、どちらもINSERTしてしまい `task_shares` に重複行ができうる（アプリ側の重複防止ロジックが実質無効化される）。
- **重大度**: medium

---

## まとめ表

| # | 欠陥 | ファイル:行 | 重大度 |
|---|---|---|---|
| 1 | IDOR（共有経由のタスク取得） | src/tasks.ts:253-267 | critical |
| 2 | Authorizationヘッダのログ出力 | src/app.ts:26-34 | high |
| 3 | エラーの握り潰し（空catch） | src/tags.ts:35-47 | medium |
| 4 | off-by-one（ページネーション） | src/tasks.ts:44-46 | high |
| 5 | limit未クランプ | src/tasks.ts:45 | medium |
| 6 | N+1クエリ | src/tasks.ts:75-78 | low |
| 7 | 競合状態（共有の重複挿入） | src/tasks.ts:237-247 | medium |

## テストで検出されないことの確認

`npm test` は12件全て green（既存7件 + 新規5件）。新規テスト（`tests/tags-and-sharing.test.ts`）は正常系中心で、以下は意図的に未検証:
- IDORの負のケース（他人トークンで `GET /tasks/:id/shares` を叩く）
- ページネーションの厳密な件数・内容一致（`limit=2`のテストは `length <= 2` のみ確認し、off-by-oneで空/ズレになっても失敗しない）
- limitの異常値
- 共有作成の同時リクエスト（競合状態）
- タグ取得のDBエラー時の握り潰し
- onErrorハンドラの発火（ログ出力の中身）
