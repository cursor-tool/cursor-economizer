import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import { dbService } from './services/dbService'
import { tokenService } from './services/tokenService'
import { statusBarService } from './services/statusBarService'
import { fetchLockService } from './services/fetchLockService'
import { webviewService } from './services/webviewService'
import {
    apiService,
    TokenNotConfiguredError,
    ApiUnauthorizedError,
    ApiTimeoutError,
    ApiHttpError,
    ApiParseError
} from './services/apiService'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Cursor Economizer: activating...')

    let dbReady = false

    // ── Phase A: サービス基盤初期化（失敗してもコマンド登録まで必ず到達させる） ──
    try {
        // DB 初期化
        await dbService.initialize(context)
        dbReady = true
        console.log('Cursor Economizer: DB initialized')

        // 自動データ削除
        try {
            const autoDeleteDays = vscode.workspace
                .getConfiguration('cursorEconomizer')
                .get<number>('autoDeleteDays', 90)
            if (autoDeleteDays > 0) {
                const deletedCount = dbService.deleteOlderThan(autoDeleteDays)
                if (deletedCount > 0) {
                    console.log(
                        `Cursor Economizer: 自動削除完了 (${deletedCount} 件、${autoDeleteDays} 日超過分)`
                    )
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error('Cursor Economizer: 自動削除失敗:', message)
        }

        // FetchLockService 初期化
        fetchLockService.initialize()
        console.log('Cursor Economizer: FetchLockService initialized')

        // FileWatcher: db-updated.json の変更を監視
        const notifPath = fetchLockService.getNotificationFilePath()
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.Uri.file(path.dirname(notifPath)),
                path.basename(notifPath)
            )
        )
        const onDbUpdated = () => {
            dbService.reload()
            statusBarService.refresh().catch((err2) => {
                const message = err2 instanceof Error ? err2.message : String(err2)
                console.error('Cursor Economizer: StatusBar 更新失敗 (FileWatcher):', message)
            })
            try {
                webviewService.sendDataToWebview()
            } catch (err2) {
                const message = err2 instanceof Error ? err2.message : String(err2)
                console.error('Cursor Economizer: Webview 更新失敗 (FileWatcher):', message)
            }
        }
        watcher.onDidChange(onDbUpdated)
        watcher.onDidCreate(onDbUpdated)
        context.subscriptions.push(watcher)
        console.log('Cursor Economizer: FileWatcher registered')
    } catch (err) {
        dbReady = false
        const message = err instanceof Error ? err.message : String(err)
        console.error('Cursor Economizer: 基盤初期化失敗:', message)
        vscode.window.showErrorMessage(`Cursor Economizer: 初期化失敗 - ${message}`)
    }

    // ── Phase B: UI 初期化（Phase A の成否に関わらず必ず実行） ──
    tokenService.initialize(context)
    console.log('Cursor Economizer: TokenService initialized')

    statusBarService.initialize()
    console.log('Cursor Economizer: StatusBarService initialized')

    context.subscriptions.push(
        tokenService.onTokenChanged((newToken) => {
            statusBarService.refresh().catch((err) => {
                const message = err instanceof Error ? err.message : String(err)
                console.error('Cursor Economizer: StatusBar 更新失敗 (tokenChanged):', message)
            })
            // トークン変更 = アカウント切替の可能性がある
            // → 強制初回同期フラグをセットして、旧アカウントの差分取得パスに入らないようにする
            if (newToken) {
                forceInitialSync = true
                console.log('Cursor Economizer: トークン変更検知 → 強制初回同期フラグ ON')

                // inFlight の場合は完了後に自動取得タイマーが発火するのを待つ
                // inFlight でなければ即座に refreshData を実行
                const retryRefresh = () => {
                    if (inFlight) {
                        setTimeout(retryRefresh, 500)
                        return
                    }
                    vscode.commands
                        .executeCommand('cursorEconomizer.refreshData')
                        .then(undefined, (err) => {
                            const message = err instanceof Error ? err.message : String(err)
                            console.error(
                                'Cursor Economizer: refreshData 失敗 (tokenChanged):',
                                message
                            )
                        })
                }
                retryRefresh()
            }
        })
    )

    webviewService.initialize(context)
    console.log('Cursor Economizer: WebviewService initialized')

    // 設定変更を監視
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            // 表示設定の変更 → Webview に即時反映
            if (
                e.affectsConfiguration('cursorEconomizer.columns') ||
                e.affectsConfiguration('cursorEconomizer.pageSize') ||
                e.affectsConfiguration('cursorEconomizer.ecoMeterThreshold')
            ) {
                try {
                    webviewService.sendDataToWebview()
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err)
                    console.error('Cursor Economizer: Webview 更新失敗 (設定変更):', message)
                }
            }

            // 自動取得設定の変更 → タイマー再構成
            if (
                e.affectsConfiguration('cursorEconomizer.autoRefreshEnabled') ||
                e.affectsConfiguration('cursorEconomizer.autoRefreshIntervalMinutes')
            ) {
                startOrRestartAutoRefresh()
            }
        })
    )

    // --- 自動取得スケジューラ（activate クロージャスコープ） ---

    /** 自動取得タイマーを（再）起動する。既存タイマーは必ず停止してから再設定する。 */
    const startOrRestartAutoRefresh = (): void => {
        // 既存タイマーを確実に停止
        if (_autoRefreshTimerRef !== undefined) {
            clearInterval(_autoRefreshTimerRef)
            _autoRefreshTimerRef = undefined
        }

        const cfg = vscode.workspace.getConfiguration('cursorEconomizer')
        const enabled = cfg.get<boolean>('autoRefreshEnabled', true)
        if (!enabled) {
            console.log('Cursor Economizer: 自動取得は無効です')
            return
        }

        const intervalMin = cfg.get<number>('autoRefreshIntervalMinutes', 3)
        const intervalMs = intervalMin * 60 * 1000

        _autoRefreshTimerRef = setInterval(() => {
            vscode.commands
                .executeCommand('cursorEconomizer.refreshData')
                .then(undefined, (err) => {
                    const message = err instanceof Error ? err.message : String(err)
                    console.error('Cursor Economizer: 自動取得失敗:', message)
                })
        }, intervalMs)

        console.log(`Cursor Economizer: 自動取得スケジュール開始 (${intervalMin}分間隔)`)
    }

    // --- refreshData 多重起動ガード（activate クロージャスコープ） ---
    let inFlight = false
    // トークン変更時に true → refreshData で初回同期を強制（差分取得パスをスキップ）
    let forceInitialSync = false

    // コマンド登録: データ取得（API-A 配線）
    context.subscriptions.push(
        vscode.commands.registerCommand('cursorEconomizer.refreshData', async () => {
            // DB 未初期化時はデータ取得を拒否
            if (!dbReady) {
                vscode.window.showErrorMessage(
                    'DB が初期化されていません。Cursor を再起動してください'
                )
                return
            }

            // 同一ウィンドウ内の多重起動を抑止（withProgress が表示中のためサイレント）
            if (inFlight) {
                return
            }

            inFlight = true
            webviewService.postToWebview({ type: 'loading', isLoading: true })

            // クロスウィンドウ取得ロック（fetch.lock による排他制御）
            if (!fetchLockService.acquireLock()) {
                inFlight = false
                webviewService.postToWebview({ type: 'loading', isLoading: false })
                return
            }

            // ── バックグラウンド取得が走っているかを追跡するフラグ ──
            // true の間はロック・inFlight を保持し続ける
            let backgroundRunning = false

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Cursor Economizer: データ取得中...',
                        cancellable: false
                    },
                    async () => {
                        // token 取得（API-A / API-B 共通。並列実行の前に取得）
                        const token = await tokenService.getToken()
                        if (!token) {
                            vscode.window.showWarningMessage(
                                'トークンが未設定です。コマンド「トークン設定」を実行してください'
                            )
                            return
                        }

                        // ────────────────────────────────────────────
                        // 初回同期 vs 差分取得の分岐
                        // トークン変更時は forceInitialSync=true → 常に初回同期パスへ
                        // ────────────────────────────────────────────
                        const latest = forceInitialSync
                            ? null
                            : apiService.getLatestEventTimestamp()
                        const isInitialSync = latest === null
                        if (forceInitialSync) {
                            forceInitialSync = false
                            console.log(
                                'Cursor Economizer: 強制初回同期 (トークン変更)'
                            )
                        }

                        if (isInitialSync) {
                            // ════════════════════════════════════════
                            // 初回同期: 先頭1ページ即時表示 + 残りバックグラウンド
                            // ════════════════════════════════════════
                            console.log('Cursor Economizer: 初回同期を開始します（段階取得モード）')

                            // Phase 1: 先頭1ページ + API-B/C/E を並列フェッチ
                            const [resultFirstPage, resultB, resultC, resultE] =
                                await Promise.allSettled([
                                    apiService.fetchEventsFirstPage(token),
                                    apiService.fetchUsageSummary(token),
                                    apiService.fetchAuthMe(token),
                                    apiService.fetchTeams(token)
                                ])

                            // API-D: API-E の結果から teamId を取得して実行
                            // チーム未所属（無料プラン等）の場合は正常スキップ（null）
                            let resultD: PromiseSettledResult<
                                Awaited<ReturnType<typeof apiService.fetchTeam>>
                            > | null = null
                            if (
                                resultE.status === 'fulfilled' &&
                                resultE.value.teams.length > 0
                            ) {
                                const teamId = resultE.value.teams[0].id
                                resultD = await Promise.allSettled([
                                    apiService.fetchTeam(token, teamId)
                                ]).then((r) => r[0])
                            } else if (resultE.status === 'fulfilled') {
                                console.log(
                                    'Cursor Economizer: チーム未所属のため API-D スキップ'
                                )
                                // 旧トークンの team_members が残留すると
                                // ロール判定や表示フィルタに影響するためクリアする
                                dbService.reload()
                                const db = dbService.getDb()
                                db.run('DELETE FROM team_members')
                                dbService.persist()
                                console.log(
                                    'Cursor Economizer: team_members をクリアしました（チーム未所属）'
                                )
                            }

                            // API-C/D/E のフェッチエラーはログ + 通知
                            // null（正常スキップ）は除外する
                            const cdeErrors: string[] = []
                            const cdeEntries: [string, PromiseSettledResult<unknown> | null][] = [
                                ['API-C (auth/me)', resultC],
                                ['API-D (dashboard/team)', resultD],
                                ['API-E (dashboard/teams)', resultE]
                            ]
                            for (const [label, result] of cdeEntries) {
                                if (result === null) {
                                    continue
                                }
                                if (result.status === 'rejected') {
                                    const msg =
                                        result.reason instanceof Error
                                            ? result.reason.message
                                            : String(result.reason)
                                    console.error(
                                        `Cursor Economizer: ${label} 取得失敗:`,
                                        msg
                                    )
                                    cdeErrors.push(`${label}: ${msg}`)
                                }
                            }
                            if (cdeErrors.length > 0) {
                                vscode.window.showWarningMessage(
                                    `補助API取得失敗: ${cdeErrors.join(' / ')}`
                                )
                            }

                            // Phase 2: DB 保存（先頭ページ + 補助 API）
                            let savedEventCount = 0
                            let hasMore = false
                            let firstPageStartDate = ''
                            let firstPageEndDate = ''

                            if (resultFirstPage.status === 'fulfilled') {
                                const fp = resultFirstPage.value
                                apiService.saveEventsToDb(fp.events)
                                savedEventCount = fp.events.length
                                hasMore = fp.hasMore
                                firstPageStartDate = fp.startDate
                                firstPageEndDate = fp.endDate
                            }
                            if (resultB.status === 'fulfilled') {
                                apiService.saveSummaryToDb(resultB.value)
                            }
                            if (resultC.status === 'fulfilled') {
                                apiService.saveAuthMeToDb(resultC.value)
                            }
                            if (resultD !== null && resultD.status === 'fulfilled') {
                                const teamIdForSave =
                                    resultE.status === 'fulfilled' &&
                                    resultE.value.teams.length > 0
                                        ? resultE.value.teams[0].id
                                        : 0
                                apiService.saveTeamToDb(resultD.value, teamIdForSave)
                            }
                            if (resultE.status === 'fulfilled') {
                                apiService.saveTeamsToDb(resultE.value)
                            }

                            // Phase 3: 結果通知（先頭ページ分）
                            if (
                                resultFirstPage.status === 'fulfilled' &&
                                resultB.status === 'fulfilled'
                            ) {
                                const moreMsg = hasMore ? '（残りをバックグラウンドで取得中...）' : ''
                                vscode.window.showInformationMessage(
                                    `データ取得完了: イベント${savedEventCount}件 / サマリ更新済み${moreMsg}`
                                )
                            } else if (
                                resultFirstPage.status === 'fulfilled' &&
                                resultB.status === 'rejected'
                            ) {
                                const bMsg =
                                    resultB.reason instanceof Error
                                        ? resultB.reason.message
                                        : String(resultB.reason)
                                console.error(
                                    'Cursor Economizer: API-B (usage-summary) 取得失敗:',
                                    bMsg
                                )
                                vscode.window.showWarningMessage(
                                    `イベント${savedEventCount}件取得済み。サマリ取得に失敗しました`
                                )
                            } else if (
                                resultFirstPage.status === 'rejected' &&
                                resultB.status === 'fulfilled'
                            ) {
                                const aMsg =
                                    resultFirstPage.reason instanceof Error
                                        ? resultFirstPage.reason.message
                                        : String(resultFirstPage.reason)
                                console.error(
                                    'Cursor Economizer: API-A (usage-events) 取得失敗:',
                                    aMsg
                                )
                                vscode.window.showWarningMessage(
                                    'サマリ更新済み。イベント取得に失敗しました'
                                )
                                throw resultFirstPage.reason
                            } else {
                                const bMsg =
                                    resultB.status === 'rejected'
                                        ? resultB.reason instanceof Error
                                            ? resultB.reason.message
                                            : String(resultB.reason)
                                        : ''
                                console.error(
                                    'Cursor Economizer: API-B (usage-summary) 取得失敗:',
                                    bMsg
                                )
                                throw (resultFirstPage as PromiseRejectedResult).reason
                            }

                            // ── バックグラウンドで残りページを取得 ──
                            if (
                                hasMore &&
                                resultFirstPage.status === 'fulfilled'
                            ) {
                                backgroundRunning = true
                                console.log(
                                    'Cursor Economizer: 残りページをバックグラウンドで取得開始'
                                )

                                // fire-and-forget（withProgress の外で非同期実行）
                                apiService
                                    .fetchEventsRemainingPages(
                                        token,
                                        firstPageStartDate,
                                        firstPageEndDate,
                                        2
                                    )
                                    .then((remainingEvents) => {
                                        if (remainingEvents.length > 0) {
                                            apiService.saveEventsToDb(remainingEvents)
                                            console.log(
                                                `Cursor Economizer: バックグラウンド取得完了 (${remainingEvents.length}件追加)`
                                            )
                                            vscode.window.showInformationMessage(
                                                `バックグラウンド取得完了: ${remainingEvents.length}件追加 (合計${savedEventCount + remainingEvents.length}件)`
                                            )
                                        } else {
                                            console.log(
                                                'Cursor Economizer: バックグラウンド取得完了 (追加イベントなし)'
                                            )
                                        }
                                    })
                                    .catch((bgErr) => {
                                        // エラー握りつぶし禁止: ログ + ユーザー通知
                                        const bgMsg =
                                            bgErr instanceof Error
                                                ? bgErr.message
                                                : String(bgErr)
                                        console.error(
                                            'Cursor Economizer: バックグラウンド取得失敗:',
                                            bgMsg
                                        )
                                        vscode.window.showWarningMessage(
                                            `バックグラウンドのデータ取得に失敗しました: ${bgMsg}`
                                        )
                                    })
                                    .finally(() => {
                                        // バックグラウンド完了後にロック・フラグを解放
                                        backgroundRunning = false
                                        fetchLockService.releaseLock()
                                        inFlight = false
                                        webviewService.postToWebview({
                                            type: 'loading',
                                            isLoading: false
                                        })

                                        // UI 更新
                                        statusBarService.refresh().catch((err2) => {
                                            const msg =
                                                err2 instanceof Error
                                                    ? err2.message
                                                    : String(err2)
                                            console.error(
                                                'Cursor Economizer: StatusBar 更新失敗 (background finally):',
                                                msg
                                            )
                                        })
                                        try {
                                            webviewService.sendDataToWebview()
                                        } catch (err2) {
                                            const msg =
                                                err2 instanceof Error
                                                    ? err2.message
                                                    : String(err2)
                                            console.error(
                                                'Cursor Economizer: Webview 更新失敗 (background finally):',
                                                msg
                                            )
                                        }

                                        startOrRestartAutoRefresh()
                                        console.log(
                                            'Cursor Economizer: バックグラウンド処理のクリーンアップ完了'
                                        )
                                    })
                            }
                        } else {
                            // ════════════════════════════════════════
                            // 差分取得: 既存フロー（通常少量のため同期実行）
                            // ════════════════════════════════════════
                            console.log(
                                `Cursor Economizer: 差分取得を開始します (since: ${latest})`
                            )

                            // Phase 1: API-A(差分) + B/C/E を並列フェッチ
                            const [resultA, resultB, resultC, resultE] =
                                await Promise.allSettled([
                                    apiService.fetchDeltaEvents(token, latest),
                                    apiService.fetchUsageSummary(token),
                                    apiService.fetchAuthMe(token),
                                    apiService.fetchTeams(token)
                                ])

                            // API-D: API-E の結果から teamId を取得して実行
                            // チーム未所属（無料プラン等）の場合は正常スキップ（null）
                            let resultD: PromiseSettledResult<
                                Awaited<ReturnType<typeof apiService.fetchTeam>>
                            > | null = null
                            if (
                                resultE.status === 'fulfilled' &&
                                resultE.value.teams.length > 0
                            ) {
                                const teamId = resultE.value.teams[0].id
                                resultD = await Promise.allSettled([
                                    apiService.fetchTeam(token, teamId)
                                ]).then((r) => r[0])
                            } else if (resultE.status === 'fulfilled') {
                                console.log(
                                    'Cursor Economizer: チーム未所属のため API-D スキップ'
                                )
                                dbService.reload()
                                const db = dbService.getDb()
                                db.run('DELETE FROM team_members')
                                dbService.persist()
                                console.log(
                                    'Cursor Economizer: team_members をクリアしました（チーム未所属）'
                                )
                            }

                            // API-C/D/E のフェッチエラーはログ + 通知
                            // null（正常スキップ）は除外する
                            const cdeErrors: string[] = []
                            const cdeEntries: [string, PromiseSettledResult<unknown> | null][] = [
                                ['API-C (auth/me)', resultC],
                                ['API-D (dashboard/team)', resultD],
                                ['API-E (dashboard/teams)', resultE]
                            ]
                            for (const [label, result] of cdeEntries) {
                                if (result === null) {
                                    continue
                                }
                                if (result.status === 'rejected') {
                                    const msg =
                                        result.reason instanceof Error
                                            ? result.reason.message
                                            : String(result.reason)
                                    console.error(
                                        `Cursor Economizer: ${label} 取得失敗:`,
                                        msg
                                    )
                                    cdeErrors.push(`${label}: ${msg}`)
                                }
                            }
                            if (cdeErrors.length > 0) {
                                vscode.window.showWarningMessage(
                                    `補助API取得失敗: ${cdeErrors.join(' / ')}`
                                )
                            }

                            // Phase 2: DB 保存
                            let savedEventCount = 0
                            if (resultA.status === 'fulfilled') {
                                apiService.saveEventsToDb(resultA.value)
                                savedEventCount = resultA.value.length
                            }
                            if (resultB.status === 'fulfilled') {
                                apiService.saveSummaryToDb(resultB.value)
                            }
                            if (resultC.status === 'fulfilled') {
                                apiService.saveAuthMeToDb(resultC.value)
                            }
                            if (resultD !== null && resultD.status === 'fulfilled') {
                                const teamIdForSave =
                                    resultE.status === 'fulfilled' &&
                                    resultE.value.teams.length > 0
                                        ? resultE.value.teams[0].id
                                        : 0
                                apiService.saveTeamToDb(resultD.value, teamIdForSave)
                            }
                            if (resultE.status === 'fulfilled') {
                                apiService.saveTeamsToDb(resultE.value)
                            }

                            // Phase 3: 結果通知（差分取得は成功時ログのみ。警告・エラーは通知）
                            if (
                                resultA.status === 'fulfilled' &&
                                resultB.status === 'fulfilled'
                            ) {
                                // 差分取得の成功はログのみ（StatusBar で確認可能。通知蓄積を防止）
                                console.log(
                                    `Cursor Economizer: 差分取得完了 イベント${savedEventCount}件 / サマリ更新済み`
                                )
                            } else if (
                                resultA.status === 'fulfilled' &&
                                resultB.status === 'rejected'
                            ) {
                                const bMsg =
                                    resultB.reason instanceof Error
                                        ? resultB.reason.message
                                        : String(resultB.reason)
                                console.error(
                                    'Cursor Economizer: API-B (usage-summary) 取得失敗:',
                                    bMsg
                                )
                                vscode.window.showWarningMessage(
                                    `イベント${savedEventCount}件取得済み。サマリ取得に失敗しました`
                                )
                            } else if (
                                resultA.status === 'rejected' &&
                                resultB.status === 'fulfilled'
                            ) {
                                const aMsg =
                                    resultA.reason instanceof Error
                                        ? resultA.reason.message
                                        : String(resultA.reason)
                                console.error(
                                    'Cursor Economizer: API-A (usage-events) 取得失敗:',
                                    aMsg
                                )
                                vscode.window.showWarningMessage(
                                    'サマリ更新済み。イベント取得に失敗しました'
                                )
                                throw resultA.reason
                            } else {
                                const bMsg =
                                    resultB.status === 'rejected'
                                        ? resultB.reason instanceof Error
                                            ? resultB.reason.message
                                            : String(resultB.reason)
                                        : ''
                                console.error(
                                    'Cursor Economizer: API-B (usage-summary) 取得失敗:',
                                    bMsg
                                )
                                throw (resultA as PromiseRejectedResult).reason
                            }
                        }
                    }
                )
            } catch (err) {
                // エラー通知マッピング（code ベースで分類）
                if (err instanceof TokenNotConfiguredError) {
                    vscode.window.showWarningMessage(
                        'トークンが未設定です。コマンド「トークン設定」を実行してください'
                    )
                } else if (err instanceof ApiUnauthorizedError) {
                    vscode.window.showErrorMessage(
                        'トークンが無効または期限切れです。再設定してください'
                    )
                } else if (err instanceof ApiTimeoutError) {
                    vscode.window.showErrorMessage(
                        'APIタイムアウト。時間をおいて再実行してください'
                    )
                } else if (err instanceof ApiHttpError) {
                    vscode.window.showErrorMessage(`APIエラー (HTTP ${err.statusCode})`)
                } else if (err instanceof ApiParseError) {
                    vscode.window.showErrorMessage('APIレスポンスの解析に失敗しました')
                } else {
                    const message = err instanceof Error ? err.message : String(err)
                    vscode.window.showErrorMessage(`データ取得失敗: ${message}`)
                }

                // エラーはログに記録（token 値は出力しない）
                const logMessage = err instanceof Error ? err.message : String(err)
                console.error('Cursor Economizer: refreshData failed:', logMessage)
            } finally {
                // バックグラウンド取得が走っている場合は、ロック・フラグの解放をバックグラウンド側に委譲する
                // バックグラウンドの .finally() で releaseLock / inFlight=false / UI 更新を行う
                if (!backgroundRunning) {
                    // バックグラウンドなし: 即座にクリーンアップ
                    fetchLockService.releaseLock()
                    inFlight = false
                    webviewService.postToWebview({ type: 'loading', isLoading: false })

                    statusBarService.refresh().catch((err) => {
                        const message = err instanceof Error ? err.message : String(err)
                        console.error(
                            'Cursor Economizer: StatusBar 更新失敗 (refreshData finally):',
                            message
                        )
                    })

                    try {
                        webviewService.sendDataToWebview()
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err)
                        console.error(
                            'Cursor Economizer: Webview 更新失敗 (refreshData finally):',
                            message
                        )
                    }

                    startOrRestartAutoRefresh()
                } else {
                    // バックグラウンド実行中: ロック保持のまま、UI のみ先行更新
                    console.log(
                        'Cursor Economizer: バックグラウンド取得中のため、ロック・フラグは保持します'
                    )

                    statusBarService.refresh().catch((err) => {
                        const message = err instanceof Error ? err.message : String(err)
                        console.error(
                            'Cursor Economizer: StatusBar 更新失敗 (refreshData finally, bg running):',
                            message
                        )
                    })

                    try {
                        webviewService.sendDataToWebview()
                    } catch (err) {
                        const message = err instanceof Error ? err.message : String(err)
                        console.error(
                            'Cursor Economizer: Webview 更新失敗 (refreshData finally, bg running):',
                            message
                        )
                    }
                }
            }
        })
    )

    // コマンド登録: トークン設定
    context.subscriptions.push(
        vscode.commands.registerCommand('cursorEconomizer.setToken', async () => {
            const value = await vscode.window.showInputBox({
                prompt: 'WorkosCursorSessionToken の値を入力',
                password: true,
                ignoreFocusOut: true
            })

            // キャンセルまたは空文字の場合は何もしない
            if (!value) {
                return
            }

            try {
                await tokenService.setToken(value)
                vscode.window.showInformationMessage('トークンを保存しました')
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                vscode.window.showErrorMessage(`トークン保存失敗: ${message}`)
                throw err
            }
        })
    )

    // コマンド登録: トークン削除
    context.subscriptions.push(
        vscode.commands.registerCommand('cursorEconomizer.clearToken', async () => {
            const choice = await vscode.window.showWarningMessage(
                'トークンを削除しますか？',
                '削除',
                'キャンセル'
            )

            if (choice !== '削除') {
                return
            }

            try {
                await tokenService.clearToken()
                vscode.window.showInformationMessage('トークンを削除しました')
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                vscode.window.showErrorMessage(`トークン削除失敗: ${message}`)
                throw err
            }
        })
    )

    // コマンド登録: 詳細 Webview 起動
    context.subscriptions.push(
        vscode.commands.registerCommand('cursorEconomizer.openDetail', () => {
            webviewService.openPanel()
        })
    )

    // コマンド登録: CSV エクスポート
    context.subscriptions.push(
        vscode.commands.registerCommand('cursorEconomizer.exportCsv', async () => {
            if (!dbReady) {
                vscode.window.showErrorMessage(
                    'DB が初期化されていません。Cursor を再起動してください'
                )
                return
            }

            const db = dbService.getDb()

            // ── アクセス制御: webviewService.sendDataToWebview と同一ロジック ──
            // (1) チーム管理者 (OWNER): owning_team でフィルタ → チーム全員分
            // (2) チームメンバー (MEMBER): owning_team + owning_user → 自身のみ
            // (3) チーム未所属 (無料プラン等): owning_user → 自身のみ
            const whereClauses: string[] = []
            const whereParams: (string | number)[] = []

            // auth_me から現在のユーザー ID を取得
            let myUserId: number | null = null
            const meResult = db.exec('SELECT id FROM auth_me LIMIT 1')
            if (meResult.length > 0 && meResult[0].values.length > 0) {
                const id = meResult[0].values[0][0]
                myUserId = typeof id === 'number' ? id : null
            }

            // teams から自チーム ID を取得
            let myTeamId: number | null = null
            const teamsResult = db.exec('SELECT id FROM teams ORDER BY fetched_at DESC LIMIT 1')
            if (teamsResult.length > 0 && teamsResult[0].values.length > 0) {
                const id = teamsResult[0].values[0][0]
                myTeamId = typeof id === 'number' ? id : null
            }

            // team_members から自身のロールを取得
            let myRole: string | null = null
            if (myUserId !== null && myTeamId !== null) {
                const roleResult = db.exec(
                    'SELECT role FROM team_members WHERE id = ?',
                    [myUserId]
                )
                if (roleResult.length > 0 && roleResult[0].values.length > 0) {
                    myRole = String(roleResult[0].values[0][0] ?? '')
                }
            }

            if (myTeamId !== null) {
                whereClauses.push('owning_team = ?')
                whereParams.push(String(myTeamId))
                if (myRole === 'TEAM_ROLE_MEMBER' && myUserId !== null) {
                    whereClauses.push('owning_user = ?')
                    whereParams.push(String(myUserId))
                }
            } else if (myUserId !== null) {
                whereClauses.push('owning_user = ?')
                whereParams.push(String(myUserId))
            }

            const whereClause = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''
            const result = db.exec(
                `SELECT * FROM usage_events${whereClause} ORDER BY timestamp DESC`,
                whereParams.length > 0 ? whereParams : undefined
            )

            if (result.length === 0 || result[0].values.length === 0) {
                vscode.window.showInformationMessage('エクスポートするデータがありません')
                return
            }

            const columns = result[0].columns
            const rows = result[0].values

            // id, raw_json カラムを除外するインデックスを特定
            const excludeSet = new Set(['id', 'raw_json'])
            const includeIndices: number[] = []
            const headerNames: string[] = []
            for (let i = 0; i < columns.length; i++) {
                if (!excludeSet.has(columns[i])) {
                    includeIndices.push(i)
                    headerNames.push(columns[i])
                }
            }

            // CSV エスケープ（RFC 4180 準拠）
            const escapeCsvField = (value: unknown): string => {
                if (value === null || value === undefined) {
                    return ''
                }
                const str = String(value)
                if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                    return `"${str.replace(/"/g, '""')}"`
                }
                return str
            }

            // CSV 文字列を構築
            const csvLines: string[] = []
            csvLines.push(headerNames.map(escapeCsvField).join(','))
            for (const row of rows) {
                const line = includeIndices.map((idx) => escapeCsvField(row[idx])).join(',')
                csvLines.push(line)
            }
            const csvContent = '\uFEFF' + csvLines.join('\n')

            // デフォルトファイル名: cursor-usage-YYYYMMDD.csv
            const now = new Date()
            const yyyy = now.getFullYear()
            const mm = String(now.getMonth() + 1).padStart(2, '0')
            const dd = String(now.getDate()).padStart(2, '0')
            const defaultFileName = `cursor-usage-${yyyy}${mm}${dd}.csv`

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(
                    path.join(
                        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir(),
                        defaultFileName
                    )
                ),
                filters: { 'CSV Files': ['csv'] }
            })

            if (!uri) {
                return // ユーザーがキャンセル
            }

            try {
                const encoder = new TextEncoder()
                await vscode.workspace.fs.writeFile(uri, encoder.encode(csvContent))
                vscode.window.showInformationMessage(
                    `CSV エクスポート完了: ${rows.length} 件 → ${uri.fsPath}`
                )
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                vscode.window.showErrorMessage(`CSV 書き込み失敗: ${message}`)
                throw err
            }
        })
    )

    // 自動取得タイマー初回起動
    startOrRestartAutoRefresh()

    console.log('Cursor Economizer: activated')
}

// autoRefreshTimer はモジュールスコープに昇格（deactivate からアクセスするため）
let _autoRefreshTimerRef: ReturnType<typeof setInterval> | undefined

export function deactivate(): void {
    // クリーンアップ順序: 初期化の逆順
    // 自動取得タイマー停止（最優先で解放）
    if (_autoRefreshTimerRef !== undefined) {
        clearInterval(_autoRefreshTimerRef)
        _autoRefreshTimerRef = undefined
    }
    fetchLockService.releaseLock()
    webviewService.dispose()
    statusBarService.dispose()
    tokenService.dispose()
    dbService.close()
    console.log('Cursor Economizer: deactivated')
}
