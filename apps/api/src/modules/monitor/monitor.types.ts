export const WATCH_EVENT_TYPES = [
  'transaction',
  'payment',
  'contract',
] as const;
export type WatchEventType = (typeof WATCH_EVENT_TYPES)[number];

export const EVENT_ALERT_RULE_TYPES = [
  'amount_received_gte',
  'amount_sent_gte',
  'asset_received',
  'tx_failed',
  'any_activity',
  'event_topic_equals',
  'failed_contract_call',
] as const;
export type EventAlertRuleType = (typeof EVENT_ALERT_RULE_TYPES)[number];

export const STATE_ALERT_RULE_TYPES = [
  'balance_above',
  'balance_below',
  'transaction_count',
] as const;
export type StateAlertRuleType = (typeof STATE_ALERT_RULE_TYPES)[number];

export const ALERT_RULE_TYPES = [
  ...EVENT_ALERT_RULE_TYPES,
  ...STATE_ALERT_RULE_TYPES,
] as const;
export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export function isStateAlertRule(
  type: AlertRuleType,
): type is StateAlertRuleType {
  return (STATE_ALERT_RULE_TYPES as readonly string[]).includes(type);
}

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'webhook'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type WatchType = 'account' | 'contract';
export type StellarNetwork = 'testnet' | 'public';
export type StreamMode = 'sse' | 'poll';
export type StreamStatus = 'streaming' | 'polling' | 'error';
export type EventSource = 'transaction' | 'payment' | 'contract';
export type DeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'retrying'
  | 'held'
  | 'claimed';

export interface UserDigestPreferences {
  digestEnabled: boolean;
  digestIntervalMinutes: number;
  timezone: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxDigestAlerts: number;
}

export interface DigestAlertEntry {
  id: string;
  ruleId: string;
  ruleType: string;
  watchId: string;
  watchLabel: string;
  createdAt: string;
  isUnresolved: boolean;
  isRefiring: boolean;
  summary: string;
  payload: Record<string, unknown>;
}

export interface DigestRuleGroup {
  ruleId: string;
  ruleType: string;
  totalAlerts: number;
  unresolvedCount: number;
  refiringCount: number;
  alerts: DigestAlertEntry[];
  truncatedCount: number;
}

export interface DigestWatchGroup {
  watchId: string;
  watchLabel: string;
  publicKey: string;
  rules: DigestRuleGroup[];
  totalAlerts: number;
}

export interface DigestPayload {
  flushId: string;
  timestamp: string;
  timezone: string;
  totalAlerts: number;
  displayedAlerts: number;
  summarizedCount: number;
  groups: DigestWatchGroup[];
}

export interface AlertRuleDefinition {
  id: string;
  type: AlertRuleType;
  asset?: string;
  threshold?: string;
  windowMinutes?: number;
  channels: NotificationChannel[];
  topic?: string;
}

/** Latest Horizon view of an account, used to evaluate state-based rules. */
export interface AccountStateSnapshot {
  publicKey: string;
  network: StellarNetwork;
  observedAt: string;
  /** Balance keyed by `XLM` or `CODE:ISSUER`. */
  balances: Record<string, string>;
  /** Transaction count keyed by the rule window, in minutes. */
  transactionCounts: Record<number, number>;
}

/** Whether each rule was met at the previous evaluation, keyed by rule ID. */
export type AlertRuleState = Record<string, boolean>;

export interface DeliveryAttempt {
  channel: NotificationChannel;
  status: DeliveryStatus;
  attemptedAt?: string;
  error?: string;
}

export interface NormalizedMonitorEvent {
  pagingToken: string;
  source: EventSource;
  eventType: WatchEventType;
  ledger: number | null;
  occurredAt: string;
  amount?: string;
  asset?: string;
  sentAmount?: string;
  sentAsset?: string;
  receivedAmount?: string;
  receivedAsset?: string;
  from?: string;
  to?: string;
  successful?: boolean;
  transactionHash?: string;
  payload: Record<string, unknown>;
}

export interface NotificationJobData {
  alertEventId: string;
}
