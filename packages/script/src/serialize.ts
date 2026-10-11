// スクリプトを書き出す (要件 FR-005、docs/design/02-timeline-script.md の「書き出し」)。
// 最新の版で、キーの順を仕様の表の順に揃え、通知の既定値も省かずに書く
import { stringify } from "yaml";
import type { Script } from "./script.ts";

export function serializeScript(script: Script, format: "yaml" | "json"): string {
  const data = toPlain(script);
  return format === "json"
    ? `${JSON.stringify(data, null, 2)}\n`
    : stringify(data, { lineWidth: 0 });
}

function toPlain(script: Script) {
  const { metadata } = script;
  return {
    version: script.version,
    metadata: {
      id: metadata.id,
      name: metadata.name,
      ...(metadata.description === undefined ? {} : { description: metadata.description }),
      ...(metadata.author === undefined ? {} : { author: metadata.author }),
      language: metadata.language,
      ...(metadata.tags.length === 0
        ? {}
        : { tags: metadata.tags.map((t) => ({ id: t.id, label: t.label })) }),
    },
    ...(script.countdown ? { countdown: { default: script.countdown.default } } : {}),
    defaults: { before: script.defaults.before },
    phases: script.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      start:
        phase.start.type === "absolute"
          ? { type: "absolute", at: phase.start.at }
          : { type: "manual" },
      events: phase.events.map((event) => ({
        id: event.id,
        at: event.at,
        name: event.name,
        notifications: event.notifications.map((n) => ({
          type: n.type,
          text: n.text,
          before: n.before,
          tags: [...n.tags],
          priority: n.priority,
          enabled: n.enabled,
        })),
      })),
    })),
  };
}
