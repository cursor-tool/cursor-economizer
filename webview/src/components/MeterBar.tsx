/**
 * 共通メーターコンポーネント（270° SVG 弧ゲージ）。
 *
 * SummaryCard 下部メータエリアで再利用する汎用ゲージ。
 * 表示のみ担当し、計算は呼び出し側（App.tsx）で行う。
 *
 * デザイン調整ポイント:
 *   - FILL_GRADIENT_STOPS: 弧のグラデーション色（赤→緑、左から右）
 *   - RED_ZONE_START: レッドゾーン開始位置（弧の何%地点か）
 *   - MAX_WIDTH: ゲージの最大表示幅
 *   - STROKE_WIDTH / R: 弧の太さ・半径
 */

// ── 型定義（外部から import して使う） ──

/** メーターのゾーン（3段階） */
export type MeterZone = 'normal' | 'warn' | 'danger';

/** メーター表示用ビューモデル。計算済みの値のみを持つ。 */
export interface MeterViewModel {
  /** 一意識別子 */
  id: string;
  /** メーター名（例: "Eco", "Free Quota"） */
  title: string;
  /** 現在値の表示テキスト（例: "$9.80"） */
  valueLabel: string;
  /** 目標値の表示テキスト（例: "/ $5.00"） */
  goalLabel: string;
  /** 達成率 0〜∞（目標値=100%。クランプ前の生値） */
  ratio: number;
  /** ゾーン判定結果 */
  zone: MeterZone;
  /** true の場合、ratio をそのまま弧位置に使う（0.7 スケーリングをスキップ） */
  rawScale?: boolean;
}

// ── ゲージ定数 ──

/** 弧の半径 */
const R = 38;
/** SVG 中心座標 */
const CX = 50;
const CY = 50;
/** 円周 */
const CIRCUMFERENCE = 2 * Math.PI * R;
/** 270° 弧の長さ */
const ARC_LENGTH = CIRCUMFERENCE * 0.75;
/** 弧の開始角度回転（3時位置 → 7:30位置 = +135°） */
const ROTATION = 135;
/** 弧の線幅 */
const STROKE_WIDTH = 8;
/** ゲージ最大表示幅（px） */
const MAX_WIDTH = '138px';

/**
 * レッドゾーン開始位置（弧全体に対する割合）。
 * 0.7 = 弧の70%地点が目標値、残30%がレッドゾーン。
 */
const RED_ZONE_START = 0.7;

// ── 色定数 ──

const TRACK_COLOR = 'var(--vscode-panel-border, #444)';
const DANGER_TEXT_COLOR = 'var(--vscode-editorError-foreground, #ef4444)';

/**
 * 弧の充填色を ratio ベースで決定する。
 * displayRatio（弧上の表示位置 0-100%）に応じて HSL hue を補間。
 *   0% → hsl(120) 緑
 *  50% → hsl(60)  黄
 * 100% → hsl(0)   赤
 */
function arcFillColor(displayRatio: number): string {
  const t = Math.min(Math.max(displayRatio, 0), 100) / 100;
  const hue = 120 * (1 - t);
  return `hsl(${hue}, 80%, 45%)`;
}

// ── コンポーネント ──

interface MeterBarProps {
  meter: MeterViewModel;
}

export default function MeterBar({ meter }: MeterBarProps) {
  // rawScale: ratio をそのまま弧位置に使う（Free Quota 等、100% が上限のメーター用）
  // 通常: ratio 100% → 弧の 70% 地点にスケーリング。超過分は弧 100% でクランプ。
  const displayRatio = meter.rawScale
    ? Math.min(Math.max(meter.ratio, 0), 100)
    : Math.min(Math.max(meter.ratio * RED_ZONE_START, 0), 100);
  const fillLength = ARC_LENGTH * (displayRatio / 100);
  const fillColor = arcFillColor(displayRatio);

  const isDanger = meter.zone === 'danger';

  return (
    <div style={{ textAlign: 'center' }}>
      {/* SVG ゲージ */}
      <svg
        viewBox="0 0 100 82"
        style={{ width: '100%', maxWidth: MAX_WIDTH, display: 'block', margin: '0 auto' }}
      >
        {/* 背景トラック（270° 弧） */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={TRACK_COLOR}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          transform={`rotate(${ROTATION}, ${CX}, ${CY})`}
        />

        {/* 充填弧（緑→赤グラデーション） */}
        {fillLength > 0 && (
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={fillColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${fillLength} ${CIRCUMFERENCE}`}
            transform={`rotate(${ROTATION}, ${CX}, ${CY})`}
            style={{ transition: 'stroke-dasharray 0.3s ease' }}
          />
        )}

        {/* 中央 1行目: 値 */}
        <text
          x={CX}
          y={CY - 10}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontWeight="bold"
          fill="currentColor"
        >
          {meter.valueLabel}
        </text>

        {/* 中央 2行目: 閾値（目標値） */}
        <text
          x={CX}
          y={CY + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9"
          fill="currentColor"
          opacity="0.55"
        >
          {meter.goalLabel}
        </text>

        {/* 中央 3行目: 割合（danger 時は赤文字） */}
        <text
          x={CX}
          y={CY + 14}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="9"
          fill={isDanger ? DANGER_TEXT_COLOR : 'currentColor'}
          opacity={isDanger ? 1 : 0.65}
        >
          {meter.ratio.toFixed(0)}%
        </text>
      </svg>

      {/* タイトル */}
      <div style={{ fontSize: '10px', fontWeight: 'bold', marginTop: '0px', lineHeight: 1.2 }}>
        {meter.title}
      </div>
    </div>
  );
}
