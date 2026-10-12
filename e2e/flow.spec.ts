import { fakeSpeech, spokenTexts } from "./speech.ts";
import { expect, test } from "./test.ts";

// 要件 11.3 の流れを一続きで: 読み込み → プルカウント → カウント中のコール → 戦闘中のコール → イベント同期 → 取り消し
const fight = `version: 1
metadata:
  id: test-flow
  name: テスト_一続き
  language: ja-JP
countdown:
  default: 2
phases:
  - id: p1
    name: テスト_フェーズ1
    start: { type: absolute, at: 0 }
    events:
      - id: prepull
        at: -1
        name: テスト_プル前
        notifications: [{ type: speech, text: テスト_プル前のコール }]
      - id: first
        at: 1
        name: テスト_最初
        notifications: [{ type: speech, text: テスト_最初のコール }]
      - id: later
        at: 60
        name: テスト_あと
        notifications: [{ type: speech, text: テスト_あとのコール }]
`;

test("runs a fight from importing to undoing a sync", async ({ page }) => {
  await fakeSpeech(page);
  await page.goto("/");
  await page.getByRole("textbox", { name: "YAML か JSON のスクリプトを貼り付ける" }).fill(fight);
  await page.getByRole("button", { name: "貼り付けて読み込む" }).click();
  await page.getByTestId("library").getByRole("button", { name: "開く" }).click();

  await page.getByRole("button", { name: "プル 2 秒" }).click();
  await expect(page.getByTestId("state")).toHaveText("カウント中");
  await expect.poll(() => spokenTexts(page), { timeout: 3000 }).toEqual(["テスト_プル前のコール"]);
  await expect(page.getByTestId("state")).toHaveText("戦闘中", { timeout: 3000 });
  await expect
    .poll(() => spokenTexts(page), { timeout: 3000 })
    .toEqual(["テスト_プル前のコール", "テスト_最初のコール"]);

  // イベント同期: 「いま: テスト_あと」で 60 秒に合わせる
  await page.getByRole("button", { name: "いま: テスト_あと" }).click();
  await expect(page.getByTestId("clock")).toHaveText(/^01:00\.\d$/);
  await page.getByRole("button", { name: "取り消し" }).click();
  await expect(page.getByTestId("clock")).toHaveText(/^00:0\d\.\d$/);
});
