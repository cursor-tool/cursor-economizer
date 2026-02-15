import * as https from 'https'
import type {
    ApiUsageEvent,
    ApiEventsResponse,
    ApiUsageSummary,
    ApiAuthMe,
    ApiTeamMember,
    ApiTeamResponse,
    ApiTeamDetail,
    ApiTeamsResponse
} from '../types/usageEvent'
import { dbService } from './dbService'

/**
 * API-A (get-filtered-usage-events) の HTTP 取得レイヤ + DB 永続化レイヤ + リトライ境界。
 * API-B (usage-summary) の HTTP 取得 + 正規化 + DB 保存。
 * API-C (auth/me) / API-D (dashboard/team) / API-E (dashboard/teams) の取得 + DB 保存。
 */

// --- 定数 ---

/** API-A エンドポイント */
const API_EVENTS_URL = 'https://cursor.com/api/dashboard/get-filtered-usage-events'

/** API-B エンドポイント */
const API_SUMMARY_URL = 'https://cursor.com/api/usage-summary'

/** API-C エンドポイント */
const API_AUTH_ME_URL = 'https://cursor.com/api/auth/me'

/** API-D エンドポイント */
const API_TEAM_URL = 'https://cursor.com/api/dashboard/team'

/** API-E エンドポイント */
const API_TEAMS_URL = 'https://cursor.com/api/dashboard/teams'

/** ページサイズ（固定） */
const PAGE_SIZE = 100

/** 最大取得ページ数（PAGE_SIZE × MAX_PAGES = Webview 表示上限 10,000 件） */
const MAX_PAGES = 100

/** HTTP タイムアウト（ミリ秒） */
const HTTP_TIMEOUT_MS = 15_000

/** 過去 1 年のミリ秒 */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** リトライ最大回数（初回 + リトライ 2 回 = 最大 3 試行） */
const MAX_RETRIES = 2

/** リトライ間隔（ミリ秒、指数バックオフ: 300ms → 900ms） */
const RETRY_DELAYS = [300, 900]

// --- エラー型（失敗分類用） ---

/** token 未設定エラー */
export class TokenNotConfiguredError extends Error {
    readonly code = 'TOKEN_NOT_CONFIGURED' as const
    constructor() {
        super('トークンが設定されていません')
        this.name = 'TokenNotConfiguredError'
    }
}

/** 認証エラー（401/403） */
export class ApiUnauthorizedError extends Error {
    readonly code = 'API_UNAUTHORIZED' as const
    readonly statusCode: number
    constructor(statusCode: number) {
        super(`認証エラー (HTTP ${statusCode}): トークンが無効または期限切れです`)
        this.name = 'ApiUnauthorizedError'
        this.statusCode = statusCode
    }
}

/** HTTP タイムアウトエラー */
export class ApiTimeoutError extends Error {
    readonly code = 'API_TIMEOUT' as const
    constructor() {
        super(`API リクエストがタイムアウトしました (${HTTP_TIMEOUT_MS / 1000}秒)`)
        this.name = 'ApiTimeoutError'
    }
}

/** HTTP エラー（4xx/5xx、401/403 以外） */
export class ApiHttpError extends Error {
    readonly code = 'API_HTTP_ERROR' as const
    readonly statusCode: number
    constructor(statusCode: number, body: string) {
        super(`API エラー (HTTP ${statusCode}): ${body.slice(0, 200)}`)
        this.name = 'ApiHttpError'
        this.statusCode = statusCode
    }
}

/** レスポンス解析エラー */
export class ApiParseError extends Error {
    readonly code = 'API_PARSE_ERROR' as const
    constructor(detail: string) {
        super(`API レスポンス解析エラー: ${detail}`)
        this.name = 'ApiParseError'
    }
}

// --- リトライユーティリティ ---

/** 指定ミリ秒スリープする */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * エラーがリトライ可能かどうかを判定する。
 *
 * リトライ対象:
 *   - ApiTimeoutError
 *   - ApiHttpError (statusCode: 408 / 429 / 500-599)
 *   - ネットワークエラー (ECONNRESET / ECONNREFUSED / ENOTFOUND / ETIMEDOUT / EPIPE / ECONNABORTED)
 *
 * リトライ非対象:
 *   - TokenNotConfiguredError
 *   - ApiUnauthorizedError
 *   - ApiParseError
 *   - ApiHttpError (statusCode: 400系、408/429 以外)
 */
function isRetryable(err: unknown): boolean {
    if (err instanceof ApiTimeoutError) {
        return true
    }

    if (err instanceof ApiHttpError) {
        const sc = err.statusCode
        return sc === 408 || sc === 429 || (sc >= 500 && sc <= 599)
    }

    if (err instanceof Error) {
        const code = (err as NodeJS.ErrnoException).code
        if (code) {
            const retryableCodes = [
                'ECONNRESET',
                'ECONNREFUSED',
                'ENOTFOUND',
                'ETIMEDOUT',
                'EPIPE',
                'ECONNABORTED'
            ]
            return retryableCodes.includes(code)
        }
    }

    return false
}

