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

test('platform audit filters events and opens event details', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)

  await page.goto('/app/audit')
  await expect(page.getByRole('heading', { name: 'Platform Audit' })).toBeVisible()

  await page.getByRole('button', { name: 'Access', exact: true }).click()
  await expect(page.getByText('LOGIN', { exact: true })).toBeVisible()
  await expect(page.getByText('UPDATE', { exact: true })).toBeVisible()
  await expect(page.getByText('EXPORT', { exact: true })).not.toBeVisible()

  await page.getByRole('button', { name: 'Exports', exact: true }).click()
  await expect(page.getByText('EXPORT', { exact: true })).toBeVisible()
  await expect(page.getByText('LOGIN', { exact: true })).not.toBeVisible()

  await page.getByRole('button', { name: 'All Events', exact: true }).click()
  await page.getByRole('button', { name: 'View', exact: true }).first().click()

  await expect(page.getByText('Audit event', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /UPDATE · security/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Previous value' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'New value' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible()
})

test('customer credit can be partially paid and fully settled', async ({ page }) => {
  await page.goto('/auth/login')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)

  await page.goto('/app/crm/customers/customer-1')
  await expect(page.getByRole('heading', { name: 'Kabwe Trading Co.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go back to customers' })).toBeVisible()

  await page.getByRole('button', { name: /Record payment/ }).first().click()
  await page.getByRole('spinbutton').fill('2450')
  await page.getByRole('combobox').selectOption('mobile_money')
  await page.getByPlaceholder('Optional reference').fill('MM-TEST-001')
  await page.getByRole('button', { name: /Confirm payment/ }).click()
  await expect(page.getByText(/K\s*10,000\.00/).first()).toBeVisible()
  await expect(page.getByText('MM-TEST-001', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Record payment/ }).first().click()
  await page.getByRole('button', { name: /Pay full balance/ }).click()
  await page.getByRole('button', { name: /Confirm payment/ }).click()
  await expect(page.getByText('Account settled', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Record payment/ })).not.toBeVisible()
})
