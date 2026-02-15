/**
 * acquireVsCodeApi() シングルトン + postMessage ヘルパー。
 *
 * acquireVsCodeApi() は WebviewPanel のライフサイクル中に一度しか呼べない。
 * モジュールスコープでキャッシュし、複数コンポーネントから安全に利用する。
 */

import type { WebviewApi } from 'vscode-webview';
import type { WebviewToHostMessage } from '../types/messages';

// ── シングルトン ─────────────────────────────────

let api: WebviewApi<unknown> | undefined;

/**
 * VS Code Webview API インスタンスを返す。
 * VS Code ランタイム外（ブラウザ単体テスト等）では undefined を返す。
 */
export function getVsCodeApi(): WebviewApi<unknown> | undefined {
  if (api) {
    return api;
  }

  // VS Code 内でのみ acquireVsCodeApi が存在する
  if (typeof acquireVsCodeApi === 'function') {
    api = acquireVsCodeApi();
    return api;
  }

  return undefined;
}

// ── postMessage ヘルパー ────────────────────────────

/**
 * Extension Host へ型安全にメッセージを送信する。
 * VS Code ランタイム外では何もしない（テスト時の安全弁）。
 */
export function postMessage(message: WebviewToHostMessage): void {
  const vsCodeApi = getVsCodeApi();
  if (!vsCodeApi) {
    // VS Code 外（Vite dev server 直接表示）ではログだけ出す
    console.warn('[useVsCodeApi] postMessage ignored: not in VS Code runtime', message);
    return;
  }
  vsCodeApi.postMessage(message);
}
