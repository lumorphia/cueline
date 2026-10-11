// 読み込んだ後のスクリプト。省いた設定を既定値で埋めた形で、エンジンと書き出しはこれを使う
export type NotificationType = "speech" | "display";
export type Priority = "low" | "normal" | "high";

export type ScriptNotification = {
  type: NotificationType;
  text: string;
  before: number;
  tags: readonly string[];
  priority: Priority;
  enabled: boolean;
};

export type ScriptEvent = {
  id: string;
  at: number;
  name: string;
  notifications: readonly ScriptNotification[];
};

export type PhaseStart = { type: "absolute"; at: number } | { type: "manual" };

export type ScriptPhase = {
  id: string;
  name: string;
  start: PhaseStart;
  events: readonly ScriptEvent[];
};

export type ScriptTag = { id: string; label: string };

export type Script = {
  version: 1;
  metadata: {
    id: string;
    name: string;
    description?: string;
    author?: string;
    language: string;
    tags: readonly ScriptTag[];
  };
  countdown?: { default: number };
  defaults: { before: number };
  phases: readonly ScriptPhase[];
};

export const LATEST_VERSION = 1;
