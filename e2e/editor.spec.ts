import { fakeSpeech, spokenTexts } from "./speech.ts";
import { expect, test } from "./test.ts";

// エディタ (要件 FR-004)。画面だけで作って鳴らせること。編集の規則は apps/web/src/editor の単体テストが見る
test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
  await page.goto("/");
});

test("creates a timeline on screen and plays it", async ({ page }) => {
  await page.getByRole("button", { name: "新しく作る" }).click();
  await page.getByLabel("名前", { exact: true }).fill("テスト_画面で作った");
  await page.getByRole("button", { name: "イベントを足す" }).click();
  const event = page.getByTestId("event").first();
  await event.getByLabel("時刻", { exact: true }).fill("0:02");
  await event.getByLabel("時刻", { exact: true }).press("Enter");
  await event.getByLabel("イベント", { exact: true }).fill("テスト_全体攻撃");
  await event.getByLabel("コール", { exact: true }).fill("テスト_もうすぐ全体攻撃");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("status").first()).toHaveText("保存しました");
  // 初めて保存しても、打った内容は画面に残る (保存で画面を作り直していた誤りの再発を止める)
  await expect(event.getByLabel("イベント", { exact: true })).toHaveValue("テスト_全体攻撃");
  await page.getByRole("button", { name: "閉じる" }).click();
  await page.getByTestId("library").getByRole("button", { name: "開く" }).click();
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await expect
    .poll(() => spokenTexts(page), { timeout: 5000 })
    .toContain("テスト_もうすぐ全体攻撃");
});

test("shows a problem under the field and does not save", async ({ page }) => {
  await page.getByRole("button", { name: "新しく作る" }).click();
  await page.getByRole("button", { name: "イベントを足す" }).click();
  await page.getByTestId("event").first().getByLabel("コール", { exact: true }).fill("");
  await expect(page.getByTestId("event").first().getByRole("alert")).toContainText("短すぎます");
  await expect(page.getByRole("button", { name: "保存" })).toBeDisabled();
});

test("reads minutes and seconds and shows them back", async ({ page }) => {
  await page.getByRole("button", { name: "新しく作る" }).click();
  await page.getByRole("button", { name: "イベントを足す" }).click();
  const time = page.getByTestId("event").first().getByLabel("時刻", { exact: true });
  await time.fill("75.5");
  await time.press("Enter");
  await expect(time).toHaveValue("1:15.5");
});

test("refuses a time it cannot read", async ({ page }) => {
  await page.getByRole("button", { name: "新しく作る" }).click();
  await page.getByRole("button", { name: "イベントを足す" }).click();
  const time = page.getByTestId("event").first().getByLabel("時刻", { exact: true });
  await time.fill("1:75");
  await time.press("Enter");
  await expect(page.getByText("「1:15.5」か「75.5」の形で入れてください")).toBeVisible();
});

test("edits a saved script and keeps the change", async ({ page }) => {
  await page.getByRole("button", { name: "サンプルを開く" }).click();
  await page.getByRole("button", { name: "ライブラリへ" }).click();
  await page.getByRole("button", { name: "直す" }).click();
  await expect(page.getByText("コメントは消えます")).toBeVisible();
  await page
    .getByTestId("event")
    .nth(1)
    .getByLabel("イベント", { exact: true })
    .fill("テスト_名前を変えた");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("status").first()).toHaveText("保存しました");
  await page.reload();
  // ライブラリに戻ってから直したので、開き直すとライブラリから始まる
  await page.getByRole("button", { name: "直す" }).click();
  await expect(
    page.getByTestId("event").nth(1).getByLabel("イベント", { exact: true }),
  ).toHaveValue("テスト_名前を変えた");
});

test("asks before closing with unsaved changes", async ({ page }) => {
  await page.getByRole("button", { name: "新しく作る" }).click();
  await page.getByRole("button", { name: "イベントを足す" }).click();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("editor")).toBeVisible();
});

test("adds a manual phase", async ({ page }) => {
  await page.getByRole("button", { name: "新しく作る" }).click();
  await page.getByRole("button", { name: "フェーズを足す" }).click();
  await expect(page.getByTestId("phase")).toHaveCount(2);
  await expect(page.getByTestId("phase").nth(1).getByLabel("始まり方")).toHaveValue("manual");
});
