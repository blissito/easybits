/**
 * Single source of truth for ALWAYS-ON VM hosting ("máquinas permanentes").
 *
 * Two independent axes:
 *  - SIZE (RAM hard-allocated) → sets the price floor. 10 named tiers.
 *  - CPU SLA → `shared` (best-effort, default) vs `reserved` (guaranteed
 *    cgroup floor, premium). Reserved exists ONLY from `focus` up.
 *
 * Prices are flat MXN/month, NVMe, no traffic billing. The platform plan
 * (Byte/Mega/Tera) is the ACCESS GATE; permanent machines are a flat add-on
 * billed as a Stripe subscription item on top.
 *
 * This catalog is ALSO the unified size vocabulary: it replaces the old
 * s/m/l/xl enum for both ephemeral sandboxes and permanent machines (see
 * SIZE_ALIASES below for the legacy mapping kept during migration).
 */

import type { PlanKey } from "./plans";

export type CpuMode = "shared" | "reserved";

export interface HostingTier {
  /** Catalog key — e.g. "focus". Also the unified size key. */
  key: string;
  vcpus: number;
  memoryMb: number;
  /** Base NVMe in MB (before disk add-ons). */
  diskMb: number;
  /** Flat MXN/month, shared CPU. */
  priceShared: number;
  /** Flat MXN/month, reserved CPU. null = shared-only tier. */
  priceReserved: number | null;
  /** Minimum platform plan required to provision this tier. */
  minPlan: PlanKey;
}

/** Disk add-on: stackable 100GB NVMe units. */
export const DISK_ADDON_GB = 100;
export const DISK_ADDON_PRICE = 99; // MXN/month per 100GB unit
export const DISK_ADDON_MB = DISK_ADDON_GB * 1024;

/**
 * Tier order (small → large). Drives gating comparisons and UI ordering.
 * Reserved availability is encoded per-tier via `priceReserved !== null`.
 */
export const TIER_ORDER = [
  "nano", "micro", "mini", "lite", "base",
  "plus", "pro", "focus", "performance", "performance-4x",
] as const;

export type TierKey = (typeof TIER_ORDER)[number];

export const HOSTING_CATALOG: Record<TierKey, HostingTier> = {
  nano:            { key: "nano",            vcpus: 1,  memoryMb: 512,   diskMb: 2048,   priceShared: 49,   priceReserved: null,  minPlan: "Mega" },
  micro:           { key: "micro",           vcpus: 1,  memoryMb: 1024,  diskMb: 4096,   priceShared: 99,   priceReserved: null,  minPlan: "Mega" },
  mini:            { key: "mini",            vcpus: 2,  memoryMb: 1024,  diskMb: 8192,   priceShared: 149,  priceReserved: null,  minPlan: "Mega" },
  lite:            { key: "lite",            vcpus: 1,  memoryMb: 2048,  diskMb: 6144,   priceShared: 129,  priceReserved: null,  minPlan: "Mega" },
  base:            { key: "base",            vcpus: 2,  memoryMb: 2048,  diskMb: 16384,  priceShared: 249,  priceReserved: null,  minPlan: "Mega" },
  plus:            { key: "plus",            vcpus: 2,  memoryMb: 4096,  diskMb: 24576,  priceShared: 299,  priceReserved: null,  minPlan: "Mega" },
  pro:             { key: "pro",             vcpus: 4,  memoryMb: 4096,  diskMb: 32768,  priceShared: 449,  priceReserved: null,  minPlan: "Mega" },
  focus:           { key: "focus",           vcpus: 4,  memoryMb: 8192,  diskMb: 65536,  priceShared: 690,  priceReserved: 1725,  minPlan: "Tera" },
  performance:     { key: "performance",     vcpus: 8,  memoryMb: 16384, diskMb: 131072, priceShared: 1290, priceReserved: 3225,  minPlan: "Tera" },
  "performance-4x":{ key: "performance-4x",  vcpus: 16, memoryMb: 32768, diskMb: 262144, priceShared: 4980, priceReserved: 12450, minPlan: "Tera" },
};

/**
 * Pool capacity box — the ONLY buyable unit in the "Sandboxes" tab.
 *
 * The pool is flat: capacity grows in identical boxes, you just pick how many.
 * One box = one pool VM (2 vCPU / 2 GB) running 4 agents (2 pairs). Reserved
 * capacity is therefore always a multiple of these, so `machines = agents / 4`.
 */
export const POOL_BOX = {
  key: "box",
  agents: 4,
  vcpus: 2,
  memoryMb: 2048,
  diskMb: 16384,
  priceMxn: 299, // MXN/month per box
  minPlan: "Mega" as PlanKey,
} as const;

/** Legacy s/m/l/xl → catalog tier. Kept while migrating sandbox callers. */
export const SIZE_ALIASES: Record<"s" | "m" | "l" | "xl", TierKey> = {
  s: "micro",
  m: "base",
  l: "pro",
  xl: "performance",
};

export function isTierKey(k: string): k is TierKey {
  return k in HOSTING_CATALOG;
}

/** Resolve a tier key OR a legacy s/m/l/xl alias to a HostingTier. */
export function resolveTier(key: string): HostingTier | null {
  if (isTierKey(key)) return HOSTING_CATALOG[key];
  if (key in SIZE_ALIASES) return HOSTING_CATALOG[SIZE_ALIASES[key as "s" | "m" | "l" | "xl"]];
  return null;
}

/** True if this tier supports reserved CPU. */
export function reservedAvailable(tier: HostingTier): boolean {
  return tier.priceReserved !== null;
}

/** Flat tier price for the chosen CPU mode (MXN/month, excludes disk add-ons). */
export function tierPrice(tier: HostingTier, mode: CpuMode): number {
  if (mode === "reserved") {
    if (tier.priceReserved === null) {
      throw new Error(`Tier "${tier.key}" no ofrece CPU reservada (solo shared).`);
    }
    return tier.priceReserved;
  }
  return tier.priceShared;
}

/** Total MXN/month for a machine: tier price + disk add-ons. */
export function machineMonthly(tier: HostingTier, mode: CpuMode, diskAddonsGB = 0): number {
  const units = Math.max(0, Math.round(diskAddonsGB / DISK_ADDON_GB));
  return tierPrice(tier, mode) + units * DISK_ADDON_PRICE;
}

/** Resolve the host create payload resources for a tier + disk add-ons. */
export function resourcesFor(
  tier: HostingTier,
  diskAddonsGB = 0
): { vcpus: number; memoryMb: number; diskMb: number } {
  const units = Math.max(0, Math.round(diskAddonsGB / DISK_ADDON_GB));
  return {
    vcpus: tier.vcpus,
    memoryMb: tier.memoryMb,
    diskMb: tier.diskMb + units * DISK_ADDON_MB,
  };
}
