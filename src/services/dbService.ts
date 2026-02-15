import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

/**
 * sql.js による DB 初期化・永続化基盤。
 * ビジネスロジック（UPSERT、集計クエリ等）は含まない。
 * 後続 Phase で getDb() 経由で SQL を実行する。
 */

/** usage_events テーブル + インデックス */
const SCHEMA_USAGE_EVENTS = `
CREATE TABLE IF NOT EXISTS usage_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT    NOT NULL,
  model           TEXT    NOT NULL,
  kind            TEXT    NOT NULL,
  max_mode        INTEGER,
  requests_costs  REAL,
  usage_based_costs REAL DEFAULT 0,
  is_token_based_call INTEGER NOT NULL DEFAULT 0,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cache_read_tokens  INTEGER DEFAULT 0,
  total_cents     REAL    DEFAULT 0,
  owning_user     TEXT    NOT NULL,
  owning_team     TEXT    NOT NULL,
  cursor_token_fee REAL   NOT NULL DEFAULT 0,
  is_chargeable   INTEGER NOT NULL DEFAULT 0,
  is_headless     INTEGER NOT NULL DEFAULT 0,
  raw_json        TEXT    NOT NULL,
  fetched_at      TEXT    NOT NULL,
  note            TEXT    DEFAULT '',
  UNIQUE(timestamp, model, owning_user)
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON usage_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_model ON usage_events(model);
CREATE INDEX IF NOT EXISTS idx_events_kind ON usage_events(kind);
`

/** usage_summary テーブル + インデックス */
const SCHEMA_USAGE_SUMMARY = `
CREATE TABLE IF NOT EXISTS usage_summary (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  billing_cycle_start       TEXT    NOT NULL,
  billing_cycle_end         TEXT    NOT NULL,
  membership_type           TEXT    NOT NULL,
  limit_type                TEXT    NOT NULL,
  is_unlimited              INTEGER NOT NULL DEFAULT 0,
  auto_model_message        TEXT,
  named_model_message       TEXT,
  plan_enabled              INTEGER NOT NULL DEFAULT 0,
  plan_used                 INTEGER NOT NULL DEFAULT 0,
  plan_limit                INTEGER NOT NULL DEFAULT 0,
  plan_remaining            INTEGER NOT NULL DEFAULT 0,
  plan_included             INTEGER NOT NULL DEFAULT 0,
  plan_bonus                INTEGER NOT NULL DEFAULT 0,
  plan_total                INTEGER NOT NULL DEFAULT 0,
  plan_auto_pct             REAL    NOT NULL DEFAULT 0,
  plan_api_pct              REAL    NOT NULL DEFAULT 0,
  plan_total_pct            REAL    NOT NULL DEFAULT 0,
  ondemand_enabled          INTEGER NOT NULL DEFAULT 0,
  ondemand_used             INTEGER NOT NULL DEFAULT 0,
  ondemand_limit            INTEGER,
  ondemand_remaining        INTEGER,
  team_ondemand_enabled     INTEGER NOT NULL DEFAULT 0,
  team_ondemand_used        INTEGER NOT NULL DEFAULT 0,
  team_ondemand_limit       INTEGER,
  team_ondemand_remaining   INTEGER,
  raw_json                  TEXT    NOT NULL,
  fetched_at                TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_summary_cycle ON usage_summary(billing_cycle_start);
CREATE INDEX IF NOT EXISTS idx_summary_fetched ON usage_summary(fetched_at);
`

/** auth_me テーブル（API-C: /api/auth/me） */
const SCHEMA_AUTH_ME = `
CREATE TABLE IF NOT EXISTS auth_me (
  id              INTEGER PRIMARY KEY,
  email           TEXT    NOT NULL,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  name            TEXT    NOT NULL DEFAULT '',
  sub             TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  picture         TEXT    NOT NULL DEFAULT '',
  raw_json        TEXT    NOT NULL,
  fetched_at      TEXT    NOT NULL
);
`

/** team_members テーブル（API-D: /api/dashboard/team） */
const SCHEMA_TEAM_MEMBERS = `
CREATE TABLE IF NOT EXISTS team_members (
  id              INTEGER PRIMARY KEY,
  name            TEXT    NOT NULL DEFAULT '',
  role            TEXT    NOT NULL,
  email           TEXT    NOT NULL,
  user_id         INTEGER NOT NULL,
  team_id         INTEGER NOT NULL DEFAULT 0,
  raw_json        TEXT    NOT NULL,
  fetched_at      TEXT    NOT NULL
);
`

