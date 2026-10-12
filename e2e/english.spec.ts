import { expect, test } from "./test.ts";

// 画面の言語 (要件 NFR-302)。英語に切り替えると、ライブラリ・エディタ・設定も英語になり、日本語が残らない
test("shows every screen in English after switching", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "Create new" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open the sample" })).toBeVisible();

  await page.getByRole("button", { name: "Create new" }).click();
  await expect(page.getByRole("button", { name: "Add event" })).toBeVisible();
  await expect(page.getByText("イベントを足す")).toHaveCount(0);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: "Test" })).toBeVisible();
  await expect(page.getByText("コールが重なったとき")).toHaveCount(0);
});

test("keeps the chosen language after reloading", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Create new" })).toBeVisible();
});
