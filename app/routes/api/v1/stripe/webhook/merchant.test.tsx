import { describe, it, expect, vi } from "vitest";
import { action } from "./merchant";
import { db } from "~/.server/db";
import type { User } from "@prisma/client";
import {
  assignAssetToUserByEmail,
  removeAssetFromUserByEmail,
  constructStripeEvent,
  getMetadataFromEvent,
  getEmailFromEvent,
} from "~/.server/webhookUtils";

// Helper function to create consistent test events
const createTestEvent = (type: string, data: any = {}) => ({
  type,
  data: {
    object: {
      ...data,
      metadata: { assetId: "test_asset_123" },
      email: "test@example.com",
    },
  },
});

// Mocks
vi.mock("~/.server/db", () => ({
  db: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/.server/webhookUtils", () => ({
  assignAssetToUserByEmail: vi.fn().mockImplementation(({ assetId, email }) => {
    if (!assetId || !email) {
      return new Response("Missing required metadata or email", {
        status: 400,
      });
    }
    return new Response(null, { status: 200 });
  }),
  removeAssetFromUserByEmail: vi
    .fn()
    .mockImplementation(({ assetId, email }) => {
      if (!assetId || !email) {
        return new Response("Missing required metadata or email", {
          status: 400,
        });
      }
      return new Response(null, { status: 200 });
    }),
  constructStripeEvent: vi
    .fn()
    .mockImplementation(async (request: Request, assetId: string) => {
      const body = await request.json();
      if (!body || typeof body !== "object") {
        return new Response("Invalid event body", { status: 400 });
      }

      // Si el body ya es un evento completo, lo devolvemos directamente
      if (body.type) {
        return body;
      }

      return new Response("Invalid Stripe event", { status: 400 });
    }),
  getMetadataFromEvent: vi
    .fn()
    .mockReturnValue({ assetId: "test_asset_123", email: "test@example.com" }),
  getEmailFromEvent: vi.fn().mockReturnValue("test@example.com"),
}));

// Helper function to create a mock Stripe event
const createMockEvent = (type: string, data: any) => ({
  type,
  data: {
    object: {
      ...data,
      metadata: {},
      email: "test@example.com",
    },
  },
});

describe("Stripe Webhook Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SIGN = "test_webhook_signing_secret";
  });

  describe("account.updated event", () => {
    it("should add merchant role when account is enabled", async () => {
      const mockUser: User = {
        id: "user_123",
        email: "test@example.com",
        roles: [],
        confirmed: true,
        publicKey: null,
        displayName: null,
        verified_email: null,
        family_name: null,
        given_name: null,
        picture: null,
        phoneNumber: null,
        metadata: null,
        stripeId: null,
        host: null,
        dnsConfig: null,
        domain: null,
        newsletters: [],
        notifications: null,
        assetIds: [],
        customer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        storeConfig: null,
      };

      const event = createTestEvent("account.updated", {
        charges_enabled: true,
        payouts_enabled: true,
      });

      vi.mocked(db.user.findFirst).mockResolvedValue(mockUser);

      const request = new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
        body: JSON.stringify(event),
      });

      const response = await action({
        request,
        params: { assetId: "test_asset_123" },
      });

      expect(response.status).toBe(200);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          roles: { push: "merchant" },
        },
      });
    });

    it("should remove merchant role when account is disabled", async () => {
      const mockUser: User = {
        id: "user_123",
        email: "test@example.com",
        roles: ["merchant"],
        confirmed: true,
        publicKey: null,
        displayName: null,
        verified_email: null,
        family_name: null,
        given_name: null,
        host: null,
        metadata: null,
        picture: null,
        customer: null,
        stripeId: null,
        storeConfig: null,
        assetIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        newsletters: [],
        phoneNumber: null,
        dnsConfig: null,
        domain: null,
        notifications: null,
      };

      const event = createTestEvent("account.updated", {
        charges_enabled: false,
        payouts_enabled: false,
      });

      vi.mocked(db.user.findFirst).mockResolvedValue(mockUser);

      const request = new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
        body: JSON.stringify(event),
      });

      const response = await action({
        request,
        params: { assetId: "test_asset_123" },
      });

      expect(response.status).toBe(200);
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { roles: [] },
      });
    });
  });

  describe("charge events", () => {
    it("should assign asset on charge succeeded", async () => {
      const event = createTestEvent("charge.succeeded", {
        metadata: { assetId: "test_asset_123" },
      });

      const request = new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
        body: JSON.stringify(event),
      });

      const response = await action({
        request,
        params: { assetId: "test_asset_123" },
      });

      expect(response.status).toBe(200);
      expect(assignAssetToUserByEmail).toHaveBeenCalledWith({
        assetId: "test_asset_123",
        email: "test@example.com",
      });
    });

    it("should remove asset on charge failed", async () => {
      const event = createTestEvent("charge.updated", {
        status: "failed",
      });

      const request = new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
        body: JSON.stringify(event),
      });

      const response = await action({
        request,
        params: { assetId: "test_asset_123" },
      });

      expect(response.status).toBe(200);
      expect(removeAssetFromUserByEmail).toHaveBeenCalledWith({
        assetId: "test_asset_123",
        email: "test@example.com",
      });
    });
  });

  describe("error handling", () => {
    it("should return 404 when user is not found", async () => {
      const event = createTestEvent("account.updated", {
        charges_enabled: true,
        payouts_enabled: true,
      });

      vi.mocked(db.user.findFirst).mockResolvedValue(null);

      const request = new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
        body: JSON.stringify(event),
      });

      const response = await action({
        request,
        params: { assetId: "test_asset_123" },
      });

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("User not found");
    });

    it("should return 400 when required data is missing", async () => {
      // Simulamos que falta el email en el evento
      const event = {
        type: "charge.succeeded",
        data: {
          object: {
            metadata: { assetId: "test_asset_123" },
            // email: undefined
          },
        },
      };

      const request = new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "test_signature" },
        body: JSON.stringify(event),
      });

      // Mock getEmailFromEvent para devolver undefined
      vi.mocked(getEmailFromEvent).mockReturnValue(undefined);

      const response = await action({
        request,
        params: { assetId: "test_asset_123" },
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toBe("Missing required metadata or email");
    });
  });
});

// Note: No tests for account.application.deauthorized due to todo comment indicating it needs fixing