/**
 * リトライ付きで非同期関数を実行する。
 *
 * - 成功時: 即座に結果を返す
 * - 失敗時: isRetryable() で再試行可否を判定
 *   - 再試行不可能 → 即座に throw（バックオフなし）
 *   - 再試行可能かつ残り回数あり → バックオフ待機 → 次の試行
 *   - 最終試行も失敗 → 最後のエラーを throw
 *
 * @param fn         実行する非同期関数
 * @param maxRetries 最大リトライ回数（初回実行は含まない）
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn()
        } catch (err) {
            lastError = err

            // リトライ不可能なエラーは即座に throw
            if (!isRetryable(err)) {
                throw err
            }

            // 最終試行の場合はリトライせずに throw
            if (attempt >= maxRetries) {
                throw err
            }

            // バックオフ待機してリトライ
            const delay = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
            console.log(`Cursor Economizer: リトライ ${attempt + 1}/${maxRetries}...`)
            await sleep(delay)
        }
    }

    // ここには到達しないが、TypeScript の型推論のために throw
    throw lastError
}

// --- 正規化関数 ---

/**
 * "$0.08" → 0.08, "-" → 0, undefined → 0 のように
 * API の usageBasedCosts 文字列を数値に変換する。
 */
function parseUsageBasedCosts(raw: unknown): number {
    if (raw == null) {
        return 0
    }
    const s = String(raw).trim()
    if (s === '' || s === '-') {
        return 0
    }
    const stripped = s.replace(/^\$/, '')
    const n = Number(stripped)
    return isNaN(n) ? 0 : n
}

/**
 * API レスポンスの個別イベントを正規化する。
 * tokenUsage 欠損時に 0 を設定する。
 */
function toApiUsageEvent(raw: unknown): ApiUsageEvent {
    if (!raw || typeof raw !== 'object') {
        throw new ApiParseError('イベントデータがオブジェクトではありません')
    }

    const r = raw as Record<string, unknown>
    const tokenUsage =
        r.tokenUsage != null && typeof r.tokenUsage === 'object'
            ? (r.tokenUsage as Record<string, unknown>)
            : {}

    return {
        timestamp: String(r.timestamp ?? ''),
        model: String(r.model ?? ''),
        kind: String(r.kind ?? ''),
        maxMode: r.maxMode != null ? Boolean(r.maxMode) : undefined,
        requestsCosts: r.requestsCosts != null ? Number(r.requestsCosts) : undefined,
        usageBasedCosts: parseUsageBasedCosts(r.usageBasedCosts),
        isTokenBasedCall: Boolean(r.isTokenBasedCall),
        tokenUsage: {
            inputTokens: Number(tokenUsage.inputTokens ?? 0),
            outputTokens: Number(tokenUsage.outputTokens ?? 0),
            cacheWriteTokens: Number(tokenUsage.cacheWriteTokens ?? 0),
            cacheReadTokens: Number(tokenUsage.cacheReadTokens ?? 0),
            totalCents: Number(tokenUsage.totalCents ?? 0)
        },
        owningUser: String(r.owningUser ?? ''),
        owningTeam: String(r.owningTeam ?? ''),
        cursorTokenFee: Number(r.cursorTokenFee ?? 0),
        isChargeable: Boolean(r.isChargeable),
        isHeadless: Boolean(r.isHeadless)
    }
}

/**
 * API-B レスポンス全体を正規化する。
 * 必須フィールド欠損時は ApiParseError を throw する。
 * individualUsage.plan.breakdown のネスト構造を含む全フィールドを正規化する。
 */
function toApiUsageSummary(raw: unknown): ApiUsageSummary {
    if (!raw || typeof raw !== 'object') {
        throw new ApiParseError('サマリデータがオブジェクトではありません')
    }

    const r = raw as Record<string, unknown>

    // 必須文字列フィールド
    if (typeof r.billingCycleStart !== 'string') {
        throw new ApiParseError('billingCycleStart が文字列ではありません')
    }
    if (typeof r.billingCycleEnd !== 'string') {
        throw new ApiParseError('billingCycleEnd が文字列ではありません')
    }
    if (typeof r.membershipType !== 'string') {
        throw new ApiParseError('membershipType が文字列ではありません')
    }
    if (typeof r.limitType !== 'string') {
        throw new ApiParseError('limitType が文字列ではありません')
    }

    // individualUsage 構造検証
    if (!r.individualUsage || typeof r.individualUsage !== 'object') {
        throw new ApiParseError('individualUsage が存在しないかオブジェクトではありません')
    }
    const indiv = r.individualUsage as Record<string, unknown>

    if (!indiv.plan || typeof indiv.plan !== 'object') {
        throw new ApiParseError('individualUsage.plan が存在しないかオブジェクトではありません')
    }
    const plan = indiv.plan as Record<string, unknown>

    if (!plan.breakdown || typeof plan.breakdown !== 'object') {
        throw new ApiParseError(
            'individualUsage.plan.breakdown が存在しないかオブジェクトではありません'
        )
    }
    const breakdown = plan.breakdown as Record<string, unknown>

    if (!indiv.onDemand || typeof indiv.onDemand !== 'object') {
        throw new ApiParseError('individualUsage.onDemand が存在しないかオブジェクトではありません')
    }
    const onDemand = indiv.onDemand as Record<string, unknown>

    // teamUsage 構造検証
    if (!r.teamUsage || typeof r.teamUsage !== 'object') {
        throw new ApiParseError('teamUsage が存在しないかオブジェクトではありません')
    }
    const team = r.teamUsage as Record<string, unknown>

    if (!team.onDemand || typeof team.onDemand !== 'object') {
        throw new ApiParseError('teamUsage.onDemand が存在しないかオブジェクトではありません')
    }
    const teamOnDemand = team.onDemand as Record<string, unknown>

    return {
        billingCycleStart: r.billingCycleStart,
        billingCycleEnd: r.billingCycleEnd,
        membershipType: r.membershipType,
        limitType: r.limitType,
        isUnlimited: Boolean(r.isUnlimited),
        autoModelSelectedDisplayMessage: String(r.autoModelSelectedDisplayMessage ?? ''),
        namedModelSelectedDisplayMessage: String(r.namedModelSelectedDisplayMessage ?? ''),
        individualUsage: {
            plan: {
                enabled: Boolean(plan.enabled),
                used: Number(plan.used ?? 0),
                limit: Number(plan.limit ?? 0),
                remaining: Number(plan.remaining ?? 0),
                breakdown: {
                    included: Number(breakdown.included ?? 0),
                    bonus: Number(breakdown.bonus ?? 0),
                    total: Number(breakdown.total ?? 0)
                },
                autoPercentUsed: Number(plan.autoPercentUsed ?? 0),
                apiPercentUsed: Number(plan.apiPercentUsed ?? 0),
                totalPercentUsed: Number(plan.totalPercentUsed ?? 0)
            },
            onDemand: {
                enabled: Boolean(onDemand.enabled),
                used: Number(onDemand.used ?? 0),
                limit: onDemand.limit != null ? Number(onDemand.limit) : null,
                remaining: onDemand.remaining != null ? Number(onDemand.remaining) : null
            }
        },
        teamUsage: {
            onDemand: {
                enabled: Boolean(teamOnDemand.enabled),
                used: Number(teamOnDemand.used ?? 0),
                limit: teamOnDemand.limit != null ? Number(teamOnDemand.limit) : null,
                remaining: teamOnDemand.remaining != null ? Number(teamOnDemand.remaining) : null
            }
        }
    }
}

