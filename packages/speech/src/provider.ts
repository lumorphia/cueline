// 読み上げの境界 (docs/design/04-speech.md の「境界」)
import type { Priority } from "@timeline-call/script";

export type Call = {
  id: string;
  text: string;
  /** 読み上げの言語 (スクリプトの metadata.language) */
  language: string;
  priority: Priority;
  /** 鳴るべき単調時計の時刻 (エンジンの dueAtMono) */
  dueAtMono: number;
};

export type ProviderCallbacks = {
  onStart: () => void;
  onEnd: () => void;
  onError: (error: string) => void;
};

export interface SpeechProvider {
  speak(call: Call, callbacks: ProviderCallbacks): void;
  cancel(): void;
}

export type TestResult = { ok: true; startLatencyMs: number } | { ok: false; error: string };