/** teams テーブル（API-E: /api/dashboard/teams） */
const SCHEMA_TEAMS = `
CREATE TABLE IF NOT EXISTS teams (
  id                                INTEGER PRIMARY KEY,
  name                              TEXT    NOT NULL,
  role                              TEXT    NOT NULL,
  seats                             INTEGER NOT NULL DEFAULT 0,
  has_billing                       INTEGER NOT NULL DEFAULT 0,
  request_quota_per_seat            INTEGER NOT NULL DEFAULT 0,
  privacy_mode_forced               INTEGER NOT NULL DEFAULT 0,
  allow_sso                         INTEGER NOT NULL DEFAULT 0,
  admin_only_usage_pricing          INTEGER NOT NULL DEFAULT 0,
  subscription_status               TEXT    NOT NULL DEFAULT '',
  privacy_mode_migration_opted_out  INTEGER NOT NULL DEFAULT 0,
  membership_type                   TEXT    NOT NULL DEFAULT '',
  billing_cycle_start               TEXT    NOT NULL DEFAULT '',
  billing_cycle_end                 TEXT    NOT NULL DEFAULT '',
  individual_spend_limits_blocked   INTEGER NOT NULL DEFAULT 0,
  customer_balance_cents            TEXT    NOT NULL DEFAULT '0',
  raw_json                          TEXT    NOT NULL,
  fetched_at                        TEXT    NOT NULL
);
`

class DbService {
    private db: Database | null = null
    private SQL: SqlJsStatic | null = null
    private dbPath: string = ''
    private globalStoragePath: string = ''

    /**
     * sql.js WASM 初期化 + globalStorageUri ディレクトリ作成 + DB 読込 or 新規作成 + スキーマ実行。
     * 初期化失敗時は throw する（フォールバックしない）。
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        // sql.js WASM 初期化
        const wasmPath = path.join(context.extensionPath, 'out', 'sql-wasm.wasm')
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`sql-wasm.wasm が見つかりません: ${wasmPath}`)
        }

        this.SQL = await initSqlJs({
            locateFile: (file: string) => path.join(context.extensionPath, 'out', file)
        })

        // globalStorageUri ディレクトリ作成
        this.globalStoragePath = context.globalStorageUri.fsPath
        if (!fs.existsSync(this.globalStoragePath)) {
            fs.mkdirSync(this.globalStoragePath, { recursive: true })
        }

        // DB ファイルパス
        this.dbPath = path.join(this.globalStoragePath, 'usage.db')

        // DB 読込 or 新規作成
        if (fs.existsSync(this.dbPath)) {
            const buffer = fs.readFileSync(this.dbPath)
            this.db = new this.SQL.Database(buffer)
        } else {
            this.db = new this.SQL.Database()
        }

        // スキーマ実行（IF NOT EXISTS により冪等）
        this.db.run(SCHEMA_USAGE_EVENTS)
        this.db.run(SCHEMA_USAGE_SUMMARY)
        this.db.run(SCHEMA_AUTH_ME)
        this.db.run(SCHEMA_TEAM_MEMBERS)
        this.db.run(SCHEMA_TEAMS)

        // ── マイグレーション: team_members に team_id カラム追加 ──
        this.migrateTeamMembersTeamId()

        // ── マイグレーション: usage_based_costs TEXT → REAL ──
        // 既存データの "$0.08" や "-" を数値に変換する。
        // カラム型は SQLite では制約ではないため ALTER 不要。値の変換のみ行う。
        this.migrateUsageBasedCosts()

        // 新規作成時はディスクに永続化
        if (!fs.existsSync(this.dbPath)) {
            this.persist()
        }
    }

    /**
     * team_members テーブルに team_id カラムが存在しなければ追加する。冪等。
     */
    private migrateTeamMembersTeamId(): void {
        if (!this.db) {
            return
        }
        const info = this.db.exec(`PRAGMA table_info(team_members)`)
        if (info.length === 0) {
            return
        }
        const hasTeamId = info[0].values.some((row) => row[1] === 'team_id')
        if (hasTeamId) {
            return
        }
        console.log('Cursor Economizer: team_members に team_id カラムを追加')
        this.db.run(`ALTER TABLE team_members ADD COLUMN team_id INTEGER NOT NULL DEFAULT 0`)
        this.persist()
    }

