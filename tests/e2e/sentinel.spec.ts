import { expect, test } from "playwright/test";

test("confirms a protected execution, blocks replay, and revokes the root", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Build proof-bound plan" }).click();
  await expect(page.getByText("Plan is narrow, request-bound, and safe to execute.")).toBeVisible();

  await page.getByRole("button", { name: "Grant guarded permission" }).click();
  await expect(
    page.getByText("Demo ERC-7715 permission granted. Add NEXT_PUBLIC_SESSION_ACCOUNT for live mode."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Execute protected flow" }).click();
  await expect(page.getByText("Execution confirmed and proof manifest anchored.")).toBeVisible();

  await page.getByRole("button", { name: "Replay exact request" }).click();
  await expect(
    page.getByText("Replay blocked before payment: requestDigest was already consumed."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Revoke root delegation" }).click();
  await expect(
    page.getByText("Root delegation revoked. All child agents are disabled immediately."),
  ).toBeVisible();
});
