import { test, expect } from "@playwright/test";

// Ajusta las URLs, selectores y datos según tu app real

test("flujo E2E: usuario compra asset y verifica compra (Stripe Connect + Checkout)", async ({
  page,
}) => {
  // 1. Login
  await page.goto("http://localhost:3000/login");
  await page.fill("input[name=email]", "test@user.com");
  await page.fill("input[name=password]", "password");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/dash/);

  // 2. Ir a /dash/ventas y conectar Stripe
  await page.goto("http://localhost:3000/dash/ventas");
  await page.click("text=Conectar con stripe");
  // Completar onboarding de Stripe Connect (manejar popup/iframe)
  // ... aquí Playwright puede interactuar con el onboarding de Stripe test
  // await page.frameLocator('iframe').locator('input[name=...').fill('...');
  // await page.frameLocator('iframe').locator('button[type=submit]').click();
  // Esperar a que la cuenta esté activa (puedes esperar a que cambie el UI)

  // 3. Crear asset descargable
  await page.goto("http://localhost:3000/assets");
  await page.click("text=Nuevo asset");
  await page.fill("input[name=title]", "Mi asset E2E");
  await page.click("text=Descargable");
  await page.click("text=Guardar");

  // 4. Editar asset y añadir precio
  await page.click("text=Editar");
  await page.fill("input[name=price]", "100");
  await page.click("text=Guardar");

  // 5. Ir al enlace público y comprar
  await page.goto("http://localhost:3000/assets/mi-asset-e2e/public");
  await page.click("text=Comprar");
  // Completar Stripe Checkout (rellenar tarjeta test 4242 4242 4242 4242)
  // await page.frameLocator('iframe').locator('input[name=cardnumber]').fill('4242424242424242');
  // ... completar el resto de los campos y submit

  // 6. Confirmar compra en /dash/compras
  await page.goto("http://localhost:3000/dash/compras");
  await expect(page.locator("text=Mi asset E2E")).toBeVisible();
});
