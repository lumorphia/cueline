import { describe, expect, it } from "vitest";
import { chooseVoice, createWebSpeechProvider, sortVoices, unlockAudio } from "./web-speech.ts";
import type { SynthLike, UtteranceConstructor, VoiceLike } from "./web-speech.ts";
import type { Call } from "./provider.ts";

const voice = (name: string, lang: string, localService = true): VoiceLike => ({
  name,
  lang,
  localService,
  voiceURI: `uri:${name}`,
  default: false,
});

const VOICES = [
  voice("English", "en-US"),
  voice("Online JA", "ja-JP", false),
  voice("Ayumi", "ja-JP"),
  voice("Haruka", "ja-jp"),
];

describe("chooseVoice", () => {
  it("uses the chosen voice when it exists", () => {
    expect(chooseVoice(VOICES, "uri:Haruka", "ja-JP")).toEqual({
      voice: VOICES[3],
      fallback: false,
    });
  });

  it("falls back to an on-device voice of the language when the chosen one is gone", () => {
    expect(chooseVoice(VOICES, "uri:Gone", "ja-JP")).toEqual({ voice: VOICES[2], fallback: true });
  });

  it("picks an on-device voice of the language when nothing is chosen", () => {
    expect(chooseVoice(VOICES, null, "ja-JP")).toEqual({ voice: VOICES[2], fallback: false });
  });

  it("matches the language by its primary tag", () => {
    expect(chooseVoice(VOICES, null, "en-GB").voice?.name).toBe("English");
  });

  it("leaves the voice to the browser when no voice fits the language", () => {
    expect(chooseVoice(VOICES, null, "fr-FR")).toEqual({ voice: null, fallback: true });
  });
});

describe("sortVoices", () => {
  it("puts voices of the language first and on-device ones before online ones", () => {
    expect(sortVoices(VOICES, "ja-JP").map((v) => v.name)).toEqual([
      "Ayumi",
      "Haruka",
      "Online JA",
      "English",
    ]);
  });
});

// 偽の speechSynthesis。話されたものを覚え、start / end はテストが起こす。
// ブラウザの型 (SpeechSynthesis) の全部は作らないので、渡すときに型を合わせる
class FakeUtterance {
  voice: VoiceLike | null = null;
  lang = "";
  rate = 1;
  volume = 1;
  pitch = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}

function fakeSynth(voices: VoiceLike[] = VOICES) {
  const spoken: FakeUtterance[] = [];
  let cancels = 0;
  const synth = {
    speak: (u: FakeUtterance) => void spoken.push(u),
    cancel: () => void (cancels += 1),
    getVoices: () => voices,
  } as unknown as SynthLike;
  const Utterance = FakeUtterance as unknown as UtteranceConstructor;
  return { synth, Utterance, spoken, cancels: () => cancels };
}

const call = (text: string): Call => ({
  id: "e1#0",
  text,
  language: "ja-JP",
  priority: "normal",
  dueAtMono: 0,
});
const settings = { voiceURI: null, rate: 1.2, volume: 0.8, pitch: 1.1 };

describe("createWebSpeechProvider", () => {
  it("speaks the text with the settings and the chosen voice", () => {
    const fake = fakeSynth();
    const provider = createWebSpeechProvider({ ...fake, settings: () => settings, now: () => 0 });
    provider.speak(call("全体攻撃"), { onStart: () => {}, onEnd: () => {}, onError: () => {} });
    expect(fake.spoken[0]).toMatchObject({
      text: "全体攻撃",
      lang: "ja-JP",
      rate: 1.2,
      volume: 0.8,
      pitch: 1.1,
      voice: VOICES[2],
    });
  });

  it("passes the start, end and error of the utterance on", () => {
    const fake = fakeSynth();
    const provider = createWebSpeechProvider({ ...fake, settings: () => settings, now: () => 0 });
    const seen: string[] = [];
    const callbacks = {
      onStart: () => seen.push("start"),
      onEnd: () => seen.push("end"),
      onError: (e: string) => seen.push(`error:${e}`),
    };
    provider.speak(call("a"), callbacks);
    provider.speak(call("b"), callbacks);
    fake.spoken[0]?.onstart?.();
    fake.spoken[0]?.onend?.();
    fake.spoken[1]?.onerror?.({ error: "interrupted" });
    expect(seen).toEqual(["start", "end", "error:interrupted"]);
  });

  it("cancels through speechSynthesis", () => {
    const fake = fakeSynth();
    createWebSpeechProvider({ ...fake, settings: () => settings, now: () => 0 }).cancel();
    expect(fake.cancels()).toBe(1);
  });

  it("measures how long a test call takes to start", async () => {
    const fake = fakeSynth();
    let t = 100;
    const provider = createWebSpeechProvider({ ...fake, settings: () => settings, now: () => t });
    const result = provider.test("テスト", "ja-JP");
    t = 420;
    fake.spoken[0]?.onstart?.();
    fake.spoken[0]?.onend?.();
    expect(await result).toEqual({ ok: true, startLatencyMs: 320 });
  });

  it("reports a test call that fails", async () => {
    const fake = fakeSynth();
    const provider = createWebSpeechProvider({ ...fake, settings: () => settings, now: () => 0 });
    const result = provider.test("テスト", "ja-JP");
    fake.spoken[0]?.onerror?.({ error: "synthesis-failed" });
    expect(await result).toEqual({ ok: false, error: "synthesis-failed" });
  });
});

describe("unlockAudio", () => {
  it("speaks a silent utterance and resumes the audio context", async () => {
    const fake = fakeSynth();
    let state = "suspended";
    class FakeAudioContext {
      get state() {
        return state;
      }
      async resume() {
        state = "running";
      }
    }
    const result = await unlockAudio({ ...fake, AudioContext: FakeAudioContext });
    expect(fake.spoken[0]?.volume).toBe(0);
    expect(result.audioRunning).toBe(true);
    expect(result.context).toBeInstanceOf(FakeAudioContext);
  });

  it("reports an audio context that does not start", async () => {
    const fake = fakeSynth();
    class StuckAudioContext {
      state = "suspended";
      async resume() {}
    }
    expect((await unlockAudio({ ...fake, AudioContext: StuckAudioContext })).audioRunning).toBe(
      false,
    );
  });
});
