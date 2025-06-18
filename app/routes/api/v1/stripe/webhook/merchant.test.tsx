import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { action } from "./merchant";
import { getStripe } from "~/.server/stripe";
import { db } from "~/.server/db";
import type { User } from "@prisma/client";

// Mock the database
vi.mock("~/.server/db", () => ({
  db: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock the Stripe instance
vi.mock("~/.server/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn(),
    },
  })),
}));

describe("Stripe Connect Webhook", () => {
  beforeEach(() => {
    // Mock STRIPE_SIGN environment variable
    process.env.STRIPE_SIGN = "test_webhook_signing_secret";
  });

  const mockUser = {
    id: "user_123",
    email: "test@example.com",
    roles: [],
    confirmed: true,
    publicKey: null,
    displayName: null,
    verified_email: true,
    family_name: null,
    given_name: null,
    picture: null,
    phoneNumber: null,
    metadata: null,
    stripeId: "acct_123",
    host: null,
    dnsConfig: null,
    domain: null,
    newsletters: [],
    notifications: null,
    assetIds: [],
    customer: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assets: [],
    files: [],
    Order: [],
    storeConfig: null,
    Review: [],
  };

  const mockEvent = {
    id: "evt_123",
    type: "account.updated",
    data: {
      object: {
        id: "acct_123",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.user.findFirst).mockResolvedValue(null);
    vi.mocked(db.user.update).mockResolvedValue({} as any);

    const stripeMock = {
      webhooks: {
        constructEvent: vi.fn().mockImplementation(() => mockEvent),
      },
    };

    vi.mocked(getStripe).mockReturnValue(stripeMock as any);
  });

  it("should return 405 for non-POST requests", async () => {
    const request = new Request("http://localhost", { method: "GET" });
    const response = await action({ request } as any);
    expect(response.status).toBe(405);
  });

  it("should return 400 when no signature is provided", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
    });
    const response = await action({ request } as any);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("No signature provided");
  });

  it("should return 404 for account.updated if user is not found", async () => {
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(
      () => mockEvent as any
    );
    vi.mocked(db.user.findFirst).mockResolvedValueOnce(null);
    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });
    const response = await action({ request } as any);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("User not found");
  });

  it("should return 200 and update roles for account.updated if user is found", async () => {
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(
      () => mockEvent as any
    );
    vi.mocked(db.user.findFirst).mockResolvedValueOnce({
      ...mockUser,
      stripeId: mockEvent.data.object.id,
    });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });
    const response = await action({ request } as any);
    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: { roles: { push: "merchant" } },
    });
  });

  it("should handle account.application.deauthorized event correctly", async () => {
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "account.application.deauthorized",
    }));

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("User not found");
  });

  it("should return 204 for payout.paid event", async () => {
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "payout.paid",
    }));

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(204);
  });

  it("should return 204 for transfer.created event", async () => {
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "transfer.created",
    }));

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(204);
  });

  it("should handle charge.succeeded event and assign assetId", async () => {
    const stripeMock = getStripe();
    const testAssetId = "asset_123";
    const testEmail = "test@example.com";

    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "charge.succeeded",
      data: {
        object: {
          id: "ch_123",
          amount: 1000,
          currency: "usd",
          status: "succeeded",
          payment_intent: {
            id: "pi_123",
            metadata: {
              assetId: testAssetId,
            },
          },
          billing_details: { email: testEmail },
        },
      },
    }));

    // Mock user found by email
    vi.mocked(db.user.findFirst).mockResolvedValue({
      ...mockUser,
      email: testEmail,
    });

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { email: testEmail },
      data: {
        assetIds: { push: testAssetId },
      },
    });
  });

  it("should handle payment_intent.succeeded event and assign assetId", async () => {
    const stripeMock = getStripe();
    const testAssetId = "asset_123";
    const testEmail = "test@example.com";

    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_123",
          amount: 1000,
          currency: "usd",
          status: "succeeded",
          metadata: {
            assetId: testAssetId,
          },
          receipt_email: testEmail,
        },
      },
    }));

    // Mock user found by email
    vi.mocked(db.user.findFirst).mockResolvedValue({
      ...mockUser,
      email: testEmail,
    });

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { email: testEmail },
      data: {
        assetIds: { push: testAssetId },
      },
    });
  });

  it("should handle charge.updated event with succeeded status", async () => {
    const stripeMock = getStripe();
    const testAssetId = "asset_123";
    const testEmail = "test@example.com";

    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "charge.updated",
      data: {
        object: {
          id: "ch_123",
          amount: 1000,
          currency: "usd",
          status: "succeeded",
          payment_intent: {
            id: "pi_123",
            metadata: {
              assetId: testAssetId,
            },
          },
          billing_details: { email: testEmail },
        },
      },
    }));

    // Mock user found by email
    vi.mocked(db.user.findFirst).mockResolvedValue({
      ...mockUser,
      email: testEmail,
    });

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { email: testEmail },
      data: {
        assetIds: { push: testAssetId },
      },
    });
  });

  it("should handle charge.updated event with failed status", async () => {
    const stripeMock = getStripe();
    const testAssetId = "asset_123";
    const testEmail = "test@example.com";

    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "charge.updated",
      data: {
        object: {
          id: "ch_123",
          amount: 1000,
          currency: "usd",
          status: "failed",
          payment_intent: {
            id: "pi_123",
            metadata: {
              assetId: testAssetId,
            },
          },
          billing_details: { email: testEmail },
        },
      },
    }));

    // Mock user found by email with existing asset
    vi.mocked(db.user.findFirst).mockResolvedValue({
      ...mockUser,
      email: testEmail,
      assetIds: [testAssetId],
    });

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { email: testEmail },
      data: {
        assetIds: [],
      },
    });
  });

  it("should expand metadata in webhook event", async () => {
    const testMetadata = {
    metadata:{  assetId: "asset_123"},
      billing_details: { email: "test@example.com" }
    };
    
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "account.updated",
      data: {
        object: {
          id: "acct_123",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          metadata: testMetadata,
        },
      },
    }));

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify({}),
    });

    // Mock user with metadata
    vi.mocked(db.user.findFirst).mockResolvedValue({
      ...mockUser,
      metadata: testMetadata,
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(200);

    // Verificar que la respuesta es 200 (ya que el handler retorna una respuesta vacía)
    expect(response.status).toBe(200);
  });

  it("should return 404 for unhandled event types", async () => {
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "some.unknown.event",
    }));

    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response = await action({ request } as any);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Event type not handled");
  });

  describe("charge.updated", () => {
    const stripeSignatureHeader = { "stripe-signature": "test_signature" };
    it("should assign asset when charge is succeeded", async () => {
      const mockEvent = {
        type: "charge.updated",
        data: {
          object: {
            status: "succeeded",
            metadata: {
              assetId: "test_asset_123",
            },
            billing_details: { email: "test@example.com" },
          },
        },
      };

      const mockUser: Partial<User> = {
        id: "user_123",
        email: "test@example.com",
        assetIds: [],
      };

      vi.mocked(db.user.findFirst).mockResolvedValueOnce(mockUser as User);
      vi.mocked(db.user.update).mockResolvedValueOnce({
        ...mockUser,
        assetIds: ["test_asset_123"],
      } as User);

      // Mock Stripe event for this test
      vi.mocked(getStripe().webhooks.constructEvent).mockImplementation(
        () => mockEvent as any
      );

      const response = await action({
        request: new Request("http://test.com", {
          method: "POST",
          headers: stripeSignatureHeader,
          body: JSON.stringify(mockEvent),
        }),
        params: {},
        context: {},
      });

      expect(response.status).toBe(200);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        data: {
          assetIds: { push: "test_asset_123" },
        },
      });
    });

    it("should remove asset when charge is failed", async () => {
      const mockEvent = {
        type: "charge.updated",
        data: {
          object: {
            status: "failed",
            metadata: {
              assetId: "test_asset_123",
            },
            billing_details: { email: "test@example.com" },
          },
        },
      };

      const mockUser: Partial<User> = {
        id: "user_123",
        email: "test@example.com",
        assetIds: ["test_asset_123", "other_asset"],
      };

      vi.mocked(db.user.findFirst).mockResolvedValueOnce(mockUser as User);
      vi.mocked(db.user.update).mockResolvedValueOnce({
        ...mockUser,
        assetIds: ["other_asset"],
      } as User);

      // Mock Stripe event for this test
      vi.mocked(getStripe().webhooks.constructEvent).mockImplementation(
        () => mockEvent as any
      );

      const response = await action({
        request: new Request("http://test.com", {
          method: "POST",
          headers: stripeSignatureHeader,
          body: JSON.stringify(mockEvent),
        }),
        params: {},
        context: {},
      });

      expect(response.status).toBe(200);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        data: {
          assetIds: ["other_asset"],
        },
      });
    });

    it("should remove asset when charge is refunded", async () => {
      const mockEvent = {
        type: "charge.updated",
        data: {
          object: {
            status: "refunded",
            metadata: {
              assetId: "test_asset_123",
            },
            billing_details: { email: "test@example.com" },
          },
        },
      };

      const mockUser: Partial<User> = {
        id: "user_123",
        email: "test@example.com",
        assetIds: ["test_asset_123", "other_asset"],
      };

      vi.mocked(db.user.findFirst).mockResolvedValueOnce(mockUser as User);
      vi.mocked(db.user.update).mockResolvedValueOnce({
        ...mockUser,
        assetIds: ["other_asset"],
      } as User);

      // Mock Stripe event for this test
      vi.mocked(getStripe().webhooks.constructEvent).mockImplementation(
        () => mockEvent as any
      );

      const response = await action({
        request: new Request("http://test.com", {
          method: "POST",
          headers: stripeSignatureHeader,
          body: JSON.stringify(mockEvent),
        }),
        params: {},
        context: {},
      });

      expect(response.status).toBe(200);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        data: {
          assetIds: ["other_asset"],
        },
      });
    });

    it("should return 400 if metadata is missing", async () => {
      const mockEvent = {
        type: "charge.updated",
        data: {
          object: {
            status: "succeeded",
            metadata: {},
          },
        },
      };

      // Mock Stripe event for this test
      vi.mocked(getStripe().webhooks.constructEvent).mockImplementation(
        () => mockEvent as any
      );

      const response = await action({
        request: new Request("http://test.com", {
          method: "POST",
          headers: stripeSignatureHeader,
          body: JSON.stringify(mockEvent),
        }),
        params: {},
        context: {},
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toBe("Missing required metadata or email");
    });

    it("should return 404 if user is not found", async () => {
      const mockEvent = {
        type: "charge.updated",
        data: {
          object: {
            status: "succeeded",
            metadata: {
              assetId: "test_asset_123",
            },
            billing_details: { email: "nonexistent@example.com" },
          },
        },
      };

      vi.mocked(db.user.findFirst).mockResolvedValueOnce(null);
      // Mock Stripe event for this test
      vi.mocked(getStripe().webhooks.constructEvent).mockImplementation(
        () => mockEvent as any
      );

      const response = await action({
        request: new Request("http://test.com", {
          method: "POST",
          headers: stripeSignatureHeader,
          body: JSON.stringify(mockEvent),
        }),
        params: {},
        context: {},
      });

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("User not found");
    });
  });

  it("should remove merchant role if charges_enabled or payouts_enabled is false on account.updated", async () => {
    const stripeMock = getStripe();
    const mockUser = {
      id: "user_123",
      email: "test@example.com",
      roles: ["merchant", "admin"],
    };
    const mockEvent = {
      type: "account.updated",
      data: {
        object: {
          charges_enabled: false,
          payouts_enabled: true,
        },
      },
    };
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(
      () => mockEvent as any
    );
    vi.mocked(db.user.findFirst).mockResolvedValueOnce(mockUser as any);
    vi.mocked(db.user.update).mockResolvedValueOnce({
      ...mockUser,
      roles: ["admin"],
    } as any);
    const request = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });
    const response = await action({ request } as any);
    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: { roles: ["admin"] },
    });
  });
});
