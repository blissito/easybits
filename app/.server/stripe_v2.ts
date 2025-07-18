/*
============================
Error Handling Flow & Usage Examples
============================

## Backend (Node.js)
- Todas las funciones que interactúan con Stripe usan internamente Effect (ts) para manejar efectos y errores.
- Las funciones públicas (como updateOrCreateProductAndPrice) devuelven un resultado estructurado:
  - `{ ok: true, data }` en caso de éxito
  - `{ ok: false, error }` en caso de error
- El endpoint solo revisa la propiedad `ok` y responde al frontend con un mensaje claro si hay error.

### Ejemplo de uso en el backend:
```ts
const stripeResult = await updateOrCreateProductAndPrice(asset, request);
if (!stripeResult.ok) {
  return new Response(
    `Error al actualizar el precio en Stripe: ${stripeResult.error}`,
    { status: 500 }
  );
}
// ... continuar flujo normal
```

## Frontend
- Si el backend responde con status 500 y un mensaje de error, el frontend puede mostrar ese mensaje al usuario.
- Ejemplo de manejo en React:
```ts
const response = await fetch(...);
if (!response.ok) {
  const errorText = await response.text();
  showToast(errorText); // o mostrar en UI
}
```

## Ventajas
- El código de backend no necesita try/catch para Stripe, solo revisa el resultado.
- Los logs de Stripe quedan centralizados y estructurados.
- El frontend recibe mensajes claros y controlados, sin stacktraces ni detalles internos.
- Fácil de extender a otros servicios de terceros.
*/

/**
 * E2E Purchase Flow Test Spec (Minimalista)

[ ] Instalar Playwright en el proyecto (npx playwright install)
[ ] Crear un archivo de test E2E (por ejemplo, test/e2e-purchase.spec.ts)
[ ] Escribir el test: navegar, seleccionar asset, iniciar compra, completar pago con tarjeta de prueba Stripe, verificar éxito.
[ ] Agregar el comando a package.json para correr el test (npx playwright test)
[ ] Documentar en el README cómo correr el test E2E.
 * 
 */

// Logger centralizado para Stripe
export const stripeLogger = {
  info: (...args: any[]) => console.log("[STRIPE][INFO]", ...args),
  warn: (...args: any[]) => console.warn("[STRIPE][WARN]", ...args),
  error: (...args: any[]) => console.error("[STRIPE][ERROR]", ...args),
};

import { Effect } from "effect";
import type { Asset, User } from "@prisma/client";
import { getUserOrNull } from "./getters";
import { db } from "./db";
import { updateAsset } from "./assets";

type CreateAccountResponse = {
  id: string;
  object: "v2.core.account";
  applied_configurations: ["customer"];
  configuration: string | null;
  contact_email: string;
  created: string;
  dashboard: string | null;
  identity: string | null;
  defaults: string | null;
  display_name: string;
  metadata: {};
  requirements: string | null;
  livemode: boolean;
};
type Capabilities = {
  card_payments: "inactive" | "active";
  transfers: "inactive" | "active";
};

export type Payment = {
  id: string;
};
//   capabilities: { card_payments: 'inactive', transfers: 'inactive' },
const isDev = process.env.NODE_ENV === "development";
const location = isDev ? "http://localhost:3000" : "https://www.easybits.cloud";

const webhookUrl = `${location}/api/v1/stripe/webhook/merchant`;
const stripeURL = "https://api.stripe.com/v2/core/accounts";
const accountSessionsURL = "https://api.stripe.com/v1/account_sessions";
const accountsURL = "https://api.stripe.com/v2/core/accounts";
const paymentsURL = "https://api.stripe.com/v1/payment_intents";
const productsURL = "https://api.stripe.com/v1/products";
const pricesURL = "https://api.stripe.com/v1/prices";
const apiKey = isDev
  ? `Bearer ${process.env.STRIPE_DEV_SECRET_KEY}`
  : `Bearer ${process.env.STRIPE_SECRET_KEY}`; // prod
const checkoutSessionsURL = "https://api.stripe.com/v1/checkout/sessions";
const version = "2025-04-30.preview";
const brandingURL = "https://api.stripe.com/v1/account/branding_settings";