// --- API-C 正規化 ---

/**
 * ISO 8601 文字列を Unix タイムスタンプ（ミリ秒）文字列に変換する。
 * 解析不能な場合は "0" を返す。
 */
function isoToUnixMs(iso: unknown): string {
    if (typeof iso !== 'string' || iso === '') {
        return '0'
    }
    const ms = new Date(iso).getTime()
    return isNaN(ms) ? '0' : String(ms)
}

/**
 * API-C レスポンスを正規化する。
 * created_at / updated_at は Unix ms 文字列に変換する。
 */
function toApiAuthMe(raw: unknown): ApiAuthMe {
    if (!raw || typeof raw !== 'object') {
        throw new ApiParseError('auth/me データがオブジェクトではありません')
    }
    const r = raw as Record<string, unknown>
    return {
        email: String(r.email ?? ''),
        email_verified: Boolean(r.email_verified),
        name: String(r.name ?? ''),
        sub: String(r.sub ?? ''),
        created_at: isoToUnixMs(r.created_at),
        updated_at: isoToUnixMs(r.updated_at),
        picture: String(r.picture ?? ''),
        id: Number(r.id ?? 0)
    }
}

// --- API-D 正規化 ---

/**
 * API-D レスポンスを正規化する。
 */
function toApiTeamResponse(raw: unknown): ApiTeamResponse {
    if (!raw || typeof raw !== 'object') {
        throw new ApiParseError('dashboard/team データがオブジェクトではありません')
    }
    const r = raw as Record<string, unknown>

    const membersRaw = Array.isArray(r.teamMembers) ? r.teamMembers : []
    const teamMembers: ApiTeamMember[] = membersRaw.map((m: unknown) => {
        const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>
        return {
            id: Number(o.id ?? 0),
            name: o.name != null ? String(o.name) : undefined,
            role: String(o.role ?? ''),
            email: String(o.email ?? '')
        }
    })

    return {
        teamMembers,
        userId: Number(r.userId ?? 0)
    }
}

// --- API-E 正規化 ---

/**
 * API-E レスポンスを正規化する。
 */
function toApiTeamsResponse(raw: unknown): ApiTeamsResponse {
    if (!raw || typeof raw !== 'object') {
        throw new ApiParseError('dashboard/teams データがオブジェクトではありません')
    }
    const r = raw as Record<string, unknown>

    const teamsRaw = Array.isArray(r.teams) ? r.teams : []
    const teams: ApiTeamDetail[] = teamsRaw.map((t: unknown) => {
        const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
        return {
            name: String(o.name ?? ''),
            id: Number(o.id ?? 0),
            role: String(o.role ?? ''),
            seats: Number(o.seats ?? 0),
            hasBilling: Boolean(o.hasBilling),
            requestQuotaPerSeat: Number(o.requestQuotaPerSeat ?? 0),
            privacyModeForced: Boolean(o.privacyModeForced),
            allowSso: Boolean(o.allowSso),
            adminOnlyUsagePricing: Boolean(o.adminOnlyUsagePricing),
            subscriptionStatus: String(o.subscriptionStatus ?? ''),
            privacyModeMigrationOptedOut: Boolean(o.privacyModeMigrationOptedOut),
            membershipType: String(o.membershipType ?? ''),
            billingCycleStart: String(o.billingCycleStart ?? ''),
            billingCycleEnd: String(o.billingCycleEnd ?? ''),
            individualSpendLimitsBlocked: Boolean(o.individualSpendLimitsBlocked),
            customerBalanceCents: String(o.customerBalanceCents ?? '0')
        }
    })

    return { teams }
}

