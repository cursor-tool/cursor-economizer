/**
 * usage_based_costs（ドル値）と kind から課金レベル絵文字を返す。
 * 参考: https://github.com/Ittipong/cursor-price-tracking
 *
 * - $0 超 & < $0.20 → ✅ Low
 * - $0.20 〜 $0.50  → ⚠️ Medium
 * - $0.50 〜 $1.00  → 🚨 High
 * - $1.00 超        → 🔥 Very High
 * - $3.00 超        → ☠️ Extreme
 * - $10.00 超       → 🥶 Freeze
 * - kind に INCLUDED         → 💎 Included
 * - kind に ERRORED_NOT_CHARGED → ❌ Error
 * - $0.00           → 🆓 Free
 * - その他          → ❓ Unknown
 */
export function getCostEmoji(row: { usage_based_costs: number; kind: string }): string {
    const dollars = Number(row.usage_based_costs) || 0
    if (typeof dollars === 'number' && dollars > 0) {
        if (dollars < 0.2) return '✅'
        if (dollars <= 0.5) return '⚠️'
        if (dollars > 10) return '🥶'
        if (dollars > 3) return '☠️'
        if (dollars > 1) return '🔥'
        return '🚨'
    }
    if (row.kind.includes('INCLUDED')) return '💎'
    if (row.kind.includes('ERRORED_NOT_CHARGED')) return '❌'
    if (typeof dollars === 'number' && dollars === 0) return '🆓'
    return '❓'
}