// @TODO: every function is making a query: avoid it. Just pass the same user from top level
export async function configureMerchantWebhook(userId: string) {
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { stripeIds: true },
    });
    const isProd = process.env.NODE_ENV === "production";
    const user = { ...u, stripeId: u.stripeIds[isProd ? 0 : 1] };
    if (!user?.stripeId) {
      throw new Error("User doesn't have a Stripe account");
    }

    // Usar la API REST en lugar del SDK
    const stripeWebhookApiUrl = "https://api.stripe.com/v1/webhook_endpoints";
    const params = new URLSearchParams({
      url: webhookUrl,
      enabled_events: [
        "account.updated",
        "charge.succeeded",
        "charge.failed",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "payment_intent.canceled",
        "payment_intent.processing",
      ].join(","),
      stripe_account: user.stripeId,
      connect: "true",
    });

    const response = await fetch(stripeWebhookApiUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Stripe-Version": "2025-04-30.preview",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const webhook = await response.json();
    return webhook;
  } catch (error) {
    console.error("Error configuring merchant webhook:", error);
    throw error;
  }
}

export const createCheckoutURL = async (
  asset: Asset,
  user: User,
  brandOptions?: {
    primaryColor?: string;
    logo?: string;
    businessName?: string;
  }
) => {
  if (!asset.stripePrice) return null; // no price found

  // Usar configuración de marca de la base de datos si no se proporciona brandOptions
  const finalBrandOptions = {
    primaryColor:
      brandOptions?.primaryColor || user.storeConfig?.hexColor || undefined,
    logo: brandOptions?.logo || user.storeConfig?.logoImage || undefined,
    businessName: brandOptions?.businessName || user.displayName || undefined,
  };

  // Crear la sesión de checkout
  const url = new URL(checkoutSessionsURL);
  url.searchParams.set("mode", `payment`);
  url.searchParams.set("line_items[0][quantity]", "1");
  url.searchParams.set("line_items[0][price]", asset.stripePrice);
  url.searchParams.set("success_url", `${location}/api/v1/stripe/success`);

  // Personalización de marca
  url.searchParams.set("ui_mode", "hosted");
  url.searchParams.set("custom_text[submit][message]", "Procesar pago");
  url.searchParams.set("locale", "es");

  // Personalización de marca usando la configuración de la base de datos
  if (finalBrandOptions.businessName) {
    url.searchParams.set(
      "custom_text[submit][message]",
      `Pagar a ${finalBrandOptions.businessName}`
    );
  }

  // Si hay colores configurados, aplicar configuración de marca automáticamente
  if (finalBrandOptions.primaryColor || finalBrandOptions.logo) {
    // Configurar colores de marca en la cuenta de Stripe antes del checkout
    await configureBrandColors(user.stripeId!, {
      primaryColor: finalBrandOptions.primaryColor,
      logo: finalBrandOptions.logo,
      primaryButtonColor: finalBrandOptions.primaryColor, // usar el mismo color para el botón
    });
  }

  const sessionRes = await fetch(url.toString(), {
    method: "post",
    headers: {
      Authorization: apiKey,
      "Stripe-Account": user.stripeId!,
      "Stripe-Version": "2025-04-30.preview",
      "content-type": "application/x-www-form-urlencoded",
    },
  });
  const sessionData = await sessionRes.json();

  // Actualizar metadata del PaymentIntent con checkout_session y assetId
  if (sessionData.payment_intent && sessionData.id) {
    const piUrl = `https://api.stripe.com/v1/payment_intents/${sessionData.payment_intent}`;
    const params = new URLSearchParams();
    params.set("metadata[checkout_session]", sessionData.id);
    params.set("metadata[assetId]", asset.id);
    await fetch(piUrl, {
      method: "post",
      headers: {
        Authorization: apiKey,
        "Stripe-Account": user.stripeId!,
        "Stripe-Version": "2025-04-30.preview",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  }

  return sessionData.url;
};

export const updateOrCreateProductAndPrice = async (
  asset: Asset,
  request: Request
): Promise<{ ok: true; data: any } | { ok: false; error: string }> => {
  const user = await getUserOrNull(request);
  if (!user) return { ok: false, error: "Usuario no encontrado" };

  const isProd = process.env.NODE_ENV === "production";

  const accountId = user.stripeIds[isProd ? 0 : 1];
  if (!accountId) return { ok: false, error: "Cuenta de Stripe no encontrada" };

  if (asset.stripeProduct && asset.stripePrice) {
    const priceResult = await Effect.runPromiseExit(
      createNewPriceForProductEffect({
        productId: asset.stripeProduct,
        accountId,
        currency: asset.currency as "mxn",
        unit_amount: Number(asset.price) * 100,
      })
    );
    if (priceResult._tag === "Failure") {
      stripeLogger.error(
        "No se pudo crear el nuevo precio en Stripe",
        priceResult.cause
      );
      return { ok: false, error: "No se pudo crear el nuevo precio en Stripe" };
    }
    const price = priceResult.value;
    if (!price || !price.id) {
      stripeLogger.error("Respuesta inválida al crear precio en Stripe", price);
      return {
        ok: false,
        error: "Respuesta inválida al crear precio en Stripe",
      };
    }
    await updateProduct({
      productId: asset.stripeProduct,
      priceId: price.id,
      accountId,
      images: [],
    });
    await updateAsset(asset.id, { stripePrice: price.id });
    await configureMerchantWebhook(user.id);
    return { ok: true, data: price };
  } else {
    const productResult = await Effect.runPromiseExit(
      createProductAndPriceEffect(
        asset.slug,
        Number(asset.price),
        asset.currency,
        accountId
      )
    );
    if (productResult._tag === "Failure") {
      stripeLogger.error(
        "No se pudo crear el producto/precio en Stripe",
        productResult.cause
      );
      return {
        ok: false,
        error: "No se pudo crear el producto/precio en Stripe",
      };
    }
    const product = productResult.value;
    if (!product || !product.id || !product.default_price) {
      stripeLogger.error(
        "Respuesta inválida al crear producto/precio en Stripe",
        product
      );
      return {
        ok: false,
        error: "Respuesta inválida al crear producto/precio en Stripe",
      };
    }
    await db.asset.update({
      where: {
        id: asset.id,
      },
      data: { stripeProduct: product.id, stripePrice: product.default_price },
    });
    await configureMerchantWebhook(user.id);
    return { ok: true, data: product };
  }
};

export const updateProduct = async ({
  productId,
  accountId,
  priceId,
  images = [],
  description,
}: {
  accountId: string;
  productId: string;
  images: string[];
  description?: string;
  priceId?: string;
}) => {
  const url = new URL(`${productsURL}/${productId}`);
  priceId && url.searchParams.set("default_price", priceId);
  description && url.searchParams.set("description", description);
  // array
  images.length > 0 &&
    images.forEach((link) => {
      url.searchParams.append("images[]", link);
    });

  return await fetch(url.toString(), {
    method: "post",
    headers: {
      Authorization: apiKey,
      "Stripe-Account": accountId,
      "Stripe-Version": "2025-04-30.preview",
      "content-type": "application/x-www-form-urlencoded",
    },
  })
    .then((r) => r.json())
    .catch((e) => console.error("::STRIPE::ERROR::", e));
};

// Refactor: createNewPriceForProduct usando Effect
export const createNewPriceForProductEffect = ({
  productId,
  currency,
  unit_amount,
  accountId,
}: {
  productId: string;
  currency: "mxn";
  unit_amount: number;
  accountId: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const url = new URL(pricesURL);
      url.searchParams.set(`currency`, currency);
      url.searchParams.set(`unit_amount`, String(unit_amount));
      url.searchParams.set(`product`, productId);
      const headers = {
        Authorization: apiKey,
        "Stripe-Account": accountId,
        "Stripe-Version": "2025-04-30.preview",
        "content-type": "application/x-www-form-urlencoded",
      };
      const response = await fetch(url.toString(), { headers, method: "post" });
      if (!response.ok) {
        const error = await response.text();
        stripeLogger.error("Error al crear precio en Stripe", error);
        throw new Error(error);
      }
      const price = await response.json();
      stripeLogger.info("Precio creado en Stripe", price);
      return price;
    },
    catch: (e) => {
      stripeLogger.error("Stripe fetch error (createNewPriceForProduct)", e);
      return e;
    },
  });

// Refactor: createProductAndPrice usando Effect
export const createProductAndPriceEffect = (
  name: string,
  price: number,
  currency: string,
  accountId: string
) =>
  Effect.tryPromise({
    try: async () => {
      const url = new URL(productsURL);
      url.searchParams.set("name", name);
      url.searchParams.set("default_price_data[currency]", currency);
      url.searchParams.set(
        "default_price_data[unit_amount]",
        String(price * 100)
      );
      const headers = {
        Authorization: apiKey,
        "Stripe-Account": accountId,
        "Stripe-Version": "2025-04-30.preview",
        "content-type": "application/x-www-form-urlencoded",
      };
      const response = await fetch(url.toString(), { headers, method: "post" });
      if (!response.ok) {
        const error = await response.text();
        stripeLogger.error("Error al crear producto/precio en Stripe", error);
        throw new Error(error);
      }
      const data = await response.json();
      stripeLogger.info("Producto y precio creados en Stripe", data);
      return data;
    },
    catch: (e) => {
      stripeLogger.error("Stripe fetch error (createProductAndPrice)", e);
      return e;
    },
  });

export const getAccountPayments = async (accountId: string, isDev: boolean) => {
  const url = new URL(paymentsURL);
  const Authorization = `Bearer ${
    isDev ? process.env.STRIPE_DEV_SECRET_KEY : apiKey
  }`;
  const headers = {
    Authorization,
    "content-type": "application/x-www-form-urlencoded",
    "Stripe-Account": accountId,
    "Stripe-Version": "2025-04-30.preview",
  };
  const response = await fetch(url.toString(), { headers });
  const json = await response.json();
  return json.data;
};

export const createClientSecret = async ({
  accountId,
  onboarding,
  payments,
}: {
  accountId: string;
  onboarding: boolean;
  payments: boolean;
}) => {
  const url = new URL(accountSessionsURL);
  url.searchParams.set("account", accountId);
  onboarding &&
    url.searchParams.set("components[account_onboarding][enabled]", "true");
  payments && url.searchParams.set("components[payments][enabled]", "true");
  const init = getInit(undefined, {
    "content-type": "application/x-www-form-urlencoded",
  });
  const response = await fetch(url.toString(), init);
  const data = await response.json();
  return data.client_secret;
};

const getAuthHeader = (useDev: boolean = false) => {
  const key =
    useDev || isDev
      ? process.env.STRIPE_DEV_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY;
  return `Bearer ${key}`;
};

export const getAccountCapabilities = async (
  accountId?: string,
  useDev: boolean = false
): Promise<Capabilities | null> => {
  if (!accountId) return null;

  const url = new URL(accountsURL + `/${accountId}`);
  url.searchParams.set("include", "configuration.merchant");
  const Authorization = getAuthHeader(useDev);
  const response = await fetch(url.toString(), {
    headers: {
      "Stripe-Version": version,
      Authorization,
    },
  });

  if (!response.ok) {
    console.error(
      "Error fetching capabilities:",
      response.status,
      response.statusText
    );
    return null;
  }

  const data = await response.json();
  return data.configuration?.merchant?.capabilities;
};

// Nueva función para obtener información completa del estado de la cuenta
export const getAccountStatus = async (
  accountId?: string,
  isDev: boolean = false
): Promise<{
  capabilities: Capabilities | null;
  requirements: any;
  isOnboardingComplete: boolean;
} | null> => {
  if (!accountId) return null;

  const url = new URL(accountsURL + `/${accountId}`);
  url.searchParams.set("include", "configuration.merchant,requirements");
  const Authorization = `Bearer ${
    isDev ? process.env.STRIPE_DEV_SECRET_KEY : apiKey
  }`;

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Stripe-Version": version,
        Authorization,
      },
    });

    if (!response.ok) {
      console.error("Error fetching account status:", response.status);
      return null;
    }

    const data = await response.json();
    const capabilities = data.configuration?.merchant?.capabilities;
    const requirements = data.requirements;

    // Determinar si el onboarding está completo
    const isOnboardingComplete =
      capabilities?.card_payments?.status === "active";

    return {
      capabilities,
      requirements,
      isOnboardingComplete,
    };
  } catch (error) {
    console.error("Error fetching account status:", error);
    return null;
  }
};

