import { fakeSpeech, spokenTexts } from "./speech.ts";
import { expect, test } from "./test.ts";

// 同梱のサンプル (水晶のゴーレム) で、画面とエンジン・読み上げ・Worker のタイマーがつながっていること。
// 規則そのものは各パッケージの単体テストが見る
test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルを開く" }).click();
});

test("speaks the first call after starting", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect.poll(() => spokenTexts(page), { timeout: 6000 }).toContain("5秒後、全体攻撃");
});

test("shows a display notification on screen", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("全体攻撃", { timeout: 6000 });
});

test("counts down from the pull", async ({ page }) => {
  await page.getByRole("button", { name: "プル 15 秒" }).click();
  await expect(page.getByTestId("state")).toHaveText("カウント中");
  await expect(page.getByTestId("clock")).toHaveText(/^-00:1[0-5]\.\d$/);
});

test("moves the time with a nudge and undoes it", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("button", { name: "一時停止" }).click();
  await page.getByRole("button", { name: "+1 秒" }).click();
  await expect(page.getByTestId("clock")).toHaveText(/^00:01\.\d$/);
  await page.getByRole("button", { name: "取り消し" }).click();
  await expect(page.getByTestId("clock")).toHaveText(/^00:00\.\d$/);
});

test("offers the manual phase from the start of the fight", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect(page.getByRole("button", { name: "フェーズ2 を開始" })).toBeVisible({
    timeout: 1000,
  });
});

test("starts the manual phase from its button", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("button", { name: "フェーズ2 を開始" }).click({ timeout: 1000 });
  await expect(page.getByText("フェーズ2", { exact: true })).toBeVisible();
  await expect.poll(() => spokenTexts(page), { timeout: 6000 }).toContain("5秒後、全体攻撃");
});

test("stops only after the stop button is held", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  const stop = page.getByRole("button", { name: "停止 (長押し)" });
  await stop.click();
  await expect(page.getByTestId("state")).toHaveText("戦闘中");
  await stop.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page.getByTestId("state")).toHaveText("準備");
});

test("switches the screen to English", async ({ page }) => {
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "Pull 15s" })).toBeVisible();
});
