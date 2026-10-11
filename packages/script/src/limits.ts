// 読み込みの上限 (docs/design/02-timeline-script.md の「上限」、ADR-0007)。上限はここだけに置く
export const LIMITS = {
  maxChars: 1024 * 1024,
  maxAliasCount: 100,
  maxDepth: 16,
  maxPhases: 50,
  maxEvents: 2000,
  maxNotificationsPerEvent: 10,
  maxNotifications: 5000,
  maxTags: 32,
  minSeconds: -60,
  maxSeconds: 36000,
  maxBefore: 600,
  maxCountdown: 60,
} as const;
