import type { Page } from "@playwright/test";
import { fakeSpeech, spokenTexts } from "./speech.ts";
import { expect, test } from "./test.ts";

// 設定が保存され、再生に効くこと。設定の読み書きの規則は apps/web/src/settings の単体テストが見る
const tagged = `version: 1
metadata:
  id: test-tags
  name: テスト_タグ
  language: ja-JP
  tags:
    - { id: tank, label: タンク }
    - { id: healer, label: ヒーラー }
phases:
  - id: p1
    name: テスト_フェーズ1
    start: { type: absolute, at: 0 }
    events:
      - id: e1
        at: 1
        name: テスト_強攻撃
        notifications: [{ type: speech, text: テスト_タンク, tags: [tank] }]
      - id: e2
        at: 1.5
        name: テスト_回復
        notifications: [{ type: speech, text: テスト_ヒーラー, tags: [healer] }]
      - id: e3
        at: 2
        name: テスト_全体
        notifications: [{ type: speech, text: テスト_全員 }]
`;

async function openTagged(page: Page) {
  await page.getByRole("textbox", { name: "YAML か JSON のスクリプトを貼り付ける" }).fill(tagged);
  await page.getByRole("button", { name: "貼り付けて読み込む" }).click();
  await expect(page.locator("[data-imports]")).toHaveAttribute("data-imports", "1");
  await page.getByTestId("library").getByRole("button", { name: "開く" }).click();
}

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
  await page.goto("/");
});

test("measures how long the voice takes to start", async ({ page }) => {
  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("button", { name: "テスト再生" }).click();
  await expect(page.getByRole("status")).toHaveText(/話し始めるまで \d+ ms/);
  await expect(page.getByLabel(/話し始めるまでの遅れ \(\d+ ms\)/)).toBeChecked();
});

test("keeps a changed setting after reloading", async ({ page }) => {
  await page.getByRole("button", { name: "設定" }).click();
  await page.getByLabel("コールが重なったとき").selectOption("queue");
  await page.reload();
  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByLabel("コールが重なったとき")).toHaveValue("queue");
});

test("uses the nudge step from the settings", async ({ page }) => {
  await page.getByRole("button", { name: "設定" }).click();
  await page.getByLabel("補正の単位 (秒)").fill("2");
  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByRole("button", { name: "サンプルを開く" }).click();
  await expect(page.getByRole("button", { name: "+2 秒" })).toBeVisible();
});

test("speaks only the chosen tags and calls without tags", async ({ page }) => {
  await openTagged(page);
  await page.getByRole("button", { name: "タンク" }).click();
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect.poll(() => spokenTexts(page), { timeout: 5000 }).toContain("テスト_全員");
  expect(await spokenTexts(page)).toEqual(["テスト_タンク", "テスト_全員"]);
});

test("remembers the chosen tags of a script", async ({ page }) => {
  await openTagged(page);
  await page.getByRole("button", { name: "ヒーラー" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "ヒーラー" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "false");
});
