// Web Speech のプロバイダ (docs/design/04-speech.md の「Web Speech」、要件 FR-201)。
// speechSynthesis と SpeechSynthesisUtterance は外から受け取る (テストでは偽物を渡す)
import type { Call, ProviderCallbacks, SpeechProvider, TestResult } from "./provider.ts";

export type VoiceLike = Pick<
  SpeechSynthesisVoice,
  "name" | "lang" | "localService" | "voiceURI" | "default"
>;

/** speechSynthesis のうち、使うところだけ */
export type SynthLike = Pick<SpeechSynthesis, "speak" | "cancel" | "getVoices">;

export type UtteranceConstructor = new (text: string) => SpeechSynthesisUtterance;

export type VoiceSettings = {
  /** 選んだ声。null ならスクリプトの言語に合う端末の声 */
  voiceURI: string | null;
  rate: number;
  volume: number;
  pitch: number;
};

const primary = (lang: string) => lang.toLowerCase().split(/[-_]/)[0] ?? "";
const sameLanguage = (voice: VoiceLike, language: string) =>
  primary(voice.lang) === primary(language);

/** 言語の合う声を先に、その中で端末の声をオンラインの声より先に並べる */
export function sortVoices<V extends VoiceLike>(voices: readonly V[], language: string): V[] {
  const rank = (v: VoiceLike) => (sameLanguage(v, language) ? 0 : 2) + (v.localService ? 0 : 1);
  return voices
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => rank(a.voice) - rank(b.voice) || a.index - b.index)
    .map((x) => x.voice);
}

/**
 * 使う声を決める。選んだ声が無ければ、言語の合う端末の声にし、fallback で知らせる (画面に出す)。
 * 言語の合う声が 1 つも無ければ、ブラウザに任せる (voice: null)
 */
export function chooseVoice<V extends VoiceLike>(
  voices: readonly V[],
  voiceURI: string | null,
  language: string,
): { voice: V | null; fallback: boolean } {
  const chosen = voiceURI === null ? undefined : voices.find((v) => v.voiceURI === voiceURI);
  if (chosen) return { voice: chosen, fallback: false };
  const [best] = sortVoices(voices, language).filter((v) => sameLanguage(v, language));
  return { voice: best ?? null, fallback: voiceURI !== null || !best };
}

export type WebSpeechOptions = {
  synth: SynthLike;
  Utterance: UtteranceConstructor;
  settings: () => VoiceSettings;
  now: () => number;
};

export type WebSpeechProvider = SpeechProvider & {
  test(text: string, language: string): Promise<TestResult>;
};

export function createWebSpeechProvider(options: WebSpeechOptions): WebSpeechProvider {
  const { synth, Utterance, settings, now } = options;
  // Chrome は参照の無い utterance を回収して onend を出さないことがあるので、終わるまで持っておく
  const alive = new Set<SpeechSynthesisUtterance>();

  function utter(text: string, language: string, callbacks: ProviderCallbacks) {
    const s = settings();
    const { voice } = chooseVoice(synth.getVoices(), s.voiceURI, language);
    const u = new Utterance(text);
    u.voice = voice;
    u.lang = voice?.lang ?? language;
    u.rate = s.rate;
    u.volume = s.volume;
    u.pitch = s.pitch;
    alive.add(u);
    u.onstart = () => callbacks.onStart();
    u.onend = () => {
      alive.delete(u);
      callbacks.onEnd();
    };
    u.onerror = (e) => {
      alive.delete(u);
      callbacks.onError(e.error);
    };
    synth.speak(u);
  }

  return {
    speak: (call: Call, callbacks: ProviderCallbacks) => utter(call.text, call.language, callbacks),
    cancel: () => synth.cancel(),
    // テスト再生 (要件 FR-206)。話し始めるまでの遅れを測る (PoC-002: 端末ごとにほぼ一定)
    test(text, language) {
      return new Promise((resolve) => {
        const asked = now();
        let latency: number | null = null;
        utter(text, language, {
          onStart: () => (latency = now() - asked),
          onEnd: () =>
            resolve(
              latency === null
                ? { ok: false, error: "no-start" }
                : { ok: true, startLatencyMs: latency },
            ),
          onError: (error) => resolve({ ok: false, error }),
        });
      });
    },
  };
}

type AudioContextLike = { readonly state: string; resume(): Promise<void> };

export type UnlockOptions = {
  synth: SynthLike;
  Utterance: UtteranceConstructor;
  AudioContext: new () => AudioContextLike;
  context?: AudioContextLike;
};

/**
 * 音のアンロック (04、ADR-0009)。スマホでは利用者の操作の中でしか音を鳴らし始められないので、
 * 開始・プルカウント・テストのボタンの中で呼ぶ。無音の読み上げを 1 つ流し、AudioContext を動かす
 */
export async function unlockAudio(options: UnlockOptions) {
  const silent = new options.Utterance(" ");
  silent.volume = 0;
  options.synth.speak(silent);
  const context = options.context ?? new options.AudioContext();
  await context.resume().catch(() => {});
  return { context, audioRunning: context.state === "running" };
}
