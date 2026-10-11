import type { Page } from "@playwright/test";
import { expect, test } from "./test.ts";

// PWA (要件 NFR-201)。一度開いたら、オフラインでも開けること。どのリクエストを保存から返すかは strategy.test.ts が見る
async function controlled(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // 初めての読み込みは clients.claim で制御が移るのを待つ
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

test("opens without a network after the first visit", async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timeline Call (仮称)");
  await page.getByRole("button", { name: "サンプルを開く" }).click();
  await expect(page.getByTestId("clock")).toBeVisible();
  await context.setOffline(false);
});

test("opens any page path without a network", async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.goto("/somewhere/else");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timeline Call (仮称)");
  await context.setOffline(false);
});

test("serves the manifest and its icons", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ start_url: "/", display: "standalone" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});

test("asks the browser to check the service worker every time", async ({ request }) => {
  expect((await request.get("/sw.js")).headers()["cache-control"]).toBe("no-cache");
});
