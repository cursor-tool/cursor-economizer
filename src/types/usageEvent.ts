// API レスポンス型（res.json 準拠、全フィールド定義）
export interface ApiUsageEvent {
  timestamp: string;
  model: string;
  kind: string;
  customSubscriptionName?: string;
  maxMode?: boolean;
  requestsCosts?: number;
  usageBasedCosts: number;
  isTokenBasedCall: boolean;
  tokenUsage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    totalCents?: number;
  };
  owningUser: string;
  owningTeam: string;
  cursorTokenFee: number;
  isChargeable: boolean;
  isHeadless: boolean;
}

export interface ApiEventsResponse {
  totalUsageEventsCount: number;
  usageEventsDisplay: ApiUsageEvent[];
}

// API-B: usage-summary レスポンス型（usage-summary.json 準拠、全フィールド定義）
export interface ApiUsageSummary {
  billingCycleStart: string;   // ISO 8601
  billingCycleEnd: string;     // ISO 8601
  membershipType: string;      // "enterprise" | "pro" | "hobby" 等
  limitType: string;           // "team" | "individual" 等
  isUnlimited: boolean;
  autoModelSelectedDisplayMessage: string;
  namedModelSelectedDisplayMessage: string;
  individualUsage: {
    plan: {
      enabled: boolean;
      used: number;
      limit: number;
      remaining: number;
      breakdown: { included: number; bonus: number; total: number };
      autoPercentUsed: number;
      apiPercentUsed: number;
      totalPercentUsed: number;
    };
    onDemand: {
      enabled: boolean;
      used: number;
      limit: number | null;       // null = unlimited
      remaining: number | null;   // null = unlimited
    };
  };
  teamUsage: {
    onDemand: {
      enabled: boolean;
      used: number;
      limit: number | null;
      remaining: number | null;
    };
  };
}

// API-C: auth/me レスポンス型（me.json 準拠）
export interface ApiAuthMe {
  email: string;
  email_verified: boolean;
  name: string;
  sub: string;
  created_at: string;   // Unix ms 文字列（正規化後）
  updated_at: string;   // Unix ms 文字列（正規化後）
  picture: string;
  id: number;
}

// API-D: dashboard/team レスポンス型（team.json 準拠）
export interface ApiTeamMember {
  id: number;
  name?: string;
  role: string;
  email: string;
}

export interface ApiTeamResponse {
  teamMembers: ApiTeamMember[];
  userId: number;
}

// API-E: dashboard/teams レスポンス型（teams.js 準拠）
export interface ApiTeamDetail {
  name: string;
  id: number;
  role: string;
  seats: number;
  hasBilling: boolean;
  requestQuotaPerSeat: number;
  privacyModeForced: boolean;
  allowSso: boolean;
  adminOnlyUsagePricing: boolean;
  subscriptionStatus: string;
  privacyModeMigrationOptedOut: boolean;
  membershipType: string;
  billingCycleStart: string;
  billingCycleEnd: string;
  individualSpendLimitsBlocked: boolean;
  customerBalanceCents: string;
}

export interface ApiTeamsResponse {
  teams: ApiTeamDetail[];
}

// DB 行型: auth_me テーブル
export interface AuthMeRow {
  id: number;
  email: string;
  email_verified: number;
  name: string;
  sub: string;
  created_at: string;
  updated_at: string;
  picture: string;
  raw_json: string;
  fetched_at: string;
}

// DB 行型: team_members テーブル
export interface TeamMemberRow {
  id: number;
  name: string;
  role: string;
  email: string;
  user_id: number;
  raw_json: string;
  fetched_at: string;
}

// DB 行型: teams テーブル
export interface TeamDetailRow {
  id: number;
  name: string;
  role: string;
  seats: number;
  has_billing: number;
  request_quota_per_seat: number;
  privacy_mode_forced: number;
  allow_sso: number;
  admin_only_usage_pricing: number;
  subscription_status: string;
  privacy_mode_migration_opted_out: number;
  membership_type: string;
  billing_cycle_start: string;
  billing_cycle_end: string;
  individual_spend_limits_blocked: number;
  customer_balance_cents: string;
  raw_json: string;
  fetched_at: string;
}

// DB 行型: usage_summary テーブル
export interface UsageSummaryRow {
  id: number;
  billing_cycle_start: string;
  billing_cycle_end: string;
  membership_type: string;
  limit_type: string;
  is_unlimited: number;
  auto_model_message: string | null;
  named_model_message: string | null;
  plan_enabled: number;
  plan_used: number;
  plan_limit: number;
  plan_remaining: number;
  plan_included: number;
  plan_bonus: number;
  plan_total: number;
  plan_auto_pct: number;
  plan_api_pct: number;
  plan_total_pct: number;
  ondemand_enabled: number;
  ondemand_used: number;
  ondemand_limit: number | null;
  ondemand_remaining: number | null;
  team_ondemand_enabled: number;
  team_ondemand_used: number;
  team_ondemand_limit: number | null;
  team_ondemand_remaining: number | null;
  raw_json: string;
  fetched_at: string;
}

// DB 行型: usage_events テーブル
export interface UsageEventRow {
  id: number;
  timestamp: string;
  model: string;
  kind: string;
  max_mode: number | null;
  requests_costs: number | null;
  usage_based_costs: number;
  is_token_based_call: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  total_cents: number;
  owning_user: string;
  owning_team: string;
  cursor_token_fee: number;
  is_chargeable: number;
  is_headless: number;
  raw_json: string;
  fetched_at: string;
  note: string;
}
