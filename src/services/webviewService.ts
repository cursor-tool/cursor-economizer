import * as vscode from 'vscode'
import * as crypto from 'crypto'
import { dbService } from './dbService'

/**
 * WebviewPanel の生成・CSP・HTML 組立・postMessage 基盤・データ送信・メモ更新を担当する。
 * DB クエリで usage_events / usage_summary を取得し Webview へ送信する。
 * raw_json / id は Webview に送信しない（巨大・不要のため除外）。
 * メモ更新: Webview からの updateMemo を受信し DB UPDATE → persist → memoUpdated 返信。
 * token 値をログ・Webview に出力しない。
 */

class WebviewService {
    private extensionUri: vscode.Uri | null = null
    private panel: vscode.WebviewPanel | undefined = undefined

    /**
     * ExtensionContext から extensionUri を保持する。
     * activate() 内で FileWatcher 登録の後、コマンド登録の前に呼び出すこと。
     * シグネチャ: void（同期）
     */
    initialize(context: vscode.ExtensionContext): void {
        this.extensionUri = context.extensionUri
    }

    /**
     * 詳細 Webview パネルを開く。
     * パネルが既に開いている場合は reveal() で表示する。
     * パネル閉じ時に undefined にリセットする。
     *
     * openDetail コマンドから呼び出す。
     */
    openPanel(): void {
        if (!this.extensionUri) {
            throw new Error('WebviewService が初期化されていません')
        }

        // パネルが既に開いている場合は reveal して return
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One)
            return
        }

        // 新しいパネルを作成
        const panel = vscode.window.createWebviewPanel(
            'cursorEconomizerDetail',
            'Cursor Economizer',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')]
            }
        )

        // HTML を設定
        panel.webview.html = this.getHtmlForWebview(panel.webview)

        // パネル閉じ時にリセット
        panel.onDidDispose(() => {
            this.panel = undefined
        })

        // Webview → Extension Host のメッセージ受信ハンドラ
        panel.webview.onDidReceiveMessage((msg: unknown) => {
            this.handleMessage(msg)
        })

        this.panel = panel
    }

    /**
     * Webview パネルの HTML を動的に構築する。
     * nonce ベースの CSP を設定し、out/webview/main.js を asWebviewUri で読み込む。
     *
     * 開発モード: CURSOR_ECONOMIZER_DEV=1 の場合は localhost:24680 の Vite dev server を使用。
     * 本番モード: esbuild/Vite でビルドされた main.js を読み込む。
     */
    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString('hex')

        // 開発モード: Vite dev server から読み込み
        if (process.env.CURSOR_ECONOMIZER_DEV === '1') {
            return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline' http://localhost:24680; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; connect-src http://localhost:24680 ws://localhost:24680;">
  <title>Cursor Economizer</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="http://localhost:24680/src/index.tsx"></script>
</body>
</html>`
        }

        // 本番モード: ビルド済み main.js を読み込み
        const mainJsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri!, 'out', 'webview', 'main.js')
        )

        return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
  <title>Cursor Economizer</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${mainJsUri}"></script>
</body>
</html>`
    }

    /**
     * Webview → Extension Host のメッセージを処理する。
     * msg の type プロパティで分岐。未知の type はログ出力のみ。
     */
    private handleMessage(msg: unknown): void {
        if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
            console.warn('Cursor Economizer: Webview から不正なメッセージを受信:', msg)
            return
        }

        const { type } = msg as { type: string }

        switch (type) {
            case 'requestData':
                this.sendDataToWebview()
                break
            case 'updateMemo':
                this.handleUpdateMemo(
                    msg as {
                        type: string
                        timestamp: string
                        model: string
                        owningUser: string
                        note: string
                    }
                )
                break
            case 'requestRefresh':
                vscode.commands.executeCommand('cursorEconomizer.refreshData').then(
                    undefined,
                    (err) => {
                        const message = err instanceof Error ? err.message : String(err)
                        console.error(
                            'Cursor Economizer: Webview からの requestRefresh 失敗:',
                            message
                        )
                    }
                )
                break
            case 'saveColumnOrder':
                this.handleSaveColumnOrder(
                    msg as { type: string; columnOrder: string[] }
                )
                break
            default:
                console.warn(`Cursor Economizer: Webview から未知のメッセージタイプ: ${type}`)
                break
        }
    }

    /**
     * メモ更新ハンドラ。
     * Webview から updateMemo を受信し、DB の usage_events.note を更新する。
     *
     * - DB 書込パターン: reload() → getDb().run(UPDATE) → persist()
     * - reload() 後に getDb() を呼ぶこと（reload() は旧 DB インスタンスを close するため）
     * - persist() は db-updated.json タッチ処理を含む（Phase 9A）→ 他 Window に通知される
     * - 成功時: memoUpdated メッセージで Webview に返信
     * - 失敗時: error メッセージで Webview にエラー通知（エラー握りつぶし禁止）
     */
    private handleUpdateMemo(msg: {
        type: string
        timestamp: string
        model: string
        owningUser: string
        note: string
    }): void {
        const { timestamp, model, owningUser, note } = msg

        try {
            // 他 Window の変更を取り込む
            dbService.reload()

            // reload() 後に getDb() を呼ぶ（reload() 前の参照は無効化される）
            const db = dbService.getDb()

            // UPDATE: note カラムのみ更新。行特定キーは (timestamp, model, owning_user)
            db.run(
                'UPDATE usage_events SET note = ? WHERE timestamp = ? AND model = ? AND owning_user = ?',
                [note, timestamp, model, owningUser]
            )

            // DB 永続化 + db-updated.json タッチ（他 Window 通知）
            dbService.persist()

            // Webview に更新確認を返信
            this.postToWebview({
                type: 'memoUpdated',
                timestamp,
                model,
                owningUser,
                note
            })

            console.log(`Cursor Economizer: メモ更新完了 (model=${model}, timestamp=${timestamp})`)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'メモの更新に失敗しました'
            console.error('Cursor Economizer: メモ更新失敗:', err)

            // Webview にエラー通知（エラー握りつぶし禁止）
            this.postToWebview({
                type: 'error',
                message: `メモの更新に失敗しました: ${message}`
            })
        }
    }

    /**
     * カラム並び順保存ハンドラ。
     * Webview から saveColumnOrder を受信し、DB の table_settings に保存する。
     *
     * - DB 書込パターン: reload() → getDb().run(REPLACE) → persist()
     * - persist() は db-updated.json タッチ処理を含む → 他 Window に通知される
     * - 失敗時: error メッセージで Webview にエラー通知
     */
    private handleSaveColumnOrder(msg: {
        type: string
        columnOrder: string[]
    }): void {
        const { columnOrder } = msg

        try {
            dbService.reload()
            const db = dbService.getDb()

            db.run(
                'REPLACE INTO table_settings (key, value) VALUES (?, ?)',
                ['column_order', JSON.stringify(columnOrder)]
            )

            dbService.persist()

            console.log(
                `Cursor Economizer: カラム並び順保存完了 (${columnOrder.length} columns)`
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : 'カラム並び順の保存に失敗しました'
            console.error('Cursor Economizer: カラム並び順保存失敗:', err)

            this.postToWebview({
                type: 'error',
                message: `カラム並び順の保存に失敗しました: ${message}`
            })
        }
    }

    /**
     * DB からデータを取得して Webview に送信する。
     *
     * - userMap: auth_me + team_members から owning_user ID → 表示名のマッピングを構築。
     * - myRole: team_members で自身の role を判定（OWNER / MEMBER / null）。
     * - ロールフィルタ: チーム所属時は OWNER=全員 / MEMBER=自身のみ。チーム未所属は常に自身のみ。
     * - usage_events: timestamp DESC で最大 10000 件取得。raw_json / id を除外。
     * - totalCount: usage_events の全件数（LIMIT 適用前）。
     * - summary: usage_summary の最新 1 件。raw_json / id を除外。レコードなしなら null。
     *
     * reload() を呼んでディスク上の最新 DB を取り込む。
     * refreshData でデータ保存後にパネルを開くシナリオや、
     * 他 Window でデータ更新された場合でも最新データを表示するため。
     */
    sendDataToWebview(): void {
        // ディスクから最新 DB を再読込（他 Window の変更や直前の refreshData 保存を取り込む）
        dbService.reload()
        const db = dbService.getDb()

        // ── ユーザーマップ構築 + ロール判定 ──
        const { userMap, myRole, myUserId } = this.buildUserContext(db)
        const userName = myUserId !== null ? (userMap[String(myUserId)] ?? null) : null

        // ── 自身の所属チーム ID を取得 ──
        // teams テーブルの最新レコードの id を使い、usage_events.owning_team でフィルタする
        const myTeamId = this.getMyTeamId(db)

        // ── WHERE 条件の構築（チームフィルタ + ロールフィルタ） ──
        const whereClauses: string[] = []
        const whereParams: string[] = []

        if (myTeamId !== null) {
            // チーム所属: チームのイベントに絞る
            whereClauses.push('owning_team = ?')
            whereParams.push(String(myTeamId))
            // MEMBER（非管理者）は自身のデータのみ表示。OWNER は全メンバー分を表示
            if (myRole === 'TEAM_ROLE_MEMBER' && myUserId !== null) {
                whereClauses.push('owning_user = ?')
                whereParams.push(String(myUserId))
            }
        } else if (myUserId !== null) {
            // チーム未所属（個人・無料プラン等）: 自身のデータのみ表示
            // トークン切替後に旧ユーザーのイベントが DB に残っていても混入しない
            whereClauses.push('owning_user = ?')
            whereParams.push(String(myUserId))
        }

        const whereClause = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : ''

        // ── totalCount: LIMIT 適用前の全件数（フィルタ適用後） ──
        const countSql = `SELECT COUNT(*) FROM usage_events${whereClause}`
        const countResult =
            whereParams.length > 0 ? db.exec(countSql, whereParams) : db.exec(countSql)
        const totalCount =
            countResult.length > 0 && countResult[0].values.length > 0
                ? (countResult[0].values[0][0] as number)
                : 0

        // ── events: timestamp DESC で最大 10000 件（フィルタ適用） ──
        const eventsSql = `SELECT * FROM usage_events${whereClause} ORDER BY timestamp DESC LIMIT 10000`
        const eventsResult =
            whereParams.length > 0 ? db.exec(eventsSql, whereParams) : db.exec(eventsSql)
        const events: Record<string, unknown>[] = []
        if (eventsResult.length > 0 && eventsResult[0].values.length > 0) {
            const columns = eventsResult[0].columns
            for (const row of eventsResult[0].values) {
                const obj: Record<string, unknown> = {}
                for (let i = 0; i < columns.length; i++) {
                    // raw_json / id を除外
                    if (columns[i] === 'raw_json' || columns[i] === 'id') {
                        continue
                    }
                    obj[columns[i]] = row[i]
                }
                events.push(obj)
            }
        }

        // ── summary: 最新 1 件 ──
        const summaryResult = db.exec(
            'SELECT * FROM usage_summary ORDER BY fetched_at DESC LIMIT 1'
        )
        let summary: Record<string, unknown> | null = null
        if (summaryResult.length > 0 && summaryResult[0].values.length > 0) {
            const columns = summaryResult[0].columns
            const values = summaryResult[0].values[0]
            const obj: Record<string, unknown> = {}
            for (let i = 0; i < columns.length; i++) {
                // raw_json / id を除外
                if (columns[i] === 'raw_json' || columns[i] === 'id') {
                    continue
                }
                obj[columns[i]] = values[i]
            }
            summary = obj
        }

        // ── 表示設定を読み取り ──
        const cfg = vscode.workspace.getConfiguration('cursorEconomizer')
        const pageSize = cfg.get<number>('pageSize', 500)
        const columnVisibility = {
            kind: cfg.get<boolean>('columns.kind.visible', false),
            max_mode: cfg.get<boolean>('columns.maxMode.visible', false),
            is_token_based_call: cfg.get<boolean>('columns.tokenBased.visible', false),
            is_chargeable: cfg.get<boolean>('columns.chargeable.visible', false),
            is_headless: cfg.get<boolean>('columns.headless.visible', false),
            owning_user: cfg.get<boolean>('columns.user.visible', false),
            cursor_token_fee: cfg.get<boolean>('columns.fee.visible', false)
        }

        // ── columnOrder: table_settings から読み取り ──
        let columnOrder: string[] | undefined
        try {
            const orderResult = db.exec(
                "SELECT value FROM table_settings WHERE key = 'column_order'"
            )
            if (orderResult.length > 0 && orderResult[0].values.length > 0) {
                columnOrder = JSON.parse(orderResult[0].values[0][0] as string)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error('Cursor Economizer: columnOrder 読み取り失敗:', message)
        }

        console.log(
            `Cursor Economizer: sendDataToWebview totalCount=${totalCount}, events.length=${events.length}, summary=${summary ? 'yes' : 'null'}, myRole=${myRole}, userMap keys=${Object.keys(userMap).length}`
        )

        const autoRefreshEnabled = cfg.get<boolean>('autoRefreshEnabled', true)
        const autoRefreshIntervalMinutes = cfg.get<number>('autoRefreshIntervalMinutes', 3)
        const ecoMeterThreshold = cfg.get<number>('ecoMeterThreshold', 1.0)
        const dailyUsageGoal = cfg.get<number>('dailyUsageGoal', 0)
        const monthlyBudgetGoal = cfg.get<number>('monthlyBudgetGoal', 0)

        this.postToWebview({
            type: 'dataLoaded',
            events,
            totalCount,
            summary,
            userMap,
            myRole,
            userName,
            columnVisibility,
            pageSize,
            autoRefreshEnabled,
            autoRefreshIntervalMinutes,
            ecoMeterThreshold,
            dailyUsageGoal,
            monthlyBudgetGoal,
            columnOrder
        })
    }

    /**
     * auth_me + team_members からユーザーマップとロール情報を構築する。
     *
     * - userMap: { [owning_user ID 文字列]: 表示名 } のマッピング
     *   - auth_me: name が空文字でなければ name、なければ email
     *   - team_members: name が空文字でなければ name、なければ email
     * - myRole: team_members テーブルで auth_me.id と一致するレコードの role
     *   - チームに所属していない場合は null
     * - myUserId: auth_me.id（MEMBER フィルタ用）
     */
    private buildUserContext(db: ReturnType<typeof dbService.getDb>): {
        userMap: Record<string, string>
        myRole: string | null
        myUserId: number | null
    } {
        const userMap: Record<string, string> = {}
        let myRole: string | null = null
        let myUserId: number | null = null

        // ── auth_me から自身の情報を取得 ──
        const meResult = db.exec('SELECT id, name, email FROM auth_me LIMIT 1')
        if (meResult.length > 0 && meResult[0].values.length > 0) {
            const [id, name, email] = meResult[0].values[0] as [number, string, string]
            myUserId = id
            const displayName = name && name.trim() !== '' ? name : email
            userMap[String(id)] = displayName
        }

        // ── team_members から全メンバーの情報を取得 ──
        const membersResult = db.exec('SELECT id, name, email, role FROM team_members')
        if (membersResult.length > 0 && membersResult[0].values.length > 0) {
            for (const row of membersResult[0].values) {
                const [id, name, email, role] = row as [number, string, string, string]
                const displayName = name && name.trim() !== '' ? name : email
                userMap[String(id)] = displayName

                // 自身のロールを判定（auth_me.id と team_members.id の一致）
                if (myUserId !== null && id === myUserId) {
                    myRole = role
                }
            }
        }

        return { userMap, myRole, myUserId }
    }

    /**
     * teams テーブルから最新の自チーム ID を取得する。
     * teams が空の場合は null を返す（フィルタなしにフォールバック）。
     */
    private getMyTeamId(db: ReturnType<typeof dbService.getDb>): number | null {
        const result = db.exec('SELECT id FROM teams ORDER BY fetched_at DESC LIMIT 1')
        if (result.length === 0 || result[0].values.length === 0) {
            return null
        }
        const id = result[0].values[0][0]
        return typeof id === 'number' ? id : null
    }

    /**
     * Extension Host → Webview にメッセージを送信する。
     * パネルが未作成の場合は何もしない（throw しない）。
     */
    postToWebview(message: unknown): void {
        this.panel?.webview.postMessage(message)
    }

    /**
     * Webview パネルを破棄する（deactivate 時呼び出し）。
     */
    dispose(): void {
        if (this.panel) {
            this.panel.dispose()
            this.panel = undefined
        }
    }
}

/** シングルトンインスタンス */
export const webviewService = new WebviewService()
