/**
 * TanStack Table による利用イベント一覧テーブル。
 * 全 20 カラム表示・ヘッダーフィルタ・50 件/ページ ページネーション。
 * note カラムは MemoCell によるインライン編集対応（Phase 12 で実装）。
 * VS Code テーマ変数でスタイリング。外部 CSS フレームワーク不使用。
 */

import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    createColumnHelper,
    flexRender
} from '@tanstack/react-table'
import { useMemo, useState, useEffect, useCallback } from 'react'
import type { FilterFn, ColumnSizingState } from '@tanstack/react-table'
import type { WebviewUsageEventRow, ColumnVisibilityConfig } from '../types/messages'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import ColumnFilter from './ColumnFilter'
import MemoCell from './MemoCell'
import DraggableHeader from './DraggableHeader'
import DragAlongCell from './DragAlongCell'
import { postMessage } from '../hooks/useVsCodeApi'
import { VscRefresh } from 'react-icons/vsc'
import { getCostEmoji } from '../utils/costEmoji'

// ── カスタムフィルタ関数: 数値範囲 ─────────────────────

const numberRangeFilter: FilterFn<WebviewUsageEventRow> = (
    row,
    columnId,
    filterValue: [number?, number?]
) => {
    const val = row.getValue<number>(columnId)
    const [min, max] = filterValue
    if (min !== undefined && val < min) return false
    if (max !== undefined && val > max) return false
    return true
}

// ── カスタムフィルタ関数: 表示文字列マッチ ───────────────
// 日時やBoolean カラムなど、フォーマット後の表示文字列で部分一致検索する。

function makeDisplayFilter<T>(formatter: (v: T) => string): FilterFn<WebviewUsageEventRow> {
    return (row, columnId, filterValue: string) => {
        if (!filterValue) return true
        const raw = row.getValue<T>(columnId)
        const display = formatter(raw)
        return display.toLowerCase().includes(filterValue.toLowerCase())
    }
}


// ── フォーマッタ ──────────────────────────────────────

/** ISO 8601 文字列をローカル日時に変換 */
function fmtDate(v: string): string {
    return new Date(v).toLocaleString('ja-JP')
}

/** Unix ミリ秒文字列（例: "1770909153239"）をローカル日時に変換 */
function fmtTimestamp(v: string): string {
    const ms = parseInt(v, 10)
    if (isNaN(ms)) return v
    return new Date(ms).toLocaleString('ja-JP')
}

/** セント値をドル表示に変換する（total_cents 用） */
function fmtCents(v: number): string {
    return `$${((Number(v) || 0) / 100).toFixed(4)}`
}

/** ドル値をそのまま表示する（usage_based_costs 用） */
function fmtDollar(v: number): string {
    return `$${(Number(v) || 0).toFixed(2)}`
}

function fmtNum(v: number): string {
    return v.toLocaleString()
}

function fmtBool(v: number): string {
    return v ? 'Yes' : 'No'
}

function fmtBoolNullable(v: number | null): string {
    if (v === null || v === undefined) return '-'
    return v ? 'Yes' : 'No'
}

function fmtNullable(v: number | null): string {
    if (v === null || v === undefined) return '-'
    return v.toLocaleString()
}

// ── フィルタ種別マップ ──────────────────────────────────

type FilterType = 'text' | 'number-range' | 'date-range' | 'lookup' | 'none'

const FILTER_MAP: Record<string, FilterType> = {
    cost_indicator: 'lookup',
    timestamp: 'date-range',
    model: 'lookup',
    kind: 'lookup',
    owning_user: 'lookup',
    owning_team: 'text',
    note: 'text',
    usage_based_costs: 'number-range',
    total_cents: 'number-range',
    input_tokens: 'number-range',
    output_tokens: 'number-range',
    cache_read_tokens: 'number-range',
    cache_write_tokens: 'number-range',
    cursor_token_fee: 'number-range',
    requests_costs: 'number-range',
    max_mode: 'lookup',
    is_token_based_call: 'lookup',
    is_chargeable: 'lookup',
    is_headless: 'lookup'
}

// ── A列 Lookup 用選択肢 ────────────────────────────────

