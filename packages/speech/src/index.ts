// 読み上げ (docs/design/04-speech.md)
export { createArbiter } from "./arbiter.ts";
export type { Arbiter, ArbiterEvent, ArbiterOptions, ConflictMode } from "./arbiter.ts";
export type { Call, ProviderCallbacks, SpeechProvider, TestResult } from "./provider.ts";
export { chooseVoice, createWebSpeechProvider, sortVoices, unlockAudio } from "./web-speech.ts";
export type {
  SynthLike,
  UnlockOptions,
  UtteranceConstructor,
  VoiceLike,
  VoiceSettings,
  WebSpeechOptions,
  WebSpeechProvider,
} from "./web-speech.ts";
