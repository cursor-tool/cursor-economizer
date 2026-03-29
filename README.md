# Cursor Economizer

[![Version](https://img.shields.io/visual-studio-marketplace/v/pacific-system.cursor-economizer)](https://marketplace.visualstudio.com/items?itemName=pacific-system.cursor-economizer)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/pacific-system.cursor-economizer)](https://marketplace.visualstudio.com/items?itemName=pacific-system.cursor-economizer)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/pacific-system.cursor-economizer)](https://marketplace.visualstudio.com/items?itemName=pacific-system.cursor-economizer)
[![License](https://img.shields.io/github/license/cursor-tool/cursor-economizer)](LICENSE)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen)](CONTRIBUTING.md)
[![Open VSX](https://img.shields.io/open-vsx/v/pacific-system/cursor-economizer)](https://open-vsx.org/extension/pacific-system/cursor-economizer)
[![GitHub Stars](https://img.shields.io/github/stars/cursor-tool/cursor-economizer)](https://github.com/cursor-tool/cursor-economizer)
[![GitHub Issues](https://img.shields.io/github/issues/cursor-tool/cursor-economizer)](https://github.com/cursor-tool/cursor-economizer/issues)
[![Last Commit](https://img.shields.io/github/last-commit/cursor-tool/cursor-economizer)](https://github.com/cursor-tool/cursor-economizer/commits/main)

> **Cursor Economizer** is a VS Code / Cursor extension that **tracks, analyzes, and forecasts** your Cursor AI usage costs in real time. Featuring a **7-meter analytics dashboard**, **budget goals**, **Plan Quota / Plan Bonus monitoring**, **CSV export**, and **SQLite persistence** — all without sending data externally.
>
> **Cursor Economizer** は Cursor AI の利用料金を**リアルタイムで追跡・分析・予測**する VS Code / Cursor 拡張機能です。**7種メーターダッシュボード**、**予算管理**、**プランクォータ / プランボーナス監視**、**CSVエクスポート**、**SQLite 永続化**を備え、外部送信は一切ありません。

![Extension Screenshot](img/SS.png)

---

## Why Cursor Economizer? / なぜ Cursor Economizer？

Cursor's built-in dashboard shows basic totals. Cursor Economizer gives you **granular, real-time cost analytics** you can't get anywhere else.

Cursor 公式ダッシュボードでは合計値しか確認できません。Cursor Economizer は**リクエスト単位のリアルタイムコスト分析**を提供します。

| Capability | Cursor Dashboard | Cursor Economizer |
| --- | --- | --- |
| Real-time cost per request / リクエスト単位のリアルタイムコスト | - | ✅ |
| 7-meter analytics (Eco / Today / 7d / Cycle / Forecast / Quota / Bonus) | - | ✅ |
| Plan Bonus visibility / プランボーナス可視化 | - | ✅ |
| Budget goals (daily / monthly) / 予算目標（日次・月次） | - | ✅ |
| CSV export / CSV エクスポート | - | ✅ |
| Memo per request / リクエスト別メモ | - | ✅ |
| Offline SQLite persistence / オフライン SQLite 永続化 | - | ✅ |
| Auto refresh & cleanup / 自動更新・自動削除 | - | ✅ |

---

## Features / 機能

### Real-Time Status Bar Monitoring / ステータスバー監視

See cost emoji, token count, and request cost at a glance — updated automatically every 1–15 minutes.

ステータスバーにコスト絵文字・トークン数・リクエスト単価をリアルタイム表示。1〜15分間隔で自動更新。

### 7-Meter Analytics Dashboard / 7種メーターダッシュボード

Two-row meter layout for complete cost visibility:

- **Token row:** Eco / Today / 7 Days / Billing Cycle / Forecast / Plan Quota / Plan Bonus
- **COST row:** Eco / Today / 7 Days / Billing Cycle / Forecast (appears only with On-Demand usage)

コスト全体を把握する2段メーターレイアウト:

- **Token 行:** Eco / Today / 7 Days / Billing Cycle / Forecast / Plan Quota / Plan Bonus
- **COST 行:** Eco / Today / 7 Days / Billing Cycle / Forecast（On-Demand 利用がある場合のみ表示）

### Detailed Usage Table / 詳細テーブル

Event list with filter, pagination, column resize, column reorder, and inline memo editing.

フィルタ・ページネーション・列幅変更・列順序変更・インラインメモ編集付きイベント一覧。

### Plan Bonus Monitoring / プランボーナス監視

Plan bonuses are not publicly disclosed and cannot be checked on the official site. Cursor Economizer visualizes this bonus quota, showing the granted amount and consumption on a meter. Knowing the remaining balance in advance helps you plan your coding sessions.

プランボーナスは公式に公開されておらず、公式サイトからも残量を確認できません。Cursor Economizer はこのボーナス枠を可視化し、加算量と消費量をメーターで表示します。

![Plan Bonus](img/plan_bonus.png)

> Only displayed when a bonus exists. Bonuses can increase dynamically mid-cycle, and the meter reflects changes in real time.
>
> ボーナスが発生している場合のみ表示されます。ボーナスは課金期間中に動的に増加することがあり、メーターはリアルタイムに反映します。

### Memo Feature / メモ機能

Save notes per usage record for project names, goals, and reminders. Click the MEMO column to edit, click outside to save, or press `Escape` to cancel. IME-friendly.

各利用レコードにメモを保存できます。案件名・目的・注意点などを残せます。MEMO 列をクリックして編集し、エリア外クリックで保存、`Escape` でキャンセル。IME 対応。

![Memo Feature](img/image.png)

### CSV Export / CSV エクスポート

Export your usage data in RFC 4180 compliant, BOM-encoded UTF-8 CSV format for spreadsheet analysis and expense reporting.

利用データを RFC 4180 準拠・BOM 付き UTF-8 CSV で出力。スプレッドシート分析や経費報告に。

### Budget Goals / 予算管理

Set daily and monthly budget goals to keep your Cursor AI spending under control. The dashboard meters visualize your progress toward each goal.

日次・月次の予算目標を設定して Cursor AI の支出を管理。ダッシュボードメーターで目標に対する進捗を可視化。

### SQLite Persistence / SQLite 永続化

All data stored locally in SQLite — synced across multiple VS Code windows, no external transmission.

全データをローカル SQLite に保存。複数ウィンドウ間同期、外部送信なし。

### Auto Refresh & Cleanup / 自動更新・自動削除

Automatic data fetch at 1–15 minute intervals. Auto-delete old data by configurable retention days.

1〜15分間隔で自動データ取得。保持日数指定で古いデータを自動削除。

### i18n / 多言語対応

English and Japanese fully supported.

英語・日本語完全対応。

---

## Setup / セットアップ

### 1. Get Token / トークン取得

Copy the `WorkosCursorSessionToken` cookie value from [cursor.com/dashboard](https://cursor.com/dashboard).

[cursor.com/dashboard](https://cursor.com/dashboard) → `F12` → **Application** → **Cookies** → `WorkosCursorSessionToken` をコピー

![Get Token](img/get_token.png)

### 2. Set Token / トークン設定

Set your token using either method:

以下のいずれかでトークンを設定できます。

- Command Palette → `Cursor Economizer: Set Token`
  コマンドパレット → `Cursor Economizer: トークン設定`
- Status bar tooltip → 🔑
  ステータスバーのツールチップ → 🔑

### 3. Menu Access / メニューアクセス

Hover over the status bar to access all commands.

ステータスバーにマウスオーバーすると、各コマンドにアクセスできます。

💹 Detail / 詳細 | 🔄️ Refresh / 更新 | 🔑 Token / トークン設定 | 📥 CSV Export / CSV エクスポート | ⚙️ Settings / 設定

You can increase or decrease visible columns from tooltip `⚙️`.

ツールチップの `⚙️` から、表示カラムの増減ができます。

![Tooltip](img/tool_tip.png)

> Token is encrypted in SecretStorage. Never exposed in settings, logs, or Webview.
>
> トークンは SecretStorage に暗号化保存されます。設定画面・ログ・Webview に露出しません。

---

## Status Bar / ステータスバー

Shows the latest request info. Click to manually refresh.

ステータスバーに直近リクエストの情報を表示します。クリックで手動更新。

### Display Format / 表示形式

`{emoji} {cost} | {tokens} | Req {request_cost}`

### Cost Emoji / コスト絵文字

| Emoji | Condition           | Status (English)         | Status (日本語)             |
| ----- | ------------------- | ------------------------ | --------------------------- |
| 💎    | INCLUDED ($0 token) | Included ($0 token cost) | プラン内利用（トークン $0） |
| 🆓    | $0                  | Free                     | 無料                        |
| ✅    | < $0.20             | Low                      | 低コスト                    |
| ⚠️    | $0.20–$0.50         | Caution                  | 注意                        |
| 🚨    | $0.50–$1.00         | Warning                  | 警告                        |
| 🔥    | $1.00–$3.00         | High                     | 高コスト                    |
| ☠️    | $3.00–$10.00        | Very High                | 超高コスト                  |
| 🥶    | > $10.00            | Critical                 | 危険                        |
| ❌    | ERRORED             | Error                    | エラー                      |

> For INCLUDED events with token cost (`total_cents`) > $0, the cost-tier emoji (✅–🥶) is applied based on token cost.
>
> INCLUDED イベントでトークンコスト (`total_cents`) が $0 超の場合は、トークンコストに基づいて ✅〜🥶 の段階判定が適用されます。

---

## Detail Table / 詳細テーブル

Open the table from Command Palette → `Cursor Economizer: Open Detail`, or tooltip `💹 Detail`.

コマンドパレット → `Cursor Economizer: 詳細を開く`、またはツールチップの `💹 詳細` でテーブルを表示。

| Operation  | 操作       | Method                      | 方法                         |
| ---------- | ---------- | --------------------------- | ---------------------------- |
| Filter     | フィルタ   | Header input                | ヘッダー入力欄               |
| Pagination | ページ切替 | Table footer                | テーブル下部                 |
| Resize     | 列幅変更   | Drag header border          | ヘッダー境界ドラッグ         |
| Reorder    | 列順序変更 | Drag and drop header        | ヘッダーD&D                  |
| Edit Memo  | メモ編集   | Click MEMO then press Enter | MEMO 列クリック → Enter 保存 |
| Refresh    | データ更新 | Bottom-right refresh button | 右下の更新ボタン             |

---

## Commands / コマンド

| Command                           | Description       | 説明             | Tooltip |
| --------------------------------- | ----------------- | ---------------- | ------- |
| `Cursor Economizer: Refresh Data` | Fetch latest data | データ取得       | 🔄️      |
| `Cursor Economizer: Set Token`    | Set token         | トークン設定     | 🔑      |
| `Cursor Economizer: Clear Token`  | Delete token      | トークン削除     | -       |
| `Cursor Economizer: Open Detail`  | Open detail table | 詳細テーブル表示 | 💹      |
| `Cursor Economizer: Export CSV`   | Export CSV        | CSV エクスポート | 📥      |

---

## Configuration / 設定

### General / 一般

| Setting                      | Description               | 説明                      | Default |
| ---------------------------- | ------------------------- | ------------------------- | ------- |
| `autoRefreshEnabled`         | Auto refresh              | 自動更新                  | `true`  |
| `autoRefreshIntervalMinutes` | Interval (1–15 min)       | 更新間隔（1〜15分）       | `3`     |
| `autoDeleteDays`             | Auto delete (days, 0=off) | 自動削除（日数、0で無効） | `90`    |

### Goals / 目標

| Setting             | Description                     | 説明             | Default |
| ------------------- | ------------------------------- | ---------------- | ------- |
| `ecoMeterThreshold` | Eco meter threshold ($)         | エコメーター閾値 | `1`     |
| `dailyUsageGoal`    | Daily goal ($, 0=unlimited)     | 日次目標         | `10`    |
| `monthlyBudgetGoal` | Monthly budget ($, 0=unlimited) | 月間予算         | `300`   |

### Table / テーブル

| Setting    | Description   | 説明     | Default |
| ---------- | ------------- | -------- | ------- |
| `pageSize` | Rows per page | 表示行数 | `500`   |

### Column Visibility / カラム表示

| Setting                      | Column      | Description       | 説明         | Default |
| ---------------------------- | ----------- | ----------------- | ------------ | ------- |
| `columns.kind.visible`       | KIND        | Kind              | 種別         | `false` |
| `columns.maxMode.visible`    | MAX         | Max mode          | MAXモード    | `false` |
| `columns.tokenBased.visible` | TOKEN BASED | Token-based       | トークン課金 | `false` |
| `columns.chargeable.visible` | CHARGEABLE  | Chargeable        | 課金対象     | `false` |
| `columns.headless.visible`   | HEADLESS    | Headless          | ヘッドレス   | `false` |
| `columns.user.visible`       | USER        | User              | ユーザー     | `false` |
| `columns.fee.visible`        | FEE         | Fee               | 手数料       | `false` |

---

## FAQ / よくある質問

### How is Cursor Economizer different from Cursor's built-in usage page?

Cursor's dashboard shows aggregated totals. Cursor Economizer provides **per-request cost tracking**, a **7-meter analytics dashboard** with forecasting, **Plan Bonus visibility** (not available anywhere else), **budget goal management**, **CSV export**, and **offline SQLite persistence**.

Cursor の公式ダッシュボードは合計値のみです。Cursor Economizer は**リクエスト単位のコスト追跡**、予測付き**7種メーターダッシュボード**、**プランボーナス可視化**（他では確認不可）、**予算管理**、**CSV エクスポート**、**オフライン SQLite 永続化**を提供します。

### Does it work with Cursor's Free plan?

Yes. Cursor Economizer supports all Cursor plans including Free, Pro, and Business. Free plan users get dedicated Free Quota monitoring with a $9 / 200¢ limit meter.

はい。Free・Pro・Business すべてのプランに対応しています。Free プランでは $9 / 200¢ の専用クォータメーターが表示されます。

### What is the Plan Bonus meter?

Plan Bonus is an undisclosed quota that Cursor grants dynamically during billing cycles. It cannot be checked on the official site. Cursor Economizer is the only tool that visualizes this bonus — showing granted amount, consumption, and remaining balance.

プランボーナスは Cursor が課金期間中に動的に付与する非公開クォータです。公式サイトでは確認できません。Cursor Economizer はこのボーナスを可視化する唯一のツールで、付与量・消費量・残量を表示します。

### Can I export my usage data?

Yes. Use Command Palette → `Cursor Economizer: Export CSV` or the 📥 tooltip button. The output is RFC 4180 compliant, BOM-encoded UTF-8 — ready for Excel, Google Sheets, or expense reporting tools.

はい。コマンドパレット → `Cursor Economizer: CSV エクスポート` またはツールチップの 📥 から出力できます。RFC 4180 準拠・BOM 付き UTF-8 で、Excel・Google Sheets・経費精算ツールにそのまま使えます。

### Is my token safe?

Your token is encrypted in VS Code's SecretStorage and never exposed in settings, logs, or the Webview. No data is sent to external servers — all processing happens locally.

トークンは VS Code の SecretStorage に暗号化保存されます。設定画面・ログ・Webview に一切露出しません。外部サーバーへのデータ送信もありません。すべてローカルで処理されます。

### How do I set budget goals?

Open VS Code Settings → search `Cursor Economizer` → set `dailyUsageGoal` (daily limit in $) and `monthlyBudgetGoal` (monthly limit in $). The dashboard meters will visualize your progress toward each goal. Set `0` for unlimited.

VS Code の設定 → `Cursor Economizer` で検索 → `dailyUsageGoal`（日次上限 $）と `monthlyBudgetGoal`（月次上限 $）を設定。ダッシュボードメーターで目標に対する進捗が可視化されます。`0` で無制限。

---

## Troubleshooting / トラブルシューティング

| Symptom       | 症状             | Solution                           | 対処                                  |
| ------------- | ---------------- | ---------------------------------- | ------------------------------------- |
| Token not set | トークン未設定   | Follow setup steps                 | Setup の手順でトークンを設定          |
| Fetch error   | データ取得エラー | Re-login and get a new token       | cursor.com にログイン後トークン再取得 |
| No data       | データ未表示     | Manual fetch after using Cursor AI | Cursor AI 使用後に手動取得            |

---

## Fast Update Policy / 変更追随ポリシー

We aim to quickly follow Cursor plan expansions and structural changes. Spec changes may temporarily affect display or aggregation. When users share details, we can deliver fixes even faster.

Cursor のプラン増設・構成変更には、できるだけ早く追随します。仕様変更の影響で表示や集計に差分が出る場合があります。ユーザーから情報提供をいただけると修正がさらに速くなります。

### How You Can Help / ご協力のお願い

- New response JSON sample (with sensitive data masked)
  新しいレスポンス JSON（機密情報をマスクしたサンプル）
- Time of occurrence, plan type, and reproduction steps
  発生日時、利用プラン、再現手順
- What changed, where it changed, and screenshots if possible
  どの画面で、何が、どう変わったか（スクリーンショット歓迎）

Shared information is used only to accelerate compatibility updates.
提供いただいた情報は、プラン変更への迅速な追随にのみ利用します。

Please report and share details via [Issues](https://github.com/cursor-tool/cursor-economizer/issues).
報告・情報提供は [Issues](https://github.com/cursor-tool/cursor-economizer/issues) で受け付けています。

---

## Contributing

Contributions welcome. / コントリビューション歓迎。

1. Fork → `git checkout -b feature/amazing-feature` → PR

## License

MIT

## Privacy / プライバシー

Token stored only in SecretStorage. No external transmission.
トークンは SecretStorage のみに保存。外部送信なし。

## Roadmap

- ~~**CSV Export / CSV エクスポート**~~ ✅ v0.1.4
- **Cost Tags** — Categorized cost tracking
  **コストタグ** — タグ別コスト集計

Feedback welcome via [Issues](https://github.com/cursor-tool/cursor-economizer/issues).
[Issues](https://github.com/cursor-tool/cursor-economizer/issues) でフィードバック受付中。

## Support This Project

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/pacificsystem)

- [GitHub Sponsors](https://github.com/sponsors/cursor-tool)

Donations are optional. / 寄付は任意です。
