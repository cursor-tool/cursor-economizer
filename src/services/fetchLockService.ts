import * as fs from 'fs'
import * as path from 'path'
import { dbService } from './dbService'

/**
 * クロスウィンドウ取得ロック基盤。
 * fetch.lock ファイルによる排他制御と、db-updated.json の通知パスを管理する。
 *
 * - fetch.lock: JSON { startedAt: string, pid: number }。120 秒でステイルロック判定
 * - db-updated.json: JSON { updatedAt: string }。persist() 時にタッチ → FileWatcher で他 Window が検知
 */

/** ステイルロック判定の閾値（秒） */
const STALE_LOCK_THRESHOLD_SEC = 120

/** fetch.lock のファイル名 */
const LOCK_FILENAME = 'fetch.lock'

/** db-updated.json のファイル名 */
const NOTIFICATION_FILENAME = 'db-updated.json'

/** fetch.lock の JSON 構造 */
interface LockFileContent {
    startedAt: string
    pid: number
}

class FetchLockService {
    private lockFilePath: string = ''
    private notificationFilePath: string = ''

    /**
     * ロックファイルパスと通知ファイルパスを設定する。
     * dbService.initialize() の後に呼び出すこと（getGlobalStoragePath() 依存）。
     */
    initialize(): void {
        const storagePath = dbService.getGlobalStoragePath()
        if (!storagePath) {
            throw new Error(
                'FetchLockService: globalStoragePath が未設定です。dbService.initialize() の後に呼び出してください'
            )
        }
        this.lockFilePath = path.join(storagePath, LOCK_FILENAME)
        this.notificationFilePath = path.join(storagePath, NOTIFICATION_FILENAME)
    }

    /**
     * db-updated.json のフルパスを返す。
     * Phase 9B の FileWatcher でグロブパターンとして使用する。
     */
    getNotificationFilePath(): string {
        return this.notificationFilePath
    }

    /**
     * ロックを取得する。
     *
     * - 既存ロックが 120 秒以内 → false（取得失敗。他 Window が実行中）
     * - 既存ロックが 120 秒超過（ステイル）→ 上書きして true
     * - ロックなし → ファイル書込して true
     *
     * ファイル書込は fs.writeFileSync（同期）。
     * ロック取得の微小な競合は許容（最悪 2 Window が同時取得しても DB は UPSERT で冪等）。
     */
    acquireLock(): boolean {
        // 既存ロック確認
        if (fs.existsSync(this.lockFilePath)) {
            try {
                const raw = fs.readFileSync(this.lockFilePath, 'utf-8')
                const lock: LockFileContent = JSON.parse(raw)
                const startedAt = new Date(lock.startedAt).getTime()

                if (!isNaN(startedAt)) {
                    const elapsedSec = (Date.now() - startedAt) / 1000

                    // ステイルでなければ取得失敗（他 Window が実行中）
                    if (elapsedSec <= STALE_LOCK_THRESHOLD_SEC) {
                        return false
                    }

                    // ステイルロック → 上書きして取得
                    console.log(
                        `Cursor Economizer: ステイルロックを検出しました (${elapsedSec.toFixed(0)}秒経過)。上書きします`
                    )
                }
            } catch {
                // JSON パース失敗 → 破損ロック。上書きして取得
                console.log('Cursor Economizer: 破損したロックファイルを検出しました。上書きします')
            }
        }

        // ロック取得（書込）
        const content: LockFileContent = {
            startedAt: new Date().toISOString(),
            pid: process.pid
        }
        fs.writeFileSync(this.lockFilePath, JSON.stringify(content))
        return true
    }

    /**
     * ロックを解放する（ファイル削除）。
     * ファイルが存在しない場合は無視する（ENOENT のみ。その他はエラーとして throw）。
     */
    releaseLock(): void {
        try {
            fs.unlinkSync(this.lockFilePath)
        } catch (err) {
            // ファイルが存在しない場合のみ無視
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                return
            }
            throw err
        }
    }

    /**
     * 現在ロック中かどうかを返す。
     *
     * - ファイルなし → false
     * - JSON パース失敗 → false（破損ロックは無視）
     * - startedAt が 120 秒以内 → true（ロック中）
     * - startedAt が 120 秒超過 → false（ステイル）
     */
    isLocked(): boolean {
        if (!fs.existsSync(this.lockFilePath)) {
            return false
        }

        try {
            const raw = fs.readFileSync(this.lockFilePath, 'utf-8')
            const lock: LockFileContent = JSON.parse(raw)
            const startedAt = new Date(lock.startedAt).getTime()

            if (isNaN(startedAt)) {
                return false
            }

            const elapsedSec = (Date.now() - startedAt) / 1000
            return elapsedSec <= STALE_LOCK_THRESHOLD_SEC
        } catch {
            // JSON パース失敗 → 破損ロック → ロックなし扱い
            return false
        }
    }
}

/** シングルトンインスタンス */
export const fetchLockService = new FetchLockService()
