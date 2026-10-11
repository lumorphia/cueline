// エディタの編集 (docs/design/05-ui.md の「エディタ」)。Script を変えずに、新しい Script を作って返す。
// ID (英数字) は自動で付け、使っている番号とぶつからないようにする
import type { Script, ScriptEvent, ScriptNotification, ScriptPhase } from "@timeline-call/script";

/** prefix に 1 から順に番号を付け、使われていない最小のものを返す */
function nextId(prefix: string, used: Iterable<string>): string {
  const taken = new Set(used);
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!taken.has(id)) return id;
  }
}

const eventIds = (s: Script) => s.phases.flatMap((p) => p.events.map((e) => e.id));
const numberOf = (id: string) => id.replace(/^\D+/, "");

function replaceAt<T>(items: readonly T[], index: number, change: (item: T) => T): T[] {
  return items.map((item, i) => (i === index ? change(item) : item));
}

const withPhases = (s: Script, phases: readonly ScriptPhase[]): Script => ({ ...s, phases });

function mapPhase(s: Script, p: number, change: (phase: ScriptPhase) => ScriptPhase): Script {
  return withPhases(s, replaceAt(s.phases, p, change));
}

function mapEvent(s: Script, p: number, e: number, change: (event: ScriptEvent) => ScriptEvent) {
  return mapPhase(s, p, (phase) => ({ ...phase, events: replaceAt(phase.events, e, change) }));
}

// --- スクリプト ---

export function newScript(options: { name: string; randomId: () => string }): Script {
  return {
    version: 1,
    metadata: { id: `my-${options.randomId()}`, name: options.name, language: "ja-JP", tags: [] },
    countdown: { default: 15 },
    defaults: { before: 0 },
    phases: [{ id: "p1", name: "フェーズ1", start: { type: "absolute", at: 0 }, events: [] }],
  };
}

// --- フェーズ ---

export function addPhase(s: Script): Script {
  const id = nextId(
    "p",
    s.phases.map((p) => p.id),
  );
  const phase: ScriptPhase = {
    id,
    name: `フェーズ${s.phases.length + 1}`,
    start: { type: "manual" },
    events: [],
  };
  return withPhases(s, [...s.phases, phase]);
}

export function updatePhase(
  s: Script,
  p: number,
  change: Partial<Pick<ScriptPhase, "name" | "start">>,
): Script {
  return mapPhase(s, p, (phase) => ({ ...phase, ...change }));
}

export function removePhase(s: Script, p: number): Script {
  return withPhases(
    s,
    s.phases.filter((_, i) => i !== p),
  );
}

export function movePhase(s: Script, p: number, delta: -1 | 1): Script {
  const to = p + delta;
  const moving = s.phases[p];
  if (!moving || to < 0 || to >= s.phases.length) return s;
  const rest = s.phases.filter((_, i) => i !== p);
  return withPhases(s, [...rest.slice(0, to), moving, ...rest.slice(to)]);
}

// --- イベント ---

const speechFor = (s: Script, text: string): ScriptNotification => ({
  type: "speech",
  text,
  before: s.defaults.before,
  tags: [],
  priority: "normal",
  enabled: true,
});

export function addEvent(
  s: Script,
  p: number,
  options: { at?: number; name?: string } = {},
): Script {
  const id = nextId("e", eventIds(s));
  const last = s.phases[p]?.events.at(-1);
  const name = options.name ?? `イベント${numberOf(id)}`;
  const event: ScriptEvent = {
    id,
    at: options.at ?? (last ? last.at + 10 : 0),
    name,
    notifications: [speechFor(s, name)],
  };
  return mapPhase(s, p, (phase) => ({ ...phase, events: [...phase.events, event] }));
}

export function updateEvent(
  s: Script,
  p: number,
  e: number,
  change: Partial<Pick<ScriptEvent, "name" | "at">>,
): Script {
  return mapEvent(s, p, e, (event) => ({ ...event, ...change }));
}

export function removeEvent(s: Script, p: number, e: number): Script {
  return mapPhase(s, p, (phase) => ({ ...phase, events: phase.events.filter((_, i) => i !== e) }));
}

export function duplicateEvent(s: Script, p: number, e: number): Script {
  const original = s.phases[p]?.events[e];
  if (!original) return s;
  const copy: ScriptEvent = { ...original, id: nextId("e", eventIds(s)) };
  return mapPhase(s, p, (phase) => ({
    ...phase,
    events: [...phase.events.slice(0, e + 1), copy, ...phase.events.slice(e + 1)],
  }));
}

/** 時刻の順に並べる。同じ時刻は今の順のまま (sort は安定) */
export function sortEvents(s: Script, p: number): Script {
  return mapPhase(s, p, (phase) => ({
    ...phase,
    events: [...phase.events].sort((a, b) => a.at - b.at),
  }));
}

// --- 通知 ---

export function addNotification(s: Script, p: number, e: number): Script {
  return mapEvent(s, p, e, (event) => ({
    ...event,
    notifications: [
      ...event.notifications,
      {
        ...speechFor(s, event.name),
        type: "display",
        before: event.notifications[0]?.before ?? s.defaults.before,
      },
    ],
  }));
}

export function updateNotification(
  s: Script,
  p: number,
  e: number,
  k: number,
  change: Partial<ScriptNotification>,
): Script {
  return mapEvent(s, p, e, (event) => ({
    ...event,
    notifications: replaceAt(event.notifications, k, (n) => ({ ...n, ...change })),
  }));
}

export function removeNotification(s: Script, p: number, e: number, k: number): Script {
  return mapEvent(s, p, e, (event) => ({
    ...event,
    notifications: event.notifications.filter((_, i) => i !== k),
  }));
}

// --- タグ ---

export function addTag(s: Script, label: string): Script {
  const id = nextId(
    "t",
    s.metadata.tags.map((t) => t.id),
  );
  return { ...s, metadata: { ...s.metadata, tags: [...s.metadata.tags, { id, label }] } };
}

export function renameTag(s: Script, id: string, label: string): Script {
  const tags = s.metadata.tags.map((t) => (t.id === id ? { ...t, label } : t));
  return { ...s, metadata: { ...s.metadata, tags } };
}

/** タグを消し、そのタグを付けていた通知からも外す */
export function removeTag(s: Script, id: string): Script {
  const metadata = { ...s.metadata, tags: s.metadata.tags.filter((t) => t.id !== id) };
  const phases = s.phases.map((phase) => ({
    ...phase,
    events: phase.events.map((event) => ({
      ...event,
      notifications: event.notifications.map((n) => ({
        ...n,
        tags: n.tags.filter((t) => t !== id),
      })),
    })),
  }));
  return { ...s, metadata, phases };
}