const COST_EMOJI_OPTIONS = [
    { value: '✅', label: '✅ Low (< $0.20)' },
    { value: '⚠️', label: '⚠️ Medium ($0.20–$0.50)' },
    { value: '🚨', label: '🚨 High ($0.50–$1.00)' },
    { value: '🔥', label: '🔥 Very High (> $1.00)' },
    { value: '☠️', label: '☠️ Extreme (> $3.00)' },
    { value: '🥶', label: '🥶 Freeze (> $10.00)' },
    { value: '💎', label: '💎 Included' },
    { value: '❌', label: '❌ Error' },
    { value: '🆓', label: '🆓 Free' },
    { value: '❓', label: '❓ Unknown' }
]

// ── Bool カラム用選択肢・フィルタ ─────────────────────

const BOOL_EMOJI_OPTIONS = [
    { value: '✅', label: '✅ Yes' },
    { value: '❎', label: '❎ No / 未設定' }
]

/** Bool カラムが "truthy" かどうか判定 */
function isTruthyBool(v: unknown): boolean {
    if (v === null || v === undefined || v === '' || v === 0 || v === '0') return false
    return !!v
}

/** ✅/❎ lookup 用フィルタ: ❎ は yes 以外すべてにマッチ */
const boolEmojiFilter: FilterFn<WebviewUsageEventRow> = (row, columnId, filterValue: string[]) => {
    if (!filterValue || filterValue.length === 0) return true
    const truthy = isTruthyBool(row.getValue(columnId))
    const wantYes = filterValue.includes('✅')
    const wantNo = filterValue.includes('❎')
    if (wantYes && truthy) return true
    if (wantNo && !truthy) return true
    return false
}

// ── 日付範囲フィルタ関数 ──────────────────────────────
// timestamp は Unix ミリ秒文字列。開始日の 00:00:00 〜 終了日の 23:59:59 で範囲判定。

const dateRangeFilter: FilterFn<WebviewUsageEventRow> = (
    row,
    columnId,
    filterValue: [string?, string?]
) => {
    if (!filterValue) return true
    const [fromDate, toDate] = filterValue
    if (!fromDate && !toDate) return true

    const rawVal = row.getValue<string>(columnId)
    const ms = parseInt(rawVal, 10)
    if (isNaN(ms)) return true

    if (fromDate) {
        const fromMs = new Date(fromDate).getTime() // 00:00:00 ローカル
        if (ms < fromMs) return false
    }
    if (toDate) {
        const toMs = new Date(toDate).getTime() + 86_400_000 - 1 // 23:59:59.999 ローカル
        if (ms > toMs) return false
    }
    return true
}

// ── A列用フィルタ関数（複数選択） ─────────────────────

const costEmojiFilter: FilterFn<WebviewUsageEventRow> = (row, _columnId, filterValue: string[]) => {
    if (!filterValue || filterValue.length === 0) return true
    const emoji = getCostEmoji(row.original)
    return filterValue.includes(emoji)
}

/** 汎用 lookup フィルタ: カラム値が選択肢配列に含まれるか判定 */
const lookupFilter: FilterFn<WebviewUsageEventRow> = (row, columnId, filterValue: string[]) => {
    if (!filterValue || filterValue.length === 0) return true
    const val = String(row.getValue(columnId) ?? '')
    return filterValue.includes(val)
}

// ── カラム定義 ────────────────────────────────────────
// columns は userMap に依存するため、コンポーネント内で useMemo で生成する。
// col ヘルパーはモジュールレベルで定義可能。

const col = createColumnHelper<WebviewUsageEventRow>()

/** userMap を参照して owning_user の表示名を返す */
function resolveUserName(userId: string, userMap: Record<string, string>): string {
    return userMap[userId] ?? userId
}

