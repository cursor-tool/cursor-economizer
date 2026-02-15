import * as vscode from 'vscode'

/**
 * SecretStorage による token CRUD。
 * DB 操作、API 呼び出し、ステータスバーは含まない。
 * token の有効性検証は Phase 6 で実装する。
 */

/** SecretStorage のキー（固定） */
const SECRET_KEY = 'cursorEconomizer.sessionToken'

class TokenService {
    private secretStorage: vscode.SecretStorage | null = null
    private readonly _onTokenChanged = new vscode.EventEmitter<string | undefined>()

    /**
     * token 変更イベント。Phase 8 StatusBarService で subscribe する。
     * setToken / clearToken 実行時に発火する。
     */
    readonly onTokenChanged: vscode.Event<string | undefined> = this._onTokenChanged.event

    /**
     * SecretStorage 参照を保持する。
     * activate() 内で DbService.initialize() の後に呼び出すこと。
     */
    initialize(context: vscode.ExtensionContext): void {
        this.secretStorage = context.secrets
    }

    /**
     * SecretStorage から token を取得する。
     * 未設定の場合は undefined を返す。
     */
    async getToken(): Promise<string | undefined> {
        if (!this.secretStorage) {
            throw new Error('TokenService が初期化されていません')
        }
        return this.secretStorage.get(SECRET_KEY)
    }

    /**
     * SecretStorage に token を保存し、変更イベントを発火する。
     * 空文字は保存しない（呼び出し元でバリデーション済みの前提だが、防御的にチェック）。
     */
    async setToken(value: string): Promise<void> {
        if (!this.secretStorage) {
            throw new Error('TokenService が初期化されていません')
        }
        if (!value) {
            throw new Error('token の値が空です')
        }
        await this.secretStorage.store(SECRET_KEY, value)
        this._onTokenChanged.fire(value)
    }

    /**
     * SecretStorage から token を削除し、変更イベントを発火する。
     */
    async clearToken(): Promise<void> {
        if (!this.secretStorage) {
            throw new Error('TokenService が初期化されていません')
        }
        await this.secretStorage.delete(SECRET_KEY)
        this._onTokenChanged.fire(undefined)
    }

    /**
     * EventEmitter を破棄する（deactivate 時呼び出し）。
     */
    dispose(): void {
        this._onTokenChanged.dispose()
    }
}

/** シングルトンインスタンス */
export const tokenService = new TokenService()
