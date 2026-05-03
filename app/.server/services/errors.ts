/**
 * Errors thrown by the service catalog orchestrator.
 *
 * Routes that catch these should map:
 *   QuotaExceededError    → HTTP 402 (Payment Required)
 *   ServiceProviderError  → HTTP 502 (Bad Gateway)
 *   ServiceConfigError    → HTTP 503 (Service Unavailable, missing API key)
 */

export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED";
  constructor(
    public readonly serviceId: string,
    public readonly requiredCost: number,
    public readonly available: number,
  ) {
    super(
      `Quota exceeded for ${serviceId}: needed ${requiredCost} créditos, only ${available} available.`,
    );
    this.name = "QuotaExceededError";
  }
}

export class ServiceProviderError extends Error {
  readonly code = "SERVICE_PROVIDER_ERROR";
  constructor(
    public readonly serviceId: string,
    public readonly providerStatus: number | null,
    public readonly providerMessage: string,
  ) {
    super(
      `Provider for ${serviceId} returned ${providerStatus ?? "?"}: ${providerMessage}`,
    );
    this.name = "ServiceProviderError";
  }
}

export class ServiceConfigError extends Error {
  readonly code = "SERVICE_CONFIG_ERROR";
  constructor(
    public readonly serviceId: string,
    public readonly missing: string,
  ) {
    super(`Service ${serviceId} not configured: ${missing} is missing.`);
    this.name = "ServiceConfigError";
  }
}
