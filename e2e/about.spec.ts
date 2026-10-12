import { expect, test } from "./test.ts";

// このアプリについて (公開ゲート RM-31、ADR-0005)。ゲームに触れないこと、データを送らないこと、非公式であることが読める
test("explains that the app never touches the game and is unofficial", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "このアプリについて" }).click();
  const about = page.getByTestId("about");
  await expect(about).toContainText("ゲームには一切触れません");
  await expect(about).toContainText("外には送りません");
  await expect(about).toContainText("承認・後援を受けたものではありません");
  await expect(about).toContainText("FINAL FANTASY XIV © SQUARE ENIX");
  await expect(
    about.getByRole("link", { name: "弱点を見つけたら (非公開の報告)" }),
  ).toHaveAttribute("href", "https://github.com/lumorphia/cueline/security/advisories/new");
});

test("goes back to the library from the about screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "このアプリについて" }).click();
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page.getByRole("heading", { name: "ライブラリ" })).toBeVisible();
});
