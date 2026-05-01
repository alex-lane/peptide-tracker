// End-to-end happy path for M11. Walks every primary surface in order:
//   consent → bootstrap household → add product → add batch → reconstitute
//   → build protocol → log dose from Today → confirm inventory drop →
//   export JSON. The test runs against the dev server (Vite + Dexie in
//   browser); no network mocking needed.
//
// Selector copy (`getByLabel`, `getByPlaceholder`, button names) was
// derived from the M5 / M7 form components but has NOT been runtime-
// verified in a Playwright run. First execution may need selector tweaks.
// Run via `pnpm test:e2e` against the dev server; `playwright.config.ts`
// already starts `pnpm dev` automatically.
//
// Each `await page.evaluate(() => indexedDB.deleteDatabase(...))` between
// steps would let us reset cleanly, but we run the spec in isolation per
// Playwright's fresh-context model, so the IndexedDB starts empty.

import { test, expect } from '@playwright/test';

test.describe('Happy path', () => {
  test('first-run consent → bootstrap → product → batch → reconstitute → protocol → log → export', async ({
    page,
  }) => {
    await page.goto('/');

    // Consent gate.
    await expect(
      page.getByRole('heading', { name: /Welcome to Peptide Tracker/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /I understand/i }).click();

    // Bootstrap household.
    await expect(page.getByRole('heading', { name: /^Welcome$/i })).toBeVisible();
    await page.getByPlaceholder(/our household/i).fill('Lab');
    await page.getByPlaceholder(/your first name/i).fill('Tester');
    await page.getByRole('button', { name: /Create household/i }).click();

    // Today page renders with the user's name.
    await expect(page.getByRole('heading', { name: /Tester's day/i })).toBeVisible();

    // Add a product via Inventory.
    await page.getByRole('link', { name: /Inventory/i }).click();
    await page.getByRole('button', { name: /^Add$/i }).click();
    await page.getByLabel(/Name/i).fill('Sample peptide A');
    // Form should default to injectable_lyophilized for vial-shaped flows.
    await page.getByRole('button', { name: /Save/i }).click();

    // Open the new product, add a batch.
    await page.getByText('Sample peptide A').click();
    await page.getByRole('button', { name: /Add batch/i }).click();
    // Quantity 5 mg; the form default unit may be mg already.
    await page.getByLabel(/Initial quantity/i).fill('5');
    await page.getByRole('button', { name: /Save/i }).click();

    // Reconstitute that batch with 2 mL BAC water.
    await page.getByRole('button', { name: /Reconstitute/i }).click();
    await page.getByLabel(/Diluent/i).fill('2');
    await page.getByRole('button', { name: /Reconstitute/i }).last().click();

    // Build a protocol from /protocols.
    await page.getByRole('link', { name: /Protocols/i }).click();
    await page.getByRole('button', { name: /New protocol/i }).click();
    await page.getByLabel(/^Name$/i).fill('Healing stack');
    await page.getByRole('button', { name: /Next/i }).click();
    await page.getByRole('button', { name: /\+ Add an item/i }).click();
    await page.getByLabel(/Dose/i).first().fill('250');
    await page.getByRole('button', { name: /Next/i }).click();
    await page.getByRole('button', { name: /Activate/i }).click();

    // Today should now show a pending dose and the Log button.
    await page.getByRole('link', { name: /Today/i }).click();
    await expect(page.getByText(/Pending doses/i)).toBeVisible();

    // Log the first pending dose. The "Log" button on the Today row opens
    // the LogDoseModal in `from_schedule` mode pre-filled with the
    // protocol-item dose (250 mcg).
    await page.getByRole('button', { name: /^Log$/i }).first().click();
    await page.getByRole('button', { name: /Save log/i }).click();

    // Inventory should now show a reduced remaining quantity. 250 mcg out
    // of 5 mg / 2 mL (2,500 mcg/mL) = 0.1 mL withdrawn → batch goes from
    // 2 mL → 1.9 mL. We assert the visible "remaining" text changed away
    // from the initial "2 / 2 mL" state rather than parsing the number, to
    // stay resilient to formatting drift.
    await page.getByRole('link', { name: /Inventory/i }).click();
    await expect(page.getByText(/Sample peptide A/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('2 / 2 mL');

    // Settings → JSON export downloads a file. We just verify the download
    // event fires; signature verification lives in the unit tests.
    await page.getByRole('link', { name: /More/i }).click();
    await page.getByRole('link', { name: /Settings/i }).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export to JSON/i }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/peptide-tracker-.*\.export\.v1\.json$/);
  });
});
