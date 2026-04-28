import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('login page se renderiza', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/.+/)
    // El form de login debería tener al menos un input
    const inputs = await page.locator('input').count()
    expect(inputs).toBeGreaterThan(0)
  })

  test('redirección a /login cuando no hay sesión', async ({ page }) => {
    await page.goto('/compras/pedidos')
    // Sin sesión debería redirigir a login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })

  test('app responde con 200', async ({ request }) => {
    const r = await request.get('/')
    expect(r.status()).toBe(200)
  })
})
