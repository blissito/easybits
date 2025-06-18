import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { action } from "./merchant";
import { getStripe } from "~/.server/stripe";
import { db } from "~/.server/db";

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

  it("should handle account.updated event correctly", async () => {
    // Test case 1: User not found
    const request1 = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response1 = await action({ request: request1 } as any);
    expect(response1.status).toBe(404);
    expect(await response1.text()).toBe("User not found");

    // Test case 2: User found and updated
    vi.mocked(db.user.findFirst).mockResolvedValue(mockUser);
    const request2 = new Request("http://localhost", {
      method: "POST",
      headers: {
        "stripe-signature": "test_signature",
      },
      body: JSON.stringify(mockEvent),
    });

    const response2 = await action({ request: request2 } as any);
    expect(response2.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: { roles: ["merchant"] },
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

  it("should return 204 for charge.succeeded event", async () => {
    const stripeMock = getStripe();
    vi.mocked(stripeMock.webhooks.constructEvent).mockImplementation(() => ({
      ...mockEvent,
      type: "charge.succeeded",
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
});