    /**
     * usage_based_costs カラムの値を文字列（"$0.08", "-"）から数値に変換。
     * 既にREALの行はスキップする。冪等。
     */
    private migrateUsageBasedCosts(): void {
        if (!this.db) {
            return
        }
        // "$" 付き文字列が残っているか確認
        const check = this.db.exec(
            `SELECT COUNT(*) FROM usage_events WHERE typeof(usage_based_costs) = 'text' AND usage_based_costs LIKE '$%'`
        )
        const count = check.length > 0 ? (check[0].values[0][0] as number) : 0
        if (count === 0) {
            return
        }

        console.log(`Cursor Economizer: usage_based_costs マイグレーション開始 (${count} 行)`)

        // "$1.23" → 1.23, "-" や空文字 → 0
        this.db.run(`
      UPDATE usage_events
      SET usage_based_costs = CASE
        WHEN typeof(usage_based_costs) = 'text' AND usage_based_costs LIKE '$%'
          THEN CAST(REPLACE(usage_based_costs, '$', '') AS REAL)
        WHEN typeof(usage_based_costs) = 'text'
          THEN 0.0
        ELSE usage_based_costs
      END
    `)
        this.persist()
        console.log('Cursor Economizer: usage_based_costs マイグレーション完了')
    }

    /**
     * db.export() → fs.writeFileSync でディスク書出。
     * 書出直後に db-updated.json をタッチして他 Window に変更を通知する。
     */
    persist(): void {
        if (!this.db) {
            throw new Error('DB が初期化されていません')
        }

        const data = this.db.export()
        const buffer = Buffer.from(data)
        fs.writeFileSync(this.dbPath, buffer)

        // db-updated.json タッチ（他 Window の FileWatcher で変更検知用）
        // タッチ失敗は DB 永続化自体の成功を覆さない（ログ出力のみ）
        try {
            const notificationPath = path.join(this.globalStoragePath, 'db-updated.json')
            fs.writeFileSync(
                notificationPath,
                JSON.stringify({ updatedAt: new Date().toISOString() })
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error('Cursor Economizer: db-updated.json タッチ失敗:', message)
        }
    }

    /**
     * ディスクから DB を再読込（他 Window の変更を取り込む）。
     * DB ファイルが存在しない場合は throw する。
     */
    reload(): void {
        if (!this.SQL) {
            throw new Error('sql.js が初期化されていません')
        }

        if (!fs.existsSync(this.dbPath)) {
            throw new Error(`DB ファイルが見つかりません: ${this.dbPath}`)
        }

        // 既存 DB を閉じる
        if (this.db) {
            this.db.close()
        }

        const buffer = fs.readFileSync(this.dbPath)
        this.db = new this.SQL.Database(buffer)
    }

    /**
     * 現在のメモリ上 DB インスタンスを返す。
     * 後続 Phase で他 Service が SQL 実行に使用する。
     */
    getDb(): Database {
        if (!this.db) {
            throw new Error('DB が初期化されていません')
        }
        return this.db
    }

    /**
     * DB ファイルパスを返す（テスト・デバッグ用）。
     */
    getDbPath(): string {
        return this.dbPath
    }

    /**
     * globalStorageUri パスを返す（Phase 9: fetch.lock / db-updated.json で使用）。
     */
    getGlobalStoragePath(): string {
        return this.globalStoragePath
    }

    /**
     * 指定日数を超過したデータを usage_events / usage_summary 両テーブルから削除する。
     * 基準カラムは fetched_at（データ取得日時、ISO 8601 文字列）。
     *
     * 削除が 0 件でも persist() を呼ぶ（トランザクション一貫性のため）。
     * メソッド内でエラーが発生した場合は throw する（呼び出し元で try/catch すること）。
     *
     * @param days - 保持日数。この日数を超過した fetched_at のレコードを削除する
     * @returns 削除合計件数（usage_events + usage_summary）
     */
    deleteOlderThan(days: number): number {
        if (!this.db) {
            throw new Error('DB が初期化されていません')
        }

        const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

        this.db.run('DELETE FROM usage_events WHERE fetched_at < ?', [threshold])
        const eventsDeleted = this.db.getRowsModified()

        this.db.run('DELETE FROM usage_summary WHERE fetched_at < ?', [threshold])
        const summaryDeleted = this.db.getRowsModified()

        this.persist()

        return eventsDeleted + summaryDeleted
    }

    /**
     * DB を閉じる（deactivate 時呼び出し）。
     */
    close(): void {
        if (this.db) {
            this.db.close()
            this.db = null
        }
    }
}

/** シングルトンインスタンス */
export const dbService = new DbService()
