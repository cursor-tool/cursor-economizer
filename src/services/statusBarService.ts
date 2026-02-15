import * as vscode from 'vscode'
import type { UsageSummaryRow } from '../types/usageEvent'
import { dbService } from './dbService'
import { tokenService } from './tokenService'

/**
 * ステータスバーアイテムの生成・表示更新・破棄を担当する。
 * DB 操作（getDb 経由の SELECT）のみ。reload() は呼ばない（メモリ DB が最新のため）。
 * token 値はログ・ツールチップに出力しない。
 */

class StatusBarService {
    private item: vscode.StatusBarItem | null = null

    /**
     * ステータスバーアイテムを生成し、初回表示を行う。
     * activate() 内で tokenService.initialize() の後に呼び出すこと。
     */
    initialize(): void {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
        this.item.command = 'cursorEconomizer.refreshData'
        this.item.text = '$(loading~spin) Cursor Economizer'
        this.item.show()

        // 初回表示のために refresh を呼ぶ（非同期だが await しない — 初期化の同期性を維持）
        this.refresh().catch((err) => {
            const message = err instanceof Error ? err.message : String(err)
            console.error('Cursor Economizer: StatusBar 初回更新失敗:', message)
        })
    }

    /**
     * DB 最新サマリに基づいてステータスバーのテキスト・ツールチップを更新する。
     * 外部から呼び出し可能（refreshData 完了後、tokenChanged イベント時）。
     */
    async refresh(): Promise<void> {
        if (!this.item) {
            return
        }

        // token 設定状態を確認
        const token = await tokenService.getToken()
        if (!token) {
            this.item.text = '$(key) Token未設定'
            this.item.tooltip = this.buildMinimalTooltip('⚠️トークンが設定されていません')
            return
        }

        // DB から最新サマリを取得
        const row = this.getLatestSummary()
        if (!row) {
            this.item.text = '$(dashboard) データなし'
            this.item.tooltip = this.buildMinimalTooltip(
                'ℹ️データがありません。取得ボタンを押してください'
            )
            return
        }

        // 最新イベントからステータスバーテキストを構築
        const latest = this.getLatestEvent()
        if (latest) {
            const emoji = this.getCostEmoji(latest.usage_based_costs, latest.kind)
            const cost = `$${Number(latest.usage_based_costs ?? 0).toFixed(2)}`
            const totalTokens =
                (latest.input_tokens ?? 0) +
                (latest.output_tokens ?? 0) +
                (latest.cache_write_tokens ?? 0) +
                (latest.cache_read_tokens ?? 0)
            const tokensLabel = this.fmtTokens(totalTokens)
            const reqCost = latest.requests_costs != null ? Number(latest.requests_costs).toFixed(2) : '0'
            this.item.text = `${emoji} ${cost} | ${tokensLabel} | Req ${reqCost}`
        } else {
            this.item.text = '$(dashboard) データなし'
        }
        this.item.tooltip = this.buildTooltip(row)
    }

    /**
     * usage_summary テーブルの最新行を取得する。
     * DB が空（レコード 0 件）の場合は null を返す。
     *
     * sql.js の exec() は QueryExecResult[] を返す。
     * result[0].columns と result[0].values[0] からカラム名→値のマッピングで
     * UsageSummaryRow を構築する。
     *
     * reload() は呼ばない（メモリ DB が最新のため）。
     */
    private getLatestSummary(): UsageSummaryRow | null {
        const db = dbService.getDb()
        const result = db.exec('SELECT * FROM usage_summary ORDER BY fetched_at DESC LIMIT 1')

        // テーブルにレコードなし
        if (result.length === 0 || result[0].values.length === 0) {
            return null
        }

        const columns = result[0].columns
        const values = result[0].values[0]

        // カラム名→値のマッピングで UsageSummaryRow を構築
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = values[i]
        }

