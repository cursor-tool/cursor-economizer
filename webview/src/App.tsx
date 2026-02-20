import { useState, useEffect, useCallback, useMemo } from 'react'
import { postMessage, getVsCodeApi } from './hooks/useVsCodeApi'
import type {
    HostToWebviewMessage,
    DataLoadedMessage,
    MemoUpdatedMessage,
    WebviewUsageEventRow,
    WebviewUsageSummaryRow,
    ColumnVisibilityConfig
} from './types/messages'
import type { MeterViewModel, MeterZone } from './components/MeterBar'
import UsageTable from './components/UsageTable'
import SummaryCard from './components/SummaryCard'

// ── ブラウザ単体テスト用ダミーデータ（Vite dev server 時のみ使用） ──
const IS_BROWSER = !getVsCodeApi()

/** モック用ユーザー ID */
const MOCK_USER_IDS = ['user_001', 'user_002', 'user_003']

/** モック用ユーザーマップ */
const MOCK_USER_MAP: Record<string, string> = {
    user_001: 'Demo User A',
    user_002: 'Demo User B',
    user_003: 'Demo User C'
}

function makeMockEvents(count: number): WebviewUsageEventRow[] {
    const models = ['claude-4-sonnet', 'gpt-4o', 'claude-3.5-sonnet', 'gemini-2.5-pro', 'auto']
    const kinds = ['USAGE_BASED', 'INCLUDED_IN_PRO', 'ERRORED_NOT_CHARGED']
    const now = Date.now()
    return Array.from({ length: count }, (_, i) => ({
        timestamp: String(now - i * 60_000),
        model: models[i % models.length],
        kind: kinds[i % kinds.length],
        max_mode: i % 3 === 0 ? 1 : null,
        requests_costs: i % 2 === 0 ? Math.floor(Math.random() * 100) : null,
        usage_based_costs: i % 3 === 0 ? Math.round(Math.random() * 500) / 100 : 0,
        is_token_based_call: 1,
        input_tokens: Math.floor(Math.random() * 5000),
        output_tokens: Math.floor(Math.random() * 3000),
        cache_write_tokens: Math.floor(Math.random() * 1000),
        cache_read_tokens: Math.floor(Math.random() * 2000),
        total_cents: Math.floor(Math.random() * 80),
        owning_user: MOCK_USER_IDS[i % MOCK_USER_IDS.length],
        owning_team: 'team_demo_001',
        cursor_token_fee: Math.floor(Math.random() * 50),
        is_chargeable: i % 4 === 0 ? 0 : 1,
        is_headless: 0,
        fetched_at: new Date().toISOString(),
        note: i === 0 ? 'テスト用メモ' : ''
    }))
}

const MOCK_SUMMARY: WebviewUsageSummaryRow = {
    billing_cycle_start: '2026-02-09T16:05:34.000Z',
    billing_cycle_end: '2026-03-09T16:05:34.000Z',
    membership_type: 'enterprise',
    limit_type: 'team',
    is_unlimited: 1,
    auto_model_message: null,
    named_model_message: null,
    plan_enabled: 1,
    plan_used: 2000,
    plan_limit: 2000,
    plan_remaining: 0,
    plan_included: 2000,
    plan_bonus: 76,
    plan_total: 2076,
    plan_auto_pct: 0,
    plan_api_pct: 25.95,
    plan_total_pct: 25.95,
    ondemand_enabled: 1,
    ondemand_used: 18085,
    ondemand_limit: null,
    ondemand_remaining: null,
    team_ondemand_enabled: 1,
    team_ondemand_used: 19119,
    team_ondemand_limit: 150000,
    team_ondemand_remaining: 130881,
    fetched_at: new Date().toISOString()
}

// ── 日付ヘルパー（ユーザーロケール基準） ──

const DAY_MS = 86_400_000