export const findOrCreateStripeAccountV2 = async (email: string) => {
  let { stripeId } =
    (await db.user.findUnique({
      where: {
        email,
      },
      select: {
        stripeId: true,
      },
    })) || {};

  if (!stripeId) {
    const { id: accountId } = await createAccountV2({ email } as User);
    await db.user.upsert({
      where: {
        email,
      },
      create: { stripeId: accountId, email, confirmed: true },
      update: { stripeId: accountId },
    });
    stripeId = accountId;
  }
  return getStripeAccount(stripeId);
};

export const getStripeAccount = async (accountId: string) => {
  const url = new URL(accountsURL + `/${accountId}`);
  // url.searchParams.set("include", "capabilities");
  const response = await fetch(url.toString(), getInit());
  const data = await response.json();
  return data;
};

export const createPaymentsSession = async (accountId: string) => {
  const url = new URL(accountSessionsURL);
  const init = getInit(undefined, {
    "content-type": "application/x-www-form-urlencoded",
  });
  const response = await fetch(url.toString(), init);
  const data = await response.json();
  return data.client_secret;
};

export const createOnboarding = async (accountId: string): Promise<string> => {
  const url = new URL(accountSessionsURL);
  url.searchParams.set("account", accountId);
  url.searchParams.set("components[account_onboarding][enabled]", "true");
  const init = getInit(undefined, {
    "content-type": "application/x-www-form-urlencoded",
  });
  const response = await fetch(url.toString(), init);
  const data = await response.json();
  return data.client_secret;
};

