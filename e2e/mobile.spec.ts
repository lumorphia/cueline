import type { Page } from "@playwright/test";
import { fakeSpeech } from "./speech.ts";
import { expect, test } from "./test.ts";

// スマホ単体で使うとき (ADR-0009、要件 FR-208)。画面の大きさは iPhone の縦向きくらい
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** 偽の navigator.wakeLock。取った・離したを window.__wakeLock に記録する。supported: false なら API を消す */
async function fakeWakeLock(page: Page, supported = true) {
  await page.addInitScript((supported) => {
    const log: string[] = [];
    (window as unknown as { __wakeLock: string[] }).__wakeLock = log;
    const value = supported
      ? {
          async request() {
            log.push("request");
            return {
              released: false,
              async release() {
                log.push("release");
              },
              addEventListener() {},
            };
          },
        }
      : undefined;
    Object.defineProperty(navigator, "wakeLock", { value, configurable: true });
  }, supported);
}

const wakeLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wakeLock: string[] }).__wakeLock);

async function openSample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルを開く" }).click();
}

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

test("keeps the controls on a phone screen without sideways scrolling", async ({ page }) => {
  await fakeWakeLock(page);
  await openSample(page);
  await expect(page.getByRole("button", { name: "開始", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "プル 15 秒" })).toBeInViewport();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("keeps the screen on while the fight runs and lets go when stopped", async ({ page }) => {
  await fakeWakeLock(page);
  await openSample(page);
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect.poll(() => wakeLog(page)).toEqual(["request"]);
  await page.getByRole("button", { name: "一時停止" }).click();
  await expect.poll(() => wakeLog(page)).toEqual(["request", "release"]);
});

test("tells the user when the screen cannot be kept on", async ({ page }) => {
  await fakeWakeLock(page, false);
  await openSample(page);
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect(page.getByText("この端末では画面の自動ロックを止められません")).toBeVisible();
});
