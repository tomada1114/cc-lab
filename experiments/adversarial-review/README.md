# 検証: 敵対レビューは本当に「よく見つける」のか

同じ Pull Request に 3 条件のコードレビューを走らせ、**あらかじめ仕込んだ既知欠陥 7 件の検出率**を比較しました。

指摘の「件数」だけでは水増しと区別できないため、正解リスト（`ground-truth.md`）を先に用意しています。

## 対象

- PR: [#1 feat: タスクのタグ付け・共有とページネーションを追加](https://github.com/tomada1114/cc-lab/pull/1)
- 規模: `7 files changed, 421 insertions(+), 4 deletions(-)`
- `npm test` は 12 件すべて green（仕込んだ欠陥はテストで落ちない。現実の見逃しバグと同じ状況にするため）

## 条件

| 条件 | 実行 |
|---|---|
| ① Claude 通常レビュー | 独立した Claude サブエージェント（Opus 5） |
| ② 素の別 LLM レビュー | `codex-companion.mjs review --base main --scope branch` |
| ③ 敵対フレーミング | `codex-companion.mjs adversarial-review --base main --scope branch` |

3 条件とも「同じ diff を見る / 正解リストを知らない / 実質的な問題だけ報告する / 同じ構造で返す」に揃えています。①には敵対的な文言を一切入れていません。

## 結果

| 条件 | 総指摘 | 仕込み7件の検出 | 仕込み外の実在指摘 | 所要時間 |
|---|---|---|---|---|
| ① Claude 通常 | 10 件 | **7/7** | 3 件 | 5分37秒 |
| ② 素の Codex | 8 件 | 6/7 | 2 件 | 5分13秒 |
| ③ 敵対 Codex | 4 件 | 3/7 | 1 件 | 2分31秒 |

重大度別に見ると、**敵対レビューは critical / high を 100% 検出し、medium 以下を 1 件も報告していません**。

| 重大度 | 件数 | ①通常 | ②素 | ③敵対 |
|---|---|---|---|---|
| critical | 1 | ✓ | ✓ | ✓ |
| high | 2 | 2/2 | 2/2 | 2/2 |
| medium | 3 | 3/3 | 2/3 | 0/3 |
| low | 1 | ✓ | ✓ | ✗ |

見つけられなかったというより、報告基準を上げています。敵対レビューのプロンプトには次の指示が入っています。

```
<calibration_rules>
Prefer one strong finding over several weak ones.
Do not dilute serious issues with filler.
</calibration_rules>
```

## 交絡・限界

1. ② は `~/.codex/AGENTS.md`（リポジトリ外のグローバル設定）を根拠に挙げた指摘が 3 件あり、この個人設定が検出を助けた可能性がある。③ は独自プロンプトで上書きされるため参照していない
2. ① は Opus 5、②③ は Codex CLI（gpt-5 系）でモデルが違う。① が最多だったことを「Claude の方が優秀」とは読めない
3. n=1。LLM は非決定的なので再実行で変わりうる
4. 仕込んだ欠陥は「レビューで見つかりうる形」で作ったもので、現実のバグ分布とは異なる

## ファイル

| ファイル | 中身 |
|---|---|
| `ground-truth.md` | 仕込んだ欠陥 7 件の正解リスト（場所・抜粋・影響・重大度） |
| `raw/cond1-claude-normal.json` | ① の生出力 |
| `raw/cond2-codex-review.txt` | ② の実行ログ全文 |
| `raw/cond3-codex-adversarial.txt` | ③ の実行ログ全文 |