export const createAccountV2 = async (
  user: User
): Promise<CreateAccountResponse> => {
  const body = JSON.stringify({
    display_name: user.displayName,
    contact_email: user.email,
    identity: {
      country: "mx", // @todo from onboarding?
      entity_type: "individual", // same
    },
    include: [
      "configuration.customer",
      "configuration.merchant",
      "identity",
      "requirements",
    ],
    dashboard: "full",
    defaults: {
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
      locales: ["es"],
    },
    configuration: {
      // customer: {},
      //   recipient: {
      //     capabilities: {
      //       stripe_balance: {
      //         stripe_transfers: {
      //           requested: true,
      //         },
      //       },
      //     },
      //   },
      merchant: {
        capabilities: {
          card_payments: {
            requested: true,
          },
        },
      },
    },
  });
  const init: RequestInit = {
    method: "post",
    headers: {
      "Stripe-Version": version,
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body,
  };
  const response = await fetch(stripeURL, init);
  const data = await response.json();
  return data;
};

// Configurar colores de marca para la cuenta
export const configureBrandColors = async (
  accountId: string,
  brandOptions: {
    primaryColor?: string;
    logo?: string;
    icon?: string;
    primaryButtonColor?: string;
  }
) => {
  const url = new URL(brandingURL);

  if (brandOptions.primaryColor) {
    url.searchParams.set("primary_color", brandOptions.primaryColor);
  }

  if (brandOptions.primaryButtonColor) {
    url.searchParams.set(
      "primary_button_color",
      brandOptions.primaryButtonColor
    );
  }

  if (brandOptions.logo) {
    url.searchParams.set("logo", brandOptions.logo);
  }

  if (brandOptions.icon) {
    url.searchParams.set("icon", brandOptions.icon);
  }

  const response = await fetch(url.toString(), {
    method: "post",
    headers: {
      Authorization: apiKey,
      "Stripe-Account": accountId,
      "Stripe-Version": "2025-04-30.preview",
      "content-type": "application/x-www-form-urlencoded",
    },
  });

  return await response.json();
};

const getInit = (body: any = {}, headers: any = {}) =>
  ({
    method: "post",
    headers: {
      "Stripe-Version": version,
      Authorization: apiKey,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  } as RequestInit);
