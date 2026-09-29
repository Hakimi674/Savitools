export type WatchEventType = 'transaction' | 'payment' | 'contract';
/** Mirrors the API's `EVENT_ALERT_RULE_TYPES` + `STATE_ALERT_RULE_TYPES` union. */
export type AlertRuleType =
  | 'amount_received_gte'
  | 'amount_sent_gte'
  | 'asset_received'
  | 'tx_failed'
  | 'any_activity'
  | 'event_topic_equals'
  | 'failed_contract_call'
  | 'balance_above'
  | 'balance_below'
  | 'transaction_count';
export type NotificationChannel = 'in_app' | 'email' | 'webhook';
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface AlertRule {
  id: string;
  type: AlertRuleType;
  asset?: string;
  threshold?: string;
  windowMinutes?: number;
  channels: NotificationChannel[];
}

export interface Watch {
  id: string;
  publicKey: string;
  type: 'account' | 'contract';
  label: string | null;
  network: 'testnet' | 'public';
  eventTypes: WatchEventType[];
  alertRules: AlertRule[];
  cursorLedger: string | null;
  streamMode: 'sse' | 'poll';
  status: 'streaming' | 'polling' | 'error';
  lastEventAt: string | null;
  lastError: string | null;
}

export interface WatchEvent {
  id: string;
  watchId: string;
  pagingToken: string;
  source: WatchEventType;
  eventType: WatchEventType;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface DeliveryAttempt {
  channel: NotificationChannel;
  status: DeliveryStatus;
  attemptedAt?: string;
  error?: string;
}

export interface AlertEvent {
  id: string;
  watchId: string;
  ruleId: string;
  payload: Record<string, unknown>;
  deliveryStatus: DeliveryStatus;
  deliveryAttempts: DeliveryAttempt[];
  deliveredAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