// --- ApiService ---

class ApiService {
    /**
     * 単一ページ取得。
     * POST https://cursor.com/api/dashboard/get-filtered-usage-events
     *
     * @param token  WorkosCursorSessionToken の値
     * @param startDate  開始日時（Unix ミリ秒文字列）
     * @param endDate    終了日時（Unix ミリ秒文字列）
     * @param page       ページ番号（1 始まり）
     */
    async fetchUsageEvents(
        token: string,
        startDate: string,
        endDate: string,
        page: number
    ): Promise<ApiEventsResponse> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        // NOTE:
        // teamId を 0 固定すると、実アカウントの利用コンテキストによっては
        // usageEventsDisplay が空で返るケースがある。
        // 受信データ（res.json）優先で、ここでは teamId を固定送信しない。
        const body = JSON.stringify({
            startDate,
            endDate,
            page,
            pageSize: PAGE_SIZE
        })

        console.log(`Cursor Economizer: API-A request body: ${body}`)

        const rawResponse = await withRetry(
            () => this.httpPost(API_EVENTS_URL, token, body),
            MAX_RETRIES
        )

        // デバッグ: レスポンス先頭を出力（token は含まない）
        console.log(
            `Cursor Economizer: API-A raw response length=${rawResponse.length}, first500=${rawResponse.slice(0, 500)}`
        )

        // JSON 解析
        let parsed: unknown
        try {
            parsed = JSON.parse(rawResponse)
        } catch {
            throw new ApiParseError('JSON 解析失敗')
        }

        // レスポンス構造検証
        if (!parsed || typeof parsed !== 'object') {
            throw new ApiParseError('レスポンスがオブジェクトではありません')
        }

        const response = parsed as Record<string, unknown>

        // デバッグ: レスポンスのキー一覧を出力
        console.log(`Cursor Economizer: API-A response keys=${Object.keys(response).join(',')}`)

        if (typeof response.totalUsageEventsCount !== 'number') {
            console.error(
                `Cursor Economizer: API-A totalUsageEventsCount is ${typeof response.totalUsageEventsCount}: ${JSON.stringify(response.totalUsageEventsCount)}`
            )
            throw new ApiParseError('totalUsageEventsCount が数値ではありません')
        }
        if (!Array.isArray(response.usageEventsDisplay)) {
            console.error(
                `Cursor Economizer: API-A usageEventsDisplay is ${typeof response.usageEventsDisplay}`
            )
            throw new ApiParseError('usageEventsDisplay が配列ではありません')
        }

        console.log(
            `Cursor Economizer: API-A page ${page}: totalCount=${response.totalUsageEventsCount}, eventsInPage=${(response.usageEventsDisplay as unknown[]).length}`
        )

        // イベント正規化
        const events = (response.usageEventsDisplay as unknown[]).map(toApiUsageEvent)

