import { expect, test } from "./test.ts";

// 記録して作る (要件 FR-008)。「いま」を押した時刻でイベントが足されること。時計と丸めの規則は recorder.test.ts が見る
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新しく作る" }).click();
  await page.getByRole("button", { name: "記録して作る" }).click();
});

test("adds an event at the moment now is pressed", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "い ま" }).click();
  await page.getByRole("button", { name: "終えて表に足す" }).click();
  const time = page.getByTestId("event").first().getByLabel("時刻", { exact: true });
  await expect(time).toHaveValue(/^0:01(\.\d)?$/);
  await expect(
    page.getByTestId("event").first().getByLabel("イベント", { exact: true }),
  ).toHaveValue("イベント1");
});

test("records a later phase as a manual phase", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("button", { name: "い ま" }).click();
  await page.getByRole("button", { name: "次のフェーズ" }).click();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "終えて表に足す" }).click();
  await expect(page.getByTestId("phase")).toHaveCount(2);
  await expect(page.getByTestId("phase").nth(1).getByLabel("始まり方")).toHaveValue("manual");
  await expect(page.getByTestId("phase").nth(1).getByTestId("event")).toHaveCount(1);
});

test("takes back the last press", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("button", { name: "い ま" }).click();
  await page.getByRole("button", { name: "い ま" }).click();
  await page.getByRole("button", { name: "取り消し" }).click();
  await page.getByRole("button", { name: "終えて表に足す" }).click();
  await expect(page.getByTestId("event")).toHaveCount(1);
});

test("keeps the table as it was when cancelled", async ({ page }) => {
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("button", { name: "い ま" }).click();
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByTestId("editor")).toBeVisible();
  await expect(page.getByTestId("event")).toHaveCount(0);
});
