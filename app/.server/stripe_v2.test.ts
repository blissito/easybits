import { vi, describe, it, expect, beforeEach } from "vitest";
import * as stripeV2 from "./stripe_v2";
import * as dbModule from "./db";
import { AssetType } from "@prisma/client";

// Mocks
vi.mock("./db", () => ({
  db: {
    asset: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

const mockAsset = {
  id: "asset_123",
  userId: "user_456",
  stripePrice: "price_abc",
  slug: "test-asset",
  title: "Test Asset",
  actions: [],
  tags: "",
  note: null,
  description: null,
  eventDate: null,
  roomId: null,
  price: 100,
  currency: "mxn",
  stripeProduct: "prod_123",
  createdAt: new Date(),
  updatedAt: new Date(),
  extra: null,
  // propiedades opcionales/dummy
  image: null,
  published: true,
  downloads: 0,

  // Faltantes para tipo completo
  type: AssetType.EBOOK,
  gallery: [],
  publicLink: null,
  metadata: null,
  template: null,
};
const mockUser = {
  id: "user_456",
  stripeId: "acct_789",
  createdAt: new Date(),
  updatedAt: new Date(),
  confirmed: true,
  publicKey: null,
  displayName: "Test User",
  email: "test@example.com",
  verified_email: null,
  family_name: null,
  given_name: null,
  picture: null,
  phoneNumber: null,
  metadata: null,
  host: null,
  dnsConfig: null,
  domain: null,
  notifications: null,
  storeConfig: {
    hexColor: "#FF6B35",
    logoImage: "https://example.com/logo.png",
    colorMode: "light",
    typography: "",
    socialNetworks: true,
    showProducts: true,
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
    linkedin: "",
    website: "",
    coverImage: "",
    googleAnalyticsTrackingId: "",
    x: "",
    metadata: null,
  },
  // Faltantes para tipo completo
  roles: [],
  assetIds: [],
  customer: null,
  newsletters: [],
  stripeIds: [],
};

describe("stripe_v2", () => {
  let assetSpy: any;
  let userSpy: any;
  let fetchMock: any;

  beforeEach(() => {
    assetSpy = vi
      .spyOn(dbModule.db.asset, "findUnique")
      .mockResolvedValue(mockAsset);
    userSpy = vi
      .spyOn(dbModule.db.user, "findUnique")
      .mockResolvedValue(mockUser);
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          url: "https://checkout.stripe.com/session/xyz",
          payment_intent: "pi_123",
          id: "cs_test_456",
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({}) });
    Object.defineProperty(global, "fetch", {
      value: fetchMock,
      writable: true,
    });
  });

  it("createCheckoutURL retorna la url de checkout", async () => {
    const url = await stripeV2.createCheckoutURL("asset_123");
    expect(url).toBe("https://checkout.stripe.com/session/xyz");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Verifica que la segunda llamada fue para actualizar metadata
    expect(fetchMock.mock.calls[1][0]).toContain("/payment_intents/pi_123");
    expect(fetchMock.mock.calls[1][1].body).toContain(
      "metadata%5Bcheckout_session%5D=cs_test_456&metadata%5BassetId%5D=asset_123"
    );
    expect(fetchMock.mock.calls[1][1].body).toContain(
      "metadata%5Bcheckout_session%5D=cs_test_456&metadata%5BassetId%5D=asset_123"
    );
  });
});