        return {
            totalUsageEventsCount: response.totalUsageEventsCount,
            usageEventsDisplay: events
        }
    }

    /**
     * 初回同期の先頭1ページだけを取得する。
     * UI を即座に表示するためにフォアグラウンドで使用する。
     *
     * 戻り値の hasMore が true の場合、fetchEventsRemainingPages で残りを取得する。
     * startDate / endDate は残りページ取得で同一範囲を維持するために返す。
     */
    async fetchEventsFirstPage(token: string): Promise<{
        events: ApiUsageEvent[]
        hasMore: boolean
        startDate: string
        endDate: string
    }> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        const endDate = String(Date.now())
        const startDate = String(Date.now() - ONE_YEAR_MS)

        console.log('Cursor Economizer: API-A page 1 取得中 (初回同期・先頭ページ)...')
        const response = await this.fetchUsageEvents(token, startDate, endDate, 1)
        const events = response.usageEventsDisplay
        const hasMore = events.length >= PAGE_SIZE

        console.log(
            `Cursor Economizer: API-A page 1 取得完了 (${events.length}件, hasMore=${hasMore})`
        )

        return { events, hasMore, startDate, endDate }
    }

    /**
     * 初回同期の残りページ（startPage 以降）を取得する。
     * fetchEventsFirstPage の後にバックグラウンドで呼び出す。
     *
     * 上限は MAX_PAGES ページ（= 10,000 件）。
     * startDate / endDate は fetchEventsFirstPage が返した値をそのまま渡すこと。
     */
    async fetchEventsRemainingPages(
        token: string,
        startDate: string,
        endDate: string,
        startPage: number
    ): Promise<ApiUsageEvent[]> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        const allEvents: ApiUsageEvent[] = []
        let page = startPage

        while (page <= MAX_PAGES) {
            console.log(`Cursor Economizer: API-A page ${page} 取得中 (バックグラウンド)...`)
            const response = await this.fetchUsageEvents(token, startDate, endDate, page)
            allEvents.push(...response.usageEventsDisplay)

            // 終了条件: 取得件数 < pageSize
            if (response.usageEventsDisplay.length < PAGE_SIZE) {
                break
            }

            page++
        }

        console.log(
            `Cursor Economizer: API-A バックグラウンド取得完了 (${allEvents.length}件, page ${startPage}〜${page})`
        )
        return allEvents
    }

    /**
     * 全ページ巡回取得（初回取得用: 過去 1 年分）。
     * ページネーション: usageEventsDisplay.length < PAGE_SIZE で終了。
     * 上限: MAX_PAGES ページ（= 10,000 件）。
     *
     * 注意: 通常は fetchEventsFirstPage + fetchEventsRemainingPages を使用する。
     * このメソッドは差分取得のフォールバック等で残す。
     */
    async fetchAllEvents(token: string): Promise<ApiUsageEvent[]> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        const endDate = String(Date.now())
        const startDate = String(Date.now() - ONE_YEAR_MS)

        const allEvents: ApiUsageEvent[] = []
        let page = 1

        while (page <= MAX_PAGES) {
            console.log(`Cursor Economizer: API-A page ${page} 取得中...`)
            const response = await this.fetchUsageEvents(token, startDate, endDate, page)
            allEvents.push(...response.usageEventsDisplay)

            // 終了条件: 取得件数 < pageSize
            if (response.usageEventsDisplay.length < PAGE_SIZE) {
                break
            }

            page++
        }

        console.log(`Cursor Economizer: API-A 取得完了 (${allEvents.length}件, ${page}ページ)`)
        return allEvents
    }

    /**
     * 差分取得（DB 内の最新 timestamp 以降を取得）。
     * 上限: MAX_PAGES ページ（= 10,000 件）。
     *
     * @param token            WorkosCursorSessionToken の値
     * @param latestTimestamp   Unix ミリ秒文字列（DB の usage_events.timestamp 最新値。例: "1770909153239"）
     */
    async fetchDeltaEvents(token: string, latestTimestamp: string): Promise<ApiUsageEvent[]> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        // timestamp は Unix ミリ秒文字列のためそのまま使用可能
        // parseInt でバリデーションのみ行う
        const startMs = parseInt(latestTimestamp, 10)
        if (isNaN(startMs)) {
            throw new Error(`無効なタイムスタンプ: ${latestTimestamp}`)
        }

        const startDate = latestTimestamp
        const endDate = String(Date.now())

        const allEvents: ApiUsageEvent[] = []
        let page = 1

        while (page <= MAX_PAGES) {
            console.log(`Cursor Economizer: API-A delta page ${page} 取得中...`)
            const response = await this.fetchUsageEvents(token, startDate, endDate, page)
            allEvents.push(...response.usageEventsDisplay)

            // 終了条件: 取得件数 < pageSize
            if (response.usageEventsDisplay.length < PAGE_SIZE) {
                break
            }

            page++
        }

        console.log(`Cursor Economizer: API-A 差分取得完了 (${allEvents.length}件, ${page}ページ)`)
        return allEvents
    }

    /**
     * API-A の取得結果を usage_events テーブルに永続化する。
     *
     * 保存戦略（note カラム保持のための 2 段階方式）:
     *   1. INSERT OR IGNORE: UNIQUE 制約 (timestamp, model, owning_user) で重複行を無視して新規挿入
     *   2. UPDATE: 既存行の note 以外のカラムを最新値で更新
     *
     * これにより、既存レコードのユーザーメモ (note) を上書きせずに、
     * API 由来データのみを最新化できる。
     *
     * トランザクションで保護し、部分書込を防止する。
     * 空配列入力時は SQL 実行せず早期 return する。
     *
     * @param events  API-A から取得した正規化済みイベント配列
     */
    saveEventsToDb(events: ApiUsageEvent[]): void {
        if (events.length === 0) {
            return
        }

        const fetchedAt = new Date().toISOString()

        // --- INSERT OR IGNORE: 新規行のみ挿入（既存行は無視） ---
        const insertSql = `
      INSERT OR IGNORE INTO usage_events (
        timestamp, model, kind, max_mode, requests_costs,
        usage_based_costs, is_token_based_call,
        input_tokens, output_tokens, cache_write_tokens, cache_read_tokens,
        total_cents, owning_user, owning_team, cursor_token_fee,
        is_chargeable, is_headless, raw_json, fetched_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `

        // --- UPDATE: 既存行の note 以外のカラムを更新 ---
        const updateSql = `
      UPDATE usage_events SET
        kind              = ?,
        max_mode          = ?,
        requests_costs    = ?,
        usage_based_costs = ?,
        is_token_based_call = ?,
        input_tokens      = ?,
        output_tokens     = ?,
        cache_write_tokens = ?,
        cache_read_tokens  = ?,
        total_cents       = ?,
        cursor_token_fee  = ?,
        is_chargeable     = ?,
        is_headless       = ?,
        raw_json          = ?,
        fetched_at        = ?
      WHERE timestamp = ? AND model = ? AND owning_user = ?
    `

        // ディスクから最新 DB を再読込（他 Window の変更を取り込み）
        dbService.reload()

        // reload() 後に DB インスタンスを取得する（reload は内部で旧インスタンスを close して新規作成する）
        const db = dbService.getDb()

        try {
            db.run('BEGIN TRANSACTION')

            for (const event of events) {
                const rawJson = JSON.stringify(event)
                const maxMode = event.maxMode != null ? (event.maxMode ? 1 : 0) : null
                const requestsCosts = event.requestsCosts ?? null
                const inputTokens = event.tokenUsage.inputTokens ?? 0
                const outputTokens = event.tokenUsage.outputTokens ?? 0
                const cacheWriteTokens = event.tokenUsage.cacheWriteTokens ?? 0
                const cacheReadTokens = event.tokenUsage.cacheReadTokens ?? 0
                const totalCents = event.tokenUsage.totalCents ?? 0
                const isTokenBasedCall = event.isTokenBasedCall ? 1 : 0
                const isChargeable = event.isChargeable ? 1 : 0
                const isHeadless = event.isHeadless ? 1 : 0

                // Step 1: INSERT OR IGNORE（新規行のみ挿入）
                db.run(insertSql, [
                    event.timestamp,
                    event.model,
                    event.kind,
                    maxMode,
                    requestsCosts,
                    event.usageBasedCosts,
                    isTokenBasedCall,
                    inputTokens,
                    outputTokens,
                    cacheWriteTokens,
                    cacheReadTokens,
                    totalCents,
                    event.owningUser,
                    event.owningTeam,
                    event.cursorTokenFee,
                    isChargeable,
                    isHeadless,
                    rawJson,
                    fetchedAt
                ])

                // Step 2: UPDATE（既存行の note 以外を更新）
                db.run(updateSql, [
                    event.kind,
                    maxMode,
                    requestsCosts,
                    event.usageBasedCosts,
                    isTokenBasedCall,
                    inputTokens,
                    outputTokens,
                    cacheWriteTokens,
                    cacheReadTokens,
                    totalCents,
                    event.cursorTokenFee,
                    isChargeable,
                    isHeadless,
                    rawJson,
                    fetchedAt,
                    // WHERE 条件
                    event.timestamp,
                    event.model,
                    event.owningUser
                ])
            }

            db.run('COMMIT')
        } catch (err) {
            // ロールバックでトランザクションを破棄（部分書込防止）
            try {
                db.run('ROLLBACK')
            } catch {
                // ROLLBACK 自体の失敗はログのみ（元のエラーを優先）
                console.error('Cursor Economizer: ROLLBACK failed')
            }
            throw err
        }

        // ディスクに永続化
        dbService.persist()

        console.log(`Cursor Economizer: ${events.length}件のイベントを保存しました`)
    }

    /**
     * usage_events テーブルの最新 timestamp を取得する。
     * DB が空（レコード 0 件）の場合は null を返す（= 初回同期）。
     * string が返る場合は差分取得に使用する ISO 8601 文字列。
     *
     * reload() は呼ばない（initialize() 直後 or saveEventsToDb() 直後で最新のため）。
     */
    getLatestEventTimestamp(): string | null {
        const db = dbService.getDb()
        const result = db.exec('SELECT MAX(timestamp) FROM usage_events')

        // result が空（テーブルにレコードなし）の場合
        if (result.length === 0 || result[0].values.length === 0) {
            return null
        }

        const value = result[0].values[0][0]

        // MAX(timestamp) が NULL（レコード 0 件）の場合
        if (value === null || value === undefined) {
            return null
        }

        return String(value)
    }

    /**
     * API-B: usage-summary を取得して正規化する。
     * リトライ付き httpGet → JSON 解析 → toApiUsageSummary で正規化。
     *
     * @param token  WorkosCursorSessionToken の値
     */
    async fetchUsageSummary(token: string): Promise<ApiUsageSummary> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        console.log('Cursor Economizer: API-B (usage-summary) 取得中...')

        const rawResponse = await withRetry(() => this.httpGet(API_SUMMARY_URL, token), MAX_RETRIES)

        // JSON 解析
        let parsed: unknown
        try {
            parsed = JSON.parse(rawResponse)
        } catch {
            throw new ApiParseError('usage-summary JSON 解析失敗')
        }

        // 正規化
        const summary = toApiUsageSummary(parsed)

        console.log('Cursor Economizer: API-B (usage-summary) 取得完了')
        return summary
    }

    /**
     * API-B の取得結果を usage_summary テーブルに保存する。
     * スナップショット追記（UPSERT ではなく毎回 INSERT。履歴を保持する）。
     *
     * 自己完結型: reload() → getDb() → INSERT → persist() を内部で完結させる。
     *
     * @param summary  API-B から取得した正規化済みサマリ
     */
    saveSummaryToDb(summary: ApiUsageSummary): void {
        const fetchedAt = new Date().toISOString()
        const rawJson = JSON.stringify(summary)

        const insertSql = `
      INSERT INTO usage_summary (
        billing_cycle_start, billing_cycle_end,
        membership_type, limit_type, is_unlimited,
        auto_model_message, named_model_message,
        plan_enabled, plan_used, plan_limit, plan_remaining,
        plan_included, plan_bonus, plan_total,
        plan_auto_pct, plan_api_pct, plan_total_pct,
        ondemand_enabled, ondemand_used, ondemand_limit, ondemand_remaining,
        team_ondemand_enabled, team_ondemand_used, team_ondemand_limit, team_ondemand_remaining,
        raw_json, fetched_at
      ) VALUES (
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `

        // ディスクから最新 DB を再読込（他 Window の変更を取り込み）
        dbService.reload()

        // reload() 後に DB インスタンスを取得する
        const db = dbService.getDb()

        db.run(insertSql, [
            summary.billingCycleStart,
            summary.billingCycleEnd,
            summary.membershipType,
            summary.limitType,
            summary.isUnlimited ? 1 : 0,
            summary.autoModelSelectedDisplayMessage ?? null,
            summary.namedModelSelectedDisplayMessage ?? null,
            summary.individualUsage.plan.enabled ? 1 : 0,
            summary.individualUsage.plan.used,
            summary.individualUsage.plan.limit,
            summary.individualUsage.plan.remaining,
            summary.individualUsage.plan.breakdown.included,
            summary.individualUsage.plan.breakdown.bonus,
            summary.individualUsage.plan.breakdown.total,
            summary.individualUsage.plan.autoPercentUsed,
            summary.individualUsage.plan.apiPercentUsed,
            summary.individualUsage.plan.totalPercentUsed,
            summary.individualUsage.onDemand.enabled ? 1 : 0,
            summary.individualUsage.onDemand.used,
            summary.individualUsage.onDemand.limit,
            summary.individualUsage.onDemand.remaining,
            summary.teamUsage.onDemand.enabled ? 1 : 0,
            summary.teamUsage.onDemand.used,
            summary.teamUsage.onDemand.limit,
            summary.teamUsage.onDemand.remaining,
            rawJson,
            fetchedAt
        ])

        // ディスクに永続化
        dbService.persist()

        console.log('Cursor Economizer: usage_summary を保存しました')
    }

    // ────────────────────────────────────────────
    //  API-C: auth/me
    // ────────────────────────────────────────────

    /**
     * API-C: /api/auth/me を取得して正規化する。
     *
     * @param token  WorkosCursorSessionToken の値
     */
    async fetchAuthMe(token: string): Promise<ApiAuthMe> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        console.log('Cursor Economizer: API-C (auth/me) 取得中...')
        const raw = await withRetry(() => this.httpGet(API_AUTH_ME_URL, token), MAX_RETRIES)

        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            throw new ApiParseError('auth/me JSON 解析失敗')
        }

        const me = toApiAuthMe(parsed)
        console.log('Cursor Economizer: API-C (auth/me) 取得完了')
        return me
    }

    /**
     * API-C の取得結果を auth_me テーブルに保存する。
     * 最新スナップショットのみ保持（DELETE → INSERT）。
     */
    saveAuthMeToDb(me: ApiAuthMe): void {
        const fetchedAt = new Date().toISOString()
        const rawJson = JSON.stringify(me)

        dbService.reload()
        const db = dbService.getDb()

        db.run('DELETE FROM auth_me')
        db.run(
            `INSERT INTO auth_me (id, email, email_verified, name, sub, created_at, updated_at, picture, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                me.id,
                me.email,
                me.email_verified ? 1 : 0,
                me.name,
                me.sub,
                me.created_at,
                me.updated_at,
                me.picture,
                rawJson,
                fetchedAt
            ]
        )

        dbService.persist()
        console.log('Cursor Economizer: auth_me を保存しました')
    }

    // ────────────────────────────────────────────
    //  API-D: dashboard/team
    // ────────────────────────────────────────────

    /**
     * API-D: /api/dashboard/team を取得して正規化する。
     *
     * @param token  WorkosCursorSessionToken の値
     */
    async fetchTeam(token: string, teamId: number): Promise<ApiTeamResponse> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        console.log(`Cursor Economizer: API-D (dashboard/team) 取得中... teamId=${teamId}`)
        const body = JSON.stringify({ teamId })
        const raw = await withRetry(() => this.httpPost(API_TEAM_URL, token, body), MAX_RETRIES)

        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            throw new ApiParseError('dashboard/team JSON 解析失敗')
        }

        const team = toApiTeamResponse(parsed)
        console.log('Cursor Economizer: API-D (dashboard/team) 取得完了')
        return team
    }

    /**
     * API-D の取得結果を team_members テーブルに保存する。
     * 最新スナップショットのみ保持（DELETE → INSERT）。
     *
     * @param team   API-D レスポンス
     * @param teamId team_members に紐付ける teams.id
     */
    saveTeamToDb(team: ApiTeamResponse, teamId: number): void {
        const fetchedAt = new Date().toISOString()
        const rawJson = JSON.stringify(team)

        dbService.reload()
        const db = dbService.getDb()

        db.run('DELETE FROM team_members')

        const insertSql = `
      INSERT INTO team_members (id, name, role, email, user_id, team_id, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `

        for (const m of team.teamMembers) {
            db.run(insertSql, [
                m.id,
                m.name ?? '',
                m.role,
                m.email,
                team.userId,
                teamId,
                rawJson,
                fetchedAt
            ])
        }

        dbService.persist()
        console.log(
            `Cursor Economizer: team_members を保存しました (${team.teamMembers.length} 件, teamId=${teamId})`
        )
    }

    // ────────────────────────────────────────────
    //  API-E: dashboard/teams
    // ────────────────────────────────────────────

    /**
     * API-E: /api/dashboard/teams を取得して正規化する。
     *
     * @param token  WorkosCursorSessionToken の値
     */
    async fetchTeams(token: string): Promise<ApiTeamsResponse> {
        if (!token) {
            throw new TokenNotConfiguredError()
        }

        console.log('Cursor Economizer: API-E (dashboard/teams) 取得中...')
        const raw = await withRetry(() => this.httpPost(API_TEAMS_URL, token, '{}'), MAX_RETRIES)

        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            throw new ApiParseError('dashboard/teams JSON 解析失敗')
        }

        const teams = toApiTeamsResponse(parsed)
        console.log('Cursor Economizer: API-E (dashboard/teams) 取得完了')
        return teams
    }

    /**
     * API-E の取得結果を teams テーブルに保存する。
     * 最新スナップショットのみ保持（DELETE → INSERT）。
     */
    saveTeamsToDb(teams: ApiTeamsResponse): void {
        const fetchedAt = new Date().toISOString()
        const rawJson = JSON.stringify(teams)

        dbService.reload()
        const db = dbService.getDb()

        db.run('DELETE FROM teams')

        const insertSql = `
      INSERT INTO teams (
        id, name, role, seats, has_billing,
        request_quota_per_seat, privacy_mode_forced, allow_sso,
        admin_only_usage_pricing, subscription_status,
        privacy_mode_migration_opted_out, membership_type,
        billing_cycle_start, billing_cycle_end,
        individual_spend_limits_blocked, customer_balance_cents,
        raw_json, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

        for (const t of teams.teams) {
            db.run(insertSql, [
                t.id,
                t.name,
                t.role,
                t.seats,
                t.hasBilling ? 1 : 0,
                t.requestQuotaPerSeat,
                t.privacyModeForced ? 1 : 0,
                t.allowSso ? 1 : 0,
                t.adminOnlyUsagePricing ? 1 : 0,
                t.subscriptionStatus,
                t.privacyModeMigrationOptedOut ? 1 : 0,
                t.membershipType,
                t.billingCycleStart,
                t.billingCycleEnd,
                t.individualSpendLimitsBlocked ? 1 : 0,
                t.customerBalanceCents,
                rawJson,
                fetchedAt
            ])
        }

        dbService.persist()
        console.log(`Cursor Economizer: teams を保存しました (${teams.teams.length} 件)`)
    }

    /**
     * HTTPS POST リクエスト。
     * エラー分類:
     *   - 401/403 → ApiUnauthorizedError
     *   - タイムアウト → ApiTimeoutError
     *   - その他 HTTP エラー → ApiHttpError
     *   - ネットワークエラー → そのまま throw
     *
     * token 値はログ・エラーメッセージに出力しない。
     */
    private httpPost(url: string, token: string, body: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url)
            let isSettled = false

            const doReject = (err: Error): void => {
                if (!isSettled) {
                    isSettled = true
                    reject(err)
                }
            }

            const doResolve = (value: string): void => {
                if (!isSettled) {
                    isSettled = true
                    resolve(value)
                }
            }

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                path: parsed.pathname,
                method: 'POST',
                timeout: HTTP_TIMEOUT_MS,
                headers: {
                    'content-type': 'application/json',
                    origin: 'https://cursor.com',
                    referer: 'https://cursor.com/dashboard?tab=usage',
                    Cookie: `WorkosCursorSessionToken=${token}`
                }
            }

            const req = https.request(options, (res) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk: Buffer) => chunks.push(chunk))

                res.on('error', (err: Error) => {
                    doReject(err)
                })

                res.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString('utf-8')
                    const statusCode = res.statusCode ?? 0

                    if (statusCode === 401 || statusCode === 403) {
                        doReject(new ApiUnauthorizedError(statusCode))
                        return
                    }

                    if (statusCode < 200 || statusCode >= 300) {
                        doReject(new ApiHttpError(statusCode, responseBody))
                        return
                    }

                    doResolve(responseBody)
                })
            })

            req.on('timeout', () => {
                req.destroy()
                doReject(new ApiTimeoutError())
            })

            req.on('error', (err: Error) => {
                doReject(err)
            })

            req.write(body)
            req.end()
        })
    }

    /**
     * HTTPS GET リクエスト。
     * httpPost と同じエラー分類・isSettled パターン・タイムアウト設定。
     * body なし、content-type ヘッダーなし。
     *
     * token 値はログ・エラーメッセージに出力しない。
     */
    private httpGet(url: string, token: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url)
            let isSettled = false

            const doReject = (err: Error): void => {
                if (!isSettled) {
                    isSettled = true
                    reject(err)
                }
            }

            const doResolve = (value: string): void => {
                if (!isSettled) {
                    isSettled = true
                    resolve(value)
                }
            }

            const options: https.RequestOptions = {
                hostname: parsed.hostname,
                path: parsed.pathname,
                method: 'GET',
                timeout: HTTP_TIMEOUT_MS,
                headers: {
                    origin: 'https://cursor.com',
                    referer: 'https://cursor.com/dashboard?tab=usage',
                    Cookie: `WorkosCursorSessionToken=${token}`
                }
            }

            const req = https.request(options, (res) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk: Buffer) => chunks.push(chunk))

                res.on('error', (err: Error) => {
                    doReject(err)
                })

                res.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString('utf-8')
                    const statusCode = res.statusCode ?? 0

                    if (statusCode === 401 || statusCode === 403) {
                        doReject(new ApiUnauthorizedError(statusCode))
                        return
                    }

                    if (statusCode < 200 || statusCode >= 300) {
                        doReject(new ApiHttpError(statusCode, responseBody))
                        return
                    }

                    doResolve(responseBody)
                })
            })

            req.on('timeout', () => {
                req.destroy()
                doReject(new ApiTimeoutError())
            })

            req.on('error', (err: Error) => {
                doReject(err)
            })

            req.end()
        })
    }
}

/** シングルトンインスタンス */
export const apiService = new ApiService()
