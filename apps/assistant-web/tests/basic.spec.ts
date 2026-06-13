import { test, expect } from '@playwright/test';

test('has title and login screen', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // Using the default header from globalConfig
  await expect(page.getByText('企业 AI 助手')).toBeVisible();
});
