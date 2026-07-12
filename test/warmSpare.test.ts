import { describe, it, expect } from "vitest";
import { freeSlotsOf, selectHotSpares } from "~/.server/core/fleetAgentOperations";

// Warm spare pool — decision logic (the only part that can be wrong; the wiring
// around it is covered by typecheck + build, and the end-to-end by the prod smoke).
// freeSlotsOf drives WHEN topUpWarmSpares pre-boots; selectHotSpares drives WHICH
// VMs the reaper keeps hot (running = instant claim) vs lets it park/reap.

describe("freeSlotsOf — ready worker slots across a fleet's VMs", () => {
  it("no VMs → 0 free slots (a new conversation must cold-boot)", () => {
    expect(freeSlotsOf([], 2)).toBe(0);
  });
  it("an empty VM offers maxWorkersPerVm slots", () => {
    expect(freeSlotsOf([0], 2)).toBe(2);
  });
  it("a full VM offers 0", () => {
    expect(freeSlotsOf([2], 2)).toBe(0);
  });
  it("sums per-VM headroom, clamped at 0 (over-packed VM never subtracts)", () => {
    expect(freeSlotsOf([1, 0, 2], 2)).toBe(3); // 1 + 2 + 0
    expect(freeSlotsOf([3], 2)).toBe(0); // clamp, not -1
  });
});

describe("warm spare deficit — the spawn condition (freeSlots < warmSpares)", () => {
  const shouldSpawn = (counts: number[], max: number, warmSpares: number) =>
    freeSlotsOf(counts, max) < warmSpares;

  it("spawns when a full fleet has no headroom", () => {
    expect(shouldSpawn([2, 2], 2, 1)).toBe(true); // 0 free < 1
  });
  it("does NOT spawn when headroom already meets the target", () => {
    expect(shouldSpawn([1], 2, 1)).toBe(false); // 1 free >= 1
  });
  it("warmSpares=0 (opt-out) never spawns", () => {
    expect(shouldSpawn([2, 2], 2, 0)).toBe(false);
  });
});

describe("selectHotSpares — which VMs stay RUNNING for instant claim", () => {
  const vm = (id: string, routes: number) => ({ id, routes });

  it("keeps up to warmSpares zero-route VMs hot", () => {
    const vms = [vm("a", 0), vm("b", 1), vm("c", 0)];
    expect(selectHotSpares(vms, 1)).toEqual(["a"]);
    expect(selectHotSpares(vms, 2)).toEqual(["a", "c"]);
  });
  it("never keeps an in-use VM hot (routes > 0 is a real conversation)", () => {
    expect(selectHotSpares([vm("a", 1), vm("b", 2)], 2)).toEqual([]);
  });
  it("bounded by warmSpares — extra idle VMs are free to park/reap", () => {
    expect(selectHotSpares([vm("a", 0), vm("b", 0), vm("c", 0)], 2)).toEqual(["a", "b"]);
  });
  it("warmSpares=0 keeps nothing hot (default: no warm pool)", () => {
    expect(selectHotSpares([vm("a", 0)], 0)).toEqual([]);
  });
});
