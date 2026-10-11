// スクリプトを、エンジンが使う形 (タイムライン) に展開する (docs/design/02-timeline-script.md の「時刻」)。
// 時刻はミリ秒の整数にし、フェーズ時刻と論理時刻を型で分ける
import type { NotificationType, Priority, Script } from "./script.ts";

/** フェーズの開始からのミリ秒 */
export type PhaseMs = number & { readonly __unit: "PhaseMs" };
/** 戦闘開始 (プル) からのミリ秒。プルカウント中は負 */
export type LogicalMs = number & { readonly __unit: "LogicalMs" };

export const toMs = (seconds: number): number => Math.round(seconds * 1000);
const phaseMs = (seconds: number) => toMs(seconds) as PhaseMs;

export type NotificationId = `${string}#${number}`;

export type TimelineNotification = {
  id: NotificationId;
  eventId: string;
  phaseId: string;
  type: NotificationType;
  text: string;
  tags: readonly string[];
  priority: Priority;
  enabled: boolean;
  fireAtPhaseMs: PhaseMs;
};

export type TimelineEvent = { id: string; name: string; atPhaseMs: PhaseMs };

export type TimelinePhase = {
  id: string;
  name: string;
  start: { type: "absolute"; atMs: LogicalMs } | { type: "manual" };
  events: readonly TimelineEvent[];
  /** 鳴る順 (時刻、優先度の高い順、スクリプトの順) */
  notifications: readonly TimelineNotification[];
};

export type Timeline = {
  metadata: Script["metadata"];
  countdownMs?: number;
  phases: readonly TimelinePhase[];
};

const RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export function buildTimeline(script: Script): Timeline {
  return {
    metadata: script.metadata,
    ...(script.countdown ? { countdownMs: toMs(script.countdown.default) } : {}),
    phases: script.phases.map((phase) => {
      const notifications = phase.events.flatMap((event) =>
        event.notifications.map((n, k): TimelineNotification => ({
          id: `${event.id}#${k}`,
          eventId: event.id,
          phaseId: phase.id,
          type: n.type,
          text: n.text,
          tags: n.tags,
          priority: n.priority,
          enabled: n.enabled,
          fireAtPhaseMs: phaseMs(event.at - n.before),
        })),
      );
      return {
        id: phase.id,
        name: phase.name,
        start:
          phase.start.type === "absolute"
            ? { type: "absolute", atMs: toMs(phase.start.at) as LogicalMs }
            : { type: "manual" },
        events: phase.events.map((e) => ({ id: e.id, name: e.name, atPhaseMs: phaseMs(e.at) })),
        // sort は元の順を保つ (安定) ので、同じ時刻・優先度ならスクリプトの順のまま
        notifications: [...notifications].sort(
          (a, b) => a.fireAtPhaseMs - b.fireAtPhaseMs || RANK[a.priority] - RANK[b.priority],
        ),
      };
    }),
  };
}
