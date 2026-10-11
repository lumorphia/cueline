import { expect, test } from "./test.ts";

// apps/web/public/_headers のヘッダーが付いて配られること。中身の規則は tooling/headers.test.ts が見る
test("serves the page with the content security policy", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("serves hashed assets with a long cache", async ({ page, request }) => {
  await page.goto("/");
  const src = await page.locator("script[type=module]").first().getAttribute("src");
  const res = await request.get(src ?? "");
  expect(res.headers()["cache-control"]).toContain("immutable");
});

test("falls back to the page for an unknown path", async ({ page }) => {
  await page.goto("/play/unknown");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timeline Call (仮称)");
});
