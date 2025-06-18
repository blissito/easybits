import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./merchant";

// Mock global para Stripe y DB
vi.mock("~/.server/stripe_v2", () => ({
  assignAssetToUser: vi.fn(),
}));
vi.mock("~/.server/db", () => ({
  db: {
    asset: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    order: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

function mockRequest({
  body = "{}",
  signature = "test-signature",
  method = "POST",
} = {}) {
  return {
    method,
    headers: {
      get: (key: string) =>
        key === "stripe-signature" ? signature : undefined,
    },
    text: async () => body,
  } as unknown as Request;
}

const params = { assetId: "a1" };

describe("merchant webhook action", () => {
  let utils: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.STRIPE_SIGN = "test_signing_secret";
    utils = await import("~/.server/webhookUtils");
    vi.spyOn(utils, "constructStripeEvent").mockResolvedValue({
      type: "payment_intent.succeeded",
      data: { object: { customer_email: "test@example.com" } },
    });
    vi.spyOn(utils, "getEmailFromEvent").mockReturnValue("test@example.com");
  });

  it("returns 400 if signature is missing", async () => {
    utils.constructStripeEvent.mockResolvedValueOnce(
      new Response("No signature provided", { status: 400 })
    );
    const req = mockRequest({ signature: undefined });
    const res = await action({ request: req, params });
    expect(res.status).toBe(400);
  });

  it("returns 405 if method is not POST", async () => {
    utils.constructStripeEvent.mockResolvedValueOnce(
      new Response("Method not allowed", { status: 405 })
    );
    const req = mockRequest({ method: "GET" });
    const res = await action({ request: req, params });
    expect(res.status).toBe(405);
  });

  it("returns 400 if constructStripeEvent throws", async () => {
    // Espía y fuerza un error en constructStripeEvent solo para este test
    utils.constructStripeEvent.mockResolvedValueOnce(
      new Response("Webhook error", { status: 400 })
    );
    const req = mockRequest();
    const res = await action({ request: req, params });
    expect(res.status).toBe(400);
  });

  it("returns 404 if no pending order for email", async () => {
    const { db } = await import("~/.server/db");
    const mockedDb = vi.mocked(db, true);
    mockedDb.order.findFirst.mockResolvedValue(null);
    const req = mockRequest();
    const res = await action({ request: req, params });
    expect(res.status).toBe(404);
  });
});
