import { expect, test } from '@playwright/test'

test('organization workspace exposes branch context and VAT reporting', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(page.getByRole('button', { name: /Current branch: All branches/ })).toBeVisible()

  await page.getByRole('button', { name: /Current branch: All branches/ }).click()
  await page.getByRole('option', { name: /Lusaka Main Branch/ }).click()
  await expect(page.getByRole('button', { name: /Current branch: Lusaka Main Branch/ })).toBeVisible()

  await page.goto('/app/finance/vat-summary')
  await expect(page.getByRole('heading', { name: 'VAT Summary' })).toBeVisible()
  await expect(page.getByText('VAT collected', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Net sales revenue', { exact: true })).toBeVisible()
})
