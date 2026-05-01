import { test, expect } from '@playwright/test';

test.describe('M0 smoke', () => {
  test('first run shows consent gate', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome to Peptide Tracker/i })).toBeVisible();
  });

  test('after consent the layout renders with bottom nav and LOG button', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /I understand/i }).click();
    // No household yet → Today page resolves to the M5 bootstrap form
    // ("Welcome"). Pre-M5 this heading was "Today" — kept here as a
    // smoke check that the layout chrome shows up regardless.
    await expect(page.getByRole('heading', { name: /^Welcome$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Log a dose/i })).toBeVisible();
    await expect(page.getByRole('contentinfo', { name: /Disclaimer/i })).toBeVisible();
  });
});
