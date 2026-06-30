import { describe, it, expect } from "vitest";
import { ADMIT_BACKOFFS_MS, ADMIT_GIVEUP_MS, admitRetryDelay } from "~/.server/core/fleetAgentOperations";

// Backoff policy for the saturation queue: on FleetAgentAtCapacity the surface holds
// the burst and retries on this schedule until the give-up window, instead of
// dropping the message. Shared so a future WABA surface reuses the same cadence.
describe("fleetAgent admission backoff policy", () => {
  it("retries on an increasing 5→10→20→30s schedule", () => {
    expect(ADMIT_BACKOFFS_MS).toEqual([5_000, 10_000, 20_000, 30_000]);
    expect(admitRetryDelay(0)).toBe(5_000);
    expect(admitRetryDelay(1)).toBe(10_000);
    expect(admitRetryDelay(2)).toBe(20_000);
    expect(admitRetryDelay(3)).toBe(30_000);
  });

  it("caps at the last (30s) step for any further attempt", () => {
    expect(admitRetryDelay(4)).toBe(30_000);
    expect(admitRetryDelay(42)).toBe(30_000);
  });

  it("holds ~4 min before giving up — comfortably past idleSuspendMin+cadencia", () => {
    expect(ADMIT_GIVEUP_MS).toBe(240_000);
    expect(ADMIT_GIVEUP_MS).toBeGreaterThan(60_000);
  });

  it("the give-up window fits several retries (sum of backoffs < window)", () => {
    // A held message gets multiple chances before we apologize and drop.
    const sumFirstFour = ADMIT_BACKOFFS_MS.reduce((a, b) => a + b, 0);
    expect(sumFirstFour).toBeLessThan(ADMIT_GIVEUP_MS);
  });
});
