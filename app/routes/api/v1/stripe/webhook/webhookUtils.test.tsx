import { describe, it, expect, vi, beforeEach } from "vitest";


describe("webhookUtils getLastPendingOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if no pending orders", async () => {
    const utils = await import("~/.server/webhookUtils");
    const spy = vi.spyOn(utils, "getLastPendingOrder").mockResolvedValueOnce(null);
    const order = await utils.getLastPendingOrder();
    expect(order).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it("returns pending order if exists", async () => {
    const utils = await import("~/.server/webhookUtils");
    const mockOrder = {
      id: "o1",
      assetId: "a1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      customer_email: null,
      customerId: null,
      userId: null,
      stripePriceId: null,
      stripePriceProductId: null,
      total: "0",
      note: null
    };
    const spy = vi.spyOn(utils, "getLastPendingOrder").mockResolvedValueOnce(mockOrder);
    
    const order = await utils.getLastPendingOrder();
    expect(order).toEqual(mockOrder);
    expect(spy).toHaveBeenCalled();
  });

  it("finds order by email", async () => {
    const utils = await import("~/.server/webhookUtils");
    const spy = vi.spyOn(utils, "getLastPendingOrder").mockResolvedValueOnce({
      id: "o1",
      assetId: "a1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      customer_email: null,
      customerId: null,
      userId: null,
      stripePriceId: null,
      stripePriceProductId: null,
      total: "0",
      note: null
    });
    
    await utils.getLastPendingOrder();
    expect(spy).toHaveBeenCalled();
  });
});
