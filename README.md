# cc-lab

Claude Code と AI 駆動開発まわりを実際に手で動かして確かめるための、**検証用サンドボックス**です。

> [!WARNING]
> **このリポジトリのコードは意図的に欠陥を含みます。**
> AI レビューツールの比較検証などのために、わざとバグやアンチパターンを仕込んだブランチ・PR があります。実装の参考にはしないでください。

## 何のためのリポジトリか

「AI にコードレビューさせるとどこまで見つかるのか」「この設定を変えると挙動がどう変わるのか」といった検証は、実際のプロジェクトでやると邪魔になります。かといって空のリポジトリでは題材が薄すぎて差が出ません。

そこで、**レビューしがいのある程度には現実的なアプリ**を1つ置いて、その上で検証を回す場所として用意しました。

## 中身

| 場所 | 中身 |
|---|---|
| `src/` | 題材アプリ。TypeScript + Hono のタスク管理 API |
| `experiments/` | 検証ごとの記録（目的・手順・生ログ・集計） |

## 検証一覧

| 検証 | 内容 | 記録 |
|---|---|---|
| adversarial-review | 同じ PR に対する 3 条件のレビュー比較（通常レビュー / 素の別 LLM / 敵対フレーミング） | `experiments/adversarial-review/` |

## 題材アプリの動かし方

```bash
npm install
npm test        # テスト
npm run dev     # 開発サーバ（http://localhost:3000）
```

### API概要

タスクの CRUD に加えて、タグ付け・ページネーション・タスク共有に対応。

- `GET /tasks` — タスク一覧。`?tag=<name>` でタグ絞り込み、`?page=&limit=` でページネーション（**page は 1 始まり**）
- `POST /tasks` / `GET /tasks/:id` / `PATCH /tasks/:id` / `DELETE /tasks/:id` — タスクの CRUD
- `POST /tasks/:id/tags` / `DELETE /tasks/:id/tags/:tagId` — タスクへのタグ付け・解除
- `POST /tasks/:id/shares` — タスクを他ユーザーに共有
- `GET /tasks/:id/shares` — タスクの共有先一覧
- `GET /shared-tasks` — 自分に共有されたタスク一覧
