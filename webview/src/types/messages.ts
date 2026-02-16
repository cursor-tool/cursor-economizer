/**
 * Extension Host ↔ Webview 間の postMessage 型定義。
 * Extension Host 側の型（src/types/usageEvent.ts）からは独立。
 * Webview 用の行型は raw_json / id を除外して定義する。
 */

// --- Webview 用 DB 行型 ---

/**
 * usage_events テーブルの Webview 用行型。
 * Extension Host 側 UsageEventRow から id / raw_json を除外した 20 フィールド。
 */
export interface WebviewUsageEventRow {
    timestamp: string
    model: string
    kind: string
    max_mode: number | null
    requests_costs: number | null
    usage_based_costs: number
    is_token_based_call: number
    input_tokens: number
    output_tokens: number
    cache_write_tokens: number
    cache_read_tokens: number
    total_cents: number
    owning_user: string
    owning_team: string
    cursor_token_fee: number
    is_chargeable: number
    is_headless: number
    fetched_at: string
    note: string
}

/**
 * usage_summary テーブルの Webview 用行型。
 * Extension Host 側 UsageSummaryRow から id / raw_json を除外した 23 フィールド。
 */
export interface WebviewUsageSummaryRow {
    billing_cycle_start: string
    billing_cycle_end: string
    membership_type: string
    limit_type: string
    is_unlimited: number
    auto_model_message: string | null
    named_model_message: string | null
    plan_enabled: number
    plan_used: number
    plan_limit: number
    plan_remaining: number
    plan_included: number
    plan_bonus: number
    plan_total: number
    plan_auto_pct: number
    plan_api_pct: number
    plan_total_pct: number
    ondemand_enabled: number
    ondemand_used: number
    ondemand_limit: number | null
    ondemand_remaining: number | null
    team_ondemand_enabled: number
    team_ondemand_used: number
    team_ondemand_limit: number | null
    team_ondemand_remaining: number | null
    fetched_at: string
}

// --- Extension Host → Webview メッセージ型 ---

/**
 * カラム表示設定。
 * キーは TanStack Table の列 ID（accessor キー）と一致。
 * true=表示、false=非表示。
 */
export interface ColumnVisibilityConfig {
    kind: boolean
    max_mode: boolean
    is_token_based_call: boolean
    is_chargeable: boolean
    is_headless: boolean
    owning_user: boolean
    cursor_token_fee: boolean
}

/** Extension Host → Webview: データ読み込み完了 */
export interface DataLoadedMessage {
    type: 'dataLoaded'
    events: WebviewUsageEventRow[]
    totalCount: number
    summary: WebviewUsageSummaryRow | null
    /** owning_user ID(文字列) → 表示名のマッピング（name || email） */
    userMap: Record<string, string>
    /** 自身のロール。"TEAM_ROLE_OWNER" | "TEAM_ROLE_MEMBER" | null（個人プラン） */
    myRole: string | null
    /** ログインユーザーの表示名（auth_me の name || email） */
    userName: string | null
    /** カラム表示設定（VS Code 設定から読み取り） */
    columnVisibility: ColumnVisibilityConfig
    /** 1ページあたりの表示件数（VS Code 設定から読み取り） */
    pageSize: number
    /** 自動取得が有効か */
    autoRefreshEnabled: boolean
    /** 自動取得のインターバル（分） */
    autoRefreshIntervalMinutes: number
    /** エコメーターの redzone 閾値（ドル）。0.1〜3.0 */
    ecoMeterThreshold: number
    /** 日次利用目標額（ドル）。0 = 目標なし */
    dailyUsageGoal: number
    /** 月次予算目標額（ドル）。0 = 目標なし */
    monthlyBudgetGoal: number
    /** カラム並び順（DB 永続化・クロスウィンドウ共通）。未設定時は省略 */
    columnOrder?: string[]
}

/** Extension Host → Webview: ローディング状態通知 */
export interface LoadingMessage {
    type: 'loading'
    isLoading: boolean
}

/** Extension Host → Webview: エラー通知 */
export interface ErrorMessage {
    type: 'error'
    message: string
}

/** Extension Host → Webview: メモ更新確認 */
export interface MemoUpdatedMessage {
    type: 'memoUpdated'
    timestamp: string
    model: string
    owningUser: string
    note: string
}

// --- Webview → Extension Host メッセージ型 ---

/** Webview → Extension Host: データ要求 */
export interface RequestDataMessage {
    type: 'requestData'
}

/** Webview → Extension Host: メモ更新（Phase 12 で使用） */
export interface UpdateMemoMessage {
    type: 'updateMemo'
    timestamp: string
    model: string
    owningUser: string
    note: string
}

/** Webview → Extension Host: API 再取得トリガー */
export interface RequestRefreshMessage {
    type: 'requestRefresh'
}

/** Webview → Extension Host: カラム並び順保存（クロスウィンドウ共通） */
export interface SaveColumnOrderMessage {
    type: 'saveColumnOrder'
    columnOrder: string[]
}

// --- ユニオン型 ---

/** Extension Host → Webview の全メッセージ型 */
export type HostToWebviewMessage =
    | DataLoadedMessage
    | LoadingMessage
    | ErrorMessage
    | MemoUpdatedMessage

/** Webview → Extension Host の全メッセージ型 */
export type WebviewToHostMessage =
    | RequestDataMessage
    | UpdateMemoMessage
    | RequestRefreshMessage
    | SaveColumnOrderMessage
