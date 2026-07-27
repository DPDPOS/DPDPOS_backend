export type RetryPolicy = {
  attempts: number;
  backoffMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 5,
  backoffMs: 2000,
};

export const AI_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  backoffMs: 3000,
};

export const NOTIFICATION_RETRY_POLICY: RetryPolicy = {
  attempts: 5,
  backoffMs: 1500,
};
