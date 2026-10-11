import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./test.ts";

// ライブラリ (読み込み、保存、書き出し、消す) が画面とつながっていること。規則は apps/web/src/library の単体テストが見る
const script = (id: string, name: string) => `version: 1
metadata:
  id: ${id}
  name: ${name}
  language: ja-JP
phases:
  - id: p1
    name: テスト_フェーズ1
    start: { type: absolute, at: 0 }
    events:
      - id: e1
        at: 10
        name: テスト_全体攻撃
        notifications:
          - { type: speech, text: テスト, before: 3 }
`;

/** 貼り付けて読み込み、保存まで終わるのを待つ (data-imports が 1 増える) */
async function paste(page: Page, text: string) {
  const section = page.locator("[data-imports]");
  const before = Number(await section.getAttribute("data-imports"));
  await page.getByRole("textbox", { name: "YAML か JSON のスクリプトを貼り付ける" }).fill(text);
  await page.getByRole("button", { name: "貼り付けて読み込む" }).click();
  await expect(section).toHaveAttribute("data-imports", String(before + 1));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("saves a pasted script and opens it", async ({ page }) => {
  await paste(page, script("test-paste", "テスト_貼り付け"));
  await page.getByTestId("library").getByRole("button", { name: "開く" }).click();
  await expect(page.getByText("テスト_貼り付け")).toBeVisible();
  await expect(page.getByTestId("clock")).toBeVisible();
});

test("keeps a saved script after reloading", async ({ page }) => {
  await paste(page, script("test-keep", "テスト_残る"));
  await page.reload();
  await expect(page.getByTestId("library")).toContainText("テスト_残る");
});

test("shows where an invalid script is wrong", async ({ page }) => {
  await paste(
    page,
    script("test-bad", "テスト_誤り").replace("language: ja-JP", "langauge: ja-JP"),
  );
  const issues = page.getByTestId("issues");
  await expect(issues).toContainText("5 行目");
  await expect(issues).toContainText("知らないキーです");
  await expect(page.getByTestId("library")).toHaveCount(0);
});

test("asks before replacing a script with the same id", async ({ page }) => {
  await paste(page, script("test-same", "テスト_前"));
  await paste(page, script("test-same", "テスト_後"));
  await page.getByRole("button", { name: "上書きする" }).click();
  await expect(page.getByTestId("library")).toContainText("テスト_後");
  await expect(page.getByTestId("library")).not.toContainText("テスト_前");
});

test("imports a script from a file", async ({ page }) => {
  await page.getByLabel("ファイルを選ぶ").setInputFiles({
    name: "boss.yaml",
    mimeType: "text/yaml",
    buffer: Buffer.from(script("test-file", "テスト_ファイル")),
  });
  await expect(page.getByTestId("library")).toContainText("テスト_ファイル");
});

test("exports a script that can be imported again", async ({ page }) => {
  await paste(page, script("test-export", "テスト_書き出し"));
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON で書き出す" }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("test-export.json");
  const text = await readFile((await file.path()) ?? "", "utf8");
  expect(JSON.parse(text).metadata.name).toBe("テスト_書き出し");
});

test("deletes a script after confirming", async ({ page }) => {
  await paste(page, script("test-delete", "テスト_消す"));
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "消す" }).click();
  await expect(page.getByText("まだスクリプトがありません")).toBeVisible();
});

test("opens the last script again after reloading", async ({ page }) => {
  await page.getByRole("button", { name: "サンプルを開く" }).click();
  await page.reload();
  await expect(page.getByTestId("clock")).toBeVisible();
});