/** userMap と onOpenMemo を受け取ってカラム定義配列を生成する */
function buildColumns(userMap: Record<string, string>, onOpenMemo: (row: WebviewUsageEventRow) => void) {
    return [
        col.display({
            id: 'cost_indicator',
            header: '\u00A0',
            cell: (info) => (
                <span style={{ display: 'block', textAlign: 'center' }}>
                    {getCostEmoji(info.row.original)}
                </span>
            ),
            enableColumnFilter: true,
            filterFn: costEmojiFilter,
            size: 24
        }),
        col.accessor('timestamp', {
            header: 'DATE',
            cell: (info) => fmtTimestamp(info.getValue()),
            filterFn: dateRangeFilter
        }),
        col.accessor('usage_based_costs', {
            header: 'COST',
            cell: (info) => fmtDollar(info.getValue()),
            filterFn: numberRangeFilter
        }),

        col.accessor('total_cents', {
            header: 'Token ¢',
            cell: (info) => fmtCents(info.getValue()),
            filterFn: numberRangeFilter
        }),

        col.accessor('input_tokens', {
            header: 'IN',
            cell: (info) => fmtNum(info.getValue()),
            filterFn: numberRangeFilter
        }),
        col.accessor('output_tokens', {
            header: 'OUT',
            cell: (info) => fmtNum(info.getValue()),
            filterFn: numberRangeFilter
        }),
        col.accessor('cache_read_tokens', {
            header: 'Cache R',
            cell: (info) => fmtNum(info.getValue()),
            filterFn: numberRangeFilter
        }),
        col.accessor('cache_write_tokens', {
            header: 'Cache W',
            cell: (info) => fmtNum(info.getValue()),
            filterFn: numberRangeFilter
        }),
        col.accessor('requests_costs', {
            header: 'REQ',
            cell: (info) => fmtNullable(info.getValue()),
            filterFn: numberRangeFilter
        }),

        col.accessor('model', {
            header: 'MODEL',
            filterFn: lookupFilter
        }),
        col.accessor('kind', {
            header: 'KIND',
            cell: (info) => {
                const v = info.getValue()
                return v ? v.replace(/^USAGE_EVENT_KIND_/, '') : ''
            },
            filterFn: lookupFilter
        }),

        col.accessor('max_mode', {
            header: 'Max',
            cell: (info) => (isTruthyBool(info.getValue()) ? '✅' : ''),
            filterFn: boolEmojiFilter
        }),
        col.accessor('is_token_based_call', {
            header: 'Token Based',
            cell: (info) => (isTruthyBool(info.getValue()) ? '✅' : ''),
            filterFn: boolEmojiFilter
        }),
        col.accessor('is_chargeable', {
            header: 'Chargeable',
            cell: (info) => (isTruthyBool(info.getValue()) ? '✅' : ''),
            filterFn: boolEmojiFilter
        }),
        col.accessor('is_headless', {
            header: 'Headless',
            cell: (info) => (isTruthyBool(info.getValue()) ? '✅' : ''),
            filterFn: boolEmojiFilter
        }),
        col.accessor('owning_user', {
            header: 'User',
            cell: (info) => resolveUserName(info.getValue(), userMap),
            filterFn: lookupFilter
        }),

        col.accessor('cursor_token_fee', {
            header: 'Fee',
            cell: (info) => fmtNum(info.getValue()),
            filterFn: numberRangeFilter
        }),
        // col.accessor('owning_team', {
        //   header: 'Team',
        // }),
        col.accessor('note', {
            header: 'Note',
            cell: (info) => (
                <MemoCell
                    value={info.getValue()}
                    onEdit={() => onOpenMemo(info.row.original)}
                />
            )
        })
    ]
}

// ── スタイル定数 ──────────────────────────────────────

const tableStyle: React.CSSProperties = {
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    width: '100%',
    fontSize: '12px'
}

const thStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--vscode-editor-background)',
    color: 'var(--vscode-foreground)',
    borderBottom: '2px solid var(--vscode-panel-border, #444)',
    padding: '4px 8px',
    textAlign: 'left',
    fontWeight: 600,
    whiteSpace: 'nowrap'
}

const tdStyle: React.CSSProperties = {
    border: '1px solid var(--vscode-panel-border, #333)',
    padding: '3px 8px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
}

const btnStyle: React.CSSProperties = {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: '12px'
}

const btnDisabledStyle: React.CSSProperties = {
    ...btnStyle,
    opacity: 0.4,
    cursor: 'default'
}

const paginationStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px'
}

const footerStyle: React.CSSProperties = {
    flexShrink: 0,
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '8px 12px',
    borderTop: '1px solid var(--vscode-panel-border, #333)',
    background: 'var(--vscode-editor-background)'
}

const footerCountStyle: React.CSSProperties = {
    fontSize: '12px',
    opacity: 0.6,
    marginLeft: 'auto',
    whiteSpace: 'nowrap'
}

