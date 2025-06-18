import { vi } from "vitest";

// Mock environment variables
vi.mock("process", () => ({
  env: {
    STRIPE_CONNECT_SIGNING_SECRET: "test_signing_secret",
    STRIPE_SECRET_KEY: "test_secret_key",
    STRIPE_PUBLISHABLE_KEY: "test_publishable_key",
  },
}));

// Mock global process
global.process = {
  ...global.process,
  env: {
    STRIPE_CONNECT_SIGNING_SECRET: "test_signing_secret",
    STRIPE_SECRET_KEY: "test_secret_key",
    STRIPE_PUBLISHABLE_KEY: "test_publishable_key",
  },
} as any;