/** 指定日のローカルタイムゾーン午前 0 時を UTC ミリ秒で返す */
function localDayStartMs(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// ── 共通ゾーン判定（全メーター統一: 70%=warn, 100%=danger） ──

function meterZone(ratio: number): MeterZone {
    if (ratio >= 100) return 'danger'
    if (ratio >= 70) return 'warn'
    return 'normal'
}

// ── エコメーター絵文字（UsageTable の6段階と同一） ──

function ecoEmoji(avgDollars: number): string {
    if (avgDollars < 0.2) return '✅'
    if (avgDollars <= 0.5) return '⚠️'
    if (avgDollars > 10) return '🥶'
    if (avgDollars > 3) return '☠️'
    if (avgDollars > 1) return '🔥'
    return '🚨'
}

// ── プラン種別判定（membership_type + limit_type + plan_limit の3項目評価） ──

type PlanType = 'free' | 'pro' | 'team' | 'unknown'

function detectPlanType(summary: WebviewUsageSummaryRow): PlanType {
    const m = summary.membership_type?.toLowerCase() ?? ''
    const l = summary.limit_type?.toLowerCase() ?? ''
    const limit = summary.plan_limit

    if (m === 'free' && l === 'user' && limit === 0) return 'free'
    if (m === 'enterprise' && l === 'team' && limit > 0) return 'team'
    if (m !== 'free' && limit > 0) return 'pro'
    return 'unknown'
}

// ── メーター ViewModel 構築 ──

function buildMeters(
    events: WebviewUsageEventRow[],
    summary: WebviewUsageSummaryRow | null,
    ecoMeterThreshold: number,
    dailyUsageGoal: number,
    monthlyBudgetGoal: number
): MeterViewModel[] {
    if (!summary) return []

    const meters: MeterViewModel[] = []
    const now = new Date()
    const todayStartUtc = localDayStartMs(now)
    const cycleStartMs = new Date(summary.billing_cycle_start).getTime()
    const cycleEndMs = new Date(summary.billing_cycle_end).getTime()

    // ── 1回のイベント走査で複数集計を同時に行う（usage_based_costs: ドル単位） ──
    let todayDollars = 0
    let sevenDayDollars = 0
    let cycleDollars = 0
    let recent3DayDollars = 0 // 今日を含む直近3日間（課金期間内に限定）

    const sevenDaysStartUtc = todayStartUtc - 6 * DAY_MS
    // 直近3日の集計開始: 2日前の0時 or 課金期間開始のどちらか遅い方
    const threeDaysAgoStartUtc = todayStartUtc - 2 * DAY_MS
    const recent3WindowStart = Math.max(threeDaysAgoStartUtc, cycleStartMs)

    for (const e of events) {
        const ts = Number(e.timestamp)
        const cost = Number(e.usage_based_costs) || 0
        if (ts >= cycleStartMs && ts <= cycleEndMs) cycleDollars += cost
        if (ts >= todayStartUtc) todayDollars += cost
        if (ts >= sevenDaysStartUtc) sevenDayDollars += cost
        if (ts >= recent3WindowStart) recent3DayDollars += cost
    }

    // ── 1. エコメーター（直近10イベント平均・usage_based_costs ドル単位） ──
    const recentForEco = events.slice(0, 10)
    const avgDollars =
        recentForEco.length > 0
            ? recentForEco.reduce((sum, e) => sum + (Number(e.usage_based_costs) || 0), 0) /
              recentForEco.length
            : 0
    const ecoRatio = (avgDollars / ecoMeterThreshold) * 100
    meters.push({
        id: 'eco',
        title: `${ecoEmoji(avgDollars)} Eco`,
        valueLabel: `$${avgDollars.toFixed(2)}`,
        goalLabel: `/ $${ecoMeterThreshold.toFixed(2)}`,
        ratio: ecoRatio,
        zone: meterZone(ecoRatio)
    })

    // ── 2. プラン枠メーター（プラン種別で分岐） ──
    const planType = detectPlanType(summary)
    switch (planType) {
        case 'free': {
            const FREE_PLAN_LIMIT_CENTS = 200
            let cycleTotalCents = 0
            for (const e of events) {
                const ts = Number(e.timestamp)
                if (ts >= cycleStartMs && ts <= cycleEndMs) {
                    cycleTotalCents += Number(e.total_cents) || 0
                }
            }
            cycleTotalCents = Math.floor(cycleTotalCents * 100) / 100
            const freeRatio = (cycleTotalCents / FREE_PLAN_LIMIT_CENTS) * 100
            meters.push({
                id: 'free-quota',
                title: 'Free Quota',
                valueLabel: `${cycleTotalCents.toFixed(2)}¢`,
                goalLabel: `/ ${FREE_PLAN_LIMIT_CENTS}¢`,
                ratio: freeRatio,
                zone: freeRatio >= 100 ? 'danger' : meterZone(freeRatio),
                rawScale: true
            })
            break
        }
        case 'pro':
        case 'team': {
            const planRatio = (summary.plan_used / summary.plan_limit) * 100
            meters.push({
                id: 'plan-quota',
                title: 'Plan Quota',
                valueLabel: `${summary.plan_used.toLocaleString()}`,
                goalLabel: `/ ${summary.plan_limit.toLocaleString()}`,
                ratio: planRatio,
                zone: planRatio >= 70 ? 'danger' : meterZone(planRatio),
                rawScale: true
            })
            break
        }
        default: {
            if (summary.plan_limit > 0) {
                const planRatio = (summary.plan_used / summary.plan_limit) * 100
                meters.push({
                    id: 'plan-quota',
                    title: 'Plan Quota',
                    valueLabel: `${summary.plan_used.toLocaleString()}`,
                    goalLabel: `/ ${summary.plan_limit.toLocaleString()}`,
                    ratio: planRatio,
                    zone: planRatio >= 70 ? 'danger' : meterZone(planRatio),
                    rawScale: true
                })
            }
            break
        }
    }

    // ── 3. 本日の利用額メーター ──
    if (dailyUsageGoal > 0) {
        const todayRatio = (todayDollars / dailyUsageGoal) * 100
        meters.push({
            id: 'today',
            title: 'Today',
            valueLabel: `$${todayDollars.toFixed(2)}`,
            goalLabel: `/ $${dailyUsageGoal.toFixed(0)}`,
            ratio: todayRatio,
            zone: meterZone(todayRatio)
        })
    }

    // ── 4. 過去7日の利用額メーター ──
    if (dailyUsageGoal > 0) {
        const sevenDayGoal = dailyUsageGoal * 7
        const sevenDayRatio = (sevenDayDollars / sevenDayGoal) * 100
        meters.push({
            id: 'seven-day',
            title: 'Past 7 Days',
            valueLabel: `$${sevenDayDollars.toFixed(2)}`,
            goalLabel: `/ $${sevenDayGoal.toFixed(0)}`,
            ratio: sevenDayRatio,
            zone: meterZone(sevenDayRatio)
        })
    }

    // ── 5. 課金期間の利用額メーター ──
    if (monthlyBudgetGoal > 0) {
        const cycleRatio = (cycleDollars / monthlyBudgetGoal) * 100
        meters.push({
            id: 'cycle',
            title: 'Billing Cycle',
            valueLabel: `$${cycleDollars.toFixed(2)}`,
            goalLabel: `/ $${monthlyBudgetGoal.toFixed(0)}`,
            ratio: cycleRatio,
            zone: meterZone(cycleRatio)
        })
    }

    // ── 6. 課金期間の利用予測額メーター ──
    if (monthlyBudgetGoal > 0) {
        // 今日を含む直近3日間の日次平均（課金期間開始直後は実際の日数で割る）
        const recent3ActualDays = Math.max(1, (now.getTime() - recent3WindowStart) / DAY_MS)
        const dailyAvgDollars = recent3DayDollars / recent3ActualDays
        const remainingDays = Math.max(0, (cycleEndMs - now.getTime()) / DAY_MS)
        const forecastDollars = cycleDollars + dailyAvgDollars * remainingDays
        const forecastRatio = (forecastDollars / monthlyBudgetGoal) * 100
        meters.push({
            id: 'forecast',
            title: 'Forecast',
            valueLabel: `$${forecastDollars.toFixed(0)}`,
            goalLabel: `/ $${monthlyBudgetGoal.toFixed(0)}`,
            ratio: forecastRatio,
            zone: meterZone(forecastRatio)
        })
    }

    return meters
}

// ── App ──

export default function App() {
    const mockEvents = IS_BROWSER ? makeMockEvents(120) : []
    const [events, setEvents] = useState<WebviewUsageEventRow[]>(IS_BROWSER ? mockEvents : [])
    const [totalCount, setTotalCount] = useState(IS_BROWSER ? 54321 : 0)
    const [summary, setSummary] = useState<WebviewUsageSummaryRow | null>(
        IS_BROWSER ? MOCK_SUMMARY : null
    )
    const [userMap, setUserMap] = useState<Record<string, string>>(IS_BROWSER ? MOCK_USER_MAP : {})
    const [userName, setUserName] = useState<string | null>(IS_BROWSER ? 'Demo User A' : null)
    const [isLoading, setIsLoading] = useState(!IS_BROWSER)
    /** 初回データ読み込みが完了したか（true 以降はコンポーネントをアンマウントしない） */
    const [hasData, setHasData] = useState(IS_BROWSER)
    const [error, setError] = useState<string | null>(null)
    const [pageSize, setPageSize] = useState(500)
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
    const [autoRefreshIntervalMinutes, setAutoRefreshIntervalMinutes] = useState(3)
    const [ecoMeterThreshold, setEcoMeterThreshold] = useState(IS_BROWSER ? 1.0 : 1.0)
    const [dailyUsageGoal, setDailyUsageGoal] = useState(IS_BROWSER ? 5 : 0)
    const [monthlyBudgetGoal, setMonthlyBudgetGoal] = useState(IS_BROWSER ? 60 : 0)
    /** カラム表示設定（初期値: ブラウザモックは全表示、VS Code 実行時は全非表示） */
    const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityConfig>({
        kind: IS_BROWSER,
        max_mode: IS_BROWSER,
        is_token_based_call: IS_BROWSER,
        is_chargeable: IS_BROWSER,
        is_headless: IS_BROWSER,
        owning_user: IS_BROWSER,
        cursor_token_fee: IS_BROWSER
    })
    /** カラム並び順（クロスウィンドウ共通・DB 永続化）。空配列はデフォルト順を使用 */
    const [columnOrder, setColumnOrder] = useState<string[]>([])

    // ── Extension Host → Webview メッセージ受信 ──────────────
    const handleMessage = useCallback((event: MessageEvent<HostToWebviewMessage>) => {
        const msg = event.data
        switch (msg.type) {
            case 'dataLoaded': {
                const data = msg as DataLoadedMessage
                setEvents(data.events)
                setTotalCount(data.totalCount)
                setSummary(data.summary)
                setUserMap(data.userMap ?? {})
                setUserName(data.userName ?? null)
                if (data.columnVisibility) {
                    setColumnVisibility(data.columnVisibility)
                }
                if (data.pageSize) {
                    setPageSize(data.pageSize)
                }
                if (data.autoRefreshEnabled !== undefined) {
                    setAutoRefreshEnabled(data.autoRefreshEnabled)
                }
                if (data.autoRefreshIntervalMinutes !== undefined) {
                    setAutoRefreshIntervalMinutes(data.autoRefreshIntervalMinutes)
                }
                if (data.ecoMeterThreshold !== undefined) {
                    setEcoMeterThreshold(data.ecoMeterThreshold)
                }
                if (data.dailyUsageGoal !== undefined) {
                    setDailyUsageGoal(data.dailyUsageGoal)
                }
                if (data.monthlyBudgetGoal !== undefined) {
                    setMonthlyBudgetGoal(data.monthlyBudgetGoal)
                }
                if (data.columnOrder) {
                    setColumnOrder(data.columnOrder)
                }
                setIsLoading(false)
                setHasData(true)
                setError(null)
                break
            }
            case 'loading':
                setIsLoading(msg.isLoading)
                break
            case 'error':
                setError(msg.message)
                setIsLoading(false)
                break
            case 'memoUpdated': {
                const memo = msg as MemoUpdatedMessage
                setEvents((prev) =>
                    prev.map((e) =>
                        e.timestamp === memo.timestamp &&
                        e.model === memo.model &&
                        e.owning_user === memo.owningUser
                            ? { ...e, note: memo.note }
                            : e
                    )
                )
                break
            }
            default:
                // 未知のメッセージは無視（将来フェーズで追加型が来ても安全）
                break
        }
    }, [])

    useEffect(() => {
        window.addEventListener('message', handleMessage)
        return () => {
            window.removeEventListener('message', handleMessage)
        }
    }, [handleMessage])

    // ── キーボードショートカット（Cmd+R / Ctrl+R / F5 → リロード） ──
    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
                e.preventDefault()
                postMessage({ type: 'requestRefresh' })
                return
            }
            if (e.key === 'F5') {
                e.preventDefault()
                postMessage({ type: 'requestRefresh' })
            }
        }
        window.addEventListener('keydown', handleKeydown)
        return () => window.removeEventListener('keydown', handleKeydown)
    }, [])

    // ── カラム並び順変更ハンドラ（DnD 完了時に呼ばれる） ──
    const handleColumnOrderChange = useCallback((newOrder: string[]) => {
        setColumnOrder(newOrder)
        postMessage({ type: 'saveColumnOrder', columnOrder: newOrder })
    }, [])

    // ── 初回マウント時にデータ要求 ──────────────────────────
    useEffect(() => {
        postMessage({ type: 'requestData' })
    }, [])

    // ── 課金期間内の usage_based_costs 最大値（ドル単位） ──────
    const maxCostDollars = useMemo(() => {
        if (events.length === 0 || !summary) return 0
        const cycleStartMs = new Date(summary.billing_cycle_start).getTime()
        const cycleEndMs = new Date(summary.billing_cycle_end).getTime()
        let max = 0
        for (const e of events) {
            const ts = Number(e.timestamp)
            const cost = Number(e.usage_based_costs) || 0
            if (ts >= cycleStartMs && ts <= cycleEndMs && cost > max) {
                max = cost
            }
        }
        return max
    }, [events, summary])

    // ── 6メーター ViewModel 構築 ──
    const meters = useMemo(
        () => buildMeters(events, summary, ecoMeterThreshold, dailyUsageGoal, monthlyBudgetGoal),
        [events, summary, ecoMeterThreshold, dailyUsageGoal, monthlyBudgetGoal]
    )

    // ── UI ──────────────────────────────────────────────────
    return (
        <div
            style={{
                padding: '4px 4px',
                fontFamily: 'var(--vscode-font-family, sans-serif)',
                color: 'var(--vscode-foreground)',
                height: '100vh',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            {!hasData && isLoading && <p>読み込み中…</p>}

            {error && (
                <p style={{ color: 'var(--vscode-errorForeground, #f44)' }}>エラー: {error}</p>
            )}

            {hasData && (
                <>
                    {summary && (
                        <SummaryCard
                            summary={summary}
                            userName={userName}
                            maxCost={maxCostDollars}
                            meters={meters}
                        />
                    )}
                    <UsageTable
                        data={events}
                        userMap={userMap}
                        columnVisibility={columnVisibility}
                        pageSize={pageSize}
                        autoRefreshEnabled={autoRefreshEnabled}
                        autoRefreshIntervalMinutes={autoRefreshIntervalMinutes}
                        isLoading={isLoading}
                        columnOrder={columnOrder.length > 0 ? columnOrder : undefined}
                        onColumnOrderChange={handleColumnOrderChange}
                    />
                </>
            )}
        </div>
    )
}
