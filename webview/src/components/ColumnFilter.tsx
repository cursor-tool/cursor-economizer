/**
 * テーブルヘッダー用フィルタコンポーネント。
 * テキストフィルタ・数値範囲フィルタ・ルックアップ（複数選択）フィルタを提供する。
 * VS Code テーマ変数でスタイリング。
 */

import { useState, useRef, useEffect } from 'react';
import type { Column } from '@tanstack/react-table';
import type { WebviewUsageEventRow } from '../types/messages';

// ── 共通スタイル ──────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '2px 4px',
  fontSize: '11px',
  background: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  border: '1px solid var(--vscode-input-border, transparent)',
  outline: 'none',
};

const rangeInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: '48%',
};

// ── TextFilter（テキスト検索ピッカー） ───────────────
// ヘッダーにはコンパクトに検索値を表示。クリックでパネルを開く。

function TextFilter({
  column,
}: {
  column: Column<WebviewUsageEventRow, unknown>;
}) {
  const currentValue = (column.getFilterValue() as string) ?? '';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentValue);
  const ref = useRef<HTMLDivElement>(null);

  // パネル外クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 外部からフィルタクリア時にドラフト同期
  useEffect(() => {
    setDraft(currentValue);
  }, [currentValue]);

  const apply = () => {
    column.setFilterValue(draft || undefined);
    setOpen(false);
  };

  const clear = () => {
    setDraft('');
    column.setFilterValue(undefined);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') apply();
  };

  const hasFilter = !!currentValue;
  const label = hasFilter ? currentValue : String(column.columnDef.header ?? column.id);

  const btnStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '11px',
    ...(hasFilter ? {} : { opacity: 0.5 }),
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 200,
    background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
    border: '1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #555))',
    borderRadius: '3px',
    padding: '6px',
    width: '160px',
    fontSize: '11px',
    color: 'var(--vscode-foreground)',
  };

  const textInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '4px',
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '4px',
    marginTop: '4px',
  };

  const actionBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '2px 4px',
    fontSize: '11px',
    cursor: 'pointer',
    background: 'var(--vscode-button-background, #0e639c)',
    color: 'var(--vscode-button-foreground, #fff)',
    border: 'none',
    borderRadius: '2px',
  };

  const clearBtnStyle: React.CSSProperties = {
    ...actionBtnStyle,
    background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    color: 'var(--vscode-button-secondaryForeground, #ccc)',
  };

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 100 : 'auto' }}>
      <button type="button" onClick={() => setOpen(!open)} style={btnStyle}>
        {label}
      </button>
      {open && (
        <div style={panelStyle}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={String(column.columnDef.header ?? column.id)}
            style={textInputStyle}
            autoFocus
          />
          <div style={actionRowStyle}>
            <button type="button" onClick={clear} style={clearBtnStyle}>
              クリア
            </button>
            <button type="button" onClick={apply} style={actionBtnStyle}>
              決定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NumberRangeFilter（数値範囲ピッカー） ────────────
// ヘッダーにはコンパクトにmin〜maxを表示。クリックでパネルを開く。

/** 数値を短縮表示（1000以上は k 表記） */
function fmtShortNum(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function NumberRangeFilter({
  column,
}: {
  column: Column<WebviewUsageEventRow, unknown>;
}) {
  const filterValue = (column.getFilterValue() as [number?, number?]) ?? [
    undefined,
    undefined,
  ];

  const [open, setOpen] = useState(false);
  const [minDraft, setMinDraft] = useState(filterValue[0] != null ? String(filterValue[0]) : '');
  const [maxDraft, setMaxDraft] = useState(filterValue[1] != null ? String(filterValue[1]) : '');
  const ref = useRef<HTMLDivElement>(null);

  // パネル外クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 外部からフィルタクリア時にドラフト同期
  useEffect(() => {
    setMinDraft(filterValue[0] != null ? String(filterValue[0]) : '');
    setMaxDraft(filterValue[1] != null ? String(filterValue[1]) : '');
  }, [filterValue[0], filterValue[1]]);

  const apply = () => {
    const minVal = minDraft !== '' ? Number(minDraft) : undefined;
    const maxVal = maxDraft !== '' ? Number(maxDraft) : undefined;
    column.setFilterValue(minVal != null || maxVal != null ? [minVal, maxVal] : undefined);
    setOpen(false);
  };

  const clear = () => {
    setMinDraft('');
    setMaxDraft('');
    column.setFilterValue(undefined);
    setOpen(false);
  };

  // ボタンラベル
  const hasFilter = filterValue[0] != null || filterValue[1] != null;
  let label: string;
  if (filterValue[0] != null && filterValue[1] != null) {
    label = `${fmtShortNum(filterValue[0])}〜${fmtShortNum(filterValue[1])}`;
  } else if (filterValue[0] != null) {
    label = `${fmtShortNum(filterValue[0])}〜`;
  } else if (filterValue[1] != null) {
    label = `〜${fmtShortNum(filterValue[1])}`;
  } else {
    label = String(column.columnDef.header ?? column.id);
  }

  const btnStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '11px',
    ...(hasFilter ? {} : { opacity: 0.5 }),
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 200,
    background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
    border: '1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #555))',
    borderRadius: '3px',
    padding: '6px',
    width: '150px',
    fontSize: '11px',
    color: 'var(--vscode-foreground)',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '4px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    opacity: 0.7,
    flexShrink: 0,
    width: '24px',
  };

  const numInputStyle: React.CSSProperties = {
    ...inputStyle,
    flex: 1,
    minWidth: 0,
    boxSizing: 'border-box',
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '4px',
    marginTop: '4px',
  };

  const actionBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '2px 4px',
    fontSize: '11px',
    cursor: 'pointer',
    background: 'var(--vscode-button-background, #0e639c)',
    color: 'var(--vscode-button-foreground, #fff)',
    border: 'none',
    borderRadius: '2px',
  };

  const clearBtnStyle: React.CSSProperties = {
    ...actionBtnStyle,
    background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    color: 'var(--vscode-button-secondaryForeground, #ccc)',
  };

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 100 : 'auto' }}>
      <button type="button" onClick={() => setOpen(!open)} style={btnStyle}>
        {label}
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={rowStyle}>
            <label style={labelStyle}>min</label>
            <input
              type="number"
              title="min"
              placeholder="min"
              value={minDraft}
              onChange={(e) => setMinDraft(e.target.value)}
              style={numInputStyle}
            />
          </div>
          <div style={rowStyle}>
            <label style={labelStyle}>max</label>
            <input
              type="number"
              title="max"
              placeholder="max"
              value={maxDraft}
              onChange={(e) => setMaxDraft(e.target.value)}
              style={numInputStyle}
            />
          </div>
          <div style={actionRowStyle}>
            <button type="button" onClick={clear} style={clearBtnStyle}>
              クリア
            </button>
            <button type="button" onClick={apply} style={actionBtnStyle}>
              決定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DateRangeFilter（日付範囲ピッカー） ──────────────
