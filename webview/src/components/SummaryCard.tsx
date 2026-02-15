/**
 * サマリカードコンポーネント。
 *
 * 内部的に 2 エリアで構成:
 *   上部情報エリア: ユーザー名 / 課金期間 / OnDemand 累積額 / 最大COST を Flex 横並び
 *   下部メータエリア: MeterBar を grid 配置（エコ / 無料枠 / 日次 / 7日 / 月次 / 予測）
 *
 * デザイン調整ポイント:
 *   - グリッド列数: METER_GRID_COLUMNS を変更
 *   - メーター並び順: App.tsx の buildMeters() で配列順を変更
 *   - 色・閾値: MeterBar.tsx / App.tsx の ecoTier() を変更
 *
 * スタイリングは VS Code テーマ変数で統一。
 */
import type { WebviewUsageSummaryRow } from '../types/messages';
import type { MeterViewModel } from './MeterBar';
import MeterBar from './MeterBar';

/** グリッド最小列幅（レスポンシブ折り返し用。ゲージ maxWidth=138px に合わせて調整） */
const METER_MIN_COL_WIDTH = '110px';

interface SummaryCardProps {
  summary: WebviewUsageSummaryRow;
  /** ログインユーザーの表示名 */
  userName: string | null;
  /** 課金期間内の usage_based_costs 最大値（ドル値） */
  maxCost: number;
  /** メーター ViewModel 配列（計算済み） */
  meters: MeterViewModel[];
}

export default function SummaryCard({ summary, userName, maxCost, meters }: SummaryCardProps) {
  // 課金期間の日付フォーマット（MM/DD hh:mm）
  const fmtCycleDate = (iso: string): string => {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
  };
  const cycleStart = fmtCycleDate(summary.billing_cycle_start);
  const cycleEnd = fmtCycleDate(summary.billing_cycle_end);

  // OnDemand ドル換算
  const onDemandDollar = (summary.ondemand_used / 100).toFixed(2);
  const onDemandLimitText = summary.ondemand_limit != null
    ? ` / $${(summary.ondemand_limit / 100).toFixed(0)}`
    : ' (上限なし)';

  // 最大COST（usage_based_costs: 既にドル単位）
  const maxCostDollar = (Number(maxCost) || 0).toFixed(2);

  // --- スタイル定義 ---
  const cardStyle: React.CSSProperties = {
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: '6px',
    padding: '8px 12px',
    marginBottom: '8px',
    backgroundColor: 'var(--vscode-editor-background)',
    color: 'var(--vscode-foreground)',
    fontSize: '12px',
  };

  // ── 上部情報エリア ──
  const infoRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 20px',
    alignItems: 'baseline',
  };

  const infoItemStyle: React.CSSProperties = {
    minWidth: 0,
  };

  const infoLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    opacity: 0.55,
    lineHeight: 1.2,
  };

  const infoValueStyle: React.CSSProperties = {
    fontWeight: 'bold',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
  };

  const annotationStyle: React.CSSProperties = {
    fontWeight: 'normal',
    marginLeft: '4px',
    opacity: 0.6,
    fontSize: '11px',
  };

  // ── 下部メータエリア（基本6列、幅不足時は自動折り返し） ──
  const meterGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${METER_MIN_COL_WIDTH}, 1fr))`,
    gap: '4px 8px',
    marginTop: '8px',
  };

  return (
    <div style={cardStyle}>
      {/* ===== 上部情報エリア: Flex 横並び ===== */}
      <div style={infoRowStyle}>
        {/* ユーザー名 */}
        <div style={infoItemStyle}>
          <div style={infoLabelStyle}>User</div>
          <div style={infoValueStyle}>{userName ?? '-'}</div>
        </div>

        {/* 課金期間 */}
        <div style={infoItemStyle}>
          <div style={infoLabelStyle}>Period</div>
          <div style={infoValueStyle}>
            {cycleStart} 〜 {cycleEnd}
            <span style={annotationStyle}>({summary.limit_type})</span>
          </div>
        </div>

        {/* OnDemand 累積額 */}
        {summary.ondemand_enabled !== 0 && (
          <div style={infoItemStyle}>
            <div style={infoLabelStyle}>OnDemand</div>
            <div style={infoValueStyle}>
              ${onDemandDollar}
              <span style={annotationStyle}>{onDemandLimitText}</span>
            </div>
          </div>
        )}

        {/* 課金期間中の最大COST */}
        <div style={infoItemStyle}>
          <div style={infoLabelStyle}>Max Cost</div>
          <div style={infoValueStyle}>${maxCostDollar}</div>
        </div>
      </div>

      {/* ===== 下部メータエリア: Grid ===== */}
      {meters.length > 0 && (
        <div style={meterGridStyle}>
          {meters.map(m => (
            <MeterBar key={m.id} meter={m} />
          ))}
        </div>
      )}
    </div>
  );
}
