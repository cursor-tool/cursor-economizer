/**
 * メモ編集モーダル。
 *
 * - row が非 null のとき表示（オーバーレイ + センター配置）
 * - row メタデータ（DATE / MODEL / COST / KIND）を上部に表示
 * - <textarea> で改行対応
 * - 保存と閉じるを分離:
 *   - onBlur → onSave(draft)（保存のみ。モーダルは閉じない）
 *   - outside mousedown → onClose()（閉じるのみ。blur が先に発火して保存済み）
 *   - ESC keydown → onSave(draft) + onClose()（先に保存してから閉じる）
 * - IME 対応: composingRef で ESC の誤発火を防止
 * - カスタムリサイズハンドル: CSS resize のズームオフセット問題を回避するため
 *   JS でドラッグリサイズを実装。clientY ベースで 1:1 追従。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { WebviewUsageEventRow } from '../types/messages'
import { getCostEmoji } from '../utils/costEmoji'

interface MemoModalProps {
    row: WebviewUsageEventRow | null
    onSave: (note: string) => void
    onClose: () => void
}

const MIN_TEXTAREA_HEIGHT = 60

function fmtTimestamp(v: string): string {
    const ms = parseInt(v, 10)
    if (isNaN(ms)) return v
    return new Date(ms).toLocaleString('ja-JP')
}

export default function MemoModal({ row, onSave, onClose }: MemoModalProps) {
    const [draft, setDraft] = useState('')
    const [textareaHeight, setTextareaHeight] = useState(120)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const composingRef = useRef(false)

    useEffect(() => {
        if (row) {
            const note = row.note ?? ''
            setDraft(note)
            setTextareaHeight(120)
            if (textareaRef.current) {
                const el = textareaRef.current
                el.focus()
                el.setSelectionRange(note.length, note.length)
            }
        }
    }, [row])

    const handleBlur = useCallback(() => {
        onSave(draft)
    }, [draft, onSave])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key !== 'Escape') return
            if (e.nativeEvent.isComposing || composingRef.current) return
            e.preventDefault()
            onSave(draft)
            onClose()
        },
        [draft, onSave, onClose]
    )

    // outside クリック: onMouseDown + target 判定でドラッグとの誤発火を防止
    const handleOverlayMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget) {
                onClose()
            }
        },
        [onClose]
    )

    // ── カスタムリサイズハンドル ──
    // CSS resize のズームオフセット問題を回避。
    // clientY ベースの差分はスケーリングに関係なく 1:1 で追従する。
    const handleResizeStart = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault()
            const startY = e.clientY
            const startHeight = textareaHeight

            const handleMouseMove = (ev: MouseEvent) => {
                const delta = ev.clientY - startY
                setTextareaHeight(Math.max(MIN_TEXTAREA_HEIGHT, startHeight + delta))
            }

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
                document.body.style.userSelect = ''
                document.body.style.cursor = ''
            }

            document.body.style.userSelect = 'none'
            document.body.style.cursor = 'ns-resize'
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        },
        [textareaHeight]
    )

    if (!row) return null

    const kind = row.kind ? row.kind.replace(/^USAGE_EVENT_KIND_/, '') : ''
    const costEmoji = getCostEmoji(row)
    const cost = `$${(Number(row.usage_based_costs) || 0).toFixed(2)}`

    const metaItems = [
        `🕐 ${fmtTimestamp(row.timestamp)}`,
        `🧠 ${row.model}`,
        `${costEmoji} ${cost}`,
        ...(kind ? [`ℹ️ ${kind}`] : [])
    ]

    return (
        <div onMouseDown={handleOverlayMouseDown} style={overlayStyle}>
            <div style={modalStyle}>
                <div style={metaStyle}>
                    {metaItems.map((item, i) => (
                        <span key={i} style={metaItemStyle}>
                            {i > 0 && <span style={metaSepStyle}>｜</span>}
                            {item}
                        </span>
                    ))}
                </div>
                <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => {
                        composingRef.current = true
                    }}
                    onCompositionEnd={() => {
                        composingRef.current = false
                    }}
                    placeholder="メモを入力"
                    aria-label="メモ編集"
                    style={{ ...textareaStyle, height: `${textareaHeight}px` }}
                />
                <div onMouseDown={handleResizeStart} style={resizeHandleStyle}>
                    <span style={resizeGripStyle}>⋯</span>
                </div>
            </div>
        </div>
    )
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgba(0, 0, 0, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
}

const modalStyle: React.CSSProperties = {
    background: 'var(--vscode-editor-background)',
    border: '1px solid var(--vscode-panel-border, #444)',
    borderRadius: '6px',
    padding: '12px 16px',
    width: '640px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
}

const metaStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0',
    fontSize: '11px',
    opacity: 0.7,
    padding: '0 2px'
}

const metaItemStyle: React.CSSProperties = {
    whiteSpace: 'nowrap'
}

const metaSepStyle: React.CSSProperties = {
    margin: '0 4px',
    opacity: 0.4
}

const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: `${MIN_TEXTAREA_HEIGHT}px`,
    boxSizing: 'border-box',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, var(--vscode-panel-border, #555))',
    borderRadius: '3px 3px 0 0',
    padding: '6px 8px',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    lineHeight: '1.5',
    resize: 'none',
    outline: 'none'
}

const resizeHandleStyle: React.CSSProperties = {
    height: '10px',
    cursor: 'ns-resize',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--vscode-input-background)',
    border: '1px solid var(--vscode-input-border, var(--vscode-panel-border, #555))',
    borderTop: 'none',
    borderRadius: '0 0 3px 3px',
    userSelect: 'none',
    touchAction: 'none',
    marginTop: '-8px'
}

const resizeGripStyle: React.CSSProperties = {
    fontSize: '10px',
    lineHeight: 1,
    opacity: 0.4,
    letterSpacing: '1px'
}
