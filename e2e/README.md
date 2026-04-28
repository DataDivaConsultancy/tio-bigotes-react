# Tests E2E — Playwright

Setup mínimo para validar que la app no se rompe al desplegar.

## Cómo correr

```bash
# Local — levanta el dev server automáticamente
npm install
npx playwright install chromium
npx playwright test

# Contra producción
E2E_BASE_URL=https://app.sebbrofoods.com npx playwright test

# Sólo un test
npx playwright test e2e/smoke.spec.ts -g 'login page'

# Con UI interactiva
npx playwright test --ui
```

## Tests existentes

- `smoke.spec.ts`: validación básica de carga de páginas y redirección por auth.

## Cómo añadir tests con autenticación

1. Crear un usuario de pruebas en Supabase (`empleados_v2` con email `e2e@sebbrofoods.com`).
2. Crear `e2e/auth.setup.ts` con un test que loguea y guarda el storageState.
3. Reutilizar ese estado en otros specs con `test.use({ storageState: 'e2e/.auth/user.json' })`.
4. Añadir `e2e/.auth` a `.gitignore`.

## CI (futuro)

Cuando se conecte a CI (GitHub Actions, etc.):
- Servicio Supabase de pruebas separado.
- Variables `E2E_BASE_URL` + credenciales como secrets.
- `npx playwright test --reporter=html,github`.
