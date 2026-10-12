import { expect, test } from "./test.ts";

test("shows the app title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CueLine");
});
