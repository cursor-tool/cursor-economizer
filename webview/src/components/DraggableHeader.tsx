/**
 * ドラッグ可能なテーブルヘッダーセル。
 * @dnd-kit/sortable の useSortable で DnD 対応。
 * 水平方向のみ移動し、リサイズハンドル・フィルタも内包する。
 */

import { flexRender } from '@tanstack/react-table'
import { useSortable } from '@dnd-kit/sortable'
import type { Header } from '@tanstack/react-table'
import type { CSSProperties } from 'react'
import type { WebviewUsageEventRow } from '../types/messages'

interface DraggableHeaderProps {
    header: Header<WebviewUsageEventRow, unknown>
    /** ベースとなる th スタイル */
    thStyle: CSSProperties
    /** フィルタレンダー関数（ColumnFilter 統合用） */
    renderFilter?: () => React.ReactNode
    /** cost_indicator カラムかどうか */
    isIndicator?: boolean
}

export default function DraggableHeader({
    header,
    thStyle,
    renderFilter,
    isIndicator = false
}: DraggableHeaderProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: header.column.id
    })

    const dragStyle: CSSProperties = {
        ...(isIndicator
            ? { ...thStyle, padding: '4px 2px', textAlign: 'center' }
            : thStyle),
        width: header.getSize(),
        position: 'relative',
        transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 20 : 10,
        background: isDragging
            ? 'var(--vscode-editor-selectionBackground, rgba(50,100,200,0.25))'
            : 'var(--vscode-editor-background)'
    }

    return (
        <th ref={setNodeRef} style={dragStyle}>
            {/* ドラッグハンドル（グリップアイコン） */}
            <div
                className="ce-drag-handle"
                title="ドラッグして列を移動"
                {...attributes}
                {...listeners}
            >
                <svg
                    width="14"
                    height="6"
                    viewBox="0 0 14 6"
                    fill="currentColor"
                    style={{ opacity: 0.5 }}
                >
                    <circle cx="3" cy="1" r="1" />
                    <circle cx="7" cy="1" r="1" />
                    <circle cx="11" cy="1" r="1" />
                    <circle cx="3" cy="5" r="1" />
                    <circle cx="7" cy="5" r="1" />
                    <circle cx="11" cy="5" r="1" />
                </svg>
            </div>

            {/* カラムヘッダーラベル */}
            <div>
                {header.isPlaceholder
                    ? null
                    : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                      )}
            </div>

            {/* フィルタ */}
            {renderFilter && <div style={{ marginTop: '2px' }}>{renderFilter()}</div>}

            {/* リサイズハンドル */}
            {header.column.getCanResize() && (
                <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={`ce-resizer${header.column.getIsResizing() ? ' ce-resizing' : ''}`}
                />
            )}
        </th>
    )
}
