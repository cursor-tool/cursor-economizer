# Change Log

All notable changes to "Cursor Economizer" will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.9] - 2026-02-16

### Fixed

- テーブルヘッダーの sticky が無効になっていた不具合を修正 — スクロール時にヘッダー行が上部に固定されるよう復元

### Improved

- 公開スクリプトに staging リポジトリ検証を追加 — 誤って開発リポジトリから直接公開した場合に警告して中断

## [0.1.8] - 2026-02-16

### Added

- カラムリサイズ — ヘッダー右端のハンドルでカラム幅を調整可能（テーブル幅 100% 維持）
- カラム並べ替え — ヘッダーのグリップをドラッグして列順を変更可能（全ウィンドウ間で同期）
- 更新ボタンにスピナー表示 — データ取得中はアイコンが回転し、処理状況を視覚的にフィードバック

## [0.1.6] - 2026-02-16

### Improved

- テーブル行にホバーハイライトを追加 — マウスオーバーで対象行が視覚的に強調され、大量データ閲覧時の可読性を向上

## [0.1.5] - 2026-02-16

### Added

- テーブルフッターにデータ取得ボタンを追加 — 詳細view をウィンドウ外に移動させた場合でもステータスバーに依存せずデータ更新が可能に

## [0.1.4] - 2026-02-16

### Added

- **CSV エクスポート** — 利用データを CSV 形式でダウンロード（RFC 4180 準拠 / BOM 付き UTF-8）
- ステータスバーのツールチップに CSV エクスポートへのショートカットを追加
- README にステータスバー機能の詳細説明を追加

## [0.1.3] - 2026-02-15

### Changed

- アプリケーションアイコンを更新

### Fixed

- ステータスバーの Req 値が浮動小数点精度の問題で異常表示される不具合を修正（`.toFixed(2)` 適用）

## [0.1.2] - 2026-02-15

### Added

- GitHub Issue テンプレート（Bug Report / Feature Request）
- Pull Request テンプレート
- CONTRIBUTING.md / CODE_OF_CONDUCT.md
- README に Roadmap / Support セクションを追加

## [0.1.1] - 2026-02-15

### Added

- 6メーターダッシュボード（Eco / Free Quota / Today / 7 Days / Billing Cycle / Forecast）
- エコメーター閾値設定（`ecoMeterThreshold`）
- 日次利用目標設定（`dailyUsageGoal`）
- 月間予算目標設定（`monthlyBudgetGoal`）
- ユーザー情報表示（auth/me API 連携）
- チーム情報取得（teams / team members API 連携）
- カラム表示のカスタマイズ設定（KIND / MAX / TOKEN BASED / CHARGEABLE / HEADLESS / USER / FEE）

### Changed

- コスト計算を `total_cents` から `usage_based_costs`（ドル単位）に変更

## [0.1.0] - 2026-02-14

### Added

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