// ヘッダーにはコンパクトに MM/DD 〜 MM/DD を表示。
// クリックするとパネルが開き、<input type="date"> で選択 → 決定で反映。

/** YYYY-MM-DD → M/D 短縮表示 */
function fmtShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function DateRangeFilter({
  column,
}: {
  column: Column<WebviewUsageEventRow, unknown>;
}) {
  const filterValue = (column.getFilterValue() as [string?, string?]) ?? [
    undefined,
    undefined,
  ];

  const [open, setOpen] = useState(false);
  const [fromDraft, setFromDraft] = useState(filterValue[0] ?? '');
  const [toDraft, setToDraft] = useState(filterValue[1] ?? '');
  const ref = useRef<HTMLDivElement>(null);

  // パネル外クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 外部からフィルタがクリアされた場合にドラフトを同期
  useEffect(() => {
    setFromDraft(filterValue[0] ?? '');
    setToDraft(filterValue[1] ?? '');
  }, [filterValue[0], filterValue[1]]);

  const apply = () => {
    const from = fromDraft || undefined;
    const to = toDraft || undefined;
    column.setFilterValue(from || to ? [from, to] : undefined);
    setOpen(false);
  };

  const clear = () => {
    setFromDraft('');
    setToDraft('');
    column.setFilterValue(undefined);
    setOpen(false);
  };

  // ボタンラベル: 選択済みなら MM/DD〜MM/DD、未選択なら placeholder と同じ column.id
  const hasFilter = !!(filterValue[0] || filterValue[1]);
  let label: string;
  if (filterValue[0] && filterValue[1]) {
    label = `${fmtShortDate(filterValue[0])}〜${fmtShortDate(filterValue[1])}`;
  } else if (filterValue[0]) {
    label = `${fmtShortDate(filterValue[0])}〜`;
  } else if (filterValue[1]) {
    label = `〜${fmtShortDate(filterValue[1])}`;
  } else {
    label = String(column.columnDef.header ?? column.id);
  }

  const btnStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '11px',
    // 未選択時は placeholder 風の色
    ...(hasFilter ? {} : { opacity: 0.5 }),
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 200,
    background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
    border: '1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #555))',
    borderRadius: '3px',
    padding: '6px',
    width: '180px',
    fontSize: '11px',
    color: 'var(--vscode-foreground)',
  };

  const dateRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '4px',
  };

  const dateLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    opacity: 0.7,
    flexShrink: 0,
  };

  const dateInputStyle: React.CSSProperties = {
    ...inputStyle,
    flex: 1,
    minWidth: 0,
    boxSizing: 'border-box',
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '4px',
    marginTop: '4px',
  };

  const actionBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '2px 4px',
    fontSize: '11px',
    cursor: 'pointer',
    background: 'var(--vscode-button-background, #0e639c)',
    color: 'var(--vscode-button-foreground, #fff)',
    border: 'none',
    borderRadius: '2px',
  };

  const clearBtnStyle: React.CSSProperties = {
    ...actionBtnStyle,
    background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    color: 'var(--vscode-button-secondaryForeground, #ccc)',
  };

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 100 : 'auto' }}>
      <button type="button" onClick={() => setOpen(!open)} style={btnStyle}>
        {label}
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={dateRowStyle}>
            <label style={dateLabelStyle}>➡</label>
            <input
              type="date"
              title="from"
              placeholder="from"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              style={dateInputStyle}
            />
          </div>
          <div style={dateRowStyle}>
            <label style={dateLabelStyle}>⬅</label>
            <input
              type="date"
              title="to"
              placeholder="to"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              style={dateInputStyle}
            />
          </div>
          <div style={actionRowStyle}>
            <button type="button" onClick={clear} style={clearBtnStyle}>
            ❎
            </button>
            <button type="button" onClick={apply} style={actionBtnStyle}>
            ✅
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LookupFilter（複数選択チェックボックス） ────────────

