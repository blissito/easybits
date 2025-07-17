# E2E Purchase Flow Test Spec (Minimalista)

## Requirements

- Verificar de extremo a extremo que un usuario puede comprar un asset y completar el pago usando Stripe (modo test).
- El test debe correr con una herramienta open-source, sin costo (Playwright recomendado, alternativo: Cypress).
- El test debe ser lo más simple posible: solo un flujo feliz (happy path).
- Debe poder ejecutarse localmente con un solo comando.
- No requiere mocks ni setup complejo: usa Stripe test mode y una cuenta de prueba.
- El test debe dejar evidencia clara (pantallazo o log) de que el pago fue exitoso.

## Design

- Usar Playwright (https://playwright.dev/) por ser open-source, fácil de instalar y soportar Chromium/Firefox/Webkit.
- El test navega a la página de compra, selecciona un asset, inicia el proceso de pago, completa los datos de Stripe test card y verifica que la compra fue exitosa (mensaje de éxito o redirección).
- El test puede correr en headless o modo visible para debugging.
- El test debe ser autocontenible: setup y teardown mínimos.

## Task List

- [ ] Instalar Playwright en el proyecto (`npx playwright install`)
- [ ] Crear un archivo de test E2E (por ejemplo, `test/e2e-purchase.spec.ts`)
- [ ] Escribir el test: navegar, seleccionar asset, iniciar compra, completar pago con tarjeta de prueba Stripe, verificar éxito.
- [ ] Agregar el comando a package.json para correr el test (`npx playwright test`)
- [ ] Documentar en el README cómo correr el test E2E.

---

**Notas:**

- Puedes adaptar el flujo según tu UI real (URL, selectors, etc.).
- Si usas Cypress, la estructura es similar, pero Playwright es más moderno y sin límites de uso.
- El test puede ser extendido en el futuro para cubrir errores o flujos alternativos.
