import { test, expect, vi } from "vitest";
import { db } from "~/.server/db";
import { getStripe } from "~/.server/stripe";
import { action } from "./webhook";

// Mock de Stripe
vi.mock("~/.server/stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    webhooks: {
      constructEvent: vi.fn()
    },
    paymentIntents: {
      retrieve: vi.fn()
    }
  })
}));

// Mock de db
vi.mock("~/.server/db", () => ({
  db: {
    user: {
      update: vi.fn()
    }
  }
}));

// Guardar la referencia al mock de Stripe
const stripe = getStripe();

test.skip("should properly expand payment intent and assign asset to user", async () => {
  // Datos de prueba
  const mockAssetId = "asset_123";
  const mockMerchantStripeId = "acct_123";
  const mockEmail = "test@example.com";
  const mockPaymentIntentId = "pi_123";
  const mockConnectedAccountId = "acct_456";
  
  // Guardar la referencia al mock de Stripe
  const stripe = getStripe();

  // Configurar el mock del evento
  vi.mocked(stripe.webhooks.constructEvent).mockResolvedValue({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_123",
        payment_intent: mockPaymentIntentId,
        connected_account: mockConnectedAccountId,
        customer_details: { email: mockEmail },
        metadata: {
          assetId: mockAssetId,
          merchantStripeId: mockMerchantStripeId
        }
      }
    }
  });

  // Configurar el mock del payment intent
  vi.mocked(stripe.paymentIntents.retrieve).mockImplementation((paymentIntentId: string, options?: { stripeAccount?: string; expand?: string[] }) => {
    console.log('paymentIntents.retrieve called with:', { paymentIntentId, options });
    return Promise.resolve({
      id: paymentIntentId,
      metadata: {
        assetId: mockAssetId,
        merchantStripeId: mockMerchantStripeId
      }
    });
  });

  // Configurar el mock de la actualización del usuario
  vi.mocked(db.user.update).mockResolvedValue({
    id: 'user_123',
    email: mockEmail,
    assetIds: [mockAssetId],
    // Solo incluimos las propiedades mínimas necesarias para la prueba
  } as any);

  // Crear un mock literal del Request
  const mockRequest = {
    headers: {
      get: (header: string) => header === "stripe-signature" ? "mock-signature" : undefined
    },
    text: () => Promise.resolve(JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_123",
          payment_intent: mockPaymentIntentId,
          connected_account: mockConnectedAccountId,
          customer_details: { email: mockEmail },
          metadata: {
            assetId: mockAssetId,
            merchantStripeId: mockMerchantStripeId
          }
        }
      }
    })),
    method: "POST",
    url: "http://localhost/api/v1/stripe/webhook"
  } as Request;

  // Ejecutar la prueba
  await action({
    request: mockRequest,
    params: {},
    context: {}
  });

  // Verificaciones
  expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
    mockPaymentIntentId,
    {
      stripeAccount: mockConnectedAccountId,
      expand: ["customer"]
    }
  );

  expect(db.user.update).toHaveBeenCalledWith({
    where: { email: mockEmail },
    data: { assetIds: [mockAssetId] }
  });
});

// Prueba de caso de error

test("should handle payment intent retrieval failure gracefully", async () => {
  // Datos de prueba
  const mockAssetId = "asset_123";
  const mockConnectedAccountId = "acct_456";
  const mockEmail = "test@example.com";

  // Configurar el mock del evento
  vi.mocked(stripe.webhooks.constructEvent).mockResolvedValue({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_123",
        payment_intent: "pi_invalid",
        connected_account: mockConnectedAccountId,
        customer_details: { email: mockEmail },
        metadata: { assetId: mockAssetId }
      }
    }
  });

  // Simular un error en la expansión del payment intent
  vi.mocked(stripe.paymentIntents.retrieve).mockRejectedValue(
    new Error("Failed to retrieve payment intent")
  );

  // Crear un mock literal del Request
  const mockRequest = {
    headers: {
      get: (header: string) => header === "stripe-signature" ? "mock-signature" : undefined
    },
    text: () => Promise.resolve(JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_123",
          payment_intent: "pi_invalid",
          connected_account: mockConnectedAccountId,
          customer_details: { email: mockEmail },
          metadata: { assetId: mockAssetId }
        }
      }
    })),
    method: "POST",
    url: "http://localhost/api/v1/stripe/webhook"
  } as Request;

  // Ejecutar y verificar que no se actualice el usuario
  await action({
    request: mockRequest,
    params: {},
    context: {}
  });

  expect(db.user.update).not.toHaveBeenCalled();
});
