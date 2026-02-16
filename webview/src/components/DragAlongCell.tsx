/**
 * ドラッグ追従テーブルセル。
 * カラムがドラッグされると、同カラムのセルが一緒に水平移動する視覚効果を提供する。
 */

import { memo } from 'react'
import { flexRender } from '@tanstack/react-table'
import { useSortable } from '@dnd-kit/sortable'
import type { Cell } from '@tanstack/react-table'
import type { CSSProperties } from 'react'
import type { WebviewUsageEventRow } from '../types/messages'

interface DragAlongCellProps {
    cell: Cell<WebviewUsageEventRow, unknown>
    /** ベースとなる td スタイル */
    tdStyle: CSSProperties
    /** cost_indicator カラムかどうか */
    isIndicator?: boolean
}

function DragAlongCellInner({ cell, tdStyle, isIndicator = false }: DragAlongCellProps) {
    const { isDragging, setNodeRef, transform } = useSortable({
        id: cell.column.id
    })

    const style: CSSProperties = {
        ...(isIndicator ? { ...tdStyle, padding: '3px 2px' } : tdStyle),
        width: cell.column.getSize(),
        position: 'relative',
        transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
        transition: 'transform 0.15s ease',
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 1 : 0,
        background: isDragging
            ? 'var(--vscode-editor-selectionBackground, rgba(50,100,200,0.25))'
            : undefined
    }

    return (
        <td ref={setNodeRef} style={style}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
    )
}

export default memo(DragAlongCellInner)
