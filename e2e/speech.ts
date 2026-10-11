import type { Page } from "@playwright/test";

/**
 * ブラウザの読み上げを偽物にする。話した文を window.__spoken に記録し、少し後に start と end を返す。
 * headless の Chromium は声を持たず、本物では synthesis-failed になるため
 */
export async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    class FakeUtterance {
      text: string;
      voice = null;
      lang = "";
      rate = 1;
      volume = 1;
      pitch = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const synth = {
      speak(u: FakeUtterance) {
        if (u.volume > 0) spoken.push(u.text);
        setTimeout(() => u.onstart?.(), 10);
        setTimeout(() => u.onend?.(), 200);
      },
      cancel() {},
      getVoices: () => [],
      addEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: FakeUtterance,
      configurable: true,
    });
  });
}

export const spokenTexts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
