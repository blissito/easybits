// =============================
// E2E Purchase Flow Test Tasks
// =============================
// - [ ] Instalar Playwright en el proyecto (`npx playwright install`)
// - [ ] Configurar datos de usuario de prueba y Stripe en modo test
// - [ ] Adaptar URLs y selectores a la UI real (inputs, botones, rutas)
// - [ ] Ajustar el flujo de onboarding de Stripe Connect (manejo de iframe/popup)
// - [ ] Ajustar el flujo de Stripe Checkout (manejo de iframe)
// - [ ] Ejecutar el test (`npx playwright test test/e2e-purchase.spec.ts`)
// - [ ] Verificar que la compra aparece en /dash/compras tras el webhook
// - [ ] (Opcional) Agregar screenshots o logs para evidencia
// =============================

import { test, expect } from "@playwright/test";

// Ajusta las URLs, selectores y datos según tu app real

test("flujo E2E: usuario compra asset y verifica compra (Stripe Connect + Checkout)", async ({
  page,
  context,
}) => {
  // Inyectar cookie de sesión para simular usuario autenticado
  await context.addCookies([
    {
      name: "__session",
      value:
        "eyJlbWFpbCI6ImZpeHRlcmdlZWtAZ21haWwuY29tIn0%3D.zGuo9GT17jn6JC9Y0rttXxtjegGfRJUD3zNUM5t%2Ba4g",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // Ahora navega directamente a la ruta protegida
  await page.goto("http://localhost:3000/dash/ventas");

  // ... resto del flujo E2E

  // Espera a que el iframe de Stripe Connect esté presente y visible
  const stripeIframeSelector =
    'iframe[data-testid="stripe-connect-ui-layer-stripe-connect-account-onboarding"]';
  await expect(page.locator(stripeIframeSelector)).toBeVisible({
    timeout: 15000,
  });

  // Intenta buscar y hacer click en el botón 'Add information' dentro del iframe
  const stripeFrame = page.frameLocator(stripeIframeSelector);
  const addInfoButton = stripeFrame.getByText(/^Add information$/);
  await addInfoButton.waitFor({ timeout: 15000 });
  await addInfoButton.click();

  // Toma un screenshot como evidencia
  await page.screenshot({ path: "stripe-onboarding-visible.png" });

  // Aquí puedes finalizar el test o continuar con el flujo después de Stripe si aplica
  // Por ahora, el test termina aquí para evitar flakiness con Stripe

  // Espera a que se abra la nueva página de Stripe Connect y automatiza el login
  const [newPage] = await Promise.all([
    context.waitForEvent("page"), // Captura la nueva pestaña/ventana
    addInfoButton.click(),
  ]);

  await newPage.pause();

  // Pausa interactiva para intervención manual (human-in-the-loop)
  //   await newPage.pause(); // Llena el formulario manualmente y luego haz Resume en el inspector

  // Espera a que el campo de contraseña esté visible en la nueva página
  // (puedes dejar este paso o comentarlo si ya lo llenaste manualmente)
  // await newPage.locator('input[name="password"]').waitFor({ timeout: 15000 });

  // Llena la contraseña (ajusta el valor según tu cuenta de prueba)
  //   await newPage
  //     .locator('input[name="password"]')
  //     .fill("TU_CONTRASEÑA_DE_PRUEBA"); // <-- Cambia esto

  //   // Haz click en el botón "Enviar"
  //   await newPage.getByRole("button", { name: /enviar/i }).click();

  // Espera a que la página se cierre (Stripe la cierra al terminar el onboarding)
  await newPage.waitForEvent("close", { timeout: 30000 });

  // Crear asset descargable
  await page.goto("http://localhost:3000/dash/assets");
  await page.click("text=Nuevo asset");
  await page.fill("input[name=title]", "Mi asset E2E");
  await page.click("text=Descargable");
  await page.click("text=Guardar");

  // Editar asset y añadir precio
  await page.click("text=Editar");
  await page.fill("input[name=price]", "100");
  await page.click("text=Guardar");

  // Ir al enlace público y comprar
  await page.goto("http://localhost:3000/assets/mi-asset-e2e/public");

  await page.click("text=Comprar");
  // Completar Stripe Checkout (rellenar tarjeta test 4242 4242 4242 4242)
  // await page.frameLocator('iframe').locator('input[name=cardnumber]').fill('4242424242424242');
  // ... completar el resto de los campos y submit

  // Confirmar compra en /dash/compras
  await page.goto("http://localhost:3000/dash/compras");
  await expect(page.locator("text=Mi asset E2E")).toBeVisible();
});