// ── UsageTable コンポーネント ─────────────────────────

export default function UsageTable({
    data,
    userMap = {},
    columnVisibility = {
        kind: false,
        max_mode: false,
        is_token_based_call: false,
        is_chargeable: false,
        is_headless: false,
        owning_user: false,
        cursor_token_fee: false
    },
    pageSize = 500,
    autoRefreshEnabled = true,
    autoRefreshIntervalMinutes = 3,
    isLoading = false,
    columnOrder: columnOrderProp,
    onColumnOrderChange,
    onOpenMemo
}: {
    data: WebviewUsageEventRow[]
    /** owning_user ID → 表示名のマッピング */
    userMap?: Record<string, string>
    /** カラム表示設定（true=表示、false=非表示） */
    columnVisibility?: ColumnVisibilityConfig
    /** 1ページあたりの表示件数 */
    pageSize?: number
    /** 自動取得が有効か */
    autoRefreshEnabled?: boolean
    /** 自動取得のインターバル（分） */
    autoRefreshIntervalMinutes?: number
    /** Extension Host 側のローディング状態（更新ボタン制御用） */
    isLoading?: boolean
    /** カラム並び順（クロスウィンドウ共通・DB 永続化） */
    columnOrder?: string[]
    /** カラム並び順変更時のコールバック */
    onColumnOrderChange?: (newOrder: string[]) => void
    /** メモ編集モーダルを開くコールバック */
    onOpenMemo: (row: WebviewUsageEventRow) => void
}) {
    // ── userMap に依存するカラム定義を useMemo で生成 ──────────
    const columns = useMemo(() => buildColumns(userMap, onOpenMemo), [userMap, onOpenMemo])

    // ── データから動的 lookup 選択肢を生成 ──────────────────
    const dynamicLookupOptions = useMemo(() => {
        const modelSet = new Set<string>()
        const kindSet = new Set<string>()
        const owningUserSet = new Set<string>()
        for (const row of data) {
            if (row.model) modelSet.add(row.model)
            if (row.kind) kindSet.add(row.kind)
            if (row.owning_user) owningUserSet.add(row.owning_user)
        }
        const toOpts = (s: Set<string>) => [...s].sort().map((v) => ({ value: v, label: v }))
        const toKindOpts = (s: Set<string>) =>
            [...s].sort().map((v) => ({ value: v, label: v.replace(/^USAGE_EVENT_KIND_/, '') }))
        /** owning_user の選択肢: value は元の ID、label は userMap 解決後の表示名 */
        const toUserOpts = (s: Set<string>) =>
            [...s]
                .sort((a, b) => {
                    const nameA = userMap[a] ?? a
                    const nameB = userMap[b] ?? b
                    return nameA.localeCompare(nameB)
                })
                .map((v) => ({ value: v, label: userMap[v] ?? v }))
        return {
            model: toOpts(modelSet),
            kind: toKindOpts(kindSet),
            owningUser: toUserOpts(owningUserSet)
        }
    }, [data, userMap])

    // ── 最新の fetched_at をフッター表示用に算出 ────────────
    const latestFetchedAt = useMemo(() => {
        if (data.length === 0) return null
        let latest = ''
        for (const row of data) {
            if (row.fetched_at && row.fetched_at > latest) latest = row.fetched_at
        }
        return latest ? fmtDate(latest) : null
    }, [data])

    // ── 次回取得予定時刻を算出 ────────────────────────────
    const nextRefreshAt = useMemo(() => {
        if (!autoRefreshEnabled) return '--:--:--'
        // データ内の最新 fetched_at（ISO 文字列）を取得
        let latestIso = ''
        for (const row of data) {
            if (row.fetched_at && row.fetched_at > latestIso) latestIso = row.fetched_at
        }
        if (!latestIso) return '--:--:--'
        const lastMs = new Date(latestIso).getTime()
        if (Number.isNaN(lastMs)) return '--:--:--'
        const nextMs = lastMs + autoRefreshIntervalMinutes * 60 * 1000
        const d = new Date(nextMs)
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        const ss = String(d.getSeconds()).padStart(2, '0')
        return `${hh}:${mm}:${ss}`
    }, [data, autoRefreshEnabled, autoRefreshIntervalMinutes])

    /** columnId に応じた lookup 選択肢を返す */
    const BOOL_COLUMNS = new Set([
        'max_mode',
        'is_token_based_call',
        'is_chargeable',
        'is_headless'
    ])
    const getLookupOptions = (columnId: string) => {
        if (columnId === 'cost_indicator') return COST_EMOJI_OPTIONS
        if (columnId === 'model') return dynamicLookupOptions.model
        if (columnId === 'kind') return dynamicLookupOptions.kind
        if (columnId === 'owning_user') return dynamicLookupOptions.owningUser
        if (BOOL_COLUMNS.has(columnId)) return BOOL_EMOJI_OPTIONS
        return undefined
    }

    // ColumnVisibilityConfig → TanStack VisibilityState（Record<string, boolean>）変換
    const visibilityState: Record<string, boolean> = useMemo(
        () => ({ ...columnVisibility }),
        [columnVisibility]
    )

    // ── ページネーション state（pageSize 変更時にページ先頭へリセット） ──
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })
    useEffect(() => {
        setPagination((prev) => ({ ...prev, pageSize, pageIndex: 0 }))
    }, [pageSize])

    // ── カラムリサイズ state（ウィンドウローカル・永続化なし） ──
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

    // ── カラム並び順（クロスウィンドウ共通・DB 永続化） ──
    // デフォルトのカラム ID 順を算出（buildColumns の定義順）
    const defaultColumnOrder = useMemo(
        () => columns.map((c) => ('accessorKey' in c ? (c.accessorKey as string) : c.id!)),
        [columns]
    )
    // props から受け取った columnOrder を使用。未知カラムは末尾に自動追加する防御ロジック
    const effectiveColumnOrder = useMemo(() => {
        if (!columnOrderProp || columnOrderProp.length === 0) return defaultColumnOrder
        const known = new Set(defaultColumnOrder)
        const ordered = columnOrderProp.filter((id) => known.has(id))
        const missing = defaultColumnOrder.filter((id) => !columnOrderProp.includes(id))
        return [...ordered, ...missing]
    }, [columnOrderProp, defaultColumnOrder])

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
        state: {
            columnVisibility: visibilityState,
            pagination,
            columnSizing,
            columnOrder: effectiveColumnOrder
        },
        onPaginationChange: setPagination,
        onColumnSizingChange: setColumnSizing
    })

    // ── DnD センサー（10px の活性化距離でクリックと区別） ──
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
    )

    // ── DnD ドラッグ中フラグ（行ホバー無効化・ポインターイベント透過防止用） ──
    const [isDraggingColumn, setIsDraggingColumn] = useState(false)

    const handleDragStart = useCallback(() => {
        setIsDraggingColumn(true)
    }, [])

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            setIsDraggingColumn(false)
            const { active, over } = event
            if (!over || active.id === over.id) return
            const oldIndex = effectiveColumnOrder.indexOf(String(active.id))
            const newIndex = effectiveColumnOrder.indexOf(String(over.id))
            if (oldIndex === -1 || newIndex === -1) return
            const newOrder = arrayMove(effectiveColumnOrder, oldIndex, newIndex)
            onColumnOrderChange?.(newOrder)
        },
        [effectiveColumnOrder, onColumnOrderChange]
    )

    const handleDragCancel = useCallback(() => {
        setIsDraggingColumn(false)
    }, [])

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <style>{`
                .ce-row:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04)); }
                .ce-dragging .ce-row:hover { background: none; }
                .ce-dragging { pointer-events: none; }
                .ce-dragging .ce-drag-handle { pointer-events: auto; }
                @keyframes ce-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .ce-spin { animation: ce-spin 1s linear infinite; }
                .ce-resizer {
                    position: absolute; right: 0; top: 0; bottom: 0; width: 4px;
                    cursor: col-resize; user-select: none;
                    border-right: 2px solid transparent;
                    touch-action: none;
                }
                .ce-resizer:hover, .ce-resizer.ce-resizing {
                    border-right-color: var(--vscode-focusBorder, #007acc);
                }
                .ce-drag-handle {
                    display: flex; justify-content: center; cursor: grab;
                    padding: 1px 0; opacity: 0.4;
                }
                .ce-drag-handle:hover { opacity: 0.8; }
                .ce-drag-handle:active { cursor: grabbing; }
            `}</style>
            {/* ── テーブル（DnD コンテキスト） ── */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToHorizontalAxis]}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div
                    className={isDraggingColumn ? 'ce-dragging' : ''}
                    style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
                >
                    <table style={tableStyle}>
                        <thead>
                            {table.getHeaderGroups().map((hg) => (
                                <tr key={hg.id}>
                                    <SortableContext
                                        items={effectiveColumnOrder}
                                        strategy={horizontalListSortingStrategy}
                                    >
                                        {hg.headers.map((header) => {
                                            const ft = FILTER_MAP[header.column.id] as
                                                | FilterType
                                                | undefined
                                            const isIndicator =
                                                header.column.id === 'cost_indicator'
                                            return (
                                                <DraggableHeader
                                                    key={header.id}
                                                    header={header}
                                                    thStyle={thStyle}
                                                    isIndicator={isIndicator}
                                                    renderFilter={
                                                        ft && ft !== 'none'
                                                            ? () => (
                                                                  <ColumnFilter
                                                                      column={header.column}
                                                                      filterType={ft}
                                                                      lookupOptions={
                                                                          ft === 'lookup'
                                                                              ? getLookupOptions(
                                                                                    header.column.id
                                                                                )
                                                                              : undefined
                                                                      }
                                                                  />
                                                              )
                                                            : undefined
                                                    }
                                                />
                                            )
                                        })}
                                    </SortableContext>
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row) => (
                                <tr key={row.id} className="ce-row">
                                    <SortableContext
                                        items={effectiveColumnOrder}
                                        strategy={horizontalListSortingStrategy}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <DragAlongCell
                                                key={cell.id}
                                                cell={cell}
                                                tdStyle={tdStyle}
                                                isIndicator={
                                                    cell.column.id === 'cost_indicator'
                                                }
                                            />
                                        ))}
                                    </SortableContext>
                                </tr>
                            ))}
                            {table.getRowModel().rows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={columns.length}
                                        style={{
                                            ...tdStyle,
                                            textAlign: 'center',
                                            opacity: 0.6
                                        }}
                                    >
                                        データがありません
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </DndContext>

            {/* ── 下部 Sticky Footer（ページング + 件数） ── */}
            <div style={footerStyle}>
                <div style={paginationStyle}>
                    <button
                        type="button"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                        style={table.getCanPreviousPage() ? btnStyle : btnDisabledStyle}
                    >
                        &laquo;
                    </button>
                    <button
                        type="button"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        style={table.getCanPreviousPage() ? btnStyle : btnDisabledStyle}
                    >
                        &lsaquo;
                    </button>
                    <span>
                        {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
                    </span>
                    <button
                        type="button"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        style={table.getCanNextPage() ? btnStyle : btnDisabledStyle}
                    >
                        &rsaquo;
                    </button>
                    <button
                        type="button"
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                        style={table.getCanNextPage() ? btnStyle : btnDisabledStyle}
                    >
                        &raquo;
                    </button>
                </div>
                <div style={footerCountStyle}>
                    <span style={{ opacity: 0.75 }}>
                        TOTAL: {data.length >= 10000 ? '10,000+' : data.length.toLocaleString()}
                    </span>
                    {latestFetchedAt && (
                        <span style={{ marginLeft: '12px', opacity: 0.75 }}>
                            最終取得: {latestFetchedAt}
                        </span>
                    )}
                    <span style={{ marginLeft: '10px', opacity: 0.75 }}>次回: {nextRefreshAt}</span>
                    <button
                        type="button"
                        title="データ取得"
                        disabled={isLoading}
                        onClick={() => {
                            postMessage({ type: 'requestRefresh' })
                        }}
                        style={{
                            marginLeft: '4px',
                            padding: '0px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            verticalAlign: 'middle',
                            border: 'none',
                            borderRadius: '2px',
                            background: 'transparent',
                            color: isLoading ? '#fff' : 'var(--vscode-foreground, #ccc)',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: 1
                        }}
                    >
                        <VscRefresh size={13} className={isLoading ? 'ce-spin' : ''} />
                    </button>
                </div>
            </div>
        </div>
    )
}
