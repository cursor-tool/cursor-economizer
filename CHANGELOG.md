# Change Log

All notable changes to "Cursor Economizer" will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.15] - 2026-02-20

- 軽微なバグの修正

---

- Minor bug fixes

## [0.1.14] - 2026-02-19

- Free Quota の算定方法を total_cents の課金期間合計（上限 200¢）に変更
- 軽微なバグの修正

---

- Changed Free Quota calculation to billing-cycle total of total_cents (limit: 200¢)
- Minor bug fixes

## [0.1.13] - 2026-02-19

- 無料プランの Free Quota を $9 でモニタリングする機能を追加
- トークン変更時にデータを自動再取得するよう改善

---

- Added Free Quota monitoring for the Free plan with a $9 limit
- Improved automatic data refresh when the token is changed

## [0.1.12] - 2026-02-19

- 無料プランでトークンを設定してもデータが表示されないバグを修正
- 無料プランでデータ取得後に不要な警告が表示されていた問題を修正

---

- Fixed a bug where data was not displayed after setting a token on the Free plan
- Fixed unnecessary warning messages appearing after data fetch on the Free plan

## [0.1.11] - 2026-02-17

- Webview リロードショートカット — Cmd+R（Mac）/ Ctrl+R / F5 でデータ再取得が可能に

---

- Added Webview reload shortcut — Cmd+R (Mac) / Ctrl+R / F5 now triggers data refresh

## [0.1.10] - 2026-02-16

- パッケージサイズを最適化 — .vscodeignore 追加により不要ファイルを除外（52 MB → 6 MB）

---

- Optimized package size — added .vscodeignore to exclude unnecessary files (52 MB → 6 MB)

## [0.1.9] - 2026-02-16

- スクロール時にテーブルのヘッダー行が固定されなくなっていた不具合を修正

---

- Fixed a bug where the table header did not stay visible while scrolling

## [0.1.8] - 2026-02-16

- 列幅をドラッグで調整できるようになりました
- 列の並び順をドラッグで変更できるようになりました
- データ取得中に更新ボタンがくるくる回転するようになりました

---

- Columns can now be resized by dragging
- Column order can now be changed by dragging
- The refresh button now spins while data is being fetched

## [0.1.6] - 2026-02-16

- テーブル行にホバーハイライトを追加 — マウスオーバーで対象行が視覚的に強調され、大量データ閲覧時の可読性を向上

---

- Added hover highlight to table rows — hovered row is visually emphasized, improving readability when browsing large datasets

## [0.1.5] - 2026-02-16

- テーブルフッターにデータ取得ボタンを追加 — 詳細view をウィンドウ外に移動させた場合でもステータスバーに依存せずデータ更新が可能に

---

- Added data refresh button to the table footer — data can now be refreshed without relying on the status bar, even when the detail view is moved outside the window

## [0.1.4] - 2026-02-16

- **CSV エクスポート** — 利用データを CSV 形式でダウンロード（RFC 4180 準拠 / BOM 付き UTF-8）
- ステータスバーのツールチップに CSV エクスポートへのショートカットを追加

---

- **CSV export** — download usage data in CSV format (RFC 4180 compliant / BOM-encoded UTF-8)
- Added CSV export shortcut to the status bar tooltip

## [0.1.3] - 2026-02-15

- アプリケーションアイコンを更新
- ステータスバーの Req 値が浮動小数点精度の問題で異常表示される不具合を修正（`.toFixed(2)` 適用）

---

- Updated application icon
- Fixed Req value in the status bar showing incorrect numbers due to floating-point precision (applied `.toFixed(2)`)

## [0.1.2] - 2026-02-15

- バグ報告・機能要望の Issue テンプレートを追加

---

- Added Issue templates for bug reports and feature requests

## [0.1.1] - 2026-02-15

- 6メーターダッシュボード（Eco / Free Quota / Today / 7 Days / Billing Cycle / Forecast）
- エコメーター閾値設定（`ecoMeterThreshold`）
- 日次利用目標設定（`dailyUsageGoal`）
- 月間予算目標設定（`monthlyBudgetGoal`）
- ユーザー情報表示（auth/me API 連携）
- チーム情報取得（teams / team members API 連携）
- カラム表示のカスタマイズ設定（KIND / MAX / TOKEN BASED / CHARGEABLE / HEADLESS / USER / FEE）
- コスト計算を `total_cents` から `usage_based_costs`（ドル単位）に変更

---

- 6-meter dashboard (Eco / Free Quota / Today / 7 Days / Billing Cycle / Forecast)
- Eco meter threshold setting (`ecoMeterThreshold`)
- Daily usage goal setting (`dailyUsageGoal`)
- Monthly budget goal setting (`monthlyBudgetGoal`)
- User info display (auth/me API integration)
- Team info fetch (teams / team members API integration)
- Column visibility customization (KIND / MAX / TOKEN BASED / CHARGEABLE / HEADLESS / USER / FEE)
- Changed cost calculation from `total_cents` to `usage_based_costs` (dollar unit)

## [0.1.0] - 2026-02-14

- 初回リリース
- ステータスバーにリアルタイム利用状況を表示（コスト絵文字 / トークン数 / リクエストコスト）
- 詳細テーブルビュー（TanStack Table: フィルタ・ソート・ページネーション）
- メモ機能（各利用レコードにメモ追加・編集 / 日本語 IME 対応）
- サマリカード（課金サイクル / プラン利用率 / オンデマンド支出）
- 自動更新（1〜15分間隔で設定可能）
- SQLite 永続化（複数ウィンドウ間で同期）
- 自動データ削除（保持日数設定）
- クロスウィンドウ排他制御（fetch.lock / db-updated.json）
- i18n 対応（英語 / 日本語）

---

- Initial release
- Real-time usage display in the status bar (cost emoji / token count / request cost)
- Detailed table view (TanStack Table: filter / sort / pagination)
- Memo feature (add/edit notes per usage record / Japanese IME supported)
- Summary card (billing cycle / plan usage rate / on-demand spending)
- Auto refresh (configurable interval: 1–15 minutes)
- SQLite persistence (synchronized across multiple windows)
- Automatic data deletion (configurable retention days)
- Cross-window exclusive control (fetch.lock / db-updated.json)
- i18n support (English / Japanese)
