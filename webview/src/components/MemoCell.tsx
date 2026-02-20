/**
 * メモカラムの表示専用コンポーネント。
 *
 * - シングルライン表示（white-space: nowrap + ellipsis）
 * - クリック時に onEdit() を呼び出してモーダルを開く
 * - 編集ロジックは持たない（MemoModal に委譲）
 */

interface MemoCellProps {
  value: string;
  onEdit: () => void;
}

export default function MemoCell({ value, onEdit }: MemoCellProps) {
  return (
    <span
      onClick={onEdit}
      style={{
        cursor: 'pointer',
        display: 'block',
        minWidth: '40px',
        minHeight: '1em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: value ? 1 : 0.5,
      }}
      title={value || 'クリックで編集'}
    >
      {value || '...✏️'}
    </span>
  );
}
