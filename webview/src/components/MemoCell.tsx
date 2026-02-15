/**
 * メモカラムのインライン編集コンポーネント。
 *
 * - 表示モード: テキストクリックで編集モードに切替
 * - 編集モード: <input> で入力。blur/Enter で保存、Escape でキャンセル
 * - 保存: draft !== value の場合のみ postMessage({ type: 'updateMemo', ... }) を送信
 * - 日本語テキスト（漢字・ひらがな・カタカナ・絵文字）対応
 * - スタイル: VS Code テーマ変数で統一
 */

import { useState, useRef, useEffect } from 'react';
import { postMessage } from '../hooks/useVsCodeApi';

interface MemoCellProps {
  value: string;
  timestamp: string;
  model: string;
  owningUser: string;
}

export default function MemoCell({
  value,
  timestamp,
  model,
  owningUser,
}: MemoCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // value が外部から変更された場合（memoUpdated 等）に draft を同期
  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [value, isEditing]);

  // 編集モード開始時に input にフォーカス + テキスト全選択
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  /** 保存処理: 変更がある場合のみ updateMemo を送信 */
  const save = () => {
    setIsEditing(false);
    if (draft !== value) {
      postMessage({
        type: 'updateMemo',
        timestamp,
        model,
        owningUser,
        note: draft,
      });
    }
  };

  /** キーボードハンドラ: Enter で保存、Escape でキャンセル */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中は無視（日本語入力対応）
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value); // 値をリセット
      setIsEditing(false);
    }
  };

  // ── 編集モード ──
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        placeholder="メモを入力"
        aria-label="メモ編集"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border, var(--vscode-panel-border, #555))',
          padding: '2px 4px',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
    );
  }

  // ── 表示モード ──
  return (
    <span
      onClick={() => {
        setDraft(value);
        setIsEditing(true);
      }}
      style={{
        cursor: 'pointer',
        display: 'inline-block',
        minWidth: '40px',
        minHeight: '1em',
        opacity: value ? 1 : 0.5,
      }}
      title="クリックで編集"
    >
      {value || '...✏️'}
    </span>
  );
}