function LookupFilter({
  column,
  options,
}: {
  column: Column<WebviewUsageEventRow, unknown>;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];

  // クリック外で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  const clearAll = () => {
    column.setFilterValue(undefined);
  };

  const btnStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: '28px',
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 200,
    background: 'var(--vscode-dropdown-background, var(--vscode-input-background))',
    border: '1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #555))',
    borderRadius: '3px',
    padding: '4px',
    minWidth: '100px',
    maxHeight: '200px',
    overflowY: 'auto',
    fontSize: '11px',
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 0',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: 'var(--vscode-foreground)',
  };

  const label =
    selected.length === 0
      ? '🔍'
      : selected.length <= 2
        ? selected.join(' ')
        : `${selected.length}件`;

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 100 : 'auto' }}>
      <button type="button" onClick={() => setOpen(!open)} style={btnStyle}>
        {label}
      </button>
      {open && (
        <div style={dropdownStyle}>
          {selected.length > 0 && (
            <div
              onClick={clearAll}
              style={{
                ...itemStyle,
                opacity: 0.7,
                borderBottom: '1px solid var(--vscode-panel-border, #444)',
                paddingBottom: '4px',
                marginBottom: '2px',
              }}
            >
              ❎
            </div>
          )}
          {options.map((opt) => (
            <label key={opt.value} style={itemStyle}>
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                style={{ margin: 0 }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ColumnFilter ─────────────────────────────────────

export default function ColumnFilter({
  column,
  filterType,
  lookupOptions,
}: {
  column: Column<WebviewUsageEventRow, unknown>;
  filterType: 'text' | 'number-range' | 'date-range' | 'lookup';
  lookupOptions?: { value: string; label: string }[];
}) {
  if (filterType === 'number-range') {
    return <NumberRangeFilter column={column} />;
  }
  if (filterType === 'date-range') {
    return <DateRangeFilter column={column} />;
  }
  if (filterType === 'lookup' && lookupOptions) {
    return <LookupFilter column={column} options={lookupOptions} />;
  }
  return <TextFilter column={column} />;
}
