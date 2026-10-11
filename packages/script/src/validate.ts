// 意味の検証 (docs/design/02-timeline-script.md の「検証の段」の 5)。形 (zod) では見られない規則
import { error, warning } from "./issues.ts";
import type { IssuePath, ScriptIssue } from "./issues.ts";
import { LIMITS } from "./limits.ts";
import type { Script, ScriptPhase } from "./script.ts";

export function validateScript(script: Script): ScriptIssue[] {
  return [
    ...checkIds(script),
    ...checkTags(script),
    ...checkPhases(script),
    ...checkTimes(script),
    ...checkTotals(script),
  ];
}

/** 先に出た値と同じものの位置を返す */
function duplicates<T>(items: readonly T[], keyOf: (item: T) => string): number[] {
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    const key = keyOf(item);
    if (seen.has(key)) return [index];
    seen.add(key);
    return [];
  });
}

function checkIds(script: Script): ScriptIssue[] {
  const phaseIssues = duplicates(script.phases, (p) => p.id).map((i) =>
    error("duplicate_phase_id", ["phases", i, "id"], { id: script.phases[i]?.id ?? "" }),
  );
  const events = script.phases.flatMap((phase, p) =>
    phase.events.map((event, e) => ({ event, p, e })),
  );
  const eventIssues = duplicates(events, (x) => x.event.id).map((i) => {
    const { event, p, e } = events[i] as (typeof events)[number];
    return error("duplicate_event_id", ["phases", p, "events", e, "id"], { id: event.id });
  });
  const tags = script.metadata.tags;
  const tagIssues = duplicates(tags, (t) => t.id).map((i) =>
    error("duplicate_tag_id", ["metadata", "tags", i, "id"], { id: tags[i]?.id ?? "" }),
  );
  return [...phaseIssues, ...eventIssues, ...tagIssues];
}

function checkTags(script: Script): ScriptIssue[] {
  const known = new Set(script.metadata.tags.map((t) => t.id));
  return eachNotification(script).flatMap(({ notification, path }) =>
    notification.tags.flatMap((tag, t) =>
      known.has(tag) ? [] : [error("unknown_tag", [...path, "tags", t], { tag })],
    ),
  );
}

function checkPhases(script: Script): ScriptIssue[] {
  const [first] = script.phases;
  const firstIssues =
    first && (first.start.type !== "absolute" || first.start.at !== 0)
      ? [error("first_phase_not_at_zero", ["phases", 0, "start"])]
      : [];
  const orderIssues = script.phases.flatMap((phase, i) => {
    if (i === 0) return [];
    const earlier = script.phases.slice(0, i);
    if (phase.start.type === "manual") return [];
    if (earlier.some((p) => p.start.type === "manual")) {
      return [error("absolute_after_manual", ["phases", i, "start"])];
    }
    const previous = earlier.at(-1)?.start;
    return previous?.type === "absolute" && phase.start.at <= previous.at
      ? [error("phases_not_ascending", ["phases", i, "start", "at"], { previous: previous.at })]
      : [];
  });
  return [...firstIssues, ...orderIssues];
}

/** 秒をミリ秒にして、端数が出ないか (ミリ秒より細かい指定) */
const isMilliseconds = (seconds: number) =>
  Math.abs(seconds * 1000 - Math.round(seconds * 1000)) < 1e-6;

function checkTimes(script: Script): ScriptIssue[] {
  return script.phases.flatMap((phase, p) => {
    const next = script.phases[p + 1];
    return phase.events.flatMap((event, e) => {
      const at: IssuePath = ["phases", p, "events", e, "at"];
      const eventIssues = [
        ...(event.at < 0 && p > 0 ? [error("negative_at_outside_first_phase", at)] : []),
        ...(isMilliseconds(event.at) ? [] : [error("too_precise", at)]),
        ...(overlapsNext(phase, event.at, next) ? [warning("event_after_next_phase", at)] : []),
      ];
      const notificationIssues = event.notifications.flatMap((n, k) => {
        const before: IssuePath = ["phases", p, "events", e, "notifications", k, "before"];
        const fireAt = event.at - n.before;
        return [
          ...(isMilliseconds(n.before) ? [] : [error("too_precise", before)]),
          ...(phase.start.type === "manual" && fireAt < 0
            ? [error("fires_before_manual_start", before, { at: event.at })]
            : []),
          ...(phase.start.type === "absolute" &&
          script.countdown &&
          phase.start.at + fireAt < -script.countdown.default
            ? [warning("fires_before_countdown", before, { countdown: script.countdown.default })]
            : []),
        ];
      });
      return [...eventIssues, ...notificationIssues];
    });
  });
}

/** 時刻で始まるフェーズのイベントが、次の (時刻で始まる) フェーズの開始より後にあるか */
function overlapsNext(phase: ScriptPhase, at: number, next: ScriptPhase | undefined): boolean {
  return (
    phase.start.type === "absolute" &&
    next?.start.type === "absolute" &&
    phase.start.at + at >= next.start.at
  );
}

function checkTotals(script: Script): ScriptIssue[] {
  const events = script.phases.reduce((sum, p) => sum + p.events.length, 0);
  const notifications = eachNotification(script).length;
  return [
    ...(events > LIMITS.maxEvents
      ? [error("too_many_events", ["phases"], { max: LIMITS.maxEvents, count: events })]
      : []),
    ...(notifications > LIMITS.maxNotifications
      ? [
          error("too_many_notifications", ["phases"], {
            max: LIMITS.maxNotifications,
            count: notifications,
          }),
        ]
      : []),
  ];
}

function eachNotification(script: Script) {
  return script.phases.flatMap((phase, p) =>
    phase.events.flatMap((event, e) =>
      event.notifications.map((notification, k) => ({
        notification,
        path: ["phases", p, "events", e, "notifications", k] as IssuePath,
      })),
    ),
  );
}