        return obj as unknown as UsageSummaryRow
    }

    /**
     * ステータスバーのツールチップ（MarkdownString）を構築する。
     * プラン Section 8 のツールチップ仕様に準拠。
     */
    private buildTooltip(row: UsageSummaryRow): vscode.MarkdownString {
        const fmtCycleDate = (iso: string): string => {
            const d = new Date(iso)
            const mm = String(d.getMonth() + 1).padStart(2, '0')
            const dd = String(d.getDate()).padStart(2, '0')
            const hh = String(d.getHours()).padStart(2, '0')
            const min = String(d.getMinutes()).padStart(2, '0')
            return `${mm}/${dd} ${hh}:${min}`
        }
        const cycleStart = fmtCycleDate(row.billing_cycle_start)
        const cycleEnd = fmtCycleDate(row.billing_cycle_end)
        const onDemandDollar = (row.ondemand_used / 100).toFixed(2)
        const teamDollar = (row.team_ondemand_used / 100).toFixed(2)
        const teamLimit =
            row.team_ondemand_limit != null
                ? ` / $${(row.team_ondemand_limit / 100).toFixed(0)}`
                : ''

        const planPct =
            row.plan_limit > 0 ? ((row.plan_used / row.plan_limit) * 100).toFixed(1) : '0.0'
        const bonusText = row.plan_bonus > 0 ? ` +${row.plan_bonus} bonus` : ''

        const ownerLabel = this.getTeamMemberDisplayLabel()

        const tooltip = new vscode.MarkdownString(
            `${ownerLabel}\n\n` +
                `🕐: ${cycleStart} 〜 ${cycleEnd}\n\n` +
                `🆓: ${planPct}% (${row.plan_used} / ${row.plan_limit})${bonusText}\n\n` +
                `💸: $${onDemandDollar}${teamLimit}\n\n` +
                // `Team OnDemand: $${teamDollar}${teamLimit}\n\n` +
                `---\n\n` +
                `[💹](command:cursorEconomizer.openDetail)` +
                ` | [🔄️](command:cursorEconomizer.refreshData)` +
                ` | [🔑](command:cursorEconomizer.setToken)` +
                ` | [⚙️](command:workbench.action.openSettings?%22cursorEconomizer%22)`
        )
        tooltip.isTrusted = true
        tooltip.supportHtml = true

        return tooltip
    }

    /**
     * usage_events テーブルの最新行から表示用フィールドを取得する。
     * teams テーブルに自チーム ID がある場合は owning_team でフィルタする。
     */
    private getLatestEvent(): {
        kind: string
        usage_based_costs: number
        input_tokens: number
        output_tokens: number
        cache_write_tokens: number
        cache_read_tokens: number
        requests_costs: number | null
    } | null {
        const db = dbService.getDb()
        const myTeamId = this.getMyTeamId()

        const sql =
            myTeamId !== null
                ? `SELECT kind, usage_based_costs,
                input_tokens, output_tokens, cache_write_tokens, cache_read_tokens,
                requests_costs
         FROM usage_events WHERE owning_team = ? ORDER BY timestamp DESC LIMIT 1`
                : `SELECT kind, usage_based_costs,
                input_tokens, output_tokens, cache_write_tokens, cache_read_tokens,
                requests_costs
         FROM usage_events ORDER BY timestamp DESC LIMIT 1`

        const result = myTeamId !== null ? db.exec(sql, [String(myTeamId)]) : db.exec(sql)

        if (result.length === 0 || result[0].values.length === 0) {
            return null
        }
        const v = result[0].values[0]
        return {
            kind: String(v[0] ?? ''),
            usage_based_costs: Number(v[1] ?? 0),
            input_tokens: Number(v[2] ?? 0),
            output_tokens: Number(v[3] ?? 0),
            cache_write_tokens: Number(v[4] ?? 0),
            cache_read_tokens: Number(v[5] ?? 0),
            requests_costs: v[6] != null ? Number(v[6]) : null
        }
    }

    /**
     * teams テーブルから最新の自チーム ID を取得する。
     * teams が空の場合は null（フィルタなし）。
     */
    private getMyTeamId(): number | null {
        const db = dbService.getDb()
        const result = db.exec('SELECT id FROM teams ORDER BY fetched_at DESC LIMIT 1')
        if (result.length === 0 || result[0].values.length === 0) {
            return null
        }
        const id = result[0].values[0][0]
        return typeof id === 'number' ? id : null
    }

    /**
     * usage_based_costs（ドル単位）と kind からコスト絵文字を返す。
     * Webview の getCostEmoji と同一ロジック。
     */
    private getCostEmoji(dollars: number, kind: string): string {
        if (typeof dollars === 'number' && dollars > 0) {
            if (dollars < 0.2) {
                return '✅'
            }
            if (dollars <= 0.5) {
                return '⚠️'
            }
            if (dollars > 10) {
                return '🥶'
            }
            if (dollars > 3) {
                return '☠️'
            }
            if (dollars > 1) {
                return '🔥'
            }
            return '🚨'
        }
        if (kind.includes('INCLUDED')) {
            return '💎'
        }
        if (kind.includes('ERRORED_NOT_CHARGED')) {
            return '❌'
        }
        if (typeof dollars === 'number' && dollars === 0) {
            return '🆓'
        }
        return '❓'
    }

    /**
     * トークン数を "12.5M" / "340K" / "500" 形式にフォーマットする。
     */
    private fmtTokens(count: number): string {
        if (count >= 1_000_000) {
            return `${(count / 1_000_000).toFixed(1)}M`
        }
        if (count >= 1_000) {
            return `${(count / 1_000).toFixed(1)}K`
        }
        return String(count)
    }

    /**
     * team_members から表示ラベルを取得する。
     * name が空の場合は email を返す。取得できない場合は空文字を返す。
     */
    private getTeamMemberDisplayLabel(): string {
        const db = dbService.getDb()
        const result = db.exec(
            `SELECT name, email FROM team_members WHERE id = user_id ORDER BY fetched_at DESC LIMIT 1`
        )
        if (result.length === 0 || result[0].values.length === 0) {
            return ''
        }
        const name = String(result[0].values[0][0] ?? '').trim()
        const email = String(result[0].values[0][1] ?? '').trim()
        return name !== '' ? name : email
    }

    /**
     * トークン未設定時・データなし時のツールチップを構築する。
     * コマンドリンク付き MarkdownString を返す。
     */
    private buildMinimalTooltip(message: string): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString(
            `**Cursor Economizer**\n\n` +
                `${message}\n\n` +
                `---\n\n` +
                `[🔑 トークン設定](command:cursorEconomizer.setToken)` +
                ` | [🔄️ データ取得](command:cursorEconomizer.refreshData)` +
                ` | [⚙️ 設定](command:workbench.action.openSettings?%22cursorEconomizer%22)`
        )
        tooltip.isTrusted = true
        tooltip.supportHtml = true
        return tooltip
    }

    /**
     * ステータスバーアイテムを破棄する（deactivate 時呼び出し）。
     */
    dispose(): void {
        if (this.item) {
            this.item.dispose()
            this.item = null
        }
    }
}

/** シングルトンインスタンス */
export const statusBarService = new StatusBarService()
